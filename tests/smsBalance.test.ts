import { describe, expect, it } from 'vitest';
import { addUtc, calculatePledgeFinancials } from '../functions/api/server-data';
import { balanceLines } from '../functions/api/sms';

const donorId = 'd1';
const pledges = [
  { id: 'p2025', donorId, amount: 720, date: '2025-03-01' },
  { id: 'p2026', donorId, amount: 1200, date: '2026-03-01' },
];
const pay = (id: string, date: string, amount: number, pledgeId: string) => ({ id, donorId, date, amount, type: 'approved', method: 'credit_card', pledgeId });
const payments = [
  pay('a', '2025-06-20', 600, 'p2025'), pay('b', '2026-01-20', 60, 'p2025'), pay('c', '2026-02-20', 60, 'p2025'),
  pay('d', '2026-04-01', 300, 'p2026'), pay('e', '2026-07-02', 300, 'p2026'), pay('f', '2026-10-02', 300, 'p2026'),
];
// Two more card charges of $300 planned (Dec and Jan): $300 more than the $300 still owed.
const schedules = [{ id: 's', donorId, amount: 300, frequency: 'monthly', nextDate: '2026-12-02', endDate: '2027-01-02', active: true }];

describe('balance text message', () => {
  it('shows what is still owed and the planned card charges apart, never a negative balance from planned charges', () => {
    const lines = balanceLines(calculatePledgeFinancials(pledges, payments, schedules), 2026);
    expect(lines).toEqual([
      '2026 pledge: $1,200, paid on it: $900',
      'Still owes: $300',
      'Card will still charge: $600 ($300 more than he owes)',
      'All years still owes: $300',
    ]);
  });

  it('shows cents only when there are cents, and an overpayment in words', () => {
    const lines = balanceLines(calculatePledgeFinancials([{ id: 'p', donorId, amount: 100, date: '2026-01-05' }], [pay('x', '2026-02-01', 150.5, 'p')], []), 2026);
    expect(lines).toEqual(['2026 pledge: $100, paid on it: $150.50', 'Paid $50.50 more than the pledge.']);
  });

  it('counts a Sola plan of "every 92 days" right: only Jan 2 is still to come', () => {
    const every92 = [{ id: 's', donorId, amount: 300, frequency: 'daily', intervalCount: 92, nextDate: '2027-01-02', endDate: '2027-01-02', active: true }];
    const lines = balanceLines(calculatePledgeFinancials(pledges, payments, every92), 2026);
    expect(lines[2]).toBe('Card will still charge: $300');
  });

  it('steps dates by the count: every 4 weeks, every 92 days', () => {
    expect(addUtc('2026-10-29', 'weekly', 4)).toBe('2026-11-26');
    expect(addUtc('2026-10-02', 'daily', 92)).toBe('2027-01-02');
    expect(addUtc('2026-01-31', 'monthly')).toBe('2026-03-03');
    expect(addUtc('2026-01-15', 'monthly', 3)).toBe('2026-04-15');
  });

  it('says when there is no pledge this year', () => {
    expect(balanceLines([], 2026)).toEqual(['No pledge for 2026.']);
  });
});
