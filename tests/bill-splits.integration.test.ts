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
  seed(db, 'accounts', 'inspection', { name: 'Inspection', type: 'expense', currency: 'CAD' });
  seed(db, 'accounts', 'mechanic', { name: 'Mechanic', type: 'expense', currency: 'CAD' });
  const app = new Hono();
  app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); await next(); });
  registerServerDataRoutes(app as any);
  const call = async (method: string, path: string, body?: any) => {
    const response = await app.request(path, { method, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, ...(body ? { body: JSON.stringify(body) } : {}) }, { DB: db } as any);
    return { status: response.status, body: await response.json() as any };
  };
  const splitExpense = (splits: any[], amount = 3000) => call('POST', '/v3/bills', { requestId: crypto.randomUUID(), vendor: 'Truck Co', amount, dueDate: '2026-11-20', paidDate: '2026-11-20', status: 'paid', category: 'inspection', internalCategory: 'Truck', sourceAccountId: 'bmo', splits });
  const balances = async () => Object.fromEntries((await call('GET', '/v3/accounts?limit=100')).body.items.map((item: any) => [item.id, item.balance]));
  return { call, splitExpense, balances };
};

describe('split expenses', () => {
  it('shows one payment in the bank and divides it between the categories', async () => {
    const { call, splitExpense, balances } = setup();
    const saved = await splitExpense([{ category: 'inspection', amount: 1000, memo: 'inspection' }, { category: 'mechanic', amount: 2000 }]);
    expect(saved.status).toBe(201);
    expect(saved.body.item.category).toBe('inspection');
    expect(saved.body.item.splits).toHaveLength(2);

    expect(await balances()).toMatchObject({ bmo: -3000, inspection: 1000, mechanic: 2000 });

    const bank = await call('GET', '/v3/accounts/bmo/ledger');
    expect(bank.body.items).toHaveLength(1);
    expect(bank.body.items[0].amount).toBe(3000);
    expect(bank.body.items[0].lineAmount).toBeUndefined();
    const mechanic = await call('GET', '/v3/accounts/mechanic/ledger');
    expect(mechanic.body.items).toHaveLength(1);
    expect(mechanic.body.items[0].lineAmount).toBe(2000);

    const pl = await call('GET', '/v3/profit-loss?startDate=2026-01-01&endDate=2026-12-31');
    expect(pl.body.summary.expenses).toBe(3000);
    expect(Object.fromEntries(pl.body.items.map((item: any) => [item.id, item.amount]))).toMatchObject({ inspection: 1000, mechanic: 2000 });

    const categories = await call('GET', '/v3/expense-categories?year=2026');
    expect(Object.fromEntries(categories.body.items.map((item: any) => [item.id, item.ownYtd]))).toMatchObject({ inspection: 1000, mechanic: 2000 });

    const list = await call('GET', '/v3/bills?category=mechanic');
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].categoryName).toBe('Split: Inspection, Mechanic');
  });

  it('refuses split lines that do not add up to the payment', async () => {
    const { splitExpense } = setup();
    const wrong = await splitExpense([{ category: 'inspection', amount: 1000 }, { category: 'mechanic', amount: 1500 }]);
    expect(wrong.status).toBe(409);
    expect(wrong.body.error).toContain('add up to $2500.00');
    const oneLine = await splitExpense([{ category: 'inspection', amount: 3000 }]);
    expect(oneLine.status).toBe(409);
  });

  it('can change and remove a split when editing', async () => {
    const { call, splitExpense, balances } = setup();
    const saved = (await splitExpense([{ category: 'inspection', amount: 1000 }, { category: 'mechanic', amount: 2000 }])).body.item;
    const changed = await call('PUT', `/v3/records/bills/${saved.id}`, { revision: 1, data: { splits: [{ category: 'mechanic', amount: 500 }, { category: 'inspection', amount: 2500 }] } });
    expect(changed.status).toBe(200);
    expect(changed.body.item.category).toBe('mechanic');
    expect(await balances()).toMatchObject({ bmo: -3000, inspection: 2500, mechanic: 500 });

    const badAmount = await call('PUT', `/v3/records/bills/${saved.id}`, { revision: 2, data: { amount: 4000 } });
    expect(badAmount.status).toBe(409);

    const removed = await call('PUT', `/v3/records/bills/${saved.id}`, { revision: 2, data: { splits: null, category: 'inspection' } });
    expect(removed.status).toBe(200);
    expect(removed.body.item.splits).toBeUndefined();
    expect(await balances()).toMatchObject({ bmo: -3000, inspection: 3000, mechanic: 0 });
  });
});
