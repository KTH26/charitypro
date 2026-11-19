// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { bankSyncStartDate, buildBankFeedSaveStatements, registerServerDataRoutes, creditCardCycle, loanReminders, buildReminderDigest } from '../functions/api/server-data';
import { loadGift } from '../functions/api/receipts';
import { buildReportRows } from '../functions/api/report-data';

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
  seed(db, 'accounts', 'visa', { name: 'Visa Card', type: 'liability', subType: 'credit_card', currency: 'CAD', statementDay: 24, paymentDueDay: 15 });
  seed(db, 'accounts', 'amex', { name: 'Amex', type: 'liability', subType: 'credit_card', currency: 'CAD' });
  seed(db, 'accounts', 'supplies', { name: 'Supplies', type: 'expense', currency: 'CAD' });
  seed(db, 'donors', 'd1', { name: 'Moshe Cohen', phone: '514-555-0100', address: '1 Main St', city: 'Boisbriand' });
  seed(db, 'fundraisers', 'f1', { name: 'Yossi', percentage: 10 });
  seed(db, 'campaigns', 'c1', { name: 'Winter 2026' });
  const app = new Hono();
  app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userEmail', 'tester@example.com'); await next(); });
  registerServerDataRoutes(app as any);
  const call = async (method: string, path: string, body?: any) => {
    const response = await app.request(path, { method, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, ...(body ? { body: JSON.stringify(body) } : {}) }, { DB: db } as any);
    return { status: response.status, body: await response.json() as any };
  };
  const charge = (amount: number, date: string) => call('POST', '/v3/bills', { requestId: crypto.randomUUID(), vendor: `Store ${amount}`, amount, dueDate: date, paidDate: date, status: 'paid', category: 'supplies', sourceAccountId: 'visa' });
  return { db, call, charge };
};

describe('credit card cycle', () => {
  it('statement Nov 24, due Dec 15: Oct 25 to Nov 24 is due Dec 15', () => {
    expect(creditCardCycle(24, 15, '2026-11-20')).toEqual({ dueDate: '2026-12-15', statementDate: '2026-11-24', periodStart: '2026-10-25' });
  });
  it('before the 15th, the next due date is this month', () => {
    expect(creditCardCycle(24, 15, '2026-11-10')).toEqual({ dueDate: '2026-11-15', statementDate: '2026-10-24', periodStart: '2026-09-25' });
    expect(creditCardCycle(24, 15, '2026-11-15').dueDate).toBe('2026-11-15');
  });
  it('the day after the due date moves to next month', () => {
    expect(creditCardCycle(24, 15, '2026-11-16').dueDate).toBe('2026-12-15');
  });
  it('handles short months, year end, and due days after the statement day', () => {
    expect(creditCardCycle(31, 20, '2026-03-01')).toEqual({ dueDate: '2026-03-20', statementDate: '2026-02-28', periodStart: '2026-02-01' });
    expect(creditCardCycle(1, 25, '2026-05-26')).toEqual({ dueDate: '2026-06-25', statementDate: '2026-06-01', periodStart: '2026-05-02' });
    expect(creditCardCycle(24, 15, '2026-12-20')).toEqual({ dueDate: '2027-01-15', statementDate: '2026-12-24', periodStart: '2026-11-25' });
  });
});

describe('credit cards due', () => {
  it('shows the amount charged in the statement period, minus payments', async () => {
    const { call, charge } = setup();
    await charge(100, '2026-10-20'); // previous statement, due Nov 15
    await charge(200, '2026-10-30'); // Oct 25 - Nov 24, due Dec 15
    await charge(50, '2026-11-24');  // last day of the period
    await charge(70, '2026-11-25');  // next period, due Jan 15
    let result = await call('GET', '/v3/credit-cards-due?today=2026-11-10');
    let visa = result.body.items.find((item: any) => item.id === 'visa');
    expect(visa).toMatchObject({ dueDate: '2026-11-15', amountDue: 100 });
    result = await call('GET', '/v3/credit-cards-due?today=2026-11-26');
    visa = result.body.items.find((item: any) => item.id === 'visa');
    // Only this statement's charges count; the earlier bill is separate.
    expect(visa).toMatchObject({ dueDate: '2026-12-15', statementDate: '2026-11-24', periodCharges: 250, amountDue: 250 });
    // Paid the November bill (100) on Nov 14, during this period: it was for the previous bill, so December still owes 250.
    const paid = await call('POST', '/v3/records/accountTransfers', { data: { fromAccountId: 'bmo', toAccountId: 'visa', amount: 100, date: '2026-11-14' } });
    expect(paid.body.error || '').toBe('');
    expect(paid.body.success).toBe(true);
    result = await call('GET', '/v3/credit-cards-due?today=2026-11-26');
    visa = result.body.items.find((item: any) => item.id === 'visa');
    expect(visa.amountDue).toBe(250);
    expect(result.body.items.find((item: any) => item.id === 'amex').needsSetup).toBe(true);
  });

  it('rejects a statement day that is not a day of the month', async () => {
    const { call } = setup();
    const bad = await call('POST', '/v3/records/accounts', { data: { name: 'MC', type: 'liability', subType: 'credit_card', statementDay: 40, paymentDueDay: 15 } });
    expect(bad.status).toBe(400);
    const good = await call('POST', '/v3/records/accounts', { data: { name: 'MC', type: 'liability', subType: 'credit_card', statementDay: '24', paymentDueDay: 15 } });
    expect(good.status).toBe(201);
    expect(good.body.item.statementDay).toBe(24);
  });
});

describe('call tracker', () => {
  const contact = (call: any, body: any) => call('POST', '/v3/donor-contacts', { donorId: 'd1', date: '2026-11-12', fundraiserId: 'f1', campaignId: 'c1', requestId: crypto.randomUUID(), ...body });

  it('saves a call and lists it with the donor name, also in the donor profile', async () => {
    const { call } = setup();
    const saved = await contact(call, { outcome: 'Declined', notes: 'Not this year' });
    expect(saved.status).toBe(201);
    const list = await call('GET', '/v3/donor-contacts');
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({ donorName: 'Moshe Cohen', fundraiserName: 'Yossi', campaignName: 'Winter 2026', outcome: 'Declined', notes: 'Not this year' });
    const profile = await call('GET', '/v3/donors/d1/profile');
    expect(profile.body.contacts).toHaveLength(1);
  });

  it('allows no notes for No answer but needs notes otherwise', async () => {
    const { call } = setup();
    expect((await contact(call, { outcome: 'No answer' })).status).toBe(201);
    expect((await contact(call, { outcome: 'Declined' })).status).toBe(400);
  });

  it('call back needs a date and makes a reminder for the fundraiser', async () => {
    const { call } = setup();
    expect((await contact(call, { outcome: 'Call back', notes: 'Busy now' })).status).toBe(400);
    const saved = await contact(call, { outcome: 'Call back', notes: 'Busy now', followUpDate: '2026-11-20' });
    expect(saved.status).toBe(201);
    expect(saved.body.task).toMatchObject({ dueDate: '2026-11-20', fundraiserId: 'f1', title: 'Call back Moshe Cohen (Yossi)' });
    const tasks = await call('GET', '/v3/tasks?status=pending');
    expect(tasks.body.items.some((task: any) => task.dueDate === '2026-11-20')).toBe(true);
  });

  it('pick up goes on the pickup list until it is marked done', async () => {
    const { call } = setup();
    const saved = await contact(call, { outcome: 'Pick up', notes: 'Come Sunday', pickupDate: '2026-11-15', pickupAmount: '180', pickupAddress: '1 Main St' });
    expect(saved.status).toBe(201);
    let pickups = await call('GET', '/v3/pickups');
    expect(pickups.body.items).toHaveLength(1);
    expect(pickups.body.items[0]).toMatchObject({ donorName: 'Moshe Cohen', pickupAmount: 180, pickupStatus: 'open' });
    const done = await call('PUT', `/v3/records/donorContacts/${saved.body.item.id}`, { revision: 1, data: { pickupStatus: 'done' } });
    expect(done.status).toBe(200);
    pickups = await call('GET', '/v3/pickups');
    expect(pickups.body.items).toHaveLength(0);
  });

  it('can be linked to a pledge', async () => {
    const { call } = setup();
    const pledge = await call('POST', '/v3/records/pledges', { data: { donorId: 'd1', amount: 1800, currency: 'CAD', date: '2026-11-12', campaignId: 'c1', fundraiserAllocations: [{ fundraiserId: 'f1', percentage: 10 }] } });
    expect(pledge.status).toBe(201);
    const saved = await contact(call, { outcome: 'Pledged', notes: '1800 for the winter', pledgeId: pledge.body.item.id });
    expect(saved.status).toBe(201);
    expect(saved.body.item.pledgeId).toBe(pledge.body.item.id);
  });
});

describe('account transactions search', () => {
  it('finds entries by vendor, donor name, other account, amount, and date range', async () => {
    const { call, charge } = setup();
    await charge(45.5, '2026-10-03');
    await call('POST', '/v3/bills', { requestId: crypto.randomUUID(), vendor: 'Hydro Quebec', amount: 120, dueDate: '2026-10-10', paidDate: '2026-10-10', status: 'paid', category: 'supplies', sourceAccountId: 'bmo' });
    await call('POST', '/v3/records/accountTransfers', { data: { fromAccountId: 'bmo', toAccountId: 'visa', amount: 300, date: '2026-10-15' } });
    await call('POST', '/v3/records/transactions', { data: { type: 'approved', donorId: 'd1', amount: 180, currency: 'CAD', date: '2026-10-20', method: 'cash', sourceAccountId: 'bmo', offsetAccountId: 'supplies' } });
    const ids = async (query: string) => (await call('GET', '/v3/accounts/bmo/ledger?limit=50' + query)).body;
    expect((await ids('')).total).toBe(3);
    expect((await ids('&search=hydro')).items.map((item: any) => item.vendor)).toEqual(['Hydro Quebec']);
    const donor = await ids('&search=moshe');
    expect(donor.items).toHaveLength(1);
    expect(donor.items[0]).toMatchObject({ donorName: 'Moshe Cohen', amount: 180 });
    const transfer = await ids('&search=visa');
    expect(transfer.items).toHaveLength(1);
    expect(transfer.items[0]).toMatchObject({ recordType: 'accountTransfers', otherAccountName: 'Visa Card' });
    expect((await ids('&search=120')).items).toHaveLength(1);
    expect((await ids('&from=2026-10-12&to=2026-10-31')).total).toBe(2);
    expect((await ids('&search=nothing-like-this')).total).toBe(0);
  });
});

describe('expense dates and deleting accounts', () => {
  it('a paid expense uses the date entered, and changing the date moves it', async () => {
    const { call } = setup();
    const saved = await call('POST', '/v3/bills', { requestId: crypto.randomUUID(), vendor: 'Hydro', amount: 80, dueDate: '2026-09-02', status: 'paid', category: 'supplies', sourceAccountId: 'bmo' });
    expect(saved.status).toBe(201);
    expect(saved.body.item.paidDate).toBe('2026-09-02');
    let ledger = (await call('GET', '/v3/accounts/bmo/ledger')).body.items;
    expect(ledger[0].paidDate).toBe('2026-09-02');
    const edited = await call('PUT', `/v3/records/bills/${saved.body.item.id}`, { revision: saved.body.item.revision, data: { dueDate: '2026-08-30' } });
    expect(edited.status).toBe(200);
    ledger = (await call('GET', '/v3/accounts/bmo/ledger?from=2026-08-30&to=2026-08-30')).body.items;
    expect(ledger).toHaveLength(1);
  });

  it('an unused credit card can be deleted and leaves the credit cards box; a used one cannot', async () => {
    const { call, charge, db } = setup();
    const revision = (id: string) => Number((db.database.prepare("SELECT revision FROM sync_records WHERE type='accounts' AND id=?").get(id) as any).revision);
    expect((await call('DELETE', '/v3/records/accounts/amex', { revision: revision('amex') })).status).toBe(200);
    const cards = (await call('GET', '/v3/credit-cards-due?today=2026-11-12')).body.items.map((item: any) => item.id);
    expect(cards).not.toContain('amex');
    await charge(25, '2026-11-01');
    const blocked = await call('DELETE', '/v3/records/accounts/visa', { revision: revision('visa') });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toContain('1 bill');
  });
});

describe('bank feed on a connected credit card', () => {
  it('records a card charge as an expense, a refund, and a payment, and the card balance follows', async () => {
    const { db, call } = setup();
    seed(db, 'accounts', 'amexfeed', { name: 'Amex', type: 'liability', subType: 'credit_card', currency: 'CAD', plaidConnected: true, statementDay: 24, paymentDueDay: 15 });
    db.database.prepare("INSERT INTO sync_records(id,type,data,updated_at,revision,is_deleted) VALUES('matchedBankTransactions','matchedBankTransactions','[]',1,1,0)").run();
    const outgoing = (key: string, extra: any) => call('POST', '/v3/bank/match-outgoing', { requestId: key, accountId: 'amexfeed', bankDate: '2026-11-11', description: 'GOOGLE SERVICES', ...extra });
    const expense = await outgoing('card-exp', { action: 'expense', bankTransactionId: 'amex-1', amount: 2, vendor: 'GOOGLE SERVICES', category: 'supplies', taxable: true });
    expect(expense.status).toBe(200);
    expect(expense.body.item).toMatchObject({ sourceAccountId: 'amexfeed', amount: 2, paidDate: '2026-11-11' });
    const transferOut = await outgoing('card-cash', { action: 'transfer', bankTransactionId: 'amex-2', amount: 50, targetAccountId: 'bmo' });
    expect(transferOut.status).toBe(200);
    const refund = await call('POST', '/v3/bank/match-refund', { requestId: 'card-refund', accountId: 'amexfeed', bankTransactionId: 'amex-3', bankDate: '2026-11-12', description: 'GOOGLE REFUND', amount: 2, bills: [{ billId: expense.body.item.id, revision: 1 }] });
    expect(refund.status).toBe(200);
    // Charges 2 + 50, refund -2: the card owes 50.
    const card = (await call('GET', '/v3/credit-cards-due?today=2026-11-26')).body.items.find((item: any) => item.id === 'amexfeed');
    expect(card.balance).toBe(50);
  });
});

describe('bank feed quick match', () => {
  it('suggests last time\'s match (also when the bank adds a tag like [DS]), prefers a bill already entered, and saves only when asked', async () => {
    const { db, call } = setup();
    seed(db, 'accounts', 'amexfeed', { name: 'Amex', type: 'liability', subType: 'credit_card', currency: 'CAD', plaidConnected: true, statementDay: 24, paymentDueDay: 15 });
    db.database.prepare("INSERT INTO sync_records(id,type,data,updated_at,revision,is_deleted) VALUES('matchedBankTransactions','matchedBankTransactions','[]',1,1,0)").run();
    const first = await call('POST', '/v3/bank/match-outgoing', { requestId: 'fid-1', action: 'expense', accountId: 'amexfeed', bankTransactionId: 'fid-oct', bankDate: '2026-10-13', description: '[DS]FIDELITY PAYMEN BUS/ENT', amount: 13.62, vendor: 'Fidelity', category: 'supplies', internalCategory: 'Bank fees', taxable: false });
    expect(first.status).toBe(200);
    seed(db, 'bills', 'phone-bill', { vendor: 'Bell', amount: 80, currency: 'CAD', dueDate: '2026-11-05', status: 'unpaid' });
    const billsBefore = db.database.prepare("SELECT COUNT(*) AS count FROM sync_records WHERE type='bills'").get().count;
    const found = await call('POST', '/v3/bank/quick-suggestions', { accountId: 'amexfeed', items: [
      { id: 'fid-nov', description: 'FIDELITY PAYMEN BUS/ENT', amount: -15.46 },
      { id: 'bell-nov', description: 'BELL CANADA 4455', amount: -80 },
      { id: 'unknown', description: 'SOMETHING NEW', amount: -9 },
      { id: 'money-in', description: 'FIDELITY PAYMEN BUS/ENT', amount: 20 },
    ] });
    expect(found.status).toBe(200);
    expect(found.body.suggestions['fid-nov']).toMatchObject({ kind: 'expense', vendor: 'Fidelity', category: 'supplies', internalCategory: 'Bank fees', sameWording: false });
    expect(found.body.suggestions['bell-nov']).toMatchObject({ kind: 'existing_bill', billId: 'phone-bill' });
    expect(found.body.suggestions.unknown).toBeUndefined(); expect(found.body.suggestions['money-in']).toBeUndefined();
    expect(db.database.prepare("SELECT COUNT(*) AS count FROM sync_records WHERE type='bills'").get().count).toBe(billsBefore); // a suggestion saves nothing
    // Quick match = the same save as the pop-up, with the suggested details.
    const { kind, label, categoryName, sameWording, ...fields } = found.body.suggestions['fid-nov'];
    const quick = await call('POST', '/v3/bank/match-outgoing', { requestId: 'fid-2', action: kind, accountId: 'amexfeed', bankTransactionId: 'fid-nov', bankDate: '2026-11-12', description: 'FIDELITY PAYMEN BUS/ENT', amount: 15.46, ...fields });
    expect(quick.status).toBe(200); expect(quick.body.item).toMatchObject({ vendor: 'Fidelity', amount: 15.46, category: 'supplies', paidDate: '2026-11-12' });
  });
});

describe('credit card bill: payments during the period are for the previous bill', () => {
  it('ignores a payment made during the period, counts refunds in the period and payments after the statement', async () => {
    const { call, charge, db } = setup();
    await charge(400, '2026-10-01'); // Sep 25 - Oct 24 period, due Nov 15
    seed(db, 'bills', 'refund-1', { vendor: 'Store refund', amount: -30, currency: 'CAD', dueDate: '2026-10-05', paidDate: '2026-10-05', status: 'paid', category: 'supplies', sourceAccountId: 'visa', refundOfBillId: 'x' }); // refund in the period
    await call('POST', '/v3/records/accountTransfers', { data: { fromAccountId: 'bmo', toAccountId: 'visa', amount: 900, date: '2026-10-15' } }); // paid the previous bill
    let visa = (await call('GET', '/v3/credit-cards-due?today=2026-11-10')).body.items.find((item: any) => item.id === 'visa');
    expect(visa).toMatchObject({ dueDate: '2026-11-15', periodCharges: 370, paidSinceStatement: 0, amountDue: 370 });
    await call('POST', '/v3/records/accountTransfers', { data: { fromAccountId: 'bmo', toAccountId: 'visa', amount: 100, date: '2026-11-01' } }); // after the statement
    visa = (await call('GET', '/v3/credit-cards-due?today=2026-11-10')).body.items.find((item: any) => item.id === 'visa');
    expect(visa).toMatchObject({ paidSinceStatement: 100, amountDue: 270 });
  });
});

describe('bank feed: pending charges, all tab, and delete forever', () => {
  const feed = (db: any) => (db.database.prepare("SELECT id,is_deleted,data FROM sync_records WHERE type='bankFeedTransactions' ORDER BY id").all() as any[]).map(row => ({ id: row.id, deleted: row.is_deleted, ...JSON.parse(String(row.data)) }));
  const save = async (db: any, transactions: any[], now: number) => { const statements = await buildBankFeedSaveStatements(db, 'bmo', transactions, now); if (statements.length) await db.batch(statements); };
  const setupFeed = () => {
    const ctx = setup();
    ctx.db.database.prepare("UPDATE sync_records SET data=json_set(data,'$.plaidConnected',json('true')) WHERE type='accounts' AND id='bmo'").run();
    ctx.db.database.prepare("INSERT INTO sync_records(id,type,data,updated_at,revision,is_deleted) VALUES('matchedBankTransactions','matchedBankTransactions','[]',1,1,0)").run();
    return ctx;
  };
  const pending = { transaction_id: 'p1', date: '2026-10-12', name: 'KT SUPERMARKET', amount: 200, pending: true };
  const posted = { transaction_id: 'n1', pending_transaction_id: 'p1', date: '2026-10-13', name: 'KT SUPERMARKET', amount: 200, pending: false };

  it('a posted charge replaces its unmatched pending copy', async () => {
    const { db } = setupFeed();
    await save(db, [pending], 1);
    await save(db, [posted], 2);
    const live = feed(db).filter(row => !row.deleted);
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ id: 'n1', date: '2026-10-13', pending: false });
  });

  it('a posted charge updates its pending copy when the pending one was already matched', async () => {
    const { db } = setupFeed();
    await save(db, [pending], 1);
    db.database.prepare("UPDATE sync_records SET data='[\"p1\"]' WHERE type='matchedBankTransactions'").run();
    await save(db, [posted], 2);
    await save(db, [posted], 3); // syncing again changes nothing
    const live = feed(db).filter(row => !row.deleted);
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ id: 'p1', date: '2026-10-13', pending: false, postedTransactionId: 'n1' });
  });

  it('cleans up an existing duplicate when synced again', async () => {
    const { db } = setupFeed();
    await save(db, [pending], 1);
    db.database.prepare("UPDATE sync_records SET data='[\"p1\"]' WHERE type='matchedBankTransactions'").run();
    await save(db, [{ ...posted, pending_transaction_id: undefined }], 2); // older sync without the link made a copy
    expect(feed(db).filter(row => !row.deleted)).toHaveLength(2);
    await save(db, [posted], 3);
    expect(feed(db).filter(row => !row.deleted).map(row => row.id)).toEqual(['p1']);
  });

  it('keeps dismissed, shows all with a status, and deletes forever only dismissed ones', async () => {
    const { db, call } = setupFeed();
    await save(db, [{ transaction_id: 'a', date: '2026-10-01', name: 'A', amount: 5 }, { transaction_id: 'b', date: '2026-10-02', name: 'B', amount: 6 }], 1);
    const status = (action: string, id: string) => call('POST', '/v3/bank/feed-status', { requestId: crypto.randomUUID(), action, accountId: 'bmo', bankTransactionId: id });
    expect((await status('delete', 'a')).status).toBe(409); // not dismissed yet
    expect((await status('dismiss', 'a')).status).toBe(200);
    await save(db, [{ transaction_id: 'a', date: '2026-10-01', name: 'A', amount: 5 }], 2); // resync keeps it dismissed
    const all = await call('POST', '/v3/bank/records', { accountId: 'bmo', matchStatus: 'all' });
    expect(Object.fromEntries(all.body.items.map((item: any) => [item.id, item.matchState]))).toEqual({ a: 'dismissed', b: 'unmatched' });
    expect((await status('delete', 'a')).status).toBe(200);
    await save(db, [{ transaction_id: 'a', date: '2026-10-01', name: 'A', amount: 5 }], 3); // the bank sends it again
    const after = await call('POST', '/v3/bank/records', { accountId: 'bmo', matchStatus: 'all' });
    expect(after.body.items.map((item: any) => item.id)).toEqual(['b']);
  });
});

describe('bank sync start date', () => {
  it('goes back 7 days before the last sync, or further to the oldest pending charge', () => {
    expect(bankSyncStartDate('2026-11-12')).toBe('2026-11-05');
    expect(bankSyncStartDate('2026-11-12', '2026-11-08')).toBe('2026-11-05');
    expect(bankSyncStartDate('2026-11-12', '2026-10-30')).toBe('2026-10-30');
    expect(bankSyncStartDate('2026-01-03')).toBe('2025-12-27');
  });
});

describe('the Date box is the date everywhere', () => {
  it('an expense dated Sep 2, 2025 but marked paid on Jul 3, 2026 shows on Sep 2, 2025', async () => {
    const { db, call } = setup();
    seed(db, 'bills', 'lease', { vendor: 'Lease Car 14', amount: 1152.66, currency: 'CAD', dueDate: '2025-09-02', paidDate: '2026-07-03', status: 'paid', category: 'supplies', sourceAccountId: 'bmo' });
    const inSep = (await call('GET', '/v3/accounts/bmo/ledger?from=2025-09-01&to=2025-09-30')).body.items;
    expect(inSep.map((item: any) => item.id)).toEqual(['lease']);
    expect((await call('GET', '/v3/accounts/bmo/ledger?from=2026-07-01&to=2026-07-31')).body.items).toHaveLength(0);
  });
});

describe('call tracker Yiddish names and fundraisers', () => {
  it('finds a donor by full Yiddish name and shows the Yiddish name on calls', async () => {
    const { db, call } = setup();
    db.database.prepare("UPDATE sync_records SET data=json_set(data,'$.hebFirstName','משה','$.hebLastName','כהן','$.preTitle','הרב') WHERE type='donors' AND id='d1'").run();
    const found = await call('GET', '/v3/donors?search=' + encodeURIComponent('משה כהן'));
    expect(found.body.items.map((item: any) => item.id)).toEqual(['d1']);
    expect((await call('GET', '/v3/donors?search=' + encodeURIComponent('משה לוי'))).body.items).toHaveLength(0);
    await call('POST', '/v3/donor-contacts', { donorId: 'd1', date: '2026-11-12', outcome: 'No answer', requestId: crypto.randomUUID() });
    const list = await call('GET', '/v3/donor-contacts');
    expect(list.body.items[0]).toMatchObject({ donorName: 'Moshe Cohen', donorYiddishName: 'הרב משה כהן' });
  });

  it('checks fundraiser and team details', async () => {
    const { call } = setup();
    expect((await call('POST', '/v3/records/fundraisers', { data: { name: '', percentage: 10 } })).status).toBe(400);
    expect((await call('POST', '/v3/records/fundraisers', { data: { name: 'Shloime', percentage: 120 } })).status).toBe(400);
    const ok = await call('POST', '/v3/records/fundraisers', { data: { name: 'Shloime', percentage: '7.5' } });
    expect(ok.status).toBe(201);
    expect(ok.body.item.percentage).toBe(7.5);
    expect((await call('POST', '/v3/records/fundraisingGroups', { data: { name: 'Pair', allocations: [{ fundraiserId: 'f1', percentage: 60 }, { fundraiserId: ok.body.item.id, percentage: 50 }] } })).status).toBe(400);
    expect((await call('POST', '/v3/records/fundraisingGroups', { data: { name: 'Pair', allocations: [{ fundraiserId: 'f1', percentage: 5 }, { fundraiserId: 'f1', percentage: 5 }] } })).status).toBe(400);
    expect((await call('POST', '/v3/records/fundraisingGroups', { data: { name: 'Pair', allocations: [{ fundraiserId: 'f1', percentage: 5 }, { fundraiserId: ok.body.item.id, percentage: 5 }] } })).status).toBe(201);
  });

  it('paying a fundraiser lowers what we owe him', async () => {
    const { db, call } = setup();
    seed(db, 'pledges', 'pl1', { donorId: 'd1', amount: 1000, currency: 'CAD', date: '2026-11-01', fundraiserAllocations: [{ fundraiserId: 'f1', percentage: 10 }] });
    seed(db, 'transactions', 't1', { type: 'approved', donorId: 'd1', amount: 1000, amountCAD: 1000, currency: 'CAD', date: '2026-11-02', pledgeId: 'pl1', sourceAccountId: 'bmo', offsetAccountId: 'supplies' });
    const owed = async () => (await call('GET', '/v3/payroll/entities?type=fundraisers')).body.items.find((item: any) => item.id === 'f1').balanceOwed;
    expect(await owed()).toBe(100);
    expect((await call('POST', '/v3/fundraiser-payouts', { requestId: crypto.randomUUID(), fundraiserId: 'f1', amount: 40, date: '2026-11-10', sourceAccountId: 'bmo' })).status).toBe(201);
    expect(await owed()).toBe(60);
    expect((await call('POST', '/v3/fundraiser-payouts', { requestId: crypto.randomUUID(), fundraiserId: 'f1', amount: 70, date: '2026-11-11', sourceAccountId: 'bmo' })).status).toBe(409);
  });
});

describe('deleting a call', () => {
  it('removes the call and its call-back reminder', async () => {
    const { call } = setup();
    const saved = await call('POST', '/v3/donor-contacts', { donorId: 'd1', date: '2026-11-12', fundraiserId: 'f1', outcome: 'Call back', notes: 'Busy', followUpDate: '2026-11-20', requestId: crypto.randomUUID() });
    expect((await call('GET', '/v3/tasks?status=pending')).body.items.some((task: any) => task.dueDate === '2026-11-20')).toBe(true);
    const removed = await call('DELETE', `/v3/records/donorContacts/${saved.body.item.id}`, { revision: saved.body.item.revision });
    expect(removed.status).toBe(200);
    expect((await call('GET', '/v3/donor-contacts')).body.items).toHaveLength(0);
    expect((await call('GET', '/v3/tasks?status=pending')).body.items.some((task: any) => task.dueDate === '2026-11-20')).toBe(false);
  });
});

describe('card schedules charged by Sola or Stripe', () => {
  it('saves a card schedule without a saved card when Sola or Stripe charges it, and keeps the USD rate', async () => {
    const { call } = setup();
    seed((databases[databases.length - 1]), 'accounts', 'rev', { name: 'Donation', type: 'revenue', currency: 'CAD' });
    const base = { donorId: 'd1', amount: 200, frequency: 'monthly', method: 'credit_card', nextDate: '2026-12-01', sourceAccountId: 'bmo', offsetAccountId: 'rev', active: true };
    const stripe = await call('POST', '/v3/records/recurringPayments', { data: { ...base, currency: 'USD', exchangeRate: 1.4, amountCAD: 280, chargedBy: 'stripe' } });
    expect(stripe.status).toBeLessThan(300);
    expect(stripe.body.item).toMatchObject({ chargedBy: 'stripe', amountCAD: 280, exchangeRate: 1.4 });
    const sola = await call('POST', '/v3/records/recurringPayments', { data: { ...base, currency: 'CAD', chargedBy: 'sola' } });
    expect(sola.status).toBeLessThan(300);
    const own = await call('POST', '/v3/records/recurringPayments', { data: { ...base, currency: 'CAD' } });
    expect(own.status).toBe(400);
    expect(own.body.error).toMatch(/saved card/i);
  });
});

describe('donor legal name for receipts', () => {
  it('the receipt uses the legal name when the donor has one, else the donor name', async () => {
    const { db, call } = setup();
    seed(db, 'transactions', 'gift1', { donorId: 'd1', amount: 500, currency: 'CAD', date: '2026-11-01', type: 'approved', method: 'check' });
    expect((await loadGift(db, 'gift1'))!.donorName).toBe('Moshe Cohen');
    const revision = Number((db.database.prepare("SELECT revision FROM sync_records WHERE id='d1'").get() as any).revision);
    const saved = await call('PUT', '/v3/donors/d1', { firstName: 'Moshe', lastName: 'Cohen', phone: '514-555-0100', email: '', displayId: 'D-100', receiptName: 'Cohen Holdings Inc.', revision });
    expect(saved.status).toBe(200);
    expect((await loadGift(db, 'gift1'))!.donorName).toBe('Cohen Holdings Inc.');
    const data = JSON.parse(String((db.database.prepare("SELECT data FROM sync_records WHERE id='d1'").get() as any).data));
    expect(data).toMatchObject({ name: 'Moshe Cohen', receiptName: 'Cohen Holdings Inc.' }); // the donor keeps his own name
  });
});

describe('loans paid back monthly', () => {
  it('shows one line: this month\'s payment and date; when it is paid, next month\'s', async () => {
    const { db, call } = setup();
    seed(db, 'accounts', 'loan', { name: 'Gemach loan', type: 'liability', subType: 'loan', currency: 'CAD', startingBalance: 1000, loanDueDate: '2027-06-01' });
    const before = await call('GET', '/v3/loans-payable?today=2026-11-19');
    expect(before.body.items).toEqual([expect.objectContaining({ accountId: 'loan', remaining: 1000, dueDate: '2027-06-01' })]);
    const revision = Number((db.database.prepare("SELECT revision FROM sync_records WHERE id='loan'").get() as any).revision);
    expect((await call('PUT', '/v3/records/accounts/loan', { revision, data: { loanMonthlyPayment: 200, loanPaymentDay: 25 } })).status).toBe(200);
    const monthly = await call('GET', '/v3/loans-payable?today=2026-11-19');
    expect(monthly.body.items).toEqual([expect.objectContaining({ monthly: true, remaining: 200, dueDate: '2026-11-25', totalOwed: 1000 })]);
    // Pay 200 into the loan this month: next month's payment shows (Dec 25).
    const paid = await call('POST', '/v3/records/accountTransfers', { data: { fromAccountId: 'bmo', toAccountId: 'loan', amount: 200, date: '2026-11-20' } });
    expect([200, 201]).toContain(paid.status);
    const after = await call('GET', '/v3/loans-payable?today=2026-11-21');
    expect(after.body.items).toEqual([expect.objectContaining({ monthly: true, remaining: 200, dueDate: '2026-12-25', totalOwed: 800 })]);
    // Click the loan: money in and every payment made back.
    const history = await call('GET', '/v3/loans-payable/loan/history');
    expect(history.body).toMatchObject({ totalBorrowed: 1000, totalPaid: 200, owed: 800, account: { name: 'Gemach loan', loanMonthlyPayment: 200, loanPaymentDay: 25 } });
    expect(history.body.borrowed).toEqual([expect.objectContaining({ description: 'Starting balance', amount: 1000 })]);
    expect(history.body.payments).toEqual([expect.objectContaining({ date: '2026-11-20', amount: 200, recordType: 'accountTransfers' })]);
  });
});

describe('expected to come in (credit cards box)', () => {
  it('adds up schedules and waiting payments by method, USD on its own line', async () => {
    const { db, call } = setup();
    seed(db, 'recurringPayments', 's1', { donorId: 'd1', amount: 100, currency: 'CAD', method: 'credit_card', frequency: 'weekly', nextDate: '2026-11-20', active: true });
    seed(db, 'recurringPayments', 's2', { donorId: 'd1', amount: 50, currency: 'USD', method: 'credit_card', frequency: 'monthly', nextDate: '2026-12-01', active: true });
    seed(db, 'recurringPayments', 's3', { donorId: 'd1', amount: 36, currency: 'CAD', method: 'cash', frequency: 'monthly', nextDate: '2026-11-25', active: true });
    seed(db, 'recurringPayments', 'off', { donorId: 'd1', amount: 999, currency: 'CAD', method: 'cash', frequency: 'monthly', nextDate: '2026-11-25', active: false });
    seed(db, 'recurringPayments', 'later', { donorId: 'd1', amount: 999, currency: 'CAD', method: 'vouchers', frequency: 'monthly', nextDate: '2026-12-20', active: true });
    seed(db, 'transactions', 'inst', { donorId: 'd1', amount: 150, currency: 'CAD', method: 'vouchers', date: '2026-12-01', type: 'pending' });
    const result = await call('GET', '/v3/expected-income?from=2026-11-19&to=2026-12-15');
    expect(result.body.items).toEqual([
      expect.objectContaining({ method: 'credit_card', currency: 'CAD', amount: 400, count: 4 }), // Nov 20, 27, Dec 4, 11
      expect.objectContaining({ method: 'credit_card', currency: 'USD', amount: 50, count: 1 }),
      expect.objectContaining({ method: 'vouchers', currency: 'CAD', amount: 150, count: 1 }),
      expect.objectContaining({ method: 'cash', currency: 'CAD', amount: 36, count: 1 }),
    ]);
  });
});

describe('declined payments are not tasks', () => {
  it('they stay out of the Tasks page and the bell count, and are listed on their own with the payment amount', async () => {
    const { db, call } = setup();
    seed(db, 'transactions', 'p1', { donorId: 'd1', amount: 180, currency: 'CAD', type: 'declined', date: '2026-11-01' });
    seed(db, 'tasks', 'declined-sola-x', { donorId: 'd1', title: 'Sola payment declined', notes: 'Insufficient funds', dueDate: '2026-11-01', priority: 'high', type: 'declined_payment', completed: false, linkedPaymentId: 'p1' });
    seed(db, 'tasks', 't1', { donorId: 'd1', title: 'Call Moshe', dueDate: '2026-11-01', priority: 'medium', type: 'call', completed: false });
    const tasks = await call('GET', '/v3/tasks?status=pending');
    expect(tasks.body.items.map((task: any) => task.id)).toEqual(['t1']);
    expect(tasks.body.summary.pending).toBe(1);
    const declined = await call('GET', '/v3/tasks?status=pending&taskType=declined_payment');
    expect(declined.body.items).toEqual([expect.objectContaining({ id: 'declined-sola-x', donorName: 'Moshe Cohen', paymentAmount: 180, paymentCurrency: 'CAD' })]);
  });
});

describe('loan due reminders', () => {
  it('a loan shows in the daily reminders 1 month, 2 weeks, 1 week, 3 days, 1 day before and on the date, and not on other days', async () => {
    const { db } = setup();
    seed(db, 'accounts', 'loan', { name: 'Gemach loan', type: 'liability', subType: 'loan', currency: 'CAD', startingBalance: 1000, loanDueDate: '2026-12-31' });
    const on = async (today: string) => (await loanReminders(db as any, today)).map((loan: any) => loan.when);
    expect(await on('2026-12-01')).toEqual(['due in 1 month']);
    expect(await on('2026-12-17')).toEqual(['due in 2 weeks']);
    expect(await on('2026-12-24')).toEqual(['due in 1 week']);
    expect(await on('2026-12-28')).toEqual(['due in 3 days']);
    expect(await on('2026-12-30')).toEqual(['due tomorrow']);
    expect(await on('2026-12-31')).toEqual(['due TODAY']);
    expect(await on('2026-12-20')).toEqual([]);
    const digest = await buildReminderDigest(db as any, '2026-12-24');
    expect(digest.text).toContain('Loan to pay back: Gemach loan – CAD $1,000.00 due in 1 week (2026-12-31)');
    expect(digest.html).toContain('Loans to pay back');
  });
});

describe('bank sends an old transaction again', () => {
  it('a row that only lost its [DS] tag is not saved again; two real rows with the same name both stay', async () => {
    const { db } = setup();
    const save = async (transactions: any[], now: number) => { const statements = await buildBankFeedSaveStatements(db, 'bmo', transactions, now); if (statements.length) await db.batch(statements); };
    const rows = () => (db.database.prepare("SELECT id FROM sync_records WHERE type='bankFeedTransactions' AND is_deleted=0 ORDER BY id").all() as any[]).map(row => row.id);
    await save([{ transaction_id: 'old', date: '2026-08-20', name: '[DS]FONDATION KEREN LNS/PRE', amount: 500, pending: false }], 1);
    await save([{ transaction_id: 'again', date: '2026-08-20', name: 'FONDATION KEREN LNS/PRE', amount: 500, pending: false }], 2);
    expect(rows()).toEqual(['bmo:old']);
    await save([{ transaction_id: 'c1', date: '2026-07-02', name: '[CW]MOBILE CHEQUE DEPOSIT', amount: -900, pending: false }, { transaction_id: 'c2', date: '2026-07-02', name: '[CW]MOBILE CHEQUE DEPOSIT', amount: -900, pending: false }], 3);
    expect(rows()).toEqual(['bmo:c1', 'bmo:c2', 'bmo:old']);
  });
});

describe('monthly loan needs no pay-back date', () => {
  it('money from a monthly loan is saved without a pay-back date; a loan paid on a date still needs one', async () => {
    const { db, call } = setup();
    seed(db, 'accounts', 'monthly', { name: 'Cluj', type: 'liability', subType: 'loan', currency: 'CAD', loanMonthlyPayment: 1000, loanPaymentDay: 1 });
    seed(db, 'accounts', 'dated', { name: 'Gemach', type: 'liability', subType: 'loan', currency: 'CAD' });
    expect((await call('POST', '/v3/records/accountTransfers', { data: { fromAccountId: 'monthly', toAccountId: 'bmo', amount: 20000, date: '2025-12-01' } })).status).toBe(201);
    expect((await call('POST', '/v3/records/accountTransfers', { data: { fromAccountId: 'dated', toAccountId: 'bmo', amount: 500, date: '2025-12-01' } })).status).toBe(400);
  });
});

describe('sort and filter on every column', () => {
  it('pledges: filter donor starting with, Yiddish name, date range; sort by open balance across all pages', async () => {
    const { db, call } = setup();
    seed(db, 'donors', 'd2', { name: 'Abraham Klein', hebFirstName: 'אברהם', hebLastName: 'קליין' });
    seed(db, 'pledges', 'p1', { donorId: 'd1', amount: 100, currency: 'CAD', date: '2026-01-05' });
    seed(db, 'pledges', 'p2', { donorId: 'd2', amount: 500, currency: 'CAD', date: '2026-03-10' });
    seed(db, 'pledges', 'p3', { donorId: 'd2', amount: 50, currency: 'CAD', date: '2026-06-01' });
    seed(db, 'transactions', 't1', { donorId: 'd2', pledgeId: 'p2', amount: 400, currency: 'CAD', type: 'approved', date: '2026-03-11', method: 'cash' });
    const ids = async (query: string) => (await call('GET', `/v3/pledges?limit=50&${query}`)).body.items.map((item: any) => item.id);
    expect(await ids('f_donor=%5Eab')).toEqual(expect.arrayContaining(['p2', 'p3']));
    expect(await ids('f_donor=%5Eab')).toHaveLength(2);
    expect(await ids(`f_yiddish=${encodeURIComponent('אברהם')}`)).toHaveLength(2);
    expect(await ids('f_date=2026-03-01..2026-12-31&sort=date&direction=asc')).toEqual(['p2', 'p3']);
    expect(await ids('f_amount=..100&sort=amount&direction=desc')).toEqual(['p1', 'p3']);
    const byBalance = (await call('GET', '/v3/pledges?limit=50&sort=balance&direction=desc')).body.items.map((item: any) => Number(item.balance));
    expect(byBalance).toEqual([...byBalance].sort((x, y) => y - x));
    expect(byBalance).toHaveLength(3);
    const page = await call('GET', '/v3/pledges?limit=1&page=3&sort=balance&direction=desc');
    expect(page.body).toMatchObject({ total: 3, totalPages: 3 });
    expect(Number(page.body.items[0].balance)).toBe(byBalance[2]);
    const over = (await call('GET', '/v3/pledges?limit=50&f_balance=60..')).body.items.map((item: any) => Number(item.balance));
    expect(over.every((value: number) => value >= 60)).toBe(true);
    expect(over.length).toBe(byBalance.filter((value: number) => value >= 60).length);
  });
  it('donors, payments, accounts and vendors filter and sort by any column', async () => {
    const { db, call } = setup();
    seed(db, 'donors', 'd2', { name: 'Abraham Klein', city: 'Montreal' });
    seed(db, 'transactions', 't1', { donorId: 'd2', amount: 40, currency: 'CAD', type: 'approved', date: '2026-03-11', method: 'cash', notes: 'Purim' });
    seed(db, 'transactions', 't2', { donorId: 'd1', amount: 90, currency: 'CAD', type: 'approved', date: '2026-04-11', method: 'check' });
    const names = (await call('GET', '/v3/donors?f_name=%5Emo&limit=50')).body.items.map((item: any) => item.name);
    expect(names).toEqual(['Moshe Cohen']);
    expect((await call('GET', '/v3/donors?sort=name&direction=desc&limit=50')).body.items.map((item: any) => item.name)).toEqual(['Moshe Cohen', 'Abraham Klein']);
    expect((await call('GET', '/v3/payments?f_method=%3Dcash&limit=50')).body.items.map((item: any) => item.id)).toEqual(['t1']);
    expect((await call('GET', '/v3/payments?sort=amount&direction=asc&limit=50')).body.items.map((item: any) => item.id)).toEqual(['t1', 't2']);
    expect((await call('GET', '/v3/accounts?f_name=%5Evisa&limit=50')).body.items.map((item: any) => item.id)).toEqual(['visa']);
    await call('POST', '/v3/bills', { requestId: crypto.randomUUID(), vendor: 'Store A', amount: 50, dueDate: '2026-11-01', paidDate: '2026-11-01', status: 'paid', category: 'supplies', sourceAccountId: 'visa' });
    await call('POST', '/v3/bills', { requestId: crypto.randomUUID(), vendor: 'Store B', amount: 300, dueDate: '2026-11-02', paidDate: '2026-11-02', status: 'paid', category: 'supplies', sourceAccountId: 'visa' });
    expect((await call('GET', '/v3/vendors?f_total=100..&limit=50')).body.items.map((item: any) => item.vendor ?? item.name)).toEqual(['Store B']);
    expect((await call('GET', '/v3/bills?f_vendor=%5Estore%20a&limit=50')).body.items.map((item: any) => item.vendor)).toEqual(['Store A']);
  });
});

describe('sub-campaigns', () => {
  const subSetup = () => {
    const ctx = setup();
    seed(ctx.db, 'campaigns', 'main', { name: 'Campaign 2025', year: 2025, startDate: '2025-03-01', endDate: '2026-02-28', currency: 'CAD', status: 'active' });
    seed(ctx.db, 'campaigns', 'sub', { name: 'Addition', parentId: 'main', year: 2025, startDate: '2025-03-01', endDate: '2026-02-28', currency: 'CAD', status: 'active' });
    seed(ctx.db, 'pledges', 'pm', { donorId: 'd1', amount: 1000, currency: 'CAD', date: '2025-05-01', campaignId: 'main' });
    seed(ctx.db, 'pledges', 'ps', { donorId: 'd1', amount: 100, currency: 'CAD', date: '2025-06-01', campaignId: 'sub' });
    seed(ctx.db, 'transactions', 'pay', { donorId: 'd1', amount: 100, currency: 'CAD', type: 'approved', date: '2025-06-02', method: 'cash', pledgeId: 'ps' });
    seed(ctx.db, 'recurringPayments', 'sch', { donorId: 'd1', amount: 50, currency: 'CAD', frequency: 'monthly', nextDate: '2025-07-01', active: true, method: 'cash', pledgeId: 'pm' });
    return ctx;
  };
  it('the main campaign counts its sub-campaign; the sub-campaign counts only its own', async () => {
    const { db } = subSetup();
    const rows = await buildReportRows(db as any, 'campaigns', '2025-07-01') as any[];
    const main = rows.find(row => row.id === 'main'); const sub = rows.find(row => row.id === 'sub');
    expect(main).toMatchObject({ pledges: 2, pledged: 1100, paid: 100, campaignIds: ['main', 'sub'] });
    expect(sub).toMatchObject({ pledges: 1, pledged: 100, paid: 100, parentId: 'main', campaign: 'Campaign 2025 › Addition' });
  });
  it('saving or organizing keeps a pledge in its sub-campaign; a pledge can be put in a sub-campaign', async () => {
    const { db, call } = subSetup();
    const campaignOf = (id: string) => JSON.parse(String((db.database.prepare("SELECT data FROM sync_records WHERE type='pledges' AND id=?").get(id) as any).data)).campaignId;
    expect((await call('PUT', '/v3/records/pledges/ps', { revision: 1, data: { notes: 'changed' } })).status).toBe(200);
    expect(campaignOf('ps')).toBe('sub');
    await call('POST', '/v3/campaigns/assign-pledges');
    expect(campaignOf('ps')).toBe('sub');
    expect(campaignOf('pm')).toBe('main');
    expect((await call('PUT', '/v3/records/pledges/pm', { revision: 1, data: { campaignId: 'sub' } })).status).toBe(200);
    expect(campaignOf('pm')).toBe('sub');
    const made = await call('POST', '/v3/records/pledges', { data: { donorId: 'd1', amount: 5, currency: 'CAD', date: '2025-08-01', campaignId: 'c1' } });
    expect(made.status).toBe(201);
    expect(campaignOf(made.body.item.id)).toBe('main'); // a campaign that is not a sub-campaign of the date's campaign is not kept
  });
  it('the donor window shows the campaign of each pledge and payment, and the pledge each schedule pays', async () => {
    const { call } = subSetup();
    const profile = (await call('GET', '/v3/donors/d1/profile')).body;
    expect(profile.pledges.find((item: any) => item.id === 'ps').campaignName).toBe('Campaign 2025 › Addition');
    expect(profile.payments.find((item: any) => item.id === 'pay').campaignName).toBe('Campaign 2025 › Addition');
    expect(profile.recurring[0].pledgeLabel).toBe('Pledge 2025-05-01 · CAD $1,000 · Campaign 2025');
    const schedules = (await call('GET', '/v3/schedules?limit=50')).body.items;
    expect(schedules[0].pledgeLabel).toBe('2025-05-01 · CAD $1,000 · Campaign 2025');
  });
});

describe('special campaigns', () => {
  it('a pledge put in a special campaign stays there; new pledges are never put in it by date', async () => {
    const { db, call } = setup();
    seed(db, 'campaigns', 'year', { name: 'Campaign 2025', year: 2025, startDate: '2025-03-01', endDate: '2026-02-28', currency: 'CAD', status: 'active' });
    seed(db, 'campaigns', 'amb', { name: 'Ambulance 81', special: true, year: 2025, startDate: '2025-12-01', endDate: '2026-02-28', currency: 'CAD', status: 'active' });
    const campaignOf = (id: string) => JSON.parse(String((db.database.prepare("SELECT data FROM sync_records WHERE type='pledges' AND id=?").get(id) as any).data)).campaignId;
    const special = await call('POST', '/v3/records/pledges', { data: { donorId: 'd1', amount: 10000, currency: 'CAD', date: '2025-12-10', campaignId: 'amb' } });
    const normal = await call('POST', '/v3/records/pledges', { data: { donorId: 'd1', amount: 50, currency: 'CAD', date: '2025-12-11' } });
    expect(campaignOf(special.body.item.id)).toBe('amb');
    expect(campaignOf(normal.body.item.id)).toBe('year');
    await call('POST', '/v3/campaigns/assign-pledges');
    expect(campaignOf(special.body.item.id)).toBe('amb');
    expect(campaignOf(normal.body.item.id)).toBe('year');
  });
});

describe('payments sheets', () => {
  it('shows all, post-dated checks, filters on campaign year and pledge, and saves sheets for everyone', async () => {
    const { db, call } = setup();
    seed(db, 'campaigns', 'y25', { name: 'Campaign 2025', year: 2025, startDate: '2025-03-01', endDate: '2026-02-28', currency: 'CAD', status: 'active' });
    seed(db, 'pledges', 'pl', { donorId: 'd1', amount: 500, currency: 'CAD', date: '2025-05-01', campaignId: 'y25' });
    seed(db, 'transactions', 'a', { donorId: 'd1', amount: 100, currency: 'CAD', type: 'approved', date: '2025-06-01', method: 'cash', pledgeId: 'pl' });
    seed(db, 'transactions', 'b', { donorId: 'd1', amount: 70, currency: 'CAD', type: 'declined', date: '2025-06-02', method: 'credit_card' });
    seed(db, 'transactions', 'c', { donorId: 'd1', amount: 250, currency: 'CAD', type: 'pending', date: '2099-01-01', method: 'check' });
    const ids = async (query: string) => (await call('GET', `/v3/payments?limit=50&${query}`)).body.items.map((item: any) => item.id).sort();
    expect(await ids('status=all')).toEqual(['a', 'b', 'c']);
    expect(await ids('status=postdated')).toEqual(['c']);
    expect(await ids('status=all&f_campaignYear=2025..2025')).toEqual(['a']);
    expect(await ids('status=all&f_campaign=%5Ecampaign%202025')).toEqual(['a']);
    const one = (await call('GET', '/v3/payments?limit=50&status=approved')).body.items[0];
    expect(one).toMatchObject({ campaignName: 'Campaign 2025', campaignYear: 2025, pledgeDate: '2025-05-01', pledgeAmount: 500 });
    const saved = await call('PUT', '/v3/list-views', { list: 'payments', views: [{ name: 'Checks 2025', base: 'all', columns: ['date', 'donor', 'campaign'], filters: { campaignYear: '2025..2025' }, sort: 'amount', direction: 'asc', method: 'check' }] });
    expect(saved.body.views[0]).toMatchObject({ name: 'Checks 2025', base: 'all', columns: ['date', 'donor', 'campaign'], filters: { campaignYear: '2025..2025' }, sort: 'amount', direction: 'asc', method: 'check' });
    expect((await call('GET', '/v3/list-views?list=payments')).body.views).toHaveLength(1);
  });
});

describe('business accounts', () => {
  it('one company check is divided between its donors pledges; the receipt is the company for the full amount', async () => {
    const { db, call } = setup();
    seed(db, 'accounts', 'donations', { name: 'Donations', type: 'revenue', currency: 'CAD' });
    seed(db, 'donors', 'd2', { name: 'Abraham Klein', phone: '514-555-0101' });
    seed(db, 'pledges', 'p1', { donorId: 'd1', amount: 600, currency: 'CAD', date: '2026-04-01' });
    seed(db, 'pledges', 'p2', { donorId: 'd2', amount: 400, currency: 'CAD', date: '2026-04-01' });
    const made = await call('POST', '/v3/donors', { requestId: crypto.randomUUID(), firstName: 'Klein Holdings Inc', lastName: '', phone: '514-555-0199', receiptName: 'Klein Holdings Inc.', isBusiness: true, businessMemberIds: ['d1', 'd2', 'nobody'] });
    expect(made.body.success).toBe(true);
    const business = made.body.item;
    expect(business).toMatchObject({ isBusiness: true, businessMemberIds: ['d1', 'd2'] });
    const choices = (await call('GET', `/v3/donors/${business.id}/pledge-choices`)).body.items;
    expect(choices.map((item: any) => [item.id, item.donorName])).toEqual(expect.arrayContaining([['p1', 'Moshe Cohen'], ['p2', 'Abraham Klein']]));
    const paid = await call('POST', '/v3/payments', { requestId: crypto.randomUUID(), donorId: business.id, amount: 1000, currency: 'CAD', method: 'e_transfer', date: '2026-05-01', sourceAccountId: 'bmo', offsetAccountId: 'donations', type: 'approved', allocations: [{ pledgeId: 'p1', amount: 600 }, { pledgeId: 'p2', amount: 400 }] });
    expect(paid.body.error || '').toBe('');
    expect(paid.body.success).toBe(true);
    const p2 = (await call('GET', '/v3/donors/d2/profile')).body;
    expect(p2.pledges.find((item: any) => item.id === 'p2')).toMatchObject({ paid: 400, balance: 0 });
    expect(p2.donor.memberOfBusinesses).toEqual([{ id: business.id, name: 'Klein Holdings Inc' }]);
    const gift = await loadGift(db as any, paid.body.item.id);
    expect(gift).toMatchObject({ donorName: 'Klein Holdings Inc.', amount: 1000 });
    // a normal donor still cannot put money on someone else's pledge
    const blocked = await call('POST', '/v3/payments', { requestId: crypto.randomUUID(), donorId: 'd1', amount: 50, currency: 'CAD', method: 'cash', date: '2026-05-02', sourceAccountId: 'bmo', offsetAccountId: 'donations', type: 'approved', allocations: [{ pledgeId: 'p2', amount: 50 }] });
    expect(blocked.status).toBe(409);
  });
});
