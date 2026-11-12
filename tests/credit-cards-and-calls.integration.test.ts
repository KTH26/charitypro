// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { registerServerDataRoutes, creditCardCycle } from '../functions/api/server-data';

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
    expect(visa).toMatchObject({ dueDate: '2026-12-15', statementDate: '2026-11-24', periodCharges: 250, amountDue: 350 });
    // Paid the November bill (100) on Nov 14, so December still owes 250.
    const paid = await call('POST', '/v3/records/accountTransfers', { data: { fromAccountId: 'bmo', toAccountId: 'visa', amount: 100, date: '2026-11-14' } });
    expect(paid.status).toBe(201);
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
  it('a paid expense uses the date entered, and the paid date can be edited', async () => {
    const { call } = setup();
    const saved = await call('POST', '/v3/bills', { requestId: crypto.randomUUID(), vendor: 'Hydro', amount: 80, dueDate: '2026-09-02', status: 'paid', category: 'supplies', sourceAccountId: 'bmo' });
    expect(saved.status).toBe(201);
    expect(saved.body.item.paidDate).toBe('2026-09-02');
    let ledger = (await call('GET', '/v3/accounts/bmo/ledger')).body.items;
    expect(ledger[0].paidDate).toBe('2026-09-02');
    const edited = await call('PUT', `/v3/records/bills/${saved.body.item.id}`, { revision: saved.body.item.revision, data: { paidDate: '2026-08-30' } });
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
