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

  it('atomically creates a paid expense and advances bank match history', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'accounts', 'bank-1', { id: 'bank-1', name: 'Bank', type: 'asset', currency: 'CAD', plaidConnected: true });
    seedRecord(db, 'accounts', 'expense-1', { id: 'expense-1', name: 'Office', type: 'expense', currency: 'CAD' });
    seedRecord(db, 'matchedBankTransactions', 'matchedBankTransactions', [], 1);
    const app = new Hono();
    app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'test-user'); c.set('userEmail', 'test@example.com'); await next(); });
    registerServerDataRoutes(app as any);
    const payload = { requestId: 'expense-request', action: 'expense', accountId: 'bank-1', bankTransactionId: 'bank-expense-1', bankDate: '2026-07-21', description: 'Office Store', amount: 75, vendor: 'Office Store', category: 'expense-1', taxable: true };
    const response = await app.request('/v3/bank/match-outgoing', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'expense-request' }, body: JSON.stringify(payload) }, { DB: db } as any);
    expect(response.status).toBe(200);
    const bill: any = db.database.prepare("SELECT data FROM sync_records WHERE type='bills'").get();
    const billData = JSON.parse(String(bill.data));
    expect(billData.status).toBe('paid');
    expect(billData.bankTransactionId).toBe('bank-expense-1');
    const match: any = db.database.prepare("SELECT data,revision FROM sync_records WHERE type='matchedBankTransactions'").get();
    expect(JSON.parse(String(match.data))).toContain('bank-expense-1');
    expect(Number(match.revision)).toBe(2);
    expect(Number((db.database.prepare('SELECT COUNT(*) AS count FROM audit_log').get() as any).count)).toBe(2);
  });

  it('atomically links and pays an existing bill', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'accounts', 'bank-1', { id: 'bank-1', name: 'Bank', type: 'asset', currency: 'CAD', plaidConnected: true });
    seedRecord(db, 'matchedBankTransactions', 'matchedBankTransactions', [], 4);
    seedRecord(db, 'bills', 'bill-1', { id: 'bill-1', vendor: 'Vendor', amount: 25, currency: 'CAD', dueDate: '2026-07-20', status: 'pending', category: 'expense-1' }, 3);
    const app = new Hono();
    app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'test-user'); c.set('userEmail', 'test@example.com'); await next(); });
    registerServerDataRoutes(app as any);
    const payload = { requestId: 'bill-request', action: 'existing_bill', accountId: 'bank-1', bankTransactionId: 'bank-bill-1', bankDate: '2026-07-21', description: 'Vendor', amount: 25, billId: 'bill-1', revision: 3 };
    const response = await app.request('/v3/bank/match-outgoing', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'bill-request' }, body: JSON.stringify(payload) }, { DB: db } as any);
    expect(response.status).toBe(200);
    const bill: any = db.database.prepare("SELECT data,revision FROM sync_records WHERE type='bills' AND id='bill-1'").get();
    const billData = JSON.parse(String(bill.data));
    expect(billData.status).toBe('paid');
    expect(billData.sourceAccountId).toBe('bank-1');
    expect(billData.bankTransactionId).toBe('bank-bill-1');
    expect(Number(bill.revision)).toBe(4);
    expect(Number((db.database.prepare('SELECT COUNT(*) AS count FROM audit_log').get() as any).count)).toBe(2);
  });

  it('atomically records an outgoing account transfer', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'accounts', 'bank-1', { id: 'bank-1', name: 'Bank', type: 'asset', currency: 'CAD', plaidConnected: true });
    seedRecord(db, 'accounts', 'cash-1', { id: 'cash-1', name: 'Cash', type: 'asset', currency: 'CAD' });
    seedRecord(db, 'matchedBankTransactions', 'matchedBankTransactions', [], 1);
    const app = new Hono();
    app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'test-user'); c.set('userEmail', 'test@example.com'); await next(); });
    registerServerDataRoutes(app as any);
    const payload = { requestId: 'transfer-request', action: 'transfer', accountId: 'bank-1', bankTransactionId: 'bank-transfer-1', bankDate: '2026-07-21', description: 'Transfer', amount: 50, targetAccountId: 'cash-1' };
    const response = await app.request('/v3/bank/match-outgoing', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'transfer-request' }, body: JSON.stringify(payload) }, { DB: db } as any);
    expect(response.status).toBe(200);
    const transfer: any = db.database.prepare("SELECT data FROM sync_records WHERE type='accountTransfers'").get();
    const transferData = JSON.parse(String(transfer.data));
    expect(transferData.fromAccountId).toBe('bank-1');
    expect(transferData.toAccountId).toBe('cash-1');
    expect(transferData.bankTransactionId).toBe('bank-transfer-1');
  });

  it('creates, updates, and deletes a generic cloud record with revisions and audit history', async () => {
    const db = new MockD1(); databases.push(db);
    const app = new Hono();
    app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'test-user'); c.set('userEmail', 'test@example.com'); await next(); });
    registerServerDataRoutes(app as any);
    const pledge = { id: 'pledge-1', donorId: 'donor-1', amount: 100, currency: 'CAD', date: '2026-07-21' };
    const created = await app.request('/v3/records/pledges', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'create-pledge' }, body: JSON.stringify({ data: pledge }) }, { DB: db } as any);
    expect(created.status).toBe(201);
    expect((await created.json() as any).item.revision).toBe(1);

    const updated = await app.request('/v3/records/pledges/pledge-1', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'update-pledge' }, body: JSON.stringify({ revision: 1, data: { amount: 125 } }) }, { DB: db } as any);
    const updatedBody = await updated.json() as any;
    if (!updated.ok) throw new Error(JSON.stringify(updatedBody));
    expect(updated.status).toBe(200);
    expect(updatedBody.item.amount).toBe(125);

    const removed = await app.request('/v3/records/pledges/pledge-1', { method: 'DELETE', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'delete-pledge' }, body: JSON.stringify({ revision: 2 }) }, { DB: db } as any);
    expect(removed.status).toBe(200);
    const row: any = db.database.prepare("SELECT revision,is_deleted FROM sync_records WHERE type='pledges' AND id='pledge-1'").get();
    expect(Number(row.revision)).toBe(3);
    expect(Number(row.is_deleted)).toBe(1);
    expect(Number((db.database.prepare("SELECT COUNT(*) AS count FROM audit_log WHERE record_type='pledges'").get() as any).count)).toBe(3);
  });

  it('searches donors with a bounded server-side page', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'donors', 'donor-search-1', { id: 'donor-search-1', name: 'Sarah Smith', firstName: 'Sarah', lastName: 'Smith', phone: '555-0100', email: 'sarah@example.com', displayId: 'D-100' });
    seedRecord(db, 'transactions', 'donor-payment-1', { id: 'donor-payment-1', donorId: 'donor-search-1', amount: 40, amountCAD: 40, currency: 'CAD', date: '2026-07-20', type: 'approved', method: 'cash' });
    seedRecord(db, 'pledges', 'donor-pledge-1', { id: 'donor-pledge-1', donorId: 'donor-search-1', amount: 100, currency: 'CAD', date: '2026-07-19' });
    const app = new Hono();
    app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'test-user'); c.set('userEmail', 'test@example.com'); await next(); });
    registerServerDataRoutes(app as any);
    const response = await app.request('/v3/donors?limit=50&search=smith', {}, { DB: db } as any);
    const body = await response.json() as any;
    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].name).toBe('Sarah Smith');
    expect(body.limit).toBe(50);
    const profileResponse = await app.request('/v3/donors/donor-search-1/profile', {}, { DB: db } as any);
    const profile = await profileResponse.json() as any;
    expect(profileResponse.status).toBe(200);
    expect(profile.summary.approvedTotal).toBe(40);
    expect(profile.summary.pledgedTotal).toBe(100);

    seedRecord(db, 'transactions', 'linked-payment-1', { id: 'linked-payment-1', donorId: 'donor-search-1', pledgeId: 'donor-pledge-1', amount: 25, amountCAD: 25, currency: 'CAD', date: '2026-07-21', type: 'approved', method: 'cash' });
    seedRecord(db, 'recurringPayments', 'linked-schedule-1', { id: 'linked-schedule-1', donorId: 'donor-search-1', pledgeId: 'donor-pledge-1', amount: 10, currency: 'CAD', frequency: 'monthly', nextDate: '2026-08-01', active: true });
    const pledgeResponse = await app.request('/v3/pledges/donor-pledge-1/details', {}, { DB: db } as any);
    const pledgeDetails = await pledgeResponse.json() as any;
    expect(pledgeResponse.status).toBe(200);
    expect(pledgeDetails.pledge.donorName).toBe('Sarah Smith');
    expect(pledgeDetails.summary).toMatchObject({ amount: 100, paid: 25, scheduled: 10, balance: 65 });
    expect(pledgeDetails.payments).toHaveLength(1);
    expect(pledgeDetails.schedules).toHaveLength(1);
  });

  it('loads bounded account choices used by the payment form', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'accounts', 'asset-1', { id: 'asset-1', name: 'Main Bank', type: 'asset', currency: 'CAD', startingBalance: 100 });
    seedRecord(db, 'accounts', 'revenue-1', { id: 'revenue-1', name: 'Donations', type: 'revenue', currency: 'CAD', startingBalance: 0 });
    seedRecord(db, 'transactions', 'account-payment-1', { id: 'account-payment-1', donorId: 'donor-1', amount: 20, amountCAD: 20, currency: 'CAD', date: '2026-07-20', type: 'approved', method: 'cash', sourceAccountId: 'asset-1', offsetAccountId: 'revenue-1' });
    const app = new Hono();
    app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'test-user'); c.set('userEmail', 'test@example.com'); await next(); });
    registerServerDataRoutes(app as any);
    const response = await app.request('/v3/accounts?limit=100', {}, { DB: db } as any);
    const body = await response.json() as any;
    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(2);
    expect(body.total).toBe(2);
    const ledgerResponse = await app.request('/v3/accounts/asset-1/ledger?limit=50', {}, { DB: db } as any);
    const ledger = await ledgerResponse.json() as any;
    expect(ledgerResponse.status).toBe(200);
    expect(ledger.items).toHaveLength(1);
    expect(ledger.items[0].recordType).toBe('transactions');
  });

  it('loads paginated vendor totals and original-style vendor bill details', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'vendors', 'vendor-1', { id: 'vendor-1', name: 'Office Supply', phone: '555-0199' });
    seedRecord(db, 'accounts', 'expense-office', { id: 'expense-office', name: 'Office Expense', type: 'expense', currency: 'CAD' });
    seedRecord(db, 'accounts', 'bank-main', { id: 'bank-main', name: 'Main Bank', type: 'asset', currency: 'CAD' });
    seedRecord(db, 'bills', 'vendor-bill-paid', { id: 'vendor-bill-paid', vendor: 'Office Supply', amount: 40, currency: 'CAD', dueDate: '2026-07-19', paidDate: '2026-07-20', status: 'paid', category: 'expense-office', sourceAccountId: 'bank-main' });
    seedRecord(db, 'bills', 'vendor-bill-open', { id: 'vendor-bill-open', vendor: 'Office Supply', amount: 60, currency: 'CAD', dueDate: '2026-07-21', status: 'pending', category: 'expense-office' });
    const app = new Hono();
    app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'test-user'); c.set('userEmail', 'test@example.com'); await next(); });
    registerServerDataRoutes(app as any);
    const listResponse = await app.request('/v3/vendors?limit=50&search=office', {}, { DB: db } as any);
    const list = await listResponse.json() as any;
    expect(listResponse.status).toBe(200);
    expect(list.items).toEqual([{ name: 'Office Supply', billCount: 2, totalBilled: 100, balanceOwed: 60 }]);
    const detailResponse = await app.request('/v3/vendors/details?name=Office%20Supply', {}, { DB: db } as any);
    const detail = await detailResponse.json() as any;
    expect(detailResponse.status).toBe(200);
    expect(detail.vendor.phone).toBe('555-0199');
    expect(detail.summary).toEqual({ billCount: 2, totalPaid: 40, totalOwed: 60 });
    expect(detail.bills[0].categoryName).toBe('Office Expense');
  });
});
