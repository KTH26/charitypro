// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calculatePledgeFinancials, loadDonorAccount, paymentsFromOtherDonors, solaReference } from '../functions/api/server-data';

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
  async batch(statements: MockStatement[]) { const results = []; for (const statement of statements) results.push(await statement.execute()); return results; }
  close() { this.database.close(); }
}
const databases: MockD1[] = [];
afterEach(() => { while (databases.length) databases.pop()!.close(); });
const put = (db: MockD1, type: string, item: any) => db.database.prepare("INSERT INTO sync_records(id,type,data,updated_at,revision,is_deleted) VALUES(?,?,?,?,1,0)").run(item.id, type, JSON.stringify(item), Date.now());

const pledge = (id: string, donorId: string, amount: number, date = '2026-03-01') => ({ id, donorId, amount, date });
const pay = (id: string, donorId: string, amount: number, extra: any = {}) => ({ id, donorId, amount, date: '2026-05-01', type: 'approved', method: 'check', ...extra });

describe('what a pledge counts as paid', () => {
  it('counts every payment whose note says "Ref: Check" or "Ref: Credit…" (they are not Sola numbers)', () => {
    const payments = [1, 2, 3].map(n => pay(`p${n}`, 'd', 100, { pledgeId: 'x', notes: `Added from DonorFuse. Payment ID: ${n}. Ref: Credit Office ${n}/12` }));
    payments.push(pay('p4', 'd', 100, { pledgeId: 'x', notes: 'Ref: Check' }), pay('p5', 'd', 100, { pledgeId: 'x', notes: 'Ref: Check' }));
    expect(calculatePledgeFinancials([pledge('x', 'd', 1200)], payments, [])[0].paid).toBe(500);
    expect(solaReference({ notes: 'Ref: Check' })).toBe(''); expect(solaReference({ notes: 'Imported via Sola Sync. Ref: 11205728392' })).toBe('11205728392');
  });

  it('still counts the same Sola card charge only once', () => {
    const payments = [pay('a', 'd', 100, { pledgeId: 'x', notes: 'Ref: 11205728392' }), pay('b', 'd', 100, { pledgeId: 'x', solaRef: '11205728392' })];
    expect(calculatePledgeFinancials([pledge('x', 'd', 1200)], payments, [])[0].paid).toBe(100);
  });

  it('counts a check split between brothers on each brother\'s pledge', () => {
    const check = pay('c', 'moishe', 9000, { pledgeAllocations: [{ pledgeId: 'm', amount: 3000 }, { pledgeId: 'z', amount: 3000 }, { pledgeId: 'v', amount: 3000 }] });
    const result = calculatePledgeFinancials([pledge('m', 'moishe', 6000), pledge('z', 'zalmen', 6000), pledge('v', 'david', 6000)], [check], []);
    expect(result.map(item => item.paid)).toEqual([3000, 3000, 3000]);
    // A payment without a pledge link is never counted (not by date, not for any donor).
    expect(calculatePledgeFinancials([pledge('z', 'zalmen', 6000)], [pay('loose', 'moishe', 500)], [])[0].paid).toBe(0);
  });

  it('a payment with no pledge link is never counted by its date; only an explicit link counts', () => {
    const pledges = [pledge('x', 'd', 5000, '2023-03-01')];
    expect(calculatePledgeFinancials(pledges, [pay('gift', 'd', 13000, { date: '2023-07-20', noPledge: true })], [])[0].paid).toBe(0);
    expect(calculatePledgeFinancials(pledges, [pay('gift', 'd', 13000, { date: '2023-07-20' })], [])[0].paid).toBe(0);
    expect(calculatePledgeFinancials(pledges, [pay('gift', 'd', 13000, { date: '2023-07-20', type: 'pending', method: 'credit_card' })], [])[0].pending).toBe(0);
    expect(calculatePledgeFinancials(pledges, [pay('gift', 'd', 13000, { date: '2023-07-20', pledgeId: 'x' })], [])[0].paid).toBe(13000);
    expect(calculatePledgeFinancials(pledges, [pay('gift', 'd', 13000, { date: '2023-07-20', noPledge: true, pledgeId: 'x' })], [])[0].paid).toBe(13000);
  });

  it('finds the split check for the brother\'s own page and balance', async () => {
    const db = new MockD1(); databases.push(db);
    put(db, 'donors', { id: 'moishe', name: 'Moishe' }); put(db, 'donors', { id: 'zalmen', name: 'Zalmen' });
    put(db, 'pledges', pledge('m', 'moishe', 6000)); put(db, 'pledges', pledge('z', 'zalmen', 6000));
    put(db, 'transactions', pay('c', 'moishe', 6000, { pledgeAllocations: [{ pledgeId: 'm', amount: 3000 }, { pledgeId: 'z', amount: 3000 }] }));
    put(db, 'transactions', pay('own', 'zalmen', 1000, { pledgeId: 'z' }));
    put(db, 'transactions', pay('linked', 'moishe', 500, { pledgeId: 'z' }));
    const found = await paymentsFromOtherDonors(db as any, ['zalmen', 'moishe']);
    expect((found.get('zalmen') || []).map(item => item.id).sort()).toEqual(['c', 'linked']);
    expect(found.get('moishe')).toBeUndefined();
    const account = await loadDonorAccount(db as any, 'zalmen', '2026-11-18');
    expect(account!.pledges[0].paid).toBe(4500); // 3000 of the split check + 500 linked + 1000 own
    expect(account!.approvedPayments.map((item: any) => item.id)).toEqual(['own']); // his payment list stays his own
  });
});
