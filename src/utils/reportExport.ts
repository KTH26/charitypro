import { type ExcelColumn, type ExcelSheet } from './excel';
import { groupRows, rangeDates, sourceByKey, totalsOf, type ReportSetup } from './reportSources';

export const torontoToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/** Loads all rows of one kind (payments, bills …) for the report builder and the Export buttons. */
export const fetchReportRows = async (source: string) => {
  const response = await fetch(`/api/v3/report-data?source=${encodeURIComponent(source)}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || 'Could not load the report.');
  return { rows: data.rows as Record<string, any>[], today: String(data.today || torontoToday()) };
};

/** The Excel sheets for a report (a summary sheet when grouped, plus all the rows). */
export const reportSheets = (setup: ReportSetup, rows: Record<string, any>[], today: string, title: string): ExcelSheet[] => {
  const source = sourceByKey(setup.source);
  const columns: ExcelColumn[] = setup.columns.map(key => source.columns.find(column => column.key === key)).filter(Boolean).map(column => ({ key: column!.key, header: column!.label, type: column!.type }));
  const [from, to] = rangeDates(setup.range, today, setup.from, setup.to);
  const heading = `${title}${from || to ? ` — ${from || 'start'} to ${to || 'today'}` : ''} (made ${today})`;
  const totals = totalsOf(rows, setup); const totalRow: Record<string, any> = { [columns[0]?.key || '']: 'Total' };
  columns.forEach(column => { if (column.type === 'money' || column.type === 'number') totalRow[column.key] = totals[column.key]; });
  const detail: ExcelSheet = { name: setup.groupBy ? 'All rows' : (title || 'Report'), title: heading, columns, rows, totals: rows.length ? totalRow : null };
  if (!setup.groupBy) return [detail];
  const label = (key: string) => source.columns.find(column => column.key === key)?.label || key;
  const numeric = columns.filter(column => column.type === 'money' || column.type === 'number');
  const groups = groupRows(rows, setup);
  const summaryColumns: ExcelColumn[] = [{ key: '_g1', header: label(setup.groupBy), type: 'text' }, ...(setup.groupBy2 ? [{ key: '_g2', header: label(setup.groupBy2), type: 'text' as const }] : []), { key: '_count', header: 'Count', type: 'number' }, ...numeric];
  const summaryRows = groups.map(group => ({ _g1: group.key, _g2: group.key2, _count: group.count, ...Object.fromEntries(numeric.map(column => [column.key, Math.round(group.sums[column.key] * 100) / 100])) }));
  return [{ name: 'Summary', title: heading, columns: summaryColumns, rows: summaryRows, totals: { _g1: 'Total', _count: rows.length, ...Object.fromEntries(numeric.map(column => [column.key, totals[column.key]])) } }, detail];
};

