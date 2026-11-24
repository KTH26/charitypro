import React, { useCallback, useEffect, useState } from 'react';
import { startLiveRefresh } from '../utils/liveUpdates';
import { OnlineDonorForm, type OnlineDonor } from '../components/OnlineDonorForm';
import { CloudDonorProfileModal } from '../components/CloudDonorProfileModal';
import { ColumnTh, ColumnFilterChips, useListColumns } from '../components/ColumnTh';
import { GoogleSheetDonorSyncModal } from '../components/GoogleSheetDonorSyncModal';
import { ListFooter, ListToolbar, NewButton, ResetLink, RowMenu, SingleView } from '../components/ListLayout';

type DonorResponse = { success: boolean; items: OnlineDonor[]; page: number; total: number; totalPages: number; error?: string };

export const OnlineDonors: React.FC = () => {
  const [items, setItems] = useState<OnlineDonor[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<OnlineDonor | 'new' | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [sheetSyncOpen, setSheetSyncOpen] = useState(false);
  const cols = useListColumns('name', 'asc', () => setPage(1)); const { sort, direction } = cols;

  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(''); }
    const params = new URLSearchParams({ page: String(page), limit: '50' }); for (const [key, value] of Object.entries(cols.filters)) params.set(`f_${key}`, value);
    if (search) params.set('search', search);
    params.set('sort', sort); params.set('direction', direction);
    try {
      const response = await fetch(`/api/v3/donors?${params.toString()}`);
      const data = await response.json() as DonorResponse;
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load donors.');
      setError('');
      setItems(data.items);
      setTotal(data.total);
      setTotalPages(Math.max(1, data.totalPages));
    } catch (e: any) {
      if (!silent) setError(e.message || 'Unable to load donors.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [page, search, cols.query]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    return startLiveRefresh(() => void load(true));
  }, [load]);
  useEffect(() => { setPage(1); }, [search]);
  useEffect(() => { const timer = window.setTimeout(() => setSearch(searchInput.trim()), 220); return () => window.clearTimeout(timer); }, [searchInput]);

  const saved = (message: string) => {
    setEditing(null);
    setNotice(message);
    setPage(1);
    void load();
  };

  return (
    <main className="page list-page">
      <div className="page-inner">
        <SingleView label="All Donors" count={total} />
        <div className="list-body">
          <ListToolbar end={<><button className="btn btn-secondary" onClick={() => { setSheetSyncOpen(true); setNotice(''); }}>Sync Google Sheet</button><NewButton onClick={() => { setEditing('new'); setNotice(''); }}>Add Donor</NewButton></>}>
            <input value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Live search: name, phone, email, Hebrew name, address or donor ID" />
            {(searchInput || cols.hasFilters) && <ResetLink onClick={() => { setSearchInput(''); cols.clearFilters(); }} />}
          </ListToolbar>
<ColumnFilterChips cols={cols} />

          {editing && <OnlineDonorForm donor={editing === 'new' ? undefined : editing} onCancel={() => setEditing(null)} onSaved={saved} onConflict={message => { setEditing(null); setNotice(message); void load(); }} />}
          {notice && <div className={`list-notice ${notice.includes('changed by another') ? 'bad' : 'ok'}`}>{notice}</div>}
          {error && <div className="list-notice bad">{error}</div>}
          <section className="list-table">
            {loading ? <div className="list-loading">Loading donors from the cloud...</div> : <div className="list-scroll"><table>
              <thead><tr><ColumnTh cols={cols} column="name" label="Donor" /><ColumnTh cols={cols} column="yiddish" label="Yiddish name" /><ColumnTh cols={cols} column="phone" label="Phone" /><ColumnTh cols={cols} column="email" label="Email" /><ColumnTh cols={cols} column="address" label="Address" /><ColumnTh cols={cols} column="tags" label="Tags" /><ColumnTh cols={cols} column="openBalance" label="Open balance" kind="number" align="right" /><th className="row-actions" /></tr></thead>
              <tbody>{items.map(donor => <tr key={donor.id} onClick={() => setProfileId(donor.id)} style={{ cursor: 'pointer' }}>
                <td><div className="cell-main">{donor.name}</div><div className="cell-sub">{donor.displayId || donor.id}</div></td><td dir="rtl" style={{ fontWeight: 600, textAlign: 'left' }}>{[donor.preTitle, donor.hebFirstName, donor.hebLastName, donor.title].filter(Boolean).join(' ') || '—'}</td>
                <td>{donor.phone}</td><td>{donor.email || ''}</td><td>{donor.address || ''}</td><td>{(Array.isArray((donor as any).tags) ? (donor as any).tags as string[] : []).map(tag => <span key={tag} className="badge" dir="auto" style={{ background: 'var(--info-soft)', color: 'var(--info-ink)', marginRight: 4, whiteSpace: 'nowrap' }}>{tag}</span>)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: Number(donor.openBalance || 0)>0?'var(--red)':'var(--green)' }}>${Number(donor.openBalance || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="row-actions"><RowMenu items={[{ label: 'Open donor', onClick: () => setProfileId(donor.id) }, { label: 'Edit', onClick: () => { setEditing(donor); setNotice(''); } }]} /></td>
              </tr>)}{items.length === 0 && <tr><td colSpan={8} className="list-empty">No matching donors.</td></tr>}</tbody>
            </table></div>}
            <ListFooter page={page} totalPages={totalPages} total={total} pageSize={50} shown={items.length} loading={loading} onPage={setPage} />
          </section>
        </div>
      </div>
      {profileId && <CloudDonorProfileModal donorId={profileId} onClose={() => setProfileId(null)} onEdit={donor => { setProfileId(null); setEditing(donor); }} />}
      {sheetSyncOpen && <GoogleSheetDonorSyncModal
        onClose={() => setSheetSyncOpen(false)}
        onApplied={message => { setSheetSyncOpen(false); setNotice(message); setPage(1); void load(); }}
      />}
    </main>
  );
};
