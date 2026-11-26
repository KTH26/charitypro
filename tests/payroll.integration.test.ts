// @vitest-environment node
// Payroll: earnings and payments stay on the Payroll page (never in Bills), and a bank transaction
// matched to payroll takes the money off the person's balance exactly once.
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
    try { const results = []; for (const statement of statements) results.push(await statement.execute()); this.database.exec('COMMIT'); return results; }
    catch (error) { this.database.exec('ROLLBACK'); throw error; }
  }
  close() { this.database.close(); }
}

const databases: MockD1[] = [];
afterEach(() => { while (databases.length) databases.pop()!.close(); });
const seed = (db: MockD1, type: string, id: string, data: any) => db.database.prepare('INSERT INTO sync_records(id,type,data,updated_at,revision,is_deleted) VALUES(?,?,?,?,1,0)').run(id, type, JSON.stringify(data), 1);

const setup = () => {
  const db = new MockD1(); databases.push(db);
  seed(db, 'employees', 'emp-1', { id: 'emp-1', name: 'Yossi Weiss', role: 'Office' });
  seed(db, 'accounts', 'payroll-expense', { id: 'payroll-expense', name: 'Payroll Expense', type: 'expense', currency: 'CAD' });
  seed(db, 'accounts', 'office', { id: 'office', name: 'Office', type: 'expense', currency: 'CAD' });
  seed(db, 'accounts', 'bank-1', { id: 'bank-1', name: 'Bank', type: 'asset', currency: 'CAD', plaidConnected: true });
  seed(db, 'matchedBankTransactions', 'matchedBankTransactions', []);
  const app = new Hono();
  app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'test-user'); c.set('userEmail', 'test@example.com'); await next(); });
  registerServerDataRoutes(app as any);
  let key = 0;
  const call = async (method: string, url: string, body?: any) => {
    const response = await app.request(url, body === undefined ? {} : { method, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `k-${++key}` }, body: JSON.stringify(body) }, { DB: db } as any);
    return { status: response.status, data: await response.json() as any };
  };
  const balance = async () => (await call('GET', '/v3/payroll/entities?type=employees&limit=50')).data.items[0].balanceOwed;
  const payrollBills = () => db.database.prepare("SELECT data,revision FROM sync_records WHERE type='bills' AND is_deleted=0").all().map((row: any) => ({ ...JSON.parse(String(row.data)), revision: Number(row.revision) }));
  const earnings = (amount: number, date: string) => call('POST', '/v3/payroll/entries', { action: 'earnings', entityId: 'emp-1', entityType: 'employee', amount, date, earningType: 'Salary' });
  const payment = (amount: number, date: string, extra: any = {}) => call('POST', '/v3/payroll/entries', { action: 'payment', entityId: 'emp-1', entityType: 'employee', amount, date, sourceAccountId: 'bank-1', ...extra });
  const bankMatch = (body: any) => call('POST', '/v3/bank/match-outgoing', { accountId: 'bank-1', description: 'E-TRANSFER Y WEISS', ...body });
  return { db, call, balance, payrollBills, earnings, payment, bankMatch };
};

describe('payroll', () => {
  it('keeps weekly salary and payments out of Bills and Vendors', async () => {
    const t = setup();
    expect((await t.earnings(500, '2026-11-02')).status).toBe(201);
    expect((await t.payment(500, '2026-11-03')).status).toBe(201);
    seed(t.db, 'bills', 'normal-bill', { id: 'normal-bill', vendor: 'Hydro', amount: 80, currency: 'CAD', dueDate: '2026-11-05', status: 'pending', category: 'office' });
    expect(await t.balance()).toBe(0);
    const bills = (await t.call('GET', '/v3/bills?limit=50')).data;
    expect(bills.items.map((item: any) => item.id)).toEqual(['normal-bill']);
    const vendors = (await t.call('GET', '/v3/vendors?limit=50')).data;
    expect(vendors.items.map((item: any) => item.name)).toEqual(['Hydro']);
    // The expense category counts the salary once (the payment), not twice.
    const categories = (await t.call('GET', '/v3/expense-categories?year=2026')).data;
    expect(categories.items.find((item: any) => item.id === 'payroll-expense').ytd).toBe(500);
  });

  it('a bank transaction matched to the payroll payment takes it off once', async () => {
    const t = setup();
    await t.earnings(500, '2026-11-02');
    await t.payment(500, '2026-11-03');
    const candidates = (await t.call('GET', '/v3/bank/bill-candidates?accountId=bank-1&amount=500')).data.items;
    expect(candidates).toHaveLength(1); // only the payment: the earnings can never be "paid" by the bank
    expect(candidates[0].status).toBe('paid');
    const matched = await t.bankMatch({ action: 'existing_bill', bankTransactionId: 'bank-tx-1', bankDate: '2026-11-04', amount: 500, billId: candidates[0].id, revision: candidates[0].revision });
    expect(matched.status).toBe(200);
    expect(await t.balance()).toBe(0);
    expect(t.payrollBills()).toHaveLength(2);
    expect(t.payrollBills().find((bill: any) => bill.status === 'paid').bankTransactionId).toBe('bank-tx-1');
  });

  it('a bank transaction entered as a new payroll expense lowers the balance, and is not entered twice', async () => {
    const t = setup();
    await t.earnings(500, '2026-11-02');
    await t.earnings(500, '2026-11-09');
    expect(await t.balance()).toBe(1000);
    const expense = { action: 'expense', amount: 500, vendor: 'Payroll: Yossi Weiss', category: 'payroll-expense', isPayrollExpense: true, employeeId: 'emp-1' };
    expect((await t.bankMatch({ ...expense, bankTransactionId: 'bank-tx-1', bankDate: '2026-11-04' })).status).toBe(200);
    expect(await t.balance()).toBe(500);
    // Payroll needs the person, or it would not come off anyone's balance.
    const noPerson = await t.bankMatch({ ...expense, employeeId: '', bankTransactionId: 'bank-tx-2', bankDate: '2026-11-11' });
    expect(noPerson.status).toBe(409);
    // A payment already typed in (Record Payment) for the same week: the bank line must be matched to it, not added again.
    expect((await t.payment(500, '2026-11-10')).status).toBe(201);
    const twice = await t.bankMatch({ ...expense, bankTransactionId: 'bank-tx-2', bankDate: '2026-11-11' });
    expect(twice.status).toBe(409);
    expect(twice.data.possibleDuplicate).toBe(true);
    expect(await t.balance()).toBe(0);
    expect(t.payrollBills().filter((bill: any) => bill.status === 'paid')).toHaveLength(2);
    // Typing the same payment again on the Payroll page asks first too.
    const again = await t.payment(500, '2026-11-10');
    expect(again.status).toBe(409);
    expect(again.data.possibleDuplicate).toBe(true);
    expect((await t.payment(500, '2026-11-10', { allowDuplicate: true })).status).toBe(201);
    expect(await t.balance()).toBe(-500);
  });

  it('payroll earnings can never be marked paid (that would count them twice)', async () => {
    const t = setup();
    const added = (await t.earnings(500, '2026-11-02')).data.item;
    expect((await t.call('PATCH', `/v3/bills/${added.id}/pay`, { revision: 1, sourceAccountId: 'bank-1' })).status).toBe(409);
    expect((await t.call('PUT', `/v3/records/bills/${added.id}`, { revision: 1, data: { status: 'paid', sourceAccountId: 'bank-1' } })).status).toBe(409);
    expect((await t.bankMatch({ action: 'existing_bill', bankTransactionId: 'bank-tx-1', bankDate: '2026-11-04', amount: 500, billId: added.id, revision: 1 })).status).toBe(409);
    expect(await t.balance()).toBe(500);
    // Changing the amount or note is still fine.
    expect((await t.call('PUT', `/v3/records/bills/${added.id}`, { revision: 1, data: { amount: 450, memo: 'Short week' } })).status).toBe(200);
    expect(await t.balance()).toBe(450);
  });
});
