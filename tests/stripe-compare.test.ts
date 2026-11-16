// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { matchStripe, simplifyCharge } from '../functions/api/stripe';

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
});
