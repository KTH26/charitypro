import React, { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, RefreshCw } from 'lucide-react';
import { downloadExcel } from '../utils/excel';
import { fetchReportRows, torontoToday } from '../utils/reportExport';
import { buildMonthlyGiving, monthLabel, monthlyGivingSheet, type MonthlyRow, type MonthlySort } from '../utils/monthlyGiving';
import { moneyText as money } from '../utils/money';

// The name columns, each one its own column so it can be sorted. They stay in place when scrolling sideways.
const NAME_COLUMNS: { key: keyof MonthlyRow; label: string; sort: MonthlySort; width: number }[] = [
  { key: 'firstName', label: 'First name', sort: 'first', width: 110 }, { key: 'lastName', label: 'Last name', sort: 'last', width: 120 },
  { key: 'hebFirstName', label: 'Hebrew first', sort: 'hebFirst', width: 110 }, { key: 'hebLastName', label: 'Hebrew last', sort: 'hebLast', width: 120 },
];
const lefts = NAME_COLUMNS.map((_, index) => NAME_COLUMNS.slice(0, index).reduce((sum, column) => sum + column.width, 0));
const stick = (index: number, extra: React.CSSProperties = {}): React.CSSProperties => ({ position: 'sticky', left: lefts[index], minWidth: NAME_COLUMNS[index].width, maxWidth: NAME_COLUMNS[index].width, background: 'var(--bg-card)', zIndex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...extra });

/** One row per donor; for each month: total given and how it was paid. */
export const MonthlyDonorReport: React.FC = () => {
  const today = torontoToday();
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01`); const [to, setTo] = useState(today.slice(0, 7));
  const [onlyGivers, setOnlyGivers] = useState(true); const [sort, setSort] = useState<MonthlySort>('last'); const [search, setSearch] = useState(''); const [tag, setTag] = useState('');
  const [payments, setPayments] = useState<Record<string, any>[] | null>(null); const [donors, setDonors] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const load = async () => {
    setLoading(true); setError('');
    try { const [pay, people] = await Promise.all([fetchReportRows('payments'), fetchReportRows('donors')]); setPayments(pay.rows); setDonors(people.rows); }
    catch (reason: any) { setError(reason.message || 'Could not load.'); } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const quick = (kind: string) => {
    const year = Number(today.slice(0, 4));
    if (kind === 'this_year') { setFrom(`${year}-01`); setTo(today.slice(0, 7)); }
    if (kind === 'last_year') { setFrom(`${year - 1}-01`); setTo(`${year - 1}-12`); }
    if (kind === 'last_12') { const start = new Date(Date.UTC(year, Number(today.slice(5, 7)) - 12, 1)); setFrom(start.toISOString().slice(0, 7)); setTo(today.slice(0, 7)); }
  };
  const report = useMemo(() => payments && from && to && from <= to ? buildMonthlyGiving(payments, donors, from, to, { onlyGivers, sort }) : null, [payments, donors, from, to, onlyGivers, sort]);
  const tags = useMemo(() => [...new Set(donors.map(donor => String(donor.tag || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, ['he', 'en'])), [donors]);
  const shown = useMemo(() => { const text = search.trim().toLowerCase(); return report ? report.rows.filter(row => (!tag || (tag === '(none)' ? !row.tag : row.tag === tag)) && (!text || `${row.donor} ${row.hebrewName} ${row.firstName} ${row.lastName} ${row.hebFirstName} ${row.hebLastName} ${row.tag} ${row.donorNumber} ${row.phone}`.toLowerCase().includes(text))) : []; }, [report, search, tag]);
  const everyone = !!report && shown.length === report.rows.length;
  const shownTotal = useMemo(() => Math.round(shown.reduce((sum, row) => sum + row.total, 0) * 100) / 100, [shown]);
  const monthTotal = (month: string) => Math.round(shown.reduce((sum, row) => sum + (row.months[month]?.amount || 0), 0) * 100) / 100;
  const exportExcel = () => {
    if (!report) return; const title = `Monthly giving by donor${tag ? ` — tag: ${tag === '(none)' ? 'no tag' : tag}` : ''} — ${monthLabel(from)} to ${monthLabel(to)} (made ${today})`;
    // When a search or tag is chosen, the Excel totals count only the donors shown.
    const ids = new Set(shown.map(row => row.donorId));
    const result = everyone ? report : buildMonthlyGiving((payments || []).filter(item => ids.has(String(item.donorId || ''))), donors.filter(item => ids.has(String(item.id))), from, to, { onlyGivers, sort });
    downloadExcel(`Monthly giving by donor ${from} to ${to}`, [monthlyGivingSheet(result, title)]);
  };
  return <section style={{ display: 'grid', gap: 14 }}>
    <div className="card" style={{ display: 'grid', gap: 12 }}>
      <div><h2 style={{ margin: 0, color: 'var(--navy)' }}>Monthly giving by donor</h2><p style={{ margin: '4px 0 0', color: 'var(--text-muted)' }}>Every donor in a row. For each month: how much he gave, and how (cash, card, vouchers …). Approved payments only, in CAD.</p></div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end' }}>
        <label className="form-group" style={{ margin: 0 }}><span>From month</span><input type="month" value={from} onChange={event => setFrom(event.target.value)} /></label>
        <label className="form-group" style={{ margin: 0 }}><span>To month</span><input type="month" value={to} onChange={event => setTo(event.target.value)} /></label>
        <div style={{ display: 'flex', gap: 6 }}><button type="button" className="btn btn-secondary btn-sm" onClick={() => quick('this_year')}>This year</button><button type="button" className="btn btn-secondary btn-sm" onClick={() => quick('last_year')}>Last year</button><button type="button" className="btn btn-secondary btn-sm" onClick={() => quick('last_12')}>Last 12 months</button></div>
        <label className="form-group" style={{ margin: 0 }}><span>Which donors</span><select value={onlyGivers ? 'givers' : 'all'} onChange={event => setOnlyGivers(event.target.value === 'givers')}><option value="givers">Only donors who gave in these months</option><option value="all">All donors (also those who gave nothing)</option></select></label>
        <label className="form-group" style={{ margin: 0 }}><span>Order</span><select value={sort} onChange={event => setSort(event.target.value as MonthlySort)}><option value="last">Last name (A–Z)</option><option value="first">First name (A–Z)</option><option value="hebLast">Hebrew last name (א–ת)</option><option value="hebFirst">Hebrew first name (א–ת)</option><option value="tag">Tag (title)</option><option value="total">Biggest givers first</option></select></label>
        <label className="form-group" style={{ margin: 0 }}><span>Tag (title)</span><select value={tag} onChange={event => setTag(event.target.value)}><option value="">All donors</option><option value="(none)">Donors with no tag</option>{tags.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
        <label className="form-group" style={{ margin: 0, minWidth: 160 }}><span>Search</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Name or phone" /></label>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="btn btn-primary btn-sm" disabled={!report} onClick={exportExcel}><FileSpreadsheet size={15} /> Export to Excel</button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={loading} onClick={() => void load()}><RefreshCw size={15} /> Refresh</button>
        {report && <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>{shown.length.toLocaleString()} donors · {report.months.length} months · Total {money(shownTotal)} · Click a name heading to sort by it</span>}
        {from > to && <span style={{ color: 'var(--red)' }}>"From" must be before "To".</span>}
      </div>
    </div>
    {error && <div className="card" style={{ color: 'var(--red)' }}>{error}</div>}
    <div className="card" style={{ minWidth: 0 }}>
      {loading && !payments ? <div style={{ padding: 40, textAlign: 'center' }}>Loading…</div> : report && <div className="table-container" style={{ maxHeight: '70vh', overflow: 'auto' }}>
        <table style={{ fontSize: 13.5 }}>
          <thead><tr>{NAME_COLUMNS.map((column, index) => <th key={column.key} rowSpan={2} onClick={() => setSort(column.sort)} style={stick(index, { zIndex: 3, cursor: 'pointer', verticalAlign: 'bottom' })}>{column.label}{sort === column.sort ? ' ▲' : ''}</th>)}<th rowSpan={2} onClick={() => setSort('tag')} style={{ cursor: 'pointer', verticalAlign: 'bottom', whiteSpace: 'nowrap' }}>Tag{sort === 'tag' ? ' ▲' : ''}</th>{report.months.map(month => <th key={month} colSpan={2} style={{ textAlign: 'center', borderLeft: '1px solid var(--border)' }}>{monthLabel(month)}</th>)}<th style={{ textAlign: 'right', borderLeft: '1px solid var(--border)' }}>Total</th></tr>
            <tr>{report.months.map(month => <React.Fragment key={month}><th style={{ textAlign: 'right', borderLeft: '1px solid var(--border)' }}>Total</th><th>How paid</th></React.Fragment>)}<th /></tr></thead>
          <tbody>{shown.slice(0, 400).map(row => <tr key={row.donorId}>
            {NAME_COLUMNS.map((column, index) => <td key={column.key} dir="auto" title={String(row[column.key] || '')} style={stick(index, { fontWeight: index === 1 || index === 3 ? 700 : 500 })}>{String(row[column.key] || '')}</td>)}<td dir="auto" style={{ whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{row.tag}</td>
            {report.months.map(month => { const cell = row.months[month]; return <React.Fragment key={month}><td style={{ textAlign: 'right', whiteSpace: 'nowrap', borderLeft: '1px solid var(--border)' }}>{cell ? money(cell.amount) : ''}</td><td style={{ fontSize: 12.5, color: 'var(--text-secondary)', minWidth: 110 }}>{cell?.how || ''}</td></React.Fragment>; })}
            <td style={{ textAlign: 'right', fontWeight: 800, whiteSpace: 'nowrap', borderLeft: '1px solid var(--border)' }}>{money(row.total)}</td>
          </tr>)}</tbody>
          <tfoot><tr style={{ fontWeight: 800 }}><td style={stick(0)}>Total</td>{NAME_COLUMNS.slice(1).map((column, index) => <td key={column.key} style={stick(index + 1)} />)}<td />{report.months.map(month => <React.Fragment key={month}><td style={{ textAlign: 'right', whiteSpace: 'nowrap', borderLeft: '1px solid var(--border)' }}>{money(everyone ? report.totals[month].amount : monthTotal(month))}</td><td style={{ fontSize: 12, fontWeight: 600 }}>{everyone ? report.totals[month].how : ''}</td></React.Fragment>)}<td style={{ textAlign: 'right', whiteSpace: 'nowrap', borderLeft: '1px solid var(--border)' }}>{money(shownTotal)}</td></tr></tfoot>
        </table>
        {shown.length > 400 && <div style={{ padding: 10, color: 'var(--text-muted)', textAlign: 'center' }}>Showing the first 400 donors here. The Excel file has all {shown.length.toLocaleString()}.</div>}
      </div>}
    </div>
  </section>;
};
