import React, { useEffect } from 'react';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import { useStore, type AppState } from '../store';

const SERVER_STATE_KEY = 'charity-sync-server-state';
const SERVER_REVISIONS_KEY = 'charity-sync-revisions';
const LAST_PULL_KEY = 'charity-sync-last-pull';

// Arrays of objects that have an 'id' property
const COLLECTIONS: string[] = [
  'donors', 'transactions', 'pledges', 'recurringPayments', 'fundraisers', 
  'accounts', 'bills', 'tasks', 'uploadedExpenseQueue', 'accountTransfers', 
  'employees', 't4aSlips', 'vendors', 'projects', 'recurringExpenses', 'recurringPayroll'
];

// Single values or complex objects without a unique 'id' per item
const SINGLETONS: string[] = [
  'currency', 'exchangeRate', 'matchedBankTransactions', 
  'needsReviewBankTransactions', 'googleSheetSyncUrl', 'solaApiKey', 
  'lastSolaSyncDate', 'bankFeeds'
];

let syncTimeout: ReturnType<typeof setTimeout> | null = null;
let isPushing = false;
let needsPush = false;
let isPulling = false;
let pullInterval: ReturnType<typeof setInterval> | null = null;

const cloneState = (state: AppState) => {
  const clone: any = {};
  for (const key of [...COLLECTIONS, ...SINGLETONS]) {
    clone[key] = (state as any)[key];
  }
  return JSON.parse(JSON.stringify(clone));
};

export const migrateToCloud = async (): Promise<{ count: number }> => {
  const currentState = useStore.getState();
  const updates: any[] = [];
  const revisions: Record<string, number> = {};

  for (const key of COLLECTIONS) {
    const arr = (currentState as any)[key] as any[];
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (!item || !item.id) continue;
        const syncId = `${key}_${item.id}`;
        updates.push({ id: syncId, type: key, data: item });
        revisions[syncId] = 1;
      }
    }
  }

  for (const key of SINGLETONS) {
    const syncId = `singleton_${String(key)}`;
    updates.push({ id: syncId, type: String(key), data: (currentState as any)[key] });
    revisions[syncId] = 1;
  }

  await fetch('/api/sync2/setup', { method: 'POST' });

  const res = await fetch('/api/sync2/migrate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (err.error === 'Migration is permanently locked.') {
      throw new Error('Migration is permanently locked.');
    }
    throw new Error(`Migration failed: ${err.error || res.statusText}`);
  }
  
  const data = await res.json();
  localStorage.setItem(LAST_PULL_KEY, data.serverTime.toString());
  
  const stateClone = cloneState(currentState);
  await idbSet(SERVER_STATE_KEY, JSON.stringify(stateClone));
  await idbSet(SERVER_REVISIONS_KEY, JSON.stringify(revisions));
  
  return { count: updates.length };
};

const pushToCloud = async () => {
  if (isPushing) {
    needsPush = true;
    return;
  }
  
  const savedServerStateStr = await idbGet<string>(SERVER_STATE_KEY);
  if (!savedServerStateStr) return; 
  
  const savedRevisionsStr = await idbGet<string>(SERVER_REVISIONS_KEY) || '{}';
  const serverRevisions = JSON.parse(savedRevisionsStr);
  
  isPushing = true;
  needsPush = false;
  try {
    const serverState = JSON.parse(savedServerStateStr);
    const currentState = useStore.getState();
    
    const updates: any[] = [];
    const deletes: any[] = [];
    
    for (const key of COLLECTIONS) {
      const serverArr = (serverState as any)[key] || [];
      const currentArr = (currentState as any)[key] || [];
      
      const serverMap = new Map(serverArr.map((item: any) => [item.id, item]));
      const currentMap = new Map(currentArr.map((item: any) => [item.id, item]));
      
      for (const item of currentArr) {
        if (!item || !item.id) continue;
        const syncId = `${key}_${item.id}`;
        const serverItem = serverMap.get(item.id);
        if (!serverItem || JSON.stringify(serverItem) !== JSON.stringify(item)) {
          updates.push({ 
            id: syncId, 
            type: String(key), 
            data: item,
            base_revision: serverRevisions[syncId] || 0
          });
        }
      }
      
      for (const item of serverArr) {
        if (!item || !item.id) continue;
        const syncId = `${key}_${item.id}`;
        if (!currentMap.has(item.id)) {
          deletes.push({ 
            id: syncId, 
            type: String(key),
            base_revision: serverRevisions[syncId] || 0
          });
        }
      }
    }
    
    for (const key of SINGLETONS) {
      if (JSON.stringify((serverState as any)[key]) !== JSON.stringify((currentState as any)[key])) {
        const syncId = `singleton_${String(key)}`;
        updates.push({ 
          id: syncId, 
          type: String(key), 
          data: (currentState as any)[key],
          base_revision: serverRevisions[syncId] || 0
        });
      }
    }
    
    if (updates.length === 0 && deletes.length === 0) {
      isPushing = false;
      return;
    }
    
    const mutation_id = crypto.randomUUID();
    
    const res = await fetch('/api/sync2/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mutation_id, updates, deletes })
    });
    
    if (res.ok) {
      const { conflicts } = await res.json();
      
      if (conflicts && conflicts.length > 0) {
        console.warn('Sync Conflicts Detected:', conflicts);
        const localConflicts: any[] = [];
        for (const id of conflicts) {
          const update = updates.find(u => u.id === id);
          if (update) {
            localConflicts.push({ id, type: update.type, localData: update.data, serverData: null });
          }
        }
        if (localConflicts.length > 0) {
          useStore.setState(state => ({
            syncConflicts: [...state.syncConflicts, ...localConflicts]
          }));
        }
      }
      
      // Await pull so we don't release the push lock before revisions are updated locally!
      await pullFromCloud();
    }
  } catch (e) {
    console.error('V2 Push failed:', e);
  } finally {
    isPushing = false;
    if (needsPush) {
      if (syncTimeout) clearTimeout(syncTimeout);
      syncTimeout = setTimeout(pushToCloud, 500);
    }
  }
};

const pullFromCloud = async () => {
  if (isPulling) return;
  isPulling = true;
  
  try {
    const savedServerStateStr = await idbGet<string>(SERVER_STATE_KEY);
    if (!savedServerStateStr) return; 
    
    const savedRevisionsStr = await idbGet<string>(SERVER_REVISIONS_KEY) || '{}';
    const serverRevisions = JSON.parse(savedRevisionsStr);
    
    const since = parseInt(localStorage.getItem(LAST_PULL_KEY) || '0', 10);
    const res = await fetch(`/api/sync2/pull?since=${since}`);
    if (!res.ok) throw new Error('Pull fetch failed');
    
    const { records, serverTime, migrationLocked } = await res.json();
    
    if (migrationLocked) {
      localStorage.setItem('charity-sync-locked', 'true');
    }
    
    if (records.length === 0) {
      localStorage.setItem(LAST_PULL_KEY, serverTime.toString());
      isPulling = false;
      return;
    }
    
    const serverState = JSON.parse(savedServerStateStr);
    const stateUpdates: any = {};
    
    for (const key of [...COLLECTIONS, ...SINGLETONS]) {
      stateUpdates[key] = Array.isArray((serverState as any)[key]) ? [...(serverState as any)[key]] : (serverState as any)[key];
    }
    
    const liveState = useStore.getState();
    const liveUpdates: any = {};
    for (const key of [...COLLECTIONS, ...SINGLETONS]) {
      liveUpdates[key] = Array.isArray((liveState as any)[key]) ? [...(liveState as any)[key]] : (liveState as any)[key];
    }
    
    let hasConflicts = false;
    
    for (const rec of records) {
      if (rec.id === 'init_lock') continue;
      
      const data = JSON.parse(rec.data);
      serverRevisions[rec.id] = rec.revision;
      
      if (COLLECTIONS.includes(rec.type)) {
        const localId = data.id; // Extract inner ID
        if (!localId) continue;
        
        const arr = stateUpdates[rec.type] || [];
        const idx = arr.findIndex((item: any) => item.id === localId);
        
        if (rec.is_deleted === 1) {
          if (idx !== -1) arr.splice(idx, 1);
        } else {
          if (idx !== -1) arr[idx] = data;
          else arr.push(data);
        }
        
        const liveArr = liveUpdates[rec.type] || [];
        const liveIdx = liveArr.findIndex((item: any) => item.id === localId);
        const serverArr = (serverState as any)[rec.type] || [];
        const serverOldItem = serverArr.find((item: any) => item.id === localId);
        
        let isLocallyEdited = false;
        let localData = null;
        
        if (liveIdx !== -1 && serverOldItem) {
          if (JSON.stringify(liveArr[liveIdx]) !== JSON.stringify(serverOldItem)) {
            isLocallyEdited = true;
            localData = liveArr[liveIdx];
          }
        }
        
        if (!isLocallyEdited) {
          if (rec.is_deleted === 1) {
            if (liveIdx !== -1) liveArr.splice(liveIdx, 1);
          } else {
            if (liveIdx !== -1) liveArr[liveIdx] = data;
            else liveArr.push(data);
          }
        } else {
          hasConflicts = true;
          useStore.getState().syncConflicts.push({ id: rec.id, type: rec.type, localData, serverData: data });
        }
        
      } else if (SINGLETONS.includes(rec.type)) {
        stateUpdates[rec.type] = data;
        
        let isLocallyEdited = false;
        let localData = null;
        
        if (JSON.stringify((liveState as any)[rec.type]) !== JSON.stringify((serverState as any)[rec.type])) {
          isLocallyEdited = true;
          localData = (liveState as any)[rec.type];
        }
        
        if (!isLocallyEdited) {
          liveUpdates[rec.type] = data;
        } else {
          hasConflicts = true;
          useStore.getState().syncConflicts.push({ id: rec.id, type: rec.type, localData, serverData: data });
        }
      }
    }
    
    await idbSet(SERVER_STATE_KEY, JSON.stringify(stateUpdates));
    await idbSet(SERVER_REVISIONS_KEY, JSON.stringify(serverRevisions));
    
    useStore.setState({ ...liveUpdates, syncConflicts: [...useStore.getState().syncConflicts] });
    localStorage.setItem(LAST_PULL_KEY, serverTime.toString());
    
  } catch (e) {
    console.error('V2 Pull failed:', e);
  } finally {
    isPulling = false;
  }
};

export const SyncEngine: React.FC = () => {
  useEffect(() => {
    // Initial pull
    pullFromCloud();
    
    // Polling loop
    if (pullInterval) clearInterval(pullInterval);
    pullInterval = setInterval(pullFromCloud, 15000);
    
    const unsub = useStore.subscribe((state, prevState) => {
      let changed = false;
      for (const key of [...COLLECTIONS, ...SINGLETONS]) {
        if ((state as any)[key] !== (prevState as any)[key]) {
          changed = true;
          break;
        }
      }
      
      if (changed) {
        if (syncTimeout) clearTimeout(syncTimeout);
        syncTimeout = setTimeout(pushToCloud, 2500);
      }
    });
    
    return () => {
      unsub();
      if (pullInterval) clearInterval(pullInterval);
      if (syncTimeout) clearTimeout(syncTimeout);
    };
  }, []);

  return null;
};
