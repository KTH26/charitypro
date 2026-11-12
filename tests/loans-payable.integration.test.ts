// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { registerServerDataRoutes, LOAN_DUE_DATE_ERROR } from '../functions/api/server-data';

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
afterEach(() => { while (databases.length) databases.pop()!.close(); });

const seed = (db: MockD1, type: string, id: string, data: any) => {
  db.database.prepare('INSERT INTO sync_records(id,type,data,updated_at,revision,is_deleted) VALUES(?,?,?,?,1,0)').run(id, type, JSON.stringify({ id, ...data }), 1);
};

const setup = () => {
  const db = new MockD1(); databases.push(db);
  seed(db, 'accounts', 'bmo', { name: 'BMO Chequing', type: 'asset', subType: 'checking', currency: 'CAD' });
  seed(db, 'accounts', 'loan-a', { name: 'Loan from Reuven', type: 'liability', subType: 'loan', currency: 'CAD' });
  seed(db, 'accounts', 'visa', { name: 'Visa Card', type: 'liability', subType: 'credit_card', currency: 'CAD' });
  seed(db, 'accounts', 'supplies', { name: 'Supplies', type: 'expense', currency: 'CAD' });
  const app = new Hono();
  app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); await next(); });
  registerServerDataRoutes(app as any);
  const call = async (method: string, path: string, body?: any) => {
    const response = await app.request(path, { method, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, ...(body ? { body: JSON.stringify(body) } : {}) }, { DB: db } as any);
    return { status: response.status, body: await response.json() as any };
  };
  const expense = (sourceAccountId: string, amount: number, date: string, loanDueDate?: string) => call('POST', '/v3/bills', { requestId: crypto.randomUUID(), vendor: `Vendor ${amount}`, amount, dueDate: date, paidDate: date, status: 'paid', category: 'supplies', sourceAccountId, ...(loanDueDate ? { loanDueDate } : {}) });
  return { db, call, expense };
};

describe('loans payable', () => {
  it('requires a pay-back date when an expense is paid from a loan account', async () => {
    const { expense } = setup();
    const missing = await expense('loan-a', 100, '2026-01-10');
    expect(missing.status).toBe(400);
    expect(missing.body.error).toBe(LOAN_DUE_DATE_ERROR);
    const saved = await expense('loan-a', 100, '2026-01-10', '2026-06-30');
    expect(saved.status).toBe(201);
    expect(saved.body.item.loanDueDate).toBe('2026-06-30');
  });

  it('does not ask for a date on bank or credit card payments', async () => {
    const { expense } = setup();
    expect((await expense('bmo', 50, '2026-01-10')).status).toBe(201);
    expect((await expense('visa', 50, '2026-01-10')).status).toBe(201);
    const ignored = await expense('bmo', 50, '2026-01-10', '2026-06-30');
    expect(ignored.body.item.loanDueDate).toBeUndefined();
  });

  it('applies money paid back to the earliest loan first and keeps partly paid loans', async () => {
    const { db, call, expense } = setup();
    await expense('loan-a', 100, '2026-01-10', '2026-03-01');
    const second = await expense('loan-a', 200, '2026-02-10', '2026-04-01');
    await expense('visa', 999, '2026-02-11');
    seed(db, 'accountTransfers', 'repay-1', { fromAccountId: 'bmo', toAccountId: 'loan-a', amount: 150, date: '2026-02-20' });
    const result = await call('GET', '/v3/loans-payable');
    expect(result.status).toBe(200);
    expect(result.body.items).toHaveLength(1);
    expect(result.body.items[0]).toMatchObject({ recordId: second.body.item.id, accountName: 'Loan from Reuven', amount: 200, paid: 50, remaining: 150, dueDate: '2026-04-01' });
    expect(result.body.accounts).toEqual([{ id: 'loan-a', name: 'Loan from Reuven', currency: 'CAD', owed: 150 }]);
  });

  it('removes a loan from the list once it is fully paid back', async () => {
    const { db, call, expense } = setup();
    await expense('loan-a', 100, '2026-01-10', '2026-03-01');
    seed(db, 'accountTransfers', 'repay-all', { fromAccountId: 'bmo', toAccountId: 'loan-a', amount: 100, date: '2026-02-20' });
    const result = await call('GET', '/v3/loans-payable');
    expect(result.body.items).toEqual([]);
    expect(result.body.accounts[0].owed).toBe(0);
  });

  it('lets the pay-back date be changed, and shows old loans without a date', async () => {
    const { db, call } = setup();
    seed(db, 'bills', 'old-bill', { vendor: 'Old purchase', amount: 80, currency: 'CAD', dueDate: '2025-12-01', paidDate: '2025-12-01', status: 'paid', category: 'supplies', sourceAccountId: 'loan-a' });
    const before = await call('GET', '/v3/loans-payable');
    expect(before.body.items[0]).toMatchObject({ recordId: 'old-bill', dueDate: '', remaining: 80 });
    const updated = await call('PUT', '/v3/records/bills/old-bill', { revision: before.body.items[0].revision, data: { loanDueDate: '2026-05-15' } });
    expect(updated.status).toBe(200);
    const after = await call('GET', '/v3/loans-payable');
    expect(after.body.items[0].dueDate).toBe('2026-05-15');
  });

  it('requires a pay-back date on a transfer out of a loan account', async () => {
    const { db, call } = setup();
    seed(db, 'accountTransfers', 't1', { fromAccountId: 'bmo', toAccountId: 'visa', amount: 10, date: '2026-01-01' });
    const missing = await call('PUT', '/v3/records/accountTransfers/t1', { revision: 1, data: { fromAccountId: 'loan-a', toAccountId: 'bmo' } });
    expect(missing.status).toBe(400);
    const saved = await call('PUT', '/v3/records/accountTransfers/t1', { revision: 1, data: { fromAccountId: 'loan-a', toAccountId: 'bmo', loanDueDate: '2026-09-01' } });
    expect(saved.status).toBe(200);
    expect(saved.body.item.loanDueDate).toBe('2026-09-01');
  });
});
