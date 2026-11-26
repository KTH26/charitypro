import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Landmark } from 'lucide-react';
import { startLiveRefresh } from '../utils/liveUpdates';

type LoanItem = {
  recordType: 'bills' | 'accountTransfers' | 'transactions' | 'accounts';
  recordId: string;
  revision: number;
  date: string;
  description: string;
  amount: number;
  remaining: number;
  paid: number;
  dueDate: string;
  accountId: string;
  accountName: string;
  currency: string;
  monthly?: boolean;
  totalOwed?: number;
  paidThisMonth?: number;
  monthlyAmount?: number; // this loan is paid back this much every month
  payDay?: number;
};
type LoanAccount = { id: string; name: string; currency: string; owed: number; revision?: number; loanMonthlyPayment?: number; loanPaymentDay?: number };

const money = (value: number, currency = 'CAD') => `${currency} $${Number(value || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };
const daysUntil = (date: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 86400000);
const niceDate = (date: string) => date ? new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`)) : '';

/** Dashboard box: every loan payment still to be paid back, with its pay-back date. */
export const LoansPayableBox: React.FC = () => {
  const [items, setItems] = useState<LoanItem[]>([]);
  const [accounts, setAccounts] = useState<LoanAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<string>('');
  const [newDate, setNewDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<any | null>(null); // the loan opened to see its money in and payments
  const openHistory = async (accountId: string) => { setHistory({ loading: true }); try { const response = await fetch(`/api/v3/loans-payable/${encodeURIComponent(accountId)}/history`); const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || 'Could not load the loan.'); setHistory(data); } catch (reason: any) { setHistory(null); setError(reason.message || 'Could not load the loan.'); } };

  const load = useCallback(async (silent = false) => {
    try {
      const response = await fetch(`/api/v3/loans-payable?today=${today()}`);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load loans.');
      setItems(data.items || []);
      setAccounts(data.accounts || []);
      setError('');
    } catch (reason: any) {
      if (!silent) setError(reason.message || 'Unable to load loans.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => startLiveRefresh(() => void load(true)), [load]);

  const keyOf = (item: LoanItem) => `${item.recordType}:${item.recordId}`;
  const saveDate = async (item: LoanItem) => {
    if (!newDate) { setError('Choose a pay-back date.'); return; }
    setSaving(true); setError('');
    try {
      const response = await fetch(`/api/v3/records/${item.recordType}/${encodeURIComponent(item.recordId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ revision: item.revision, data: { loanDueDate: newDate } })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to save the pay-back date.');
      setEditing(''); setNewDate('');
      await load(true);
    } catch (reason: any) {
      setError(reason.message || 'Unable to save the pay-back date.');
      await load(true);
    } finally {
      setSaving(false);
    }
  };

  const totals = accounts.reduce<Record<string, number>>((sum, account) => ({ ...sum, [account.currency]: (sum[account.currency] || 0) + account.owed }), {});
  const overdue = items.filter(item => item.dueDate && item.dueDate < today()).length;
  const noDate = items.filter(item => !item.dueDate).length;

  return (
    <section className="card loans-box" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="loans-box-header">
        <div>
          <h2 style={{ margin: 0, color: 'var(--navy)', fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}><Landmark size={20} /> Loans to Pay Back</h2>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
            {Object.keys(totals).length ? Object.entries(totals).map(([currency, total]) => `${money(total, currency)} still owed`).join(' · ') : 'Nothing owed'}
            {overdue > 0 && <span style={{ color: 'var(--red)', fontWeight: 600 }}> · {overdue} overdue</span>}
            {noDate > 0 && <span style={{ color: 'var(--red)', fontWeight: 600 }}> · {noDate} without a date</span>}
          </div>
        </div>
        
      </div>
      {error && <div style={{ padding: '12px 22px', color: 'var(--red)', fontWeight: 600 }}>{error}</div>}

      {loading ? <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Loading loans…</div>
        : items.length === 0 ? <div style={{ padding: 20, textAlign: 'center', color: 'var(--green)', fontWeight: 600 }}>
          <CheckCircle2 size={25} style={{ verticalAlign: 'middle', marginRight: 8 }} />
          {accounts.length ? 'All loans are paid back.' : 'No loan accounts yet. To add one, open an account, choose Liability, and set the kind to “Loan”.'}
        </div>
        : <div className="loans-box-scroll"><table className="loans-table">
          <thead><tr><th>Loan account</th><th style={{ textAlign: 'right' }}>Amount</th><th>Due date</th></tr></thead>
          <tbody>{items.map(item => {
            const key = keyOf(item);
            const days = item.dueDate ? daysUntil(item.dueDate) : null;
            const tone = days === null || days < 0 ? 'is-late' : days <= 7 ? 'is-soon' : '';
            return <tr key={key}>
              <td style={{ fontWeight: 600, cursor: 'pointer' }} title="Click to see this loan: money in and payments made" onClick={() => void openHistory(item.accountId)}><span style={{ textDecoration: 'underline', textDecorationColor: 'var(--border)' }}>{item.accountName}</span>{item.monthly ? <small style={{ display: 'block', color: 'var(--text-muted)', fontWeight: 600 }}>{item.monthlyAmount ? `${item.description ? `${item.description} · ` : ''}${money(item.monthlyAmount, item.currency)} every month${item.paid ? ` · ${money(item.paid, item.currency)} of it paid` : ''}` : `Monthly payment${item.paidThisMonth ? ` · ${money(item.paidThisMonth, item.currency)} paid this month` : ''}`} · {money(item.totalOwed || 0, item.currency)} left on {item.monthlyAmount ? 'this loan' : 'the loan'}</small> : null}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>{money(item.remaining, item.currency)}</td>
              <td>{editing === key
                ? <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input type="date" value={newDate} onChange={event => setNewDate(event.target.value)} autoFocus style={{ width: 145 }} />
                  <button className="btn btn-primary btn-sm" disabled={saving || !newDate} onClick={() => void saveDate(item)}>{saving ? 'Saving…' : 'Save'}</button>
                  <button className="btn btn-ghost btn-sm" disabled={saving} onClick={() => { setEditing(''); setNewDate(''); }}>Cancel</button>
                </div>
                : <button type="button" className={`loan-due loan-due-button ${tone}`} title={item.monthly ? 'Monthly payment: click to see the loan' : 'Click to change the date'} onClick={() => { if (item.monthly) { void openHistory(item.accountId); return; } setEditing(key); setNewDate(item.dueDate || ''); }}>
                  {item.dueDate ? niceDate(item.dueDate) : 'Set a date'}
                  <small>{days === null ? 'No date yet' : days < 0 ? `${-days} day${days === -1 ? '' : 's'} late` : days === 0 ? 'Due today' : `in ${days} day${days === 1 ? '' : 's'}`}</small>
                </button>}</td>
            </tr>;
          })}</tbody>
        </table></div>}
      {history && <div className="modal-overlay" onClick={() => setHistory(null)}><div className="modal" onClick={event => event.stopPropagation()} style={{ maxWidth: 820, width: '94%' }}>
        <div className="modal-header"><div><h2 style={{ margin: 0 }}>{history.loading ? 'Loading…' : history.account.name}</h2>{!history.loading && <small style={{ color: 'var(--text-muted)' }}>Money in {money(history.totalBorrowed, history.account.currency)} · paid back {money(history.totalPaid, history.account.currency)} · <strong style={{ color: history.owed > 0 ? 'var(--red)' : 'var(--green)' }}>still owed {money(Math.max(0, history.owed), history.account.currency)}</strong>{history.account.loanMonthlyPayment ? ` · pays ${money(history.account.loanMonthlyPayment, history.account.currency)} every month on day ${history.account.loanPaymentDay || 1}` : ''}</small>}</div><button className="modal-close" onClick={() => setHistory(null)}>×</button></div>
        {!history.loading && <div className="modal-body" style={{ display: 'grid', gap: 14 }}>
          {[{ title: 'Money that came from the loan', rows: history.borrowed, due: true }, { title: 'Payments made back', rows: history.payments, due: false }].map(part => <div key={part.title}>
            <h3 style={{ margin: '0 0 6px', fontSize: 14 }}>{part.title} ({part.rows.length})</h3>
            <div className="table-container" style={{ maxHeight: '32vh', overflow: 'auto' }}><table>
              <thead><tr><th>Date</th><th>What</th>{part.due && <th>Pay back by</th>}<th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
              <tbody>{part.rows.length ? part.rows.map((row: any, index: number) => <tr key={index}><td style={{ whiteSpace: 'nowrap' }}>{row.date ? niceDate(row.date) : '—'}</td><td>{row.description || ''}{row.refund ? ' (refund)' : ''}</td>{part.due && <td style={{ whiteSpace: 'nowrap' }}>{row.monthly ? `${money(row.monthly, history.account.currency)} every month, day ${row.payDay || 1}` : row.dueDate ? niceDate(row.dueDate) : '—'}</td>}<td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>{money(row.amount, history.account.currency)}</td></tr>) : <tr><td colSpan={part.due ? 4 : 3} style={{ color: 'var(--text-muted)' }}>None.</td></tr>}</tbody>
            </table></div>
          </div>)}
          <small style={{ color: 'var(--text-muted)' }}>Each loan has its own plan (a pay-back date, or every month). To change it, open that payment or transfer and change "How is this loan paid back?".</small>
        </div>}
      </div></div>}
    </section>
  );
};
