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
  const [monthlyFor, setMonthlyFor] = useState(''); // the loan account whose monthly payment is being set
  const [monthlyForm, setMonthlyForm] = useState({ amount: '', day: '1' });

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

  const openMonthly = (accountId: string) => { const account = accounts.find(item => item.id === accountId); setMonthlyFor(accountId); setMonthlyForm({ amount: account?.loanMonthlyPayment ? String(account.loanMonthlyPayment) : '', day: String(account?.loanPaymentDay || 1) }); setEditing(''); };
  const saveMonthly = async (stop = false) => {
    const account = accounts.find(item => item.id === monthlyFor); if (!account) return;
    const amount = Number(monthlyForm.amount); const day = Math.floor(Number(monthlyForm.day));
    if (!stop && (!(amount > 0) || !(day >= 1 && day <= 31))) { setError('Enter the monthly amount and the day of the month (1–31).'); return; }
    setSaving(true); setError('');
    try {
      const response = await fetch(`/api/v3/records/accounts/${encodeURIComponent(account.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ revision: account.revision, data: stop ? { loanMonthlyPayment: 0 } : { loanMonthlyPayment: Math.round(amount * 100) / 100, loanPaymentDay: day } }) });
      const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || 'Not saved.');
      setMonthlyFor(''); await load(true);
    } catch (reason: any) { setError(reason.message || 'Not saved.'); await load(true); } finally { setSaving(false); }
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
      {monthlyFor && (() => { const account = accounts.find(item => item.id === monthlyFor); return account ? <div style={{ padding: '12px 22px', display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap', background: 'var(--bg-input)', borderBottom: '1px solid var(--border)' }}>
        <strong style={{ width: '100%', fontSize: 13 }}>{account.name}: paid back every month</strong>
        <label className="form-group" style={{ margin: 0 }}><span>Each month ({account.currency})</span><input type="number" min="0" step="0.01" value={monthlyForm.amount} onChange={event => setMonthlyForm(current => ({ ...current, amount: event.target.value }))} style={{ width: 120 }} autoFocus /></label>
        <label className="form-group" style={{ margin: 0 }}><span>Due on day</span><input type="number" min="1" max="31" value={monthlyForm.day} onChange={event => setMonthlyForm(current => ({ ...current, day: event.target.value }))} style={{ width: 70 }} /></label>
        <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => void saveMonthly()}>{saving ? 'Saving…' : 'Save'}</button>
        {account.loanMonthlyPayment ? <button className="btn btn-secondary btn-sm" disabled={saving} onClick={() => void saveMonthly(true)}>Stop monthly (back to pay-back dates)</button> : null}
        <button className="btn btn-ghost btn-sm" disabled={saving} onClick={() => setMonthlyFor('')}>Cancel</button>
      </div> : null; })()}
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
              <td style={{ fontWeight: 600 }}>{item.accountName}{item.monthly ? <small style={{ display: 'block', color: 'var(--text-muted)', fontWeight: 600 }}>Monthly payment{item.paidThisMonth ? ` · ${money(item.paidThisMonth, item.currency)} paid this month` : ''} · {money(item.totalOwed || 0, item.currency)} left on the loan</small> : null}<button type="button" className="link-button" style={{ display: 'block', fontSize: 12, fontWeight: 500 }} onClick={() => openMonthly(item.accountId)}>{item.monthly ? 'Change monthly payment' : 'Pay monthly?'}</button></td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>{money(item.remaining, item.currency)}</td>
              <td>{editing === key
                ? <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input type="date" value={newDate} onChange={event => setNewDate(event.target.value)} autoFocus style={{ width: 145 }} />
                  <button className="btn btn-primary btn-sm" disabled={saving || !newDate} onClick={() => void saveDate(item)}>{saving ? 'Saving…' : 'Save'}</button>
                  <button className="btn btn-ghost btn-sm" disabled={saving} onClick={() => { setEditing(''); setNewDate(''); }}>Cancel</button>
                </div>
                : <button type="button" className={`loan-due loan-due-button ${tone}`} title={item.monthly ? 'Monthly payment: click to change' : 'Click to change the date'} onClick={() => { if (item.monthly) { openMonthly(item.accountId); return; } setEditing(key); setNewDate(item.dueDate || ''); }}>
                  {item.dueDate ? niceDate(item.dueDate) : 'Set a date'}
                  <small>{days === null ? 'No date yet' : days < 0 ? `${-days} day${days === -1 ? '' : 's'} late` : days === 0 ? 'Due today' : `in ${days} day${days === 1 ? '' : 's'}`}</small>
                </button>}</td>
            </tr>;
          })}</tbody>
        </table></div>}
    </section>
  );
};
