import React, { useCallback, useEffect, useState } from 'react';
import { startLiveRefresh } from '../utils/liveUpdates';
import { CloudPaymentDetailsModal } from '../components/CloudPaymentDetailsModal';
import { SortableTh, type SortDirection } from '../components/SortableTh';
import { ListFooter, ListToolbar, ResetLink, RowMenu, ViewTabs } from '../components/ListLayout';

type PendingPayment = { id: string; revision: number; donorId: string; donorName: string; amount: number; amountCAD?: number; currency: string; date: string; method: string; notes?: string; [key: string]: any };
const money = (value: number) => Number(value || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);

export const OnlinePendingPayments: React.FC = () => {
  const [items, setItems] = useState<PendingPayment[]>([]);
  const [page, setPage] = useState(1); const [totalPages, setTotalPages] = useState(1); const [total, setTotal] = useState(0); const [totalCAD, setTotalCAD] = useState(0);
  const [search, setSearch] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState(today);
  const [status,setStatus]=useState<'pending'|'declined'>('pending');
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [selected, setSelected] = useState<PendingPayment | null>(null);
  const [sort, setSort] = useState('date'); const [direction, setDirection] = useState<SortDirection>('desc');
  const changeSort = (column: string) => { setDirection(current => sort === column ? (current === 'asc' ? 'desc' : 'asc') : (column === 'date' || column === 'amount' ? 'desc' : 'asc')); setSort(column); setPage(1); };
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50', status, method: 'credit_card', search, from, to, sort, direction });
      const response = await fetch(`/api/v3/payments?${params}`); const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load pending payments.');
      setItems(data.items || []); setTotal(Number(data.total || 0)); setTotalCAD(Number(data.totalCAD || 0)); setTotalPages(Math.max(1, Number(data.totalPages || 1))); setError('');
    } catch (reason: any) { if (!silent) setError(reason.message || 'Unable to load pending payments.'); }
    finally { if (!silent) setLoading(false); }
  }, [page, search, from, to, sort, direction,status]);
  useEffect(() => { void load(); return startLiveRefresh(() => void load(true)); }, [load]);
  const sameCharge = async (item: PendingPayment, same: boolean, paymentId = '') => {
    if (same && !confirm(`Is the ${item.date} schedule payment for ${item.donorName} the SAME charge as the card payment already in? This waiting copy will be removed.`)) return;
    try { const response = await fetch(`/api/v3/payments/${encodeURIComponent(item.id)}/same-charge`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ same, paymentId, revision: item.revision }) }); const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || 'Not saved.'); setNotice(same ? 'Done: it was the same charge, the waiting copy is removed.' : 'Done: kept as a separate charge.'); await load(true); } catch (reason: any) { setError(reason.message || 'Not saved.'); }
  };
  const decline = async (item: PendingPayment) => {
    if (!confirm(`Mark the ${item.date} payment for ${item.donorName} as declined?`)) return;
    try {
      const response = await fetch(`/api/v3/payments/${encodeURIComponent(item.id)}/decline`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ revision: item.revision, reason: 'Marked declined during payment follow-up.' }) });
      const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || 'Unable to mark the payment declined.');
      setNotice('Payment moved to Declined for follow-up.'); await load(true);
    } catch (reason: any) { setError(reason.message || 'Unable to update the payment.'); }
  };
  const filtered = search !== '' || from !== '' || to !== today();
  const resetFilters = () => { setSearch(''); setFrom(''); setTo(today()); setPage(1); };
  return <main className="page list-page"><div className="page-inner">
    <ViewTabs
      views={[
        { key: 'pending', label: 'Pending', count: status === 'pending' ? total : undefined },
        { key: 'declined', label: 'Declined', count: status === 'declined' ? total : undefined },
      ]}
      value={status}
      onChange={key => { setStatus(key as 'pending' | 'declined'); setPage(1); }}
    />
    <div className="list-body">
      <ListToolbar>
        <input className="search-field" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Search donor, amount, notes or failure reason" />
        <input type="date" value={from} onChange={event => { setFrom(event.target.value); setPage(1); }} title="From date" />
        <input type="date" value={to} onChange={event => { setTo(event.target.value); setPage(1); }} title="To date" />
        {filtered && <ResetLink onClick={resetFilters} />}
      </ListToolbar>
      {notice && <div className="list-notice ok">{notice}</div>}{error && <div className="list-notice bad">{error}</div>}
      <div className="list-summary" style={{ marginBottom: 10 }}>{status==='pending'?'Pending Sola Verification: scheduled payments awaiting Sola confirmation.':'Declined Payment Work Queue: failed card attempts requiring follow-up. Declines never reduce a donor balance.'}</div>
      <section className="list-table">{loading ? <div className="list-loading">Loading pending payments…</div> : <div className="list-scroll"><table><thead><tr>
        <SortableTh column="date" label="Due Date" sort={sort} direction={direction} onSort={changeSort}/><SortableTh column="donor" label="Donor" sort={sort} direction={direction} onSort={changeSort}/><SortableTh column="method" label="Method" sort={sort} direction={direction} onSort={changeSort}/><SortableTh column="notes" label="Notes" sort={sort} direction={direction} onSort={changeSort}/><SortableTh column="amount" label="Amount" sort={sort} direction={direction} onSort={changeSort} align="right"/><th className="row-actions" />
      </tr></thead><tbody>{items.map(item => <tr key={item.id} onClick={() => setSelected(item)} style={{ cursor: 'pointer' }}><td>{item.date}</td><td className="cell-main">{item.donorName}</td><td>{String(item.method).replaceAll('_', ' ')}</td><td>{status==='declined'?(item.declineReason||item.notes||'Declined'):(item.notes||'Scheduled payment awaiting Sola verification')}{status==='pending'&&Array.isArray(item.maybeSameAs)&&item.maybeSameAs.length>0?<div style={{marginTop:6,display:'flex',gap:6,flexWrap:'wrap'}} onClick={event=>event.stopPropagation()}>{item.maybeSameAs.map((other:any)=><button key={other.paymentId} className="btn btn-secondary btn-sm" onClick={()=>void sameCharge(item,true,other.paymentId)} title="The card payment already in is this schedule payment: remove this waiting copy">Same charge as {other.date}</button>)}<button className="btn btn-ghost btn-sm" onClick={()=>void sameCharge(item,false)} title="It is a second, real charge: keep both">Separate charge</button></div>:null}{item.scheduledDate?<div className="cell-sub">Scheduled: {item.scheduledDate}{item.paymentMethodId?' · Saved card attempt':''}</div>:null}</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{item.currency} ${money(item.amount)}</td><td className="row-actions"><div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>{status==='declined'&&<span className="badge badge-red">Follow up</span>}<RowMenu items={[
        { label: 'Open payment', onClick: () => setSelected(item) },
        { label: 'Declined', danger: true, hidden: status !== 'pending', onClick: () => void decline(item) },
      ]} /></div></td></tr>)}{items.length === 0 && <tr><td colSpan={6} className="list-empty">No {status} Sola payments.</td></tr>}</tbody></table></div>}
        <ListFooter page={page} totalPages={totalPages} total={total} pageSize={50} shown={items.length} loading={loading} onPage={setPage}>
          <span style={{ color: status==='pending'?'var(--blue)':'var(--red)' }}>{status==='pending'?'Pending':'Declined'} total: CAD ${money(totalCAD)}</span>
        </ListFooter>
      </section>
    </div>
    {selected && <CloudPaymentDetailsModal payment={selected} onClose={() => setSelected(null)} onUpdated={payment => { setSelected(payment); void load(true); }} />}
  </div></main>;
};
