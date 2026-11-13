// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { registerServerDataRoutes, torontoToday } from '../functions/api/server-data';

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

afterEach(() => { vi.unstubAllGlobals(); });

const seed = (db: MockD1, type: string, id: string, data: any) => {
  db.database.prepare('INSERT INTO sync_records(id,type,data,updated_at,revision,is_deleted) VALUES(?,?,?,?,1,0)').run(id, type, JSON.stringify({ id, ...data }), 1);
};
const setup = () => {
  const db = new MockD1(); databases.push(db);
  const today = torontoToday();
  seed(db, 'donors', 'd1', { name: 'Moshe Klein', hebFirstName: 'משה', hebLastName: 'קליין', phone: '514-555-2163' });
  seed(db, 'pledges', 'p1', { donorId: 'd1', amount: 1800, currency: 'CAD', date: `${today.slice(0, 4)}-01-15` });
  seed(db, 'tasks', 't1', { donorId: 'd1', title: 'Call about pledge', notes: 'He said after Chanukah', dueDate: today, priority: 'high', type: 'call', completed: false });
  seed(db, 'tasks', 't2', { title: 'Already done', dueDate: today, completed: true });
  seed(db, 'tasks', 't3', { donorId: 'd1', title: 'Sola payment declined', dueDate: today, type: 'declined_payment', completed: false });
  const app = new Hono();
  app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); c.set('userEmail', 'tester@example.com'); await next(); });
  registerServerDataRoutes(app as any);
  const call = async (method: string, path: string, body?: any) => {
    const response = await app.request(`http://charity.test${path}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }, { DB: db } as any);
    return { status: response.status, body: await response.json() as any };
  };
  return { db, call };
};

describe('email & text settings', () => {
  it('makes a secret for the Google script and checks what is saved', async () => {
    const { call } = setup();
    const first = await call('GET', '/v3/messaging/settings');
    expect(first.body.email.configured).toBe(false);
    expect(first.body.email.scriptCode).toMatch(/const SECRET = '[0-9a-f]{36}'/);
    expect(first.body.sms.inboundUrl).toBe('http://charity.test/api/v3/sms/inbound');
    expect((await call('PUT', '/v3/messaging/settings', { scriptUrl: 'https://evil.example.com/x' })).status).toBe(400);
    expect((await call('PUT', '/v3/messaging/settings', { settings: { reminderEmails: 'not-an-email' } })).status).toBe(400);
    expect((await call('PUT', '/v3/messaging/settings', { settings: { reminderPhones: '12' } })).status).toBe(400);
    expect((await call('PUT', '/v3/messaging/settings', { scriptUrl: 'https://script.google.com/macros/s/AKfy123/exec', twilioSid: 'AC' + '0'.repeat(32), twilioToken: 'tok', twilioFrom: '514 555 0000', settings: { reminderByEmail: true, reminderEmails: 'me@example.com', reminderBySms: true, reminderPhones: '450-555-1111' } })).status).toBe(200);
    const after = await call('GET', '/v3/messaging/settings');
    expect(after.body.email.configured).toBe(true);
    expect(after.body.sms).toMatchObject({ configured: true, fromNumber: '+15145550000', tokenSaved: true });
    expect(after.body.settings).toMatchObject({ reminderByEmail: true, reminderEmails: 'me@example.com' });
  });
});

describe('daily reminders', () => {
  it('lists today\'s open reminders with the donor phone and balance', async () => {
    const { call } = setup();
    const digest = await call('GET', '/v3/reminders/today');
    expect(digest.body.items).toHaveLength(1);
    expect(digest.body.text).toContain('Call about pledge: משה קליין (514-555-2163)');
    expect(digest.body.text).toContain('$1,800.00');
  });
  it('sends by email and text once a day, and logs every message', async () => {
    const { call } = setup();
    await call('GET', '/v3/messaging/settings');
    await call('PUT', '/v3/messaging/settings', { scriptUrl: 'https://script.google.com/macros/s/AKfy123/exec', twilioSid: 'AC' + '0'.repeat(32), twilioToken: 'tok', twilioFrom: '+15145550000', settings: { reminderByEmail: true, reminderEmails: 'me@example.com', reminderBySms: true, reminderPhones: '450-555-1111' } });
    const sent: any[] = [];
    vi.stubGlobal('fetch', async (url: string, init: any) => {
      sent.push({ url: String(url), body: String(init?.body || '') });
      return String(url).includes('twilio') ? new Response(JSON.stringify({ sid: 'SM1' }), { status: 201 }) : new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const first = await call('POST', '/v3/automation/daily-reminders');
    expect(first.body).toMatchObject({ success: true, sent: 2 });
    expect(sent[0].url).toBe('https://script.google.com/macros/s/AKfy123/exec');
    expect(JSON.parse(sent[0].body)).toMatchObject({ to: 'me@example.com', subject: "Today's reminders: 1" });
    expect(sent[1].url).toContain('api.twilio.com');
    expect(decodeURIComponent(sent[1].body)).toContain('To=+14505551111');
    const again = await call('POST', '/v3/automation/daily-reminders');
    expect(again.body.skipped).toBe('Already sent today.');
    const log = await call('GET', '/v3/messages?kind=reminders');
    expect(log.body.items.map((item: any) => `${item.channel}:${item.status}`).sort()).toEqual(['email:sent', 'sms:sent']);
  });
});

describe('donor statements', () => {
  it('shows the period, what was paid and what is still owed, and sends it', async () => {
    const { db, call } = setup();
    const year = torontoToday().slice(0, 4);
    seed(db, 'transactions', 'pay1', { donorId: 'd1', amount: 500, currency: 'CAD', date: `${year}-02-01`, method: 'check', checkNumber: '123', type: 'approved', pledgeAllocations: [{ pledgeId: 'p1', amount: 500 }] });
    const statement = await call('GET', `/v3/donors/d1/statement?from=${year}-01-01&to=${year}-12-31`);
    expect(statement.body.summary).toMatchObject({ pledged: 1800, paid: 500, balanceThisYear: 1300, balanceTotal: 1300 });
    expect(statement.body.html).toContain('Check #123');
    expect(statement.body.text).toContain('your balance for ' + year + ' is $1,300.00');
    expect((await call('POST', '/v3/donors/d1/statement/send', { channel: 'email', to: 'donor@example.com' })).body.error).toContain('not set up');
    await call('GET', '/v3/messaging/settings');
    await call('PUT', '/v3/messaging/settings', { scriptUrl: 'https://script.google.com/macros/s/AKfy123/exec' });
    const sent: any[] = [];
    vi.stubGlobal('fetch', async (url: string, init: any) => { sent.push(JSON.parse(String(init.body))); return new Response(JSON.stringify({ ok: true })); });
    expect((await call('POST', '/v3/donors/d1/statement/send', { channel: 'email', to: 'donor@example.com', attachPdf: true })).status).toBe(200);
    expect(sent[0]).toMatchObject({ to: 'donor@example.com', attachments: [{ filename: 'Statement.pdf' }] });
    expect((await call('GET', '/v3/messages?donorId=d1')).body.items.map((item: any) => item.status)).toEqual(['sent', 'failed']);
  });
});

describe('official receipts', () => {
  const connectEmail = async (call: any) => { await call('GET', '/v3/messaging/settings'); await call('PUT', '/v3/messaging/settings', { scriptUrl: 'https://script.google.com/macros/s/AKfy123/exec' }); };
  const captureEmails = () => { const sent: any[] = []; vi.stubGlobal('fetch', async (_url: string, init: any) => { sent.push(JSON.parse(String(init.body))); return new Response(JSON.stringify({ ok: true })); }); return sent; };
  it('waits in the list, gets the next number, is sent as a PDF, and can be cancelled and sent again', async () => {
    const { db, call } = setup();
    db.database.prepare("UPDATE sync_records SET data=json_set(data,'$.email','moshe@example.com','$.address','432 Tash Ch de  Apt #A J7E 4H4','$.preTitle','מו\"ה','$.postTitle','הי\"ו') WHERE id='d1'").run();
    seed(db, 'transactions', 'card1', { donorId: 'd1', amount: 180, currency: 'CAD', date: '2026-11-03', method: 'credit_card', type: 'approved' });
    seed(db, 'transactions', 'cash1', { donorId: 'd1', amount: 50, currency: 'CAD', date: '2026-11-03', method: 'cash', type: 'approved' });
    seed(db, 'transactions', 'check1', { donorId: 'd1', amount: 360, currency: 'CAD', date: '2026-11-04', method: 'check', type: 'pending' });
    expect((await call('GET', '/v3/receipts?status=waiting')).body.items.map((item: any) => item.paymentId)).toEqual(['card1']);
    expect((await call('PUT', '/v3/receipts/settings', { settings: { nextNumber: 664 } })).status).toBe(200);
    expect((await call('GET', '/v3/receipts/settings')).body.nextNumber).toBe('00664');
    await connectEmail(call); const sent = captureEmails();
    const result = await call('POST', '/v3/receipts/send', { paymentIds: ['card1', 'cash1', 'check1'] });
    expect(result.body).toMatchObject({ sent: 1, failed: 2 });
    expect(result.body.results[0]).toMatchObject({ ok: true, receiptNumber: '00664' });
    expect(sent[0]).toMatchObject({ to: 'moshe@example.com', subject: 'Official donation receipt #00664', attachments: [{ filename: 'Receipt-00664.pdf', mimeType: 'application/pdf' }] });
    expect(Buffer.from(sent[0].attachments[0].base64, 'base64').subarray(0, 5).toString()).toBe('%PDF-');
    expect((await call('GET', '/v3/receipts?status=waiting')).body.items).toHaveLength(0);
    // Sending again does not make a second receipt.
    expect((await call('POST', '/v3/receipts/send', { paymentIds: ['card1'] })).body.results[0]).toMatchObject({ ok: true, already: true, receiptNumber: '00664' });
    expect((await call('PUT', '/v3/receipts/settings', { settings: { nextNumber: 600 } })).status).toBe(400);
    // Cancel: the old number stays as void, and the payment gets a new number.
    expect((await call('POST', '/v3/receipts/card1/void', { reason: 'Wrong amount' })).status).toBe(200);
    expect((await call('GET', '/v3/receipts?status=void')).body.items.map((item: any) => item.receiptNumber)).toEqual(['00664']);
    expect((await call('POST', '/v3/receipts/send', { paymentIds: ['card1'] })).body.results[0]).toMatchObject({ ok: true, receiptNumber: '00665' });
    expect((await call('GET', '/v3/receipts?status=sent')).body.items).toMatchObject([{ receiptNumber: '00665', addressLine1: '432 Chemin de Tash, Apt #A', addressLine2: 'Boisbriand, Quebec J7E 4H4', yiddishPreTitle: 'מו"ה' }]);
  });
  it('sends by itself after a card payment is saved, when turned on', async () => {
    const { db, call } = setup();
    db.database.prepare("UPDATE sync_records SET data=json_set(data,'$.email','moshe@example.com') WHERE id='d1'").run();
    seed(db, 'accounts', 'undeposited', { name: 'Undeposited Funds', type: 'asset', currency: 'CAD' });
    seed(db, 'accounts', 'donations', { name: 'Canadian Donations', type: 'revenue', currency: 'CAD' });
    await connectEmail(call); const sent = captureEmails();
    const pay = (method: string) => call('POST', '/v3/payments', { requestId: crypto.randomUUID(), donorId: 'd1', amount: 100, currency: 'CAD', method, date: torontoToday(), sourceAccountId: 'undeposited', offsetAccountId: 'donations', type: 'approved' });
    expect((await pay('credit_card')).status).toBeLessThan(300);
    expect(sent).toHaveLength(0); // turned off
    await call('PUT', '/v3/receipts/settings', { receiptAuto: true });
    expect((await pay('credit_card')).status).toBeLessThan(300);
    expect(sent).toHaveLength(1);
    expect((await pay('cash')).status).toBeLessThan(300);
    expect(sent).toHaveLength(1); // cash does not get a receipt
  });
});

describe('balance text number', () => {
  const sign = async (token: string, url: string, params: Record<string, string>) => {
    const payload = url + Object.keys(params).sort().map(key => key + params[key]).join('');
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(token), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    return Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))).toString('base64');
  };
  it('answers only signed texts from allowed phones, with balance, choices and payments', async () => {
    const { db } = setup();
    const year = torontoToday().slice(0, 4);
    seed(db, 'donors', 'd2', { name: 'Yoel Weiss', hebFirstName: 'יואל', hebLastName: 'ווייס', phone: '(450) 555-1111' });
    seed(db, 'donors', 'd3', { name: 'Chaim Gross', mobilePhone: '438.555.1111' });
    seed(db, 'transactions', 'pay1', { donorId: 'd1', amount: 500, currency: 'CAD', date: `${year}-02-01`, method: 'check', checkNumber: '77', type: 'approved', pledgeAllocations: [{ pledgeId: 'p1', amount: 500 }] });
    const app = new Hono();
    app.use('*', async (c, next) => { c.set('userRoles', ['administrator']); await next(); });
    registerServerDataRoutes(app as any);
    const admin = (method: string, path: string, body: any) => app.request(`http://charity.test${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, { DB: db } as any);
    await admin('PUT', '/v3/messaging/settings', { twilioSid: 'AC' + '1'.repeat(32), twilioToken: 'secret-token', twilioFrom: '+15145550000', settings: { smsSenders: '514-555-9999' } });
    const url = 'http://charity.test/v3/sms/inbound';
    const text = async (from: string, body: string, signed = true) => {
      const params = { From: from, Body: body, To: '+15145550000' };
      const response = await app.request(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Twilio-Signature': signed ? await sign('secret-token', url, params) : 'bad' }, body: new URLSearchParams(params).toString() }, { DB: db } as any);
      return { status: response.status, text: (await response.text()).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&') };
    };
    expect((await text('+15145559999', '2163', false)).status).toBe(403);
    expect((await text('+15145550001', '2163')).text).toBe(''); // not on the list
    const one = await text('+15145559999', '2163');
    expect(one.text).toContain('משה קליין (Moshe Klein)');
    expect(one.text).toContain(`Balance ${year}: $1,300.00 (pledged $1,800.00, paid $500.00)`);
    const payments = await text('+15145559999', 'p');
    expect(payments.text).toContain(`${year}-02-01: $500.00 check #77`);
    const two = await text('+15145559999', '1111');
    expect(two.text).toContain('2 donors have a phone ending 1111');
    expect((await text('+15145559999', '2')).text).toContain('יואל ווייס (Yoel Weiss)');
    expect((await text('+15145559999', '0000')).text).toBe('No donor has a phone ending with 0000.');
  });
});

describe('US dollar cards (Stripe) and one-time cards', () => {
  it('saves a Stripe payment only when Stripe says it was charged, and only once', async () => {
    const { db, call } = setup();
    seed(db, 'accounts', 'stripe', { name: 'Stripe USD', type: 'asset', currency: 'USD' });
    seed(db, 'accounts', 'usdon', { name: 'US Donations', type: 'revenue', currency: 'USD' });
    expect((await call('PUT', '/v3/stripe/settings', { publishableKey: 'nope' })).status).toBe(400);
    expect((await call('PUT', '/v3/stripe/settings', { publishableKey: 'pk_test_abc', secretKey: 'sk_test_xyz' })).status).toBe(200);
    expect((await call('GET', '/v3/stripe/settings')).body).toMatchObject({ configured: true, testMode: true, publishableKey: 'pk_test_abc' });
    const stripeCalls: any[] = [];
    vi.stubGlobal('fetch', async (url: string, init: any) => {
      stripeCalls.push({ url: String(url), method: init?.method, body: String(init?.body || ''), auth: init?.headers?.Authorization });
      if (String(url).endsWith('/payment_intents')) return new Response(JSON.stringify({ id: 'pi_123', client_secret: 'pi_123_secret' }));
      return new Response(JSON.stringify({ id: 'pi_123', status: 'succeeded', amount: 10000, amount_received: 10000, currency: 'usd', metadata: { donorId: 'd1' }, latest_charge: { id: 'ch_1', payment_method_details: { card: { last4: '4242', brand: 'visa' } } } }));
    });
    const intent = await call('POST', '/v3/stripe/payment-intent', { donorId: 'd1', amount: 100, currency: 'USD', requestId: 'r1' });
    expect(intent.body).toMatchObject({ success: true, id: 'pi_123', clientSecret: 'pi_123_secret' });
    expect(stripeCalls[0]).toMatchObject({ method: 'POST', auth: 'Bearer sk_test_xyz' });
    expect(stripeCalls[0].body).toContain('amount=10000');
    const pay = (amount: number, requestId = crypto.randomUUID()) => call('POST', '/v3/payments', { requestId, donorId: 'd1', amount, currency: 'USD', exchangeRate: 1.4, method: 'credit_card', date: torontoToday(), sourceAccountId: 'stripe', offsetAccountId: 'usdon', stripePaymentIntentId: 'pi_123' });
    expect((await pay(90)).body.error).toContain('not the same');
    const saved = await pay(100);
    expect(saved.body.item).toMatchObject({ gateway: 'stripe', stripePaymentIntentId: 'pi_123', cardLast4: '4242', amountCAD: 140 });
    expect((await pay(100)).body.error).toBe('This Stripe payment was already saved.');
  });
  it('hides a one-time card from the saved cards', async () => {
    const { db, call } = setup();
    seed(db, 'paymentMethods', 'pm-saved', { donorId: 'd1', brand: 'Visa', last4: '1111', status: 'active', priority: 1 });
    seed(db, 'paymentMethods', 'pm-once', { donorId: 'd1', brand: 'Visa', last4: '2222', status: 'active', oneTime: true, priority: 2 });
    expect((await call('GET', '/v3/donors/d1/payment-methods')).body.items.map((item: any) => item.last4)).toEqual(['1111']);
  });
});
