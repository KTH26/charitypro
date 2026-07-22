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
afterEach(() => { vi.restoreAllMocks(); while (databases.length) databases.pop()!.close(); });

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

  it('allows the live payment, bill, and account edit popups to save through revision-safe routes', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'transactions', 'editable-payment', { id: 'editable-payment', donorId: 'donor-1', amount: 20, currency: 'CAD', date: '2026-07-21' });
    seedRecord(db, 'bills', 'editable-bill', { id: 'editable-bill', vendor: 'Vendor', amount: 15, currency: 'CAD', dueDate: '2026-07-21', status: 'pending', category: 'expense-1' });
    seedRecord(db, 'accounts', 'editable-account', { id: 'editable-account', name: 'Checking', type: 'asset', currency: 'CAD', startingBalance: 0 });
    const app = new Hono(); app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'test-user'); c.set('userEmail', 'test@example.com'); await next(); }); registerServerDataRoutes(app as any);
    for (const [type, id, data] of [['transactions', 'editable-payment', { amount: 25 }], ['bills', 'editable-bill', { memo: 'Updated' }], ['accounts', 'editable-account', { name: 'Main Checking' }]] as const) {
      const response = await app.request(`/v3/records/${type}/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `edit-${type}` }, body: JSON.stringify({ revision: 1, data }) }, { DB: db } as any);
      expect(response.status).toBe(200); expect((await response.json() as any).item.revision).toBe(2);
    }
    const reconciled = await app.request('/v3/records/reconciliations', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'reconcile-account' }, body: JSON.stringify({ data: { accountId: 'editable-account', systemBalance: 0, statementBalance: 0, difference: 0, statementDate: '2026-07-21' } }) }, { DB: db } as any);
    expect(reconciled.status).toBe(201);
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
    expect(pledgeDetails.summary).toMatchObject({ amount: 100, paid: 65, scheduled: 120, balance: -85 });
    expect(pledgeDetails.payments).toHaveLength(2);
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

  it('loads a bounded unified ledger with editable payments, bills, and transfers', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'donors', 'ledger-donor', { id: 'ledger-donor', name: 'Ledger Donor' });
    seedRecord(db, 'accounts', 'ledger-bank', { id: 'ledger-bank', name: 'Ledger Bank', type: 'asset', currency: 'CAD' });
    seedRecord(db, 'accounts', 'ledger-revenue', { id: 'ledger-revenue', name: 'Donation Revenue', type: 'revenue', currency: 'CAD' });
    seedRecord(db, 'transactions', 'ledger-payment', { id: 'ledger-payment', donorId: 'ledger-donor', amount: 20, currency: 'CAD', date: '2026-07-21', type: 'approved', method: 'cash', sourceAccountId: 'ledger-bank', offsetAccountId: 'ledger-revenue' });
    seedRecord(db, 'bills', 'ledger-bill', { id: 'ledger-bill', vendor: 'Ledger Vendor', amount: 10, currency: 'CAD', dueDate: '2026-07-20', status: 'pending', category: 'ledger-revenue' });
    seedRecord(db, 'accountTransfers', 'ledger-transfer', { id: 'ledger-transfer', amount: 5, currency: 'CAD', date: '2026-07-19', fromAccountId: 'ledger-bank', toAccountId: 'ledger-revenue' });
    const app = new Hono(); app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'test-user'); c.set('userEmail', 'test@example.com'); await next(); }); registerServerDataRoutes(app as any);
    const response = await app.request('/v3/ledger?limit=50', {}, { DB: db } as any); const body = await response.json() as any;
    expect(response.status).toBe(200); expect(body.total).toBe(3); expect(body.items.map((item: any) => item.recordType)).toEqual(['transactions', 'bills', 'accountTransfers']); expect(body.items[0].donorName).toBe('Ledger Donor'); expect(body.items[0].sourceName).toBe('Ledger Bank');
  });

  it('loads only the bounded cloud check-print queue', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'accounts', 'check-category', { id: 'check-category', name: 'Programs', type: 'expense', currency: 'CAD' });
    seedRecord(db, 'accounts', 'check-bank', { id: 'check-bank', name: 'Checking', type: 'asset', subType: 'checking', currency: 'CAD' });
    seedRecord(db, 'bills', 'queued-check', { id: 'queued-check', vendor: 'Payee', amount: 30, currency: 'CAD', dueDate: '2026-07-21', status: 'paid', category: 'check-category', sourceAccountId: 'check-bank', checkNumber: 'To Print', printStatus: 'queued', method: 'check' });
    seedRecord(db, 'bills', 'printed-check', { id: 'printed-check', vendor: 'Old Payee', amount: 20, currency: 'CAD', dueDate: '2026-07-20', status: 'paid', category: 'check-category', sourceAccountId: 'check-bank', checkNumber: '100', printStatus: 'printed', method: 'check' });
    const app = new Hono(); app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'test-user'); c.set('userEmail', 'test@example.com'); await next(); }); registerServerDataRoutes(app as any);
    const response = await app.request('/v3/checks?limit=50&status=queued', {}, { DB: db } as any); const body = await response.json() as any;
    expect(response.status).toBe(200); expect(body.total).toBe(1); expect(body.items[0]).toMatchObject({ id: 'queued-check', categoryName: 'Programs', sourceName: 'Checking' });
  });

  it('loads a bounded task page with donor names and summary counts', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'donors', 'task-donor', { id: 'task-donor', name: 'Task Donor' });
    seedRecord(db, 'tasks', 'task-high', { id: 'task-high', title: 'Call donor', type: 'call', priority: 'high', dueDate: '2026-07-21', donorId: 'task-donor', completed: false });
    seedRecord(db, 'tasks', 'task-done', { id: 'task-done', title: 'Send receipt', type: 'email', priority: 'medium', dueDate: '2026-07-20', completed: true });
    const app = new Hono(); app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'test-user'); c.set('userEmail', 'test@example.com'); await next(); }); registerServerDataRoutes(app as any);
    const response = await app.request('/v3/tasks?limit=50&status=pending', {}, { DB: db } as any); const body = await response.json() as any;
    expect(response.status).toBe(200); expect(body.total).toBe(1); expect(body.limit).toBe(50); expect(body.items[0]).toMatchObject({ id: 'task-high', donorName: 'Task Donor', priority: 'high' }); expect(body.summary).toEqual({ total: 2, pending: 1, high: 1 });
  });

  it('creates, edits, lists, and deletes sponsorship days with donor revisions', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'donors', 'calendar-donor', { id: 'calendar-donor', name: 'Calendar Donor', sponsorshipDays: [] }, 2);
    const app = new Hono(); app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'test-user'); c.set('userEmail', 'test@example.com'); await next(); }); registerServerDataRoutes(app as any);
    const created = await app.request('/v3/sponsorship-days', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'calendar-create' }, body: JSON.stringify({ donorId: 'calendar-donor', revision: 2, date: '07-21', note: 'Yahrzeit', year: 2026 }) }, { DB: db } as any); const createdBody = await created.json() as any;
    expect(created.status).toBe(201); expect(createdBody.donorRevision).toBe(3);
    const listResponse = await app.request('/v3/sponsorship-days?month=07&limit=50', {}, { DB: db } as any); const list = await listResponse.json() as any;
    expect(listResponse.status).toBe(200); expect(list.total).toBe(1); expect(list.items[0]).toMatchObject({ donorName: 'Calendar Donor', donorRevision: 3, note: 'Yahrzeit' });
    const dayId = list.items[0].id;
    const updated = await app.request(`/v3/sponsorship-days/calendar-donor/${dayId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'calendar-update' }, body: JSON.stringify({ revision: 3, date: '07-22', note: 'Anniversary', year: 2026 }) }, { DB: db } as any);
    expect(updated.status).toBe(200); expect((await updated.json() as any).donorRevision).toBe(4);
    const removed = await app.request(`/v3/sponsorship-days/calendar-donor/${dayId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'calendar-delete' }, body: JSON.stringify({ revision: 4 }) }, { DB: db } as any);
    expect(removed.status).toBe(200); expect(Number((db.database.prepare("SELECT revision FROM sync_records WHERE type='donors' AND id='calendar-donor'").get() as any).revision)).toBe(5); expect(Number((db.database.prepare("SELECT COUNT(*) AS count FROM audit_log WHERE record_type='donors'").get() as any).count)).toBe(3);
  });

  it('records payroll earnings, recurring schedules, and payments without duplicate retries', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'employees', 'employee-1', { id: 'employee-1', name: 'Office Employee', role: 'Manager', balanceOwed: 0 });
    seedRecord(db, 'bills', 'legacy-payroll-expense', { id: 'legacy-payroll-expense', vendor: 'Office Employee', employeeId: 'employee-1', amount: 10, currency: 'CAD', dueDate: '2026-07-20', paidDate: '2026-07-20', status: 'paid', category: 'payroll-expense', sourceAccountId: 'payroll-bank', isPayrollExpense: true });
    seedRecord(db, 'accounts', 'payroll-expense', { id: 'payroll-expense', name: 'Payroll Expense', type: 'expense', currency: 'CAD' });
    seedRecord(db, 'accounts', 'payroll-bank', { id: 'payroll-bank', name: 'Payroll Bank', type: 'asset', currency: 'CAD' });
    const app = new Hono(); app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'test-user'); c.set('userEmail', 'test@example.com'); await next(); }); registerServerDataRoutes(app as any);
    const earningsPayload = { action: 'earnings', entityId: 'employee-1', entityType: 'employee', amount: 100, date: '2026-07-21', earningType: 'Salary', recurring: true, frequency: 'monthly' };
    const earningsRequest = () => app.request('/v3/payroll/entries', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'payroll-earnings' }, body: JSON.stringify(earningsPayload) }, { DB: db } as any);
    expect((await earningsRequest()).status).toBe(201); expect((await earningsRequest()).status).toBe(200);
    const payment = await app.request('/v3/payroll/entries', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'payroll-payment' }, body: JSON.stringify({ action: 'payment', entityId: 'employee-1', entityType: 'employee', amount: 40, date: '2026-07-21', sourceAccountId: 'payroll-bank', t4aEligible: true }) }, { DB: db } as any);
    expect(payment.status).toBe(201);
    const entitiesResponse = await app.request('/v3/payroll/entities?type=employees&limit=50', {}, { DB: db } as any); const entities = await entitiesResponse.json() as any;
    expect(entitiesResponse.status).toBe(200); expect(entities.items[0].balanceOwed).toBe(50);
    const ledgerResponse = await app.request('/v3/payroll/employee/employee-1/ledger?limit=50', {}, { DB: db } as any); const ledger = await ledgerResponse.json() as any;
    expect(ledgerResponse.status).toBe(200); expect(ledger.total).toBe(3); expect(ledger.items.some((item: any) => item.id === 'legacy-payroll-expense')).toBe(true); expect(Number((db.database.prepare("SELECT COUNT(*) AS count FROM sync_records WHERE type='recurringPayroll' AND is_deleted=0").get() as any).count)).toBe(1);
  });

  it('loads saved bank-feed transactions without contacting the bank again', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'bankFeedTransactions', 'bank-1:plaid-1', { id: 'plaid-1', accountId: 'bank-1', date: '2026-07-21', description: 'Saved deposit', amount: 125 });
    db.database.prepare('INSERT INTO sync_metadata(key,value,updated_at) VALUES(?,?,?)').run('bank_sync:bank-1', JSON.stringify({ lastSuccessfulDate: '2026-07-21', lastSyncAt: 1 }), 1);
    const app = new Hono(); app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'test-user'); c.set('userEmail', 'test@example.com'); await next(); }); registerServerDataRoutes(app as any);
    const response = await app.request('/v3/bank/feed?accountId=bank-1&limit=50', {}, { DB: db } as any); const body = await response.json() as any;
    expect(response.status).toBe(200); expect(body.items).toEqual([{ id: 'plaid-1', accountId: 'bank-1', date: '2026-07-21', description: 'Saved deposit', amount: 125 }]); expect(body.sync.lastSuccessfulDate).toBe('2026-07-21');
  });

  it('calculates fundraising reports on the server in bounded pages', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'donors', 'report-donor', { id: 'report-donor', name: 'Report Donor', phone: '555-0101' });
    seedRecord(db, 'transactions', 'report-payment', { id: 'report-payment', donorId: 'report-donor', amount: 80, amountCAD: 80, currency: 'CAD', date: '2026-07-20', type: 'approved', method: 'cash' });
    const app = new Hono(); app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'test-user'); c.set('userEmail', 'test@example.com'); await next(); }); registerServerDataRoutes(app as any);
    const monthlyResponse = await app.request('/v3/reports?tab=monthly&limit=50', {}, { DB: db } as any); const monthly = await monthlyResponse.json() as any;
    expect(monthlyResponse.status).toBe(200); expect(monthly.items[0]).toMatchObject({ label: '2026-07', total: 80 }); expect(monthly.grandTotal).toBe(80);
    const donorResponse = await app.request('/v3/reports?tab=by_donor&limit=50', {}, { DB: db } as any); const donors = await donorResponse.json() as any;
    expect(donorResponse.status).toBe(200); expect(donors.items[0]).toMatchObject({ id: 'report-donor', total: 80 });
  });

  it('calculates project and profit-and-loss reports from online records', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'accounts', 'revenue-1', { id: 'revenue-1', name: 'Donations', type: 'revenue', currency: 'CAD' });
    seedRecord(db, 'accounts', 'expense-1', { id: 'expense-1', name: 'Programs', type: 'expense', currency: 'CAD' });
    seedRecord(db, 'projects', 'project-1', { id: 'project-1', name: 'Food Program' });
    seedRecord(db, 'transactions', 'income-1', { id: 'income-1', amount: 200, amountCAD: 200, currency: 'CAD', date: '2026-07-20', type: 'approved', offsetAccountId: 'revenue-1', projectId: 'project-1' });
    seedRecord(db, 'bills', 'expense-bill-1', { id: 'expense-bill-1', vendor: 'Supplier', amount: 75, currency: 'CAD', dueDate: '2026-07-20', paidDate: '2026-07-21', status: 'paid', category: 'expense-1', projectId: 'project-1' });
    const app = new Hono(); app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'test-user'); c.set('userEmail', 'test@example.com'); await next(); }); registerServerDataRoutes(app as any);
    const projectResponse = await app.request('/v3/reports?tab=by_project&limit=50', {}, { DB: db } as any); const project = await projectResponse.json() as any;
    expect(projectResponse.status).toBe(200); expect(project.items[0]).toMatchObject({ id: 'project-1', income: 200, cost: 75 });
    const response = await app.request('/v3/profit-loss?startDate=2026-07-01&endDate=2026-07-31&limit=50', {}, { DB: db } as any); const body = await response.json() as any;
    expect(response.status).toBe(200); expect(body.summary).toEqual({ revenue: 200, expenses: 75, netIncome: 125 }); expect(body.items).toHaveLength(2);
  });

  it('restores shared expense categories, all-expenses default, and the processing queue', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'accounts', 'expense-office', { id: 'expense-office', name: 'Office Expense', type: 'expense', currency: 'CAD' });
    seedRecord(db, 'accounts', 'bank-main', { id: 'bank-main', name: 'Main Bank', type: 'asset', currency: 'CAD' });
    seedRecord(db, 'bills', 'open-expense', { id: 'open-expense', vendor: 'Paper Store', amount: 25, currency: 'CAD', dueDate: '2026-07-20', status: 'pending', category: 'expense-office', memo: 'Printer paper' });
    seedRecord(db, 'bills', 'paid-expense', { id: 'paid-expense', vendor: 'Paper Store', amount: 30, currency: 'CAD', dueDate: '2026-07-21', status: 'paid', category: 'expense-office', sourceAccountId: 'bank-main' });
    const app = new Hono(); app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'test-user'); c.set('userEmail', 'test@example.com'); await next(); }); registerServerDataRoutes(app as any);
    const allResponse = await app.request('/v3/bills?limit=50&search=office', {}, { DB: db } as any); const all = await allResponse.json() as any;
    expect(allResponse.status).toBe(200); expect(all.total).toBe(2);
    const categoryResponse = await app.request('/v3/expense-categories?limit=50&year=2026', {}, { DB: db } as any); const category = await categoryResponse.json() as any;
    expect(categoryResponse.status).toBe(200); expect(category.items[0]).toMatchObject({ id: 'expense-office', ytd: 55 }); expect(category.totalYTD).toBe(55);
    const createQueue = await app.request('/v3/records/expenseQueueItems', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'queue-create' }, body: JSON.stringify({ data: { id: 'waiting-expense', date: '2026-07-21', description: 'Needs processing', amount: 12.5, taxable: false } }) }, { DB: db } as any);
    expect(createQueue.status).toBe(201);
    const queueResponse = await app.request('/v3/records/expenseQueueItems?limit=50&search=processing', {}, { DB: db } as any); const queue = await queueResponse.json() as any;
    expect(queueResponse.status).toBe(200); expect(queue.items[0]).toMatchObject({ id: 'waiting-expense', amount: 12.5 });
  });

  it('saves shared settings with revisions and creates a secret-free cloud backup', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'currency', 'currency', 'CAD', 2);
    seedRecord(db, 'solaApiKey', 'solaApiKey', 'secret-value');
    seedRecord(db, 'transactions', 'backup-payment', { id: 'backup-payment', amount: 25, date: '2026-07-21' });
    const app = new Hono(); app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'test-user'); c.set('userEmail', 'test@example.com'); await next(); }); registerServerDataRoutes(app as any);
    const settingsResponse = await app.request('/v3/settings', {}, { DB: db } as any); const settings = await settingsResponse.json() as any;
    expect(settingsResponse.status).toBe(200); expect(settings.settings.currency).toBe('CAD'); expect(settings.solaConfigured).toBe(true);
    const updateRequest = () => app.request('/v3/settings/currency', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'setting-currency' }, body: JSON.stringify({ value: 'USD', revision: 2 }) }, { DB: db } as any);
    expect((await updateRequest()).status).toBe(200); expect((await updateRequest()).status).toBe(200);
    const backupResponse = await app.request('/v3/backup?limit=500', {}, { DB: db } as any); const backup = await backupResponse.json() as any;
    expect(backupResponse.status).toBe(200); expect(backup.items.some((item: any) => item.id === 'backup-payment')).toBe(true); expect(backup.items.some((item: any) => item.type === 'solaApiKey')).toBe(false);
  });

  it('accepts a Sola key in online Settings without returning or syncing the secret', async () => {
    const db = new MockD1(); databases.push(db);
    const app = new Hono(); app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'test-user'); c.set('userEmail', 'test@example.com'); await next(); }); registerServerDataRoutes(app as any);
    const response = await app.request('/v3/sola/configuration', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'save-sola-secret' }, body: JSON.stringify({ apiKey: 'ProductionKey123456' }) }, { DB: db } as any); const body = await response.json() as any;
    expect(response.status).toBe(200); expect(body).toEqual({ success: true, configured: true }); expect(JSON.stringify(body)).not.toContain('ProductionKey123456');
    const stored: any = db.database.prepare("SELECT value FROM server_secrets WHERE key='SOLA_API_KEY'").get(); expect(stored.value).toBe('ProductionKey123456');
    expect(db.database.prepare("SELECT COUNT(*) AS count FROM sync_records WHERE type='solaApiKey'").get().count).toBe(0);
    expect(db.database.prepare("SELECT COUNT(*) AS count FROM sync_changes WHERE type='solaApiKey'").get().count).toBe(0);
    const settings = await (await app.request('/v3/settings', {}, { DB: db } as any)).json() as any; expect(settings.solaConfigured).toBe(true); expect(JSON.stringify(settings)).not.toContain('ProductionKey123456');
  });

  it('matches a saved Sola charge to an online transaction exactly once', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'solaTransactions', 'sola-ref-1', { ref: 'sola-ref-1', name: 'Jane Donor', date: '2026-07-21', amount: 50, status: 'Approved', last4: '1234', batch: 'batch-1' });
    seedRecord(db, 'dismissedSolaRefs', 'dismissedSolaRefs', []);
    seedRecord(db, 'donors', 'donor-sola', { id: 'donor-sola', name: 'Jane Donor', aliases: [] });
    seedRecord(db, 'transactions', 'pending-sola', { id: 'pending-sola', donorId: 'donor-sola', amount: 50, amountCAD: 50, currency: 'CAD', method: 'credit_card', date: '2026-07-21', type: 'pending' });
    const app = new Hono(); app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'test-user'); c.set('userEmail', 'test@example.com'); await next(); }); registerServerDataRoutes(app as any);
    const viewResponse = await app.request('/v3/sola/view?startDate=2026-07-01&endDate=2026-07-31&limit=50', {}, { DB: db } as any); const view = await viewResponse.json() as any;
    expect(viewResponse.status).toBe(200); expect(view.autoMatches).toEqual([{ transactionId: 'pending-sola', solaRef: 'sola-ref-1' }]);
    const resolveRequest = () => app.request('/v3/sola/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'resolve-sola-1' }, body: JSON.stringify({ action: 'match', ref: 'sola-ref-1', transactionId: 'pending-sola', revision: 1 }) }, { DB: db } as any);
    expect((await resolveRequest()).status).toBe(200); expect((await resolveRequest()).status).toBe(200);
    const transaction: any = db.database.prepare("SELECT data,revision FROM sync_records WHERE type='transactions' AND id='pending-sola'").get(); const transactionData = JSON.parse(transaction.data);
    expect(transactionData).toMatchObject({ type: 'approved', solaBatchId: 'batch-1', sourceAccountId: 'sys-undeposited-funds' }); expect(transactionData.notes).toContain('sola-ref-1'); expect(Number(transaction.revision)).toBe(2);
    const mapping: any = db.database.prepare("SELECT data FROM sync_records WHERE type='solaDonorMappings'").get();
    expect(JSON.parse(mapping.data)).toMatchObject({ solaName: 'Jane Donor', donorId: 'donor-sola' });
  });

  it('materializes a due schedule once as pending verification without approving it', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'donors', 'scheduled-donor', { id: 'scheduled-donor', name: 'Scheduled Donor' });
    seedRecord(db, 'recurringPayments', 'schedule-safe', { id: 'schedule-safe', donorId: 'scheduled-donor', amount: 75, currency: 'CAD', frequency: 'monthly', nextDate: '2026-07-20', endDate: '2026-08-20', method: 'credit_card', active: true });
    const app = new Hono(); app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'test-user'); c.set('userEmail', 'test@example.com'); await next(); }); registerServerDataRoutes(app as any);
    const first = await app.request('/v3/schedules/process-due', { method: 'POST' }, { DB: db } as any); const firstBody = await first.json() as any;
    expect(first.status).toBe(200); expect(firstBody.created).toBe(1);
    const second = await app.request('/v3/schedules/process-due', { method: 'POST' }, { DB: db } as any); const secondBody = await second.json() as any;
    expect(second.status).toBe(200); expect(secondBody.created).toBe(0);
    const pending: any = db.database.prepare("SELECT data FROM sync_records WHERE type='transactions' AND id='scheduled-payment-schedule-safe-2026-07-20'").get();
    expect(JSON.parse(pending.data)).toMatchObject({ donorId: 'scheduled-donor', amount: 75, type: 'pending', method: 'credit_card', scheduleId: 'schedule-safe' });
    const schedule: any = db.database.prepare("SELECT data FROM sync_records WHERE type='recurringPayments' AND id='schedule-safe'").get();
    expect(JSON.parse(schedule.data)).toMatchObject({ nextDate: '2026-08-20', active: true });
  });

  it('previews Sola recurring schedules without saving any of them', async () => {
    const db = new MockD1(); databases.push(db); seedRecord(db, 'solaApiKey', 'solaApiKey', 'test-secret');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ Schedules: [{ ScheduleId: 'sch-1', BillName: 'Jane Donor', Amount: 75, Active: true, IntervalType: 'Monthly', StartDate: '2026-03-20', EndDate: '2027-02-20' }, { ScheduleId: 'sch-inactive', BillName: 'Old Donor', Amount: 50, Active: false }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const app = new Hono(); app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); await next(); }); registerServerDataRoutes(app as any);
    const response = await app.request('/v3/sola/schedules/preview', { method: 'POST' }, { DB: db } as any); const body = await response.json() as any;
    expect(response.status).toBe(200); expect(body).toMatchObject({ success: true, count: 1, readOnly: true }); expect(body.items[0]).toMatchObject({ scheduleId: 'sch-1', name: 'Jane Donor', amount: 75, active: true });
    expect(db.database.prepare("SELECT COUNT(*) AS count FROM sync_records WHERE type='solaSchedules'").get().count).toBe(0);
    const [, options] = fetchMock.mock.calls[0]; expect((options?.headers as any).Authorization).toBe('test-secret'); expect((options?.headers as any)['X-Recurring-Api-Version']).toBe('2.1'); expect(JSON.parse(String(options?.body))).toMatchObject({ SortOrder: 'Descending', Filters: { IsDeleted: false, Active: true } });
  });

  it('shows a Sola recurring API error instead of reporting a false zero schedule success', async () => {
    const db = new MockD1(); databases.push(db); seedRecord(db, 'solaApiKey', 'solaApiKey', 'test-secret');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ Result: 'E', Error: 'Recurring API access is not enabled.' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const app = new Hono(); app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); await next(); }); registerServerDataRoutes(app as any);
    const response = await app.request('/v3/sola/schedules/preview', { method: 'POST' }, { DB: db } as any);
    expect(response.status).toBe(502); expect(await response.json()).toMatchObject({ success: false, error: 'Recurring API access is not enabled.' });
  });

  it('previews and safely applies Google Sheet donor contact updates without deleting or blanking data', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'googleSheetSyncUrl', 'googleSheetSyncUrl', 'https://docs.google.com/spreadsheets/d/e/example/pub?output=csv');
    seedRecord(db, 'donors', 'existing-1', { id: 'existing-1', displayId: 'C-100', firstName: 'Jane', lastName: 'Donor', name: 'Jane Donor', phone: '111', email: 'keep@example.com', address: 'Old address', notes: 'Keep this', totalGiven: 500, cards: [{ id: 'card-1' }] }, 3);
    seedRecord(db, 'donors', 'not-in-sheet', { id: 'not-in-sheet', displayId: 'C-999', firstName: 'Remain', lastName: 'Safe', name: 'Remain Safe', phone: '999' }, 2);
    seedRecord(db, 'transactions', 'payment-safe', { id: 'payment-safe', donorId: 'existing-1', amount: 50, date: '2026-07-20', type: 'approved', method: 'cash', currency: 'CAD' }, 4);
    const csv = 'CODE,HID First name,Last name,Email,MobilePhone,No.,Street,Type,Postel Code\nC-100,Jane,Donor,,222,10,New Street,Ave,H1H 1H1\nC-200,New,Member,new@example.com,333,20,Fresh Road,St,H2H 2H2\n';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(csv, { status: 200, headers: { 'Content-Type': 'text/csv' } }));
    const app = new Hono(); app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'sheet-user'); c.set('userEmail', 'sheet@example.com'); await next(); }); registerServerDataRoutes(app as any);

    const previewResponse = await app.request('/v3/donors/google-sheet/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clearBlankFields: false }) }, { DB: db } as any);
    expect(previewResponse.status).toBe(200); const preview = await previewResponse.json() as any;
    expect(preview.summary).toMatchObject({ creates: 1, updates: 1 });
    const beforeApply = JSON.parse(String((db.database.prepare("SELECT data FROM sync_records WHERE type='donors' AND id='existing-1'").get() as any).data));
    expect(beforeApply.phone).toBe('111');

    const requestId = 'sheet-apply-1';
    const applyResponse = await app.request('/v3/donors/google-sheet/apply', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestId }, body: JSON.stringify({ requestId, sheetHash: preview.sheetHash, clearBlankFields: false }) }, { DB: db } as any);
    const applyBody = await applyResponse.json() as any;
    expect(applyResponse.status, JSON.stringify(applyBody)).toBe(200); expect(applyBody).toMatchObject({ success: true, created: 1, updated: 1 });
    const existing = JSON.parse(String((db.database.prepare("SELECT data FROM sync_records WHERE type='donors' AND id='existing-1'").get() as any).data));
    expect(existing).toMatchObject({ phone: '222', email: 'keep@example.com', address: '10 New Street Ave H1H 1H1', notes: 'Keep this', totalGiven: 500, cards: [{ id: 'card-1' }] });
    expect(Number((db.database.prepare("SELECT COUNT(*) AS count FROM sync_records WHERE type='donors' AND id='not-in-sheet' AND is_deleted=0").get() as any).count)).toBe(1);
    expect(Number((db.database.prepare("SELECT COUNT(*) AS count FROM sync_records WHERE type='donors' AND json_extract(data,'$.displayId')='C-200' AND is_deleted=0").get() as any).count)).toBe(1);
    expect(Number((db.database.prepare("SELECT revision FROM sync_records WHERE type='transactions' AND id='payment-safe'").get() as any).revision)).toBe(4);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
