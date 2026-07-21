import React, { useCallback, useEffect, useRef, useState } from 'react';

type Bill = { id: string; revision: number; vendor: string; amount: number; currency?: 'CAD' | 'USD'; dueDate: string; status: string; category: string; categoryName: string; sourceName?: string; memo?: string };
type Account = { id: string; name: string; type: string; currency: string };
type BillResponse = { success: boolean; items: Bill[]; page: number; total: number; totalPages: number; totalCAD: number; error?: string };

export const OnlineExpenses: React.FC = () => {
  const [items, setItems] = useState<Bill[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCAD, setTotalCAD] = useState(0);
  const [status, setStatus] = useState<'open' | 'paid'>('open');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [paying, setPaying] = useState<Bill | null>(null);
  const [paySource, setPaySource] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ vendor: '', amount: '', currency: 'CAD' as 'CAD' | 'USD', dueDate: new Date().toISOString().slice(0, 10), category: '', status: 'pending', memo: '', taxable: false });
  const createRequestId = useRef('');
  const payRequestIds = useRef<Record<string, string>>({});

  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(''); }
    const params = new URLSearchParams({ page: String(page), limit: '50', status });
    if (search) params.set('search', search);
    try {
      const response = await fetch(`/api/v3/bills?${params.toString()}`);
      const data = await response.json() as BillResponse;
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load expenses.');
      setItems(data.items); setTotal(data.total); setTotalPages(Math.max(1, data.totalPages)); setTotalCAD(data.totalCAD);
    } catch (e: any) { if (!silent) setError(e.message || 'Unable to load expenses.'); }
    finally { if (!silent) setLoading(false); }
  }, [page, search, status]);

  useEffect(() => {
    fetch('/api/v3/accounts').then(response => response.json()).then(data => { if (data.success) setAccounts(data.items); }).catch(() => undefined);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const interval = window.setInterval(() => void load(true), 3000); return () => window.clearInterval(interval); }, [load]);
  useEffect(() => { setPage(1); }, [search, status]);

  const setField = (field: string, value: string | boolean) => setForm(current => ({ ...current, [field]: value }));
  const createExpense = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    const amount = Number(form.amount);
    if (!form.vendor.trim() || !Number.isFinite(amount) || amount <= 0 || !form.dueDate || !form.category) { setError('Vendor, positive amount, due date, and category are required.'); return; }
    setSaving(true);
    const requestId = createRequestId.current || crypto.randomUUID(); createRequestId.current = requestId;
    try {
      const response = await fetch('/api/v3/bills', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestId }, body: JSON.stringify({ ...form, amount, requestId }) });
      const data = await response.json();
      if (!response.ok || !data.success) { createRequestId.current = ''; throw new Error(data.error || 'Expense could not be saved.'); }
      createRequestId.current = ''; setShowAdd(false); setNotice('Expense saved directly to the cloud.'); setStatus('open'); setPage(1); setForm(current => ({ ...current, vendor: '', amount: '', memo: '' })); void load();
    } catch (e: any) { setError(e.message || 'Expense could not be saved. You can safely try again.'); }
    finally { setSaving(false); }
  };

  const markPaid = async () => {
    if (!paying || !paySource) return;
    setSaving(true); setError('');
    const requestId = payRequestIds.current[paying.id] || crypto.randomUUID(); payRequestIds.current[paying.id] = requestId;
    try {
      const response = await fetch(`/api/v3/bills/${encodeURIComponent(paying.id)}/pay`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestId }, body: JSON.stringify({ requestId, revision: paying.revision, sourceAccountId: paySource }) });
      const data = await response.json();
      if (!response.ok || !data.success) { delete payRequestIds.current[paying.id]; throw new Error(data.error || 'Expense could not be marked paid.'); }
      delete payRequestIds.current[paying.id]; setPaying(null); setPaySource(''); setNotice('Expense marked paid in the cloud. Account balances were recalculated automatically.'); void load();
    } catch (e: any) { setError(e.message || 'Expense could not be marked paid. You can safely try again.'); if (e.message?.includes('another user')) { setPaying(null); void load(); } }
    finally { setSaving(false); }
  };

  const expenseAccounts = accounts.filter(account => account.type === 'expense');
  const paymentAccounts = accounts.filter(account => account.type === 'asset' || account.type === 'liability');

  return <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: 28, fontFamily: 'Inter, sans-serif' }}><div style={{ maxWidth: 1400, margin: '0 auto' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'center', marginBottom: 22 }}><div><div style={{ color: 'var(--green)', fontWeight: 800, fontSize: 13 }}>SERVER MODE</div><h1 style={{ color: 'var(--navy)', margin: '4px 0' }}>Expenses ({total.toLocaleString()})</h1><div style={{ color: 'var(--green)', fontWeight: 700 }}>{status === 'open' ? 'Open' : 'Paid'} total: ${totalCAD.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CAD</div><div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Updates automatically every 3 seconds.</div></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}><button className="btn btn-primary" onClick={() => { setShowAdd(true); setNotice(''); }}>Add Expense</button><a className="btn btn-secondary" href="/online/donors">Online Donors</a><a className="btn btn-secondary" href="/online/payments">Online Payments</a><a className="btn btn-secondary" href="/online/bank">Online Bank</a><a className="btn btn-secondary" href="/online/accounts">Online Accounts</a><a className="btn btn-secondary" href="/expenses">Current CharityPro</a></div></div>

    {showAdd && <section className="card" style={{ padding: 22, marginBottom: 18, border: '2px solid var(--green)' }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}><div><h2 style={{ margin: 0, color: 'var(--navy)' }}>Add expense to the cloud</h2><div style={{ color: 'var(--text-muted)' }}>This creates one shared bill for both users.</div></div><button className="btn btn-ghost" onClick={() => setShowAdd(false)}>Close</button></div><form onSubmit={createExpense}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 14 }}>
      <label className="form-group" style={{ margin: 0 }}><span>Vendor *</span><input value={form.vendor} onChange={e => setField('vendor', e.target.value)} /></label><label className="form-group" style={{ margin: 0 }}><span>Amount *</span><input type="number" min="0.01" step="0.01" value={form.amount} onChange={e => setField('amount', e.target.value)} /></label><label className="form-group" style={{ margin: 0 }}><span>Currency</span><select value={form.currency} onChange={e => setField('currency', e.target.value)}><option>CAD</option><option>USD</option></select></label><label className="form-group" style={{ margin: 0 }}><span>Due date *</span><input type="date" value={form.dueDate} onChange={e => setField('dueDate', e.target.value)} /></label><label className="form-group" style={{ margin: 0 }}><span>Category *</span><select value={form.category} onChange={e => setField('category', e.target.value)}><option value="">Select category</option>{expenseAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><label className="form-group" style={{ margin: 0 }}><span>Priority</span><select value={form.status} onChange={e => setField('status', e.target.value)}><option value="pending">Pending</option><option value="urgent">Urgent</option></select></label>
    </div><label className="form-group" style={{ margin: '14px 0 0' }}><span>Memo</span><textarea rows={2} maxLength={2000} value={form.memo} onChange={e => setField('memo', e.target.value)} /></label><label style={{ display: 'flex', gap: 8, marginTop: 12 }}><input type="checkbox" checked={form.taxable} onChange={e => setField('taxable', e.target.checked)} /> Taxable</label><div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}><button type="button" className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving securely...' : 'Save Expense'}</button></div></form></section>}

    {paying && <section className="card" style={{ padding: 20, marginBottom: 18, border: '2px solid var(--green)' }}><h2 style={{ color: 'var(--navy)', marginTop: 0 }}>Mark {paying.vendor} paid</h2><p>{paying.currency || 'CAD'} ${paying.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} allocated to {paying.categoryName}</p><label className="form-group"><span>Paid from *</span><select value={paySource} onChange={e => setPaySource(e.target.value)}><option value="">Select asset or liability account</option>{paymentAccounts.map(account => <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>)}</select></label><div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}><button className="btn btn-secondary" onClick={() => { setPaying(null); setPaySource(''); }}>Cancel</button><button className="btn btn-primary" disabled={!paySource || saving} onClick={() => void markPaid()}>{saving ? 'Saving securely...' : 'Confirm Paid'}</button></div></section>}
    {notice && <div className="card" style={{ padding: 14, color: 'var(--green)', fontWeight: 800, marginBottom: 16 }}>{notice}</div>}{error && <div className="card" style={{ padding: 14, color: 'var(--red)', fontWeight: 700, marginBottom: 16 }}>{error}</div>}
    <section className="card" style={{ padding: 18, marginBottom: 18 }}><form onSubmit={e => { e.preventDefault(); setSearch(searchInput.trim()); }} style={{ display: 'flex', gap: 10 }}><input style={{ flex: 1 }} value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Search vendor or memo" /><select value={status} onChange={e => setStatus(e.target.value as 'open' | 'paid')}><option value="open">Open expenses</option><option value="paid">Paid expenses</option></select><button className="btn btn-primary">Search</button></form></section>
    <section className="card" style={{ padding: 0, overflow: 'hidden' }}>{loading ? <div style={{ padding: 40, textAlign: 'center' }}>Loading expenses from the cloud...</div> : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th>Due date</th><th>Vendor</th><th>Category</th><th>Status</th><th>Paid from</th><th style={{ textAlign: 'right' }}>Amount</th><th /></tr></thead><tbody>{items.map(bill => <tr key={bill.id}><td>{bill.dueDate}</td><td><div style={{ fontWeight: 800 }}>{bill.vendor}</div><div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{bill.memo || ''}</div></td><td>{bill.categoryName}</td><td>{bill.status}</td><td>{bill.sourceName || ''}</td><td style={{ textAlign: 'right', fontWeight: 800 }}>{bill.currency || 'CAD'} ${bill.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td><td style={{ textAlign: 'right' }}>{bill.status !== 'paid' && <button className="btn btn-primary btn-sm" onClick={() => { setPaying(bill); setPaySource(''); setNotice(''); }}>Mark Paid</button>}</td></tr>)}{items.length === 0 && <tr><td colSpan={7} style={{ padding: 30, textAlign: 'center' }}>No matching expenses.</td></tr>}</tbody></table></div>}<div style={{ display: 'flex', justifyContent: 'space-between', padding: 14, borderTop: '1px solid var(--border)' }}><span>Page {page} of {totalPages}</span><div style={{ display: 'flex', gap: 8 }}><button className="btn btn-secondary btn-sm" disabled={page <= 1 || loading} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</button><button className="btn btn-secondary btn-sm" disabled={page >= totalPages || loading} onClick={() => setPage(value => Math.min(totalPages, value + 1))}>Next</button></div></div></section>
  </div></main>;
};
