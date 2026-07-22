import React, { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { CloudVendorDetailsModal } from '../components/CloudVendorDetailsModal';
import { SortableTh, type SortDirection } from '../components/SortableTh';

type VendorSummary = { name: string; billCount: number; totalBilled: number; balanceOwed: number };
const money = (value: number) => Number(value || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const OnlineVendors: React.FC = () => {
  const [items, setItems] = useState<VendorSummary[]>([]); const [page, setPage] = useState(1); const [totalPages, setTotalPages] = useState(1); const [total, setTotal] = useState(0);
  const [search, setSearch] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [selectedVendor, setSelectedVendor] = useState<string | null>(null);
  const [sort, setSort] = useState('name'); const [direction, setDirection] = useState<SortDirection>('asc');
  const changeSort = (column: string) => { setDirection(current => sort === column ? (current === 'asc' ? 'desc' : 'asc') : (column === 'name' ? 'asc' : 'desc')); setSort(column); setPage(1); };
  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(''); }
    try {
      const response = await fetch(`/api/v3/vendors?page=${page}&limit=50&search=${encodeURIComponent(search)}&sort=${sort}&direction=${direction}`); const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load vendors.');
      setItems(data.items); setTotal(Number(data.total || 0)); setTotalPages(Math.max(1, Number(data.totalPages || 1)));
    } catch (reason: any) { if (!silent) setError(reason.message || 'Unable to load vendors.'); }
    finally { if (!silent) setLoading(false); }
  }, [page, search, sort, direction]);
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(true), 3000); return () => window.clearInterval(timer); }, [load]);
  return <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: 28 }}><div style={{ maxWidth: 1400, margin: '0 auto' }}>
    <div style={{ marginBottom: 22 }}><div style={{ color: 'var(--green)', fontWeight: 800, fontSize: 13 }}>CHARITYPRO CLOUD</div><h1 style={{ color: 'var(--navy)', margin: '4px 0' }}>Vendors ({total.toLocaleString()})</h1><div style={{ color: 'var(--text-muted)' }}>Shared vendor totals calculated from cloud bills · 50 vendors per page</div></div>
    <section className="filter-strip"><div className="search-box" style={{ maxWidth: 420 }}><Search className="search-icon" size={18} /><input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Search vendors..." /></div></section>
    {error && <div className="card" style={{ padding: 14, color: 'var(--red)', fontWeight: 700, marginBottom: 16 }}>{error}</div>}
    <section className="card" style={{ padding: 0, overflow: 'hidden' }}>{loading ? <div style={{ padding: 40, textAlign: 'center' }}>Loading vendors...</div> : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%' }}><thead><tr>
      <SortableTh column="name" label="Vendor Name" sort={sort} direction={direction} onSort={changeSort}/><SortableTh column="total" label="Total Billed" sort={sort} direction={direction} onSort={changeSort} align="right"/><SortableTh column="balance" label="Balance Owed" sort={sort} direction={direction} onSort={changeSort} align="right"/><SortableTh column="count" label="Bill Count" sort={sort} direction={direction} onSort={changeSort} align="right"/>
    </tr></thead><tbody>{items.map(vendor => <tr key={vendor.name} onClick={() => setSelectedVendor(vendor.name)} style={{ cursor: 'pointer' }}><td style={{ fontWeight: 700, color: 'var(--navy)' }}>{vendor.name}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>${money(vendor.totalBilled)}</td><td style={{ textAlign: 'right', fontWeight: 700, color: vendor.balanceOwed > 0 ? 'var(--red)' : 'var(--text-muted)' }}>${money(vendor.balanceOwed)}</td><td style={{ textAlign: 'right' }}>{vendor.billCount} bills</td></tr>)}{items.length === 0 && <tr><td colSpan={4} style={{ padding: 40, textAlign: 'center' }}>No vendors found.</td></tr>}</tbody></table></div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: 14, borderTop: '1px solid var(--border)' }}><span>Page {page} of {totalPages}</span><div style={{ display: 'flex', gap: 8 }}><button className="btn btn-secondary btn-sm" disabled={page <= 1 || loading} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</button><button className="btn btn-secondary btn-sm" disabled={page >= totalPages || loading} onClick={() => setPage(value => Math.min(totalPages, value + 1))}>Next</button></div></div>
    </section>
  </div>{selectedVendor && <CloudVendorDetailsModal vendorName={selectedVendor} onClose={() => setSelectedVendor(null)} />}</main>;
};
