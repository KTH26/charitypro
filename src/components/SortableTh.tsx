import React from 'react';

export type SortDirection = 'asc' | 'desc';

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
        <span aria-hidden="true" className="sort-arrow">{active ? (direction === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  );
};
