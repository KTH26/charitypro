import React, { useCallback, useEffect, useState } from 'react';
import { CreditCard } from 'lucide-react';
import { startLiveRefresh } from '../utils/liveUpdates';

type CardDue = { id: string; name: string; currency: string; needsSetup: boolean; dueDate: string; statementDate: string; periodStart: string; amountDue: number; periodCharges: number; balance: number };

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
  useEffect(() => startLiveRefresh(() => void load(true)), [load]);

  const totals = items.filter(item => !item.needsSetup).reduce<Record<string, number>>((sum, item) => ({ ...sum, [item.currency]: (sum[item.currency] || 0) + item.amountDue }), {});
  return <section className="card loans-box" style={{ padding: 0, overflow: 'hidden' }}>
    <div className="loans-box-header"><div>
      <h2 style={{ margin: 0, color: 'var(--navy)', fontSize: 19, display: 'flex', alignItems: 'center', gap: 8 }}><CreditCard size={20} /> Credit Cards Due Next</h2>
      <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>{Object.keys(totals).length ? Object.entries(totals).map(([currency, total]) => `${money(total, currency)} to pay`).join(' · ') : 'Nothing to pay'}</div>
    </div></div>
    {error && <div style={{ padding: '12px 22px', color: 'var(--red)', fontWeight: 700 }}>{error}</div>}
    {loading ? <div style={{ padding: 34, textAlign: 'center', color: 'var(--text-muted)' }}>Loading credit cards…</div>
      : items.length === 0 ? <div style={{ padding: 34, textAlign: 'center', color: 'var(--text-muted)' }}>No credit card accounts yet. To add one, open Chart of Accounts → New Account → Liability → Credit card.</div>
      : <div className="loans-box-scroll"><table className="loans-table">
        <thead><tr><th>Credit card</th><th style={{ textAlign: 'right' }}>Amount</th><th>Due date</th></tr></thead>
        <tbody>{items.map(item => {
          if (item.needsSetup) return <tr key={item.id}><td style={{ fontWeight: 700 }}>{item.name}</td><td colSpan={2}><a href="/chart-of-accounts" style={{ color: 'var(--red)', fontWeight: 800 }}>Set the statement day and due day</a></td></tr>;
          const days = daysUntil(item.dueDate);
          const tone = item.amountDue <= 0 ? '' : days <= 3 ? 'is-late' : days <= 7 ? 'is-soon' : '';
          return <tr key={item.id}>
            <td style={{ fontWeight: 700 }}>{item.name}<small style={{ display: 'block', color: 'var(--text-muted)', fontWeight: 600 }}>Statement {shortDate(item.periodStart)} – {shortDate(item.statementDate)}</small></td>
            <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 800 }}>{item.amountDue > 0 ? money(item.amountDue, item.currency) : <span className="card-due-paid">Paid ✓</span>}</td>
            <td><span className={`loan-due ${tone}`}>{niceDate(item.dueDate)}<small>{days === 0 ? 'Due today' : `in ${days} day${days === 1 ? '' : 's'}`}</small></span></td>
          </tr>;
        })}</tbody>
      </table></div>}
  </section>;
};
