import React, { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, RefreshCw } from 'lucide-react';
import { downloadExcel } from '../utils/excel';
import { fetchReportRows, torontoToday } from '../utils/reportExport';
import { buildMonthlyGiving, monthLabel, monthlyGivingSheet, type MonthlySort } from '../utils/monthlyGiving';

const money = (value: number) => '$' + value.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** One row per donor; for each month: total given and how it was paid. */
export const MonthlyDonorReport: React.FC = () => {
  const today = torontoToday();
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01`); const [to, setTo] = useState(today.slice(0, 7));
  const [onlyGivers, setOnlyGivers] = useState(true); const [sort, setSort] = useState<MonthlySort>('last'); const [search, setSearch] = useState('');
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
  const shown = useMemo(() => { const text = search.trim().toLowerCase(); return report ? report.rows.filter(row => !text || `${row.donor} ${row.hebrewName} ${row.donorNumber} ${row.phone}`.toLowerCase().includes(text)) : []; }, [report, search]);
  const exportExcel = () => { if (!report) return; const title = `Monthly giving by donor — ${monthLabel(from)} to ${monthLabel(to)} (made ${today})`; downloadExcel(`Monthly giving by donor ${from} to ${to}`, [monthlyGivingSheet({ ...report, rows: shown }, title)]); };
  return <section style={{ display: 'grid', gap: 14 }}>
    <div className="card" style={{ display: 'grid', gap: 12 }}>
      <div><h2 style={{ margin: 0, color: 'var(--navy)' }}>Monthly giving by donor</h2><p style={{ margin: '4px 0 0', color: 'var(--text-muted)' }}>Every donor in a row. For each month: how much he gave, and how (cash, card, vouchers …). Approved payments only, in CAD.</p></div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end' }}>
        <label className="form-group" style={{ margin: 0 }}><span>From month</span><input type="month" value={from} onChange={event => setFrom(event.target.value)} /></label>
        <label className="form-group" style={{ margin: 0 }}><span>To month</span><input type="month" value={to} onChange={event => setTo(event.target.value)} /></label>
        <div style={{ display: 'flex', gap: 6 }}><button type="button" className="btn btn-secondary btn-sm" onClick={() => quick('this_year')}>This year</button><button type="button" className="btn btn-secondary btn-sm" onClick={() => quick('last_year')}>Last year</button><button type="button" className="btn btn-secondary btn-sm" onClick={() => quick('last_12')}>Last 12 months</button></div>
        <label className="form-group" style={{ margin: 0 }}><span>Which donors</span><select value={onlyGivers ? 'givers' : 'all'} onChange={event => setOnlyGivers(event.target.value === 'givers')}><option value="givers">Only donors who gave in these months</option><option value="all">All donors (also those who gave nothing)</option></select></label>
        <label className="form-group" style={{ margin: 0 }}><span>Order</span><select value={sort} onChange={event => setSort(event.target.value as MonthlySort)}><option value="last">Last name (A–Z)</option><option value="first">First name (A–Z)</option><option value="hebLast">Hebrew last name (א–ת)</option><option value="hebFirst">Hebrew first name (א–ת)</option><option value="total">Biggest givers first</option></select></label>
        <label className="form-group" style={{ margin: 0, minWidth: 160 }}><span>Search</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Name or phone" /></label>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="btn btn-primary btn-sm" disabled={!report} onClick={exportExcel}><FileSpreadsheet size={15} /> Export to Excel</button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={loading} onClick={() => void load()}><RefreshCw size={15} /> Refresh</button>
        {report && <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>{shown.length.toLocaleString()} donors · {report.months.length} months · Total {money(report.grandTotal)}</span>}
        {from > to && <span style={{ color: 'var(--red)' }}>"From" must be before "To".</span>}
      </div>
    </div>
    {error && <div className="card" style={{ color: 'var(--red)' }}>{error}</div>}
    <div className="card" style={{ minWidth: 0 }}>
      {loading && !payments ? <div style={{ padding: 40, textAlign: 'center' }}>Loading…</div> : report && <div className="table-container" style={{ maxHeight: '70vh', overflow: 'auto' }}>
        <table style={{ fontSize: 13.5 }}>
          <thead><tr><th style={{ position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 2 }}>Donor</th>{report.months.map(month => <th key={month} colSpan={2} style={{ textAlign: 'center', borderLeft: '1px solid var(--border)' }}>{monthLabel(month)}</th>)}<th style={{ textAlign: 'right', borderLeft: '1px solid var(--border)' }}>Total</th></tr>
            <tr><th style={{ position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 2 }} />{report.months.map(month => <React.Fragment key={month}><th style={{ textAlign: 'right', borderLeft: '1px solid var(--border)' }}>Total</th><th>How paid</th></React.Fragment>)}<th /></tr></thead>
          <tbody>{shown.slice(0, 400).map(row => <tr key={row.donorId}>
            <td dir="auto" style={{ position: 'sticky', left: 0, background: 'var(--bg-card)', fontWeight: 700, whiteSpace: 'nowrap' }}>{row.donor}{row.hebrewName && <div style={{ fontWeight: 500, fontSize: 12, color: 'var(--text-muted)' }}>{row.hebrewName}</div>}</td>
            {report.months.map(month => { const cell = row.months[month]; return <React.Fragment key={month}><td style={{ textAlign: 'right', whiteSpace: 'nowrap', borderLeft: '1px solid var(--border)' }}>{cell ? money(cell.amount) : ''}</td><td style={{ fontSize: 12.5, color: 'var(--text-secondary)', minWidth: 110 }}>{cell?.how || ''}</td></React.Fragment>; })}
            <td style={{ textAlign: 'right', fontWeight: 800, whiteSpace: 'nowrap', borderLeft: '1px solid var(--border)' }}>{money(row.total)}</td>
          </tr>)}</tbody>
          <tfoot><tr style={{ fontWeight: 800 }}><td style={{ position: 'sticky', left: 0, background: 'var(--bg-card)' }}>Total</td>{report.months.map(month => <React.Fragment key={month}><td style={{ textAlign: 'right', whiteSpace: 'nowrap', borderLeft: '1px solid var(--border)' }}>{money(report.totals[month].amount)}</td><td style={{ fontSize: 12, fontWeight: 600 }}>{report.totals[month].how}</td></React.Fragment>)}<td style={{ textAlign: 'right', whiteSpace: 'nowrap', borderLeft: '1px solid var(--border)' }}>{money(report.grandTotal)}</td></tr></tfoot>
        </table>
        {shown.length > 400 && <div style={{ padding: 10, color: 'var(--text-muted)', textAlign: 'center' }}>Showing the first 400 donors here. The Excel file has all {shown.length.toLocaleString()}.</div>}
      </div>}
    </div>
  </section>;
};
