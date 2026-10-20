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

describe('expense category hierarchy totals', () => {
  it('rolls every subcategory amount into its main category total', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'accounts', 'travel', { id: 'travel', name: 'Travel', type: 'expense', currency: 'CAD' });
    seedRecord(db, 'accounts', 'flights', { id: 'flights', name: 'Flights', type: 'expense', currency: 'CAD', parentId: 'travel' });
    seedRecord(db, 'accounts', 'hotels', { id: 'hotels', name: 'Hotels', type: 'expense', currency: 'CAD', parentId: 'travel' });
    seedRecord(db, 'bills', 'direct', { id: 'direct', vendor: 'Travel direct', amount: 25, currency: 'CAD', dueDate: '2026-02-01', category: 'travel' });
    seedRecord(db, 'bills', 'flight-bill', { id: 'flight-bill', vendor: 'Airline', amount: 100, currency: 'CAD', dueDate: '2026-03-01', category: 'flights' });
    seedRecord(db, 'bills', 'hotel-bill', { id: 'hotel-bill', vendor: 'Hotel', amount: 200, currency: 'CAD', dueDate: '2026-04-01', category: 'hotels' });
    const app = new Hono();
    app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); await next(); });
    registerServerDataRoutes(app as any);
    const response = await app.request('/v3/expense-categories?year=2026', {}, { DB: db } as any);
    expect(response.status).toBe(200);
    const body: any = await response.json();
    expect(body.totalYTD).toBe(325);
    expect(body.items.find((item: any) => item.id === 'travel')).toMatchObject({ ownYtd: 25, ytd: 325 });
    expect(body.items.find((item: any) => item.id === 'flights')).toMatchObject({ ownYtd: 100, ytd: 100, parentId: 'travel' });
    expect(body.items.find((item: any) => item.id === 'hotels')).toMatchObject({ ownYtd: 200, ytd: 200, parentId: 'travel' });
  });
});

describe('tokenized donor payment methods', () => {
  it('turns iFields single-use tokens into a reusable Sola token without storing card data', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'donors', 'ifields-donor', { id: 'ifields-donor', name: 'Secure Donor' });
    db.database.exec('CREATE TABLE server_secrets (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)');
    db.database.prepare("INSERT INTO server_secrets(key,value,updated_at) VALUES('SOLA_API_KEY','server-key',1),('SOLA_IFIELDS_KEY','public-ifields-key',1)").run();
    const gateway = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ xResult: 'A', xToken: 'reusable-token-4242', xMaskedCardNumber: '4xxxxxxxxxxx4242', xCardType: 'Visa' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const app = new Hono(); app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'card-user'); c.set('userEmail', 'card@example.com'); await next(); }); registerServerDataRoutes(app as any);
    const response = await app.request('/v3/donors/ifields-donor/payment-methods/tokenize', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'tokenize-card-1' }, body: JSON.stringify({ cardNumberToken: 'single-use-card-token-which-is-long', cvvToken: 'single-use-cvv-token', expiryMonth: 12, expiryYear: 2030, cardholderName: 'Secure Donor' }) }, { DB: db } as any);
    expect(response.status).toBe(201); const body: any = await response.json(); expect(body.item).toMatchObject({ donorId: 'ifields-donor', brand: 'Visa', last4: '4242', tokenProvider: 'sola-ifields' });
    const sent = JSON.parse(String((gateway.mock.calls[0][1] as RequestInit).body)); expect(sent).toMatchObject({ xCommand: 'cc:save', xCardNum: 'single-use-card-token-which-is-long', xCVV: 'single-use-cvv-token', xExp: '1230' });
    const publicRecord = String((db.database.prepare("SELECT data FROM sync_records WHERE type='paymentMethods'").get() as any).data); expect(publicRecord).not.toContain('single-use'); expect(publicRecord).not.toContain('reusable-token');
    const secret = db.database.prepare("SELECT value FROM server_secrets WHERE key LIKE 'PAYMENT_METHOD_TOKEN:%'").get() as any; expect(secret.value).toBe('reusable-token-4242');
    const retry = await app.request('/v3/donors/ifields-donor/payment-methods/tokenize', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'tokenize-card-1' }, body: JSON.stringify({ cardNumberToken: 'another-single-use-card-token', cvvToken: 'another-cvv-token-value', expiryMonth: 1, expiryYear: 2031 }) }, { DB: db } as any);
    expect(retry.status).toBe(201); expect((await retry.json() as any).item.id).toBe(body.item.id); expect(gateway).toHaveBeenCalledTimes(1);
  });

  it('stores gateway tokens separately and returns masked card details only', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'donors', 'card-donor', { id: 'card-donor', name: 'Card Donor' });
    const app = new Hono();
    app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'card-user'); c.set('userEmail', 'card@example.com'); await next(); });
    registerServerDataRoutes(app as any);

    const create = await app.request('/v3/donors/card-donor/payment-methods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'save-card-1' },
      body: JSON.stringify({ token: 'sola-token-123456789', last4: '4242', brand: 'Visa', expiryMonth: 12, expiryYear: 2030, cardholderName: 'Card Donor' }),
    }, { DB: db } as any);
    expect(create.status).toBe(201);
    const created = await create.json() as any;
    expect(created.item).toMatchObject({ donorId: 'card-donor', last4: '4242', brand: 'Visa', isDefault: true, priority: 1, status: 'active' });
    expect(JSON.stringify(created)).not.toContain('sola-token-123456789');

    const stored = JSON.parse(String((db.database.prepare("SELECT data FROM sync_records WHERE type='paymentMethods' AND id=?").get(created.item.id) as any).data));
    expect(stored).not.toHaveProperty('token');
    expect((db.database.prepare('SELECT value FROM server_secrets WHERE key=?').get(`PAYMENT_METHOD_TOKEN:${created.item.id}`) as any).value).toBe('sola-token-123456789');

    const list = await app.request('/v3/donors/card-donor/payment-methods', {}, { DB: db } as any);
    expect(list.status).toBe(200);
    expect(await list.json()).toMatchObject({ success: true, items: [{ id: created.item.id, last4: '4242', isDefault: true }] });

    const retry = await app.request('/v3/donors/card-donor/payment-methods', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'save-card-1' },
      body: JSON.stringify({ token: 'different-token-ignored', last4: '9999', brand: 'Visa', expiryMonth: 12, expiryYear: 2030 }),
    }, { DB: db } as any);
    expect(retry.status).toBe(200);
    expect((await retry.json() as any).item.id).toBe(created.item.id);
    expect(Number((db.database.prepare("SELECT COUNT(*) count FROM sync_records WHERE type='paymentMethods'").get() as any).count)).toBe(1);
  });

  it('changes the default card and safely deletes an unused card', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'donors', 'card-donor', { id: 'card-donor', name: 'Card Donor' });
    const app = new Hono();
    app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'card-user'); c.set('userEmail', 'card@example.com'); await next(); });
    registerServerDataRoutes(app as any);
    const save = async (key: string, last4: string) => (await (await app.request('/v3/donors/card-donor/payment-methods', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify({ token: `sola-token-${last4}`, last4, brand: 'Visa', expiryMonth: 12, expiryYear: 2030 }),
    }, { DB: db } as any)).json() as any).item;
    const first = await save('save-first', '1111');
    const second = await save('save-second', '2222');

    const update = await app.request(`/v3/donors/card-donor/payment-methods/${second.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'default-second' },
      body: JSON.stringify({ revision: second.revision, isDefault: true, priority: 1 }),
    }, { DB: db } as any);
    expect(update.status).toBe(200);
    const defaults = db.database.prepare("SELECT data FROM sync_records WHERE type='paymentMethods' AND is_deleted=0 ORDER BY id").all().map((row: any) => JSON.parse(String(row.data)));
    expect(defaults.filter((item: any) => item.isDefault).map((item: any) => item.last4)).toEqual(['2222']);

    const firstRevision = Number((db.database.prepare("SELECT revision FROM sync_records WHERE type='paymentMethods' AND id=?").get(first.id) as any).revision);
    const remove = await app.request(`/v3/donors/card-donor/payment-methods/${first.id}`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'delete-first' },
      body: JSON.stringify({ revision: firstRevision }),
    }, { DB: db } as any);
    expect(remove.status).toBe(200);
    expect((db.database.prepare("SELECT is_deleted FROM sync_records WHERE type='paymentMethods' AND id=?").get(first.id) as any).is_deleted).toBe(1);
    expect(db.database.prepare('SELECT value FROM server_secrets WHERE key=?').get(`PAYMENT_METHOD_TOKEN:${first.id}`)).toBeUndefined();
  });

  it('charges a saved token server-side and records an idempotent approved payment', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'donors', 'charge-donor', { id: 'charge-donor', name: 'Charge Donor' });
    seedRecord(db, 'accounts', 'bank', { id: 'bank', name: 'Bank', type: 'asset', currency: 'CAD' });
    seedRecord(db, 'accounts', 'revenue', { id: 'revenue', name: 'Donations', type: 'revenue', currency: 'CAD' });
    seedRecord(db, 'pledges', 'charge-pledge', { id: 'charge-pledge', donorId: 'charge-donor', amount: 100, date: '2026-01-01', currency: 'CAD' });
    seedRecord(db, 'paymentMethods', 'saved-card', { id: 'saved-card', donorId: 'charge-donor', brand: 'Visa', last4: '4242', status: 'active', isDefault: true, priority: 1 });
    db.database.exec('CREATE TABLE server_secrets (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)');
    db.database.prepare("INSERT INTO server_secrets(key,value,updated_at) VALUES('SOLA_API_KEY','server-key',1),('PAYMENT_METHOD_TOKEN:saved-card','private-card-token',1)").run();
    const gateway = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ xResult: 'A', xRefNum: 'approved-ref-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const app = new Hono(); app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'card-user'); c.set('userEmail', 'card@example.com'); await next(); }); registerServerDataRoutes(app as any);
    const request = () => app.request('/v3/donors/charge-donor/charge-saved-card', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'charge-once' }, body: JSON.stringify({ amount: 75, currency: 'CAD', paymentMethodId: 'saved-card', sourceAccountId: 'bank', offsetAccountId: 'revenue', date: '2026-10-19', allocations: [{ pledgeId: 'charge-pledge', amount: 75 }] }) }, { DB: db } as any);
    const response = await request(); const result = await response.json() as any;
    expect(response.status).toBe(201); expect(result).toMatchObject({ success: true, approved: true, item: { donorId: 'charge-donor', amount: 75, type: 'approved', paymentMethodId: 'saved-card', solaRef: 'approved-ref-1' } });
    const sent = JSON.parse(String((gateway.mock.calls[0][1] as RequestInit).body)); expect(sent).toMatchObject({ xKey: 'server-key', xToken: 'private-card-token', xInvoice: 'charge-once' }); expect(sent).not.toHaveProperty('xCardNum');
    const retry = await request(); expect(retry.status).toBe(201); expect((await retry.json() as any).item.id).toBe(result.item.id); expect(gateway).toHaveBeenCalledTimes(1);
    expect(Number((db.database.prepare("SELECT COUNT(*) count FROM sync_records WHERE type='transactions'").get() as any).count)).toBe(1);
    expect(Number((db.database.prepare("SELECT COUNT(*) count FROM sync_records WHERE type='paymentAllocations' AND json_extract(data,'$.pledgeId')='charge-pledge'").get() as any).count)).toBe(1);
  });

  it('records a declined saved-card attempt without counting it as an approved payment', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'donors', 'decline-donor', { id: 'decline-donor', name: 'Decline Donor' }); seedRecord(db, 'accounts', 'bank', { id: 'bank', type: 'asset' }); seedRecord(db, 'accounts', 'revenue', { id: 'revenue', type: 'revenue' }); seedRecord(db, 'paymentMethods', 'declined-card', { id: 'declined-card', donorId: 'decline-donor', status: 'active', last4: '1111' });
    db.database.exec('CREATE TABLE server_secrets (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)');
    db.database.prepare("INSERT INTO server_secrets(key,value,updated_at) VALUES('SOLA_API_KEY','server-key',1),('PAYMENT_METHOD_TOKEN:declined-card','declined-token',1)").run();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ xResult: 'D', xError: 'Insufficient funds', xRefNum: 'declined-ref' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const app = new Hono(); app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); await next(); }); registerServerDataRoutes(app as any);
    const response = await app.request('/v3/donors/decline-donor/charge-saved-card', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'decline-once' }, body: JSON.stringify({ amount: 20, paymentMethodId: 'declined-card', sourceAccountId: 'bank', offsetAccountId: 'revenue', date: '2026-10-19' }) }, { DB: db } as any);
    expect(response.status).toBe(402); expect(await response.json()).toMatchObject({ success: false, approved: false, error: 'Insufficient funds' });
    const saved = JSON.parse(String((db.database.prepare("SELECT data FROM sync_records WHERE type='transactions'").get() as any).data)); expect(saved).toMatchObject({ type: 'declined', declineReason: 'Insufficient funds', solaRef: 'declined-ref' });
  });
});

describe('recurring saved-card configuration', () => {
  it('saves an ordered card fallback and controlled retry policy', async () => {
    const db=new MockD1();databases.push(db);seedRecord(db,'donors','schedule-donor',{id:'schedule-donor',name:'Schedule Donor'});seedRecord(db,'accounts','schedule-bank',{id:'schedule-bank',type:'asset'});seedRecord(db,'accounts','schedule-revenue',{id:'schedule-revenue',type:'revenue'});seedRecord(db,'pledges','schedule-pledge',{id:'schedule-pledge',donorId:'schedule-donor',amount:1200,currency:'CAD',date:'2026-01-01'});seedRecord(db,'paymentMethods','card-1',{id:'card-1',donorId:'schedule-donor',status:'active',last4:'1111'});seedRecord(db,'paymentMethods','card-2',{id:'card-2',donorId:'schedule-donor',status:'active',last4:'2222'});
    const app=new Hono();app.use('*',async(c,next)=>{c.set('userRoles',['administrator']);c.set('userId','tester');c.set('userEmail','tester@example.com');await next();});registerServerDataRoutes(app as any);
    const response=await app.request('/v3/records/recurringPayments',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'schedule-cards'},body:JSON.stringify({data:{donorId:'schedule-donor',amount:100,currency:'CAD',frequency:'monthly',method:'credit_card',nextDate:'2026-11-01',endDate:'2027-10-01',active:true,sourceAccountId:'schedule-bank',offsetAccountId:'schedule-revenue',pledgeId:'schedule-pledge',paymentMethodIds:['card-2','card-1'],retryDays:2,maxAttempts:3}})},{DB:db} as any);
    expect(response.status).toBe(201);const body=await response.json() as any;expect(body.item).toMatchObject({paymentMethodId:'card-2',paymentMethodIds:['card-2','card-1'],retryDays:2,maxAttempts:3,pledgeId:'schedule-pledge'});
  });

  it('automatically charges a due schedule once and advances its occurrence', async () => {
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-19T12:00:00Z'));const db=new MockD1();databases.push(db);seedRecord(db,'recurringPayments','auto-schedule',{id:'auto-schedule',donorId:'auto-donor',amount:50,currency:'CAD',frequency:'monthly',method:'credit_card',nextDate:'2026-10-19',active:true,sourceAccountId:'bank',offsetAccountId:'revenue',paymentMethodIds:['auto-card'],retryDays:2,maxAttempts:2});db.database.exec('CREATE TABLE server_secrets (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at INTEGER NOT NULL)');db.database.prepare("INSERT INTO server_secrets VALUES('SOLA_API_KEY','server-key',1),('PAYMENT_METHOD_TOKEN:auto-card','card-token',1)").run();const gateway=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({xResult:'A',xRefNum:'recurring-ref'}),{status:200,headers:{'Content-Type':'application/json'}}));const app=new Hono();app.use('*',async(c,next)=>{c.set('userRoles',['administrator']);await next();});registerServerDataRoutes(app as any);
    const first=await app.request('/v3/automation/process-recurring',{method:'POST'},{DB:db} as any);expect(first.status).toBe(200);expect(await first.json()).toMatchObject({success:true,summary:{due:1,approved:1}});const schedule=JSON.parse(String((db.database.prepare("SELECT data FROM sync_records WHERE type='recurringPayments' AND id='auto-schedule'").get() as any).data));expect(schedule.nextDate).toBe('2026-11-19');const payment=JSON.parse(String((db.database.prepare("SELECT data FROM sync_records WHERE type='transactions'").get() as any).data));expect(payment).toMatchObject({type:'approved',scheduleId:'auto-schedule',scheduledDate:'2026-10-19',solaRef:'recurring-ref'});const second=await app.request('/v3/automation/process-recurring',{method:'POST'},{DB:db} as any);expect((await second.json() as any).summary.due).toBe(0);expect(gateway).toHaveBeenCalledTimes(1);
  });
});

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
    seedRecord(db, 'accounts', 'credit-1', { id: 'credit-1', name: 'Cash Returned', type: 'asset', currency: 'CAD' });
    seedRecord(db, 'accounts', 'expense-1', { id: 'expense-1', name: 'Office', type: 'expense', currency: 'CAD' });
    seedRecord(db, 'matchedBankTransactions', 'matchedBankTransactions', [], 1);
    const app = new Hono();
    app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'test-user'); c.set('userEmail', 'test@example.com'); await next(); });
    registerServerDataRoutes(app as any);
    const payload = { requestId: 'expense-request', action: 'expense', accountId: 'bank-1', bankTransactionId: 'bank-expense-1', bankDate: '2026-07-21', description: 'POS 123 OFFICE STORE', amount: 75, vendor: 'Correct Office Vendor', category: 'expense-1', internalCategory: 'Office records', taxable: true, projectId: 'project-1', creditAccountId: 'credit-1', memo: 'Office supplies', isPayrollExpense: false, t4aEligible: false };
    const response = await app.request('/v3/bank/match-outgoing', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'expense-request' }, body: JSON.stringify(payload) }, { DB: db } as any);
    expect(response.status).toBe(200);
    const bill: any = db.database.prepare("SELECT data FROM sync_records WHERE type='bills'").get();
    const billData = JSON.parse(String(bill.data));
    expect(billData.status).toBe('paid');
    expect(billData.bankTransactionId).toBe('bank-expense-1');
    expect(billData.projectId).toBe('project-1');
    expect(billData.creditAccountId).toBe('credit-1');
    expect(billData.internalCategory).toBe('Office records');
    expect(billData.memo).toBe('Office supplies');
    const match: any = db.database.prepare("SELECT data,revision FROM sync_records WHERE type='matchedBankTransactions'").get();
    expect(JSON.parse(String(match.data))).toContain('bank-expense-1');
    expect(Number(match.revision)).toBe(2);
    const ruleResponse = await app.request('/v3/bank/vendor-rule?description=%20pos%20%20123%20office%20store%20', {}, { DB: db } as any);
    const ruleBody: any = await ruleResponse.json();
    expect(ruleBody.rule).toMatchObject({ bankDescription: 'POS 123 OFFICE STORE', normalizedDescription: 'pos 123 office store', vendor: 'Correct Office Vendor', category: 'expense-1', internalCategory: 'Office records', taxable: true });
    const internalChoices: any = await (await app.request('/v3/internal-category-choices', {}, { DB: db } as any)).json();
    expect(internalChoices.items.map((item: any) => item.name)).toContain('Office records');
    expect(Number((db.database.prepare('SELECT COUNT(*) AS count FROM audit_log').get() as any).count)).toBe(3);
  });

  it('links an incoming bank refund to the original expense and reverses the expense amount', async()=>{
    const db=new MockD1();databases.push(db);
    seedRecord(db,'accounts','bank-refund',{id:'bank-refund',name:'Bank',type:'asset',currency:'CAD',plaidConnected:true});
    seedRecord(db,'accounts','expense-refund',{id:'expense-refund',name:'Supplies',type:'expense',currency:'CAD'});
    seedRecord(db,'matchedBankTransactions','matchedBankTransactions',[],1);
    seedRecord(db,'bills','original-expense',{id:'original-expense',vendor:'Supply Store',amount:100,currency:'CAD',dueDate:'2026-07-01',paidDate:'2026-07-01',status:'paid',category:'expense-refund',sourceAccountId:'bank-refund'},3);
    const app=new Hono();app.use('*',async(c,next)=>{c.set('userRoles',['administrator']);c.set('userId','test-user');c.set('userEmail','test@example.com');await next();});registerServerDataRoutes(app as any);
    const candidatesResponse=await app.request('/v3/bank/refund-candidates?accountId=bank-refund&amount=40',{}, {DB:db} as any);const candidates=await candidatesResponse.json() as any;expect(candidates.items[0]).toMatchObject({id:'original-expense',refundableAmount:100});
    const response=await app.request('/v3/bank/match-refund',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'refund-request'},body:JSON.stringify({requestId:'refund-request',accountId:'bank-refund',bankTransactionId:'bank-refund-transaction',bankDate:'2026-07-10',description:'Supply Store Refund',amount:40,billId:'original-expense',revision:3})},{DB:db} as any);
    expect(response.status).toBe(200);const body=await response.json() as any;expect(body.action).toBe('refund');
    const refund:any=db.database.prepare("SELECT data FROM sync_records WHERE type='bills' AND json_extract(data,'$.refundOfBillId')='original-expense'").get();expect(JSON.parse(String(refund.data))).toMatchObject({amount:-40,category:'expense-refund',sourceAccountId:'bank-refund',bankTransactionId:'bank-refund-transaction'});
    const match:any=db.database.prepare("SELECT data FROM sync_records WHERE type='matchedBankTransactions'").get();expect(JSON.parse(String(match.data))).toContain('bank-refund-transaction');
    const remainingResponse=await app.request('/v3/bank/refund-candidates?accountId=bank-refund&amount=61',{}, {DB:db} as any);expect((await remainingResponse.json() as any).items).toHaveLength(0);
  });

  it('lists registered and previously used vendors without duplicates', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'vendors', 'vendor-1', { id: 'vendor-1', name: 'Registered Vendor' });
    seedRecord(db, 'vendors', 'vendor-2', { id: 'vendor-2', name: 'Shared Vendor' });
    seedRecord(db, 'bills', 'bill-vendor-1', { id: 'bill-vendor-1', vendor: 'Historical Vendor', amount: 10 });
    seedRecord(db, 'bills', 'bill-vendor-2', { id: 'bill-vendor-2', vendor: 'Shared Vendor', amount: 20 });
    const app = new Hono();
    app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'test-user'); c.set('userEmail', 'test@example.com'); await next(); });
    registerServerDataRoutes(app as any);
    const response = await app.request('/v3/vendor-choices', {}, { DB: db } as any);
    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.items.map((item: any) => item.name)).toEqual(['Historical Vendor', 'Registered Vendor', 'Shared Vendor']);
  });

  it('searches and matches deposits using a user-selected payment date window', async()=>{
    const db=new MockD1();databases.push(db);seedRecord(db,'accounts','bank-custom',{id:'bank-custom',name:'Bank',type:'asset',currency:'CAD',plaidConnected:true});seedRecord(db,'matchedBankTransactions','matchedBankTransactions',[],1);seedRecord(db,'donors','custom-donor',{id:'custom-donor',name:'Custom Donor'});seedRecord(db,'transactions','custom-payment',{id:'custom-payment',donorId:'custom-donor',amount:55,amountCAD:55,date:'2026-06-01',type:'approved',method:'cash',currency:'CAD',sourceAccountId:'sys-undeposited-funds',depositStatus:'undeposited'});
    const app=new Hono();app.use('*',async(c,next)=>{c.set('userRoles',['administrator']);c.set('userId','test-user');c.set('userEmail','test@example.com');await next();});registerServerDataRoutes(app as any);
    const candidatesResponse=await app.request('/v3/bank/deposit-candidates?bankDate=2026-07-21&from=2026-06-01&to=2026-06-02',{}, {DB:db} as any);const candidates=await candidatesResponse.json() as any;expect(candidates.items).toHaveLength(1);expect(candidates.items[0].id).toBe('custom-payment');
    const matchResponse=await app.request('/v3/bank/match-deposit',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'custom-window-match'},body:JSON.stringify({requestId:'custom-window-match',accountId:'bank-custom',bankTransactionId:'custom-bank-deposit',bankDate:'2026-07-21',candidateFrom:'2026-06-01',candidateTo:'2026-06-02',description:'Deposit',amount:55,transactionIds:['custom-payment']})},{DB:db} as any);expect(matchResponse.status).toBe(200);
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

  it('links a credit-card deposit to the existing payment from a bank account',async()=>{
    const db=new MockD1();databases.push(db);seedRecord(db,'accounts','bank-pay',{id:'bank-pay',name:'Operating Bank',type:'asset',currency:'CAD',plaidConnected:true});seedRecord(db,'accounts','card-pay',{id:'card-pay',name:'Credit Card',type:'liability',currency:'CAD',plaidConnected:true});seedRecord(db,'matchedBankTransactions','matchedBankTransactions',['bank-outgoing-payment'],1);seedRecord(db,'accountTransfers','card-payment-transfer',{id:'card-payment-transfer',fromAccountId:'bank-pay',toAccountId:'old-card-record',amount:125,date:'2026-07-20',notes:'Card payment',bankTransactionId:'bank-outgoing-payment'},2);
    const app=new Hono();app.use('*',async(c,next)=>{c.set('userRoles',['administrator']);c.set('userId','test-user');c.set('userEmail','test@example.com');await next();});registerServerDataRoutes(app as any);
    const candidates=await app.request('/v3/bank/incoming-transfer-candidates?accountId=card-pay&amount=125&bankDate=2026-07-22',{}, {DB:db} as any);expect(candidates.status).toBe(200);expect((await candidates.json() as any).items[0].sourceName).toBe('Operating Bank');
    const response=await app.request('/v3/bank/match-incoming-transfer',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'incoming-card-payment'},body:JSON.stringify({requestId:'incoming-card-payment',accountId:'card-pay',bankTransactionId:'card-deposit-payment',amount:125,transferId:'card-payment-transfer',revision:2})},{DB:db} as any);expect(response.status).toBe(200);
    const transfer:any=db.database.prepare("SELECT data,revision FROM sync_records WHERE type='accountTransfers' AND id='card-payment-transfer'").get();expect(JSON.parse(String(transfer.data)).destinationBankTransactionId).toBe('card-deposit-payment');expect(JSON.parse(String(transfer.data)).toAccountId).toBe('card-pay');expect(Number(transfer.revision)).toBe(3);const matched:any=db.database.prepare("SELECT data FROM sync_records WHERE type='matchedBankTransactions' AND id='matchedBankTransactions'").get();expect(JSON.parse(String(matched.data))).toContain('card-deposit-payment');
  });

  it('finds an unmatched outgoing bank-feed payment and pairs it with the credit-card deposit',async()=>{
    const db=new MockD1();databases.push(db);seedRecord(db,'accounts','source-bank',{id:'source-bank',name:'Main Bank',type:'asset',currency:'CAD',plaidConnected:true});seedRecord(db,'accounts','target-card',{id:'target-card',name:'Visa Card',type:'liability',currency:'CAD',plaidConnected:true});seedRecord(db,'matchedBankTransactions','matchedBankTransactions',[],1);seedRecord(db,'bankFeedTransactions','source-bank:outgoing-card-payment',{id:'outgoing-card-payment',accountId:'source-bank',date:'2026-07-18',description:'VISA PAYMENT',amount:-225});seedRecord(db,'bankFeedTransactions','target-card:incoming-card-payment',{id:'incoming-card-payment',accountId:'target-card',date:'2026-07-20',description:'PAYMENT RECEIVED',amount:225});
    const app=new Hono();app.use('*',async(c,next)=>{c.set('userRoles',['administrator']);c.set('userId','test-user');c.set('userEmail','test@example.com');await next();});registerServerDataRoutes(app as any);
    const candidatesResponse=await app.request('/v3/bank/incoming-transfer-candidates?accountId=target-card&amount=225&bankDate=2026-07-20',{}, {DB:db} as any);const candidates=await candidatesResponse.json() as any;expect(candidates.items).toEqual(expect.arrayContaining([expect.objectContaining({candidateKind:'bankFeed',sourceBankTransactionId:'outgoing-card-payment'})]));
    const response=await app.request('/v3/bank/match-bank-feed-transfer-pair',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'pair-bank-card'},body:JSON.stringify({requestId:'pair-bank-card',accountId:'target-card',bankTransactionId:'incoming-card-payment',bankDate:'2026-07-20',amount:225,sourceAccountId:'source-bank',sourceBankTransactionId:'outgoing-card-payment'})},{DB:db} as any);expect(response.status).toBe(200);const transfer:any=db.database.prepare("SELECT data FROM sync_records WHERE type='accountTransfers'").get();const data=JSON.parse(String(transfer.data));expect(data.fromAccountId).toBe('source-bank');expect(data.toAccountId).toBe('target-card');expect(data.bankTransactionId).toBe('outgoing-card-payment');expect(data.destinationBankTransactionId).toBe('incoming-card-payment');const matched:any=db.database.prepare("SELECT data FROM sync_records WHERE type='matchedBankTransactions'").get();expect(JSON.parse(String(matched.data))).toEqual(expect.arrayContaining(['outgoing-card-payment','incoming-card-payment']));
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

  it('creates first-class campaigns and safely links pledges to them', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'donors', 'campaign-donor', { id: 'campaign-donor', name: 'Campaign Donor' });
    const app = new Hono(); app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'test-user'); c.set('userEmail', 'test@example.com'); await next(); }); registerServerDataRoutes(app as any);
    const campaignResponse = await app.request('/v3/records/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'campaign-create' }, body: JSON.stringify({ data: { id: 'campaign-2026', name: 'Campaign 2026', year: 2026, startDate: '2026-01-01', endDate: '2026-12-31', currency: 'CAD', status: 'active' } }) }, { DB: db } as any);
    expect(campaignResponse.status).toBe(201);
    const pledgeResponse = await app.request('/v3/records/pledges', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'campaign-pledge' }, body: JSON.stringify({ data: { id: 'campaign-pledge', donorId: 'campaign-donor', amount: 500, currency: 'CAD', date: '2026-02-01' } }) }, { DB: db } as any);
    expect(pledgeResponse.status).toBe(201);
    expect(JSON.parse((db.database.prepare("SELECT data FROM sync_records WHERE type='pledges' AND id='campaign-pledge'").get() as any).data).campaignId).toBe('campaign-2026');
    const deleteResponse = await app.request('/v3/records/campaigns/campaign-2026', { method: 'DELETE', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'campaign-delete' }, body: JSON.stringify({ revision: 1 }) }, { DB: db } as any);
    expect(deleteResponse.status).toBe(409);
    expect((await deleteResponse.json() as any).error).toContain('Close it instead');
  });

  it('organizes existing pledges into campaigns by pledge date without changing payments', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'campaigns', 'campaign-2025', { id: 'campaign-2025', name: 'Campaign 2025', year: 2025, startDate: '2025-01-01', endDate: '2025-12-31', currency: 'CAD', status: 'closed' });
    seedRecord(db, 'pledges', 'legacy-pledge', { id: 'legacy-pledge', donorId: 'donor-1', amount: 250, currency: 'CAD', date: '2025-06-15' });
    seedRecord(db, 'transactions', 'pledge-payment', { id: 'pledge-payment', donorId: 'donor-1', pledgeId: 'legacy-pledge', amount: 100, currency: 'CAD', date: '2025-07-01', type: 'approved' });
    const app = new Hono(); app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'test-user'); c.set('userEmail', 'test@example.com'); await next(); }); registerServerDataRoutes(app as any);
    const response = await app.request('/v3/campaigns/assign-pledges', { method: 'POST', headers: { 'Idempotency-Key': 'organize-campaigns' } }, { DB: db } as any);
    const body: any = await response.json();
    expect(response.status).toBe(200); expect(body).toMatchObject({ assigned: 1, unchanged: 0, unmatched: 0 });
    expect(JSON.parse((db.database.prepare("SELECT data FROM sync_records WHERE type='pledges' AND id='legacy-pledge'").get() as any).data).campaignId).toBe('campaign-2025');
    expect(JSON.parse((db.database.prepare("SELECT data FROM sync_records WHERE type='transactions' AND id='pledge-payment'").get() as any).data).pledgeId).toBe('legacy-pledge');
  });

  it('keeps one pledge follow-up reminder synchronized through create, edit, clear, and retry', async () => {
    const db=new MockD1();databases.push(db);seedRecord(db,'donors','reminder-donor',{id:'reminder-donor',name:'Reminder Donor'});const app=new Hono();app.use('*',async(c,next)=>{c.set('userRoles',['administrator']);c.set('userId','test-user');c.set('userEmail','test@example.com');await next();});registerServerDataRoutes(app as any);
    const createRequest=()=>app.request('/v3/records/pledges',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'pledge-reminder-create'},body:JSON.stringify({data:{id:'pledge-reminder',donorId:'reminder-donor',amount:300,currency:'CAD',date:'2026-07-01',followUpDate:'2026-07-15',followUpNote:'Ask about payment plan'}})},{DB:db} as any);expect((await createRequest()).status).toBe(201);expect((await createRequest()).status).toBe(200);
    let task:any=db.database.prepare("SELECT data,revision,is_deleted FROM sync_records WHERE type='tasks' AND id='pledge-follow-up-pledge-reminder'").get();expect(JSON.parse(task.data)).toMatchObject({donorId:'reminder-donor',dueDate:'2026-07-15',notes:'Ask about payment plan',linkedPledgeId:'pledge-reminder',completed:false});expect(Number(task.revision)).toBe(1);
    const edit=await app.request('/v3/records/pledges/pledge-reminder',{method:'PUT',headers:{'Content-Type':'application/json','Idempotency-Key':'pledge-reminder-edit'},body:JSON.stringify({revision:1,data:{followUpDate:'2026-07-20',followUpNote:'Call again'}})},{DB:db} as any);expect(edit.status).toBe(200);task=db.database.prepare("SELECT data,revision,is_deleted FROM sync_records WHERE type='tasks' AND id='pledge-follow-up-pledge-reminder'").get();expect(JSON.parse(task.data)).toMatchObject({dueDate:'2026-07-20',notes:'Call again',completed:false});expect(Number(task.revision)).toBe(2);expect(task.is_deleted).toBe(0);
    const clear=await app.request('/v3/records/pledges/pledge-reminder',{method:'PUT',headers:{'Content-Type':'application/json','Idempotency-Key':'pledge-reminder-clear'},body:JSON.stringify({revision:2,data:{followUpDate:'',followUpNote:''}})},{DB:db} as any);expect(clear.status).toBe(200);task=db.database.prepare("SELECT is_deleted FROM sync_records WHERE type='tasks' AND id='pledge-follow-up-pledge-reminder'").get();expect(task.is_deleted).toBe(1);expect(db.database.prepare("SELECT COUNT(*) AS count FROM sync_records WHERE type='tasks' AND id='pledge-follow-up-pledge-reminder'").get().count).toBe(1);
  });

  it('allows the live payment, bill, and account edit popups to save through revision-safe routes', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'transactions', 'editable-payment', { id: 'editable-payment', donorId: 'donor-1', amount: 20, currency: 'CAD', date: '2026-07-21' });
    seedRecord(db, 'bills', 'editable-bill', { id: 'editable-bill', vendor: 'Vendor', amount: 15, currency: 'CAD', dueDate: '2026-07-21', status: 'pending', category: 'expense-1' });
    seedRecord(db, 'accounts', 'expense-1', { id: 'expense-1', name: 'Office', type: 'expense', currency: 'CAD' });
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
    seedRecord(db, 'donors', 'donor-search-1', { id: 'donor-search-1', name: 'Sarah Smith', firstName: 'Sarah', lastName: 'Smith', hebFirstName: 'שרה', hebLastName: 'סמיט', phone: '555-0100', email: 'sarah@example.com', displayId: 'D-100' });
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
    const yiddishResponse=await app.request(`/v3/donors?limit=50&search=${encodeURIComponent('שרה')}`,{}, {DB:db} as any);const yiddish=await yiddishResponse.json() as any;
    expect(yiddishResponse.status).toBe(200);expect(yiddish.items[0]).toMatchObject({id:'donor-search-1',hebFirstName:'שרה'});
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
    const paymentAccounts=await (await app.request('/v3/accounts?limit=100&types=asset,liability&sort=name',{}, {DB:db} as any)).json() as any;
    expect(paymentAccounts.items.map((item:any)=>item.id)).toEqual(['asset-1']);
    expect(paymentAccounts.total).toBe(1);
    const ledgerResponse = await app.request('/v3/accounts/asset-1/ledger?limit=50', {}, { DB: db } as any);
    const ledger = await ledgerResponse.json() as any;
    expect(ledgerResponse.status).toBe(200);
    expect(ledger.items).toHaveLength(1);
    expect(ledger.items[0].recordType).toBe('transactions');
  });

  it('creates a payment routed to a project with its donor associations', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'donors', 'payment-donor', { id: 'payment-donor', name: 'Project Donor' });
    seedRecord(db, 'accounts', 'payment-bank', { id: 'payment-bank', name: 'Bank', type: 'asset', currency: 'CAD' });
    seedRecord(db, 'accounts', 'payment-revenue', { id: 'payment-revenue', name: 'Donations', type: 'revenue', currency: 'CAD' });
    seedRecord(db, 'projects', 'payment-project', { id: 'payment-project', name: 'Building Project' });
    seedRecord(db, 'projects', 'payment-project-2', { id: 'payment-project-2', name: 'School Project' });
    seedRecord(db, 'fundraisers', 'payment-fundraiser', { id: 'payment-fundraiser', name: 'Campaign' });
    seedRecord(db, 'pledges', 'payment-pledge', { id: 'payment-pledge', donorId: 'payment-donor', amount: 500, date: '2026-07-01', currency: 'CAD' });
    const app = new Hono(); app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'test-user'); c.set('userEmail', 'test@example.com'); await next(); }); registerServerDataRoutes(app as any);
    const response = await app.request('/v3/payments', { method:'POST', headers:{'Content-Type':'application/json','Idempotency-Key':'project-payment'}, body:JSON.stringify({requestId:'project-payment',donorId:'payment-donor',amount:75,currency:'CAD',method:'cash',date:'2026-07-22',sourceAccountId:'payment-bank',offsetAccountId:'payment-revenue',projectId:'payment-project',fundraiserId:'payment-fundraiser',pledgeId:'payment-pledge',sponsor:'Dinner'}) }, { DB:db } as any);
    const body = await response.json() as any;
    expect(response.status).toBe(201); expect(body.item).toMatchObject({projectId:'payment-project',fundraiserId:'payment-fundraiser',pledgeId:'payment-pledge'});
    const update=await app.request(`/v3/records/transactions/${body.item.id}`,{method:'PUT',headers:{'Content-Type':'application/json','Idempotency-Key':'change-payment-project'},body:JSON.stringify({revision:1,data:{projectId:'payment-project-2'}})},{DB:db} as any);const updated=await update.json() as any;
    expect(update.status).toBe(200);expect(updated.item.projectId).toBe('payment-project-2');
    const ledger = await app.request('/v3/projects/payment-project/ledger', {}, {DB:db} as any); const ledgerBody=await ledger.json() as any;
    expect(ledger.status).toBe(200); expect(ledgerBody.transactions).toHaveLength(0); expect(ledgerBody.income).toBe(0);
    const movedLedger=await app.request('/v3/projects/payment-project-2/ledger',{}, {DB:db} as any);const moved=await movedLedger.json() as any;expect(moved.transactions).toHaveLength(1);expect(moved.income).toBe(75);
  });

  it('holds a check outside account balances until its availability date and deposit', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'donors', 'check-donor', { id: 'check-donor', name: 'Check Donor' });
    seedRecord(db, 'accounts', 'check-bank', { id: 'check-bank', name: 'Main Bank', type: 'asset', currency: 'CAD' });
    seedRecord(db, 'accounts', 'check-revenue', { id: 'check-revenue', name: 'Donations', type: 'revenue', currency: 'CAD' });
    const app = new Hono(); app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'test-user'); c.set('userEmail', 'test@example.com'); await next(); }); registerServerDataRoutes(app as any);
    const create = await app.request('/v3/payments', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'future-check' }, body: JSON.stringify({ requestId: 'future-check', donorId: 'check-donor', amount: 125, currency: 'CAD', method: 'check', date: '2026-07-20', offsetAccountId: 'check-revenue', checkNumber: '1042', availabilityDate: '2026-08-01' }) }, { DB: db } as any);
    const created: any = await create.json(); expect(create.status).toBe(201); expect(created.item).toMatchObject({ type: 'pending', method: 'check', sourceAccountId: 'sys-undeposited-funds', depositStatus: 'undeposited', checkNumber: '1042', availabilityDate: '2026-08-01' });
    const reminder: any = db.database.prepare("SELECT data FROM sync_records WHERE type='tasks' AND json_extract(data,'$.linkedPaymentId')=?").get(created.item.id); expect(JSON.parse(reminder.data)).toMatchObject({ dueDate: '2026-08-01', completed: false, donorId: 'check-donor' });
    const early = await app.request(`/v3/payments/${created.item.id}/deposit-check`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'early-check-deposit' }, body: JSON.stringify({ revision: 1, accountId: 'check-bank', depositDate: '2026-07-31' }) }, { DB: db } as any); expect(early.status).toBe(409);
    const depositRequest = () => app.request(`/v3/payments/${created.item.id}/deposit-check`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'valid-check-deposit' }, body: JSON.stringify({ revision: 1, accountId: 'check-bank', depositDate: '2026-08-01' }) }, { DB: db } as any);
    const deposited = await depositRequest(); const depositedBody: any = await deposited.json(); expect(deposited.status).toBe(200); expect(depositedBody.item).toMatchObject({ type: 'approved', sourceAccountId: 'check-bank', depositStatus: 'deposited', depositDate: '2026-08-01' }); expect((await depositRequest()).status).toBe(200);
    const completedReminder: any = db.database.prepare("SELECT data FROM sync_records WHERE type='tasks' AND json_extract(data,'$.linkedPaymentId')=?").get(created.item.id); expect(JSON.parse(completedReminder.data)).toMatchObject({ completed: true });
  });

  it('retrieves an official USD rate and permanently records the selected rate provenance', async () => {
    const db=new MockD1();databases.push(db);seedRecord(db,'donors','usd-donor',{id:'usd-donor',name:'USD Donor'});seedRecord(db,'accounts','usd-bank',{id:'usd-bank',name:'USD Bank',type:'asset',currency:'USD'});seedRecord(db,'accounts','usd-revenue',{id:'usd-revenue',name:'Donations',type:'revenue',currency:'CAD'});
    vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(new Response(JSON.stringify({observations:[{d:'2026-07-17',FXUSDCAD:{v:'1.3725'}},{d:'2026-07-20',FXUSDCAD:{v:'1.3691'}}]}),{status:200,headers:{'Content-Type':'application/json'}}));
    const app=new Hono();app.use('*',async(c,next)=>{c.set('userRoles',['administrator']);c.set('userId','test-user');c.set('userEmail','test@example.com');await next();});registerServerDataRoutes(app as any);
    const quote=await app.request('/v3/exchange-rates/usd-cad?date=2026-07-20',{}, {DB:db} as any);const quoteBody:any=await quote.json();expect(quote.status).toBe(200);expect(quoteBody).toMatchObject({rate:1.3691,rateDate:'2026-07-20',source:'bank_of_canada',series:'FXUSDCAD'});
    const payment=await app.request('/v3/payments',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'usd-agreed-payment'},body:JSON.stringify({requestId:'usd-agreed-payment',donorId:'usd-donor',amount:100,currency:'USD',exchangeRate:1.4,exchangeRateSource:'agreed',exchangeRateDate:'2026-07-20',method:'cash',date:'2026-07-20',sourceAccountId:'usd-bank',offsetAccountId:'usd-revenue'})},{DB:db} as any);const paymentBody:any=await payment.json();expect(payment.status).toBe(201);expect(paymentBody.item).toMatchObject({amount:100,amountCAD:140,exchangeRate:1.4,exchangeRateSource:'agreed',exchangeRateDate:'2026-07-20'});
  });

  it('atomically splits one payment across multiple pledges and recalculates each balance', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'donors', 'split-donor', { id: 'split-donor', name: 'Split Donor' });
    seedRecord(db, 'accounts', 'split-bank', { id: 'split-bank', name: 'Bank', type: 'asset', currency: 'CAD' });
    seedRecord(db, 'accounts', 'split-revenue', { id: 'split-revenue', name: 'Donations', type: 'revenue', currency: 'CAD' });
    seedRecord(db, 'pledges', 'split-old', { id: 'split-old', donorId: 'split-donor', amount: 400, currency: 'CAD', date: '2025-01-01' });
    seedRecord(db, 'pledges', 'split-new', { id: 'split-new', donorId: 'split-donor', amount: 600, currency: 'CAD', date: '2026-01-01' });
    const app = new Hono(); app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'test-user'); c.set('userEmail', 'test@example.com'); await next(); }); registerServerDataRoutes(app as any);
    const response = await app.request('/v3/payments', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'split-payment' }, body: JSON.stringify({ requestId: 'split-payment', donorId: 'split-donor', amount: 500, currency: 'CAD', method: 'cash', date: '2026-02-01', sourceAccountId: 'split-bank', offsetAccountId: 'split-revenue', allocations: [{ pledgeId: 'split-old', amount: 200 }, { pledgeId: 'split-new', amount: 300 }] }) }, { DB: db } as any);
    expect(response.status).toBe(201);
    const created: any = await response.json(); expect(created.allocations).toHaveLength(2);
    expect(Number((db.database.prepare("SELECT COUNT(*) AS count FROM sync_records WHERE type='paymentAllocations' AND is_deleted=0").get() as any).count)).toBe(2);
    const choices: any = await (await app.request('/v3/donors/split-donor/pledge-choices?limit=100', {}, { DB: db } as any)).json();
    expect(choices.items.find((item: any) => item.id === 'split-old').paid).toBe(200);
    expect(choices.items.find((item: any) => item.id === 'split-new').paid).toBe(300);
    const changed = await app.request(`/v3/payments/${created.item.id}/allocations`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'split-reallocate' }, body: JSON.stringify({ revision: 1, allocations: [{ pledgeId: 'split-old', amount: 100 }, { pledgeId: 'split-new', amount: 400 }] }) }, { DB: db } as any);
    expect(changed.status).toBe(200);
    expect(Number((db.database.prepare("SELECT COUNT(*) AS count FROM sync_records WHERE type='paymentAllocations' AND is_deleted=0").get() as any).count)).toBe(2);
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
    expect(response.status).toBe(200); expect(body.total).toBe(1); expect(body.limit).toBe(50); expect(body.items[0]).toMatchObject({ id: 'task-high', donorName: 'Task Donor', priority: 'high' }); expect(body.summary).toEqual({ total: 2, pending: 1, high: 1, overdue: 1, dueToday: 0 });
  });

  it('loads a bounded read-only cloud audit history with filters', async () => {
    const db=new MockD1();databases.push(db);const app=new Hono();app.use('*',async(c,next)=>{c.set('userRoles',['administrator']);c.set('userId','audit-user');c.set('userEmail','audit@example.com');await next();});registerServerDataRoutes(app as any);const created=await app.request('/v3/records/accounts',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'audit-account-create'},body:JSON.stringify({data:{id:'audit-account',name:'Audit Account',type:'asset',currency:'CAD'}})},{DB:db} as any);expect(created.status).toBe(201);const response=await app.request('/v3/audit-history?recordType=accounts&action=insert&search=audit%20account&limit=50',{}, {DB:db} as any);const body:any=await response.json();expect(response.status).toBe(200);expect(body.total).toBe(1);expect(body.items[0]).toMatchObject({recordId:'audit-account',recordType:'accounts',action:'insert',changedByEmail:'audit@example.com'});expect(body.types.some((item:any)=>item.type==='accounts')).toBe(true);
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
    const dismissRequest = () => app.request('/v3/bank/feed-status', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'dismiss-plaid-1' }, body: JSON.stringify({ action: 'dismiss', accountId: 'bank-1', bankTransactionId: 'plaid-1' }) }, { DB: db } as any);
    expect((await dismissRequest()).status).toBe(200); expect((await dismissRequest()).status).toBe(200);
    const unmatchedAfterDismiss: any = await (await app.request('/v3/bank/feed?accountId=bank-1&matchStatus=unmatched', {}, { DB: db } as any)).json();
    const dismissed: any = await (await app.request('/v3/bank/feed?accountId=bank-1&matchStatus=dismissed', {}, { DB: db } as any)).json();
    expect(unmatchedAfterDismiss.items).toEqual([]); expect(dismissed.items[0]).toMatchObject({ id: 'plaid-1', reviewStatus: 'dismissed' });
    const restore = await app.request('/v3/bank/feed-status', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'restore-plaid-1' }, body: JSON.stringify({ action: 'restore', accountId: 'bank-1', bankTransactionId: 'plaid-1' }) }, { DB: db } as any);
    expect(restore.status).toBe(200);
    const unmatchedAfterRestore: any = await (await app.request('/v3/bank/feed?accountId=bank-1&matchStatus=unmatched', {}, { DB: db } as any)).json();
    const dismissedAfterRestore: any = await (await app.request('/v3/bank/feed?accountId=bank-1&matchStatus=dismissed', {}, { DB: db } as any)).json();
    expect(unmatchedAfterRestore.items[0]).toMatchObject({ id: 'plaid-1' }); expect(dismissedAfterRestore.items).toEqual([]);
    expect(Number((db.database.prepare("SELECT COUNT(*) AS count FROM sync_records WHERE type IN ('bills','transactions','accountTransfers')").get() as any).count)).toBe(0);
  });

  it('reopens the most recently synced bank and reports its saved transaction count', async () => {
    const db=new MockD1();databases.push(db);
    seedRecord(db,'accounts','older-bank',{id:'older-bank',name:'Older Bank',type:'asset',currency:'CAD',plaidConnected:true});
    seedRecord(db,'accounts','recent-bank',{id:'recent-bank',name:'Recent Bank',type:'asset',currency:'CAD',plaidConnected:true});
    seedRecord(db,'bankFeedTransactions','recent-bank:tx-1',{id:'tx-1',accountId:'recent-bank',date:'2026-07-22',description:'Saved',amount:10});
    db.database.prepare('CREATE TABLE plaid_tokens(account_id TEXT PRIMARY KEY,access_token TEXT NOT NULL)').run();
    db.database.prepare('INSERT INTO plaid_tokens(account_id,access_token) VALUES(?,?),(?,?)').run('older-bank','old-token','recent-bank','new-token');
    db.database.prepare('INSERT INTO sync_metadata(key,value,updated_at) VALUES(?,?,?),(?,?,?)').run('bank_sync:older-bank','{}',10,'bank_sync:recent-bank','{}',20);
    const app=new Hono();app.use('*',async(c,next)=>{c.set('userRoles',['administrator']);c.set('userId','test-user');c.set('userEmail','test@example.com');await next();});registerServerDataRoutes(app as any);
    const response=await app.request('/v3/bank/state',{}, {DB:db} as any);const body=await response.json() as any;
    expect(response.status).toBe(200);expect(body.accounts[0]).toMatchObject({id:'recent-bank',savedTransactionCount:1,lastBankSync:20});
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

  it('produces a read-only migration safety baseline without changing records', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'donors', 'safe-donor', { id: 'safe-donor', name: 'Safe Donor' });
    seedRecord(db, 'accounts', 'safe-bank', { id: 'safe-bank', name: 'Bank', type: 'asset', currency: 'CAD' });
    seedRecord(db, 'accounts', 'safe-revenue', { id: 'safe-revenue', name: 'Donations', type: 'revenue', currency: 'CAD' });
    seedRecord(db, 'transactions', 'safe-payment', { id: 'safe-payment', donorId: 'safe-donor', amount: 75, amountCAD: 75, currency: 'CAD', date: '2026-07-21', type: 'approved', method: 'cash', sourceAccountId: 'safe-bank', offsetAccountId: 'safe-revenue' });
    seedRecord(db, 'pledges', 'orphan-pledge', { id: 'orphan-pledge', donorId: 'missing-donor', amount: 100, currency: 'CAD', date: '2026-07-21' });
    const before = Number((db.database.prepare('SELECT COUNT(*) AS count FROM sync_records').get() as any).count);
    const app = new Hono(); app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); await next(); }); registerServerDataRoutes(app as any);
    const response = await app.request('/v3/system/data-safety', {}, { DB: db } as any);
    expect(response.status).toBe(200);
    const body: any = await response.json();
    expect(body.totals.approved).toBe(75);
    expect(body.issues.find((item: any) => item.code === 'pledge_missing_donor').count).toBe(1);
    expect(body.counts.find((item: any) => item.type === 'transactions').active).toBe(1);
    const detailsResponse = await app.request('/v3/system/data-safety/pledge_missing_donor?page=1&limit=25', {}, { DB: db } as any);
    const details: any = await detailsResponse.json();
    expect(detailsResponse.status).toBe(200); expect(details.total).toBe(1); expect(details.items[0]).toMatchObject({ id: 'orphan-pledge', type: 'pledges', data: { donorId: 'missing-donor', amount: 100 } });
    expect((await app.request('/v3/system/data-safety/not-a-check', {}, { DB: db } as any)).status).toBe(404);
    const repairRequest = () => app.request('/v3/system/data-safety/repair', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'repair-orphan-pledge' }, body: JSON.stringify({ code: 'pledge_missing_donor', id: 'orphan-pledge', revision: 1, changes: { donorId: 'safe-donor' }, reason: 'Confirmed donor during safety review.' }) }, { DB: db } as any);
    expect((await repairRequest()).status).toBe(200); expect((await repairRequest()).status).toBe(200);
    const repaired: any = db.database.prepare("SELECT data,revision FROM sync_records WHERE type='pledges' AND id='orphan-pledge'").get(); expect(JSON.parse(repaired.data).donorId).toBe('safe-donor'); expect(repaired.revision).toBe(2);
    expect(db.database.prepare("SELECT COUNT(*) AS count FROM audit_log WHERE record_type='pledges' AND record_id='orphan-pledge'").get().count).toBe(1);
    const afterRepair: any = await (await app.request('/v3/system/data-safety/pledge_missing_donor', {}, { DB: db } as any)).json(); expect(afterRepair.total).toBe(0);
    expect(Number((db.database.prepare('SELECT COUNT(*) AS count FROM sync_records').get() as any).count)).toBe(before);
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

  it('syncs a Sola range one day at a time and deduplicates saved references', async () => {
    const db=new MockD1();databases.push(db);seedRecord(db,'solaApiKey','solaApiKey','test-secret');const calls:string[]=[];vi.spyOn(globalThis,'fetch').mockImplementation(async(_input,init)=>{const request=JSON.parse(String(init?.body||'{}'));calls.push(request.xBeginDate);const day=String(request.xBeginDate).slice(0,10);const rows=day==='2026-07-01'?[{RefNum:'ref-a',Name:'Donor A',Date:'2026-07-01',Amount:'10',Status:'Approved'}]:day==='2026-07-02'?[{RefNum:'ref-a',Name:'Donor A',Date:'2026-07-01',Amount:'10',Status:'Approved'},{RefNum:'ref-b',Name:'Donor B',Date:'2026-07-02',Amount:'20',Status:'Approved'}]:[{RefNum:'ref-c',Name:'Donor C',Date:'2026-07-03',Amount:'30',Status:'Approved'}];return new Response(JSON.stringify({ReportData:rows,xRecordsReturned:rows.length,xReportingMaxTransactions:1000}),{status:200,headers:{'Content-Type':'application/json'}});});
    const app=new Hono();app.use('*',async(c,next)=>{c.set('userRoles',['administrator']);c.set('userId','test-user');c.set('userEmail','test@example.com');await next();});registerServerDataRoutes(app as any);const response=await app.request('/v3/sola/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({startDate:'2026-07-01',endDate:'2026-07-03'})},{DB:db} as any);const body:any=await response.json();expect(response.status).toBe(200);expect(calls).toEqual(['2026-07-01 00:00:00','2026-07-02 00:00:00','2026-07-03 00:00:00']);expect(body.sync).toMatchObject({count:3,daysRequested:3,complete:true,trigger:'manual'});expect(db.database.prepare("SELECT COUNT(*) AS count FROM sync_records WHERE type='solaTransactions' AND is_deleted=0").get().count).toBe(3);
  });

  it('reconciles the daily Sola report using saved donor mappings without duplicates', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-07-10T12:00:00Z'));
    const db=new MockD1();databases.push(db);seedRecord(db,'solaApiKey','solaApiKey','test-secret');
    seedRecord(db,'donors','daily-donor',{id:'daily-donor',name:'Daily Donor'});
    seedRecord(db,'solaDonorMappings','sola-map-daily',{solaName:'Daily Donor',donorId:'daily-donor'});
    seedRecord(db,'paymentExpectations','daily-expectation',{id:'daily-expectation',donorId:'daily-donor',amount:50,currency:'CAD',expectedDate:'2026-07-05',status:'due',pendingTransactionId:'daily-pending'});
    seedRecord(db,'transactions','daily-pending',{id:'daily-pending',donorId:'daily-donor',amount:50,amountCAD:50,currency:'CAD',method:'credit_card',date:'2026-07-05',type:'pending',expectationId:'daily-expectation'});
    vi.spyOn(globalThis,'fetch').mockImplementation(async(_input,init)=>{const request=JSON.parse(String(init?.body||'{}'));const day=String(request.xBeginDate).slice(0,10);const rows=day==='2026-07-06'?[{RefNum:'daily-match-ref',Name:'Daily Donor',Date:'2026-07-06',Amount:'50',Status:'Approved'}]:day==='2026-07-07'?[{RefNum:'daily-import-ref',Name:'Daily Donor',Date:'2026-07-07',Amount:'25',Status:'Approved'}]:[];return new Response(JSON.stringify({ReportData:rows,xRecordsReturned:rows.length,xReportingMaxTransactions:1000}),{status:200,headers:{'Content-Type':'application/json'}});});
    const app=new Hono();app.use('*',async(c,next)=>{c.set('userRoles',['administrator']);await next();});registerServerDataRoutes(app as any);
    const first=await app.request('/v3/automation/daily-sola',{method:'POST'},{DB:db} as any);const firstBody:any=await first.json();expect(first.status).toBe(200);expect(firstBody.reconciliation).toMatchObject({approvedFound:2,matched:1,imported:1,unmapped:0,ambiguous:0});
    const matched:any=db.database.prepare("SELECT data FROM sync_records WHERE type='transactions' AND id='daily-pending'").get();expect(JSON.parse(matched.data)).toMatchObject({type:'approved',solaRef:'daily-match-ref',scheduledDate:'2026-07-05',date:'2026-07-06'});
    const expectation:any=db.database.prepare("SELECT data FROM sync_records WHERE type='paymentExpectations' AND id='daily-expectation'").get();expect(JSON.parse(expectation.data)).toMatchObject({status:'fulfilled',solaRef:'daily-match-ref',paymentId:'daily-pending'});
    expect(db.database.prepare("SELECT COUNT(*) AS count FROM sync_records WHERE type='transactions' AND json_extract(data,'$.solaRef')='daily-import-ref'").get().count).toBe(1);
    expect(db.database.prepare("SELECT COUNT(*) AS count FROM sync_records WHERE type='processedSolaRefs'").get().count).toBe(2);
    const second=await app.request('/v3/automation/daily-sola',{method:'POST'},{DB:db} as any);const secondBody:any=await second.json();expect(secondBody.reconciliation).toMatchObject({approvedFound:0,matched:0,imported:0});expect(db.database.prepare("SELECT COUNT(*) AS count FROM sync_records WHERE type='transactions'").get().count).toBe(2);
  });

  it('moves overdue unmatched Sola expectations to declined follow-up only after a complete report', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-07-10T12:00:00Z'));
    const db=new MockD1();databases.push(db);seedRecord(db,'solaApiKey','solaApiKey','test-secret');seedRecord(db,'donors','missed-donor',{id:'missed-donor',name:'Missed Donor'});seedRecord(db,'paymentExpectations','missed-expectation',{id:'missed-expectation',donorId:'missed-donor',amount:80,currency:'CAD',expectedDate:'2026-07-05',status:'due',pendingTransactionId:'missed-pending',scheduleId:'missed-schedule'});seedRecord(db,'transactions','missed-pending',{id:'missed-pending',donorId:'missed-donor',amount:80,currency:'CAD',method:'credit_card',date:'2026-07-05',type:'pending',expectationId:'missed-expectation'});
    vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response(JSON.stringify({ReportData:[],xRecordsReturned:0,xReportingMaxTransactions:1000}),{status:200,headers:{'Content-Type':'application/json'}}));const app=new Hono();app.use('*',async(c,next)=>{c.set('userRoles',['administrator']);await next();});registerServerDataRoutes(app as any);
    const response=await app.request('/v3/automation/daily-sola',{method:'POST'},{DB:db} as any);const body:any=await response.json();expect(response.status).toBe(200);expect(body.reconciliation.declined).toBe(1);expect(JSON.parse((db.database.prepare("SELECT data FROM sync_records WHERE type='transactions' AND id='missed-pending'").get() as any).data)).toMatchObject({type:'declined'});expect(db.database.prepare("SELECT COUNT(*) AS count FROM sync_records WHERE type='tasks' AND id='declined-sola-missed-expectation'").get().count).toBe(1);
  });

  it('matches a saved Sola charge to an online transaction exactly once', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'solaTransactions', 'sola-ref-1', { ref: 'sola-ref-1', name: 'Jane Donor', date: '2026-07-27', amount: 50, status: 'Approved', last4: '1234', batch: 'batch-1' });
    seedRecord(db, 'dismissedSolaRefs', 'dismissedSolaRefs', []);
    seedRecord(db, 'solaDonorMappings', 'sola-map-jane%20donor', { id: 'sola-map-jane%20donor', solaName: 'Jane Donor', donorId: 'donor-sola' });
    seedRecord(db, 'donors', 'donor-sola', { id: 'donor-sola', name: 'Jane Donor', aliases: [] });
    seedRecord(db, 'paymentExpectations', 'expected-sola', { id: 'expected-sola', donorId: 'donor-sola', amount: 50, currency: 'CAD', expectedDate: '2026-07-01', status: 'due', pendingTransactionId: 'pending-sola' });
    seedRecord(db, 'transactions', 'pending-sola', { id: 'pending-sola', donorId: 'donor-sola', amount: 50, amountCAD: 50, currency: 'CAD', method: 'Credit Card', date: '2026-07-01', type: 'Pending', expectationId: 'expected-sola' });
    db.database.prepare("UPDATE sync_records SET is_deleted=1 WHERE (type='dismissedSolaRefs' AND id='dismissedSolaRefs') OR (type='solaDonorMappings' AND id='sola-map-jane%20donor')").run();
    for (let index = 0; index < 60; index++) seedRecord(db, 'transactions', `newer-pending-${index}`, { id: `newer-pending-${index}`, donorId: 'donor-sola', amount: 999, currency: 'CAD', method: 'credit_card', date: '2026-07-28', type: 'pending' });
    const app = new Hono(); app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'test-user'); c.set('userEmail', 'test@example.com'); await next(); }); registerServerDataRoutes(app as any);
    const viewResponse = await app.request('/v3/sola/view?startDate=2026-07-27&endDate=2026-07-31&limit=50', {}, { DB: db } as any); const view = await viewResponse.json() as any;
    expect(viewResponse.status).toBe(200); expect(view.autoMatches).toEqual([{ transactionId: 'pending-sola', solaRef: 'sola-ref-1' }]);
    const resolveRequest = () => app.request('/v3/sola/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'resolve-sola-1' }, body: JSON.stringify({ action: 'match', ref: 'sola-ref-1', transactionId: 'pending-sola', revision: 1 }) }, { DB: db } as any);
    expect((await resolveRequest()).status).toBe(200); expect((await resolveRequest()).status).toBe(200);
    const transaction: any = db.database.prepare("SELECT data,revision FROM sync_records WHERE type='transactions' AND id='pending-sola'").get(); const transactionData = JSON.parse(transaction.data);
    expect(transactionData).toMatchObject({ type: 'approved', solaBatchId: 'batch-1', sourceAccountId: 'sys-undeposited-funds' }); expect(transactionData.notes).toContain('sola-ref-1'); expect(Number(transaction.revision)).toBe(2);
    const expectation: any = db.database.prepare("SELECT data,revision FROM sync_records WHERE type='paymentExpectations' AND id='expected-sola'").get();
    expect(JSON.parse(expectation.data)).toMatchObject({ status: 'fulfilled', paymentId: 'pending-sola', solaRef: 'sola-ref-1' }); expect(Number(expectation.revision)).toBe(2);
    const mapping: any = db.database.prepare("SELECT data FROM sync_records WHERE type='solaDonorMappings'").get();
    expect(JSON.parse(mapping.data)).toMatchObject({ solaName: 'Jane Donor', donorId: 'donor-sola' });
    expect(db.database.prepare("SELECT is_deleted FROM sync_records WHERE type='solaDonorMappings' AND id='sola-map-jane%20donor'").get().is_deleted).toBe(0);
  });

  it('automatically proposes the only exact-amount pending payment before requiring donor selection',async()=>{
    const db=new MockD1();databases.push(db);seedRecord(db,'solaTransactions','sola-unique-amount',{ref:'sola-unique-amount',name:'Different Gateway Name',date:'2026-07-15',amount:88,status:'Approved'});seedRecord(db,'transactions','only-pending-88',{id:'only-pending-88',donorId:'donor-88',amount:88,amountCAD:88,currency:'CAD',method:'credit_card',date:'2026-07-14',type:'pending'});seedRecord(db,'donors','donor-88',{id:'donor-88',name:'Recorded Donor'});const app=new Hono();app.use('*',async(c,next)=>{c.set('userRoles',['administrator']);await next();});registerServerDataRoutes(app as any);const view=await (await app.request('/v3/sola/view?startDate=2026-07-01&endDate=2026-07-31&limit=50',{}, {DB:db} as any)).json() as any;expect(view.autoMatches).toEqual([{transactionId:'only-pending-88',solaRef:'sola-unique-amount',singleExactAmount:true}]);
  });

  it('permanently removes inactive Sola schedules from the saved matching inbox', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'solaScheduleInbox', 'inactive-sola-1', { scheduleId: 'inactive-sola-1', name: 'Old Schedule', active: false });
    seedRecord(db, 'solaScheduleInbox', 'active-sola-1', { scheduleId: 'active-sola-1', name: 'Current Schedule', active: true });
    const app = new Hono(); app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'test-user'); c.set('userEmail', 'test@example.com'); await next(); }); registerServerDataRoutes(app as any);
    const request = () => app.request('/v3/sola/schedules/remove-inactive', { method: 'POST', headers: { 'Idempotency-Key': 'remove-inactive-sola' } }, { DB: db } as any);
    const response = await request(); const body = await response.json() as any;
    expect(response.status).toBe(200); expect(body.removed).toBe(1); expect((await request()).status).toBe(200);
    const saved = await (await app.request('/v3/sola/schedules/saved-preview', {}, { DB: db } as any)).json() as any;
    expect(saved.items.map((item: any) => item.scheduleId)).toEqual(['active-sola-1']);
    const removed: any = db.database.prepare("SELECT value FROM sync_metadata WHERE key='sola_schedule_removed_ids'").get();
    expect(JSON.parse(removed.value)).toEqual(['inactive-sola-1']);
  });

  it('imports a Sola actual through the dedicated retry-safe payment action', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'solaTransactions', 'sola-import-ref', { ref: 'sola-import-ref', name: 'New Donor', date: '07/27/2026 12:00:00', amount: 75, status: 'Approved', batch: 'batch-new' });
    seedRecord(db, 'donors', 'sola-import-donor', { id: 'sola-import-donor', name: 'New Donor' });
    const app = new Hono(); app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'test-user'); c.set('userEmail', 'test@example.com'); await next(); }); registerServerDataRoutes(app as any);
    const request = () => app.request('/v3/sola/import-new', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'dedicated-sola-import' }, body: JSON.stringify({ ref: 'sola-import-ref', donorId: 'sola-import-donor' }) }, { DB: db } as any);
    const response = await request(); const body = await response.json() as any;
    expect(response.status).toBe(200); expect(body.item).toMatchObject({ donorId: 'sola-import-donor', amount: 75, date: '2026-07-27', type: 'approved', method: 'credit_card' });
    expect((await request()).status).toBe(200);
    const freshRetry = await app.request('/v3/sola/import-new', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'dedicated-sola-import-fresh-retry' }, body: JSON.stringify({ ref: 'sola-import-ref', donorId: 'sola-import-donor' }) }, { DB: db } as any);
    expect(freshRetry.status).toBe(200);
    expect(db.database.prepare("SELECT COUNT(*) AS count FROM sync_records WHERE type='transactions' AND json_extract(data,'$.notes') LIKE '%Ref: sola-import-ref'").get().count).toBe(1);
    expect(db.database.prepare("SELECT COUNT(*) AS count FROM sync_records WHERE type='processedSolaRefs' AND id='sola-import-ref' AND is_deleted=0").get().count).toBe(1);
    const refreshed = await (await app.request('/v3/sola/view?startDate=2026-07-01&endDate=2026-07-31&limit=50', {}, { DB: db } as any)).json() as any;
    expect(refreshed.sola).toEqual([]);
  });

  it('lists only approved Sola payments that still need pledge allocation', async () => {
    const db=new MockD1();databases.push(db);seedRecord(db,'donors','allocation-donor',{id:'allocation-donor',name:'Allocation Donor'});seedRecord(db,'transactions','unallocated-sola',{id:'unallocated-sola',donorId:'allocation-donor',amount:40,currency:'CAD',date:'2026-07-20',type:'approved',method:'credit_card',solaRef:'ref-unallocated'});seedRecord(db,'transactions','single-allocated-sola',{id:'single-allocated-sola',donorId:'allocation-donor',amount:50,currency:'CAD',date:'2026-07-20',type:'approved',method:'credit_card',solaRef:'ref-single',pledgeId:'pledge-one'});seedRecord(db,'transactions','split-allocated-sola',{id:'split-allocated-sola',donorId:'allocation-donor',amount:60,currency:'CAD',date:'2026-07-20',type:'approved',method:'credit_card',solaRef:'ref-split',pledgeAllocations:[{pledgeId:'pledge-one',amount:30},{pledgeId:'pledge-two',amount:30}]});
    const app=new Hono();app.use('*',async(c,next)=>{c.set('userRoles',['administrator']);await next();});registerServerDataRoutes(app as any);const response=await app.request('/v3/sola/unassigned?limit=50',{},{DB:db} as any);const body:any=await response.json();expect(response.status).toBe(200);expect(body.total).toBe(1);expect(body.items[0]).toMatchObject({id:'unallocated-sola',donorName:'Allocation Donor',solaRef:'ref-unallocated'});
  });

  it('materializes a due schedule once as pending verification without approving it', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-07-25T12:00:00Z'));
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'donors', 'scheduled-donor', { id: 'scheduled-donor', name: 'Scheduled Donor' });
    seedRecord(db, 'recurringPayments', 'schedule-safe', { id: 'schedule-safe', donorId: 'scheduled-donor', amount: 75, currency: 'CAD', frequency: 'monthly', nextDate: '2026-07-20', endDate: '2026-08-20', method: 'credit_card', active: true });
    seedRecord(db, 'recurringPayments', 'locally-charged-schedule', { id: 'locally-charged-schedule', donorId: 'scheduled-donor', amount: 25, currency: 'CAD', frequency: 'monthly', nextDate: '2026-07-20', method: 'credit_card', paymentMethodIds: ['saved-card'], active: true });
    const app = new Hono(); app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'test-user'); c.set('userEmail', 'test@example.com'); await next(); }); registerServerDataRoutes(app as any);
    const first = await app.request('/v3/schedules/process-due', { method: 'POST' }, { DB: db } as any); const firstBody = await first.json() as any;
    expect(first.status).toBe(200); expect(firstBody.created).toBe(1);
    const second = await app.request('/v3/schedules/process-due', { method: 'POST' }, { DB: db } as any); const secondBody = await second.json() as any;
    expect(second.status).toBe(200); expect(secondBody.created).toBe(0);
    const pending: any = db.database.prepare("SELECT data FROM sync_records WHERE type='transactions' AND id='scheduled-payment-schedule-safe-2026-07-20'").get();
    expect(JSON.parse(pending.data)).toMatchObject({ donorId: 'scheduled-donor', amount: 75, type: 'pending', method: 'credit_card', scheduleId: 'schedule-safe', expectationId: 'expected-payment-schedule-safe-2026-07-20' });
    const expectation: any = db.database.prepare("SELECT data FROM sync_records WHERE type='paymentExpectations' AND id='expected-payment-schedule-safe-2026-07-20'").get();
    expect(JSON.parse(expectation.data)).toMatchObject({ scheduleId: 'schedule-safe', donorId: 'scheduled-donor', amount: 75, expectedDate: '2026-07-20', status: 'due', pendingTransactionId: 'scheduled-payment-schedule-safe-2026-07-20' });
    expect(db.database.prepare("SELECT COUNT(*) AS count FROM sync_records WHERE type='paymentExpectations'").get().count).toBe(1);
    const schedule: any = db.database.prepare("SELECT data FROM sync_records WHERE type='recurringPayments' AND id='schedule-safe'").get();
    expect(JSON.parse(schedule.data)).toMatchObject({ nextDate: '2026-08-20', active: true });
    const locallyCharged: any = db.database.prepare("SELECT data FROM sync_records WHERE type='recurringPayments' AND id='locally-charged-schedule'").get();
    expect(JSON.parse(locallyCharged.data)).toMatchObject({ nextDate: '2026-07-20', paymentMethodIds: ['saved-card'] });
    expect(db.database.prepare("SELECT COUNT(*) AS count FROM sync_records WHERE type='transactions' AND json_extract(data,'$.scheduleId')='locally-charged-schedule'").get().count).toBe(0);
  });

  it('declines a pending payment and its linked expectation atomically', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'paymentExpectations', 'expected-decline', { id: 'expected-decline', donorId: 'decline-donor', amount: 90, currency: 'CAD', expectedDate: '2026-07-20', status: 'due', pendingTransactionId: 'pending-decline' });
    seedRecord(db, 'transactions', 'pending-decline', { id: 'pending-decline', donorId: 'decline-donor', amount: 90, currency: 'CAD', date: '2026-07-20', type: 'pending', method: 'credit_card', expectationId: 'expected-decline' });
    const app = new Hono(); app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'test-user'); c.set('userEmail', 'test@example.com'); await next(); }); registerServerDataRoutes(app as any);
    const request = () => app.request('/v3/payments/pending-decline/decline', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'decline-linked-expectation' }, body: JSON.stringify({ revision: 1, reason: 'No approved Sola charge was found.' }) }, { DB: db } as any);
    expect((await request()).status).toBe(200); expect((await request()).status).toBe(200);
    const payment: any = db.database.prepare("SELECT data,revision FROM sync_records WHERE type='transactions' AND id='pending-decline'").get();
    expect(JSON.parse(payment.data)).toMatchObject({ type: 'declined', declineReason: 'No approved Sola charge was found.' }); expect(Number(payment.revision)).toBe(2);
    const expectation: any = db.database.prepare("SELECT data,revision FROM sync_records WHERE type='paymentExpectations' AND id='expected-decline'").get();
    expect(JSON.parse(expectation.data)).toMatchObject({ status: 'declined', pendingTransactionId: 'pending-decline', declineReason: 'No approved Sola charge was found.' }); expect(Number(expectation.revision)).toBe(2);
  });

  it('saves the Sola schedule inbox and reloads it without another Sola request', async () => {
    const db = new MockD1(); databases.push(db); seedRecord(db, 'solaApiKey', 'solaApiKey', 'test-secret');
    seedRecord(db, 'donors', 'donor-jane', { id:'donor-jane',name:'Jane Donor',hebFirstName:'דזשיין',hebLastName:'דאָנאָר' });
    seedRecord(db, 'solaDonorMappings', 'sola-map-jane', { solaName: 'Jane Donor', donorId: 'donor-jane' });
    seedRecord(db, 'recurringPayments', 'sola-schedule-sch-1', { solaScheduleId: 'sch-1', donorId: 'donor-jane', amount: 75, active: true });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ Schedules: [{ ScheduleId: 'sch-1', BillName: 'Jane Donor', Amount: 75, Active: 'true', IntervalType: 'Monthly', StartDate: '2026-03-20', LastProjectedPaymentDate: '2027-02-20', TotalPayments: 12, PaymentsProcessed: 5 }, { ScheduleId: 'sch-2', BillName: 'John Donor', Amount: 25, Status: 'Active' }, { ScheduleId: 'sch-inactive', BillName: 'Old Donor', Amount: 50, Active: 'false' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const app = new Hono(); app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); await next(); }); registerServerDataRoutes(app as any);
    const response = await app.request('/v3/sola/schedules/preview', { method: 'POST' }, { DB: db } as any); const body = await response.json() as any;
    expect(response.status).toBe(200); expect(body).toMatchObject({ success: true, count: 3 }); expect(body.items[0]).toMatchObject({ scheduleId: 'sch-1', name: 'Jane Donor', amount: 75, active: true, endDate: '2027-02-20', totalPayments: 12, paymentsProcessed: 5, paymentsRemaining: 7, matchedDonorId: 'donor-jane', imported: true }); expect(body.items[1]).toMatchObject({ scheduleId: 'sch-2', active: true, imported: false }); expect(body.items[2]).toMatchObject({ scheduleId: 'sch-inactive', active: false });
    expect(db.database.prepare("SELECT COUNT(*) AS count FROM sync_records WHERE type='solaScheduleInbox'").get().count).toBe(3);
    const savedResponse=await app.request('/v3/sola/schedules/saved-preview',{}, {DB:db} as any);const saved=await savedResponse.json() as any;expect(savedResponse.status).toBe(200);expect(saved.items).toHaveLength(3);expect(saved.items[0]).toMatchObject({scheduleId:'sch-1',matchedDonorId:'donor-jane',matchedDonorName:'Jane Donor · דזשיין דאָנאָר',imported:true});expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0]; expect((options?.headers as any).Authorization).toBe('test-secret'); expect((options?.headers as any)['X-Recurring-Api-Version']).toBe('2.1'); expect(JSON.parse(String(options?.body))).toMatchObject({ SortOrder: 'Descending', Filters: { IsDeleted: false } }); expect(JSON.parse(String(options?.body)).Filters).not.toHaveProperty('Active');
  });

  it('imports active Sola schedules by exact donor name and remembers the donor mapping', async () => {
    const db = new MockD1(); databases.push(db); seedRecord(db, 'donors', 'donor-jane', { id: 'donor-jane', firstName: 'Jane', lastName: 'Donor', name: 'Jane Donor' });
    const app = new Hono(); app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'tester'); c.set('userEmail', 'tester@example.com'); await next(); }); registerServerDataRoutes(app as any);
    const schedules = [{ scheduleId: 'sch-active', name: 'Jane Donor', amount: 75, active: true, frequency: 'Monthly', nextDate: '2026-08-20', endDate: '2027-02-20' }, { scheduleId: 'sch-inactive', name: 'Jane Donor', amount: 25, active: false, frequency: 'Monthly', nextDate: '2026-08-20' }, { scheduleId: 'sch-unknown', name: 'Unknown Person', amount: 10, active: true, frequency: 'Monthly', nextDate: '2026-08-20' }];
    const response = await app.request('/v3/sola/schedules/import', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'import-schedules-1' }, body: JSON.stringify({ schedules }) }, { DB: db } as any); const body = await response.json() as any;
    expect(response.status).toBe(200); expect(body.counts).toMatchObject({ imported: 1, inactive: 1, unmatched: 1 });
    const schedule: any = db.database.prepare("SELECT data FROM sync_records WHERE type='recurringPayments' AND id='sola-schedule-sch-active'").get(); expect(JSON.parse(schedule.data)).toMatchObject({ donorId: 'donor-jane', solaScheduleId: 'sch-active', active: true, amount: 75 });
    const mapping: any = db.database.prepare("SELECT data FROM sync_records WHERE type='solaDonorMappings'").get(); expect(JSON.parse(mapping.data)).toMatchObject({ solaName: 'Jane Donor', donorId: 'donor-jane' });
  });

  it('uses a selected donor ID for duplicate Sola names and remembers it', async () => {
    const db = new MockD1(); databases.push(db);
    seedRecord(db, 'donors', 'donor-first', { id: 'donor-first', name: 'Same Name' });
    seedRecord(db, 'donors', 'donor-second', { id: 'donor-second', name: 'Same Name' });
    const app = new Hono(); app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); await next(); }); registerServerDataRoutes(app as any);
    const schedule = { scheduleId: 'duplicate-name', name: 'Same Name', donorId: 'donor-second', amount: 40, active: true, frequency: 'Monthly', nextDate: '2026-08-20', paymentsRemaining: 4, totalPayments: 12 };
    const response = await app.request('/v3/sola/schedules/import', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'selected-donor-import' }, body: JSON.stringify({ schedules: [schedule] }) }, { DB: db } as any);
    expect(response.status).toBe(200);
    const saved: any = db.database.prepare("SELECT data FROM sync_records WHERE type='recurringPayments' AND id='sola-schedule-duplicate-name'").get();
    expect(JSON.parse(saved.data)).toMatchObject({ donorId: 'donor-second', paymentsRemaining: 4, totalPayments: 12, endDate: '2026-11-20' });
    const mapping: any = db.database.prepare("SELECT data FROM sync_records WHERE type='solaDonorMappings'").get();
    expect(JSON.parse(mapping.data)).toMatchObject({ solaName: 'Same Name', donorId: 'donor-second' });
    const refresh = await app.request('/v3/sola/schedules/import', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'selected-donor-refresh' }, body: JSON.stringify({ schedules: [{ ...schedule, paymentsRemaining: 6 }] }) }, { DB: db } as any); const refreshedBody = await refresh.json() as any;
    expect(refresh.status).toBe(200); expect(refreshedBody.counts.existing).toBe(1); const refreshed: any = db.database.prepare("SELECT data,revision FROM sync_records WHERE type='recurringPayments' AND id='sola-schedule-duplicate-name'").get(); expect(refreshed.revision).toBe(2); expect(JSON.parse(refreshed.data).endDate).toBe('2027-01-20');
  });

  it('restores a previously deleted Sola schedule instead of inserting its key again', async () => {
    const db = new MockD1(); databases.push(db); seedRecord(db, 'donors', 'restore-donor', { id: 'restore-donor', name: 'Restore Donor' });
    seedRecord(db, 'recurringPayments', 'sola-schedule-restore-me', { id: 'sola-schedule-restore-me', donorId: 'restore-donor', solaScheduleId: 'restore-me', amount: 10, active: true });
    db.database.prepare("UPDATE sync_records SET is_deleted=1,revision=2 WHERE type='recurringPayments' AND id='sola-schedule-restore-me'").run();
    const app = new Hono(); app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); await next(); }); registerServerDataRoutes(app as any);
    const schedule = { scheduleId: 'restore-me', name: 'Restore Donor', amount: 25, active: true, frequency: 'Monthly', nextDate: '2026-08-20' };
    const response = await app.request('/v3/sola/schedules/import', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'restore-schedule-import' }, body: JSON.stringify({ schedules: [schedule] }) }, { DB: db } as any);
    expect(response.status).toBe(200);
    const saved: any = db.database.prepare("SELECT data,revision,is_deleted FROM sync_records WHERE type='recurringPayments' AND id='sola-schedule-restore-me'").get();
    expect(saved).toMatchObject({ revision: 3, is_deleted: 0 }); expect(JSON.parse(saved.data).amount).toBe(25);
  });

  it('soft deletes every CharityPro schedule without touching Sola', async () => {
    const db = new MockD1(); databases.push(db); seedRecord(db, 'recurringPayments', 'schedule-1', { id: 'schedule-1', donorId: 'donor-1', amount: 10, nextDate: '2026-08-01', active: true }); seedRecord(db, 'recurringPayments', 'schedule-2', { id: 'schedule-2', donorId: 'donor-2', amount: 20, nextDate: '2026-08-01', active: false });
    const app = new Hono(); app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userId', 'tester'); c.set('userEmail', 'tester@example.com'); await next(); }); registerServerDataRoutes(app as any);
    const response = await app.request('/v3/schedules', { method: 'DELETE', headers: { 'Idempotency-Key': 'delete-schedules-1' } }, { DB: db } as any); const body = await response.json() as any;
    expect(response.status).toBe(200); expect(body).toMatchObject({ success: true, deleted: 2 }); expect((db.database.prepare("SELECT COUNT(*) AS count FROM sync_records WHERE type='recurringPayments' AND is_deleted=0").get() as any).count).toBe(0);
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
