import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Plus, Trash2, X } from 'lucide-react';
import { startLiveRefresh } from '../utils/liveUpdates';
import { HebrewCalendarPicker, HebrewMonthGrid, MonthNav, useDedications } from '../components/HebrewCalendar';
import { DonorPicker, type PickedDonor } from '../components/DonorPicker';
import { type CalendarSlot, type Dedication, hebYearText, monthsOfYear, slotId, slotLabel, todayHebrew } from '../utils/hebrewCalendar';

const name = (item: Dedication) => item.donorYiddishName || item.donorName || '—';

/** Book days / months for a donor straight from the calendar (without a pledge). */
const BookModal: React.FC<{ initial: CalendarSlot[]; onClose: () => void; onSaved: () => void }> = ({ initial, onClose, onSaved }) => {
  const [donor, setDonor] = useState<PickedDonor | null>(null);
  const [slots, setSlots] = useState<CalendarSlot[]>(initial);
  const [honoree, setHonoree] = useState('');
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const save = async () => {
    if (!donor || !slots.length) { setError('Choose the donor and at least one date.'); return; }
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/v3/dedications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ donorId: donor.id, honoree, items: slots }) });
      const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || 'Unable to book these dates.');
      onSaved();
    } catch (reason: any) { setError(reason.message); } finally { setSaving(false); }
  };
  return <div className="modal-overlay" onClick={onClose}><div className="modal" onClick={event => event.stopPropagation()} style={{ maxWidth: 640, width: '94%' }}>
    <div className="modal-header"><h2 style={{ margin: 0 }}>Book calendar dates</h2><button className="modal-close" onClick={onClose}><X size={20} /></button></div>
    <div className="modal-body" style={{ display: 'grid', gap: 14 }}>
      {error && <div className="pay-error">{error}</div>}
      <div className="form-group" style={{ margin: 0 }}><span>Donor</span><DonorPicker value={donor} onChange={setDonor} autoFocus /></div>
      <div className="form-group" style={{ margin: 0 }}><span>Dates</span><div className="hcal-chips">{slots.map(slot => <span key={slotId(slot)} className="hcal-chip" dir="rtl">{slotLabel(slot)}</span>)}{!slots.length && <small style={{ color: 'var(--text-muted)' }}>No dates yet.</small>}</div><button type="button" className="btn btn-secondary btn-sm" style={{ justifySelf: 'start', marginTop: 6 }} onClick={() => setPicking(true)}><CalendarDays size={14} /> Choose dates…</button></div>
      <label className="form-group" style={{ margin: 0 }}><span>Name to show (in honor / in memory of)</span><input dir="auto" value={honoree} onChange={event => setHonoree(event.target.value)} maxLength={300} /></label>
      <small style={{ color: 'var(--text-muted)' }}>Tip: dates are usually booked from the pledge (New Pledge → Calendar dates), so the money and the dates stay together.</small>
    </div>
    <div className="modal-footer"><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Book'}</button></div>
    {picking && <HebrewCalendarPicker title="Choose dates" initial={slots} initialHonoree={honoree} onClose={() => setPicking(false)} onDone={(next, nextHonoree) => { setSlots(next); setHonoree(nextHonoree); setPicking(false); }} />}
  </div></div>;
};

/** A booked day or month: who, for whom, change the name or remove it. */
const DetailsModal: React.FC<{ item: Dedication; onClose: () => void; onSaved: () => void }> = ({ item, onClose, onSaved }) => {
  const [honoree, setHonoree] = useState(item.honoree || ''); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const call = async (method: 'PUT' | 'DELETE') => {
    if (method === 'DELETE' && !window.confirm(`Remove the booking of ${item.label} for ${name(item)}? The date becomes free again.`)) return;
    setSaving(true); setError('');
    try {
      const response = await fetch(`/api/v3/dedications/${encodeURIComponent(item.id)}`, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'PUT' ? JSON.stringify({ honoree, notes: item.notes || '' }) : undefined });
      const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || 'Unable to save.');
      onSaved();
    } catch (reason: any) { setError(reason.message); } finally { setSaving(false); }
  };
  return <div className="modal-overlay" onClick={onClose}><div className="modal" onClick={event => event.stopPropagation()} style={{ maxWidth: 520, width: '94%' }}>
    <div className="modal-header"><h2 style={{ margin: 0 }} dir="rtl">{slotLabel(item)}</h2><button className="modal-close" onClick={onClose}><X size={20} /></button></div>
    <div className="modal-body" style={{ display: 'grid', gap: 12 }}>
      {error && <div className="pay-error">{error}</div>}
      <div><strong style={{ fontSize: 18 }} dir="rtl">{name(item)}</strong>{item.donorYiddishName && <div style={{ color: 'var(--text-muted)' }}>{item.donorName}</div>}</div>
      <div style={{ color: 'var(--text-muted)' }}>{item.kind === 'month' ? 'Whole month' : `English date: ${item.date}`}{item.pledgeId ? ' · Booked with a pledge' : ''}</div>
      <label className="form-group" style={{ margin: 0 }}><span>Name to show (in honor / in memory of)</span><input dir="auto" value={honoree} onChange={event => setHonoree(event.target.value)} maxLength={300} /></label>
    </div>
    <div className="modal-footer"><button className="btn btn-secondary" style={{ marginRight: 'auto', color: 'var(--red)' }} disabled={saving} onClick={() => void call('DELETE')}><Trash2 size={15} /> Remove booking</button><button className="btn btn-secondary" onClick={onClose}>Close</button><button className="btn btn-primary" disabled={saving} onClick={() => void call('PUT')}>Save</button></div>
  </div></div>;
};

/** The Hebrew calendar: every day and every month of the year, and who took it. */
export const OnlineCalendar: React.FC = () => {
  const today = todayHebrew();
  const [view, setView] = useState({ month: today.getMonth(), year: today.getFullYear() });
  const [version, setVersion] = useState(0);
  const { items, byId, error } = useDedications(view.year, version);
  const [booking, setBooking] = useState<CalendarSlot[] | null>(null);
  const [details, setDetails] = useState<Dedication | null>(null);
  useEffect(() => startLiveRefresh(() => setVersion(value => value + 1)), []);
  const refresh = () => { setBooking(null); setDetails(null); setVersion(value => value + 1); };

  const months = monthsOfYear(view.year);
  const inMonth = useMemo(() => items.filter(item => item.hebMonth === view.month && item.kind === 'day').sort((a, b) => Number(a.hebDay) - Number(b.hebDay)), [items, view.month]);
  const daysBooked = items.filter(item => item.kind === 'day').length;
  const totalDays = months.reduce((sum, month) => sum + month.days, 0);
  const onDay = (day: number) => { const id = slotId({ kind: 'day', hebYear: view.year, hebMonth: view.month, hebDay: day }); const found = byId.get(id); if (found) setDetails(found); else setBooking([{ kind: 'day', hebYear: view.year, hebMonth: view.month, hebDay: day }]); };
  const onMonth = () => { const found = byId.get(slotId({ kind: 'month', hebYear: view.year, hebMonth: view.month })); if (found) setDetails(found); else setBooking([{ kind: 'month', hebYear: view.year, hebMonth: view.month }]); };

  return <div style={{ padding: 28, maxWidth: 1400, margin: '0 auto' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
      <div><div style={{ color: 'var(--green)', fontWeight: 800, fontSize: 13 }}>CHARITYPRO CLOUD</div><h1 style={{ margin: '4px 0', color: 'var(--navy)' }}>Calendar <span dir="rtl">{hebYearText(view.year)}</span></h1><div style={{ color: 'var(--text-muted)' }}>{daysBooked} of {totalDays} days taken · {items.filter(item => item.kind === 'month').length} of {months.length} months sponsored</div></div>
      <button className="btn btn-primary" onClick={() => setBooking([])}><Plus size={16} /> Book dates</button>
    </div>
    {error && <div className="card pay-error" style={{ padding: 14 }}>{error}</div>}
    <div className="hcal-page">
      <section className="card" style={{ padding: 18 }}>
        <MonthNav year={view.year} month={view.month} onChange={(month, year) => setView({ month, year })} />
        <HebrewMonthGrid big year={view.year} month={view.month} booked={byId} onDay={onDay} onMonth={onMonth} />
        <div style={{ marginTop: 16 }}><h3 style={{ margin: '0 0 8px', color: 'var(--navy)' }}>Days taken this month ({inMonth.length})</h3>
          {inMonth.length ? <div className="hcal-list">{inMonth.map(item => <button key={item.id} type="button" onClick={() => setDetails(item)}><span dir="rtl" className="hcal-list-date">{slotLabel(item)}</span><strong dir="rtl">{name(item)}</strong><small dir="auto">{item.honoree}</small></button>)}</div> : <small style={{ color: 'var(--text-muted)' }}>No days taken yet. Click a day to book it.</small>}
        </div>
      </section>
      <aside className="card" style={{ padding: 18 }}>
        <h3 style={{ margin: '0 0 10px', color: 'var(--navy)' }}>Month sponsors <span dir="rtl">{hebYearText(view.year)}</span></h3>
        <div className="hcal-sponsors">{months.map(month => { const sponsor = byId.get(slotId({ kind: 'month', hebYear: view.year, hebMonth: month.month })); const daysTaken = items.filter(item => item.kind === 'day' && item.hebMonth === month.month).length; return <button key={month.month} type="button" className={month.month === view.month ? 'active' : ''} onClick={() => setView({ month: month.month, year: view.year })}>
          <span dir="rtl" className="hcal-sponsor-month">{month.he}</span>
          <span className={sponsor ? 'hcal-sponsor-name' : 'hcal-sponsor-free'} dir="rtl">{sponsor ? name(sponsor) : 'Available'}</span>
          <small>{daysTaken}/{month.days} days</small>
        </button>; })}</div>
      </aside>
    </div>
    {booking && <BookModal initial={booking} onClose={() => setBooking(null)} onSaved={refresh} />}
    {details && <DetailsModal item={details} onClose={() => setDetails(null)} onSaved={refresh} />}
  </div>;
};
