import { describe, expect, it } from 'vitest';
import { findExplicitDeletes, mergeServerRecords } from '../components/SyncEngineHardened';
import { scheduledOccurrenceId, SYNC_REGISTRY, useStore, type AppState } from '../store';

const stateWith = (overrides: Partial<AppState>): AppState => ({
  donors: [],
  transactions: [],
  pledges: [],
  recurringPayments: [],
  fundraisers: [],
  accounts: [],
  bills: [],
  tasks: [],
  accountTransfers: [],
  employees: [],
  t4aSlips: [],
  vendors: [],
  projects: [],
  recurringExpenses: [],
  recurringPayroll: [],
  exchangeRate: 1.35,
  ...overrides
} as AppState);

describe('SyncEngineHardened safety contract', () => {
  it('registers every shared record collection explicitly', () => {
    const sharedCollections = Object.entries(SYNC_REGISTRY)
      .filter(([, entry]) => entry.classification === 'synced-record')
      .map(([key]) => key);

    expect(sharedCollections).toEqual(expect.arrayContaining([
      'donors',
      'transactions',
      'pledges',
      'recurringPayments',
      'fundraisers',
      'accounts',
      'bills',
      'tasks',
      'accountTransfers',
      'employees',
      't4aSlips',
      'vendors',
      'projects',
      'recurringExpenses',
      'recurringPayroll'
    ]));
  });

  it('does not seed sample tasks into a fresh installation', () => {
    expect(useStore.getState().tasks).toEqual([]);
  });

  it('creates a deletion intent only for a record removed in a local transition', () => {
    const donor = { id: 'donor-1', name: 'Preserve Me' } as any;
    const previous = stateWith({ donors: [donor] });
    const current = stateWith({ donors: [] });

    expect(findExplicitDeletes(current, previous)).toEqual([
      expect.objectContaining({
        id: 'donor-1',
        type: 'donors',
        reason: 'Explicit local removal'
      })
    ]);
  });

  it('does not infer deletion when both snapshots simply lack a record', () => {
    expect(findExplicitDeletes(stateWith({}), stateWith({}))).toEqual([]);
  });

  it('does not treat record edits as deletions', () => {
    const previous = stateWith({ donors: [{ id: 'donor-1', name: 'Before' } as any] });
    const current = stateWith({ donors: [{ id: 'donor-1', name: 'After' } as any] });

    expect(findExplicitDeletes(current, previous)).toEqual([]);
  });

  it('does not resurrect a server-deleted record from a stale browser', () => {
    const staleLocalDonor = { id: 'donor-1', name: 'Already deleted' };

    expect(mergeServerRecords('donors', [], [staleLocalDonor], {
      'donors_donor-1': 2
    })).toEqual([]);
  });

  it('preserves a genuinely local-only record the server has never seen', () => {
    const offlineDonor = { id: 'donor-2', name: 'Created offline' };

    expect(mergeServerRecords('donors', [], [offlineDonor], {})).toEqual([offlineDonor]);
  });

  it('gives the same scheduled occurrence the same ID on every browser', () => {
    expect(scheduledOccurrenceId('payment', 'schedule-1', '2026-07-20'))
      .toBe('scheduled-payment-schedule-1-2026-07-20');
    expect(scheduledOccurrenceId('payment', 'schedule-1', '2026-07-21'))
      .not.toBe(scheduledOccurrenceId('payment', 'schedule-1', '2026-07-20'));
  });
});
