import React from 'react';

export type SortDirection = 'asc' | 'desc';

// Two small arrows (up and down) after the column name; the one in use is dark.
const SortCarets: React.FC<{ state: 'asc' | 'desc' | 'none' }> = ({ state }) => (
  <svg className="sort-carets" width="8" height="12" viewBox="0 0 8 12" aria-hidden="true">
    <path d="M4 0 8 5H0z" className={state === 'asc' ? 'on' : ''} />
    <path d="M4 12 0 7h8z" className={state === 'desc' ? 'on' : ''} />
  </svg>
);

export const SortableTh: React.FC<{
  column: string;
  label: React.ReactNode;
  sort: string;
  direction: SortDirection;
  onSort: (column: string) => void;
  align?: 'left' | 'right';
}> = ({ column, label, sort, direction, onSort, align = 'left' }) => {
  const active = sort === column;
  return (
    <th
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      style={{ textAlign: align }}
    >
      <button
        type="button"
        className={`sortable-heading${active ? ' is-active' : ''}`}
        onClick={() => onSort(column)}
        title={`Sort by ${typeof label === 'string' ? label : column}`}
      >
        <span>{label}</span>
        <SortCarets state={active ? direction : 'none'} />
      </button>
    </th>
  );
};
