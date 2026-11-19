import React, { useCallback, useEffect, useState } from 'react';
import { startLiveRefresh } from '../utils/liveUpdates';
import { CloudPledgeDetailsModal } from '../components/CloudPledgeDetailsModal';
import { ColumnTh, ColumnFilterChips, useListColumns } from '../components/ColumnTh';
import { type FundraiserAllocationDraft } from '../components/FundraiserAllocationEditor';
import { PledgeFormModal, type PledgeForEdit } from '../components/PledgeFormModal';
import { ListFooter, ListToolbar, NewButton, ResetLink, RowMenu, SingleView } from '../components/ListLayout';

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
  const cols = useListColumns('date', 'desc', () => setPage(1));

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`/api/v3/pledges?page=${page}&limit=50&search=${encodeURIComponent(search)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&${cols.query}`);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load pledges.');
      setItems(data.items); setTotal(Number(data.total || 0)); setTotalPages(Math.max(1, Number(data.totalPages || 1)));
    } catch (e: any) { if (!silent) setError(e.message || 'Unable to load pledges.'); }
    finally { if (!silent) setLoading(false); }
  }, [page, search, from, to, cols.query]);
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

  return <main className="page list-page"><div className="page-inner">
    <SingleView label="All Pledges" count={total} />
    <div className="list-body">
    <ListToolbar end={<NewButton onClick={() => { setError(''); setNotice(''); setEditing('new'); }}>New Pledge</NewButton>}>
      <input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Live search donor, notes, tag, amount, currency or date" /><input type="date" value={from} onChange={event=>{setFrom(event.target.value);setPage(1);}} title="From date"/><input type="date" value={to} onChange={event=>{setTo(event.target.value);setPage(1);}} title="To date"/>
      {(search || from || to || cols.hasFilters) && <ResetLink onClick={() => { setSearch(''); setFrom(''); setTo(''); cols.clearFilters(); setPage(1); }} />}
    </ListToolbar>
    <ColumnFilterChips cols={cols} />
    {editing && <PledgeFormModal pledge={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={(_item, isNew) => { setEditing(null); setNotice(isNew ? 'Pledge added to the cloud.' : 'Pledge updated in the cloud.'); void load(true); }} />}
    {notice && <div className="list-notice ok">{notice}</div>}{error && <div className="list-notice bad">{error}</div>}
    <section className="list-table">
      {loading ? <div className="list-loading">Loading pledges...</div> : <div className="list-scroll"><table><thead><tr>
        <ColumnTh cols={cols} column="date" label="Date" kind="date"/><ColumnTh cols={cols} column="donor" label="Donor"/><ColumnTh cols={cols} column="yiddish" label="Yiddish name"/><ColumnTh cols={cols} column="campaign" label="Campaign"/><ColumnTh cols={cols} column="tags" label="Tags"/><ColumnTh cols={cols} column="amount" label="Pledge" kind="number" align="right"/><ColumnTh cols={cols} column="paid" label="Paid" kind="number" align="right"/><ColumnTh cols={cols} column="scheduled" label="Scheduled" kind="number" align="right"/><ColumnTh cols={cols} column="balance" label="Open balance" kind="number" align="right"/><th className="row-actions" />
      </tr></thead><tbody>{items.map(item => <tr key={item.id} onClick={() => setSelectedPledgeId(item.id)} style={{ cursor: 'pointer' }}><td>{item.date}</td><td className="cell-main">{item.donorName}</td><td dir="rtl" style={{fontWeight:600}}>{item.donorHebrewName||'—'}</td><td>{item.campaignName || 'Legacy / Unassigned'}</td><td>{(Array.isArray((item as any).tags) ? (item as any).tags as string[] : []).map(tag => <span key={tag} className="badge" dir="auto" style={{ background: 'var(--info-soft)', color: 'var(--info-ink)', marginRight: 4, whiteSpace: 'nowrap' }}>{tag}</span>)}</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{item.currency} ${item.amount.toFixed(2)}</td><td style={{textAlign:'right'}}>${Number(item.paid||0).toFixed(2)}</td><td style={{textAlign:'right'}}>${Number(item.scheduled||0).toFixed(2)}</td><td style={{textAlign:'right',fontWeight:600,color:Number(item.balance||0)>0?'var(--red)':'var(--green)'}}>${Number(item.balance||0).toFixed(2)}</td><td className="row-actions"><RowMenu items={[{ label: 'Edit', onClick: () => { setError(''); setNotice(''); setEditing(item); } }, { label: 'Delete', danger: true, onClick: () => { void remove(item); } }]} /></td></tr>)}{items.length === 0 && <tr><td colSpan={10} className="list-empty">No matching pledges.</td></tr>}</tbody></table></div>}
      <ListFooter page={page} totalPages={totalPages} total={total} pageSize={50} shown={items.length} loading={loading} onPage={setPage} />
    </section>
    </div>
    {selectedPledgeId && <CloudPledgeDetailsModal pledgeId={selectedPledgeId} onClose={() => setSelectedPledgeId(null)} />}
  </div></main>;
};
