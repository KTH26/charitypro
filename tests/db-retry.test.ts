import { describe, expect, it } from 'vitest';
import { withDatabaseRetry, rawDatabase, isDatabaseBusy } from '../functions/api/db-retry';

const BUSY = 'D1_ERROR: D1 DB is overloaded. Too many resources consumed within a 10 second window.';
// A pretend database: each call fails with "busy" a given number of times, then works.
const fakeDb = (failures: number) => {
  const calls = { all: 0, batch: 0 }; let left = failures;
  const statement = (sql: string, values: any[] = []): any => ({ sql, values, bind: (...more: any[]) => statement(sql, more), all: async () => { calls.all++; if (left-- > 0) throw new Error(BUSY); return { results: [{ sql, values }] }; }, first: async () => ({ ok: true }), run: async () => ({ success: true }), raw: async () => [] });
  const db: any = { prepare: (sql: string) => statement(sql), batch: async (list: any[]) => { calls.batch++; if (left-- > 0) throw new Error(BUSY); return list.map(item => ({ results: [{ sql: item.sql, values: item.values }] })); }, exec: async () => ({}) };
  return { db, calls };
};

describe('database retry when busy', () => {
  it('tries again when the database says it is overloaded, and then succeeds', async () => {
    const { db, calls } = fakeDb(2); const wrapped = withDatabaseRetry(db, [1, 1, 1]);
    const result: any = await wrapped.prepare('SELECT 1').bind('x').all();
    expect(result.results[0]).toEqual({ sql: 'SELECT 1', values: ['x'] }); expect(calls.all).toBe(3);
  });
  it('gives up after 3 extra tries and shows the error', async () => {
    const { db, calls } = fakeDb(10); const wrapped = withDatabaseRetry(db, [1, 1, 1]);
    await expect(wrapped.prepare('SELECT 1').all()).rejects.toThrow(/overloaded/); expect(calls.all).toBe(4);
  });
  it('does not retry other errors', async () => {
    let calls = 0; const db: any = { prepare: () => ({ bind() { return this; }, all: async () => { calls++; throw new Error('no such column: x'); } }) };
    await expect(withDatabaseRetry(db, [1, 1, 1]).prepare('SELECT x').all()).rejects.toThrow(/no such column/); expect(calls).toBe(1);
  });
  it('passes the real statements to batch and retries the whole batch', async () => {
    const { db, calls } = fakeDb(1); const wrapped = withDatabaseRetry(db, [1, 1, 1]);
    const results: any = await wrapped.batch([wrapped.prepare('A').bind(1), wrapped.prepare('B')]);
    expect(results.map((item: any) => item.results[0].sql)).toEqual(['A', 'B']); expect(calls.batch).toBe(2);
  });
  it('wraps only once and can give back the database itself', () => {
    const { db } = fakeDb(0); const once = withDatabaseRetry(db); expect(withDatabaseRetry(once)).toBe(once); expect(rawDatabase(once)).toBe(db); expect(rawDatabase(db)).toBe(db);
    expect(isDatabaseBusy(new Error(BUSY))).toBe(true); expect(isDatabaseBusy(new Error('UNIQUE constraint failed'))).toBe(false);
  });
});
