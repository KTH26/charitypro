import React, { useCallback, useEffect, useState } from 'react';
import { CreditCard } from 'lucide-react';
import { startLiveRefresh } from '../utils/liveUpdates';

type CardDue = { id: string; name: string; currency: string; needsSetup: boolean; dueDate: string; statementDate: string; periodStart: string; amountDue: number; periodCharges: number; balance: number };

type ExpectedEntry = { date: string; donorId: string; donorName: string; amount: number; source: 'schedule' | 'waiting'; frequency?: string; chargedBy?: string };
type Expected = { method: string; currency: string; amount: number; count: number; entries?: ExpectedEntry[] };
const METHOD_NAMES: Record<string, string> = { credit_card: 'Credit card', card: 'Credit card', cash: 'Cash', check: 'Checks', vouchers: 'Vouchers', eizer: 'Eizer', bnei_leivy: 'Bnei Leivy', e_transfer: 'E-transfer', ach: 'ACH', wire: 'Wire', other: 'Other' };
const endOfMonth = () => { const now = new Date(); const last = new Date(now.getFullYear(), now.getMonth() + 1, 0); return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`; };
const money = (value: number, currency = 'CAD') => `${currency} $${Number(value || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };
const daysUntil = (date: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 86400000);
const niceDate = (date: string) => date ? new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`)) : '';
const shortDate = (date: string) => date ? new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`)) : '';

/** Dashboard box: for each credit card, what has to be paid on its next due date. */
export const CreditCardsDueBox: React.FC = () => {
  const [items, setItems] = useState<CardDue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async (silent = false) => {
    try {
      const response = await fetch(`/api/v3/credit-cards-due?today=${today()}`);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load credit cards.');
      setItems(data.items || []); setError('');
    } catch (reason: any) {
      if (!silent) setError(reason.message || 'Unable to load credit cards.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // What is scheduled to come in up to the next card due date (the first card that still has something to pay).
  const [expected, setExpected] = useState<Expected[] | null>(null);
  const [opened, setOpened] = useState<Expected | null>(null);
  const upcoming = items.filter(item => !item.needsSetup && item.dueDate && item.dueDate >= today());
  const byDate = (upcoming.filter(item => item.amountDue > 0)[0] || upcoming[0])?.dueDate || endOfMonth();
  useEffect(() => {
    if (loading) return; let cancelled = false;
    void (async () => { try { const response = await fetch(`/api/v3/expected-income?from=${today()}&to=${byDate}`); const data = await response.json(); if (!cancelled && response.ok && data.success) setExpected(data.items || []); } catch { if (!cancelled) setExpected([]); } })();
    return () => { cancelled = true; };
  }, [byDate, loading, items]);
  useEffect(() => startLiveRefresh(() => void load(true)), [load]);

  const totals = items.filter(item => !item.needsSetup).reduce<Record<string, number>>((sum, item) => ({ ...sum, [item.currency]: (sum[item.currency] || 0) + item.amountDue }), {});
  return <section className="card loans-box" style={{ padding: 0, overflow: 'hidden' }}>
    <div className="loans-box-header"><div>
      <h2 style={{ margin: 0, color: 'var(--navy)', fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}><CreditCard size={20} /> Credit Cards Due Next</h2>
      <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>{Object.keys(totals).length ? Object.entries(totals).map(([currency, total]) => `${money(total, currency)} to pay`).join(' · ') : 'Nothing to pay'}</div>
    </div></div>
    {error && <div style={{ padding: '12px 22px', color: 'var(--red)', fontWeight: 600 }}>{error}</div>}
    {loading ? <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Loading credit cards…</div>
      : items.length === 0 ? <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>No credit card accounts yet. To add one, open Chart of Accounts → New Account → Liability → Credit card.</div>
      : <div className="loans-box-scroll"><table className="loans-table">
        <thead><tr><th>Credit card</th><th style={{ textAlign: 'right' }}>Amount</th><th>Due date</th></tr></thead>
        <tbody>{items.map(item => {
          if (item.needsSetup) return <tr key={item.id}><td style={{ fontWeight: 600 }}>{item.name}</td><td colSpan={2}><a href="/chart-of-accounts" style={{ color: 'var(--red)', fontWeight: 600 }}>Set the statement day and due day</a></td></tr>;
          const days = daysUntil(item.dueDate);
          const tone = item.amountDue <= 0 ? '' : days <= 3 ? 'is-late' : days <= 7 ? 'is-soon' : '';
          return <tr key={item.id}>
            <td style={{ fontWeight: 600 }}>{item.name}<small style={{ display: 'block', color: 'var(--text-muted)', fontWeight: 600 }}>Statement {shortDate(item.periodStart)} – {shortDate(item.statementDate)}</small></td>
            <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>{item.amountDue > 0 ? money(item.amountDue, item.currency) : <span className="card-due-paid">Paid ✓</span>}</td>
            <td><span className={`loan-due ${tone}`}>{niceDate(item.dueDate)}<small>{days === 0 ? 'Due today' : `in ${days} day${days === 1 ? '' : 's'}`}</small></span></td>
          </tr>;
        })}</tbody>
      </table></div>}
    {expected && <div style={{ borderTop: '1px solid var(--border)' }}>
      <div style={{ padding: '12px 16px 4px', fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>Expected to come in by {niceDate(byDate)}</div>
      {expected.length === 0 ? <div style={{ padding: '4px 16px 14px', color: 'var(--text-muted)', fontSize: 13 }}>Nothing scheduled.</div> : <table className="loans-table"><tbody>
        {expected.map(item => <tr key={`${item.method}-${item.currency}`} onClick={() => setOpened(item)} style={{ cursor: 'pointer' }} title="Click to see the payments"><td style={{ fontWeight: 600, padding: '5px 16px' }}>{METHOD_NAMES[item.method] || item.method.replace(/_/g, ' ')}{item.currency === 'USD' ? ' (USD)' : ''} <small style={{ color: 'var(--text-muted)', fontWeight: 500 }}>· {item.count} payment{item.count === 1 ? '' : 's'}</small></td><td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600, color: 'var(--green)', padding: '5px 16px' }}>{money(item.amount, item.currency)}</td></tr>)}
        {(['CAD', 'USD'] as const).filter(currency => expected.some(item => item.currency === currency)).map(currency => <tr key={`total-${currency}`} style={{ fontWeight: 700, borderTop: '1px solid var(--border)' }}><td style={{ padding: '7px 16px' }}>Total {currency}</td><td style={{ textAlign: 'right', whiteSpace: 'nowrap', padding: '7px 16px' }}>{money(expected.filter(item => item.currency === currency).reduce((sum, item) => sum + item.amount, 0), currency)}</td></tr>)}
      </tbody></table>}
    </div>}
    {opened && <div className="modal-overlay" onClick={() => setOpened(null)}><div className="modal" onClick={event => event.stopPropagation()} style={{ maxWidth: 760, width: '94%' }}>
      <div className="modal-header"><div><h2 style={{ margin: 0 }}>{METHOD_NAMES[opened.method] || opened.method.replace(/_/g, ' ')}{opened.currency === 'USD' ? ' (USD)' : ''}: {money(opened.amount, opened.currency)}</h2><small style={{ color: 'var(--text-muted)' }}>{opened.count} payment{opened.count === 1 ? '' : 's'} expected from {niceDate(today())} to {niceDate(byDate)}</small></div><button className="modal-close" onClick={() => setOpened(null)}>×</button></div>
      <div className="modal-body"><div className="table-container" style={{ maxHeight: '60vh', overflow: 'auto' }}><table>
        <thead><tr><th>Date</th><th>Donor</th><th>From</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
        <tbody>{(opened.entries || []).map((entry, index) => <tr key={index}>
          <td style={{ whiteSpace: 'nowrap' }}>{niceDate(entry.date)}</td>
          <td style={{ fontWeight: 600 }}>{entry.donorName}</td>
          <td style={{ color: 'var(--text-muted)' }}>{entry.source === 'waiting' ? 'Waiting payment' : `Schedule, ${entry.frequency || 'monthly'}${entry.chargedBy ? ` (${entry.chargedBy === 'sola' ? 'Sola' : entry.chargedBy === 'donorfuse' ? 'DonorFuse' : entry.chargedBy === 'stripe' ? 'Stripe' : entry.chargedBy === 'charitypro' ? 'CharityPro' : entry.chargedBy})` : ''}`}</td>
          <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>{money(entry.amount, opened.currency)}</td>
        </tr>)}</tbody>
        <tfoot><tr style={{ fontWeight: 700 }}><td colSpan={3}>Total ({opened.count})</td><td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{money(opened.amount, opened.currency)}</td></tr></tfoot>
      </table></div></div>
    </div></div>}
  </section>;
};
