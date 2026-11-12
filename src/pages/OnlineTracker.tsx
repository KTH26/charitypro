import React, { useCallback, useEffect, useState } from 'react';
import { PhoneCall, Search } from 'lucide-react';
import { startLiveRefresh } from '../utils/liveUpdates';
import { RecordCallModal, CALL_OUTCOMES } from '../components/RecordCallModal';
import { CallDetailsModal, type CallRecord } from '../components/CallDetailsModal';
import { CloudDonorProfileModal } from '../components/CloudDonorProfileModal';
import { OnlineDonorForm, type OnlineDonor } from '../components/OnlineDonorForm';

const shortText = (text: string, length = 90) => text.length > length ? `${text.slice(0, length).trim()}…` : text;

/** Tracker: every donor call in one list, and one button to record a new call. */
export const OnlineTracker: React.FC = () => {
  const [items, setItems] = useState<CallRecord[]>([]);
  const [page, setPage] = useState(1); const [totalPages, setTotalPages] = useState(1); const [total, setTotal] = useState(0);
  const [search, setSearch] = useState(''); const [outcome, setOutcome] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [recording, setRecording] = useState(false);
  const [selected, setSelected] = useState<CallRecord | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [editingDonor, setEditingDonor] = useState<OnlineDonor | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50', search, outcome, from, to });
      const response = await fetch(`/api/v3/donor-contacts?${params}`);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load calls.');
      setItems(data.items || []); setTotal(Number(data.total || 0)); setTotalPages(Math.max(1, Number(data.totalPages || 1))); setError('');
    } catch (reason: any) { if (!silent) setError(reason.message || 'Unable to load calls.'); }
    finally { if (!silent) setLoading(false); }
  }, [page, search, outcome, from, to]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), search ? 250 : 0); return () => window.clearTimeout(timer); }, [load, search]);
  useEffect(() => startLiveRefresh(() => void load(true)), [load]);

  return <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: 28, fontFamily: 'Inter, sans-serif' }}><div style={{ maxWidth: 1400, margin: '0 auto' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
      <div><h1 style={{ color: 'var(--navy)', margin: 0 }}>Call Tracker</h1><div style={{ color: 'var(--text-muted)', marginTop: 4 }}>Every call to a donor. Each call is also saved in that donor’s pop-up.</div></div>
      <button type="button" className="btn btn-primary call-start-button" onClick={() => setRecording(true)}><PhoneCall size={18} /> Record a Call</button>
    </div>
    <section className="card" style={{ padding: 16, marginBottom: 18 }}><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <div className="search-box" style={{ flex: '1 1 220px', maxWidth: 320 }}><Search className="search-icon" size={18} /><input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Search donor or notes" /></div>
      <select value={outcome} onChange={event => { setOutcome(event.target.value); setPage(1); }} style={{ width: 170 }}><option value="">All answers</option>{CALL_OUTCOMES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>From <input type="date" value={from} onChange={event => { setFrom(event.target.value); setPage(1); }} /></label>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>To <input type="date" value={to} onChange={event => { setTo(event.target.value); setPage(1); }} /></label>
      <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>{total} call{total === 1 ? '' : 's'}</span>
    </div></section>
    {error && <div style={{ color: 'var(--red)', fontWeight: 700, marginBottom: 14 }}>{error}</div>}
    <section className="card" style={{ padding: 0, overflow: 'hidden' }}><div className="table-container"><table>
      <thead><tr><th>Date</th><th>Donor</th><th>Answer</th><th>Short note</th><th>Fundraiser</th></tr></thead>
      <tbody>
        {loading && <tr><td colSpan={5} style={{ padding: 30, textAlign: 'center' }}>Loading calls…</td></tr>}
        {!loading && items.map(item => <tr key={item.id} onClick={() => setSelected(item)} style={{ cursor: 'pointer' }}>
          <td style={{ whiteSpace: 'nowrap' }}>{item.date}</td>
          <td style={{ fontWeight: 700 }}>{item.donorName}</td>
          <td><span className={`call-badge call-badge-${item.outcome.toLowerCase().replace(/\s+/g, '-')}`}>{item.outcome}</span>{item.followUpDate && item.outcome === 'Call back' && <small style={{ display: 'block', color: 'var(--text-muted)' }}>on {item.followUpDate}</small>}{item.pickupStatus === 'open' && <small style={{ display: 'block', color: 'var(--yellow)', fontWeight: 700 }}>to pick up</small>}</td>
          <td style={{ color: 'var(--text-secondary)' }}>{shortText(item.notes || '')}</td>
          <td>{item.fundraiserName || '—'}</td>
        </tr>)}
        {!loading && items.length === 0 && <tr><td colSpan={5} style={{ padding: 30, textAlign: 'center' }}>No calls yet. Click “Record a Call” to add the first one.</td></tr>}
      </tbody>
    </table></div></section>
    {totalPages > 1 && <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 14, alignItems: 'center' }}><button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page} of {totalPages}</span><button className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => setPage(value => value + 1)}>Next</button></div>}

    {recording && <RecordCallModal onClose={() => setRecording(false)} onSaved={() => void load(true)} />}
    {selected && <CallDetailsModal call={selected} onClose={() => setSelected(null)} onSaved={call => { setSelected(call); void load(true); }} onOpenDonor={donorId => { setSelected(null); setProfileId(donorId); }} />}
    {profileId && <CloudDonorProfileModal donorId={profileId} onClose={() => setProfileId(null)} onEdit={donor => { setProfileId(null); setEditingDonor(donor); }} />}
    {editingDonor && <div className="modal-overlay" onClick={() => setEditingDonor(null)}><div onClick={event => event.stopPropagation()} style={{ width: 'min(900px,94vw)', maxHeight: '92vh', overflowY: 'auto' }}><OnlineDonorForm donor={editingDonor} onCancel={() => setEditingDonor(null)} onSaved={() => { setEditingDonor(null); void load(true); }} onConflict={() => setEditingDonor(null)} /></div></div>}
  </div></main>;
};
