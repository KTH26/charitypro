import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Columns3, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { downloadExcel } from '../utils/excel';
import { fetchReportRows, torontoToday } from '../utils/reportExport';
import { buildMonthlyGiving, monthLabel, monthlyGivingSheet, pledgeSummaries, PLEDGE_COLUMNS, type ExtraColumn, type MonthlyRow, type MonthlySort } from '../utils/monthlyGiving';
import { moneyText as money } from '../utils/money';

// The name columns, each one its own column so it can be sorted. They stay in place when scrolling sideways.
const NAME_COLUMNS: { key: keyof MonthlyRow; label: string; sort: MonthlySort; width: number }[] = [
  { key: 'firstName', label: 'First name', sort: 'first', width: 104 }, { key: 'lastName', label: 'Last name', sort: 'last', width: 112 },
  { key: 'hebFirstName', label: 'Hebrew first', sort: 'hebFirst', width: 104 }, { key: 'hebLastName', label: 'Hebrew last', sort: 'hebLast', width: 112 },
];
const lefts = NAME_COLUMNS.map((_, index) => NAME_COLUMNS.slice(0, index).reduce((sum, column) => sum + column.width, 0));

// Donor columns you can add yourself with the Columns button (from the donor's card).
const DONOR_COLUMNS: ExtraColumn[] = [
  { key: 'title', label: 'Title' }, { key: 'donorNumber', label: 'Donor #' }, { key: 'phone', label: 'Phone' }, { key: 'mobilePhone', label: 'Mobile phone' }, { key: 'homePhone', label: 'Home phone' },
  { key: 'email', label: 'Email' }, { key: 'address', label: 'Address' }, { key: 'postalCode', label: 'Postal code' }, { key: 'tags', label: 'Donor tags' }, { key: 'legalName', label: 'Legal receipt name' }, { key: 'company', label: 'Company' },
  { key: 'totalGiven', label: 'Total given (all years)', type: 'money' }, { key: 'givenThisYear', label: 'Given this year', type: 'money' }, { key: 'givenLastYear', label: 'Given last year', type: 'money' },
  { key: 'balanceOwed', label: 'Open balance (all pledges)', type: 'money' }, { key: 'pledges', label: 'Number of pledges', type: 'number' }, { key: 'activeSchedules', label: 'Active monthly schedules', type: 'number' },
  { key: 'firstGift', label: 'First gift' }, { key: 'lastGift', label: 'Last gift' }, { key: 'notes', label: 'Notes' },
];
const DEFAULT_EXTRAS = ['title'];
const readExtras = () => { try { const saved = JSON.parse(localStorage.getItem('monthly-report-columns') || 'null'); return Array.isArray(saved) ? saved.filter((key: string) => DONOR_COLUMNS.some(column => column.key === key)) : DEFAULT_EXTRAS; } catch { return DEFAULT_EXTRAS; } };
const readShowPledge = () => { try { return localStorage.getItem('monthly-report-pledge') !== 'off'; } catch { return true; } };

// Every box is the same size: the same width for each kind of column, the same height for each row.
const W = { extra: 112, money: 96, month: 104, total: 104 };
const box: React.CSSProperties = { padding: '5px 8px', border: 0, borderRight: '1px solid var(--line)', borderBottom: '1px solid var(--line)', height: 40, boxSizing: 'border-box', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const head: React.CSSProperties = { ...box, position: 'sticky', top: 0, zIndex: 2, background: 'var(--surface-2)', color: 'var(--ink-2, #3b4a44)', fontSize: 12, fontWeight: 700, height: 36 };
const sized = (width: number, extra: React.CSSProperties = {}): React.CSSProperties => ({ width, minWidth: width, maxWidth: width, ...extra });
const stick = (index: number, extra: React.CSSProperties = {}): React.CSSProperties => ({ ...sized(NAME_COLUMNS[index].width), position: 'sticky', left: lefts[index], background: 'var(--surface-1)', zIndex: 1, ...(index === NAME_COLUMNS.length - 1 ? { boxShadow: 'inset -2px 0 0 var(--line-strong)' } : {}), ...extra });
const shade = 'var(--surface-2)';

/** One row per donor: this year's pledge (pledged, paid, left, scheduled), then each month: total given and how it was paid. */
export const MonthlyDonorReport: React.FC = () => {
  const today = torontoToday();
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01`); const [to, setTo] = useState(today.slice(0, 7));
  const [onlyGivers, setOnlyGivers] = useState(true); const [sort, setSort] = useState<MonthlySort>('last'); const [search, setSearch] = useState(''); const [tag, setTag] = useState(''); const [title, setTitle] = useState('');
  const [payments, setPayments] = useState<Record<string, any>[] | null>(null); const [donors, setDonors] = useState<Record<string, any>[]>([]); const [pledges, setPledges] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const [extras, setExtras] = useState<string[]>(readExtras); const [showPledge, setShowPledge] = useState(readShowPledge); const [pledgeYear, setPledgeYear] = useState(today.slice(0, 4));
  const [picking, setPicking] = useState(false); const pickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => { try { localStorage.setItem('monthly-report-columns', JSON.stringify(extras)); localStorage.setItem('monthly-report-pledge', showPledge ? 'on' : 'off'); } catch { /* not saved */ } }, [extras, showPledge]);
  useEffect(() => { if (!picking) return; const close = (event: MouseEvent) => { if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) setPicking(false); }; document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close); }, [picking]);
  const load = async () => {
    setLoading(true); setError('');
    try { const [pay, people, promised] = await Promise.all([fetchReportRows('payments'), fetchReportRows('donors'), fetchReportRows('pledges')]); setPayments(pay.rows); setDonors(people.rows); setPledges(promised.rows); }
    catch (reason: any) { setError(reason.message || 'Could not load.'); } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const quick = (kind: string) => {
    const year = Number(today.slice(0, 4));
    if (kind === 'this_year') { setFrom(`${year}-01`); setTo(today.slice(0, 7)); setPledgeYear(String(year)); }
    if (kind === 'last_year') { setFrom(`${year - 1}-01`); setTo(`${year - 1}-12`); setPledgeYear(String(year - 1)); }
    if (kind === 'last_12') { const start = new Date(Date.UTC(year, Number(today.slice(5, 7)) - 12, 1)); setFrom(start.toISOString().slice(0, 7)); setTo(today.slice(0, 7)); }
  };
  const titles = useMemo(() => [...new Set(donors.map(donor => String(donor.title || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, ['he', 'en'])), [donors]);
  const tags = useMemo(() => [...new Set((payments || []).flatMap(item => String(item.pledgeTags || '').split(',').map(part => part.trim())).filter(Boolean))].sort((a, b) => a.localeCompare(b, ['he', 'en'])), [payments]);
  const years = useMemo(() => [...new Set([today.slice(0, 4), ...pledges.map(item => String(item.campaignYear || item.year || ''))].filter(year => /^\d{4}$/.test(year)))].sort().reverse(), [pledges, today]);
  const donorById = useMemo(() => new Map(donors.map(donor => [String(donor.id), donor])), [donors]);
  const summaries = useMemo(() => pledgeSummaries(pledges, pledgeYear), [pledges, pledgeYear]);
  // A pledge tag counts only the payments made on pledges with that tag.
  const tagged = useMemo(() => !payments || !tag ? payments : payments.filter(item => { const list = String(item.pledgeTags || '').split(',').map(part => part.trim()).filter(Boolean); return tag === '(none)' ? !list.length : list.includes(tag); }), [payments, tag]);
  const chosenExtras = useMemo(() => DONOR_COLUMNS.filter(column => extras.includes(column.key)), [extras]);
  // Adds this year's pledge and the chosen donor columns to each row.
  const dress = (result: ReturnType<typeof buildMonthlyGiving>) => { for (const row of result.rows) { row.pledge = summaries.get(row.donorId); const donor = donorById.get(row.donorId) || {}; row.extra = Object.fromEntries(DONOR_COLUMNS.map(column => [column.key, donor[column.key] ?? ''])); } return result; };
  const report = useMemo(() => tagged && from && to && from <= to ? dress(buildMonthlyGiving(tagged, donors, from, to, { onlyGivers: tag ? true : onlyGivers, sort, includeDonorIds: showPledge && !tag ? summaries.keys() : [] })) : null, [tagged, donors, from, to, onlyGivers, sort, tag, summaries, showPledge, donorById]);
  const shown = useMemo(() => { const text = search.trim().toLowerCase(); return report ? report.rows.filter(row => (!title || (title === '(none)' ? !row.title : row.title === title)) && (!text || `${row.donor} ${row.hebrewName} ${row.firstName} ${row.lastName} ${row.hebFirstName} ${row.hebLastName} ${row.title} ${row.donorNumber} ${row.phone} ${Object.values(row.extra || {}).join(' ')}`.toLowerCase().includes(text))) : []; }, [report, search, title]);
  const everyone = !!report && shown.length === report.rows.length;
  const shownTotal = useMemo(() => Math.round(shown.reduce((sum, row) => sum + row.total, 0) * 100) / 100, [shown]);
  const monthTotal = (month: string) => Math.round(shown.reduce((sum, row) => sum + (row.months[month]?.amount || 0), 0) * 100) / 100;
  const pledgeTotal = (key: keyof NonNullable<MonthlyRow['pledge']>) => Math.round(shown.reduce((sum, row) => sum + (row.pledge ? row.pledge[key] : 0), 0) * 100) / 100;
  const toggleExtra = (key: string) => setExtras(current => current.includes(key) ? current.filter(item => item !== key) : DONOR_COLUMNS.map(column => column.key).filter(item => item === key || current.includes(item)));
  const showValue = (column: ExtraColumn, value: any) => column.type === 'money' ? (value === '' || value == null ? '' : money(Number(value))) : String(value ?? '');
  const exportExcel = () => {
    if (!report) return; const heading = `Monthly giving by donor${tag ? ` — pledge tag: ${tag === '(none)' ? 'no tag' : tag}` : ''}${title ? ` — title: ${title === '(none)' ? 'none' : title}` : ''} — ${monthLabel(from)} to ${monthLabel(to)}${showPledge ? ` — pledges ${pledgeYear}` : ''} (made ${today})`;
    // When a search or tag is chosen, the Excel totals count only the donors shown.
    const ids = new Set(shown.map(row => row.donorId));
    const result = everyone ? report : dress(buildMonthlyGiving((tagged || []).filter(item => ids.has(String(item.donorId || ''))), donors.filter(item => ids.has(String(item.id))), from, to, { onlyGivers, sort, includeDonorIds: [...ids] }));
    downloadExcel(`Monthly giving by donor ${from} to ${to}`, [monthlyGivingSheet(result, heading, { extras: chosenExtras, pledgeYear: showPledge ? pledgeYear : undefined })]);
  };
  const sortHead = (label: string, key: MonthlySort) => <span onClick={() => setSort(key)} style={{ cursor: 'pointer' }}>{label}{sort === key ? ' ▲' : ''}</span>;
  return <section style={{ display: 'grid', gap: 10 }}>
    <div className="card" style={{ display: 'grid', gap: 12 }}>
      <div><h2 style={{ margin: 0, color: 'var(--navy)' }}>Monthly giving by donor</h2><p style={{ margin: '4px 0 0', color: 'var(--text-muted)' }}>Every donor in a row: his pledge for the year (pledged, paid, left, scheduled), then each month how much he gave and how. Approved payments only, in CAD.</p></div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end' }}>
        <label className="form-group" style={{ margin: 0 }}><span>From month</span><input type="month" value={from} onChange={event => setFrom(event.target.value)} /></label>
        <label className="form-group" style={{ margin: 0 }}><span>To month</span><input type="month" value={to} onChange={event => setTo(event.target.value)} /></label>
        <div style={{ display: 'flex', gap: 6 }}><button type="button" className="btn btn-secondary btn-sm" onClick={() => quick('this_year')}>This year</button><button type="button" className="btn btn-secondary btn-sm" onClick={() => quick('last_year')}>Last year</button><button type="button" className="btn btn-secondary btn-sm" onClick={() => quick('last_12')}>Last 12 months</button></div>
        <label className="form-group" style={{ margin: 0 }}><span>Pledge year</span><select value={pledgeYear} onChange={event => setPledgeYear(event.target.value)}>{years.map(year => <option key={year} value={year}>{year}</option>)}</select></label>
        <label className="form-group" style={{ margin: 0 }}><span>Which donors</span><select value={onlyGivers ? 'givers' : 'all'} onChange={event => setOnlyGivers(event.target.value === 'givers')}><option value="givers">Donors who gave or have a pledge this year</option><option value="all">All donors (also those who gave nothing)</option></select></label>
        <label className="form-group" style={{ margin: 0 }}><span>Order</span><select value={sort} onChange={event => setSort(event.target.value as MonthlySort)}><option value="last">Last name (A–Z)</option><option value="first">First name (A–Z)</option><option value="hebLast">Hebrew last name (א–ת)</option><option value="hebFirst">Hebrew first name (א–ת)</option><option value="title">Title (מו"ץ, משב"ק …)</option><option value="total">Biggest givers first</option></select></label>
        <label className="form-group" style={{ margin: 0 }}><span>Pledge tag</span><select value={tag} onChange={event => setTag(event.target.value)}><option value="">All payments</option><option value="(none)">Payments on pledges with no tag</option>{tags.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
        <label className="form-group" style={{ margin: 0 }}><span>Title</span><select value={title} onChange={event => setTitle(event.target.value)}><option value="">All donors</option><option value="(none)">Donors with no title</option>{titles.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
        <label className="form-group" style={{ margin: 0, minWidth: 160 }}><span>Search</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Name, phone, tag …" /></label>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="btn btn-primary btn-sm" disabled={!report} onClick={exportExcel}><FileSpreadsheet size={15} /> Export to Excel</button>
        <div ref={pickerRef} style={{ position: 'relative' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPicking(value => !value)} title="Add or remove columns"><Columns3 size={15} /> Columns ({chosenExtras.length + (showPledge ? PLEDGE_COLUMNS.length : 0)})</button>
          {picking && <div className="card" style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 60, width: 270, maxHeight: 420, overflow: 'auto', padding: 10, display: 'grid', gap: 4, boxShadow: '0 12px 30px rgba(15,23,42,.18)' }}>
            <strong style={{ fontSize: 13 }}>Pledge for the year</strong>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}><input type="checkbox" checked={showPledge} onChange={() => setShowPledge(value => !value)} />Pledged, Paid, Left, Scheduled</label>
            <strong style={{ fontSize: 13, marginTop: 6 }}>Donor columns</strong>
            {DONOR_COLUMNS.map(column => <label key={column.key} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}><input type="checkbox" checked={extras.includes(column.key)} onChange={() => toggleExtra(column.key)} />{column.label}</label>)}
            <button type="button" className="reset-link" onClick={() => { setExtras(DEFAULT_EXTRAS); setShowPledge(true); }}>Back to the usual columns</button>
          </div>}
        </div>
        <button type="button" className="btn btn-secondary btn-sm" disabled={loading} onClick={() => void load()}><RefreshCw size={15} /> Refresh</button>
        {report && <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>{shown.length.toLocaleString()} donors · {report.months.length} months · Total given {money(shownTotal)} · Click a name heading to sort by it</span>}
        {from > to && <span style={{ color: 'var(--red)' }}>"From" must be before "To".</span>}
      </div>
    </div>
    {error && <div className="card" style={{ color: 'var(--red)' }}>{error}</div>}
    <div className="card" style={{ minWidth: 0, padding: 0 }}>
      {loading && !payments ? <div style={{ padding: 24, textAlign: 'center' }}>Loading…</div> : report && <div style={{ maxHeight: '70vh', overflow: 'auto', borderRadius: 'var(--r-lg)' }}>
        <table style={{ width: 'max-content', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed', fontVariantNumeric: 'tabular-nums' }}>
          <thead><tr>
            {NAME_COLUMNS.map((column, index) => <th key={column.key} style={{ ...head, ...stick(index, { zIndex: 3, background: 'var(--surface-2)' }) }}>{sortHead(column.label, column.sort)}</th>)}
            {chosenExtras.map(column => <th key={column.key} style={{ ...head, ...sized(W.extra), textAlign: column.type ? 'right' : 'left' }} title={column.label}>{column.key === 'title' ? sortHead('Title', 'title') : column.label}</th>)}
            {showPledge && PLEDGE_COLUMNS.map(column => <th key={column.key} style={{ ...head, ...sized(W.money), textAlign: 'right', background: 'var(--info-soft)', color: 'var(--info-ink)', lineHeight: 1.1, paddingTop: 2, paddingBottom: 2 }}><div style={{ fontSize: 10, fontWeight: 600, opacity: .8 }}>Pledge {pledgeYear}</div>{column.label}</th>)}
            {report.months.map(month => <th key={month} style={{ ...head, ...sized(W.month), textAlign: 'center' }}>{monthLabel(month)}</th>)}
            <th style={{ ...head, ...sized(W.total), textAlign: 'right' }}>{sortHead('Total given', 'total')}</th>
          </tr></thead>
          <tbody>{shown.slice(0, 400).map((row, rowIndex) => { const bg = rowIndex % 2 ? shade : 'var(--surface-1)'; return <tr key={row.donorId}>
            {NAME_COLUMNS.map((column, index) => <td key={column.key} dir="auto" title={String(row[column.key] || '')} style={{ ...box, ...stick(index, { background: bg, fontWeight: index === 1 || index === 3 ? 700 : 500 }) }}>{String(row[column.key] || '')}</td>)}
            {chosenExtras.map(column => { const value = showValue(column, row.extra?.[column.key]); return <td key={column.key} dir="auto" title={value} style={{ ...box, ...sized(W.extra), background: bg, textAlign: column.type ? 'right' : 'left', color: 'var(--text-secondary)' }}>{value}</td>; })}
            {showPledge && PLEDGE_COLUMNS.map(column => { const value = row.pledge ? row.pledge[column.key] : null; return <td key={column.key} style={{ ...box, ...sized(W.money), background: bg, textAlign: 'right', fontWeight: column.key === 'left' ? 700 : 500, color: column.key === 'left' && value && value > 0.005 ? 'var(--danger)' : column.key === 'left' && value != null ? 'var(--success)' : undefined }}>{value == null ? '' : money(value)}</td>; })}
            {report.months.map(month => { const cell = row.months[month]; return <td key={month} title={cell ? `${money(cell.amount)} — ${cell.how}` : ''} style={{ ...box, ...sized(W.month), background: bg, textAlign: 'center', padding: '3px 6px', lineHeight: 1.15 }}>{cell && <><div style={{ fontWeight: 700 }}>{money(cell.amount)}</div><div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cell.how}</div></>}</td>; })}
            <td style={{ ...box, ...sized(W.total), background: bg, textAlign: 'right', fontWeight: 700 }}>{money(row.total)}</td>
          </tr>; })}</tbody>
          <tfoot><tr>
            {NAME_COLUMNS.map((column, index) => <td key={column.key} style={{ ...box, ...stick(index, { background: 'var(--surface-3)', fontWeight: 700, position: 'sticky', bottom: 0, zIndex: 3 }) }}>{index === 0 ? 'Total' : ''}</td>)}
            {chosenExtras.map(column => <td key={column.key} style={{ ...box, ...sized(W.extra), background: 'var(--surface-3)', position: 'sticky', bottom: 0 }} />)}
            {showPledge && PLEDGE_COLUMNS.map(column => <td key={column.key} style={{ ...box, ...sized(W.money), background: 'var(--surface-3)', position: 'sticky', bottom: 0, textAlign: 'right', fontWeight: 700 }}>{money(pledgeTotal(column.key))}</td>)}
            {report.months.map(month => <td key={month} title={everyone ? report.totals[month].how : ''} style={{ ...box, ...sized(W.month), background: 'var(--surface-3)', position: 'sticky', bottom: 0, textAlign: 'center', fontWeight: 700 }}>{money(everyone ? report.totals[month].amount : monthTotal(month))}</td>)}
            <td style={{ ...box, ...sized(W.total), background: 'var(--surface-3)', position: 'sticky', bottom: 0, textAlign: 'right', fontWeight: 700 }}>{money(shownTotal)}</td>
          </tr></tfoot>
        </table>
        {shown.length > 400 && <div style={{ padding: 10, color: 'var(--text-muted)', textAlign: 'center' }}>Showing the first 400 donors here. The Excel file has all {shown.length.toLocaleString()}.</div>}
      </div>}
    </div>
  </section>;
};
