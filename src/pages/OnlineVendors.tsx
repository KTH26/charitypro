import React, { useCallback, useEffect, useState } from 'react';
import { startLiveRefresh } from '../utils/liveUpdates';
import { CloudVendorDetailsModal } from '../components/CloudVendorDetailsModal';
import { ColumnTh, ColumnFilterChips, useListColumns } from '../components/ColumnTh';
import { ListFooter, ListToolbar, ResetLink, RowMenu, SingleView } from '../components/ListLayout';

type VendorSummary = { name: string; billCount: number; totalBilled: number; balanceOwed: number };
const money = (value: number) => Number(value || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const OnlineVendors: React.FC = () => {
  const [items, setItems] = useState<VendorSummary[]>([]); const [page, setPage] = useState(1); const [totalPages, setTotalPages] = useState(1); const [total, setTotal] = useState(0);
  const [search, setSearch] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [selectedVendor, setSelectedVendor] = useState<string | null>(null);
  const cols = useListColumns('name', 'asc', () => setPage(1)); const { sort, direction } = cols;
  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(''); }
    try {
      const response = await fetch(`/api/v3/vendors?page=${page}&limit=50&search=${encodeURIComponent(search)}&${cols.query}`); const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load vendors.');
      setItems(data.items); setTotal(Number(data.total || 0)); setTotalPages(Math.max(1, Number(data.totalPages || 1)));
    } catch (reason: any) { if (!silent) setError(reason.message || 'Unable to load vendors.'); }
    finally { if (!silent) setLoading(false); }
  }, [page, search, cols.query]);
  useEffect(() => { void load(); return startLiveRefresh(() => void load(true)); }, [load]);
  return <main className="page list-page"><div className="page-inner">
    <SingleView label="All Vendors" count={total} />
    <div className="list-body">
      <ListToolbar>
        <input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Search vendors..." />
        {(search || cols.hasFilters) && <ResetLink onClick={() => { setSearch(''); cols.clearFilters(); setPage(1); }} />}
      </ListToolbar>
<ColumnFilterChips cols={cols} />
      {error && <div className="list-notice bad">{error}</div>}
      <section className="list-table">{loading ? <div className="list-loading">Loading vendors...</div> : <div className="list-scroll"><table><thead><tr>
        <ColumnTh cols={cols} column="name" label="Vendor Name" /><ColumnTh cols={cols} column="total" label="Total Billed" kind="number" align="right" /><ColumnTh cols={cols} column="balance" label="Balance Owed" kind="number" align="right" /><ColumnTh cols={cols} column="count" label="Bill Count" kind="number" align="right" /><th className="row-actions" />
      </tr></thead><tbody>{items.map(vendor => <tr key={vendor.name} onClick={() => setSelectedVendor(vendor.name)} style={{ cursor: 'pointer' }}><td className="cell-main">{vendor.name}</td><td style={{ textAlign: 'right', fontWeight: 600 }}>${money(vendor.totalBilled)}</td><td style={{ textAlign: 'right', fontWeight: 600, color: vendor.balanceOwed > 0 ? 'var(--red)' : 'var(--text-muted)' }}>${money(vendor.balanceOwed)}</td><td style={{ textAlign: 'right' }}>{vendor.billCount} bills</td><td className="row-actions"><RowMenu items={[{ label: 'Open vendor', onClick: () => setSelectedVendor(vendor.name) }]} /></td></tr>)}{items.length === 0 && <tr><td colSpan={5} className="list-empty">No vendors found.</td></tr>}</tbody></table></div>}
        <ListFooter page={page} totalPages={totalPages} total={total} pageSize={50} shown={items.length} loading={loading} onPage={setPage} />
      </section>
    </div>
  </div>{selectedVendor && <CloudVendorDetailsModal vendorName={selectedVendor} onClose={() => setSelectedVendor(null)} />}</main>;
};
