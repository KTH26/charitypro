// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
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
}

class MockD1 {
  readonly database = new DatabaseSync(':memory:');
  constructor() { this.database.exec(readFileSync(join(process.cwd(), 'scripts', 'staging-schema.sql'), 'utf8')); }
  prepare(sql: string) { return new MockStatement(this.database, sql); }
  async batch(statements: MockStatement[]) {
    this.database.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
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
afterEach(() => { while (databases.length) databases.pop()!.close(); });

const seedRecord = (db: MockD1, type: string, id: string, data: any, revision = 1) => {
  db.database.prepare('INSERT INTO sync_records(id,type,data,updated_at,revision,is_deleted) VALUES(?,?,?,?,?,0)').run(id, type, JSON.stringify(data), 1, revision);
};

describe('server-driven bank deposit matching', () => {
  it('atomically creates one batch, updates children and match history, and safely retries', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'accounts', 'bank-1', { id: 'bank-1', name: 'Bank', type: 'asset', currency: 'CAD', plaidConnected: true });
    seedRecord(db, 'matchedBankTransactions', 'matchedBankTransactions', [], 2);
    seedRecord(db, 'transactions', 'payment-1', { id: 'payment-1', donorId: 'd1', amount: 40, amountCAD: 40, date: '2026-07-20', type: 'approved', method: 'credit_card', currency: 'CAD', sourceAccountId: 'sys-undeposited-funds', depositStatus: 'undeposited' });
    seedRecord(db, 'transactions', 'payment-2', { id: 'payment-2', donorId: 'd2', amount: 60, amountCAD: 60, date: '2026-07-20', type: 'approved', method: 'credit_card', currency: 'CAD', sourceAccountId: 'sys-undeposited-funds', depositStatus: 'undeposited' });

    const app = new Hono();
    app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'test-user'); c.set('userEmail', 'test@example.com'); await next(); });
    registerServerDataRoutes(app as any);
    const payload = { requestId: 'request-1', accountId: 'bank-1', bankTransactionId: 'plaid-deposit-1', bankDate: '2026-07-21', description: 'Deposit', amount: 100, transactionIds: ['payment-1', 'payment-2'] };
    const request = () => app.request('/v3/bank/match-deposit', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'request-1' }, body: JSON.stringify(payload) }, { DB: db } as any);

    const first = await request();
    expect(first.status).toBe(200);
    const firstBody: any = await first.json();
    expect(firstBody.success).toBe(true);
    expect(firstBody.selectedCount).toBe(2);

    const children = db.database.prepare("SELECT data,revision FROM sync_records WHERE type='transactions' AND id IN ('payment-1','payment-2') ORDER BY id").all() as any[];
    const firstChild = JSON.parse(String(children[0].data));
    const secondChild = JSON.parse(String(children[1].data));
    expect(children.map(row => Number(row.revision))).toEqual([2, 2]);
    expect(firstChild.depositStatus).toBe('deposited');
    expect(firstChild.batchTransactionId).toBe(secondChild.batchTransactionId);
    const batch: any = db.database.prepare("SELECT data FROM sync_records WHERE type='transactions' AND id=?").get(firstChild.batchTransactionId);
    expect(JSON.parse(String(batch.data)).bankTransactionId).toBe('plaid-deposit-1');
    const match: any = db.database.prepare("SELECT data,revision FROM sync_records WHERE type='matchedBankTransactions' AND id='matchedBankTransactions'").get();
    expect(JSON.parse(String(match.data))).toContain('plaid-deposit-1');
    expect(Number(match.revision)).toBe(3);
    expect(Number((db.database.prepare('SELECT COUNT(*) AS count FROM audit_log').get() as any).count)).toBe(4);

    const retry = await request();
    expect(retry.status).toBe(200);
    expect((await retry.json() as any).item.id).toBe(firstBody.item.id);
    expect(Number((db.database.prepare("SELECT COUNT(*) AS count FROM sync_records WHERE type='transactions'").get() as any).count)).toBe(3);
  });
});
