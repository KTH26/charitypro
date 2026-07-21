import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Plus, Star, Trash2, X } from 'lucide-react';
import { HDate } from '@hebcal/core';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type SponsorshipDay = {
  id: string;
  date: string;
  note: string;
  year: number;
  donorId: string;
  donorName: string;
  donorRevision: number;
};

type DonorChoice = { id: string; name: string; revision: number };
type DayForm = { donorId: string; donorName: string; revision: number; day: string; note: string; year: number };
const blankForm = (): DayForm => ({ donorId: '', donorName: '', revision: 0, day: '', note: '', year: new Date().getFullYear() });

export const OnlineCalendar: React.FC = () => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [monthDays, setMonthDays] = useState<SponsorshipDay[]>([]);
  const [upcoming, setUpcoming] = useState<SponsorshipDay[]>([]);
  const [upcomingTotal, setUpcomingTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<SponsorshipDay | 'new' | null>(null);
  const [form, setForm] = useState<DayForm>(blankForm());
  const [donors, setDonors] = useState<DonorChoice[]>([]);
  const [donorSearch, setDonorSearch] = useState('');
  const requestId = useRef('');

  const monthPad = String(selectedMonth + 1).padStart(2, '0');
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`/api/v3/sponsorship-days?month=${monthPad}&page=${page}&limit=50`);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load the sponsorship calendar.');
      setMonthDays(data.items || []);
      setUpcoming(data.upcoming || []);
      setUpcomingTotal(Number(data.upcomingTotal || 0));
      setTotal(Number(data.total || 0));
      setTotalPages(Math.max(1, Number(data.totalPages || 1)));
      setError('');
    } catch (reason: any) {
      if (!silent) setError(reason.message || 'Unable to load the sponsorship calendar.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [monthPad, page]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 3000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (editing !== 'new') return;
    const timer = window.setTimeout(() => {
      fetch(`/api/v3/donors?limit=50&search=${encodeURIComponent(donorSearch)}`)
        .then(response => response.json())
        .then(data => { if (data.success) setDonors(data.items || []); })
        .catch(() => undefined);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [editing, donorSearch]);

  const year = new Date().getFullYear();
  const daysInMonth = new Date(year, selectedMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, selectedMonth, 1).getDay();
  const byDay = useMemo(() => {
    const result: Record<number, SponsorshipDay[]> = {};
    monthDays.forEach(day => {
      const number = Number(day.date.split('-')[1]);
      if (!result[number]) result[number] = [];
      result[number].push(day);
    });
    return result;
  }, [monthDays]);

  const openNew = () => {
    setEditing('new');
    setForm({ ...blankForm(), day: `${monthPad}-` });
    setDonorSearch('');
    setError('');
    requestId.current = '';
  };

  const openEdit = (day: SponsorshipDay) => {
    setEditing(day);
    setForm({ donorId: day.donorId, donorName: day.donorName, revision: day.donorRevision, day: day.date, note: day.note, year: day.year || year });
    setError('');
    requestId.current = '';
  };

  const save = async () => {
    if (!form.donorId || !form.day || !form.note.trim()) { setError('Donor, date, and occasion are required.'); return; }
    const key = requestId.current || crypto.randomUUID(); requestId.current = key;
    const current = editing === 'new' ? null : editing;
    try {
      const response = await fetch(current ? `/api/v3/sponsorship-days/${encodeURIComponent(current.donorId)}/${encodeURIComponent(current.id)}` : '/api/v3/sponsorship-days', {
        method: current ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({ donorId: form.donorId, revision: form.revision, date: form.day, note: form.note.trim(), year: form.year })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to save the sponsorship day.');
      requestId.current = '';
      setEditing(null);
      await load(true);
    } catch (reason: any) {
      requestId.current = '';
      setError(reason.message || 'Unable to save the sponsorship day.');
      await load(true);
    }
  };

  const remove = async (day: SponsorshipDay) => {
    if (!window.confirm(`Delete ${day.donorName}'s sponsorship day on ${day.date}?`)) return;
    const key = crypto.randomUUID();
    const response = await fetch(`/api/v3/sponsorship-days/${encodeURIComponent(day.donorId)}/${encodeURIComponent(day.id)}`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify({ revision: day.donorRevision })
    });
    const data = await response.json();
    if (!response.ok || !data.success) setError(data.error || 'Unable to delete the sponsorship day.');
    await load(true);
  };

  return <div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
      <div><h2 style={{ margin: '0 0 4px', fontFamily: 'Outfit, sans-serif', color: 'var(--navy)', fontSize: '1.5rem' }}>Sponsorship Calendar</h2><p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '.9rem' }}>Track yahrzeit, anniversary, and sponsorship days per donor</p></div>
      <button className="btn btn-primary" onClick={openNew}><Plus size={16}/> Add Sponsorship Day</button>
    </div>

    <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>{MONTHS.map((month, index) => <button key={month} onClick={() => { setSelectedMonth(index); setPage(1); }} style={{ padding: '8px 14px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '.85rem', transition: 'all .2s', background: selectedMonth === index ? 'linear-gradient(135deg, var(--navy-light), var(--navy))' : 'var(--bg-card)', color: selectedMonth === index ? '#fff' : 'var(--text-secondary)', boxShadow: selectedMonth === index ? '0 4px 12px rgba(37,99,235,.3)' : 'var(--shadow-sm)', border: selectedMonth === index ? '2px solid transparent' : '1px solid var(--border)' }}>{month}</button>)}</div>
    {error && !editing && <div className="card" style={{ padding: 14, color: 'var(--red)', marginBottom: 16 }}>{error}</div>}

    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 24 }}>
      <div className="card">
        <h3 style={{ margin: '0 0 20px', color: 'var(--navy)', fontFamily: 'Outfit, sans-serif' }}>{MONTHS[selectedMonth]} {year}{total > 0 && <span style={{ marginLeft: 12, fontSize: '.85rem', color: 'var(--navy-light)', fontWeight: 600 }}>{total} sponsorship day{total !== 1 ? 's' : ''}</span>}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 4 }}>{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day => <div key={day} style={{ textAlign: 'center', fontSize: '.75rem', fontWeight: 800, color: 'var(--text-muted)', padding: 8, textTransform: 'uppercase', letterSpacing: 1 }}>{day}</div>)}</div>
        {loading ? <div style={{ padding: 40, textAlign: 'center' }}>Loading calendar...</div> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
          {Array.from({ length: firstDayOfWeek }).map((_, index) => <div key={`empty-${index}`} style={{ minHeight: 70, borderRadius: 8 }}/>) }
          {Array.from({ length: daysInMonth }, (_, index) => index + 1).map(dayNumber => {
            const events = byDay[dayNumber] || []; const isToday = new Date().getDate() === dayNumber && new Date().getMonth() === selectedMonth;
            return <div key={dayNumber} style={{ minHeight: 70, borderRadius: 10, padding: 8, position: 'relative', background: events.length ? 'var(--yellow-bg)' : isToday ? 'var(--navy-bg)' : 'var(--bg-input)', border: events.length ? '1px solid rgba(217,119,6,.3)' : isToday ? '1px solid var(--navy-light)' : '1px solid var(--border)', transition: 'all .2s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><div style={{ fontWeight: 700, fontSize: '.9rem', color: isToday ? 'var(--navy-light)' : 'var(--text-secondary)' }}>{dayNumber}</div><div style={{ fontSize: '.75rem', color: 'var(--text-muted)', textAlign: 'right' }}>{new HDate(new Date(year, selectedMonth, dayNumber)).renderGematriya(true)}</div></div>
              {events.map(event => <button key={event.id} onClick={() => openEdit(event)} title={`${event.donorName}: ${event.note}`} style={{ width: '100%', border: 0, cursor: 'pointer', fontSize: '.7rem', fontWeight: 700, color: 'var(--gold)', background: 'rgba(217,119,6,.15)', borderRadius: 4, padding: '2px 6px', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 3 }}><Star size={8} fill="currentColor"/> {event.donorName.split(' ')[0]}</button>)}
            </div>;
          })}
        </div>}
        {totalPages > 1 && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}><span style={{ color: 'var(--text-muted)', fontSize: '.82rem' }}>Page {page} of {totalPages} · 50 days maximum</span><div style={{ display: 'flex', gap: 8 }}><button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button><button className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => setPage(value => value + 1)}>Next</button></div></div>}
      </div>

      <div>
        <div className="card"><h3 style={{ margin: '0 0 16px', color: 'var(--navy)', fontFamily: 'Outfit, sans-serif', fontSize: '1rem' }}>{MONTHS[selectedMonth]} Sponsorship Days</h3>{!monthDays.length ? <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px 0', fontSize: '.9rem' }}>No sponsorship days this month.<br/><button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={openNew}>+ Add One</button></div> : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{monthDays.map(day => <div key={`${day.donorId}-${day.id}`} onClick={() => openEdit(day)} style={{ padding: '12px 16px', background: 'var(--yellow-bg)', borderRadius: 12, border: '1px solid rgba(217,119,6,.2)', cursor: 'pointer' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}><div><div style={{ fontWeight: 800, color: 'var(--gold)', fontSize: '.9rem' }}>{MONTHS[selectedMonth]} {Number(day.date.split('-')[1])}</div><div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>{day.donorName}</div><div style={{ color: 'var(--text-muted)', fontSize: '.8rem', marginTop: 2 }}>{day.note}</div></div><button onClick={event => { event.stopPropagation(); void remove(day); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><Trash2 size={14}/></button></div></div>)}</div>}</div>
        <div className="card" style={{ marginTop: 16 }}><h3 style={{ margin: '0 0 12px', color: 'var(--navy)', fontFamily: 'Outfit, sans-serif', fontSize: '1rem' }}>All Upcoming Days</h3>{!upcoming.length ? <div style={{ color: 'var(--text-muted)', fontSize: '.9rem', textAlign: 'center', padding: 20 }}>None added yet.</div> : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{upcoming.map(day => <div key={`${day.donorId}-${day.id}`} onClick={() => openEdit(day)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-input)', borderRadius: 8, cursor: 'pointer' }}><div><span style={{ fontWeight: 800, color: 'var(--gold)', fontSize: '.8rem', marginRight: 8 }}>{MONTHS[Number(day.date.split('-')[0]) - 1]} {Number(day.date.split('-')[1])}</span><span style={{ fontWeight: 600, fontSize: '.85rem' }}>{day.donorName}</span></div><span style={{ fontSize: '.75rem', color: 'var(--text-muted)', textAlign: 'right' }}>{day.note}</span></div>)}</div>}{upcomingTotal > 50 && <div style={{ marginTop: 10, color: 'var(--text-muted)', fontSize: '.75rem' }}>Showing the first 50 of {upcomingTotal} days.</div>}</div>
      </div>
    </div>

    {editing && <div className="modal-overlay" onClick={() => setEditing(null)}><div className="modal" onClick={event => event.stopPropagation()}><div className="modal-header"><h2 style={{ margin: 0 }}>{editing === 'new' ? 'Add Sponsorship Day' : 'Sponsorship Day Details / Edit'}</h2><button className="modal-close" onClick={() => setEditing(null)}><X size={20}/></button></div><div className="modal-body">{error && <div style={{ color: 'var(--red)', fontWeight: 700, marginBottom: 14 }}>{error}</div>}<div style={{ display: 'grid', gap: 16 }}>
      {editing === 'new' ? <><div className="form-group" style={{ margin: 0 }}><label>Search Donors</label><input value={donorSearch} onChange={event => setDonorSearch(event.target.value)} placeholder="Name, phone, email, or donor ID"/></div><div className="form-group" style={{ margin: 0 }}><label>Donor *</label><select value={form.donorId} onChange={event => { const donor = donors.find(item => item.id === event.target.value); setForm(current => ({ ...current, donorId: donor?.id || '', donorName: donor?.name || '', revision: donor?.revision || 0 })); }}><option value="">— Select Donor —</option>{donors.map(donor => <option key={donor.id} value={donor.id}>{donor.name}</option>)}</select><span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Up to 50 matching donors are shown.</span></div></> : <div className="form-group" style={{ margin: 0 }}><label>Donor</label><input value={form.donorName} readOnly/></div>}
      <div className="form-group" style={{ margin: 0 }}><label>Date (Month-Day) *</label><input type="text" placeholder="e.g. 09-15 for September 15" value={form.day} onChange={event => setForm(current => ({ ...current, day: event.target.value }))}/><span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Format: MM-DD (e.g. 09-15)</span></div>
      <div className="form-group" style={{ margin: 0 }}><label>Note / Occasion *</label><input type="text" placeholder="e.g. Yahrzeit - Father, Anniversary Sponsorship" value={form.note} onChange={event => setForm(current => ({ ...current, note: event.target.value }))}/></div>
    </div></div><div className="modal-footer">{editing !== 'new' && <button className="btn btn-secondary" style={{ marginRight: 'auto', color: 'var(--red)' }} onClick={() => void remove(editing)}><Trash2 size={15}/> Delete</button>}<button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button><button className="btn btn-primary" onClick={() => void save()} disabled={!form.donorId || !form.day || !form.note.trim()}><Calendar size={16}/> {editing === 'new' ? 'Add Day' : 'Save All Changes'}</button></div></div></div>}
  </div>;
};
