import React, { useEffect, useRef, useState } from 'react';
import { Edit2, X } from 'lucide-react';
import { CloudPledgePicker } from './CloudPledgePicker';

type Choice = { id: string; name: string; type?: string };
const money = (value: number) => Number(value || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const CloudPaymentDetailsModal: React.FC<{ payment: any; onClose: () => void; onUpdated?: (payment: any) => void }> = ({ payment: initialPayment, onClose, onUpdated }) => {
  const [payment, setPayment] = useState(initialPayment);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [allocating, setAllocating] = useState(false);
  const [error, setError] = useState('');
  const [accounts, setAccounts] = useState<Choice[]>([]);
  const [projects, setProjects] = useState<Choice[]>([]);
  const [donors, setDonors] = useState<Choice[]>([]);
  const [donorSearch, setDonorSearch] = useState(initialPayment.donorName || '');
  const [allocation, setAllocation] = useState(initialPayment.pledgeId || '');
  const [form, setForm] = useState({ donorId: initialPayment.donorId || '', amount: String(initialPayment.amount || ''), currency: initialPayment.currency || 'CAD', amountCAD: String(initialPayment.amountCAD || ''), exchangeRate: String(initialPayment.exchangeRate || 1.35), date: initialPayment.date || '', type: initialPayment.type || 'approved', method: initialPayment.method || 'credit_card', depositStatus: initialPayment.depositStatus || '', checkNumber: initialPayment.checkNumber || '', sourceAccountId: initialPayment.sourceAccountId || '', offsetAccountId: initialPayment.offsetAccountId || '', projectId: initialPayment.projectId || '', notes: initialPayment.notes || '', pledgeId: initialPayment.pledgeId || '' });
  const requestId = useRef('');
  const allocationRequestId = useRef('');

  useEffect(() => {
    if (!editing || accounts.length) return;
    Promise.all([fetch('/api/v3/accounts?limit=100').then(response=>response.json()),fetch('/api/v3/records/projects?limit=100').then(response=>response.json())]).then(([accountData,projectData])=>{if(accountData.success)setAccounts(accountData.items);if(projectData.success)setProjects(projectData.items);}).catch(() => setError('Unable to load account and project choices.'));
  }, [editing, accounts.length]);
  useEffect(() => {
    if (!editing) return;
    const timer = window.setTimeout(() => {
      fetch(`/api/v3/donors?limit=50&search=${encodeURIComponent(donorSearch)}`).then(response => response.json()).then(data => { if (data.success) setDonors(data.items); }).catch(() => undefined);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [editing, donorSearch]);

  const set = (field: string, value: string) => setForm(current => ({ ...current, [field]: value }));
  const updatePayment = (item: any) => {
    const donorName = donors.find(donor => donor.id === item.donorId)?.name || payment.donorName;
    const sourceName = accounts.find(account => account.id === item.sourceAccountId)?.name || payment.sourceName;
    const offsetName = accounts.find(account => account.id === item.offsetAccountId)?.name || payment.offsetName;
    const updated = { ...payment, ...item, donorName, sourceName, offsetName };
    setPayment(updated); setAllocation(item.pledgeId || ''); onUpdated?.(updated);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    const amount = Number(form.amount);
    if (!form.donorId || !Number.isFinite(amount) || amount <= 0 || !form.date || !form.sourceAccountId || !form.offsetAccountId) { setError('Donor, amount, date, asset account, and revenue account are required.'); return; }
    setSaving(true); const key = requestId.current || crypto.randomUUID(); requestId.current = key;
    try {
      const data: any = { donorId: form.donorId, amount, currency: form.currency, date: form.date, type: form.type, method: form.method, sourceAccountId: form.sourceAccountId, offsetAccountId: form.offsetAccountId, projectId: form.projectId || null, notes: form.notes.trim(), depositStatus: form.depositStatus || undefined, checkNumber: form.checkNumber.trim() || undefined, pledgeId: form.pledgeId.trim() || null };
      if (form.currency === 'USD') { data.exchangeRate = Number(form.exchangeRate) || 1.35; data.amountCAD = Number(form.amountCAD) || amount * data.exchangeRate; } else data.amountCAD = amount;
      const response = await fetch(`/api/v3/records/transactions/${encodeURIComponent(payment.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify({ revision: payment.revision, data }) });
      const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.error || 'Unable to save transaction changes.');
      requestId.current = ''; updatePayment(result.item); setEditing(false);
    } catch (reason: any) { requestId.current = ''; setError(reason.message || 'Unable to save transaction changes.'); }
    finally { setSaving(false); }
  };

  const saveAllocation = async () => {
    setAllocating(true); setError(''); const key = allocationRequestId.current || crypto.randomUUID(); allocationRequestId.current = key;
    try {
      const response = await fetch(`/api/v3/records/transactions/${encodeURIComponent(payment.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify({ revision: payment.revision, data: { pledgeId: allocation || null } }) });
      const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.error || 'Unable to update the pledge allocation.');
      allocationRequestId.current = ''; setForm(current => ({ ...current, pledgeId: result.item.pledgeId || '' })); updatePayment(result.item);
    } catch (reason: any) { allocationRequestId.current = ''; setError(reason.message || 'Unable to update the pledge allocation.'); }
    finally { setAllocating(false); }
  };

  return <div className="modal-overlay" onClick={onClose}><div className="modal" onClick={event => event.stopPropagation()} style={{ maxWidth: editing ? 780 : 680, width: '92%', maxHeight: '90vh', overflowY: 'auto' }}>
    <div className="modal-header"><h2 style={{ margin: 0 }}>{editing ? 'Edit Transaction' : 'Transaction Details'}</h2><button className="modal-close" onClick={onClose}><X size={20} /></button></div>
    {editing ? <form onSubmit={save}><div className="modal-body">{error && <ErrorText text={error} />}<div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 14 }}>
      <label className="form-group" style={{ margin: 0 }}><span>Find Donor</span><input value={donorSearch} onChange={event => setDonorSearch(event.target.value)} /></label>
      <label className="form-group" style={{ margin: 0 }}><span>Donor *</span><select value={form.donorId} onChange={event => setForm(current => ({ ...current, donorId: event.target.value, pledgeId: '' }))}><option value="">Select donor</option>{!donors.some(donor => donor.id === form.donorId) && payment.donorId && <option value={payment.donorId}>{payment.donorName}</option>}{donors.map(donor => <option key={donor.id} value={donor.id}>{donor.name}</option>)}</select></label>
      <Field label="Amount *"><input type="number" min="0.01" step="0.01" value={form.amount} onChange={event => set('amount', event.target.value)} /></Field>
      <Field label="Currency"><select value={form.currency} onChange={event => set('currency', event.target.value)}><option>CAD</option><option>USD</option></select></Field>
      {form.currency === 'USD' && <><Field label="Exchange Rate"><input type="number" step="0.0001" value={form.exchangeRate} onChange={event => set('exchangeRate', event.target.value)} /></Field><Field label="CAD Amount"><input type="number" step="0.01" value={form.amountCAD} onChange={event => set('amountCAD', event.target.value)} /></Field></>}
      <Field label="Date *"><input type="date" value={form.date} onChange={event => set('date', event.target.value)} /></Field>
      <Field label="Status"><select value={form.type} onChange={event => set('type', event.target.value)}><option value="approved">Approved</option><option value="pending">Pending</option><option value="declined">Declined</option><option value="recording">Recording</option></select></Field>
      <Field label="Method"><select value={form.method} onChange={event => set('method', event.target.value)}><option value="credit_card">Credit Card</option><option value="check">Check</option><option value="cash">Cash</option><option value="e_transfer">E-Transfer</option><option value="ach">ACH / eCheck</option><option value="wire">Wire</option><option value="other">Other</option></select></Field>
      <Field label="Deposit Status"><select value={form.depositStatus} onChange={event => set('depositStatus', event.target.value)}><option value="">Direct</option><option value="undeposited">Undeposited</option><option value="deposited">Deposited</option></select></Field>
      <Field label="Asset / Deposit Account *"><select value={form.sourceAccountId} onChange={event => set('sourceAccountId', event.target.value)}><option value="">Select account</option>{accounts.filter(account => account.type === 'asset' || account.type === 'liability').map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></Field>
      <Field label="Revenue / Offset Account *"><select value={form.offsetAccountId} onChange={event => set('offsetAccountId', event.target.value)}><option value="">Select account</option>{accounts.filter(account => account.type === 'revenue' || account.type === 'equity').map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></Field>
      <Field label="Project"><select value={form.projectId} onChange={event=>set('projectId',event.target.value)}><option value="">— No Project —</option>{projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select></Field>
      <Field label="Check Number"><input value={form.checkNumber} onChange={event => set('checkNumber', event.target.value)} /></Field>
      <CloudPledgePicker donorId={form.donorId} paymentDate={form.date} value={form.pledgeId} onChange={value => set('pledgeId', value)} />
      <label className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}><span>Notes</span><textarea rows={4} value={form.notes} onChange={event => set('notes', event.target.value)} /></label>
    </div></div><div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => { setEditing(false); setError(''); }}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving securely…' : 'Save All Changes'}</button></div></form> : <><div className="modal-body">{error && <ErrorText text={error} />}
      <div style={{ textAlign: 'center', padding: '8px 0 22px', borderBottom: '1px solid var(--border)', marginBottom: 20 }}><div style={{ color: 'var(--text-muted)', fontSize: 12, textTransform: 'uppercase' }}>Payment Amount</div><div style={{ color: 'var(--green)', fontSize: 30, fontWeight: 900 }}>{payment.currency} ${money(payment.amount)}</div>{payment.currency === 'USD' && payment.amountCAD != null && <div style={{ color: 'var(--text-muted)' }}>CAD ${money(payment.amountCAD)} at rate {payment.exchangeRate || 'saved rate'}</div>}</div>
      <section style={{ background: 'var(--bg-input)', borderRadius: 12, padding: 16, marginBottom: 16 }}><h3 style={{ margin: '0 0 12px', color: 'var(--navy)' }}>Payment Details</h3><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><Detail label="Donor" value={payment.donorName} /><Detail label="Date" value={payment.date} /><Detail label="Status" value={payment.type} /><Detail label="Method" value={String(payment.method || '').replaceAll('_', ' ')} /><Detail label="Deposit Status" value={payment.depositStatus || 'Direct'} /><Detail label="Check Number" value={payment.checkNumber || '—'} /><Detail label="Asset Account" value={payment.sourceName || payment.sourceAccountId || '—'} /><Detail label="Revenue Account" value={payment.offsetName || payment.offsetAccountId || '—'} /></div></section>
      <section style={{ background: 'var(--bg-input)', borderRadius: 12, padding: 16, marginBottom: 16 }}><h3 style={{ margin: '0 0 10px', color: 'var(--navy)' }}>Pledge Allocation</h3><div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'end' }}><CloudPledgePicker donorId={payment.donorId} paymentDate={payment.date} value={allocation} onChange={setAllocation} /><button className="btn btn-primary" disabled={allocating} onClick={() => void saveAllocation()}>{allocating ? 'Applying…' : 'Apply'}</button></div></section>
      <section style={{ background: 'var(--bg-input)', borderRadius: 12, padding: 16 }}><h3 style={{ margin: '0 0 10px', color: 'var(--navy)' }}>Reference Information</h3><Detail label="Notes" value={payment.notes || '—'} /><div style={{ marginTop: 10 }}><Detail label="Transaction ID" value={payment.id} /></div>{payment.bankTransactionId && <div style={{ marginTop: 10 }}><Detail label="Bank Transaction" value={payment.bankTransactionId} /></div>}{payment.pledgeId && <div style={{ marginTop: 10 }}><Detail label="Manual Pledge Override" value={payment.pledgeId} /></div>}</section>
    </div><div className="modal-footer"><button className="btn btn-secondary" onClick={onClose}>Close</button><button className="btn btn-primary" onClick={() => setEditing(true)}><Edit2 size={15} /> Edit All Details</button></div></>}
  </div></div>;
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => <label className="form-group" style={{ margin: 0 }}><span>{label}</span>{children}</label>;
const ErrorText: React.FC<{ text: string }> = ({ text }) => <div style={{ color: 'var(--red)', fontWeight: 700, marginBottom: 14 }}>{text}</div>;
const Detail: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => <div><div style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', marginBottom: 3 }}>{label}</div><div style={{ fontWeight: 700, overflowWrap: 'anywhere', textTransform: label === 'Status' || label === 'Method' ? 'capitalize' : undefined }}>{value}</div></div>;
