import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { LoanDueDateField, isLoanAccount } from './LoanDueDateField';

type Account = { id: string; name: string; type: string; subType?: string; currency: string };
const localToday = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };

/**
 * Move money between two accounts, for example BMO → Cash, or paying a loan back
 * from BMO (BMO → Loan account).
 */
export const CloudNewTransferModal: React.FC<{ onClose: () => void; onSaved: (transfer: any) => void; defaultFromAccountId?: string }> = ({ onClose, onSaved, defaultFromAccountId }) => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [form, setForm] = useState({ fromAccountId: defaultFromAccountId || '', toAccountId: '', amount: '', date: localToday(), notes: '', loanDueDate: '' });
  const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const requestId = useRef('');
  useEffect(() => { fetch('/api/v3/accounts?limit=100&types=asset,liability,equity&sort=name').then(response => response.json()).then(data => { if (data.success) setAccounts(data.items || []); else setError(data.error || 'Unable to load accounts.'); }).catch(() => setError('Unable to load accounts.')); }, []);
  const set = (field: string, value: string) => setForm(current => ({ ...current, [field]: value }));
  const from = accounts.find(account => account.id === form.fromAccountId);
  const to = accounts.find(account => account.id === form.toAccountId);
  const options = (exclude: string) => (['asset', 'liability', 'equity'] as const).map(type => {
    const list = accounts.filter(account => account.type === type && account.id !== exclude);
    return list.length ? <optgroup key={type} label={type === 'asset' ? 'Bank & cash' : type === 'liability' ? 'Loans & credit cards' : 'Equity'}>{list.map(account => <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>)}</optgroup> : null;
  });
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!from || !to) { setError('Choose the account the money comes from and the account it goes to.'); return; }
    if (from.id === to.id) { setError('Choose two different accounts.'); return; }
    if (from.currency !== to.currency) { setError('Both accounts must use the same currency.'); return; }
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter an amount above zero.'); return; }
    if (!form.date) { setError('Choose the date of the transfer.'); return; }
    if (isLoanAccount(from) && !form.loanDueDate) { setError('This money comes from a loan account. Choose the date it has to be paid back.'); return; }
    setSaving(true); setError('');
    const key = requestId.current || crypto.randomUUID(); requestId.current = key;
    try {
      const data: any = { fromAccountId: from.id, toAccountId: to.id, amount, currency: from.currency, date: form.date, notes: form.notes.trim() || `Transfer from ${from.name} to ${to.name}` };
      if (isLoanAccount(from)) data.loanDueDate = form.loanDueDate;
      const response = await fetch('/api/v3/records/accountTransfers', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify({ data }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to save the transfer.');
      requestId.current = '';
      onSaved(result.item);
    } catch (reason: any) {
      requestId.current = '';
      setError(reason.message || 'Unable to save the transfer.');
    } finally { setSaving(false); }
  };
  return <div className="modal-overlay" onClick={onClose}><form className="modal" onClick={event => event.stopPropagation()} onSubmit={save} style={{ maxWidth: 600, width: '94%' }}>
    <div className="modal-header"><h2 style={{ margin: 0 }}>New Transfer Between Accounts</h2><button type="button" className="modal-close" onClick={onClose}><X size={20} /></button></div>
    <div className="modal-body">{error && <div style={{ color: 'var(--red)', fontWeight: 700, marginBottom: 14 }}>{error}</div>}
      <div className="form-grid-2">
        <label className="form-group" style={{ margin: 0 }}><span>From account *</span><select value={form.fromAccountId} onChange={event => set('fromAccountId', event.target.value)}><option value="">Money comes out of…</option>{options(form.toAccountId)}</select></label>
        <label className="form-group" style={{ margin: 0 }}><span>To account *</span><select value={form.toAccountId} onChange={event => set('toAccountId', event.target.value)}><option value="">Money goes into…</option>{options(form.fromAccountId)}</select></label>
        <label className="form-group" style={{ margin: 0 }}><span>Amount {from ? `(${from.currency})` : ''} *</span><input type="number" min="0.01" step="0.01" value={form.amount} onChange={event => set('amount', event.target.value)} /></label>
        <label className="form-group" style={{ margin: 0 }}><span>Date *</span><input type="date" value={form.date} onChange={event => set('date', event.target.value)} /></label>
        <div style={{ gridColumn: '1 / -1' }}><LoanDueDateField account={from} value={form.loanDueDate} onChange={value => set('loanDueDate', value)} /></div>
        {to && isLoanAccount(to) && <div style={{ gridColumn: '1 / -1', padding: '10px 12px', borderRadius: 10, background: 'var(--bg-input)', color: 'var(--green)', fontWeight: 700, fontSize: 13 }}>This pays back the loan “{to.name}”. It goes toward the earliest amount owed first.</div>}
        <label className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}><span>Notes</span><textarea rows={2} maxLength={2000} value={form.notes} onChange={event => set('notes', event.target.value)} placeholder="Optional" /></label>
      </div>
    </div>
    <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Transfer'}</button></div>
  </form></div>;
};
