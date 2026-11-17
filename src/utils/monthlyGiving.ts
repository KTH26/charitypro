/**
 * "Monthly giving by donor": one row per donor, and for every month two columns:
 * how much he gave that month, and how he gave it (for example "Cash $100 + Credit card $100 + Vouchers $100").
 * Only approved payments count. Amounts are in CAD.
 */
import type { ExcelColumn, ExcelSheet } from './excel';
import { moneyText } from './money';

export type MonthCell = { amount: number; how: string; byMethod: Record<string, number> };
export type MonthlySort = 'first' | 'last' | 'hebLast' | 'hebFirst' | 'title' | 'total';
export type MonthlyRow = { donorId: string; donorNumber: string; donor: string; hebrewName: string; phone: string; firstName: string; lastName: string; hebFirstName: string; hebLastName: string; title: string; total: number; months: Record<string, MonthCell> };

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthLabel = (month: string) => `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
const cents = (value: number) => Math.round(value * 100) / 100;
const dollars = (value: number) => moneyText(value);

/** Every month from the first to the last (yyyy-mm). */
export const monthsBetween = (from: string, to: string) => {
  const result: string[] = []; let year = Number(from.slice(0, 4)); let month = Number(from.slice(5, 7));
  const endYear = Number(to.slice(0, 4)); const endMonth = Number(to.slice(5, 7));
  if (!year || !month || !endYear || !endMonth) return result;
  while ((year < endYear || (year === endYear && month <= endMonth)) && result.length < 240) { result.push(`${year}-${String(month).padStart(2, '0')}`); month++; if (month > 12) { month = 1; year++; } }
  return result;
};

/** "Cash $100 + Credit card $200". One method alone is written without the amount. */
export const howText = (byMethod: Record<string, number>) => {
  const parts = Object.entries(byMethod).filter(([, amount]) => Math.abs(amount) >= 0.005).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (parts.length === 1) return parts[0][0];
  return parts.map(([method, amount]) => `${method} ${dollars(cents(amount))}`).join(' + ');
};

export const buildMonthlyGiving = (payments: Record<string, any>[], donors: Record<string, any>[], fromMonth: string, toMonth: string, options: { onlyGivers?: boolean; sort?: MonthlySort } = {}) => {
  const months = monthsBetween(fromMonth, toMonth); const wanted = new Set(months);
  const rows = new Map<string, MonthlyRow>();
  const rowFor = (donorId: string, fallbackName = '') => {
    let row = rows.get(donorId);
    if (!row) { const donor = donors.find(item => String(item.id) === donorId); row = { donorId, donorNumber: String(donor?.donorNumber || ''), donor: String(donor?.name || fallbackName || '(no donor)'), hebrewName: String(donor?.hebrewName || ''), phone: String(donor?.phone || ''), firstName: String(donor?.firstName || ''), lastName: String(donor?.lastName || ''), hebFirstName: String(donor?.hebFirstName || ''), hebLastName: String(donor?.hebLastName || ''), title: String(donor?.title || ''), total: 0, months: {} }; rows.set(donorId, row); }
    return row;
  };
  if (options.onlyGivers === false) donors.forEach(donor => rowFor(String(donor.id)));
  for (const payment of payments) {
    if (payment.status !== 'Approved') continue;
    const month = String(payment.date || '').slice(0, 7); if (!wanted.has(month)) continue;
    const row = rowFor(String(payment.donorId || ''), payment.donor);
    const amount = Number(payment.amountCAD ?? payment.amount ?? 0); const method = String(payment.method || 'Other');
    const cell = row.months[month] || { amount: 0, how: '', byMethod: {} };
    cell.amount += amount; cell.byMethod[method] = (cell.byMethod[method] || 0) + amount; row.months[month] = cell; row.total += amount;
  }
  const list = [...rows.values()];
  for (const row of list) { row.total = cents(row.total); for (const cell of Object.values(row.months)) { cell.amount = cents(cell.amount); cell.how = howText(cell.byMethod); } }
  // Sort keys: the chosen name first, then the other parts, so ties stay in a sensible order. Donors without that name go last.
  const words = (row: MonthlyRow) => row.donor.trim().split(/\s+/);
  const english = (row: MonthlyRow, part: 'first' | 'last') => (part === 'first' ? row.firstName || words(row)[0] : row.lastName || (words(row).length > 1 ? words(row)[words(row).length - 1] : '')) || '';
  const keys = (row: MonthlyRow): string[] => {
    const sort = options.sort || 'first';
    if (sort === 'last') return [english(row, 'last'), english(row, 'first'), row.donor];
    if (sort === 'hebLast') return [row.hebLastName, row.hebFirstName, row.donor];
    if (sort === 'hebFirst') return [row.hebFirstName, row.hebLastName, row.donor];
    if (sort === 'title') return [row.title, english(row, 'last'), english(row, 'first'), row.donor];
    return [english(row, 'first') || row.donor, english(row, 'last'), row.donor];
  };
  const compareText = (a: string, b: string) => !a && b ? 1 : a && !b ? -1 : a.localeCompare(b, ['he', 'en'], { sensitivity: 'base' });
  const byName = (a: MonthlyRow, b: MonthlyRow) => { const x = keys(a); const y = keys(b); for (let i = 0; i < x.length; i++) { const result = compareText(x[i].trim(), y[i].trim()); if (result) return result; } return 0; };
  list.sort((a, b) => options.sort === 'total' ? b.total - a.total || byName(a, b) : byName(a, b));
  // Totals for each month, with the split by method.
  const totals: Record<string, MonthCell> = {};
  for (const month of months) { const byMethod: Record<string, number> = {}; let amount = 0; for (const row of list) { const cell = row.months[month]; if (!cell) continue; amount += cell.amount; for (const [method, value] of Object.entries(cell.byMethod)) byMethod[method] = (byMethod[method] || 0) + value; } totals[month] = { amount: cents(amount), byMethod, how: howText(byMethod) }; }
  return { months, rows: list, totals, grandTotal: cents(list.reduce((sum, row) => sum + row.total, 0)) };
};

export const monthlyGivingSheet = (report: ReturnType<typeof buildMonthlyGiving>, title: string): ExcelSheet => {
  // The name is split in separate columns so it can be sorted in Excel by any part.
  const columns: ExcelColumn[] = [{ key: 'donorNumber', header: 'Donor #', type: 'text' }, { key: 'firstName', header: 'First name', type: 'text' }, { key: 'lastName', header: 'Last name', type: 'text' }, { key: 'hebFirstName', header: 'Hebrew first name', type: 'text' }, { key: 'hebLastName', header: 'Hebrew last name', type: 'text' }, { key: 'title', header: 'Title', type: 'text' }, { key: 'phone', header: 'Phone', type: 'text' }];
  for (const month of report.months) columns.push({ key: `${month}-amount`, header: `${monthLabel(month)} total`, type: 'money', width: 13 }, { key: `${month}-how`, header: `${monthLabel(month)} how paid`, type: 'text', width: 28 });
  columns.push({ key: 'total', header: 'Total', type: 'money', width: 14 });
  const rows = report.rows.map(row => { const out: Record<string, any> = { donorNumber: row.donorNumber, firstName: row.firstName, lastName: row.lastName, hebFirstName: row.hebFirstName, hebLastName: row.hebLastName, title: row.title, phone: row.phone, total: row.total }; for (const month of report.months) { const cell = row.months[month]; out[`${month}-amount`] = cell ? cell.amount : ''; out[`${month}-how`] = cell ? cell.how : ''; } return out; });
  const totals: Record<string, any> = { firstName: 'Total', total: report.grandTotal };
  for (const month of report.months) { totals[`${month}-amount`] = report.totals[month].amount; totals[`${month}-how`] = report.totals[month].how; }
  return { name: 'Monthly by donor', title, columns, rows, totals, freezeColumns: 5 };
};
