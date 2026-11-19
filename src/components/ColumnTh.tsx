import React, { useEffect, useRef, useState } from 'react';
import { Filter, X } from 'lucide-react';
import type { SortDirection } from './SortableTh';

// Every list column can be sorted (up / down) and filtered.
// Text: "Starts with", "Contains" or "Is exactly". Dates and amounts: "From" / "To".
// The server does the sorting and filtering on ALL records, not only the page on screen.
// Filters are sent as f_<column>=value: "^abc" starts with, "=abc" exactly, "abc" contains, "from..to" for dates/amounts.

export type ColumnKind = 'text' | 'date' | 'number';
export type ListColumnsState = ReturnType<typeof useListColumns>;

export const useListColumns = (defaultSort: string, defaultDirection: SortDirection = 'desc', onChange?: () => void) => {
  const [sort, setSort] = useState(defaultSort);
  const [direction, setDirection] = useState<SortDirection>(defaultDirection);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [labels, setLabels] = useState<Record<string, { label: string; kind: ColumnKind }>>({});
  const changed = () => onChange?.();
  const changeSort = (column: string, kind: ColumnKind = 'text') => {
    setDirection(current => sort === column ? (current === 'asc' ? 'desc' : 'asc') : (kind === 'text' ? 'asc' : 'desc'));
    setSort(column); changed();
  };
  const sortBy = (column: string, next: SortDirection) => { setSort(column); setDirection(next); changed(); };
  const setFilter = (column: string, value: string, label?: string, kind: ColumnKind = 'text') => {
    setFilters(current => { const next = { ...current }; if (value) next[column] = value; else delete next[column]; return next; });
    if (label) setLabels(current => ({ ...current, [column]: { label, kind } }));
    changed();
  };
  const clearFilters = () => { setFilters({}); changed(); };
  /** Put back a saved sheet: its sort, direction and filters. */
  const applyState = (state: { sort?: string; direction?: SortDirection; filters?: Record<string, string>; labels?: Record<string, { label: string; kind: ColumnKind }> }) => { setSort(state.sort || defaultSort); setDirection(state.direction || defaultDirection); setFilters(state.filters || {}); setLabels(state.labels || {}); changed(); };
  const query = `sort=${encodeURIComponent(sort)}&direction=${direction}${Object.entries(filters).map(([key, value]) => `&f_${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('')}`;
  return { sort, direction, changeSort, sortBy, filters, labels, setFilter, clearFilters, applyState, query, hasFilters: Object.keys(filters).length > 0 };
};

const SortCarets: React.FC<{ state: 'asc' | 'desc' | 'none' }> = ({ state }) => (
  <svg className="sort-carets" width="8" height="12" viewBox="0 0 8 12" aria-hidden="true">
    <path d="M4 0 8 5H0z" className={state === 'asc' ? 'on' : ''} />
    <path d="M4 12 0 7h8z" className={state === 'desc' ? 'on' : ''} />
  </svg>
);

/** What a filter value means, in words (for the chips above the table). */
export const describeFilter = (kind: ColumnKind, value: string) => {
  if (kind === 'text') return value.startsWith('^') ? `starts with “${value.slice(1)}”` : value.startsWith('=') ? `is “${value.slice(1)}”` : `contains “${value}”`;
  const [from, to] = value.split('..');
  return from && to ? (from === to ? `is ${from}` : `${from} to ${to}`) : from ? `from ${from}` : `up to ${to}`;
};

/** A table heading: click the name to sort up/down; click the funnel to filter this column. */
export const ColumnTh: React.FC<{ column: string; label: string; kind?: ColumnKind; cols: ListColumnsState; align?: 'left' | 'right'; sortable?: boolean; filterable?: boolean; style?: React.CSSProperties }> = ({ column, label, kind = 'text', cols, align = 'left', sortable = true, filterable = true, style }) => {
  const active = cols.sort === column;
  const filtered = Boolean(cols.filters[column]);
  const [open, setOpen] = useState(false);
  const [spot, setSpot] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const root = useRef<HTMLTableCellElement>(null);
  useEffect(() => { if (!open) return; const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); }; document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close); }, [open]);
  return (
    <th ref={root} aria-sort={active ? (cols.direction === 'asc' ? 'ascending' : 'descending') : 'none'} style={{ textAlign: align, position: 'relative', whiteSpace: 'nowrap', ...style }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexDirection: align === 'right' ? 'row-reverse' : 'row' }}>
        {sortable
          ? <button type="button" className={`sortable-heading${active ? ' is-active' : ''}`} onClick={() => cols.changeSort(column, kind)} title={`Sort by ${label}`}><span>{label}</span><SortCarets state={active ? cols.direction : 'none'} /></button>
          : <span>{label}</span>}
        {filterable && <button type="button" onClick={event => { event.stopPropagation(); const rect = root.current?.getBoundingClientRect(); if (rect) setSpot({ top: rect.bottom + 4, left: Math.max(8, Math.min(window.innerWidth - 266, align === 'right' ? rect.right - 250 : rect.left)) }); setOpen(value => !value); }} title={`Filter ${label}`} aria-label={`Filter ${label}`}
          style={{ border: 0, background: filtered ? 'var(--navy)' : 'transparent', color: filtered ? '#fff' : 'var(--text-muted)', borderRadius: 4, padding: 2, cursor: 'pointer', display: 'inline-grid', placeItems: 'center', opacity: filtered ? 1 : 0.6 }}><Filter size={11} /></button>}
      </span>
      {open && <ColumnFilterBox column={column} label={label} kind={kind} cols={cols} spot={spot} onClose={() => setOpen(false)} />}
    </th>
  );
};

// Shown over the page (fixed), so the table's scroll box does not cut it off.
const ColumnFilterBox: React.FC<{ column: string; label: string; kind: ColumnKind; cols: ListColumnsState; spot: { top: number; left: number }; onClose: () => void }> = ({ column, label, kind, cols, spot, onClose }) => {
  const current = cols.filters[column] || '';
  const [mode, setMode] = useState(current.startsWith('=') ? '=' : current.startsWith('^') || !current ? '^' : '');
  const [text, setText] = useState(current.replace(/^[=^]/, ''));
  const [from, setFrom] = useState(current.includes('..') ? current.split('..')[0] : '');
  const [to, setTo] = useState(current.includes('..') ? current.split('..')[1] : '');
  const apply = () => {
    const value = kind === 'text' ? (text.trim() ? `${mode}${text.trim()}` : '') : (from || to ? `${from}..${to}` : '');
    cols.setFilter(column, value, label, kind); onClose();
  };
  const inputType = kind === 'date' ? 'date' : 'number';
  return (
    <div onClick={event => event.stopPropagation()} className="card" style={{ position: 'fixed', top: spot.top, left: spot.left, zIndex: 2000, width: 250, padding: 12, display: 'grid', gap: 8, textAlign: 'left', fontWeight: 400, boxShadow: '0 12px 30px rgba(15,23,42,.18)', textTransform: 'none', letterSpacing: 0 }}>
      <strong style={{ fontSize: 13 }}>Filter: {label}</strong>
      {kind === 'text' ? <>
        <select value={mode} onChange={event => setMode(event.target.value)}>
          <option value="^">Starts with</option>
          <option value="">Contains</option>
          <option value="=">Is exactly</option>
        </select>
        <input autoFocus value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') apply(); }} placeholder="Type here…" dir="auto" />
      </> : <>
        <label style={{ display: 'grid', gap: 3, fontSize: 12 }}>From<input autoFocus type={inputType} step="any" value={from} onChange={event => setFrom(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') apply(); }} /></label>
        <label style={{ display: 'grid', gap: 3, fontSize: 12 }}>To<input type={inputType} step="any" value={to} onChange={event => setTo(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') apply(); }} /></label>
      </>}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', gap: 4 }}>
          <button type="button" className="btn btn-ghost btn-sm" title="Sort up (A→Z, oldest, smallest)" onClick={() => { cols.sortBy(column, 'asc'); onClose(); }}>↑</button>
          <button type="button" className="btn btn-ghost btn-sm" title="Sort down (Z→A, newest, largest)" onClick={() => { cols.sortBy(column, 'desc'); onClose(); }}>↓</button>
        </span>
        <span style={{ display: 'flex', gap: 6 }}>
          {current && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { cols.setFilter(column, ''); onClose(); }}>Clear</button>}
          <button type="button" className="btn btn-primary btn-sm" onClick={apply}>Filter</button>
        </span>
      </div>
    </div>
  );
};

/** The filters in use, shown above the table, each with an × to remove it. */
export const ColumnFilterChips: React.FC<{ cols: ListColumnsState }> = ({ cols }) => {
  const entries = Object.entries(cols.filters);
  if (!entries.length) return null;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', padding: '6px 0' }}>
      {entries.map(([key, value]) => <span key={key} className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--navy-bg)', color: 'var(--navy)', padding: '4px 8px', fontSize: 12 }}>
        <span dir="auto"><strong>{cols.labels[key]?.label || key}</strong> {describeFilter(cols.labels[key]?.kind || 'text', value)}</span>
        <button type="button" aria-label="Remove filter" onClick={() => cols.setFilter(key, '')} style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: 0, color: 'inherit', display: 'grid' }}><X size={12} /></button>
      </span>)}
      <button type="button" className="reset-link" onClick={cols.clearFilters}>Clear all filters</button>
    </div>
  );
};

/** For short lists that are all on screen: sort and filter them here, the same way the server does. */
export const sortFilterRows = <T,>(rows: T[], cols: ListColumnsState, kinds: Record<string, ColumnKind>, getValue: (row: T, key: string) => unknown): T[] => {
  const passes = (row: T) => Object.entries(cols.filters).every(([key, raw]) => {
    const kind = kinds[key] || 'text'; const value = getValue(row, key);
    if (kind === 'text') { const exact = raw.startsWith('='); const starts = raw.startsWith('^'); const text = (exact || starts ? raw.slice(1) : raw).trim().toLowerCase(); if (!text) return true; const v = String(value ?? '').toLowerCase(); return exact ? v === text : starts ? v.startsWith(text) : v.includes(text); }
    const [from = '', to = ''] = raw.includes('..') ? raw.split('..') : [raw, raw];
    if (kind === 'date') { const v = String(value || ''); return (!from || v >= from) && (!to || (v !== '' && v <= to)); }
    const v = Number(value || 0); return (from.trim() === '' || v >= Number(from)) && (to.trim() === '' || v <= Number(to));
  });
  const filtered = rows.filter(passes);
  if (!cols.sort || !(cols.sort in kinds)) return filtered;
  const kind = kinds[cols.sort]; const sign = cols.direction === 'asc' ? 1 : -1;
  return [...filtered].sort((a, b) => { const x = getValue(a, cols.sort); const y = getValue(b, cols.sort); return sign * (kind === 'number' ? Number(x || 0) - Number(y || 0) : String(x ?? '').toLowerCase().localeCompare(String(y ?? '').toLowerCase())); });
};
