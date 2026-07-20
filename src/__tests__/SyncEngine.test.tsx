import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SyncEngineHardened } from '../components/SyncEngineHardened';
import { useStore } from '../store';
import { render, waitFor, screen } from '@testing-library/react';
import React from 'react';
import * as idbKeyval from 'idb-keyval';

// Mock IDB-Keyval
vi.mock('idb-keyval', () => {
  let store: Record<string, any> = {};
  return {
    get: vi.fn(async (key: string) => store[key]),
    set: vi.fn(async (key: string, val: any) => { store[key] = val; }),
    del: vi.fn(async (key: string) => { delete store[key]; }),
    _reset: () => { store = {}; }
  };
});

// Mock Zustand
const mockSetState = vi.fn();
const mockGetState = vi.fn();
vi.mock('../store', () => {
  return {
    useStore: Object.assign(
      () => ({
        transactions: [],
        donors: [],
        bills: [],
        loadFromSync: vi.fn(),
        syncStatus: 'idle',
        setSyncStatus: vi.fn()
      }),
      {
        setState: (...args: any[]) => mockSetState(...args),
        getState: () => mockGetState(),
        subscribe: vi.fn()
      }
    )
  };
});

// Avoid React 18 warnings by mocking console.error for standard warnings
const originalError = console.error;
beforeEach(() => {
  console.error = vi.fn();
});
afterEach(() => {
  console.error = originalError;
});

describe('SyncEngineHardened - Core Verification Suite', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    (global.fetch as any).mockReset();
    
    // Clear IDB
    // @ts-ignore
    (await import('idb-keyval'))._reset();
    
    // Default fetch mock for pull
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/sync2/hardened/pull')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            changes: [],
            hasMore: false,
            nextCursor: '0'
          })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  it('Scenario 1: Offline Batch Recovery (Order Preservation)', async () => {
    // 1. Setup IDB with 3 offline pending mutations
    const fakePending = [
      { id: '1', type: 'transactions', operation: 'insert', data: { amount: 100 }, base_revision: 0, ts: 1001 },
      { id: '2', type: 'donors', operation: 'insert', data: { name: 'Test' }, base_revision: 0, ts: 1002 },
      { id: '1', type: 'transactions', operation: 'update', data: { amount: 150 }, base_revision: 1, ts: 1003 },
    ];
    await idbKeyval.set('pending_mutations', fakePending);

    // 2. Mock Push to capture payload
    let capturedOperations: any[] = [];
    const pushMock = vi.fn().mockImplementation(async (url: string, init: any) => {
      const body = JSON.parse(init.body);
      capturedOperations = body.operations;
      return {
        ok: true,
        json: () => Promise.resolve({ success: true, accepted: ['1', '2'], conflicts: [] })
      };
    });

    (global.fetch as any).mockImplementation((url: string, init: any) => {
      if (url.includes('/sync2/hardened/push')) return pushMock(url, init);
      if (url.includes('/sync2/hardened/pull')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ changes: [], hasMore: false }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    // 3. Render the engine to trigger background sync loop
    render(<SyncEngineHardened />);

    // 4. Verify fetch was called with ALL 3 mutations in correct order
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalled();
    }, { timeout: 3000 });

    expect(capturedOperations.length).toBe(3);
    expect(capturedOperations[0].id).toBe('1');
    expect(capturedOperations[0].operation).toBe('insert');
    expect(capturedOperations[1].id).toBe('2');
    expect(capturedOperations[2].id).toBe('1');
    expect(capturedOperations[2].operation).toBe('update');

    // 5. Verify the queue was cleared
    const remaining = await idbKeyval.get('pending_mutations');
    expect(remaining).toEqual([]);
  });

  it('Scenario 2: Optimistic Concurrency (Race Condition Rejection)', async () => {
    // 1. Put one conflicting update in the local queue
    const conflictUpdate = [
      { id: 'donor1', type: 'donors', operation: 'update', data: { name: 'Loser' }, base_revision: 1, ts: 1000 }
    ];
    await idbKeyval.set('pending_mutations', conflictUpdate);
    await idbKeyval.set('v2_sync_snapshot', {
      donors: [{ id: 'donor1', name: 'Loser', _revision: 1, _deleted: 0 }]
    });

    // 2. Mock Push to reject the record because someone else updated it to revision 2
    const pushMock = vi.fn().mockImplementation(async () => {
      return {
        ok: true,
        json: () => Promise.resolve({ 
          success: true, 
          accepted: [], 
          conflicts: [{ id: 'donor1', operation: 'update', baseRevision: 1, serverRevision: 2, serverData: { name: 'Winner' }, isDeleted: false }] 
        })
      };
    });

    (global.fetch as any).mockImplementation((url: string, init: any) => {
      if (url.includes('/sync2/hardened/push')) return pushMock(url, init);
      if (url.includes('/sync2/hardened/pull')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ changes: [], hasMore: false }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<SyncEngineHardened />);

    // 3. Wait for the engine to process the conflict
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalled();
    });

    // 4. Verify the snapshot was OVERWRITTEN by the server's winner data
    await waitFor(async () => {
      const snap: any = await idbKeyval.get('v2_sync_snapshot');
      expect(snap.donors[0].name).toBe('Winner');
      expect(snap.donors[0]._revision).toBe(2);
    });
    
    // 5. Verify the queue was dropped
    const remaining = await idbKeyval.get('pending_mutations');
    expect(remaining).toEqual([]);
  });

  it('Scenario 3: Revision Zero (Ghost Record Rejection)', async () => {
    // Client attempts to update a record that no longer exists on server (base_revision=1, but server says it isDeleted)
    const ghostUpdate = [
      { id: 'txn1', type: 'transactions', operation: 'update', data: { amount: 50 }, base_revision: 1, ts: 1000 }
    ];
    await idbKeyval.set('pending_mutations', ghostUpdate);
    await idbKeyval.set('v2_sync_snapshot', {
      transactions: [{ id: 'txn1', amount: 50, _revision: 1, _deleted: 0 }]
    });

    const pushMock = vi.fn().mockImplementation(async () => {
      return {
        ok: true,
        json: () => Promise.resolve({ 
          success: true, 
          accepted: [], 
          conflicts: [{ id: 'txn1', operation: 'update', baseRevision: 1, serverRevision: 2, serverData: {}, isDeleted: true }] 
        })
      };
    });

    (global.fetch as any).mockImplementation((url: string, init: any) => {
      if (url.includes('/sync2/hardened/push')) return pushMock(url, init);
      if (url.includes('/sync2/hardened/pull')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ changes: [], hasMore: false }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<SyncEngineHardened />);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalled();
    });

    // Verify it was wiped from local snapshot because server says it's deleted
    await waitFor(async () => {
      const snap: any = await idbKeyval.get('v2_sync_snapshot');
      expect(snap.transactions.length).toBe(0); // or kept as _deleted=1
    });
  });

  it('Scenario 4: Rollback Integrity (Crash Handling)', async () => {
    const fakePending = [
      { id: '1', type: 'transactions', operation: 'insert', data: { amount: 100 }, base_revision: 0, ts: 1001 }
    ];
    await idbKeyval.set('pending_mutations', fakePending);

    // Network crashes during push!
    const pushMock = vi.fn().mockRejectedValue(new Error('Network disconnected during push'));
    
    (global.fetch as any).mockImplementation((url: string, init: any) => {
      if (url.includes('/sync2/hardened/push')) return pushMock(url, init);
      if (url.includes('/sync2/hardened/pull')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ changes: [], hasMore: false }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<SyncEngineHardened />);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalled();
    });

    // Since the push crashed, the pending queue MUST REMAIN INTACT to avoid data loss
    const remaining = await idbKeyval.get('pending_mutations');
    expect(remaining).toEqual(fakePending);
  });
});
