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
};
type LoanAccount = { id: string; name: string; currency: string; owed: number };

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

  const load = useCallback(async (silent = false) => {
    try {
      const response = await fetch('/api/v3/loans-payable');
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
    <section className="card loans-box" style={{ marginTop: 22, padding: 0, overflow: 'hidden' }}>
      <div className="loans-box-header">
        <div>
          <h2 style={{ margin: 0, color: 'var(--navy)', fontSize: 19, display: 'flex', alignItems: 'center', gap: 8 }}><Landmark size={20} /> Loans to Pay Back</h2>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
            {Object.keys(totals).length ? Object.entries(totals).map(([currency, total]) => `${money(total, currency)} still owed`).join(' · ') : 'Nothing owed'}
            {overdue > 0 && <span style={{ color: 'var(--red)', fontWeight: 800 }}> · {overdue} overdue</span>}
            {noDate > 0 && <span style={{ color: 'var(--red)', fontWeight: 800 }}> · {noDate} without a date</span>}
          </div>
        </div>
        <a href="/chart-of-accounts" className="btn btn-secondary btn-sm">Open Accounts</a>
      </div>
      {error && <div style={{ padding: '12px 22px', color: 'var(--red)', fontWeight: 700 }}>{error}</div>}
      {loading ? <div style={{ padding: 34, textAlign: 'center', color: 'var(--text-muted)' }}>Loading loans…</div>
        : items.length === 0 ? <div style={{ padding: 34, textAlign: 'center', color: 'var(--green)', fontWeight: 800 }}>
          <CheckCircle2 size={25} style={{ verticalAlign: 'middle', marginRight: 8 }} />
          {accounts.length ? 'All loans are paid back.' : 'No loan accounts yet. To add one, open an account, choose Liability, and set the kind to “Loan”.'}
        </div>
        : <div className="loans-box-scroll"><table className="loans-table">
          <thead><tr><th>Pay back by</th><th>Loan account</th><th>What it was for</th><th style={{ textAlign: 'right' }}>Amount</th><th style={{ textAlign: 'right' }}>Still owed</th><th></th></tr></thead>
          <tbody>{items.map(item => {
            const key = keyOf(item);
            const days = item.dueDate ? daysUntil(item.dueDate) : null;
            const tone = days === null || days < 0 ? 'is-late' : days <= 7 ? 'is-soon' : '';
            return <tr key={key}>
              <td>{editing === key
                ? <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="date" value={newDate} onChange={event => setNewDate(event.target.value)} autoFocus style={{ width: 150 }} />
                  <button className="btn btn-primary btn-sm" disabled={saving || !newDate} onClick={() => void saveDate(item)}>{saving ? 'Saving…' : 'Save'}</button>
                  <button className="btn btn-ghost btn-sm" disabled={saving} onClick={() => { setEditing(''); setNewDate(''); }}>Cancel</button>
                </div>
                : <span className={`loan-due ${tone}`}>
                  {item.dueDate ? niceDate(item.dueDate) : 'No date yet'}
                  <small>{days === null ? 'Please set a date' : days < 0 ? `${-days} day${days === -1 ? '' : 's'} late` : days === 0 ? 'Due today' : `in ${days} day${days === 1 ? '' : 's'}`}</small>
                </span>}</td>
              <td style={{ fontWeight: 700 }}>{item.accountName}</td>
              <td>{item.description}{item.date && <small style={{ display: 'block', color: 'var(--text-muted)' }}>{niceDate(item.date)}</small>}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{money(item.amount, item.currency)}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 800 }}>{money(item.remaining, item.currency)}{item.paid > 0 && <small style={{ display: 'block', color: 'var(--green)', fontWeight: 700 }}>{money(item.paid, item.currency)} paid</small>}</td>
              <td style={{ textAlign: 'right' }}>{editing !== key && <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(key); setNewDate(item.dueDate || ''); }}>{item.dueDate ? 'Change date' : 'Set date'}</button>}</td>
            </tr>;
          })}</tbody>
        </table></div>}
    </section>
  );
};
