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
  seed(db, 'accounts', 'bmo', { name: 'BMO Chequing', type: 'asset', currency: 'CAD' });
  seed(db, 'donors', 'd1', { name: 'Moshe Cohen' });
  seed(db, 'donors', 'd2', { name: 'Yoel Weiss' });
  const app = new Hono();
  app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userEmail', 'tester@example.com'); await next(); });
  registerServerDataRoutes(app as any);
  const call = async (method: string, path: string, body?: any) => {
    const response = await app.request(path, { method, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, ...(body ? { body: JSON.stringify(body) } : {}) }, { DB: db } as any);
    return { status: response.status, body: await response.json() as any };
  };
  return { db, call };
};
const day = (hebDay: number, hebMonth = 9) => ({ kind: 'day', hebYear: 5787, hebMonth, hebDay });

describe('Hebrew calendar bookings', () => {
  it('books days and a month, and never the same one twice', async () => {
    const { call } = setup();
    const first = await call('POST', '/v3/dedications', { donorId: 'd1', honoree: 'In memory of Avraham', items: [day(15), day(16), { kind: 'month', hebYear: 5787, hebMonth: 10 }] });
    expect(first.status).toBe(201);
    expect(first.body.items[0]).toMatchObject({ id: 'ded-day-5787-9-15', date: '2026-11-25', honoree: 'In memory of Avraham' });
    const check = await call('POST', '/v3/dedications', { checkOnly: true, items: [day(16), day(17)] });
    expect(check.status).toBe(409);
    expect(check.body.taken.map((item: any) => item.id)).toEqual(['ded-day-5787-9-16']);
    expect((await call('POST', '/v3/dedications', { donorId: 'd2', items: [{ kind: 'month', hebYear: 5787, hebMonth: 10 }] })).status).toBe(409);
    // A day inside a sponsored month can still be sold on its own.
    expect((await call('POST', '/v3/dedications', { donorId: 'd2', items: [day(3, 10)] })).status).toBe(201);
    const year = await call('GET', '/v3/dedications?hebYear=5787');
    expect(year.body.items.map((item: any) => `${item.id}:${item.donorName}`)).toEqual(['ded-day-5787-9-15:Moshe Cohen', 'ded-day-5787-9-16:Moshe Cohen', 'ded-month-5787-10:Moshe Cohen', 'ded-day-5787-10-3:Yoel Weiss']);
  });
  it('refuses dates that do not exist', async () => {
    const { call } = setup();
    expect((await call('POST', '/v3/dedications', { donorId: 'd1', items: [{ kind: 'day', hebYear: 5787, hebMonth: 10, hebDay: 30 }] })).status).toBe(400);
  });
  it('a removed date can be booked again, and deleting the pledge frees its dates', async () => {
    const { call } = setup();
    await call('POST', '/v3/dedications', { donorId: 'd1', items: [day(1)] });
    expect((await call('DELETE', '/v3/dedications/ded-day-5787-9-1')).status).toBe(200);
    expect((await call('POST', '/v3/dedications', { donorId: 'd2', items: [day(1)] })).status).toBe(201);
    const pledge = await call('POST', '/v3/records/pledges', { data: { donorId: 'd1', amount: 1800, currency: 'CAD', date: '2026-11-13' } });
    const pledgeId = pledge.body.item.id;
    expect((await call('POST', '/v3/dedications', { donorId: 'd1', pledgeId, items: [day(5), day(6)] })).status).toBe(201);
    expect((await call('GET', `/v3/dedications?pledgeId=${pledgeId}`)).body.items).toHaveLength(2);
    expect((await call('DELETE', `/v3/records/pledges/${pledgeId}`, { revision: pledge.body.item.revision })).status).toBe(200);
    expect((await call('GET', '/v3/dedications?hebYear=5787')).body.items.map((item: any) => item.id)).toEqual(['ded-day-5787-9-1']);
  });
});

describe('payment account memory', () => {
  it('remembers the account for a method and currency', async () => {
    const { call } = setup();
    expect((await call('GET', '/v3/payment-account-defaults')).body.defaults).toEqual({});
    expect((await call('PUT', '/v3/payment-account-defaults', { key: 'check:CAD', accountId: 'bmo' })).status).toBe(200);
    expect((await call('PUT', '/v3/payment-account-defaults', { key: 'check:CAD', accountId: 'nope' })).status).toBe(404);
    expect((await call('GET', '/v3/payment-account-defaults')).body.defaults).toEqual({ 'check:CAD': 'bmo' });
  });
});

describe('matching a bank deposit to checks', () => {
  it('deposits waiting checks, links already-deposited ones, and never matches twice', async () => {
    const { db, call } = setup();
    seed(db, 'matchedBankTransactions', 'matchedBankTransactions', {});
    db.database.prepare("UPDATE sync_records SET data='[]' WHERE id='matchedBankTransactions'").run();
    seed(db, 'transactions', 'chk1', { donorId: 'd1', amount: 360, currency: 'CAD', date: '2026-11-01', method: 'check', checkNumber: '101', type: 'pending' });
    seed(db, 'transactions', 'chk2', { donorId: 'd2', amount: 200, currency: 'CAD', date: '2026-11-02', method: 'check', checkNumber: '55', type: 'approved', sourceAccountId: 'bmo', depositStatus: 'deposited' });
    seed(db, 'transactions', 'card', { donorId: 'd2', amount: 100, currency: 'CAD', date: '2026-11-02', method: 'credit_card', type: 'approved', sourceAccountId: 'sys-undeposited-funds' });
    const list = await call('GET', '/v3/bank/check-candidates?accountId=bmo&bankDate=2026-11-05');
    expect(list.body.items.map((item: any) => `${item.id}:${item.checkState}`).sort()).toEqual(['chk1:waiting', 'chk2:deposited']);
    const deposit = { accountId: 'bmo', bankTransactionId: 'bmo:tx77', bankDate: '2026-11-05', transactionIds: ['chk1', 'chk2'] };
    expect((await call('POST', '/v3/bank/match-checks', { ...deposit, amount: 500 })).status).toBe(409);
    const matched = await call('POST', '/v3/bank/match-checks', { ...deposit, amount: 560 });
    expect(matched.body).toMatchObject({ success: true, depositedPaymentIds: ['chk1'], total: 560 });
    const read = (id: string) => JSON.parse(String((db.database.prepare("SELECT data FROM sync_records WHERE id=?").get(id) as any).data));
    expect(read('chk1')).toMatchObject({ type: 'approved', sourceAccountId: 'bmo', depositDate: '2026-11-05', bankTransactionId: 'bmo:tx77' });
    expect(read('chk2')).toMatchObject({ type: 'approved', bankTransactionId: 'bmo:tx77' });
    expect(read('matchedBankTransactions')).toEqual(['bmo:tx77']);
    expect((await call('POST', '/v3/bank/match-checks', { ...deposit, transactionIds: ['chk1'], amount: 360 })).status).toBe(409);
    expect((await call('GET', '/v3/bank/check-candidates?accountId=bmo&bankDate=2026-11-05')).body.items).toHaveLength(0);
  });
});
