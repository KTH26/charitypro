import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, List, MoreHorizontal, Plus } from 'lucide-react';

// Shared pieces that give every list page the same DonorFuse-style layout:
// view tabs on top, one toolbar row, the table, and a "Showing 1–50 of 713 records" footer.
// They only arrange what each page already had; they do not load or change any data.

export type ListView = { key: string; label: string; count?: number | null };

export const ViewTabs: React.FC<{ views: ListView[]; value: string; onChange: (key: string) => void }> = ({ views, value, onChange }) => (
  <div className="list-views" role="tablist">
    {views.map(view => <button
      key={view.key}
      type="button"
      role="tab"
      aria-selected={view.key === value}
      className={`list-view${view.key === value ? ' active' : ''}`}
      onClick={() => onChange(view.key)}
    >
      <List size={14} className="list-view-icon" />
      {typeof view.count === 'number' && <span className="list-view-count">{view.count > 999 ? `${Math.floor(view.count / 1000)}k` : view.count}</span>}
      <span>{view.label}</span>
    </button>)}
  </div>
);

/** A single view tab, for pages that have no views to switch between (keeps the same look). */
export const SingleView: React.FC<{ label?: string; count?: number | null }> = ({ label = 'All', count }) => (
  <ViewTabs views={[{ key: 'all', label, count }]} value="all" onChange={() => undefined} />
);

export const ListToolbar: React.FC<{ children: React.ReactNode; end?: React.ReactNode }> = ({ children, end }) => (
  <div className="list-toolbar">
    <div className="list-toolbar-start">{children}</div>
    {end && <div className="list-toolbar-end">{end}</div>}
  </div>
);

export const ResetLink: React.FC<{ onClick: () => void; label?: string }> = ({ onClick, label = 'Reset All' }) => (
  <button type="button" className="reset-link" onClick={onClick}>{label}</button>
);

export const NewButton: React.FC<{ onClick: () => void; children: React.ReactNode; disabled?: boolean }> = ({ onClick, children, disabled }) => (
  <button type="button" className="btn btn-primary" onClick={onClick} disabled={disabled}><Plus size={15} />{children}</button>
);

export const ListFooter: React.FC<{
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  shown: number;
  loading?: boolean;
  onPage?: (page: number) => void;
  children?: React.ReactNode;
}> = ({ page, totalPages, total, pageSize, shown, loading, onPage, children }) => {
  const first = total === 0 || shown === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = total === 0 ? 0 : Math.min(total, first + shown - 1);
  const pages = pageList(page, totalPages);
  return (
    <div className="list-footer">
      <span className="list-footer-count">Showing {first.toLocaleString()}–{last.toLocaleString()} of {total.toLocaleString()} records</span>
      {children && <span className="list-footer-extra">{children}</span>}
      {onPage && totalPages > 1 && <div className="pager">
        <button type="button" className="pager-btn" aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => onPage(Math.max(1, page - 1))}><ChevronLeft size={15} /></button>
        {pages.map((value, index) => value === 0
          ? <span key={`gap${index}`} className="pager-gap">…</span>
          : <button key={value} type="button" className={`pager-btn${value === page ? ' active' : ''}`} disabled={loading} onClick={() => onPage(value)}>{value}</button>)}
        <button type="button" className="pager-btn" aria-label="Next page" disabled={page >= totalPages || loading} onClick={() => onPage(Math.min(totalPages, page + 1))}><ChevronRight size={15} /></button>
      </div>}
    </div>
  );
};

// 1 … 4 5 6 … 20  (0 means a gap)
const pageList = (page: number, totalPages: number): number[] => {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const set = new Set([1, totalPages, page - 1, page, page + 1].filter(value => value >= 1 && value <= totalPages));
  const sorted = Array.from(set).sort((a, b) => a - b);
  const out: number[] = [];
  sorted.forEach((value, index) => { if (index > 0 && value - sorted[index - 1] > 1) out.push(0); out.push(value); });
  return out;
};

export type RowMenuItem = { label: string; onClick: () => void; danger?: boolean; disabled?: boolean; hidden?: boolean };

/** The round "…" button at the end of a row; opens a small menu with that row's actions. */
export const RowMenu: React.FC<{ items: RowMenuItem[] }> = ({ items }) => {
  // The menu is placed on the screen (not inside the table) so a scrolling table never cuts it off.
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  const open = position !== null;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setPosition(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setPosition(null); };
    const hide = () => setPosition(null);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [open]);
  const toggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (open) { setPosition(null); return; }
    const rect = event.currentTarget.getBoundingClientRect();
    setPosition({ top: rect.bottom + 4, right: Math.max(8, window.innerWidth - rect.right) });
  };
  const setOpen = (value: boolean) => { if (!value) setPosition(null); };
  const visible = items.filter(item => !item.hidden);
  if (visible.length === 0) return null;
  return (
    <div className="row-menu" ref={ref} onClick={event => event.stopPropagation()}>
      <button type="button" className="row-menu-btn" aria-label="Row actions" aria-haspopup="menu" aria-expanded={open} onClick={toggle}><MoreHorizontal size={16} /></button>
      {position && <div className="row-menu-list" role="menu" style={{ top: position.top, right: position.right }}>
        {visible.map(item => <button
          key={item.label}
          type="button"
          role="menuitem"
          className={item.danger ? 'danger' : ''}
          disabled={item.disabled}
          onClick={() => { setOpen(false); item.onClick(); }}
        >{item.label}</button>)}
      </div>}
    </div>
  );
};
