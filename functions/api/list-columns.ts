/** Sort and filter any list column, the same way on every list page. */
const isoDate = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '';

// ---------- Sort and filter on any column of a list ----------
// Each list names its columns once (SQL expression + kind). ?sort=<key>&direction=asc|desc sorts;
// ?f_<key>=... filters: text "^abc" starts with, "=abc" is exactly, "abc" contains; dates and numbers "from..to" (either side may be empty).
export type ColumnKind = 'text' | 'date' | 'number';
export type ListColumn = { sql: string; kind: ColumnKind };
export const textCol = (sql: string): ListColumn => ({ sql, kind: 'text' });
export const dateCol = (sql: string): ListColumn => ({ sql, kind: 'date' });
export const numCol = (sql: string): ListColumn => ({ sql, kind: 'number' });
export const columnFilterValues = (c: any, keys: string[]) => { const out: Record<string, string> = {}; for (const key of keys) { const value = String(c.req.query(`f_${key}`) || '').trim(); if (value) out[key] = value.slice(0, 200); } return out; };
/** One filter as SQL. Returns null when the value is not usable. */
export const columnFilterSql = (column: ListColumn, raw: string): { sql: string; bindings: any[] } | null => {
  if (column.kind === 'text') {
    const exact = raw.startsWith('='); const starts = raw.startsWith('^'); const text = (exact || starts ? raw.slice(1) : raw).trim().toLowerCase();
    if (!text) return null;
    const value = `lower(CAST(COALESCE(${column.sql},'') AS TEXT))`;
    return exact ? { sql: `${value}=?`, bindings: [text] } : { sql: `${value} LIKE ?`, bindings: [starts ? `${text}%` : `%${text}%`] };
  }
  const [fromRaw, toRaw = ''] = raw.includes('..') ? raw.split('..') : [raw, raw];
  const clean = (value: string) => column.kind === 'date' ? isoDate(value.trim()) : (value.trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : '');
  const from = clean(fromRaw); const to = clean(toRaw);
  const parts: string[] = []; const bindings: any[] = [];
  const value = column.kind === 'number' ? `CAST(COALESCE(${column.sql},0) AS REAL)` : `COALESCE(${column.sql},'')`;
  if (from !== '') { parts.push(`${value}>=?`); bindings.push(from); }
  if (to !== '') { parts.push(`${value}<=?`); bindings.push(to); }
  return parts.length ? { sql: parts.join(' AND '), bindings } : null;
};
/** ORDER BY for the chosen column, and WHERE parts for every column filter. */
export const listColumns = (c: any, columns: Record<string, ListColumn>, fallbackKey: string) => {
  const key = String(c.req.query('sort') || '');
  const column = columns[key] || columns[fallbackKey];
  const direction = String(c.req.query('direction') || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const sortSql = column.kind === 'text' ? `lower(CAST(COALESCE(${column.sql},'') AS TEXT))` : column.kind === 'number' ? `CAST(COALESCE(${column.sql},0) AS REAL)` : `COALESCE(${column.sql},'')`;
  const conditions: string[] = []; const bindings: any[] = [];
  for (const [filterKey, raw] of Object.entries(columnFilterValues(c, Object.keys(columns)))) { const part = columnFilterSql(columns[filterKey], raw); if (part) { conditions.push(`(${part.sql})`); bindings.push(...part.bindings); } }
  return { order: `${sortSql} ${direction}`, conditions, bindings, sortKey: columns[key] ? key : fallbackKey, direction };
};
/** The same sort and filters for lists worked out in code (not SQL): values come from getValue(row, key). */
export const sortAndFilterRows = <T,>(c: any, rows: T[], kinds: Record<string, ColumnKind>, getValue: (row: T, key: string) => any, fallbackKey: string, filterKeys: string[] = Object.keys(kinds)) => {
  const filters = columnFilterValues(c, filterKeys);
  const passes = (row: T) => Object.entries(filters).every(([key, raw]) => {
    const kind = kinds[key]; const value = getValue(row, key);
    if (kind === 'text') { const exact = raw.startsWith('='); const starts = raw.startsWith('^'); const text = (exact || starts ? raw.slice(1) : raw).trim().toLowerCase(); if (!text) return true; const v = String(value ?? '').toLowerCase(); return exact ? v === text : starts ? v.startsWith(text) : v.includes(text); }
    const [fromRaw, toRaw = ''] = raw.includes('..') ? raw.split('..') : [raw, raw];
    if (kind === 'date') { const v = String(value || ''); const from = isoDate(fromRaw.trim()); const to = isoDate(toRaw.trim()); return (!from || v >= from) && (!to || (v && v <= to)); }
    const v = Number(value || 0); const from = fromRaw.trim() === '' ? NaN : Number(fromRaw); const to = toRaw.trim() === '' ? NaN : Number(toRaw); return (Number.isNaN(from) || v >= from) && (Number.isNaN(to) || v <= to);
  });
  const key = kinds[String(c.req.query('sort') || '')] ? String(c.req.query('sort')) : fallbackKey;
  const asc = String(c.req.query('direction') || '').toLowerCase() === 'asc';
  const kind = kinds[key];
  const compare = (a: T, b: T) => { const x = getValue(a, key); const y = getValue(b, key); const r = kind === 'number' ? Number(x || 0) - Number(y || 0) : String(x ?? '').toLowerCase().localeCompare(String(y ?? '').toLowerCase()); return asc ? r : -r; };
  return rows.filter(passes).sort(compare);
};
/** True when the sort or a filter uses one of these keys (columns worked out in code). */
export const usesColumns = (c: any, keys: string[]) => keys.includes(String(c.req.query('sort') || '')) || keys.some(key => String(c.req.query(`f_${key}`) || '').trim() !== '');

