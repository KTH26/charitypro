// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { matchStripe, pickPledge, simplifyCharge } from '../functions/api/stripe';

describe('Stripe compare', () => {
  it('reads a Stripe charge with the Canadian payout amount', () => {
    const row = simplifyCharge({ id: 'ch_1', payment_intent: 'pi_1', created: 1781000000, amount: 20000, currency: 'usd', status: 'succeeded', amount_refunded: 0, billing_details: { name: 'Mordechei Wieder', email: 'm@example.com' }, payment_method_details: { card: { brand: 'visa', last4: '4242' } }, metadata: { donorId: 'd1' }, balance_transaction: { amount: 27412, fee: 820, exchange_rate: 1.3706, currency: 'cad' } });
    expect(row).toMatchObject({ amount: 200, currency: 'USD', cadAmount: 274.12, cadFee: 8.2, rate: 1.3706, card: 'visa 4242', donorId: 'd1', status: 'Paid' });
  });
  it('matches by Stripe number, then donor, then name, and lists what is only on one side', () => {
    const ch = (id: string, extra: any) => ({ id, paymentIntentId: '', date: '2026-05-01', amount: 100, currency: 'USD', refunded: 0, status: 'Paid', name: '', email: '', card: '', description: '', donorId: '', cadAmount: null, cadFee: null, rate: null, payoutCurrency: '', ...extra });
    const charges = [ch('ch_a', { paymentIntentId: 'pi_a' }), ch('ch_b', { donorId: 'd2', date: '2026-05-02' }), ch('ch_c', { name: 'Yoel Klein' }), ch('ch_d', { name: 'Nobody Here', amount: 55 })];
    const payments = [
      { id: 'p1', donorId: 'd9', amount: 100, currency: 'USD', date: '2026-04-01', stripePaymentIntentId: 'pi_a' },
      { id: 'p2', donorId: 'd2', amount: 100, currency: 'USD', date: '2026-05-01' },
      { id: 'p3', donorId: 'd3', amount: 100, currency: 'USD', date: '2026-05-01' },
      { id: 'p4', donorId: 'd4', amount: 300, currency: 'USD', date: '2026-05-01' },
    ];
    const names: Record<string, string> = { d3: 'Yoel Klein', d4: 'Someone Else' };
    const result = matchStripe(charges as any, payments, id => names[id] || '');
    expect(result.matched.map(m => [m.charge.id, m.payment.id, m.how])).toEqual([['ch_a', 'p1', 'Stripe payment number'], ['ch_b', 'p2', 'Same donor, amount and date'], ['ch_c', 'p3', 'Same amount and date, similar name']]);
    expect(result.onlyStripe.map(c => c.id)).toEqual(['ch_d']);
    expect(result.onlyCharityPro.map(p => p.id)).toEqual(['p4']);
  });

  it('puts an added Stripe payment on the pledge of that campaign, else the last pledge before the date', () => {
    const campaigns = [{ id: 'c25', startDate: '2025-03-01', endDate: '2026-02-28' }, { id: 'c26', startDate: '2026-03-01', endDate: '2027-02-28' }];
    const pledges = [{ id: 'a', date: '2025-03-01', campaignId: 'c25' }, { id: 'b', date: '2026-03-01', campaignId: 'c26' }];
    expect(pickPledge(pledges, campaigns, '2026-05-10')?.id).toBe('b');
    expect(pickPledge(pledges, campaigns, '2025-12-01')?.id).toBe('a');
    expect(pickPledge([{ id: 'x', date: '2024-03-01', campaignId: 'old' }], campaigns, '2026-05-10')?.id).toBe('x');
    expect(pickPledge([], campaigns, '2026-05-10')).toBeNull();
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { registerStripeRoutes } from '../functions/api/stripe';
describe('Stripe Sync saved data', () => {
  it('shows the saved Stripe charges without asking Stripe', async () => {
    const { DatabaseSync } = (process as any).getBuiltinModule('node:sqlite');
    const sqlite = new DatabaseSync(':memory:'); sqlite.exec(readFileSync(join(process.cwd(), 'scripts', 'staging-schema.sql'), 'utf8'));
    const stmt = (sql: string, values: any[] = []): any => ({ bind: (...v: any[]) => stmt(sql, v), all: async () => ({ results: sqlite.prepare(sql).all(...values) }), first: async () => sqlite.prepare(sql).get(...values) || null, run: async () => sqlite.prepare(sql).run(...values) });
    const db = { prepare: (sql: string) => stmt(sql), batch: async (list: any[]) => Promise.all(list.map(s => s.run())) };
    const put = (type: string, id: string, data: any) => sqlite.prepare("INSERT INTO sync_records(id,type,data,updated_at,revision,is_deleted) VALUES(?,?,?,1,1,0)").run(id, type, JSON.stringify(data));
    put('donors', 'd1', { name: 'Mordechei Wieder' });
    put('transactions', 't1', { donorId: 'd1', amount: 200, currency: 'USD', date: '2026-05-01', type: 'approved', stripePaymentIntentId: 'pi_1' });
    put('stripeCharges', 'ch_1', { id: 'ch_1', paymentIntentId: 'pi_1', date: '2026-05-01', amount: 200, currency: 'USD', refunded: 0, status: 'Paid', name: 'M Wieder', email: '', card: '', description: '', donorId: 'd1', cadAmount: 274, cadFee: 8, rate: 1.37, payoutCurrency: 'CAD' });
    put('stripeCharges', 'ch_2', { id: 'ch_2', paymentIntentId: '', date: '2026-05-03', amount: 50, currency: 'USD', refunded: 0, status: 'Paid', name: 'Someone', email: '', card: '', description: '', donorId: '', cadAmount: 68, cadFee: 2, rate: 1.36, payoutCurrency: 'CAD' });
    const app = new Hono(); registerStripeRoutes(app, () => null);
    const originalFetch = globalThis.fetch; globalThis.fetch = (() => { throw new Error('Stripe must not be called'); }) as any;
    try {
      const response = await app.request('/v3/stripe/compare?from=2026-01-01', {}, { DB: db } as any);
      const json: any = await response.json();
      expect(json.saved).toBe(true);
      expect(json.counts).toMatchObject({ stripe: 2, matched: 1, onlyStripe: 1, onlyCharityPro: 0 });
    } finally { globalThis.fetch = originalFetch; }
  });
});
