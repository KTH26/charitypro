import React, { useState } from 'react';
import { useStore } from '../store';
import { Plus, X, Trash2, Calendar, Star } from 'lucide-react';
import { HDate } from '@hebcal/core';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const CalendarPage: React.FC = () => {
  const { donors, addSponsorshipDay, removeSponsorshipDay } = useStore();
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth()); // 0-indexed
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ donorId: '', day: '', note: '' });

  // Collect all sponsorship days across all donors
  const allDays = donors.flatMap(d =>
    (d.sponsorshipDays || []).map(s => ({ ...s, donor: d }))
  );

  // Filter to current month (MM-DD format, month is 1-indexed)
  const monthPad = String(selectedMonth + 1).padStart(2, '0');
  const monthDays = allDays.filter(s => s.date.startsWith(monthPad + '-'));

  // Build day grid for current month (current year for display)
  const year = new Date().getFullYear();
  const daysInMonth = new Date(year, selectedMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, selectedMonth, 1).getDay();

  // Group by day number
  const byDay: Record<number, typeof monthDays> = {};
  monthDays.forEach(s => {
    const day = parseInt(s.date.split('-')[1]);
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(s);
  });

  const handleAdd = () => {
    if (!addForm.donorId || !addForm.day || !addForm.note) return;
    const [m, d] = addForm.day.split('-');
    addSponsorshipDay(addForm.donorId, {
      date: `${m}-${d}`,
      note: addForm.note,
      year: new Date().getFullYear(),
    });
    setAddForm({ donorId: '', day: '', note: '' });
    setShowAdd(false);
  };

  return (
    <div>
      {/* Header + Month Selector */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ margin: '0 0 4px', fontFamily: 'Outfit, sans-serif', color: 'var(--navy)', fontSize: '1.5rem' }}>
            Sponsorship Calendar
          </h2>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Track yahrzeit, anniversary, and sponsorship days per donor
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <Plus size={16} /> Add Sponsorship Day
        </button>
      </div>

      {/* Month tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {MONTHS.map((m, i) => (
          <button key={m} onClick={() => setSelectedMonth(i)} style={{
            padding: '8px 14px', borderRadius: '999px', cursor: 'pointer',
            fontFamily: 'inherit', fontWeight: 700, fontSize: '0.85rem', transition: 'all 0.2s',
            background: selectedMonth === i ? 'linear-gradient(135deg, var(--navy-light), var(--navy))' : 'var(--bg-card)',
            color: selectedMonth === i ? '#fff' : 'var(--text-secondary)',
            boxShadow: selectedMonth === i ? '0 4px 12px rgba(37,99,235,0.3)' : 'var(--shadow-sm)',
            border: selectedMonth === i ? '2px solid transparent' : '1px solid var(--border)',
          }}>{m}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '24px' }}>
        {/* Calendar Grid */}
        <div className="card">
          <h3 style={{ margin: '0 0 20px', color: 'var(--navy)', fontFamily: 'Outfit, sans-serif' }}>
            {MONTHS[selectedMonth]} {year}
            {monthDays.length > 0 && (
              <span style={{ marginLeft: '12px', fontSize: '0.85rem', color: 'var(--navy-light)', fontWeight: 600 }}>
                {monthDays.length} sponsorship day{monthDays.length !== 1 ? 's' : ''}
              </span>
            )}
          </h3>

          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', padding: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
            {/* Empty cells before first day */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`e${i}`} style={{ minHeight: '70px', borderRadius: '8px' }} />
            ))}
            {/* Day cells */}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
              const events = byDay[day] || [];
              const isToday = new Date().getDate() === day && new Date().getMonth() === selectedMonth;
              return (
                <div key={day} style={{
                  minHeight: '70px', borderRadius: '10px', padding: '8px', position: 'relative',
                  background: events.length > 0 ? 'var(--yellow-bg)' : isToday ? 'var(--navy-bg)' : 'var(--bg-input)',
                  border: events.length > 0 ? '1px solid rgba(217,119,6,0.3)' : isToday ? '1px solid var(--navy-light)' : '1px solid var(--border)',
                  transition: 'all 0.2s'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: isToday ? 'var(--navy-light)' : 'var(--text-secondary)' }}>{day}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                      {new HDate(new Date(year, selectedMonth, day)).renderGematriya(true)}
                    </div>
                  </div>
                  {events.map(e => (
                    <div key={e.id} style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--gold)', background: 'rgba(217,119,6,0.15)', borderRadius: '4px', padding: '2px 6px', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <Star size={8} fill="currentColor" /> {e.donor.name.split(' ')[0]}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* Event List */}
        <div>
          <div className="card">
            <h3 style={{ margin: '0 0 16px', color: 'var(--navy)', fontFamily: 'Outfit, sans-serif', fontSize: '1rem' }}>
              {MONTHS[selectedMonth]} Sponsorship Days
            </h3>
            {monthDays.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px 0', fontSize: '0.9rem' }}>
                No sponsorship days this month.<br />
                <button className="btn btn-secondary btn-sm" style={{ marginTop: '12px' }} onClick={() => setShowAdd(true)}>+ Add One</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {monthDays.sort((a, b) => a.date.localeCompare(b.date)).map(s => (
                  <div key={s.id} style={{ padding: '12px 16px', background: 'var(--yellow-bg)', borderRadius: '12px', border: '1px solid rgba(217,119,6,0.2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 800, color: 'var(--gold)', fontSize: '0.9rem' }}>
                          {MONTHS[selectedMonth]} {parseInt(s.date.split('-')[1])}
                        </div>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>{s.donor.name}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '2px' }}>{s.note}</div>
                      </div>
                      <button onClick={() => removeSponsorshipDay(s.donor.id, s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming all months */}
          <div className="card" style={{ marginTop: '16px' }}>
            <h3 style={{ margin: '0 0 12px', color: 'var(--navy)', fontFamily: 'Outfit, sans-serif', fontSize: '1rem' }}>All Upcoming Days</h3>
            {allDays.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '20px' }}>None added yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {allDays.sort((a, b) => a.date.localeCompare(b.date)).map(s => (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-input)', borderRadius: '8px' }}>
                    <div>
                      <span style={{ fontWeight: 800, color: 'var(--gold)', fontSize: '0.8rem', marginRight: '8px' }}>
                        {MONTHS[parseInt(s.date.split('-')[0]) - 1]} {parseInt(s.date.split('-')[1])}
                      </span>
                      <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{s.donor.name}</span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.note}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ margin: 0 }}>Add Sponsorship Day</h2>
              <button className="modal-close" onClick={() => setShowAdd(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gap: '16px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Donor *</label>
                  <select value={addForm.donorId} onChange={e => setAddForm(f => ({ ...f, donorId: e.target.value }))}>
                    <option value="">— Select Donor —</option>
                    {donors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Date (Month-Day) *</label>
                  <input type="text" placeholder="e.g. 09-15 for September 15" value={addForm.day}
                    onChange={e => setAddForm(f => ({ ...f, day: e.target.value }))} />
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Format: MM-DD (e.g. 09-15)</span>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Note / Occasion *</label>
                  <input type="text" placeholder="e.g. Yahrzeit - Father, Anniversary Sponsorship" value={addForm.note}
                    onChange={e => setAddForm(f => ({ ...f, note: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdd} disabled={!addForm.donorId || !addForm.day || !addForm.note}>
                <Calendar size={16} /> Add Day
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
