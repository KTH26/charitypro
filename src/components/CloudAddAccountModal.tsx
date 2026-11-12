import React, { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { CreditCardDaysFields, creditCardDaysProblem } from './CreditCardDaysFields';

const kinds: Record<string, { value: string; label: string }[]> = {
  asset: [{ value: 'checking', label: 'Bank – chequing' }, { value: 'savings', label: 'Bank – savings' }, { value: 'general', label: 'Cash or other asset' }],
  liability: [{ value: 'loan', label: 'Loan (each payment out needs a pay-back date)' }, { value: 'credit_card', label: 'Credit card' }, { value: 'general', label: 'Other liability' }]
};

/** Form to add a new account to the Chart of Accounts. */
export const CloudAddAccountModal: React.FC<{ onClose: () => void; onSaved: (account: any) => void; mode?: 'account' | 'category'; hint?: string }> = ({ onClose, onSaved, mode = 'account', hint }) => {
  const isCategoryMode = mode === 'category';
  const [form, setForm] = useState({ name: '', type: isCategoryMode ? 'expense' : 'asset', subType: isCategoryMode ? '' : 'checking', currency: 'CAD', startingBalance: '0', loanDueDate: '', statementDay: '', paymentDueDay: '' });
  const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const requestId = useRef('');
  const set = (field: string, value: string) => setForm(current => ({ ...current, [field]: value }));
  const changeType = (type: string) => setForm(current => ({ ...current, type, subType: kinds[type]?.[0]?.value || '' }));
  const isLoan = form.type === 'liability' && form.subType === 'loan';
  const isCard = form.type === 'liability' && form.subType === 'credit_card';
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const startingBalance = Number(form.startingBalance || 0);
    if (!form.name.trim()) { setError('Enter the account name.'); return; }
    if (!Number.isFinite(startingBalance)) { setError('Enter a valid starting balance.'); return; }
    const cardProblem = isCard ? creditCardDaysProblem(form.statementDay, form.paymentDueDay) : '';
    if (cardProblem) { setError(cardProblem); return; }
    setSaving(true); setError('');
    const key = requestId.current || crypto.randomUUID(); requestId.current = key;
    try {
      const data: any = { name: form.name.trim(), type: form.type, currency: form.currency, startingBalance };
      if (form.subType) data.subType = form.subType;
      if (isLoan && startingBalance > 0 && form.loanDueDate) data.loanDueDate = form.loanDueDate;
      if (isCard) { data.statementDay = Number(form.statementDay); data.paymentDueDay = Number(form.paymentDueDay); }
      const response = await fetch('/api/v3/records/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify({ data }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to add the account.');
      requestId.current = '';
      onSaved(result.item);
    } catch (reason: any) {
      requestId.current = '';
      setError(reason.message || 'Unable to add the account.');
    } finally { setSaving(false); }
  };
  return <div className="modal-overlay" onClick={onClose}><form className="modal" onClick={event => event.stopPropagation()} onSubmit={save} style={{ maxWidth: 600, width: '94%' }}>
    <div className="modal-header"><h2 style={{ margin: 0 }}>{isCategoryMode ? 'New Category' : 'New Account'}</h2><button type="button" className="modal-close" onClick={onClose}><X size={20} /></button></div>
    <div className="modal-body">{error && <div style={{ color: 'var(--red)', fontWeight: 700, marginBottom: 14 }}>{error}</div>}{hint && <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg-input)', color: 'var(--navy)', fontSize: 13, marginBottom: 14 }}>{hint}</div>}
      <div className="form-grid-2">
        <label className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}><span>Account name *</span><input autoFocus value={form.name} onChange={event => set('name', event.target.value)} placeholder="For example: BMO Chequing, Loan from Reuven, Visa" /></label>
        <label className="form-group" style={{ margin: 0 }}><span>{isCategoryMode ? 'Category type *' : 'Account type *'}</span><select value={form.type} onChange={event => changeType(event.target.value)}>{isCategoryMode ? <><option value="expense">Expense category</option><option value="revenue">Income category</option></> : <><option value="asset">Asset (bank, cash)</option><option value="liability">Liability (loan, credit card)</option><option value="equity">Equity</option></>}</select></label>
        {kinds[form.type] ? <label className="form-group" style={{ margin: 0 }}><span>Kind *</span><select value={form.subType} onChange={event => set('subType', event.target.value)}>{kinds[form.type].map(kind => <option key={kind.value} value={kind.value}>{kind.label}</option>)}</select></label> : <div />}
        <label className="form-group" style={{ margin: 0 }}><span>Currency</span><select value={form.currency} onChange={event => set('currency', event.target.value)}><option>CAD</option><option>USD</option></select></label>
        {!isCategoryMode && <label className="form-group" style={{ margin: 0 }}><span>Starting balance</span><input type="number" step="0.01" value={form.startingBalance} onChange={event => set('startingBalance', event.target.value)} /><small style={{ color: 'var(--text-muted)' }}>{form.type === 'liability' ? 'How much is owed today.' : 'How much is in it today.'}</small></label>}
        {isLoan && Number(form.startingBalance) > 0 && <label className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}><span>Starting balance — pay back by</span><input type="date" value={form.loanDueDate} onChange={event => set('loanDueDate', event.target.value)} /><small style={{ color: 'var(--text-muted)' }}>Optional. You can also set it later from the Dashboard.</small></label>}
        {isCard && <CreditCardDaysFields statementDay={form.statementDay} paymentDueDay={form.paymentDueDay} onChange={set} />}
      </div>
    </div>
    <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : isCategoryMode ? 'Add Category' : 'Add Account'}</button></div>
  </form></div>;
};
