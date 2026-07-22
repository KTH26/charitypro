import React, { useCallback, useEffect, useState } from 'react';
import { CloudPaymentDetailsModal } from '../components/CloudPaymentDetailsModal';
import { SortableTh, type SortDirection } from '../components/SortableTh';

type PendingPayment = { id: string; revision: number; donorId: string; donorName: string; amount: number; amountCAD?: number; currency: string; date: string; method: string; notes?: string; [key: string]: any };
const money = (value: number) => Number(value || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const OnlinePendingPayments: React.FC = () => {
  const [items, setItems] = useState<PendingPayment[]>([]);
  const [page, setPage] = useState(1); const [totalPages, setTotalPages] = useState(1); const [total, setTotal] = useState(0); const [totalCAD, setTotalCAD] = useState(0);
  const [search, setSearch] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [selected, setSelected] = useState<PendingPayment | null>(null);
  const [sort, setSort] = useState('date'); const [direction, setDirection] = useState<SortDirection>('desc');
  const changeSort = (column: string) => { setDirection(current => sort === column ? (current === 'asc' ? 'desc' : 'asc') : (column === 'date' || column === 'amount' ? 'desc' : 'asc')); setSort(column); setPage(1); };
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      await fetch('/api/v3/schedules/process-due', { method: 'POST' });
      const params = new URLSearchParams({ page: String(page), limit: '50', status: 'pending', method: 'credit_card', search, from, to, sort, direction });
      const response = await fetch(`/api/v3/payments?${params}`); const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load pending payments.');
      setItems(data.items || []); setTotal(Number(data.total || 0)); setTotalCAD(Number(data.totalCAD || 0)); setTotalPages(Math.max(1, Number(data.totalPages || 1))); setError('');
    } catch (reason: any) { if (!silent) setError(reason.message || 'Unable to load pending payments.'); }
    finally { if (!silent) setLoading(false); }
  }, [page, search, from, to, sort, direction]);
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(true), 4000); return () => window.clearInterval(timer); }, [load]);
  const decline = async (item: PendingPayment) => {
    if (!confirm(`Mark the ${item.date} payment for ${item.donorName} as declined?`)) return;
    try {
      const response = await fetch(`/api/v3/records/transactions/${encodeURIComponent(item.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ revision: item.revision, data: { type: 'declined', notes: `${item.notes || ''}${item.notes ? ' ' : ''}Marked declined during payment follow-up.` } }) });
      const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || 'Unable to mark the payment declined.');
      setNotice('Payment moved to Declined for follow-up.'); await load(true);
    } catch (reason: any) { setError(reason.message || 'Unable to update the payment.'); }
  };
  return <main style={{ padding: 28, minHeight: '100vh', background: 'var(--bg)' }}><div style={{ maxWidth: 1400, margin: '0 auto' }}>
    <div style={{ marginBottom: 22 }}><div style={{ color: 'var(--green)', fontWeight: 800, fontSize: 13 }}>CHARITYPRO CLOUD</div><h1 style={{ margin: '4px 0', color: 'var(--navy)' }}>Pending Sola Verification ({total.toLocaleString()})</h1><div style={{ color: 'var(--text-muted)' }}>Payments whose scheduled date has arrived but are not approved until they are matched to Sola.</div><div style={{ color: 'var(--blue)', fontWeight: 800, marginTop: 5 }}>Pending total: CAD ${money(totalCAD)}</div></div>
    {notice && <div className="card" style={{ color: 'var(--green)', fontWeight: 800, marginBottom: 14 }}>{notice}</div>}{error && <div className="card" style={{ color: 'var(--red)', marginBottom: 14 }}>{error}</div>}
    <section className="filter-strip"><input className="search-field" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Search donor, amount, notes or account" /><input type="date" value={from} onChange={event => { setFrom(event.target.value); setPage(1); }} title="From date" /><input type="date" value={to} onChange={event => { setTo(event.target.value); setPage(1); }} title="To date" /></section>
    <section className="card" style={{ padding: 0, overflow: 'hidden' }}>{loading ? <div style={{ padding: 40, textAlign: 'center' }}>Loading pending payments…</div> : <div className="table-container"><table><thead><tr>
      <SortableTh column="date" label="Due Date" sort={sort} direction={direction} onSort={changeSort}/><SortableTh column="donor" label="Donor" sort={sort} direction={direction} onSort={changeSort}/><SortableTh column="method" label="Method" sort={sort} direction={direction} onSort={changeSort}/><SortableTh column="notes" label="Notes" sort={sort} direction={direction} onSort={changeSort}/><SortableTh column="amount" label="Amount" sort={sort} direction={direction} onSort={changeSort} align="right"/><th />
    </tr></thead><tbody>{items.map(item => <tr key={item.id} onClick={() => setSelected(item)} style={{ cursor: 'pointer' }}><td>{item.date}</td><td><strong>{item.donorName}</strong></td><td>{String(item.method).replaceAll('_', ' ')}</td><td>{item.notes || 'Scheduled payment awaiting Sola verification'}</td><td style={{ textAlign: 'right', fontWeight: 800 }}>{item.currency} ${money(item.amount)}</td><td style={{ textAlign: 'right' }}><button className="btn btn-danger btn-sm" onClick={event => { event.stopPropagation(); void decline(item); }}>Declined</button></td></tr>)}{items.length === 0 && <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center' }}>No pending Sola payments.</td></tr>}</tbody></table></div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: 14, borderTop: '1px solid var(--border)' }}><span>Page {page} of {totalPages}</span><div style={{ display: 'flex', gap: 8 }}><button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button><button className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => setPage(value => value + 1)}>Next</button></div></div>
    </section>
    {selected && <CloudPaymentDetailsModal payment={selected} onClose={() => setSelected(null)} onUpdated={payment => { setSelected(payment); void load(true); }} />}
  </div></main>;
};
