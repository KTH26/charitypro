import React, { useCallback, useEffect, useState } from 'react';
import { OnlineDonorForm, type OnlineDonor } from '../components/OnlineDonorForm';
import { CloudDonorProfileModal } from '../components/CloudDonorProfileModal';

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

  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(''); }
    const params = new URLSearchParams({ page: String(page), limit: '50' });
    if (search) params.set('search', search);
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
  }, [page, search]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const interval = window.setInterval(() => void load(true), 3000);
    return () => window.clearInterval(interval);
  }, [load]);
  useEffect(() => { setPage(1); }, [search]);

  const saved = (message: string) => {
    setEditing(null);
    setNotice(message);
    setPage(1);
    void load();
  };

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: 28, fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'center', marginBottom: 22 }}>
          <div><div style={{ color: 'var(--green)', fontWeight: 800, fontSize: 13 }}>CHARITYPRO CLOUD</div><h1 style={{ color: 'var(--navy)', margin: '4px 0' }}>Donors ({total.toLocaleString()})</h1><div style={{ color: 'var(--text-muted)' }}>Cloud records and calculated giving totals. Updates automatically every 3 seconds.</div></div>
          <button className="btn btn-primary" onClick={() => { setEditing('new'); setNotice(''); }}>Add Donor</button>
        </div>

        {editing && <OnlineDonorForm donor={editing === 'new' ? undefined : editing} onCancel={() => setEditing(null)} onSaved={saved} onConflict={message => { setEditing(null); setNotice(message); void load(); }} />}
        {notice && <div className="card" style={{ padding: 14, marginBottom: 16, color: notice.includes('changed by another') ? 'var(--red)' : 'var(--green)', fontWeight: 800 }}>{notice}</div>}
        <section className="card" style={{ padding: 18, marginBottom: 18 }}>
          <form onSubmit={event => { event.preventDefault(); setSearch(searchInput.trim()); }} style={{ display: 'flex', gap: 10 }}><input style={{ flex: 1 }} value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Search name, phone, email, Hebrew name, or donor ID" /><button className="btn btn-primary" type="submit">Search</button>{search && <button className="btn btn-secondary" type="button" onClick={() => { setSearchInput(''); setSearch(''); }}>Clear</button>}</form>
        </section>

        {error && <div className="card" style={{ padding: 16, color: 'var(--red)', marginBottom: 16 }}>{error}</div>}
        <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? <div style={{ padding: 40, textAlign: 'center' }}>Loading donors from the cloud...</div> : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th>Donor</th><th>Phone</th><th>Email</th><th>Address</th><th style={{ textAlign: 'right' }}>Total given</th><th /></tr></thead>
            <tbody>{items.map(donor => <tr key={donor.id} onClick={() => setProfileId(donor.id)} style={{ cursor: 'pointer' }}>
              <td><div style={{ fontWeight: 800 }}>{donor.name}</div><div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{donor.displayId || donor.id}</div>{(donor.hebFirstName || donor.hebLastName) && <div dir="rtl" style={{ color: 'var(--navy-light)', fontSize: 13, textAlign: 'left' }}>{[donor.preTitle, donor.hebFirstName, donor.hebLastName, donor.title].filter(Boolean).join(' ')}</div>}</td>
              <td>{donor.phone}</td><td>{donor.email || ''}</td><td>{donor.address || ''}</td>
              <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--green)' }}>${Number(donor.totalGiven || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td style={{ textAlign: 'right' }}><button className="btn btn-secondary btn-sm" onClick={event => { event.stopPropagation(); setEditing(donor); setNotice(''); }}>Edit</button></td>
            </tr>)}{items.length === 0 && <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center' }}>No matching donors.</td></tr>}</tbody>
          </table></div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderTop: '1px solid var(--border)' }}><span>Page {page} of {totalPages}</span><div style={{ display: 'flex', gap: 8 }}><button className="btn btn-secondary btn-sm" disabled={page <= 1 || loading} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</button><button className="btn btn-secondary btn-sm" disabled={page >= totalPages || loading} onClick={() => setPage(value => Math.min(totalPages, value + 1))}>Next</button></div></div>
        </section>
      </div>
      {profileId && <CloudDonorProfileModal donorId={profileId} onClose={() => setProfileId(null)} onEdit={donor => { setProfileId(null); setEditing(donor); }} />}
    </main>
  );
};
