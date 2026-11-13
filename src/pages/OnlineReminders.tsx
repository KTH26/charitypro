import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Check, ChevronLeft, ChevronRight, List, CalendarDays, Send } from 'lucide-react';
import { startLiveRefresh } from '../utils/liveUpdates';

type Task = { id: string; revision: number; donorId?: string; donorName?: string; title: string; notes?: string; dueDate: string; priority: string; type: string; completed: boolean; [key: string]: any };
type Digest = { today: string; items: any[]; text: string };

const localToday = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };
const addDays = (iso: string, days: number) => { const date = new Date(`${iso}T12:00:00`); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); };
const nice = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Reminders: every scheduled reminder by date (list or month), what goes out this morning, and send it now. */
export const OnlineReminders: React.FC = () => {
  const today = localToday();
  const [view, setView] = useState<'list' | 'month'>('list');
  const [month, setMonth] = useState(() => ({ year: new Date().getFullYear(), month: new Date().getMonth() }));
  const [tasks, setTasks] = useState<Task[]>([]);
  const [digest, setDigest] = useState<Digest | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  const range = useMemo(() => {
    if (view === 'list') return { from: '', to: addDays(today, 90) };
    const first = `${month.year}-${String(month.month + 1).padStart(2, '0')}-01`;
    const last = new Date(month.year, month.month + 1, 0).getDate();
    return { from: first, to: `${month.year}-${String(month.month + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}` };
  }, [view, month, today]);
  const load = useCallback(async () => {
    try {
      const all: Task[] = [];
      for (let page = 1; page <= 5; page += 1) {
        const params = new URLSearchParams({ page: String(page), limit: '100', status: view === 'list' ? 'pending' : 'all', from: range.from, to: range.to });
        const response = await fetch(`/api/v3/tasks?${params}`); const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load reminders.');
        all.push(...(data.items || [])); if (page >= Number(data.totalPages || 1)) break;
      }
      // Declined / missing card payments are not reminders; they stay on the Tasks page and the donor card.
      setTasks(all.filter(task => task.type !== 'declined_payment').sort((a, b) => a.dueDate.localeCompare(b.dueDate)));
    } catch (reason: any) { setMessage({ ok: false, text: reason.message }); }
    fetch('/api/v3/reminders/today').then(response => response.json()).then(data => { if (data.success) setDigest(data); }).catch(() => undefined);
  }, [view, range]);
  useEffect(() => { void load(); return startLiveRefresh(() => void load()); }, [load]);

  const markDone = async (task: Task) => {
    const { id, revision, donorName, updatedAt, ...data } = task;
    const response = await fetch(`/api/v3/records/tasks/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ revision, data: { ...data, completed: true } }) });
    const result = await response.json();
    if (!response.ok || !result.success) setMessage({ ok: false, text: result.error || 'Unable to save.' }); else void load();
  };
  const sendNow = async () => {
    setSending(true); setMessage(null);
    try {
      const response = await fetch('/api/v3/reminders/send-now', { method: 'POST' }); const data = await response.json();
      if (data.skipped) setMessage({ ok: true, text: data.skipped });
      else if (!response.ok || !data.success) setMessage({ ok: false, text: data.failed?.map((item: any) => `${item.to}: ${item.error}`).join(' · ') || data.error || 'Not sent.' });
      else setMessage({ ok: true, text: `Sent (${data.sent} message${data.sent === 1 ? '' : 's'}).${data.failed?.length ? ` Not sent: ${data.failed.map((item: any) => `${item.to}: ${item.error}`).join(' · ')}` : ''}` });
    } catch (reason: any) { setMessage({ ok: false, text: reason.message }); } finally { setSending(false); }
  };

  const groups = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) { const key = task.dueDate < today ? 'overdue' : task.dueDate; map.set(key, [...(map.get(key) || []), task]); }
    return [...map.entries()];
  }, [tasks, today]);
  const row = (task: Task) => <div key={task.id} className={`rem-row ${task.completed ? 'rem-done' : ''}`}>
    <div><strong>{task.title}</strong>{task.donorName && <span> · {task.donorName}</span>}{task.notes && <small>{task.notes}</small>}</div>
    {task.dueDate < today && !task.completed && <span className="rem-late">{task.dueDate}</span>}
    {!task.completed && <button type="button" className="btn btn-secondary btn-sm" onClick={() => void markDone(task)}><Check size={14} /> Done</button>}
  </div>;

  // Month grid (Sunday first).
  const firstWeekday = new Date(month.year, month.month, 1).getDay();
  const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();
  const byDay = useMemo(() => { const map = new Map<string, Task[]>(); for (const task of tasks) map.set(task.dueDate, [...(map.get(task.dueDate) || []), task]); return map; }, [tasks]);

  return <div style={{ padding: 28, maxWidth: 1200, margin: '0 auto', display: 'grid', gap: 18 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div><div style={{ color: 'var(--green)', fontWeight: 800, fontSize: 13 }}>CHARITYPRO CLOUD</div><h1 style={{ margin: '4px 0', color: 'var(--navy)' }}><Bell size={24} /> Reminders</h1><div style={{ color: 'var(--text-muted)' }}>All scheduled reminders by date. Add or edit them in <Link to="/tasks">Tasks</Link>, a pledge, or a call.</div></div>
      <div className="pay-toggle"><button type="button" className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}><List size={14} /> List</button><button type="button" className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}><CalendarDays size={14} /> Month</button></div>
    </div>

    <section className="card rem-today">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div><h2 style={{ margin: 0, color: 'var(--navy)' }}>This morning's message</h2><small style={{ color: 'var(--text-muted)' }}>Sent every morning by email and/or text. Choose who gets it in <Link to="/settings">Settings → Email & text messages</Link>.</small></div>
        <button type="button" className="btn btn-primary" disabled={sending || !digest?.items.length} onClick={() => void sendNow()}><Send size={15} /> {sending ? 'Sending…' : 'Send it now'}</button>
      </div>
      {message && <div style={{ fontWeight: 700, color: message.ok ? 'var(--green)' : 'var(--red)' }}>{message.text}</div>}
      <pre className="rem-preview">{digest ? (digest.text || 'Nothing for today.') : 'Loading…'}</pre>
    </section>

    {view === 'list' ? <section className="card" style={{ display: 'grid', gap: 14 }}>
      {groups.length === 0 && <div style={{ color: 'var(--text-muted)' }}>No reminders in the next 90 days.</div>}
      {groups.map(([key, items]) => <div key={key} className="rem-group"><h3 className={key === 'overdue' ? 'rem-late-title' : key === today ? 'rem-today-title' : ''}>{key === 'overdue' ? `Not done yet (from before today) – ${items.length}` : key === today ? `Today – ${nice(key)}` : nice(key)}</h3>{items.map(row)}</div>)}
    </section> : <section className="card" style={{ display: 'grid', gap: 10 }}>
      <div className="hcal-nav"><button type="button" className="btn btn-ghost btn-sm" onClick={() => setMonth(current => current.month === 0 ? { year: current.year - 1, month: 11 } : { ...current, month: current.month - 1 })}><ChevronLeft size={16} /> Before</button><div className="hcal-nav-title"><strong>{MONTHS[month.month]} {month.year}</strong></div><button type="button" className="btn btn-ghost btn-sm" onClick={() => setMonth(current => current.month === 11 ? { year: current.year + 1, month: 0 } : { ...current, month: current.month + 1 })}>Next <ChevronRight size={16} /></button></div>
      <div className="rem-month">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <div key={day} className="hcal-head">{day}</div>)}
        {Array.from({ length: firstWeekday }, (_, index) => <div key={`b${index}`} />)}
        {Array.from({ length: daysInMonth }, (_, index) => { const iso = `${month.year}-${String(month.month + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`; const items = byDay.get(iso) || []; return <div key={iso} className={`rem-cell ${iso === today ? 'hcal-today' : ''}`}><span className="hcal-num">{index + 1}</span>{items.slice(0, 4).map(task => <span key={task.id} className={`rem-chip ${task.completed ? 'rem-done' : ''}`} title={`${task.title}${task.donorName ? ` – ${task.donorName}` : ''}`}>{task.donorName || task.title}</span>)}{items.length > 4 && <small>+{items.length - 4} more</small>}</div>; })}
      </div>
    </section>}
  </div>;
};
