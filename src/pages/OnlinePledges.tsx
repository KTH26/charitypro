import React, { useCallback, useEffect, useState } from 'react';
import { startLiveRefresh } from '../utils/liveUpdates';
import { CloudPledgeDetailsModal } from '../components/CloudPledgeDetailsModal';
import { SortableTh, type SortDirection } from '../components/SortableTh';
import { type FundraiserAllocationDraft } from '../components/FundraiserAllocationEditor';
import { PledgeFormModal, type PledgeForEdit } from '../components/PledgeFormModal';

type Pledge = { id: string; revision: number; donorId: string; donorName: string; donorHebrewName?: string; campaignId?: string; campaignName?: string; amount: number; currency: 'CAD' | 'USD'; date: string; notes?: string; followUpDate?: string; followUpNote?: string; fundraiserGroupId?: string; fundraiserAllocations?: FundraiserAllocationDraft[]; paid: number; pending: number; scheduled: number; balance: number };

export const OnlinePledges: React.FC = () => {
  const [items, setItems] = useState<Pledge[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [from,setFrom]=useState(''); const [to,setTo]=useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  // null = closed, 'new' = New Pledge, otherwise the pledge being edited.
  const [editing, setEditing] = useState<'new' | PledgeForEdit | null>(null);
  const [selectedPledgeId, setSelectedPledgeId] = useState<string | null>(null);
  const [sort, setSort] = useState('date'); const [direction, setDirection] = useState<SortDirection>('desc');
  const changeSort = (column: string) => { setDirection(current => sort === column ? (current === 'asc' ? 'desc' : 'asc') : (column === 'date' || column === 'amount' ? 'desc' : 'asc')); setSort(column); setPage(1); };

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`/api/v3/pledges?page=${page}&limit=50&search=${encodeURIComponent(search)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&sort=${sort}&direction=${direction}`);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load pledges.');
      setItems(data.items); setTotal(Number(data.total || 0)); setTotalPages(Math.max(1, Number(data.totalPages || 1)));
    } catch (e: any) { if (!silent) setError(e.message || 'Unable to load pledges.'); }
    finally { if (!silent) setLoading(false); }
  }, [page, search, from, to, sort, direction]);
  useEffect(() => { void load(); return startLiveRefresh(() => void load(true)); }, [load]);

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
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, marginBottom: 22 }}><div><div style={{ color: 'var(--green)', fontWeight: 800, fontSize: 13 }}>CHARITYPRO CLOUD</div><h1 style={{ color: 'var(--navy)', margin: '4px 0' }}>Pledges ({total.toLocaleString()})</h1><div style={{ color: 'var(--text-muted)' }}>Shared online pledges · 50 records per page</div></div><button className="btn btn-primary" onClick={() => { setError(''); setNotice(''); setEditing('new'); }}>New Pledge</button></div>
    {editing && <PledgeFormModal pledge={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={(_item, isNew) => { setEditing(null); setNotice(isNew ? 'Pledge added to the cloud.' : 'Pledge updated in the cloud.'); void load(true); }} />}
    {notice && <div className="card" style={{ padding: 14, color: 'var(--green)', fontWeight: 800, marginBottom: 16 }}>{notice}</div>}{error && <div className="card" style={{ padding: 14, color: 'var(--red)', fontWeight: 700, marginBottom: 16 }}>{error}</div>}
    <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="filter-strip"><input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Live search donor, notes, amount, currency or date" /><input type="date" value={from} onChange={event=>{setFrom(event.target.value);setPage(1);}} title="From date"/><input type="date" value={to} onChange={event=>{setTo(event.target.value);setPage(1);}} title="To date"/></div>
      {loading ? <div style={{ padding: 40, textAlign: 'center' }}>Loading pledges...</div> : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>
        <SortableTh column="date" label="Date" sort={sort} direction={direction} onSort={changeSort}/><SortableTh column="donor" label="Donor" sort={sort} direction={direction} onSort={changeSort}/><th>Yiddish name</th><th>Campaign</th><SortableTh column="amount" label="Pledge" sort={sort} direction={direction} onSort={changeSort} align="right"/><th style={{textAlign:'right'}}>Paid</th><th style={{textAlign:'right'}}>Scheduled</th><th style={{textAlign:'right'}}>Open balance</th><th />
      </tr></thead><tbody>{items.map(item => <tr key={item.id} onClick={() => setSelectedPledgeId(item.id)} style={{ cursor: 'pointer' }}><td>{item.date}</td><td style={{ fontWeight: 800 }}>{item.donorName}</td><td dir="rtl" style={{fontWeight:700}}>{item.donorHebrewName||'—'}</td><td>{item.campaignName || 'Legacy / Unassigned'}</td><td style={{ textAlign: 'right', fontWeight: 800 }}>{item.currency} ${item.amount.toFixed(2)}</td><td style={{textAlign:'right'}}>${Number(item.paid||0).toFixed(2)}</td><td style={{textAlign:'right'}}>${Number(item.scheduled||0).toFixed(2)}</td><td style={{textAlign:'right',fontWeight:900,color:Number(item.balance||0)>0?'var(--red)':'var(--green)'}}>${Number(item.balance||0).toFixed(2)}</td><td style={{ textAlign: 'right' }}><button className="btn btn-secondary btn-sm" onClick={event => { event.stopPropagation(); setError(''); setNotice(''); setEditing(item); }}>Edit</button> <button className="btn btn-danger btn-sm" onClick={event => { event.stopPropagation(); void remove(item); }}>Delete</button></td></tr>)}{items.length === 0 && <tr><td colSpan={9} style={{ padding: 30, textAlign: 'center' }}>No matching pledges.</td></tr>}</tbody></table></div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: 14, borderTop: '1px solid var(--border)' }}><span>Page {page} of {totalPages}</span><div style={{ display: 'flex', gap: 8 }}><button className="btn btn-secondary btn-sm" disabled={page <= 1 || loading} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</button><button className="btn btn-secondary btn-sm" disabled={page >= totalPages || loading} onClick={() => setPage(value => Math.min(totalPages, value + 1))}>Next</button></div></div>
    </section>
    {selectedPledgeId && <CloudPledgeDetailsModal pledgeId={selectedPledgeId} onClose={() => setSelectedPledgeId(null)} />}
  </div></main>;
};
