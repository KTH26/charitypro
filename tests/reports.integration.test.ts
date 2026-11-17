// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { buildReportRows, registerReportDataRoutes } from '../functions/api/report-data';
import { groupRows, presetSetup, PRESETS, rangeDates, runReport, defaultSetup, totalsOf } from '../src/utils/reportSources';
import { buildWorkbook } from '../src/utils/excel';
import { moneyText } from '../src/utils/money';

const { DatabaseSync } = (process as any).getBuiltinModule('node:sqlite');
class MockStatement {
  constructor(private database: any, private sql: string, private values: any[] = []) {}
  bind(...values: any[]) { return new MockStatement(this.database, this.sql, values); }
  async all() { return { results: this.database.prepare(this.sql).all(...this.values) as any[] }; }
  async first() { return (this.database.prepare(this.sql).get(...this.values) as any) || null; }
  async run() { return this.database.prepare(this.sql).run(...this.values); }
}
class MockD1 {
  readonly database = new DatabaseSync(':memory:');
  constructor() { this.database.exec(readFileSync(join(process.cwd(), 'scripts', 'staging-schema.sql'), 'utf8')); }
  prepare(sql: string) { return new MockStatement(this.database, sql); }
  close() { this.database.close(); }
}
const databases: MockD1[] = [];
afterEach(() => { while (databases.length) databases.pop()!.close(); });

const seed = () => {
  const db = new MockD1(); databases.push(db);
  const put = (type: string, data: any) => db.database.prepare("INSERT INTO sync_records(id,type,data,updated_at,revision,is_deleted) VALUES(?,?,?,1,1,0)").run(data.id, type, JSON.stringify(data));
  put('donors', { id: 'd1', name: 'Moshe Cohen', hebFirstName: 'משה', hebLastName: 'כהן', phone: '514-555-1111', email: 'm@example.com', displayId: '101', title: 'מו"ץ' });
  put('donors', { id: 'd2', name: 'Yaakov Klein', phone: '' });
  put('accounts', { id: '203', name: 'Donations CAD', type: 'income' });
  put('pledges', { id: 'p1', donorId: 'd1', amount: 1000, date: '2026-01-01', currency: 'CAD', category: 'General', tags: ['2026 campaign', 'Pledge 2026'] });
  put('transactions', { id: 't1', donorId: 'd1', amount: 300, date: '2026-02-01', type: 'approved', method: 'check', currency: 'CAD', pledgeId: 'p1', offsetAccountId: '203', depositStatus: 'undeposited' });
  put('transactions', { id: 't2', donorId: 'd1', amount: 100, amountCAD: 135, date: '2025-05-01', type: 'approved', method: 'cash', currency: 'USD' });
  put('transactions', { id: 't3', donorId: 'd2', amount: 50, date: '2026-03-01', type: 'declined', method: 'credit_card', currency: 'CAD' });
  put('transactions', { id: 'batch', donorId: 'd1', amount: 999, date: '2026-03-01', type: 'approved', method: 'check', isBatch: true });
  put('bills', { id: 'b1', vendor: 'Hydro', amount: 200, currency: 'CAD', dueDate: '2026-09-01', status: 'unpaid' });
  put('bills', { id: 'b2', vendor: 'Hydro', amount: 100, currency: 'USD', exchangeRate: 1.4, dueDate: '2026-08-01', paidDate: '2026-08-02', status: 'paid' });
  return db;
};

describe('reports', () => {
  it('builds payments, pledges, donors and bills rows with names and balances', async () => {
    const db = seed(); const today = '2026-11-15';
    const payments = await buildReportRows(db, 'payments', today);
    expect(payments.map(row => row.id).sort()).toEqual(['t1', 't2', 't3']);
    const t1 = payments.find(row => row.id === 't1')!;
    expect(t1).toMatchObject({ donor: 'Moshe Cohen', hebrewName: 'משה כהן מו"ץ', method: 'Check', status: 'Approved', deposit: 'Not deposited', incomeAccount: 'Donations CAD', pledgeDate: '2026-01-01', month: '2026-02' });
    expect(payments.find(row => row.id === 't2')!.amountCAD).toBe(135);
    const pledges = await buildReportRows(db, 'pledges', today);
    expect(pledges[0]).toMatchObject({ donor: 'Moshe Cohen', amount: 1000, paid: 300, balance: 700, open: 'Open' });
    const donors = await buildReportRows(db, 'donors', today);
    expect(donors.find(row => row.id === 'd1')).toMatchObject({ totalGiven: 435, givenThisYear: 300, givenLastYear: 135, gifts: 2, lastGift: '2026-02-01', balanceOwed: 700, pledges: 1, openPledges: 1, title: 'מו"ץ', firstName: 'Moshe', lastName: 'Cohen', hebFirstName: 'משה', hebLastName: 'כהן' });
    expect(t1).toMatchObject({ firstName: 'Moshe', lastName: 'Cohen', hebFirstName: 'משה', hebLastName: 'כהן', title: 'מו"ץ', pledgeTags: '2026 campaign, Pledge 2026' });
    expect(pledges[0]).toMatchObject({ title: 'מו"ץ', tags: '2026 campaign, Pledge 2026', lastName: 'Cohen' });
    expect(groupRows(pledges, { ...defaultSetup('pledges'), groupBy: 'tags' }).map(group => [group.key, group.sums.balance])).toEqual([['2026 campaign', 700], ['Pledge 2026', 700]]);
    expect(groupRows(payments, { ...defaultSetup('payments'), groupBy: 'pledgeTags' }).map(group => [group.key, group.count])).toEqual([['(no tag)', 2], ['2026 campaign', 1], ['Pledge 2026', 1]]);
    const bills = await buildReportRows(db, 'bills', today);
    expect(bills.find(row => row.id === 'b1')).toMatchObject({ status: 'Unpaid', daysOverdue: 75, aging: '61-90 days' });
    expect(bills.find(row => row.id === 'b2')).toMatchObject({ status: 'Paid', amountCAD: 140 });
    const vendors = await buildReportRows(db, 'vendors', today);
    expect(vendors[0]).toMatchObject({ vendor: 'Hydro', bills: 2, unpaid: 200, paid: 140 });
  });

  it('serves the rows to administrators only', async () => {
    const db = seed();
    const make = (roles: string[]) => { const app = new Hono(); app.use('*', async (c: any, next) => { c.set('userRoles', roles); await next(); }); registerReportDataRoutes(app); return app; };
    const ok = await make(['administrator']).request('/v3/report-data?source=bills', {}, { DB: db } as any);
    expect((await ok.json() as any).rows).toHaveLength(2);
    expect((await make(['fundraiser']).request('/v3/report-data?source=bills', {}, { DB: db } as any)).status).toBe(403);
    expect((await make(['administrator']).request('/v3/report-data?source=nothing', {}, { DB: db } as any)).status).toBe(400);
    const saved = await make(['administrator']).request('/v3/saved-reports', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reports: [{ name: 'Mine', source: 'bills' }] }) }, { DB: db } as any);
    expect(saved.status).toBe(200);
    expect((await (await make(['administrator']).request('/v3/saved-reports', {}, { DB: db } as any)).json() as any).reports[0].name).toBe('Mine');
  });

  it('filters, groups and totals', async () => {
    const db = seed(); const today = '2026-11-15';
    const rows = await buildReportRows(db, 'payments', today);
    const setup = { ...defaultSetup('payments'), range: 'this_year', filters: [{ column: 'status', op: 'is' as const, value: 'approved' }] };
    expect(runReport(rows, setup, today).map(row => row.id)).toEqual(['t1']);
    const all = runReport(rows, { ...defaultSetup('payments'), filters: [{ column: 'amountCAD', op: 'more' as const, value: '100' }] }, today);
    expect(all.map(row => row.id).sort()).toEqual(['t1', 't2']);
    const grouped = groupRows(all, { ...defaultSetup('payments'), groupBy: 'method', sortBy: 'amountCAD' });
    expect(grouped.map(group => [group.key, group.sums.amountCAD])).toEqual([['Check', 300], ['Cash', 135]]);
    expect(totalsOf(all, defaultSetup('payments')).amountCAD).toBe(435);
    expect(rangeDates('last_month', '2026-01-10')).toEqual(['2025-12-01', '2025-12-31']);
    expect(rangeDates('this_month', '2028-02-03')).toEqual(['2028-02-01', '2028-02-29']);
    for (const group of PRESETS) for (const preset of group.items) expect(presetSetup(preset).columns.length).toBeGreaterThan(0);
  });

  it('makes a valid Excel (.xlsx) zip', async () => {
    const blob = buildWorkbook([{ name: 'Payments', title: 'Test', columns: [{ key: 'date', header: 'Date', type: 'date' }, { key: 'donor', header: 'Donor', type: 'text' }, { key: 'amount', header: 'Amount', type: 'money' }], rows: [{ date: '2026-02-01', donor: 'משה <&> "x"', amount: 300 }], totals: { date: 'Total', amount: 300 } }]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe('PK');
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('xl/worksheets/sheet1.xml');
    expect(text).toContain('משה &lt;&amp;&gt; &quot;x&quot;');
    expect(text).toContain('<v>46054</v>'); // 2026-02-01 as an Excel date
  });

  it('shows cents only when there are cents', async () => {
    expect([moneyText(100), moneyText(100.67), moneyText(1234.5), moneyText(-5.5), moneyText(0.1 + 0.2)]).toEqual(['$100', '$100.67', '$1,234.50', '-$5.50', '$0.30']);
    const blob = buildWorkbook([{ name: 'S', columns: [{ key: 'amount', header: 'Amount', type: 'money' }], rows: [{ amount: 100 }, { amount: 100.67 }], totals: { amount: 200.67 } }]);
    const text = new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()));
    expect(text).toContain('s="7"><v>100</v>'); // whole dollars: $100
    expect(text).toContain('s="2"><v>100.67</v>'); // with cents: $100.67
    expect(text).toContain('s="4"><v>200.67</v>');
  });
});

import { buildMonthlyGiving, howText, monthlyGivingSheet, monthsBetween } from '../src/utils/monthlyGiving';
describe('monthly giving by donor', () => {
  const donors = [{ id: 'd1', name: 'Moshe Cohen', donorNumber: '101', hebrewName: 'משה כהן' }, { id: 'd2', name: 'Aaron Adler' }, { id: 'd3', name: 'Zev Zeller' }];
  const payments = [
    { donorId: 'd1', date: '2026-01-05', status: 'Approved', method: 'Cash', amountCAD: 100 },
    { donorId: 'd1', date: '2026-01-10', status: 'Approved', method: 'Credit card', amountCAD: 100 },
    { donorId: 'd1', date: '2026-01-20', status: 'Approved', method: 'Vouchers', amountCAD: 100 },
    { donorId: 'd1', date: '2026-02-01', status: 'Approved', method: 'Cash', amountCAD: 50 },
    { donorId: 'd1', date: '2026-02-03', status: 'Declined', method: 'Credit card', amountCAD: 999 },
    { donorId: 'd2', date: '2026-02-11', status: 'Approved', method: 'Check', amountCAD: 400 },
    { donorId: 'd2', date: '2025-12-31', status: 'Approved', method: 'Check', amountCAD: 7 },
  ];
  it('gives each donor a total and a "how paid" per month', () => {
    expect(monthsBetween('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    const report = buildMonthlyGiving(payments, donors, '2026-01', '2026-03', { sort: 'first' });
    expect(report.months).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(report.rows.map(row => row.donor)).toEqual(['Aaron Adler', 'Moshe Cohen']);
    const moshe = report.rows.find(row => row.donorId === 'd1')!;
    expect(moshe.months['2026-01']).toMatchObject({ amount: 300, how: 'Cash $100 + Credit card $100 + Vouchers $100' });
    expect(moshe.months['2026-02']).toMatchObject({ amount: 50, how: 'Cash' });
    expect(moshe.total).toBe(350);
    expect(report.totals['2026-02']).toMatchObject({ amount: 450, how: 'Check $400 + Cash $50' });
    expect(report.grandTotal).toBe(750);
    expect(buildMonthlyGiving(payments, donors, '2026-01', '2026-03', { onlyGivers: false }).rows).toHaveLength(3);
    expect(buildMonthlyGiving(payments, donors, '2026-01', '2026-03', { sort: 'total' }).rows[0].donor).toBe('Aaron Adler');
    expect(howText({ Cash: 10.5, Check: 20 })).toBe('Check $20 + Cash $10.50');
    const sheet = monthlyGivingSheet(report, 'T');
    expect(sheet.columns.map(column => column.header).slice(0, 10)).toEqual(['Donor #', 'First name', 'Last name', 'Hebrew first name', 'Hebrew last name', 'Title', 'Phone', 'Jan 2026 total', 'Jan 2026 how paid', 'Feb 2026 total']);
    expect(sheet.rows[1]['2026-01-how']).toBe('Cash $100 + Credit card $100 + Vouchers $100');
    expect(sheet.rows[0]['2026-01-amount']).toBe('');
  });
});

describe('monthly giving sort orders', () => {
  const donors = [
    { id: 'a', name: 'Aaron Zeller', firstName: 'Aaron', lastName: 'Zeller', hebFirstName: 'אהרן', hebLastName: 'צעלער' },
    { id: 'b', name: 'Zev Adler', firstName: 'Zev', lastName: 'Adler', hebFirstName: 'זאב', hebLastName: 'אדלער' },
    { id: 'c', name: 'Moshe Klein', firstName: 'Moshe', lastName: 'Klein', hebFirstName: 'משה', hebLastName: '', title: 'משב"ק' },
  ];
  const payments = donors.map((donor, index) => ({ donorId: donor.id, date: '2026-01-02', status: 'Approved', method: 'Cash', amountCAD: (index + 1) * 10 }));
  const order = (sort: any) => buildMonthlyGiving(payments, donors, '2026-01', '2026-01', { sort }).rows.map(row => row.donorId).join('');
  it('sorts by first, last, Hebrew last and Hebrew first name, or by total', () => {
    expect(order('first')).toBe('acb');
    expect(order('last')).toBe('bca');
    expect(order('hebLast')).toBe('bac'); // אדלער, צעלער, then the donor with no Hebrew last name
    expect(order('hebFirst')).toBe('abc'); // אהרן, זאב, משה
    expect(order('total')).toBe('cba');
    expect(order('title')).toBe('cba'); // the donor with a tag first, then by last name
  });
});
