import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Bold, Combine, Minus, MoveLeft, MoveRight, Pencil, Plus, Printer, RotateCcw, Split, X } from 'lucide-react';
import { HDate } from '@hebcal/core';
import { MonthNav } from '../components/HebrewCalendar';
import { hebMonthName, hebYearText, todayHebrew } from '../utils/hebrewCalendar';
import { type PieceKey, type PieceSpot, type RichLines, type RichRun, RICH_COLORS, type SheetDay, type SheetLayout, type SheetText, PIECES, TEXT_FIELDS, changePiece, cleanPieces, pieceSpot, dayLabel, defaultLayout, hasText, mergeBoxes, moveBox, nameLine, normalizeLayout, placeBoxes, shownText, splitBox, systemText } from '../utils/sponsorSheet';

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

/** A text size that shrinks with its box (see Fit). */
const fs = (size: number) => `calc(${size}pt * var(--k, 1))`;
/** Shrinks the text inside until it fits its box, so it never runs over other parts of the sheet. */
const Fit: React.FC<{ children: React.ReactNode; deps: unknown[] }> = ({ children, deps }) => {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const run = () => {
      let k = 1; el.style.setProperty('--k', '1');
      while (k > 0.25 && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) { k -= 0.03; el.style.setProperty('--k', String(k)); }
    };
    run(); void document.fonts?.ready.then(run);
    // Fit again when its box is made bigger or smaller.
    let size = ''; const observer = typeof ResizeObserver === 'undefined' || !el.parentElement ? null : new ResizeObserver(() => { const now = `${el.parentElement?.clientWidth}x${el.parentElement?.clientHeight}`; if (now !== size) { size = now; run(); } });
    if (observer && el.parentElement) observer.observe(el.parentElement);
    return () => observer?.disconnect();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={ref} className="ss-fit">{children}</div>;
};

/** What is written inside a box, sized like the sheet: bigger for wider boxes. */
const BoxText: React.FC<{ text: SheetText; span: number }> = ({ text, span }) => {
  const honoree = [text.honoree, text.notes].filter(Boolean) as string[];
  const name = [text.first, text.last].filter(Boolean).join(' ');
  if (span >= 5) return <Fit deps={[text, span]}><div className="ss-line">{text.title && <span style={{ fontSize: fs(18) }} className="ss-ink">{text.title}</span>} <span className="ss-name" style={{ fontSize: fs(36) }}>{name}</span> {text.end && <span style={{ fontSize: fs(18) }} className="ss-ink">{text.end}</span>}</div>{honoree.map(line => <div key={line} className="ss-hon" style={{ fontSize: fs(12) }}>{line}</div>)}</Fit>;
  const nameSize = span >= 3 ? 24 : span === 2 ? 17 : 15;
  // One line when it fits; otherwise the first name on one line and the last name under it.
  return <Fit deps={[text, span]}>
    {text.title && <div className="ss-ink ss-title" style={{ fontSize: fs(8) }}>{text.title}</div>}
    {name && <div className="ss-name" style={{ fontSize: fs(nameSize) }}>{text.first && text.last ? <><span className="ss-nowrap">{text.first}</span> <span className="ss-nowrap">{text.last}</span></> : name}</div>}
    {text.end && <div className="ss-ink" style={{ fontSize: fs(8) }}>{text.end}</div>}
    {honoree.map(line => <div key={line} className="ss-hon" style={{ fontSize: fs(span >= 3 ? 9 : 7.5) }}>{line}</div>)}
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

/** Text laid out by hand, as it is drawn on the sheet. */
const RichView: React.FC<{ lines: RichLines }> = ({ lines }) => <Fit deps={[lines]}>
  {lines.map((line, index) => <div key={index} className="ss-nowrap ss-rline">{line.length ? line.map((run, at) => <span key={at} style={{ fontSize: fs(run.s ?? 14), color: RICH_COLORS[run.c || 'ink'], fontWeight: run.b ? 800 : 400, fontStretch: run.b ? '80%' : '90%' }}>{run.t}</span>) : ' '}</div>)}
</Fit>;

const nearestColor = (css: string): RichRun['c'] => {
  const [r, g, b] = (css.match(/\d+(\.\d+)?/g) || ['0', '0', '0']).map(Number);
  let best: RichRun['c'] = 'ink'; let bestDistance = Infinity;
  for (const [name, hex] of Object.entries(RICH_COLORS)) { const value = parseInt(hex.slice(1), 16); const distance = Math.abs(r - (value >> 16)) + Math.abs(g - ((value >> 8) & 255)) + Math.abs(b - (value & 255)); if (distance < bestDistance) { bestDistance = distance; best = name as RichRun['c']; } }
  return best;
};
/** Reads the editor back into lines: each word keeps the size, color and boldness it shows. */
const readEditor = (editor: HTMLElement): RichLines => {
  const lines: RichLines = [[]]; const current = () => lines[lines.length - 1];
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = (child as Text).data.replace(/ /g, ' '); if (!text) continue;
        const style = getComputedStyle(child.parentElement || editor);
        const run: RichRun = { t: text, s: Math.round(parseFloat(style.fontSize) * 0.75 * 2) / 2, c: nearestColor(style.color) }; if (Number(style.fontWeight) >= 600) run.b = true;
        const last = current()[current().length - 1];
        if (last && last.s === run.s && last.c === run.c && Boolean(last.b) === Boolean(run.b)) last.t += run.t; else current().push(run);
      } else if (child.nodeName === 'BR') {
        if (child.parentNode !== editor && child === child.parentNode?.lastChild) continue; // the empty-line marker inside a line
        lines.push([]);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const block = /^(DIV|P)$/.test(child.nodeName);
        if (block && current().length) lines.push([]);
        walk(child);
        if (block) lines.push([]);
      }
    }
  };
  walk(editor);
  while (lines.length && !lines[lines.length - 1].length) lines.pop();
  return lines;
};
const fillEditor = (editor: HTMLElement, lines: RichLines) => {
  editor.textContent = '';
  for (const line of lines.length ? lines : [[]]) {
    const row = document.createElement('div');
    if (!line.length) row.appendChild(document.createElement('br'));
    for (const run of line) { const span = document.createElement('span'); span.textContent = run.t; span.style.fontSize = `${run.s ?? 14}pt`; span.style.color = RICH_COLORS[run.c || 'ink']; span.style.fontWeight = run.b ? '800' : '400'; row.appendChild(span); }
    editor.appendChild(row);
  }
};
/** Lay out a text by hand: Enter for a new line, choose words and make them bigger or smaller, bold, or another color. */
const RichEditor: React.FC<{ heading: string; start: RichLines; isTyped: boolean; onSave: (lines: RichLines | undefined) => void; onClose: () => void; onFields?: () => void }> = ({ heading, start, isTyped, onSave, onClose, onFields }) => {
  const ref = useRef<HTMLDivElement>(null); const [hint, setHint] = useState('');
  useEffect(() => { if (ref.current) fillEditor(ref.current, start); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /** Changes the chosen words only. */
  const restyle = (change: { grow?: number; color?: RichRun['c']; bold?: 'toggle' }) => {
    const editor = ref.current; const selection = window.getSelection(); if (!editor || !selection || !selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (range.collapsed || !editor.contains(range.commonAncestorContainer)) { setHint('First choose the words (drag over them with the mouse).'); return; }
    setHint('');
    const { startContainer, startOffset, endContainer, endOffset } = range;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT); const nodes: Text[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) if (range.intersectsNode(node) && (node as Text).data.length) nodes.push(node as Text);
    const firstBold = nodes.length ? Number(getComputedStyle(nodes[0].parentElement || editor).fontWeight) >= 600 : false;
    const spans: HTMLSpanElement[] = [];
    for (const original of nodes) {
      let node = original;
      if (node === endContainer && endOffset < node.length) node.splitText(endOffset);
      if (node === startContainer && startOffset > 0) { if (startOffset >= node.length) continue; node = node.splitText(startOffset); }
      if (!node.data.length) continue;
      const style = getComputedStyle(node.parentElement || editor); const span = document.createElement('span');
      const size = parseFloat(style.fontSize) * 0.75 + (change.grow || 0);
      span.style.fontSize = `${Math.max(4, Math.min(80, Math.round(size * 2) / 2))}pt`;
      span.style.color = change.color ? RICH_COLORS[change.color] : style.color;
      span.style.fontWeight = change.bold ? (firstBold ? '400' : '800') : style.fontWeight;
      node.replaceWith(span); span.appendChild(node); spans.push(span);
    }
    if (spans.length) { const again = document.createRange(); again.setStartBefore(spans[0]); again.setEndAfter(spans[spans.length - 1]); selection.removeAllRanges(); selection.addRange(again); }
  };
  const keep = (event: React.MouseEvent) => event.preventDefault(); // keeps the chosen words chosen when a button is clicked
  return <div className="modal-overlay no-print" onClick={onClose}><div className="modal" onClick={event => event.stopPropagation()} style={{ maxWidth: 820, width: '96%' }}>
    <div className="modal-header"><h2 style={{ margin: 0 }} dir="rtl">{heading}</h2><button className="modal-close" onClick={onClose}><X size={20} /></button></div>
    <div className="modal-body" style={{ display: 'grid', gap: 10 }}>
      <div className="ss-rich-tools">
        <button className="btn btn-secondary btn-sm" onMouseDown={keep} onClick={() => restyle({ grow: 2 })}><Plus size={14} /> Bigger</button>
        <button className="btn btn-secondary btn-sm" onMouseDown={keep} onClick={() => restyle({ grow: -2 })}><Minus size={14} /> Smaller</button>
        <button className="btn btn-secondary btn-sm" onMouseDown={keep} onClick={() => restyle({ bold: 'toggle' })}><Bold size={14} /> Bold</button>
        {(Object.keys(RICH_COLORS) as Array<keyof typeof RICH_COLORS>).map(color => <button key={color} className="btn btn-secondary btn-sm" onMouseDown={keep} onClick={() => restyle({ color })} title={`Color: ${color}`}><span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: RICH_COLORS[color] }} /> {color === 'red' ? 'Red' : color === 'teal' ? 'Green' : 'Black'}</button>)}
      </div>
      <div ref={ref} className="ss-rich-edit" dir="rtl" contentEditable suppressContentEditableWarning spellCheck={false} />
      {hint && <div className="pay-error">{hint}</div>}
      <small style={{ color: 'var(--text-muted)' }}>Press Enter to start a new line. Choose words with the mouse, then press Bigger / Smaller (each press is 2 points), Bold, or a color. On the sheet the whole text gets smaller by itself if it does not fit its box (make the box bigger by dragging its corner).</small>
    </div>
    <div className="modal-footer">
      <button className="btn btn-secondary" style={{ marginRight: 'auto' }} disabled={!isTyped} onClick={() => onSave(undefined)}>Use the regular text</button>
      {onFields && <button className="btn btn-ghost" onClick={onFields}>Edit the name fields</button>}
      <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" onClick={() => { const lines = ref.current ? readEditor(ref.current) : []; onSave(lines.some(line => line.some(run => run.t.trim())) ? lines : undefined); }}>Save</button>
    </div>
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
  const [editing, setEditing] = useState<{ kind: 'box'; day: number; label: string } | { kind: 'patron' } | { kind: 'rich'; key: 'name' | 'dedication' } | null>(null);
  const [status, setStatus] = useState(''); const [scale, setScale] = useState(0.6); const wrap = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const [piece, setPiece] = useState<string | null>(null); // the chosen piece of the patron section
  const layoutRef = useRef(layout); layoutRef.current = layout;

  useEffect(() => {
    const id = 'sponsor-sheet-fonts';
    if (!document.getElementById(id)) { const link = document.createElement('link'); link.id = id; link.rel = 'stylesheet'; link.href = 'https://fonts.googleapis.com/css2?family=Noto+Serif+Hebrew:wdth,wght@62.5..100,300..900&display=swap'; document.head.appendChild(link); }
  }, []);
  useEffect(() => {
    let cancelled = false; setLoaded(false); setSelected([]); setPiece(null);
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
  // The patron name and dedication as lines, to start laying them out by hand.
  const regularRich = (key: 'name' | 'dedication'): RichLines => {
    const run = (t: string | undefined, s: number, c: RichRun['c'], b = false): RichRun[] => (t ? [b ? { t, s, c, b } : { t, s, c }] : []);
    const lines: RichLines = key === 'name'
      ? [[...run(patronShown.title ? `${patronShown.title} ` : '', 13, 'ink'), ...run(patronShown.first, 25, 'teal', true)], [...run(patronShown.last, 25, 'teal', true), ...run(patronShown.end ? ` ${patronShown.end}` : '', 14, 'ink')]]
      : [run(patronShown.honoree, 8, 'ink'), run(patronShown.notes, 7, 'ink')];
    return lines.filter(line => line.length);
  };
  const saveRich = (key: string, lines: RichLines | undefined) => { const rich = { ...(layout.rich || {}) }; if (lines) rich[key] = lines; else delete rich[key]; save({ ...layout, rich: Object.keys(rich).length ? rich : undefined }); setEditing(null); };
  const saveBoxText =(day: number, typed: SheetText | undefined) => { const texts = { ...(layout.texts || {}) }; if (typed) texts[String(day)] = typed; else delete texts[String(day)]; save({ ...layout, texts }); setEditing(null); };

  const toggle = (index: number) => setSelected(current => current.includes(index) ? current.filter(at => at !== index) : [...current, index]);
  const merge = () => { try { save(mergeBoxes(layout, selected)); setSelected([]); setError(''); } catch (reason: any) { setError(reason.message); } };
  const split = () => { let next = layout; [...selected].sort((a, b) => b - a).forEach(index => { next = splitBox(next, index); }); save(next); setSelected([]); };
  const move = (step: -1 | 1) => { if (selected.length !== 1) return; const to = selected[0] + step; if (to < 0 || to >= layout.boxes.length) return; save(moveBox(layout, selected[0], to)); setSelected([to]); };
  const editLabel = (day: number) => { const text = window.prompt('Text on this day tab (for example יא):', dayLabel(layout, day)); if (text === null) return; const labels = { ...(layout.labels || {}) }; if (text.trim()) labels[String(day)] = text.trim(); else delete labels[String(day)]; save({ ...layout, labels }); };
  // Patron section: every piece can be dragged, moved with the arrow keys, hidden, or put back.
  const setSpot = (key: string, spot: PieceSpot) => save({ ...layoutRef.current, pieces: cleanPieces({ ...(layoutRef.current.pieces || {}), [key]: spot }) });
  const startDrag = (key: string, resize = false) => (event: React.PointerEvent) => {
    if (event.button !== 0) return; event.stopPropagation(); setPiece(key); setSelected([]);
    const perPx = 1 / (scale * 4 / 3); let last = { x: event.clientX, y: event.clientY }; let current = layoutRef.current; let moved = false;
    const onMove = (ev: PointerEvent) => { const dx = (ev.clientX - last.x) * perPx; const dy = (ev.clientY - last.y) * perPx; if (!dx && !dy) return; last = { x: ev.clientX, y: ev.clientY }; current = changePiece(current, key, resize ? { dw: dx, dh: dy } : { dx, dy }); moved = true; setLayout(current); };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); if (moved) save(current); };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
  };
  useEffect(() => {
    if (!piece) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement; if (target.closest('input,textarea,select,.modal')) return;
      const step = event.shiftKey ? 5 : 1; const arrows: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (arrows[event.key]) { event.preventDefault(); save(changePiece(layoutRef.current, piece, { dx: arrows[event.key][0], dy: arrows[event.key][1] })); }
      else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); save(changePiece(layoutRef.current, piece, { hidden: true })); setPiece(null); }
      else if (event.key === 'Escape') setPiece(null);
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [piece]); // eslint-disable-line react-hooks/exhaustive-deps
  const pieceBox = (key: PieceKey, children: React.ReactNode, onEdit?: () => void) => {
    const spec = PIECES.find(item => item.key === key)!; const spot = pieceSpot(layout, key); if (spot.hidden) return null;
    return <div key={key} className={`ss-abs ss-piece ${piece === key ? 'ss-piece-on' : ''}`} style={{ left: pt(spec.x + spot.dx), top: pt(spec.y + spot.dy), width: pt(Math.max(20, spec.w + (spot.dw || 0))), height: pt(Math.max(10, spec.h + (spot.dh || 0))) }}
      onPointerDown={startDrag(key)} onDoubleClick={onEdit} title={`${spec.label}: drag to move${onEdit ? ', double-click to change the text and its layout' : ''}`}>{children}
      {piece === key && <div className="ss-resize no-print" onPointerDown={startDrag(key, true)} onDoubleClick={event => event.stopPropagation()} title="Drag to make it bigger or smaller" />}
    </div>;
  };
  const chosenPiece = PIECES.find(item => item.key === piece);
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
        <button className="btn btn-secondary btn-sm" onClick={() => setEditing({ kind: 'rich', key: 'name' })}><Pencil size={14} /> Edit patron text</button>
        <button className="btn btn-secondary btn-sm" onClick={() => setEditing({ kind: 'rich', key: 'dedication' })}><Pencil size={14} /> Edit patron dedication</button>
        {selected.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setSelected([])}>Clear choice ({selected.length})</button>}
        <button className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm('Go back to one box per day in the regular order, with the regular dates?')) { save(defaultLayout(daysInMonth), true); setSelected([]); } }}><RotateCcw size={14} /> Regular order</button>
        <label>Month title <input dir="rtl" value={layout.monthTitle ?? ''} placeholder={`${monthName} ${plain(hebYearText(view.year))}`} onChange={event => save({ ...layout, monthTitle: event.target.value })} /></label>
        <label>Month in the patron band <input dir="rtl" value={layout.bandMonth ?? ''} placeholder={monthName} onChange={event => save({ ...layout, bandMonth: event.target.value })} /></label>
        <small style={{ color: 'var(--text-muted)' }}>{loaded ? status : 'Loading…'}</small>
      </div>
      <div className="ss-tools">
        <strong style={{ fontSize: 13 }}>Patron section:</strong>
        {PIECES.map(item => <label key={item.key} title="Untick to take it off the sheet"><input type="checkbox" style={{ width: 'auto' }} checked={!pieceSpot(layout, item.key).hidden} onChange={event => { save(changePiece(layout, item.key, { hidden: !event.target.checked })); if (!event.target.checked && piece === item.key) setPiece(null); }} /> <span dir="auto">{item.label}</span></label>)}
        {chosenPiece && <>
          <button className="btn btn-secondary btn-sm" onClick={() => { const spot = pieceSpot(layout, chosenPiece.key); setSpot(chosenPiece.key, { dx: 0, dy: 0, hidden: spot.hidden }); }}><RotateCcw size={14} /> Put “{chosenPiece.label}” back</button>
          <button className="btn btn-secondary btn-sm" onClick={() => { save(changePiece(layout, chosenPiece.key, { hidden: true })); setPiece(null); }}><X size={14} /> Remove it</button>
        </>}
        {layout.pieces && <button className="btn btn-ghost btn-sm" onClick={() => { save({ ...layout, pieces: undefined }); setPiece(null); }}><RotateCcw size={14} /> Patron section as regular</button>}
      </div>
      <small style={{ color: 'var(--text-muted)' }}>Patron section: drag any piece to move it, or click it and use the arrow keys (Shift = bigger steps); Delete removes it; tick it again to bring it back. Click boxes to choose them, then Merge (each day keeps its tab). Drag a box to move it. Double-click a box (or the patron) to change its text. Double-click a red day tab to change its date. Print: paper 11 × 17 (Tabloid), landscape, margins none, “Background graphics” on.</small>
      {error && <div className="pay-error">{error}</div>}
      {mixed.length > 0 && <div className="pay-error">A merged box has days of different sponsors ({mixed.map(box => box.days.map(day => dayLabel(layout, day)).join(',')).join(' · ')}). The box shows the first day's sponsor.</div>}
    </div>
    <div ref={wrap} className="ss-wrap" style={{ height: 834 * (4 / 3) * scale }}>
      <div className="ss-sheet" dir="rtl" style={{ transform: `scale(${scale})` }} onPointerDown={() => setPiece(null)}>
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
        {pieceBox('title', <img className="ss-pimg" src="/sponsor-sheet/title.png" alt="" draggable={false} />)}
        {pieceBox('intro', <img className="ss-pimg" src="/sponsor-sheet/intro.png" alt="" draggable={false} />)}
        {pieceBox('band', <><img className="ss-pimg" src="/sponsor-sheet/band.png" alt="" draggable={false} /><div className="ss-band"><Fit deps={[bandMonth]}><span className="ss-nowrap">פטרון הצלה לחודש {bandMonth}</span></Fit></div></>, () => { const text = window.prompt('Month in the red band:', bandMonth); if (text !== null) save({ ...layout, bandMonth: text }); })}
        {pieceBox('strip', <img className="ss-pimg" src="/sponsor-sheet/strip.png" alt="" draggable={false} />)}
        {(layout.rich?.name || hasText(patronShown)) && pieceBox('name', <div className="ss-patron">{layout.rich?.name ? <RichView lines={layout.rich.name} /> : <Fit deps={[patronShown]}>
          <div className="ss-nowrap">{patronShown.title && <span className="ss-ink" style={{ fontSize: fs(13) }}>{patronShown.title}</span>} <span className="ss-pname">{patronShown.first}</span></div>
          <div className="ss-nowrap"><span className="ss-pname">{patronShown.last}</span> {patronShown.end && <span className="ss-ink" style={{ fontSize: fs(14) }}>{patronShown.end}</span>}</div>
        </Fit>}</div>, () => setEditing({ kind: 'rich', key: 'name' }))}
        {(layout.rich?.dedication || patronShown.honoree || patronShown.notes) && pieceBox('dedication', <div className="ss-phon">{layout.rich?.dedication ? <RichView lines={layout.rich.dedication} /> : <Fit deps={[patronShown]}>{patronShown.honoree && <div>{patronShown.honoree}</div>}{patronShown.notes && <div style={{ fontSize: fs(7) }}>{patronShown.notes}</div>}</Fit>}</div>, () => setEditing({ kind: 'rich', key: 'dedication' }))}
      </div>
    </div>
    {editing?.kind === 'box' && <TextEditor heading={`Box ${editing.label}`} system={systemText(byDay.get(editing.day) || null)} typed={layout.texts?.[String(editing.day)]} onClose={() => setEditing(null)} onSave={typed => saveBoxText(editing.day, typed)} />}
    {editing?.kind === 'rich' && <RichEditor heading={editing.key === 'name' ? 'פטרון החודש – layout of the name' : 'פטרון החודש – layout of the dedication'} start={layout.rich?.[editing.key] || regularRich(editing.key)} isTyped={Boolean(layout.rich?.[editing.key])} onClose={() => setEditing(null)} onSave={lines => saveRich(editing.key, lines)} onFields={() => setEditing({ kind: 'patron' })} />}
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
.ss-piece{cursor:move;user-select:none;-webkit-user-select:none;touch-action:none}
.ss-piece:hover{outline:1.5pt dashed rgba(37,99,235,.45);outline-offset:1pt}
.ss-piece-on{outline:2.5pt solid #2563eb!important;outline-offset:1pt}
.ss-resize{position:absolute;right:-7pt;bottom:-7pt;width:14pt;height:14pt;background:#2563eb;border:2pt solid #fff;border-radius:50%;cursor:nwse-resize;box-sizing:border-box;z-index:2}
.ss-rline{line-height:1.02}
.ss-rich-tools{display:flex;gap:6px;flex-wrap:wrap}
.ss-rich-edit{min-height:140px;padding:14px;border:1px solid var(--border,#d0d7de);border-radius:8px;background:#fffcf5;font-family:'Noto Serif Hebrew',serif;font-size:14pt;color:${INK};text-align:center;line-height:1.1;outline:none;overflow:auto;max-height:50vh}
.ss-rich-edit:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.15)}
.ss-pimg{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none}
.ss-patron{position:absolute;inset:0;display:flex;align-items:center;line-height:.98;color:${TEAL}}
.ss-pname{font-size:calc(25pt * var(--k, 1));font-weight:800;font-stretch:80%;color:${TEAL}}
.ss-band{position:absolute;left:5pt;right:5pt;top:3.3pt;height:25pt;display:flex;align-items:center;color:#fff;font-weight:800;font-stretch:80%;line-height:1}
.ss-band .ss-nowrap{font-size:calc(22pt * var(--k, 1))}
.ss-phon{position:absolute;inset:0;display:flex;align-items:center;line-height:1.2;color:${INK};font-weight:500}
.ss-phon .ss-fit{font-size:calc(8pt * var(--k, 1))}
@media print{
  @page{size:1266pt 834pt;margin:0}
  html,body{margin:0!important;padding:0!important;background:#fff!important}
  body *{visibility:hidden}
  .ss-sheet,.ss-sheet *{visibility:visible}
  .ss-wrap{height:auto!important;overflow:visible}
  .ss-sheet{position:fixed;top:0;left:0;transform:none!important;box-shadow:none}
  .ss-box,.ss-piece{outline:none!important;opacity:1!important}
  .no-print{display:none!important}
}
`;
