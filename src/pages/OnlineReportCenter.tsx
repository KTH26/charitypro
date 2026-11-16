import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, ChevronDown, ChevronRight, Download, FileSpreadsheet, Plus, RefreshCw, Save, Star, Trash2, X } from 'lucide-react';
import { OnlineReports } from './OnlineReports';
import { MonthlyDonorReport } from './MonthlyDonorReport';
import { downloadExcel } from '../utils/excel';
import { fetchReportRows, reportSheets, torontoToday } from '../utils/reportExport';
import { PRESETS, RANGES, REPORT_SOURCES, defaultSetup, groupRows, presetSetup, runReport, sourceByKey, totalsOf, type Operator, type ReportSetup } from '../utils/reportSources';

const money = (value: unknown) => Number(value || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const OPS: [Operator, string][] = [['contains', 'contains'], ['is', 'is'], ['is_not', 'is not'], ['more', 'more than'], ['less', 'less than'], ['empty', 'is empty'], ['not_empty', 'is not empty']];
const SHOW_LIMIT = 500;
export const OnlineReportCenter: React.FC = () => {
  const [view, setView] = useState<'builder' | 'monthly' | 'classic'>('builder');
  return <div>
    <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
      {([['builder', 'Report builder'], ['monthly', 'Monthly giving by donor'], ['classic', 'Classic reports']] as const).map(([key, label]) => <button key={key} type="button" className={`btn btn-sm ${view === key ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView(key)}>{label}</button>)}
    </div>
    {view === 'builder' ? <ReportBuilder onMonthly={() => setView('monthly')} /> : view === 'monthly' ? <MonthlyDonorReport /> : <OnlineReports />}
  </div>;
};

const ReportBuilder: React.FC<{ onMonthly: () => void }> = ({ onMonthly }) => {
  const [setup, setSetup] = useState<ReportSetup>(() => presetSetup(PRESETS[0].items[0]));
  const [cache, setCache] = useState<Record<string, { rows: Record<string, any>[]; today: string }>>({});
  const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [saved, setSaved] = useState<ReportSetup[]>([]); const [open, setOpen] = useState<Record<string, boolean>>({ Donations: true, 'My saved reports': true });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({}); const [limit, setLimit] = useState(SHOW_LIMIT);
  const source = sourceByKey(setup.source);
  const load = useCallback(async (key: string, force = false) => {
    if (!force && cache[key]) return;
    setLoading(true); setError('');
    try { const result = await fetchReportRows(key); setCache(current => ({ ...current, [key]: result })); }
    catch (reason: any) { setError(reason.message || 'Could not load the report.'); }
    finally { setLoading(false); }
  }, [cache]);
  useEffect(() => { void load(setup.source); }, [setup.source, load]);
  useEffect(() => { void fetch('/api/v3/saved-reports').then(r => r.json()).then(data => { if (data.success) setSaved(data.reports || []); }).catch(() => undefined); }, []);
  useEffect(() => { setLimit(SHOW_LIMIT); setExpanded({}); }, [setup]);
  const update = (patch: Partial<ReportSetup>) => setSetup(current => ({ ...current, ...patch }));
  const changeSource = (key: string) => setSetup({ ...defaultSetup(key), name: '' });
  const data = cache[setup.source]; const today = data?.today || torontoToday();
  const rows = useMemo(() => data ? runReport(data.rows, setup, today) : [], [data, setup, today]);
  const groups = useMemo(() => setup.groupBy ? groupRows(rows, setup) : [], [rows, setup]);
  const totals = useMemo(() => totalsOf(rows, setup), [rows, setup]);
  const columns = setup.columns.map(key => source.columns.find(column => column.key === key)).filter(Boolean) as typeof source.columns;
  const numeric = columns.filter(column => column.type === 'money' || column.type === 'number');
  const headline = numeric.find(column => /CAD$/.test(column.key)) || numeric.find(column => column.type === 'money') || numeric[0];
  const title = setup.name || source.label;
  const persist = async (next: ReportSetup[]) => {
    const response = await fetch('/api/v3/saved-reports', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ reports: next }) });
    const result = await response.json().catch(() => ({})); if (!response.ok || !result.success) throw new Error(result.error || 'Could not save.');
    setSaved(result.reports || next);
  };
  const saveReport = async () => {
    const name = window.prompt('Name for this report:', setup.name || source.label); if (!name?.trim()) return;
    try { await persist([...saved.filter(item => item.name !== name.trim()), { ...setup, name: name.trim() }]); update({ name: name.trim() }); setNotice(`Saved "${name.trim()}".`); }
    catch (reason: any) { setError(reason.message); }
  };
  const removeSaved = async (name: string) => { if (!window.confirm(`Remove the saved report "${name}"?`)) return; try { await persist(saved.filter(item => item.name !== name)); } catch (reason: any) { setError(reason.message); } };
  const exportExcel = () => downloadExcel(`${title} ${today}`, reportSheets(setup, rows, today, title));
  const sortBy = (key: string) => update(setup.sortBy === key ? { sortDesc: !setup.sortDesc } : { sortBy: key, sortDesc: true });
  const label = (key: string) => source.columns.find(column => column.key === key)?.label || key;
  const cellText = (column: { type: string }, value: unknown) => column.type === 'money' ? (value === '' || value === undefined ? '' : `$${money(value)}`) : String(value ?? '');
  const groupsWithSaved: { group: string; items: { title: string; description: string; setup: ReportSetup; saved?: boolean }[] }[] = [
    ...(saved.length ? [{ group: 'My saved reports', items: saved.map(item => ({ title: item.name || 'Report', description: sourceByKey(item.source).label, setup: item, saved: true })) }] : []),
    ...PRESETS.map(group => ({ group: group.group, items: group.items.map(item => ({ title: item.title, description: item.description, setup: presetSetup(item) })) })),
  ];

  return <div className="report-center" style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 270px) minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
    <aside className="card" style={{ padding: 12, maxHeight: 'calc(100vh - 140px)', overflowY: 'auto', position: 'sticky', top: 12 }}>
      <h3 style={{ margin: '4px 6px 10px', color: 'var(--navy)', fontSize: 15 }}><BarChart3 size={16} /> Ready-made reports</h3>
      {groupsWithSaved.map(group => <div key={group.group} style={{ marginBottom: 6 }}>
        <button type="button" onClick={() => setOpen(current => ({ ...current, [group.group]: !current[group.group] }))} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 800, fontSize: 13, color: 'var(--text-secondary)', padding: '6px' }}>
          {open[group.group] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{group.group === 'My saved reports' && <Star size={13} />} {group.group}
        </button>
        {open[group.group] && group.group === 'Donations' && <button type="button" onClick={onMonthly} style={{ all: 'unset', cursor: 'pointer', display: 'block', padding: '6px 8px 6px 24px', fontSize: 13.5, fontWeight: 700, color: 'var(--navy)' }}>Monthly giving by donor ★</button>}
        {open[group.group] && group.items.map(item => <div key={item.title} style={{ display: 'flex', alignItems: 'center' }}>
          <button type="button" onClick={() => setSetup({ ...item.setup })} title={item.description} style={{ all: 'unset', cursor: 'pointer', flex: 1, padding: '6px 8px 6px 24px', borderRadius: 8, fontSize: 13.5, background: setup.name === item.title ? 'var(--bg-input)' : undefined, fontWeight: setup.name === item.title ? 700 : 500, color: 'var(--navy)' }}>{item.title}</button>
          {item.saved && <button type="button" className="btn btn-secondary btn-sm" style={{ padding: 4 }} title="Remove" onClick={() => void removeSaved(item.title)}><Trash2 size={13} /></button>}
        </div>)}
      </div>)}
    </aside>

    <section style={{ display: 'grid', gap: 14, minWidth: 0 }}>
      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end' }}>
          <label className="form-group" style={{ margin: 0, minWidth: 220 }}><span>Report on</span>
            <select value={setup.source} onChange={event => changeSource(event.target.value)}>
              {[...new Set(REPORT_SOURCES.map(item => item.group))].map(group => <optgroup key={group} label={group}>{REPORT_SOURCES.filter(item => item.group === group).map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</optgroup>)}
            </select></label>
          {source.dateField && <label className="form-group" style={{ margin: 0 }}><span>Dates ({label(source.dateField)})</span>
            <select value={setup.range} onChange={event => update({ range: event.target.value })}>{RANGES.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>}
          {source.dateField && setup.range === 'custom' && <>
            <label className="form-group" style={{ margin: 0 }}><span>From</span><input type="date" value={setup.from} onChange={event => update({ from: event.target.value })} /></label>
            <label className="form-group" style={{ margin: 0 }}><span>To</span><input type="date" value={setup.to} onChange={event => update({ to: event.target.value })} /></label>
          </>}
          <label className="form-group" style={{ margin: 0, flex: 1, minWidth: 160 }}><span>Search</span><input value={setup.search} onChange={event => update({ search: event.target.value })} placeholder="Name, number, note…" /></label>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          {setup.filters.map((filter, index) => <div key={index} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', width: 40 }}>{index === 0 ? 'Only' : 'and'}</span>
            <select value={filter.column} style={{ width: 'auto', flex: '0 1 auto', minWidth: 140 }} onChange={event => update({ filters: setup.filters.map((item, i) => i === index ? { ...item, column: event.target.value } : item) })}>{source.columns.map(column => <option key={column.key} value={column.key}>{column.label}</option>)}</select>
            <select value={filter.op} style={{ width: 'auto', flex: '0 1 auto', minWidth: 140 }} onChange={event => update({ filters: setup.filters.map((item, i) => i === index ? { ...item, op: event.target.value as Operator } : item) })}>{OPS.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select>
            {filter.op !== 'empty' && filter.op !== 'not_empty' && <ValueInput value={filter.value} options={data ? [...new Set(data.rows.map(row => String(row[filter.column] ?? '')).filter(Boolean))].slice(0, 400) : []} onChange={value => update({ filters: setup.filters.map((item, i) => i === index ? { ...item, value } : item) })} />}
            <button type="button" className="btn btn-secondary btn-sm" title="Remove this filter" onClick={() => update({ filters: setup.filters.filter((_, i) => i !== index) })}><X size={14} /></button>
          </div>)}
          <div><button type="button" className="btn btn-secondary btn-sm" onClick={() => update({ filters: [...setup.filters, { column: source.columns[0].key, op: 'contains', value: '' }] })}><Plus size={14} /> Add a filter</button></div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end' }}>
          <label className="form-group" style={{ margin: 0 }}><span>Group totals by</span>
            <select value={setup.groupBy} onChange={event => update({ groupBy: event.target.value, groupBy2: event.target.value ? setup.groupBy2 : '' })}><option value="">No grouping (list every row)</option>{source.columns.filter(column => column.type !== 'money' && column.type !== 'number').map(column => <option key={column.key} value={column.key}>{column.label}</option>)}</select></label>
          {setup.groupBy && <label className="form-group" style={{ margin: 0 }}><span>Then by</span>
            <select value={setup.groupBy2} onChange={event => update({ groupBy2: event.target.value })}><option value="">—</option>{source.columns.filter(column => column.type !== 'money' && column.type !== 'number' && column.key !== setup.groupBy).map(column => <option key={column.key} value={column.key}>{column.label}</option>)}</select></label>}
          <label className="form-group" style={{ margin: 0 }}><span>Sort by</span>
            <select value={setup.sortBy} onChange={event => update({ sortBy: event.target.value })}><option value="">{setup.groupBy ? 'Group name' : 'As loaded'}</option>{source.columns.map(column => <option key={column.key} value={column.key}>{column.label}</option>)}</select></label>
          <label className="form-group" style={{ margin: 0 }}><span>Order</span>
            <select value={setup.sortDesc ? 'desc' : 'asc'} onChange={event => update({ sortDesc: event.target.value === 'desc' })}><option value="desc">Biggest / newest first</option><option value="asc">Smallest / oldest first</option></select></label>
          <ColumnPicker all={source.columns} chosen={setup.columns} onChange={value => update({ columns: value })} />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={exportExcel} disabled={!data}><FileSpreadsheet size={15} /> Export to Excel</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void saveReport()}><Save size={15} /> Save this report</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load(setup.source, true)} disabled={loading}><RefreshCw size={15} /> Refresh</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSetup({ ...defaultSetup(setup.source), name: '' })}>Clear</button>
          {notice && <span style={{ color: 'var(--green)', fontWeight: 700, fontSize: 13 }}>{notice}</span>}
        </div>
      </div>

      {error && <div className="card" style={{ color: 'var(--red)' }}>{error}</div>}

      <div className="card" style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline', marginBottom: 12 }}>
          <h2 style={{ margin: 0, color: 'var(--navy)' }}>{title}</h2>
          <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>{loading && !data ? 'Loading…' : `${rows.length.toLocaleString()} row${rows.length === 1 ? '' : 's'}${setup.groupBy ? ` in ${groups.length.toLocaleString()} group${groups.length === 1 ? '' : 's'}` : ''}`}{headline ? ` · Total ${headline.label}: ${headline.type === 'money' ? '$' + money(totals[headline.key]) : totals[headline.key]}` : ''}</span>
        </div>
        {loading && !data ? <div style={{ padding: 40, textAlign: 'center' }}>Loading report…</div> : <div className="table-container">
          {setup.groupBy ? <table>
            <thead><tr><th>{label(setup.groupBy)}</th>{setup.groupBy2 && <th>{label(setup.groupBy2)}</th>}<th style={{ textAlign: 'right' }}>Count</th>{numeric.map(column => <th key={column.key} style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => sortBy(column.key)}>{column.label}{setup.sortBy === column.key ? (setup.sortDesc ? ' ▼' : ' ▲') : ''}</th>)}</tr></thead>
            <tbody>{groups.length ? groups.flatMap(group => { const id = `${group.key}|${group.key2 ?? ''}`; return [
              <tr key={id} onClick={() => setExpanded(current => ({ ...current, [id]: !current[id] }))} style={{ cursor: 'pointer' }}><td><strong>{expanded[id] ? '▾ ' : '▸ '}{group.key}</strong></td>{setup.groupBy2 && <td>{group.key2}</td>}<td style={{ textAlign: 'right' }}>{group.count}</td>{numeric.map(column => <td key={column.key} style={{ textAlign: 'right', fontWeight: 700 }}>{column.type === 'money' ? `$${money(group.sums[column.key])}` : Math.round(group.sums[column.key] * 100) / 100}</td>)}</tr>,
              ...(expanded[id] ? [<tr key={`${id}-rows`}><td colSpan={2 + (setup.groupBy2 ? 1 : 0) + numeric.length} style={{ background: 'var(--bg-input)', padding: 8 }}><DetailTable columns={columns} rows={group.rows.slice(0, SHOW_LIMIT)} cellText={cellText} /></td></tr>] : []),
            ]; }) : <tr><td colSpan={9} style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>Nothing matches.</td></tr>}</tbody>
            {groups.length > 0 && <tfoot><tr style={{ fontWeight: 800, borderTop: '2px solid var(--border)' }}><td>Total</td>{setup.groupBy2 && <td />}<td style={{ textAlign: 'right' }}>{rows.length}</td>{numeric.map(column => <td key={column.key} style={{ textAlign: 'right' }}>{column.type === 'money' ? `$${money(totals[column.key])}` : totals[column.key]}</td>)}</tr></tfoot>}
          </table> : <>
            <DetailTable columns={columns} rows={rows.slice(0, limit)} cellText={cellText} sortKey={setup.sortBy} sortDesc={setup.sortDesc} onSort={sortBy} totals={rows.length ? totals : undefined} />
            {rows.length > limit && <div style={{ textAlign: 'center', padding: 12 }}><span style={{ color: 'var(--text-muted)', marginRight: 10 }}>Showing {limit.toLocaleString()} of {rows.length.toLocaleString()} (Excel gets all of them)</span><button type="button" className="btn btn-secondary btn-sm" onClick={() => setLimit(value => value + SHOW_LIMIT)}>Show more</button></div>}
          </>}
        </div>}
      </div>
    </section>
  </div>;
};

const DetailTable: React.FC<{ columns: { key: string; label: string; type: string }[]; rows: Record<string, any>[]; cellText: (column: { type: string }, value: unknown) => string; sortKey?: string; sortDesc?: boolean; onSort?: (key: string) => void; totals?: Record<string, number> }> = ({ columns, rows, cellText, sortKey, sortDesc, onSort, totals }) => <table>
  <thead><tr>{columns.map(column => <th key={column.key} onClick={() => onSort?.(column.key)} style={{ cursor: onSort ? 'pointer' : undefined, textAlign: column.type === 'money' || column.type === 'number' ? 'right' : undefined, whiteSpace: 'nowrap' }}>{column.label}{sortKey === column.key ? (sortDesc ? ' ▼' : ' ▲') : ''}</th>)}</tr></thead>
  <tbody>{rows.length ? rows.map((row, index) => <tr key={String(row.id ?? index)}>{columns.map(column => <td key={column.key} dir="auto" style={{ textAlign: column.type === 'money' || column.type === 'number' ? 'right' : undefined, whiteSpace: column.type === 'date' || column.type === 'money' ? 'nowrap' : undefined }}>{cellText(column, row[column.key])}</td>)}</tr>) : <tr><td colSpan={columns.length || 1} style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>Nothing matches.</td></tr>}</tbody>
  {totals && <tfoot><tr style={{ fontWeight: 800 }}>{columns.map((column, index) => <td key={column.key} style={{ textAlign: column.type === 'money' || column.type === 'number' ? 'right' : undefined, whiteSpace: 'nowrap' }}>{column.type === 'money' ? `$${money(totals[column.key])}` : column.type === 'number' ? totals[column.key] : index === 0 ? 'Total' : ''}</td>)}</tr></tfoot>}
</table>;

const ValueInput: React.FC<{ value: string; options: string[]; onChange: (value: string) => void }> = ({ value, options, onChange }) => {
  const id = useMemo(() => `opts-${Math.random().toString(36).slice(2)}`, []);
  return <><input list={id} value={value} onChange={event => onChange(event.target.value)} placeholder="value" style={{ minWidth: 160 }} /><datalist id={id}>{options.map(option => <option key={option} value={option} />)}</datalist></>;
};

const ColumnPicker: React.FC<{ all: { key: string; label: string }[]; chosen: string[]; onChange: (value: string[]) => void }> = ({ all, chosen, onChange }) => {
  const [open, setOpen] = useState(false);
  return <div style={{ position: 'relative' }}>
    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(value => !value)}><Download size={14} style={{ transform: 'rotate(-90deg)' }} /> Columns ({chosen.length})</button>
    {open && <div className="card" style={{ position: 'absolute', zIndex: 30, top: '110%', right: 0, width: 260, maxHeight: 360, overflowY: 'auto', padding: 10, boxShadow: 'var(--shadow-lg, 0 8px 30px rgba(0,0,0,.18))' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange(all.map(column => column.key))}>All</button><button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>Done</button></div>
      {all.map(column => <label key={column.key} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '3px 2px', fontSize: 14, cursor: 'pointer' }}><input type="checkbox" checked={chosen.includes(column.key)} onChange={event => onChange(event.target.checked ? all.map(item => item.key).filter(key => key === column.key || chosen.includes(key)) : chosen.filter(key => key !== column.key))} />{column.label}</label>)}
    </div>}
  </div>;
};
