import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Combine, MoveLeft, MoveRight, Pencil, Printer, RotateCcw, Split, X } from 'lucide-react';
import { HDate } from '@hebcal/core';
import { MonthNav } from '../components/HebrewCalendar';
import { hebMonthName, hebYearText, todayHebrew } from '../utils/hebrewCalendar';
import { type SheetDay, type SheetLayout, type SheetText, TEXT_FIELDS, dayLabel, defaultLayout, hasText, mergeBoxes, moveBox, nameLine, normalizeLayout, placeBoxes, shownText, splitBox, systemText } from '../utils/sponsorSheet';

type Item = SheetDay & { id: string; kind: 'day' | 'month' };

// Measured from the designer's sheet (points; the page is 1266 × 834).
const COL_LEFT = [724.3, 622.7, 519, 415.3, 312.3, 209.3, 105.7]; // column 0 is the right one
const BOX_W = 95; const BOX_H = 87.7; const BORDER = 1.1;
const ROW_TOP = [223, 328.3, 431.3, 537.3, 636.3];
const TAB_W = 31.3; const TAB_H = 21.7;
const RED = '#f94b33'; const TEAL = '#2c585c'; const INK = '#2c2e35'; const BOX_FILL = '#e8fdff';
const plain = (text: string) => text.replace(/[׳״]/g, (mark: string) => (mark === '״' ? '"' : "'"));
const pt = (value: number) => `${Math.round(value * 100) / 100}pt`;

const rowTops = (rows: number) => {
  if (rows <= ROW_TOP.length) return { tops: ROW_TOP.slice(0, Math.max(rows, 1)), height: BOX_H };
  const pitch = (ROW_TOP[ROW_TOP.length - 1] - ROW_TOP[0]) / (rows - 1);
  return { tops: Array.from({ length: rows }, (_, index) => ROW_TOP[0] + pitch * index), height: Math.min(BOX_H, pitch - 15) };
};

/** Shrinks the text of a box until it fits. */
const Fit: React.FC<{ children: React.ReactNode; deps: unknown[] }> = ({ children, deps }) => {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return; let scale = 1; el.style.fontSize = '1em';
    for (let step = 0; step < 14 && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1); step++) { scale -= 0.05; el.style.fontSize = `${scale}em`; }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={ref} className="ss-fit">{children}</div>;
};

/** What is written inside a box, sized like the sheet: bigger for wider boxes. */
const BoxText: React.FC<{ text: SheetText; span: number }> = ({ text, span }) => {
  const honoree = [text.honoree, text.notes].filter(Boolean) as string[];
  const name = [text.first, text.last].filter(Boolean).join(' ');
  if (span >= 5) return <Fit deps={[text, span]}><div className="ss-line">{text.title && <span style={{ fontSize: '18pt' }} className="ss-ink">{text.title}</span>} <span className="ss-name" style={{ fontSize: '36pt' }}>{name}</span> {text.end && <span style={{ fontSize: '18pt' }} className="ss-ink">{text.end}</span>}</div>{honoree.map(line => <div key={line} className="ss-hon" style={{ fontSize: '12pt' }}>{line}</div>)}</Fit>;
  const nameSize = span >= 3 ? 24 : span === 2 ? 17 : 15;
  // One line when it fits; otherwise the first name on one line and the last name under it.
  return <Fit deps={[text, span]}>
    {text.title && <div className="ss-ink ss-title" style={{ fontSize: '8pt' }}>{text.title}</div>}
    {name && <div className="ss-name" style={{ fontSize: pt(nameSize) }}>{text.first && text.last ? <><span className="ss-nowrap">{text.first}</span> <span className="ss-nowrap">{text.last}</span></> : name}</div>}
    {text.end && <div className="ss-ink" style={{ fontSize: '8pt' }}>{text.end}</div>}
    {honoree.map(line => <div key={line} className="ss-hon" style={{ fontSize: span >= 3 ? '9pt' : '7.5pt' }}>{line}</div>)}
  </Fit>;
};

const FIELD_LABELS: Record<string, string> = { title: 'Title above the name (הר"ר, הרב …)', first: 'First name', last: 'Last name', end: 'After the name (הי"ו, שליט"א …)', honoree: 'Dedication (לע"נ …)', notes: 'Second line (e.g. יארצייט)' };
/** Type over any text in a box. Each field starts with what the system fills in. */
const TextEditor: React.FC<{ heading: string; system: SheetText; typed?: SheetText; onSave: (typed: SheetText | undefined) => void; onClose: () => void }> = ({ heading, system, typed, onSave, onClose }) => {
  const [form, setForm] = useState<SheetText>({ ...system, ...(typed || {}) });
  // Only what differs from the system text is kept, so later changes to the donor still show elsewhere.
  const save = () => { const changed: SheetText = {}; for (const field of TEXT_FIELDS) { const value = String(form[field] ?? ''); if (value !== String(system[field] ?? '')) changed[field] = value; } onSave(Object.keys(changed).length ? changed : undefined); };
  return <div className="modal-overlay no-print" onClick={onClose}><div className="modal" onClick={event => event.stopPropagation()} style={{ maxWidth: 560, width: '94%' }}>
    <div className="modal-header"><h2 style={{ margin: 0 }} dir="rtl">{heading}</h2><button className="modal-close" onClick={onClose}><X size={20} /></button></div>
    <div className="modal-body" style={{ display: 'grid', gap: 10 }}>
      {TEXT_FIELDS.map(field => <label key={field} className="form-group" style={{ margin: 0 }}><span>{FIELD_LABELS[field]}{typed && typed[field] !== undefined ? ' · typed by hand' : ''}</span>
        {field === 'honoree' ? <textarea dir="rtl" rows={3} value={form[field] ?? ''} onChange={event => setForm({ ...form, [field]: event.target.value })} /> : <input dir="rtl" value={form[field] ?? ''} onChange={event => setForm({ ...form, [field]: event.target.value })} />}</label>)}
      <small style={{ color: 'var(--text-muted)' }}>This changes only the sponsor list, not the donor or the booking. Leave a line empty to hide it.</small>
    </div>
    <div className="modal-footer"><button className="btn btn-secondary" style={{ marginRight: 'auto' }} disabled={!typed} onClick={() => onSave(undefined)}>Use the system text</button><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></div>
  </div></div>;
};

/** The monthly sponsor list, printed exactly on the designer's sheet. */
export const SponsorSheet: React.FC = () => {
  const today = todayHebrew();
  const start = new URLSearchParams(window.location.search);
  const [view, setView] = useState({ month: Number(start.get('month')) || today.getMonth(), year: Number(start.get('year')) || today.getFullYear() });
  const daysInMonth = HDate.daysInMonth(view.month, view.year);
  const [items, setItems] = useState<Item[]>([]); const [error, setError] = useState('');
  const [layout, setLayout] = useState<SheetLayout>(defaultLayout(daysInMonth)); const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<number[]>([]); const [dragging, setDragging] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ kind: 'box'; day: number; label: string } | { kind: 'patron' } | null>(null);
  const [status, setStatus] = useState(''); const [scale, setScale] = useState(0.6); const wrap = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const id = 'sponsor-sheet-fonts';
    if (!document.getElementById(id)) { const link = document.createElement('link'); link.id = id; link.rel = 'stylesheet'; link.href = 'https://fonts.googleapis.com/css2?family=Noto+Serif+Hebrew:wdth,wght@62.5..100,300..900&display=swap'; document.head.appendChild(link); }
  }, []);
  useEffect(() => {
    let cancelled = false; setLoaded(false); setSelected([]);
    void (async () => {
      try {
        const response = await fetch(`/api/v3/sponsor-sheet?hebYear=${view.year}&hebMonth=${view.month}`); const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load the sponsors.');
        if (cancelled) return; setItems(data.items || []); setLayout(normalizeLayout(data.layout || defaultLayout(daysInMonth), daysInMonth)); setError(''); setLoaded(true);
      } catch (reason: any) { if (!cancelled) { setError(reason.message); setLayout(defaultLayout(daysInMonth)); } }
    })();
    return () => { cancelled = true; };
  }, [view.month, view.year, daysInMonth]);
  useEffect(() => {
    const fit = () => { const width = wrap.current?.clientWidth || 1200; setScale(Math.min(1, width / (1266 * 4 / 3))); };
    fit(); window.addEventListener('resize', fit); return () => window.removeEventListener('resize', fit);
  }, []);

  const save = (next: SheetLayout, reset = false) => {
    setLayout(next); setStatus('Saving…'); window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/v3/sponsor-sheet/layout?hebYear=${view.year}&hebMonth=${view.month}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reset ? { reset: true } : next) });
        const data = await response.json().catch(() => ({})); setStatus(response.ok && data.success ? 'Saved' : data.error || 'Not saved');
      } catch { setStatus('Not saved'); }
    }, 500);
  };

  const byDay = useMemo(() => new Map(items.filter(item => item.kind === 'day').map(item => [item.day, item])), [items]);
  const patron = items.find(item => item.kind === 'month') || null;
  const { placed, rows } = useMemo(() => placeBoxes(layout), [layout]);
  const { tops, height } = rowTops(rows);
  const monthName = hebMonthName(view.month, view.year);
  const monthTitle = layout.monthTitle || `${monthName} ${hebYearText(view.year)}`;
  const bandMonth = layout.bandMonth || monthName;
  const taken = byDay.size;
  // The month patron: 'כבוד מוה"ר' above the name, unless typed over.
  const patronSystem: SheetText = patron ? { ...systemText(patron), title: 'כבוד מוה"ר' } : {};
  const patronShown: SheetText = { ...patronSystem, ...(layout.patronText || {}) };
  const saveBoxText = (day: number, typed: SheetText | undefined) => { const texts = { ...(layout.texts || {}) }; if (typed) texts[String(day)] = typed; else delete texts[String(day)]; save({ ...layout, texts }); setEditing(null); };

  const toggle = (index: number) => setSelected(current => current.includes(index) ? current.filter(at => at !== index) : [...current, index]);
  const merge = () => { try { save(mergeBoxes(layout, selected)); setSelected([]); setError(''); } catch (reason: any) { setError(reason.message); } };
  const split = () => { let next = layout; [...selected].sort((a, b) => b - a).forEach(index => { next = splitBox(next, index); }); save(next); setSelected([]); };
  const move = (step: -1 | 1) => { if (selected.length !== 1) return; const to = selected[0] + step; if (to < 0 || to >= layout.boxes.length) return; save(moveBox(layout, selected[0], to)); setSelected([to]); };
  const editLabel = (day: number) => { const text = window.prompt('Text on this day tab (for example יא):', dayLabel(layout, day)); if (text === null) return; const labels = { ...(layout.labels || {}) }; if (text.trim()) labels[String(day)] = text.trim(); else delete labels[String(day)]; save({ ...layout, labels }); };
  const mixed = placed.filter(box => new Set(box.days.map(day => byDay.get(day)?.donorId || '')).size > 1);

  return <div className="ss-page">
    <style>{SHEET_CSS}</style>
    <div className="ss-controls no-print">
      <div className="page-head">
        <div><div className="page-eyebrow">CHARITYPRO CLOUD</div><h1 className="page-title">Monthly sponsor list</h1><div className="page-sub">{taken} of {daysInMonth} days taken{patron ? ` · month patron: ${nameLine(patron)}` : ' · no month patron yet'} · book days on the Calendar page</div></div>
        <button className="btn btn-primary" onClick={() => window.print()}><Printer size={16} /> Print / save as PDF</button>
      </div>
      <MonthNav year={view.year} month={view.month} onChange={(month, year) => setView({ month, year })} />
      <div className="ss-tools">
        <button className="btn btn-secondary btn-sm" disabled={selected.length < 2} onClick={merge}><Combine size={14} /> Merge chosen boxes</button>
        <button className="btn btn-secondary btn-sm" disabled={!selected.some(index => (layout.boxes[index] || []).length > 1)} onClick={split}><Split size={14} /> Split</button>
        <button className="btn btn-secondary btn-sm" disabled={selected.length !== 1} onClick={() => move(-1)} title="Move one place to the right (earlier)"><MoveRight size={14} /> Earlier</button>
        <button className="btn btn-secondary btn-sm" disabled={selected.length !== 1} onClick={() => move(1)} title="Move one place to the left (later)"><MoveLeft size={14} /> Later</button>
        <button className="btn btn-secondary btn-sm" disabled={selected.length !== 1} onClick={() => { const days = layout.boxes[selected[0]] || []; if (days.length) setEditing({ kind: 'box', day: days[0], label: days.map(day => dayLabel(layout, day)).join(', ') }); }}><Pencil size={14} /> Edit text</button>
        <button className="btn btn-secondary btn-sm" onClick={() => setEditing({ kind: 'patron' })}><Pencil size={14} /> Edit patron text</button>
        {selected.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setSelected([])}>Clear choice ({selected.length})</button>}
        <button className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm('Go back to one box per day in the regular order, with the regular dates?')) { save(defaultLayout(daysInMonth), true); setSelected([]); } }}><RotateCcw size={14} /> Regular order</button>
        <label>Month title <input dir="rtl" value={layout.monthTitle ?? ''} placeholder={`${monthName} ${plain(hebYearText(view.year))}`} onChange={event => save({ ...layout, monthTitle: event.target.value })} /></label>
        <label>Month in the patron band <input dir="rtl" value={layout.bandMonth ?? ''} placeholder={monthName} onChange={event => save({ ...layout, bandMonth: event.target.value })} /></label>
        <small style={{ color: 'var(--text-muted)' }}>{loaded ? status : 'Loading…'}</small>
      </div>
      <small style={{ color: 'var(--text-muted)' }}>Click boxes to choose them, then Merge (each day keeps its tab). Drag a box to move it. Double-click a box (or the patron) to change its text. Double-click a red day tab to change its date. Print: paper 11 × 17 (Tabloid), landscape, margins none, “Background graphics” on.</small>
      {error && <div className="pay-error">{error}</div>}
      {mixed.length > 0 && <div className="pay-error">A merged box has days of different sponsors ({mixed.map(box => box.days.map(day => dayLabel(layout, day)).join(',')).join(' · ')}). The box shows the first day's sponsor.</div>}
    </div>
    <div ref={wrap} className="ss-wrap" style={{ height: 834 * (4 / 3) * scale }}>
      <div className="ss-sheet" dir="rtl" style={{ transform: `scale(${scale})` }}>
        <img className="ss-template" src="/sponsor-sheet/template.jpg" alt="" />
        {placed.map(box => {
          const top = tops[box.row]; const right = COL_LEFT[box.col] + BOX_W + BORDER; const left = COL_LEFT[box.col + box.span - 1] - BORDER;
          const sponsor = byDay.get(box.days[0]) || null; const isSelected = selected.includes(box.index); const text = shownText(sponsor, layout.texts?.[String(box.days[0])]);
          return <React.Fragment key={box.days.join('-')}>
            <div className={`ss-box ${isSelected ? 'ss-selected' : ''} ${dragging === box.index ? 'ss-dragging' : ''}`} style={{ left: pt(left), top: pt(top - BORDER), width: pt(right - left), height: pt(height + 2 * BORDER) }}
              draggable onDragStart={() => setDragging(box.index)} onDragEnd={() => setDragging(null)} onDragOver={event => event.preventDefault()}
              onDrop={event => { event.preventDefault(); if (dragging !== null && dragging !== box.index) { save(moveBox(layout, dragging, box.index)); setSelected([]); } setDragging(null); }}
              onClick={() => toggle(box.index)} onDoubleClick={() => setEditing({ kind: 'box', day: box.days[0], label: box.days.map(day => dayLabel(layout, day)).join(', ') })} title="Double-click to change the text">
              {hasText(text) && <BoxText text={text} span={box.span} />}
            </div>
            {box.days.map((day, at) => <div key={day} className="ss-tab" style={{ left: pt(COL_LEFT[box.col + at] + BOX_W - 8.3 - TAB_W), top: pt(top - 12) }} onDoubleClick={event => { event.stopPropagation(); editLabel(day); }} title="Double-click to change">{dayLabel(layout, day)}</div>)}
          </React.Fragment>;
        })}
        <div className="ss-abs ss-month" style={{ left: pt(968), top: pt(226), width: pt(173), height: pt(38) }}>{monthTitle}</div>
        {hasText(patronShown) && <>
          <div className="ss-abs ss-patron" style={{ left: pt(920), top: pt(612), width: pt(260), height: pt(52) }} onDoubleClick={() => setEditing({ kind: 'patron' })}>
            <div>{patronShown.title && <span className="ss-ink" style={{ fontSize: '13pt' }}>{patronShown.title}</span>} <span className="ss-pname">{patronShown.first}</span></div>
            <div><span className="ss-pname">{patronShown.last}</span> {patronShown.end && <span className="ss-ink" style={{ fontSize: '14pt' }}>{patronShown.end}</span>}</div>
          </div>
          <div className="ss-abs ss-phon" style={{ left: pt(932), top: pt(711), width: pt(238), height: pt(32) }} onDoubleClick={() => setEditing({ kind: 'patron' })}><Fit deps={[patronShown]}>{patronShown.honoree && <div>{patronShown.honoree}</div>}{patronShown.notes && <div style={{ fontSize: '7pt' }}>{patronShown.notes}</div>}</Fit></div>
        </>}
        <div className="ss-abs ss-band" style={{ left: pt(946), top: pt(683), width: pt(223), height: pt(25) }}>פטרון הצלה לחודש {bandMonth}</div>
      </div>
    </div>
    {editing?.kind === 'box' && <TextEditor heading={`Box ${editing.label}`} system={systemText(byDay.get(editing.day) || null)} typed={layout.texts?.[String(editing.day)]} onClose={() => setEditing(null)} onSave={typed => saveBoxText(editing.day, typed)} />}
    {editing?.kind === 'patron' && <TextEditor heading="פטרון החודש" system={patronSystem} typed={layout.patronText} onClose={() => setEditing(null)} onSave={typed => { save({ ...layout, patronText: typed }); setEditing(null); }} />}
  </div>;
};

const SHEET_CSS = `
.ss-page{padding:24px 28px}
.ss-controls{display:grid;gap:12px;margin-bottom:16px}
.ss-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.ss-tools label{display:flex;gap:6px;align-items:center;font-size:13px;color:var(--text-muted)}
.ss-tools input{padding:6px 8px;border:1px solid var(--border,#d0d7de);border-radius:6px;width:150px}
.ss-wrap{width:100%;overflow:hidden}
.ss-sheet{position:relative;width:1266pt;height:834pt;transform-origin:top left;overflow:hidden;background:#fff;font-family:'Noto Serif Hebrew',serif;color:${INK};-webkit-print-color-adjust:exact;print-color-adjust:exact;box-shadow:0 4px 24px rgba(0,0,0,.15)}
.ss-template{position:absolute;inset:0;width:1266pt;height:834pt;display:block}
.ss-abs{position:absolute;box-sizing:border-box}
.ss-box{position:absolute;box-sizing:border-box;background:${BOX_FILL};border:${BORDER}pt solid ${TEAL};border-radius:20pt 0 20pt 0;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:13pt 5pt 4pt}
.ss-box:hover{outline:2pt dashed rgba(249,75,51,.35)}
.ss-selected{outline:3pt solid #2563eb!important;outline-offset:2pt}
.ss-dragging{opacity:.4}
.ss-fit{width:100%;max-height:100%;overflow:hidden;text-align:center;line-height:1.08}
.ss-line{white-space:nowrap}
.ss-nowrap{white-space:nowrap}
.ss-ink{color:${INK};font-weight:400;font-stretch:90%}
.ss-title{letter-spacing:.5pt}
.ss-name{color:${RED};font-weight:800;font-stretch:62.5%;line-height:.95;margin:1pt 0}
.ss-hon{color:${INK};font-weight:500;font-stretch:72%;line-height:1.15;margin-top:2pt}
.ss-tab{position:absolute;width:${TAB_W}pt;height:${TAB_H}pt;background:${RED};color:#fff;border-radius:6pt 0 6pt 0;box-shadow:1.6pt 1.6pt 0 #5e8587;font-weight:700;font-stretch:85%;font-size:16pt;line-height:${TAB_H}pt;text-align:right;padding-right:5pt;box-sizing:border-box;cursor:text;white-space:nowrap;overflow:hidden}
.ss-month{color:#fff;font-weight:800;font-stretch:72%;font-size:34pt;line-height:36pt;text-align:center;white-space:nowrap}
.ss-patron{text-align:center;line-height:24pt;color:${TEAL};cursor:text}
.ss-pname{font-size:25pt;font-weight:800;font-stretch:80%;color:${TEAL}}
.ss-band{color:#fff;font-weight:800;font-stretch:80%;font-size:22pt;line-height:25pt;text-align:center;white-space:nowrap}
.ss-phon{text-align:center;font-size:8pt;line-height:1.2;color:${INK};font-weight:500}
@media print{
  @page{size:1266pt 834pt;margin:0}
  html,body{margin:0!important;padding:0!important;background:#fff!important}
  body *{visibility:hidden}
  .ss-sheet,.ss-sheet *{visibility:visible}
  .ss-wrap{height:auto!important;overflow:visible}
  .ss-sheet{position:fixed;top:0;left:0;transform:none!important;box-shadow:none}
  .ss-box{outline:none!important;opacity:1!important}
  .no-print{display:none!important}
}
`;
