import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { type CalendarSlot, type Dedication, WEEKDAYS_HE, daysOfMonth, hebMonthName, hebMonthEnglish, hebYearText, monthsOfYear, slotId, slotLabel, stepMonth, todayHebrew, weekFrom } from '../utils/hebrewCalendar';

const shortName = (item: Dedication) => item.donorYiddishName || item.donorName || '—';

/** Loads every booking of one Hebrew year. Refreshes when `version` changes. */
export const useDedications = (year: number, version = 0) => {
  const [items, setItems] = useState<Dedication[]>([]);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/v3/dedications?hebYear=${year}`);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load the calendar.');
      setItems(data.items || []); setError('');
    } catch (reason: any) { setError(reason.message || 'Unable to load the calendar.'); }
  }, [year]);
  useEffect(() => { void load(); }, [load, version]);
  const byId = useMemo(() => new Map(items.map(item => [item.id, item])), [items]);
  return { items, byId, error, reload: load };
};

/**
 * One Hebrew month as a grid (Sunday to Shabbos), plus the "whole month" box beside it.
 * Booked days are red with the name; chosen days are green.
 */
export const HebrewMonthGrid: React.FC<{
  year: number; month: number; booked: Map<string, Dedication>; chosen?: Set<string>; mine?: Set<string>;
  onDay: (day: number) => void; onMonth?: () => void; big?: boolean;
}> = ({ year, month, booked, chosen, mine, onDay, onMonth, big }) => {
  const days = daysOfMonth(month, year);
  const lead = days[0].weekday;
  const monthId = slotId({ kind: 'month', hebYear: year, hebMonth: month });
  const monthBooking = booked.get(monthId);
  const today = todayHebrew();
  return <div className={`hcal ${big ? 'hcal-big' : ''}`}>
    <div className="hcal-grid" dir="rtl">
      {WEEKDAYS_HE.map(day => <div key={day} className="hcal-head">{day}</div>)}
      {Array.from({ length: lead }, (_, index) => <div key={`blank-${index}`} />)}
      {days.map(item => {
        const id = slotId({ kind: 'day', hebYear: year, hebMonth: month, hebDay: item.day });
        const booking = booked.get(id);
        const isMine = mine?.has(id); const isChosen = chosen?.has(id);
        const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === item.day;
        const state = isChosen ? 'chosen' : isMine ? 'mine' : booking ? 'taken' : 'free';
        return <button type="button" key={item.day} className={`hcal-day hcal-${state} ${isToday ? 'hcal-today' : ''}`} onClick={() => onDay(item.day)} title={booking ? `${shortName(booking)}${booking.honoree ? ` – ${booking.honoree}` : ''}` : item.iso}>
          <span className="hcal-num">{item.he}</span><span className="hcal-greg">{item.greg.getDate()}/{item.greg.getMonth() + 1}</span>
          {booking && <span className="hcal-name">{shortName(booking)}</span>}
          {big && booking?.honoree && <span className="hcal-honoree">{booking.honoree}</span>}
        </button>;
      })}
    </div>
    <div className={`hcal-month ${chosen?.has(monthId) ? 'hcal-chosen' : mine?.has(monthId) ? 'hcal-mine' : monthBooking ? 'hcal-taken' : 'hcal-free'}`}>
      <div className="hcal-month-title">Whole month<br /><strong dir="rtl">{hebMonthName(month, year)}</strong></div>
      {monthBooking ? <><strong>{shortName(monthBooking)}</strong>{monthBooking.honoree && <small>{monthBooking.honoree}</small>}</> : <small>Not sponsored yet</small>}
      {onMonth && <button type="button" className="btn btn-secondary btn-sm" onClick={onMonth}>{monthBooking && !mine?.has(monthId) ? 'Details' : chosen?.has(monthId) ? 'Remove' : 'Choose month'}</button>}
    </div>
  </div>;
};

/** Year / month arrows. */
export const MonthNav: React.FC<{ year: number; month: number; onChange: (month: number, year: number) => void }> = ({ year, month, onChange }) => <div className="hcal-nav">
  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { const next = stepMonth(month, year, -1); onChange(next.month, next.year); }}><ChevronLeft size={16} /> Before</button>
  <div className="hcal-nav-title"><strong dir="rtl">{hebMonthName(month, year)} {hebYearText(year)}</strong><small>{hebMonthEnglish(month, year)} {year}</small></div>
  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { const next = stepMonth(month, year, 1); onChange(next.month, next.year); }}>Next <ChevronRight size={16} /></button>
</div>;

/**
 * Pop-up to choose calendar dates for a pledge: single days, a week (7 days in a row) or a whole month.
 * Dates already taken by someone else are red and cannot be chosen.
 */
export const HebrewCalendarPicker: React.FC<{
  title: string; initial: CalendarSlot[]; initialHonoree: string; mine?: Set<string>;
  onClose: () => void; onDone: (slots: CalendarSlot[], honoree: string) => void;
}> = ({ title, initial, initialHonoree, mine, onClose, onDone }) => {
  const today = todayHebrew();
  const [view, setView] = useState({ month: initial[0]?.hebMonth || today.getMonth(), year: initial[0]?.hebYear || today.getFullYear() });
  const [mode, setMode] = useState<'day' | 'week' | 'month'>('day');
  const [chosen, setChosen] = useState<CalendarSlot[]>(initial);
  const [honoree, setHonoree] = useState(initialHonoree);
  const [message, setMessage] = useState('');
  // Load this year and the next, so a week can cross into the new year.
  const current = useDedications(view.year); const next = useDedications(view.year + 1);
  const booked = useMemo(() => new Map([...current.byId, ...next.byId]), [current.byId, next.byId]);
  const chosenIds = useMemo(() => new Set(chosen.map(slotId)), [chosen]);
  const takenBy = (slot: CalendarSlot) => { const booking = booked.get(slotId(slot)); return booking && !mine?.has(booking.id) ? booking : null; };

  const toggle = (slots: CalendarSlot[]) => {
    setMessage('');
    const taken = slots.map(takenBy).filter(Boolean) as Dedication[];
    if (taken.length) { setMessage(`Already taken: ${taken.map(item => `${item.label} – ${shortName(item)}`).join(', ')}`); return; }
    const ids = slots.map(slotId);
    const allChosen = ids.every(id => chosenIds.has(id));
    setChosen(currentSlots => allChosen ? currentSlots.filter(slot => !ids.includes(slotId(slot))) : [...currentSlots.filter(slot => !ids.includes(slotId(slot))), ...slots]);
  };
  const onDay = (day: number) => {
    if (mode === 'month') { toggle([{ kind: 'month', hebYear: view.year, hebMonth: view.month }]); return; }
    toggle(mode === 'week' ? weekFrom(day, view.month, view.year) : [{ kind: 'day', hebYear: view.year, hebMonth: view.month, hebDay: day }]);
  };
  const days = chosen.filter(slot => slot.kind === 'day').length; const months = chosen.filter(slot => slot.kind === 'month').length;

  return <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1300 }}><div className="modal" onClick={event => event.stopPropagation()} style={{ maxWidth: 860, width: '96%', maxHeight: '96vh', overflowY: 'auto' }}>
    <div className="modal-header"><h2 style={{ margin: 0 }}>{title}</h2><button type="button" className="modal-close" onClick={onClose}><X size={20} /></button></div>
    <div className="modal-body" style={{ display: 'grid', gap: 12 }}>
      <div className="pay-toggle" role="group" style={{ justifySelf: 'start' }}>
        {([['day', 'Days'], ['week', 'A week (7 days)'], ['month', 'Whole month']] as const).map(([value, label]) => <button type="button" key={value} className={mode === value ? 'active' : ''} onClick={() => setMode(value)}>{label}</button>)}
      </div>
      <small style={{ color: 'var(--text-muted)' }}>{mode === 'day' ? 'Click every day he takes. Click again to remove it.' : mode === 'week' ? 'Click the first day; the 7 days from there are chosen.' : 'Click any day (or "Choose month") to take the whole month.'} Red = taken by someone else.</small>
      <MonthNav year={view.year} month={view.month} onChange={(month, year) => setView({ month, year })} />
      <HebrewMonthGrid year={view.year} month={view.month} booked={booked} chosen={chosenIds} mine={mine} onDay={onDay} onMonth={() => toggle([{ kind: 'month', hebYear: view.year, hebMonth: view.month }])} />
      {message && <div className="pay-error">{message}</div>}
      <div className="hcal-chips">{chosen.length ? chosen.map(slot => <span key={slotId(slot)} className="hcal-chip" dir="rtl">{slotLabel(slot)}<button type="button" onClick={() => setChosen(currentSlots => currentSlots.filter(item => slotId(item) !== slotId(slot)))}>×</button></span>) : <small style={{ color: 'var(--text-muted)' }}>Nothing chosen yet.</small>}</div>
      <label className="form-group" style={{ margin: 0 }}><span>Name to show on these dates (in honor / in memory of)</span><input dir="auto" value={honoree} onChange={event => setHonoree(event.target.value)} placeholder="לעילוי נשמת ר׳ ... בן ..." maxLength={300} /></label>
    </div>
    <div className="modal-footer"><span style={{ marginRight: 'auto', color: 'var(--text-muted)', fontWeight: 700 }}>{days} day{days === 1 ? '' : 's'}{months ? `, ${months} month${months === 1 ? '' : 's'}` : ''}</span><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" onClick={() => onDone(chosen, honoree.trim())}>Done</button></div>
  </div></div>;
};

export { monthsOfYear };
