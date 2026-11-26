import React, { useEffect, useRef, useState } from 'react';
import { Edit2, Trash2, X } from 'lucide-react';

// One entry made on the Payroll page (Add Earnings or Record Payment). It is kept apart from Bills,
// so it opens here, in plain payroll words, not in the bill window.
type Account = { id: string; name: string; type: string };
const money = (value: number) => Number(value || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const EARNING_TYPES = ['Salary', 'Hourly', 'Bonus', 'Tip', 'Commission', 'Other'];

export const PayrollEntryModal: React.FC<{ bill: any; onClose: () => void; onUpdated?: (bill: any) => void; onDeleted?: (bill: any) => void }> = ({ bill: initialBill, onClose, onUpdated, onDeleted }) => {
  const [bill, setBill] = useState(initialBill); const [editing, setEditing] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const [accounts, setAccounts] = useState<Account[]>([]);
  const isPayment = bill.status === 'paid'; const person = String(bill.vendor || '').replace(/^Payroll:\s*/i, '') || 'this person'; const fromBank = Boolean(bill.bankTransactionId);
  const date = (isPayment ? bill.paidDate || bill.dueDate : bill.dueDate) || '';
  const startForm = (from: any) => ({ amount: String(from.amount || ''), date: (from.status === 'paid' ? from.paidDate || from.dueDate : from.dueDate) || '', earningType: from.earningType || 'Salary', sourceAccountId: from.sourceAccountId || '', t4aEligible: Boolean(from.t4aEligible), memo: from.memo || '' });
  const [form, setForm] = useState(startForm(initialBill)); const requestId = useRef('');
  useEffect(() => { fetch('/api/v3/accounts?limit=100&types=asset,liability&sort=name').then(response => response.json()).then(data => { if (data.success) setAccounts(data.items || []); }).catch(() => undefined); }, []);
  const accountName = (id?: string) => (id && accounts.find(account => account.id === id)?.name) || bill.sourceName || (id ? 'Unknown account' : '—');
  const title = isPayment ? 'Payroll Payment' : 'Wage Earnings';

  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(form.date)) { setError('A positive amount and a date are needed.'); return; }
    if (isPayment && !form.sourceAccountId) { setError('Choose the account it was paid from.'); return; }
    setSaving(true); const key = requestId.current || crypto.randomUUID(); requestId.current = key;
    try {
      const data: any = { dueDate: form.date, memo: form.memo.trim() };
      if (!fromBank) data.amount = amount;
      if (isPayment) { data.paidDate = form.date; data.t4aEligible = form.t4aEligible; if (!fromBank) data.sourceAccountId = form.sourceAccountId; } else data.earningType = form.earningType;
      const response = await fetch(`/api/v3/records/bills/${encodeURIComponent(bill.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify({ revision: bill.revision, data }) });
      const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.error || 'Unable to save this payroll entry.');
      requestId.current = ''; const updated = { ...bill, ...result.item }; setBill(updated); setEditing(false); onUpdated?.(updated);
    } catch (reason: any) { requestId.current = ''; setError(reason.message || 'Unable to save this payroll entry.'); } finally { setSaving(false); }
  };
  const remove = async () => {
    if (!window.confirm(`Delete this ${isPayment ? 'payment' : 'wage entry'} for ${person}? Their payroll balance will change.`)) return;
    setSaving(true); setError('');
    try { const response = await fetch(`/api/v3/records/bills/${encodeURIComponent(bill.id)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ revision: bill.revision }) }); const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.error || 'Unable to delete this payroll entry.'); onDeleted?.(bill); onClose(); }
    catch (reason: any) { setError(reason.message || 'Unable to delete this payroll entry.'); } finally { setSaving(false); }
  };

  return <div className="modal-overlay" onClick={onClose}><div className="modal" onClick={event => event.stopPropagation()} style={{ maxWidth: 520, width: '92%', maxHeight: '90vh', overflowY: 'auto' }}>
    <div className="modal-header"><div><h2 style={{ margin: 0 }}>{editing ? `Edit ${title}` : title}</h2><div style={{ color: 'var(--text-muted)', marginTop: 4 }}>{person}</div></div><button className="modal-close" onClick={onClose}><X size={20} /></button></div>
    {editing ? <form onSubmit={save}><div className="modal-body" style={{ display: 'grid', gap: 12 }}>
      {error && <div style={{ color: 'var(--red)', fontWeight: 600 }}>{error}</div>}
      {!isPayment && <Field label="Earning Type"><select value={form.earningType} onChange={event => setForm({ ...form, earningType: event.target.value })}>{[...new Set([...EARNING_TYPES, form.earningType])].map(value => <option key={value}>{value}</option>)}</select></Field>}
      <Field label="Date"><input type="date" required value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} /></Field>
      <Field label={`${isPayment ? 'Amount Paid' : 'Earnings Amount'} ($)`}><input type="number" min=".01" step=".01" required disabled={fromBank} value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} /></Field>
      {isPayment && <Field label="Paid From"><select required disabled={fromBank} value={form.sourceAccountId} onChange={event => setForm({ ...form, sourceAccountId: event.target.value })}><option value="">-- Select Account --</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></Field>}
      {fromBank && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>This payment is matched to a bank transaction, so the amount and account come from the bank.</div>}
      {isPayment && <label style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked={form.t4aEligible} onChange={event => setForm({ ...form, t4aEligible: event.target.checked })} /> Include this payment in T4A (Box 48)</label>}
      <Field label="Note (Optional)"><input value={form.memo} onChange={event => setForm({ ...form, memo: event.target.value })} /></Field>
    </div><div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => { setEditing(false); setError(''); setForm(startForm(bill)); }}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button></div></form>
    : <><div className="modal-body">
      {error && <div style={{ color: 'var(--red)', fontWeight: 600, marginBottom: 10 }}>{error}</div>}
      <div style={{ textAlign: 'center', padding: '8px 0 22px', borderBottom: '1px solid var(--border)', marginBottom: 14 }}><div style={{ color: 'var(--text-muted)', fontSize: 12, textTransform: 'uppercase' }}>{isPayment ? `Paid to ${person}` : `Owed to ${person}`}</div><div style={{ color: isPayment ? 'var(--green)' : 'var(--navy)', fontSize: 22, fontWeight: 600 }}>{isPayment ? '−' : '+'}${money(bill.amount)}</div><div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>{isPayment ? 'Lowers what they are owed' : 'Adds to what they are owed'}</div></div>
      <section style={{ background: 'var(--bg-input)', borderRadius: 8, padding: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Detail label="Date" value={date || '—'} />
        {isPayment ? <Detail label="Paid From" value={accountName(bill.sourceAccountId)} /> : <Detail label="Earning Type" value={bill.earningType || 'Salary'} />}
        {isPayment && <Detail label="In T4A" value={bill.t4aEligible ? 'Yes' : 'No'} />}
        {isPayment && <Detail label="From the Bank" value={fromBank ? 'Yes, matched' : 'No'} />}
        <div style={{ gridColumn: '1 / -1' }}><Detail label="Note" value={bill.memo || '—'} /></div>
      </section>
    </div>
    <div className="modal-footer"><button className="btn btn-danger" disabled={saving} onClick={() => void remove()}><Trash2 size={15} /> {saving ? 'Deleting...' : 'Delete'}</button><button className="btn btn-secondary" onClick={onClose}>Close</button><button className="btn btn-primary" onClick={() => { setForm(startForm(bill)); setEditing(true); }}><Edit2 size={15} /> Edit</button></div></>}
  </div></div>;
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => <label className="form-group" style={{ margin: 0 }}><span>{label}</span>{children}</label>;
const Detail: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => <div><div style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', marginBottom: 3 }}>{label}</div><div style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{value}</div></div>;
