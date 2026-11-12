// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { registerServerDataRoutes } from '../functions/api/server-data';

const { DatabaseSync } = (process as any).getBuiltinModule('node:sqlite');

class MockStatement {
  constructor(private database: any, private sql: string, private values: any[] = []) {}
  bind(...values: any[]) { return new MockStatement(this.database, this.sql, values); }
  async all() { return { results: this.database.prepare(this.sql).all(...this.values) as any[] }; }
  async first() { return (this.database.prepare(this.sql).get(...this.values) as any) || null; }
  async run() { return this.database.prepare(this.sql).run(...this.values); }
  async execute() { return /^\s*(SELECT|WITH)\b/i.test(this.sql) ? this.all() : this.run(); }
}

class MockD1 {
  readonly database = new DatabaseSync(':memory:');
  constructor() { this.database.exec(readFileSync(join(process.cwd(), 'scripts', 'staging-schema.sql'), 'utf8')); }
  prepare(sql: string) { return new MockStatement(this.database, sql); }
  async batch(statements: MockStatement[]) {
    this.database.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.execute());
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
  close() { this.database.close(); }
}

const databases: MockD1[] = [];
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); while (databases.length) databases.pop()!.close(); });

const seedRecord = (db: MockD1, type: string, id: string, data: any, revision = 1) => {
  db.database.prepare('INSERT INTO sync_records(id,type,data,updated_at,revision,is_deleted) VALUES(?,?,?,?,?,0)').run(id, type, JSON.stringify(data), 1, revision);
};


const runnerSetup = (schedule: any, cards: any[] = [{ id: 'card-a', status: 'active', expiryMonth: 12, expiryYear: 2030 }]) => {
  const db = new MockD1(); databases.push(db);
  seedRecord(db, 'recurringPayments', 'sched', { id: 'sched', donorId: 'donor', amount: 50, currency: 'CAD', frequency: 'monthly', method: 'credit_card', nextDate: '2026-11-12', active: true, sourceAccountId: 'bank', offsetAccountId: 'revenue', paymentMethodIds: cards.map(card => card.id), retryDays: 2, maxAttempts: 2, ...schedule });
  for (const card of cards) seedRecord(db, 'paymentMethods', card.id, { donorId: 'donor', last4: '4242', ...card });
  db.database.exec('CREATE TABLE server_secrets (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at INTEGER NOT NULL)');
  db.database.prepare("INSERT INTO server_secrets VALUES('SOLA_API_KEY','server-key',1)").run();
  for (const card of cards) db.database.prepare('INSERT INTO server_secrets VALUES(?,?,1)').run(`PAYMENT_METHOD_TOKEN:${card.id}`, `token-${card.id}`);
  const app = new Hono(); app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); await next(); }); registerServerDataRoutes(app as any);
  const run = async () => (await app.request('/v3/automation/process-recurring', { method: 'POST' }, { DB: db } as any)).json() as Promise<any>;
  const scheduleNow = () => JSON.parse(String((db.database.prepare("SELECT data FROM sync_records WHERE type='recurringPayments' AND id='sched'").get() as any).data));
  const rows = (type: string) => (db.database.prepare('SELECT data FROM sync_records WHERE type=?').all(type) as any[]).map(row => JSON.parse(String(row.data)));
  return { db, run, scheduleNow, rows };
};
const gatewayReplies = (...replies: any[]) => {
  const spy = vi.spyOn(globalThis, 'fetch');
  for (const reply of replies) {
    if (reply instanceof Error) spy.mockRejectedValueOnce(reply);
    else spy.mockResolvedValueOnce(new Response(JSON.stringify(reply), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }
  return spy;
};
const today = (date: string) => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(`${date}T12:00:00Z`)); };

describe('recurring card runner safety', () => {
  it('never charges a schedule that Sola runs itself', async () => {
    today('2026-11-12'); const gateway = gatewayReplies({ xResult: 'A' });
    const { run } = runnerSetup({ solaScheduleId: 'sola-123' });
    expect((await run()).summary.due).toBe(0);
    expect(gateway).not.toHaveBeenCalled();
  });

  it('retries a declined card only on its retry date', async () => {
    today('2026-11-12'); const gateway = gatewayReplies({ xResult: 'D', xError: 'Insufficient funds' }, { xResult: 'A', xRefNum: 'ok' });
    const { run, scheduleNow } = runnerSetup({});
    expect((await run()).summary.declined).toBe(1);
    expect(scheduleNow().retryState).toMatchObject({ nextRetryDate: '2026-11-14', attempt: 2 });
    expect((await run()).summary.due).toBe(0); // same day: no second try
    today('2026-11-13'); expect((await run()).summary.due).toBe(0);
    today('2026-11-14'); expect((await run()).summary.approved).toBe(1);
    expect(scheduleNow().nextDate).toBe('2026-12-12');
    expect(scheduleNow().retryState).toBeUndefined();
    expect(gateway).toHaveBeenCalledTimes(2);
  });

  it('skips a paused or expired card and uses the next card', async () => {
    today('2026-11-12'); const gateway = gatewayReplies({ xResult: 'A', xRefNum: 'ok' });
    const { run, rows } = runnerSetup({}, [{ id: 'paused', status: 'paused', expiryMonth: 12, expiryYear: 2030 }, { id: 'expired', status: 'active', expiryMonth: 1, expiryYear: 2026 }, { id: 'good', status: 'active', expiryMonth: 12, expiryYear: 2030 }]);
    expect((await run()).summary.approved).toBe(1);
    expect(JSON.parse(String(gateway.mock.calls[0][1]!.body)).xToken).toBe('token-good');
    expect(rows('transactions')[0]).toMatchObject({ type: 'approved', paymentMethodId: 'good' });
  });

  it('charges only the latest month when months were missed, and makes a task', async () => {
    today('2026-11-12'); const gateway = gatewayReplies({ xResult: 'A', xRefNum: 'ok' });
    const { run, scheduleNow, rows } = runnerSetup({ nextDate: '2026-08-12' });
    expect((await run()).summary.approved).toBe(1);
    expect(gateway).toHaveBeenCalledTimes(1);
    expect(rows('transactions')[0].scheduledDate).toBe('2026-11-12');
    expect(scheduleNow().nextDate).toBe('2026-12-12');
    expect(rows('tasks').some(task => task.title === 'Recurring payments were missed' && task.notes.includes('2026-08-12'))).toBe(true);
    expect((await run()).summary.due).toBe(0);
  });

  it('does not charge again after a Sola network error, and makes a task', async () => {
    today('2026-11-12'); const gateway = gatewayReplies(new Error('timeout'), { xResult: 'A' });
    const { run, rows } = runnerSetup({});
    const first = await run();
    expect(first.success).toBe(false);
    expect(rows('tasks').some(task => task.title === 'Check Sola: recurring charge result unknown')).toBe(true);
    const second = await run();
    expect(second.success).toBe(false); // still reported, not silently skipped
    expect(gateway).toHaveBeenCalledTimes(1);
  });

  it('still moves the schedule forward when it was edited during the charge', async () => {
    today('2026-11-12'); gatewayReplies({ xResult: 'A', xRefNum: 'ok' });
    const { db, run, scheduleNow } = runnerSetup({});
    const original = db.prepare.bind(db); let edited = false;
    (db as any).prepare = (sql: string) => { if (!edited && sql.includes("SELECT data,revision FROM sync_records WHERE type='recurringPayments'")) { edited = true; db.database.prepare("UPDATE sync_records SET revision=revision+1, data=json_set(data,'$.notes','edited') WHERE id='sched'").run(); } return original(sql); };
    expect((await run()).summary.approved).toBe(1);
    expect(scheduleNow()).toMatchObject({ nextDate: '2026-12-12', notes: 'edited' });
  });

  it('records USD charges at the CAD rate from settings', async () => {
    today('2026-11-12'); gatewayReplies({ xResult: 'A', xRefNum: 'ok' });
    const { db, run, rows } = runnerSetup({ currency: 'USD', amount: 100 });
    seedRecord(db, 'exchangeRate', 'exchangeRate', 1.4);
    await run();
    expect(rows('transactions')[0]).toMatchObject({ currency: 'USD', amount: 100, amountCAD: 140 });
  });
});
