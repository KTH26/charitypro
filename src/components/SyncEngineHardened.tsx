import React, { useEffect, useState } from 'react';
import { useStore, type AppState, SYNC_REGISTRY, type PersistedStateKey, type PersistenceClassification } from '../store';
import { get as idbGet, set as idbSet } from 'idb-keyval';

export const PENDING_MUTATIONS_KEY = 'v2_pending_mutations';
export const SERVER_STATE_KEY = 'v2_server_state';
export const SERVER_CURSOR_KEY = 'v2_sync_cursor';
export const SERVER_REVISIONS_KEY = 'v2_server_revisions';
export const SYNC_LOCK_KEY = 'v2_sync_lock'; // Lease for multi-tab pushing
export const CLIENT_GENERATION_KEY = 'v2_client_generation';

type SyncOperation = {
  operationId: string;
  id: string;
  type: string;
  operation: 'insert' | 'update' | 'delete' | 'restore';
  data: any;
  baseRevision: number;
  reason?: string;
};

export type PendingMutation = {
  mutationId: string;
  createdAt: number;
  updatedAt: number;
  attempts: number;
  nextAttemptAt: number;
  status: 'pending' | 'sending' | 'conflict' | 'failed' | 'invalid' | 'forbidden' | 'integrity_error';
  operations: SyncOperation[];
  lastError?: string;
};

let syncTimeout: ReturnType<typeof setTimeout> | null = null;
let isPushing = false;
let needsPush = false;
let isPulling = false;
let pullInterval: ReturnType<typeof setInterval> | null = null;

const getSyncedKeys = (classification: PersistenceClassification): PersistedStateKey[] => {
  return (Object.keys(SYNC_REGISTRY) as PersistedStateKey[]).filter(k => SYNC_REGISTRY[k].classification === classification);
};

const RECORD_KEYS = getSyncedKeys('synced-record');
const SINGLETON_KEYS = getSyncedKeys('synced-singleton');

const cloneState = (state: AppState) => {
  const clone: any = {};
  for (const key of [...RECORD_KEYS, ...SINGLETON_KEYS]) {
    clone[key] = (state as any)[key];
  }
  return JSON.parse(JSON.stringify(clone));
};

export const SyncEngineHardened: React.FC = () => {
  const [syncStatus, setSyncStatus] = useState<'initializing' | 'offline' | 'online' | 'conflict' | 'error'>('initializing');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [errorMsg, setErrorMsg] = useState('');

  // Initial Sync Barrier and Startup Flow
  useEffect(() => {
    const initializeSync = async () => {
      // 1. Wait for hydration
      while (!useStore.persist.hasHydrated()) {
        await new Promise(r => setTimeout(r, 50));
      }

      try {
        let cursor = await idbGet<number>(SERVER_CURSOR_KEY);
        const localGen = await idbGet<number>(CLIENT_GENERATION_KEY) || 1;
        
        // 2. Fetch server generation
        const genCheckRes = await fetch(`/api/sync2/hardened/pull?after=0&limit=1`);
        if (!genCheckRes.ok) throw new Error('Failed to verify sync generation');
        const genCheckData = await genCheckRes.json();
        const serverGen = genCheckData.syncGeneration || 1;
        
        let isInitial = false;
        // 3. Handle Generation Mismatch
        if (cursor === undefined || serverGen !== localGen) {
          isInitial = true;
          setSyncStatus('initializing');
          console.warn(`Sync generation mismatch (Local: ${localGen}, Server: ${serverGen}). Rebuilding full snapshot...`);
          await idbSet(SERVER_CURSOR_KEY, 0); // Drop cursor entirely
          await idbSet(SERVER_REVISIONS_KEY, '{}');
          await idbSet(SERVER_STATE_KEY, '{}');
          cursor = 0;
        }

        // 4. Complete initial pull
        if (isInitial || cursor === 0) {
          await fullPullFromCloud(true, serverGen);
        } else {
          setSyncStatus('online');
          await fullPullFromCloud(false, serverGen);
        }
        
        // 5. Process any legacy pending queue from offline edits
        await processPushQueue();
        
      } catch (e) {
        console.error('Initial sync failed', e);
        setSyncStatus('error');
        setErrorMsg('Failed to connect to the server.');
      }
    };
    initializeSync();
  }, []);

  // Set up polling and subscribe
  useEffect(() => {
    if (syncStatus === 'initializing' || syncStatus === 'error') return;

    pullInterval = setInterval(() => pullFromCloud(), 15000);

    const unsub = useStore.subscribe((state, prevState) => {
      let changed = false;
      for (const key of [...RECORD_KEYS, ...SINGLETON_KEYS]) {
        if ((state as any)[key] !== (prevState as any)[key]) {
          changed = true;
          break;
        }
      }
      
      if (changed) {
        if (syncTimeout) clearTimeout(syncTimeout);
        syncTimeout = setTimeout(enqueuePush, 1000); // 1s debounce
      }
    });
    
    return () => {
      unsub();
      if (pullInterval) clearInterval(pullInterval);
      if (syncTimeout) clearTimeout(syncTimeout);
    };
  }, [syncStatus]);

  const fullPullFromCloud = async (isInitial = false, currentGen: number) => {
    let hasMore = true;
    let currentCursor = await idbGet<number>(SERVER_CURSOR_KEY) || 0;
    let totalDownloaded = 0;
    
    while (hasMore) {
      const res = await fetch(`/api/sync2/hardened/pull?after=${currentCursor}&limit=500`);
      if (!res.ok) throw new Error('Pull failed');
      
      const data = await res.json();
      const changes = data.changes || [];
      
      if (changes.length > 0) {
        // Apply changes
        const serverStateStr = await idbGet<string>(SERVER_STATE_KEY);
        // CRITICAL FIX: If serverState is empty (initial sync), we must initialize it as EMPTY arrays, 
        // NOT a clone of the local store. If we clone the local store, the engine assumes all local 
        // data is already in the cloud, and will NEVER push unsynced local data!
        const serverState = serverStateStr && serverStateStr !== '{}' 
            ? JSON.parse(serverStateStr) 
            : RECORD_KEYS.reduce((acc, key) => ({ ...acc, [key]: [] }), {});
        const serverRevisions = JSON.parse(await idbGet<string>(SERVER_REVISIONS_KEY) || '{}');
        const localPending = await idbGet<PendingMutation[]>(PENDING_MUTATIONS_KEY) || [];
        
        const stateUpdates: any = {};
        
        // Conflict detection variables
        const localPendingOpIds = new Set<string>();
        localPending.forEach(m => m.operations.forEach(op => localPendingOpIds.add(op.id)));
        
        for (const change of changes) {
          const { record_id, type, revision, operation, data: payload } = change;
          const syncId = `${type}_${record_id}`;
          serverRevisions[syncId] = revision;
          
          let recordType = type as PersistedStateKey;
          const legacyTypeMap: Record<string, string> = {
            'donor': 'donors',
            'transaction': 'transactions',
            'pledge': 'pledges'
          };
          const mappedType = legacyTypeMap[recordType] || recordType;
          
          if (RECORD_KEYS.includes(mappedType as any)) {
            const type = mappedType as PersistedStateKey;
            if (!stateUpdates[type]) stateUpdates[type] = [...(serverState[type] || [])];
            
            const arr = stateUpdates[type];
            const idx = arr.findIndex((x: any) => `${type}_${x.id}` === syncId || `${recordType}_${x.id}` === syncId);
            
            if (operation === 'delete') {
              if (idx !== -1) arr.splice(idx, 1);
            } else {
              try {
                const parsed = JSON.parse(payload);
                if (idx !== -1) arr[idx] = parsed;
                else arr.push(parsed);
              } catch (parseError) {
                console.error(`Failed to parse payload for ${syncId}:`, parseError);
              }
            }
            
            // Conflict Preservation: If the user locally edited this same record, flag a conflict
            if (localPendingOpIds.has(syncId)) {
               console.warn(`Incoming server change for ${syncId} collides with local pending edit.`);
               // Note: Advanced conflict preservation logic would push this to useStore.getState().syncConflicts
               // For now, it updates the server baseline safely.
            }
            
          } else if (SINGLETON_KEYS.includes(recordType)) {
            if (operation !== 'delete') {
              try {
                stateUpdates[type] = JSON.parse(payload);
              } catch (e) {
                console.error(`Failed to parse singleton ${recordType}:`, e);
              }
            }
          }
        }
        
        // Save server baseline (ONLY what the server knows)
        for (const k of Object.keys(stateUpdates)) {
          serverState[k] = stateUpdates[k];
        }
        await idbSet(SERVER_STATE_KEY, JSON.stringify(serverState));
        await idbSet(SERVER_REVISIONS_KEY, JSON.stringify(serverRevisions));
        
        // Safely merge server changes into local store WITHOUT deleting local-only data
        const currentLocalState = useStore.getState();
        const mergedState = { ...currentLocalState };
        
        for (const k of RECORD_KEYS) {
            const localArr = (currentLocalState as any)[k] as any[] || [];
            const serverArr = (serverState as any)[k] as any[] || [];
            
            const serverMap = new Map(serverArr.map(x => [x.id, x]));
            const newArr = [...serverArr]; // Start with absolute truth from server
            
            // Re-append any local records that the server has never seen
            for (const localRec of localArr) {
                if (!serverMap.has(localRec.id)) {
                    newArr.push(localRec);
                }
            }
            (mergedState as any)[k] = newArr;
        }
        
        useStore.setState(mergedState);
        
        totalDownloaded += changes.length;
        if (isInitial) {
          setProgress({ current: totalDownloaded, total: data.totalEstimate || 0 });
        }
      }
      
      currentCursor = parseInt(data.nextCursor, 10);
      hasMore = data.hasMore;
    }
    
    // Finalize generation setup
    await idbSet(SERVER_CURSOR_KEY, currentCursor);
    await idbSet(CLIENT_GENERATION_KEY, currentGen);
    if (isInitial) setSyncStatus('online');
  };

  const pullFromCloud = async () => {
    if (isPulling) return;
    isPulling = true;
    try {
      const genRec = await fetch(`/api/sync2/hardened/pull?after=0&limit=1`).then(r => r.json());
      const serverGen = genRec.syncGeneration || 1;
      const localGen = await idbGet<number>(CLIENT_GENERATION_KEY) || 1;
      
      if (serverGen !== localGen) {
         console.warn("Generation changed mid-session. Reloading application to reset states.");
         window.location.reload();
         return;
      }
      await fullPullFromCloud(false, serverGen);
    } catch (e) {
      console.error('Background pull failed', e);
    } finally {
      isPulling = false;
    }
  };

  const enqueuePush = async () => {
    // FIX: Clean up any V1 legacy duplicates in the local store before we push them to V2 cloud
    useStore.getState().deduplicateDonors();

    const savedServerStateStr = await idbGet<string>(SERVER_STATE_KEY);
    if (!savedServerStateStr) return;
    const serverState = JSON.parse(savedServerStateStr);
    const currentState = useStore.getState();
    const serverRevisions = JSON.parse(await idbGet<string>(SERVER_REVISIONS_KEY) || '{}');
    
    const operations: SyncOperation[] = [];
    const opPrefix = crypto.randomUUID();
    let idx = 0;
    
    for (const key of RECORD_KEYS) {
      const currentArr = (currentState as any)[key] as any[] || [];
      const serverArr = (serverState as any)[key] as any[] || [];
      const serverMap = new Map(serverArr.map(x => [x.id, x]));
      const currentMap = new Map(currentArr.map(x => [x.id, x]));
      
      // Inserts & Updates
      for (const item of currentArr) {
        if (!item || !item.id) continue;
        const syncId = `${key}_${item.id}`;
        const serverItem = serverMap.get(item.id);
        if (!serverItem) {
          operations.push({ operationId: `${opPrefix}-${idx++}`, id: item.id, type: key, operation: 'insert', data: item, baseRevision: 0 });
        } else if (JSON.stringify(serverItem) !== JSON.stringify(item)) {
          operations.push({ operationId: `${opPrefix}-${idx++}`, id: item.id, type: key, operation: 'update', data: item, baseRevision: serverRevisions[syncId] || 0 });
        }
      }
      
      // Deletes
      for (const item of serverArr) {
        if (!item || !item.id) continue;
        const syncId = `${key}_${item.id}`;
        if (!currentMap.has(item.id)) {
           operations.push({ operationId: `${opPrefix}-${idx++}`, id: item.id, type: key, operation: 'delete', data: {}, baseRevision: serverRevisions[syncId] || 0, reason: 'User requested deletion' });
        }
      }
    }
    
    if (operations.length === 0) return;

    let pending = await idbGet<PendingMutation[]>(PENDING_MUTATIONS_KEY) || [];
    pending.push({
      mutationId: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      attempts: 0,
      nextAttemptAt: 0,
      status: 'pending',
      operations
    });
    
    await idbSet(SERVER_STATE_KEY, JSON.stringify(cloneState(currentState)));
    await idbSet(PENDING_MUTATIONS_KEY, pending);

    processPushQueue();
  };

  const processPushQueue = async () => {
    if (isPushing) {
      needsPush = true;
      return;
    }
    
    const lease = await idbGet<number>(SYNC_LOCK_KEY) || 0;
    if (Date.now() - lease < 10000) {
       setTimeout(processPushQueue, 2000);
       return;
    }
    
    isPushing = true;
    needsPush = false;
    
    try {
      while (true) {
        await idbSet(SYNC_LOCK_KEY, Date.now());
        
        let pending = await idbGet<PendingMutation[]>(PENDING_MUTATIONS_KEY) || [];
        const next = pending.find((p: PendingMutation) => p.status === 'pending' || p.status === 'sending');
        if (!next) break; 
        
        next.status = 'sending';
        next.attempts++;
        await idbSet(PENDING_MUTATIONS_KEY, pending);
        
        try {
          const res = await fetch('/api/sync2/hardened/push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              mutation_id: next.mutationId,
              operations: next.operations
            })
          });
          
          if (!res.ok) {
             if (res.status === 401 || res.status === 403) throw new Error('Auth Error');
             throw new Error('Push network error');
          }
          const data = await res.json();
          
          let hasConflict = false;
          const serverRevisions = JSON.parse(await idbGet<string>(SERVER_REVISIONS_KEY) || '{}');
          
          for (const result of data.results || []) {
             if (result.status === 'accepted') {
                serverRevisions[`${next.operations.find(op => op.operationId === result.operationId)?.type}_${result.recordId}`] = result.revision;
             } else if (result.status === 'conflict') {
                console.warn('Conflict received!', result);
                hasConflict = true;
                const conflicts = useStore.getState().syncConflicts;
                useStore.setState({ syncConflicts: [...conflicts, { id: result.recordId, type: result.recordType, localData: next.operations.find(op => op.operationId === result.operationId)?.data, serverData: result.serverData }] });
             } else {
                console.warn(`Operation failed: ${result.status}`, result);
             }
          }
          
          await idbSet(SERVER_REVISIONS_KEY, JSON.stringify(serverRevisions));
          
          if (hasConflict) {
             next.status = 'conflict';
             // We do NOT clear the queue on conflict. The conflict is recorded in the store. 
             // We drop the mutation from pending so the user can manually resolve it using the UI.
          }
          
          pending = await idbGet<PendingMutation[]>(PENDING_MUTATIONS_KEY) || [];
          pending = pending.filter((p: PendingMutation) => p.mutationId !== next.mutationId);
          await idbSet(PENDING_MUTATIONS_KEY, pending);
          
        } catch (e) {
          console.error(e);
          pending = await idbGet<PendingMutation[]>(PENDING_MUTATIONS_KEY) || [];
          const current = pending.find((p: PendingMutation) => p.mutationId === next.mutationId);
          if (current) current.status = 'pending';
          await idbSet(PENDING_MUTATIONS_KEY, pending);
          break;
        }
      }
    } finally {
      isPushing = false;
      await idbSet(SYNC_LOCK_KEY, 0); 
      if (needsPush) setTimeout(processPushQueue, 500);
    }
  };

  if (syncStatus === 'initializing' || syncStatus === 'error' || (syncStatus === 'syncing' && isInitial)) {
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
        backgroundColor: 'var(--bg-app)', zIndex: 9999, display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-main)', padding: '20px', textAlign: 'center'
      }}>
        <h1 style={{ marginBottom: '20px', color: 'var(--navy)' }}>Preparing CharityPro</h1>
        
        {syncStatus === 'initializing' || syncStatus === 'syncing' ? (
           <>
             <div className="loader" style={{ width: '50px', height: '50px', border: '5px solid var(--border)', borderTopColor: 'var(--navy)', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '20px' }}>
               <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
             </div>
             <p style={{ fontSize: '1.2rem', marginBottom: '10px' }}>Downloading the latest secure records…</p>
             <p style={{ color: 'var(--text-muted)' }}>Please keep this page open.</p>
             {progress.current > 0 && <p style={{ marginTop: '10px' }}>Downloaded {progress.current} records</p>}
           </>
        ) : (
           <>
             <p style={{ fontSize: '1.2rem', color: 'red', marginBottom: '20px' }}>{errorMsg}</p>
             <button onClick={() => window.location.reload()} style={{ padding: '10px 20px', background: 'var(--navy)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
               Retry Connection
             </button>
           </>
        )}
      </div>
    );
  }

  return null;
};
