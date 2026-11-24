import React, { useCallback, useEffect, useState } from 'react';
import { startLiveRefresh } from '../utils/liveUpdates';
import { OnlineDonorForm, type OnlineDonor } from '../components/OnlineDonorForm';
import { CloudDonorProfileModal } from '../components/CloudDonorProfileModal';
import { ColumnTh, ColumnFilterChips, useListColumns } from '../components/ColumnTh';
import { GoogleSheetDonorSyncModal } from '../components/GoogleSheetDonorSyncModal';
import { ListFooter, ListToolbar, NewButton, ResetLink, RowMenu } from '../components/ListLayout';
import { Save, Trash2 } from 'lucide-react';
import type { ColumnKind } from '../components/ColumnTh';

// The tabs on top. Each one is a set of filters; your own saved tabs come after them.
const BASE_TABS: { key: string; label: string; filters: Record<string, string> }[] = [
  { key: 'all', label: 'All donors', filters: {} },
  { key: 'companies', label: 'Companies', filters: { kind: '=company' } },
  { key: 'open', label: 'With open balance', filters: { openBalance: '0.01..' } },
  { key: 'pledges', label: 'With pledges', filters: { pledgeCount: '1..' } },
  { key: 'schedules', label: 'With a monthly schedule', filters: { activeSchedules: '1..' } },
];
type DonorSheet = { id: string; name: string; base: string; filters: Record<string, string>; labels: Record<string, { label: string; kind: ColumnKind }>; sort: string; direction: 'asc' | 'desc'; search?: string };

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
  const [tab, setTab] = useState(() => { const wanted = new URLSearchParams(window.location.search).get('tab') || ''; return BASE_TABS.some(item => item.key === wanted) ? wanted : 'all'; });
  const [sheets, setSheets] = useState<DonorSheet[]>([]);
  const sheet = tab.startsWith('sheet:') ? sheets.find(item => `sheet:${item.id}` === tab) || null : null;
  const baseFilters = (BASE_TABS.find(item => item.key === (sheet ? sheet.base : tab)) || BASE_TABS[0]).filters;
  useEffect(() => { void (async () => { try { const response = await fetch('/api/v3/list-views?list=donors'); const data = await response.json(); if (response.ok && data.success) setSheets(data.views || []); } catch { /* none */ } })(); }, []);
  const openTab = (key: string) => {
    setTab(key); setPage(1); setNotice('');
    const chosen = key.startsWith('sheet:') ? sheets.find(item => `sheet:${item.id}` === key) : null;
    if (chosen) { cols.applyState({ sort: chosen.sort, direction: chosen.direction, filters: chosen.filters, labels: chosen.labels }); setSearchInput(chosen.search || ''); }
    else if (sheet) { cols.applyState({}); setSearchInput(''); }
    const url = new URL(window.location.href); if (key.startsWith('sheet:') || key === 'all') url.searchParams.delete('tab'); else url.searchParams.set('tab', key); window.history.replaceState(null, '', url.toString());
  };
  const saveSheets = async (next: DonorSheet[], message: string) => {
    try { const response = await fetch('/api/v3/list-views', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ list: 'donors', views: next }) }); const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || 'Could not save the tab.'); setSheets(data.views || []); setNotice(message); return true; }
    catch (reason: any) { setError(reason.message || 'Could not save the tab.'); return false; }
  };
  const current = () => ({ base: sheet ? sheet.base : tab, filters: cols.filters, labels: cols.labels, sort, direction, search: searchInput.trim() });
  const saveAsTab = async () => { const name = window.prompt('Name for this tab (for example “Need – open balance”):', ''); if (!name || !name.trim()) return; const id = crypto.randomUUID(); if (await saveSheets([...sheets, { id, name: name.trim(), ...current() } as DonorSheet], `Tab “${name.trim()}” saved. It opens the same way every time.`)) setTab(`sheet:${id}`); };
  const updateTab = async () => { if (sheet) await saveSheets(sheets.map(item => item.id === sheet.id ? { ...item, ...current() } as DonorSheet : item), `Tab “${sheet.name}” updated.`); };
  const deleteTab = async () => { if (!sheet || !window.confirm(`Delete the tab “${sheet.name}”? The donors are not touched.`)) return; if (await saveSheets(sheets.filter(item => item.id !== sheet.id), 'Tab deleted.')) openTab('all'); };

  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(''); }
    const params = new URLSearchParams({ page: String(page), limit: '50' }); for (const [key, value] of Object.entries({ ...baseFilters, ...cols.filters })) params.set(`f_${key}`, value);
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
  }, [page, search, cols.query, tab, sheets]);

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
        <div className="list-views" role="tablist" style={{ flexWrap: 'wrap' }}>
          {BASE_TABS.map(item => <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className={`list-view${tab === item.key ? ' active' : ''}`} onClick={() => openTab(item.key)}>{tab === item.key && <span className="list-view-count">{total}</span>}<span>{item.label}</span></button>)}
          {sheets.map(item => <button key={item.id} type="button" role="tab" aria-selected={tab === `sheet:${item.id}`} className={`list-view${tab === `sheet:${item.id}` ? ' active' : ''}`} onClick={() => openTab(`sheet:${item.id}`)} title="Your saved tab">{tab === `sheet:${item.id}` && <span className="list-view-count">{total}</span>}<span>★ {item.name}</span></button>)}
        </div>
        <div className="list-body">
          <ListToolbar end={<><button className="btn btn-secondary" onClick={() => { setSheetSyncOpen(true); setNotice(''); }}>Sync Google Sheet</button><NewButton onClick={() => { setEditing('new'); setNotice(''); }}>Add Donor</NewButton></>}>
            <input value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Live search: name, phone, email, Hebrew name, address or donor ID" />
            <button type="button" className="btn btn-secondary" onClick={() => void saveAsTab()} title="Save this view (tab, filters, sort and search) as your own tab"><Save size={15} /> Save as tab</button>
            {sheet && <button type="button" className="btn btn-secondary" onClick={() => void updateTab()}>Update “{sheet.name}”</button>}
            {sheet && <button type="button" className="btn btn-ghost" onClick={() => void deleteTab()} title="Delete this tab"><Trash2 size={15} /></button>}
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
