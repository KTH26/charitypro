import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CloudPledgeDetailsModal } from '../components/CloudPledgeDetailsModal';

type Pledge = { id: string; revision: number; donorId: string; donorName: string; amount: number; currency: 'CAD' | 'USD'; date: string; notes?: string };
type Donor = { id: string; name: string };
type PledgeForm = { id: string; revision: number; donorId: string; amount: string; currency: 'CAD' | 'USD'; date: string; notes: string };
const blank = (): PledgeForm => ({ id: '', revision: 0, donorId: '', amount: '', currency: 'CAD', date: new Date().toISOString().slice(0, 10), notes: '' });

export const OnlinePledges: React.FC = () => {
  const [items, setItems] = useState<Pledge[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(blank());
  const [donorSearch, setDonorSearch] = useState('');
  const [donors, setDonors] = useState<Donor[]>([]);
  const [selectedPledgeId, setSelectedPledgeId] = useState<string | null>(null);
  const requestId = useRef('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`/api/v3/pledges?page=${page}&limit=50&search=${encodeURIComponent(search)}`);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load pledges.');
      setItems(data.items); setTotal(Number(data.total || 0)); setTotalPages(Math.max(1, Number(data.totalPages || 1)));
    } catch (e: any) { if (!silent) setError(e.message || 'Unable to load pledges.'); }
    finally { if (!silent) setLoading(false); }
  }, [page, search]);
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(true), 3000); return () => window.clearInterval(timer); }, [load]);
  useEffect(() => { const timer = window.setTimeout(() => { fetch(`/api/v3/donors?limit=50&search=${encodeURIComponent(donorSearch)}`).then(response => response.json()).then(data => { if (data.success) setDonors(data.items); }).catch(() => undefined); }, 250); return () => window.clearTimeout(timer); }, [donorSearch]);

  const beginNew = () => { setForm(blank()); setDonorSearch(''); setEditing(true); setError(''); setNotice(''); requestId.current = ''; };
  const beginEdit = (item: Pledge) => { setForm({ id: item.id, revision: item.revision, donorId: item.donorId, amount: String(item.amount), currency: item.currency, date: item.date, notes: item.notes || '' }); setDonorSearch(item.donorName); setDonors(current => current.some(donor => donor.id === item.donorId) ? current : [{ id: item.donorId, name: item.donorName }, ...current]); setEditing(true); setError(''); setNotice(''); requestId.current = ''; };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!form.donorId || !Number.isFinite(amount) || amount <= 0 || !form.date) { setError('Donor, positive amount, and date are required.'); return; }
    const idempotencyKey = requestId.current || crypto.randomUUID(); requestId.current = idempotencyKey;
    const data = { ...(form.id ? { id: form.id } : {}), donorId: form.donorId, amount, currency: form.currency, date: form.date, notes: form.notes.trim() };
    try {
      const response = await fetch(form.id ? `/api/v3/records/pledges/${encodeURIComponent(form.id)}` : '/api/v3/records/pledges', { method: form.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ revision: form.revision, data }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to save pledge.');
      requestId.current = ''; setEditing(false); setNotice(form.id ? 'Pledge updated in the cloud.' : 'Pledge added to the cloud.'); await load(true);
    } catch (e: any) { requestId.current = ''; setError(e.message || 'Unable to save pledge.'); }
  };
  const remove = async (item: Pledge) => {
    if (!window.confirm(`Delete the ${item.currency} $${item.amount.toFixed(2)} pledge for ${item.donorName}?`)) return;
    try {
      const key = crypto.randomUUID();
      const response = await fetch(`/api/v3/records/pledges/${encodeURIComponent(item.id)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify({ revision: item.revision }) });
      const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.error || 'Unable to delete pledge.');
      setNotice('Pledge deleted from the cloud.'); await load(true);
    } catch (e: any) { setError(e.message || 'Unable to delete pledge.'); }
  };

  return <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: 28, fontFamily: 'Inter, sans-serif' }}><div style={{ maxWidth: 1400, margin: '0 auto' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, marginBottom: 22 }}><div><div style={{ color: 'var(--green)', fontWeight: 800, fontSize: 13 }}>CHARITYPRO CLOUD</div><h1 style={{ color: 'var(--navy)', margin: '4px 0' }}>Pledges ({total.toLocaleString()})</h1><div style={{ color: 'var(--text-muted)' }}>Shared online pledges · 50 records per page</div></div><button className="btn btn-primary" onClick={beginNew}>New Pledge</button></div>
    {editing && <form className="card" onSubmit={save} style={{ padding: 22, marginBottom: 18, border: '2px solid var(--green)' }}><h2 style={{ marginTop: 0, color: 'var(--navy)' }}>{form.id ? 'Edit Pledge' : 'New Pledge'}</h2><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 14 }}>
      <label className="form-group" style={{ margin: 0 }}><span>Find donor</span><input value={donorSearch} onChange={event => setDonorSearch(event.target.value)} placeholder="Type a donor name" /></label>
      <label className="form-group" style={{ margin: 0 }}><span>Donor *</span><select value={form.donorId} onChange={event => setForm(current => ({ ...current, donorId: event.target.value }))}><option value="">Select from up to 50 matches</option>{donors.map(donor => <option key={donor.id} value={donor.id}>{donor.name}</option>)}</select></label>
      <label className="form-group" style={{ margin: 0 }}><span>Amount *</span><input type="number" min="0.01" step="0.01" value={form.amount} onChange={event => setForm(current => ({ ...current, amount: event.target.value }))} /></label>
      <label className="form-group" style={{ margin: 0 }}><span>Currency</span><select value={form.currency} onChange={event => setForm(current => ({ ...current, currency: event.target.value as 'CAD' | 'USD' }))}><option>CAD</option><option>USD</option></select></label>
      <label className="form-group" style={{ margin: 0 }}><span>Date *</span><input type="date" value={form.date} onChange={event => setForm(current => ({ ...current, date: event.target.value }))} /></label>
      <label className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}><span>Notes</span><textarea value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} /></label>
    </div><div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}><button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>Cancel</button><button className="btn btn-primary">Save Pledge</button></div></form>}
    {notice && <div className="card" style={{ padding: 14, color: 'var(--green)', fontWeight: 800, marginBottom: 16 }}>{notice}</div>}{error && <div className="card" style={{ padding: 14, color: 'var(--red)', fontWeight: 700, marginBottom: 16 }}>{error}</div>}
    <section className="card" style={{ padding: 0, overflow: 'hidden' }}><div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}><input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Search donor or notes" /></div>{loading ? <div style={{ padding: 40, textAlign: 'center' }}>Loading pledges...</div> : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th>Date</th><th>Donor</th><th>Notes</th><th style={{ textAlign: 'right' }}>Amount</th><th /></tr></thead><tbody>{items.map(item => <tr key={item.id} onClick={() => setSelectedPledgeId(item.id)} style={{ cursor: 'pointer' }}><td>{item.date}</td><td style={{ fontWeight: 800 }}>{item.donorName}</td><td>{item.notes || ''}</td><td style={{ textAlign: 'right', fontWeight: 800 }}>{item.currency} ${item.amount.toFixed(2)}</td><td style={{ textAlign: 'right' }}><button className="btn btn-secondary btn-sm" onClick={event => { event.stopPropagation(); beginEdit(item); }}>Edit</button> <button className="btn btn-danger btn-sm" onClick={event => { event.stopPropagation(); void remove(item); }}>Delete</button></td></tr>)}{items.length === 0 && <tr><td colSpan={5} style={{ padding: 30, textAlign: 'center' }}>No matching pledges.</td></tr>}</tbody></table></div>}<div style={{ display: 'flex', justifyContent: 'space-between', padding: 14, borderTop: '1px solid var(--border)' }}><span>Page {page} of {totalPages}</span><div style={{ display: 'flex', gap: 8 }}><button className="btn btn-secondary btn-sm" disabled={page <= 1 || loading} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</button><button className="btn btn-secondary btn-sm" disabled={page >= totalPages || loading} onClick={() => setPage(value => Math.min(totalPages, value + 1))}>Next</button></div></div></section>
    {selectedPledgeId && <CloudPledgeDetailsModal pledgeId={selectedPledgeId} onClose={() => setSelectedPledgeId(null)} />}
  </div></main>;
};
