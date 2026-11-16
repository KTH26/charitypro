import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileSpreadsheet, X } from 'lucide-react';
import { downloadExcel } from '../utils/excel';
import { RANGES, defaultSetup, runReport, sourceByKey, type ReportFilter } from '../utils/reportSources';
import { fetchReportRows, reportSheets } from '../utils/reportExport';

/** Which lists each page can export. A page with several kinds (Transactions) gets one Excel sheet per kind. */
const PAGES: Record<string, { title: string; parts: { source: string; name?: string; filters?: ReportFilter[] }[] }> = {
  '/payments': { title: 'Payments', parts: [{ source: 'payments' }] },
  '/pending-payments': { title: 'Pending payments', parts: [{ source: 'payments', filters: [{ column: 'status', op: 'is', value: 'Pending' }] }] },
  '/pledges': { title: 'Pledges', parts: [{ source: 'pledges' }] },
  '/receipts': { title: 'Official receipts', parts: [{ source: 'receipts' }] },
  '/schedules': { title: 'Schedules', parts: [{ source: 'schedules' }, { source: 'expected', name: 'Expected payments' }] },
  '/donors': { title: 'Donors', parts: [{ source: 'donors' }] },
  '/campaigns': { title: 'Campaigns', parts: [{ source: 'campaigns' }] },
  '/vendors': { title: 'Vendors', parts: [{ source: 'vendors' }] },
  '/expenses': { title: 'Bills and expenses', parts: [{ source: 'bills' }] },
  '/write-checks': { title: 'Unpaid bills', parts: [{ source: 'bills', filters: [{ column: 'status', op: 'is', value: 'Unpaid' }] }] },
  '/transactions': { title: 'Transactions', parts: [{ source: 'payments', name: 'Payments' }, { source: 'bills', name: 'Bills' }, { source: 'transfers', name: 'Transfers' }] },
  '/chart-of-accounts': { title: 'Chart of accounts', parts: [{ source: 'accounts' }] },
  '/bank-feed': { title: 'Bank feed', parts: [{ source: 'bank' }] },
  '/reconciliation': { title: 'Bank lines', parts: [{ source: 'bank' }] },
  '/payroll': { title: 'Payroll', parts: [{ source: 'employees', name: 'Employees' }, { source: 'bills', name: 'Payroll bills', filters: [{ column: 'payroll', op: 'is', value: 'Yes' }] }] },
  '/tasks': { title: 'Tasks', parts: [{ source: 'tasks' }] },
  '/reminders': { title: 'Tasks and reminders', parts: [{ source: 'tasks' }] },
};

export const PageExportButton: React.FC<{ path: string }> = ({ path }) => {
  const page = PAGES[path]; const [open, setOpen] = useState(false); const [range, setRange] = useState('all');
  const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  if (!page) return null;
  const hasDates = page.parts.some(part => sourceByKey(part.source).dateField);
  const run = async () => {
    setBusy(true); setError('');
    try {
      const sheets = []; let today = '';
      for (const part of page.parts) {
        const result = await fetchReportRows(part.source); today = result.today;
        const source = sourceByKey(part.source);
        const setup = { ...defaultSetup(part.source), columns: source.columns.map(column => column.key), filters: part.filters || [], range, from, to };
        const filtered = runReport(result.rows, setup, today);
        sheets.push(...reportSheets(setup, filtered, today, part.name || page.title).map(sheet => ({ ...sheet, name: part.name || page.title })));
      }
      downloadExcel(`${page.title} ${today}`, sheets); setOpen(false);
    } catch (reason: any) { setError(reason.message || 'Could not export.'); }
    finally { setBusy(false); }
  };
  return <div style={{ position: 'relative' }}>
    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(value => !value)} title="Export this list to Excel"><FileSpreadsheet size={15} /> <span className="export-label">Export to Excel</span></button>
    {open && <div className="card" style={{ position: 'absolute', right: 0, top: '115%', zIndex: 60, width: 290, padding: 14, display: 'grid', gap: 10, boxShadow: '0 10px 30px rgba(0,0,0,.18)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><strong style={{ color: 'var(--navy)' }}>Export {page.title}</strong><button type="button" className="btn btn-secondary btn-sm" style={{ padding: 4 }} onClick={() => setOpen(false)} aria-label="Close"><X size={14} /></button></div>
      {hasDates && <label className="form-group" style={{ margin: 0 }}><span>Dates</span><select value={range} onChange={event => setRange(event.target.value)}>{RANGES.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>}
      {hasDates && range === 'custom' && <div style={{ display: 'flex', gap: 8 }}><input type="date" value={from} onChange={event => setFrom(event.target.value)} /><input type="date" value={to} onChange={event => setTo(event.target.value)} /></div>}
      <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void run()}>{busy ? 'Making the file…' : 'Download Excel file'}</button>
      {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
      <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Need only some rows, or totals by month/donor? Use <Link to="/reports" onClick={() => setOpen(false)}>Reports</Link>.</div>
    </div>}
  </div>;
};
