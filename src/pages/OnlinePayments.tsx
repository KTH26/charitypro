import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Columns3, Save, Trash2 } from 'lucide-react';
import { startLiveRefresh } from '../utils/liveUpdates';
import { OnlinePaymentForm } from '../components/OnlinePaymentForm';
import { CloudPaymentDetailsModal } from '../components/CloudPaymentDetailsModal';
import { ColumnTh, ColumnFilterChips, useListColumns, type ColumnKind } from '../components/ColumnTh';
import { ListFooter, ListToolbar, NewButton, ResetLink, RowMenu } from '../components/ListLayout';
import { OnlinePendingPayments } from './OnlinePendingPayments';
import { OnlineSchedules } from './OnlineSchedules';

type OnlinePayment = {
  id: string;
  donorId: string;
  donorName: string;
  amount: number;
  amountCAD?: number;
  date: string;
  method: string;
  currency: 'CAD' | 'USD';
  type: 'approved' | 'pending' | 'declined';
  notes?: string;
  sourceName?: string;
  offsetName?: string;
  [key: string]: any;
};

type PaymentResponse = { success: boolean; items: OnlinePayment[]; page: number; total: number; totalPages: number; totalCAD: number; error?: string };

const methodLabel: Record<string, string> = {
  credit_card: 'Credit Card', check: 'Check', cash: 'Cash', e_transfer: 'E-Transfer', wire: 'Wire',
  vouchers: 'Vouchers', eizer: 'Eizer', bnei_leivy: 'Bnei Leivy', other: 'Other'
};
const statusLabel: Record<string, string> = { approved: 'Received', pending: 'Pending', declined: 'Declined' };
const money = (value: unknown) => Number(value || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Every column the Payments sheet can show. All of them can be sorted and filtered (on all payments, by the server).
type PaymentColumn = { key: string; label: string; kind?: ColumnKind; right?: boolean; cell: (payment: OnlinePayment) => React.ReactNode };
const ALL_COLUMNS: PaymentColumn[] = [
  { key: 'date', label: 'Date', kind: 'date', cell: p => p.date },
  { key: 'donor', label: 'Donor', cell: p => <><span className="cell-main">{p.donorName}</span>{p.donorYiddish && <div dir="rtl" style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'left' }}>{p.donorYiddish}</div>}</> },
  { key: 'yiddish', label: 'Yiddish name', cell: p => <span dir="rtl">{p.donorYiddish || ''}</span> },
  { key: 'donorNumber', label: 'Donor #', cell: p => p.donorNumber || '' },
  { key: 'city', label: 'City', cell: p => p.donorCity || '' },
  { key: 'phone', label: 'Phone', cell: p => p.donorPhone || '' },
  { key: 'status', label: 'Status', cell: p => statusLabel[p.type] || p.type },
  { key: 'method', label: 'Method', cell: p => methodLabel[p.method] || p.method },
  { key: 'notes', label: 'Notes', cell: p => <span style={{ color: 'var(--text-muted)' }}>{p.notes || ''}</span> },
  { key: 'pledge', label: 'Pledge', cell: p => p.pledgeDate ? `${p.pledgeDate} · $${money(p.pledgeAmount)}` : '' },
  { key: 'pledgeDate', label: 'Pledge date', kind: 'date', cell: p => p.pledgeDate || '' },
  { key: 'pledgeAmount', label: 'Pledge amount', kind: 'number', right: true, cell: p => p.pledgeAmount == null ? '' : `$${money(p.pledgeAmount)}` },
  { key: 'campaign', label: 'Campaign', cell: p => p.campaignName || '' },
  { key: 'campaignYear', label: 'Campaign year', kind: 'number', cell: p => p.campaignYear || '' },
  { key: 'split', label: 'On pledge', cell: p => Array.isArray(p.pledgeAllocations) && p.pledgeAllocations.length > 1 ? 'Split' : p.pledgeDate ? 'One pledge' : 'No pledge' },
  { key: 'source', label: 'Deposited to', cell: p => p.sourceName || '' },
  { key: 'offset', label: 'Income account', cell: p => p.offsetName || '' },
  { key: 'deposit', label: 'Deposit', cell: p => p.depositStatus || '' },
  { key: 'depositDate', label: 'Deposit date', kind: 'date', cell: p => p.depositDate || String(p.depositedAt || '').slice(0, 10) },
  { key: 'reference', label: 'Reference #', cell: p => p.referenceNumber || p.solaRef || p.externalPaymentId || p.stripeChargeId || '' },
  { key: 'schedule', label: 'From a schedule', cell: p => p.scheduleId ? 'Yes' : '' },
  { key: 'declineReason', label: 'Decline reason', cell: p => p.declineReason || '' },
  { key: 'currency', label: 'Currency', cell: p => p.currency },
  { key: 'originalAmount', label: 'Amount (own currency)', kind: 'number', right: true, cell: p => `${p.currency} $${money(p.amount)}` },
  { key: 'amount', label: 'Amount (CAD)', kind: 'number', right: true, cell: p => <strong>{p.currency === 'USD' ? `CAD $${money(p.amountCAD ?? p.amount)}` : `${p.currency} $${money(p.amount)}`}</strong> },
];
const DEFAULT_COLUMNS = ['date', 'donor', 'status', 'method', 'campaign', 'notes', 'amount'];

// The sheets at the top. The list ones use the table below; "verify" and "scheduled" are their own pages.
const BASE_TABS = [
  { key: 'approved', label: 'Received' },
  { key: 'verify', label: 'Waiting to verify' },
  { key: 'pending', label: 'Pending' },
  { key: 'postdated', label: 'Post-dated checks' },
  { key: 'declined', label: 'Declined' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'all', label: 'All payments' },
];
const LIST_BASES = ['approved', 'pending', 'postdated', 'declined', 'all'];

type SavedSheet = { id: string; name: string; base: string; columns: string[]; filters: Record<string, string>; labels: Record<string, { label: string; kind: ColumnKind }>; sort: string; direction: 'asc' | 'desc'; search?: string; method?: string; from?: string; to?: string };

const readColumns = () => { try { const saved = JSON.parse(localStorage.getItem('payments-columns') || 'null'); return Array.isArray(saved) && saved.length ? saved.filter((key: string) => ALL_COLUMNS.some(column => column.key === key)) : DEFAULT_COLUMNS; } catch { return DEFAULT_COLUMNS; } };

export const OnlinePayments: React.FC = () => {
  const firstTab = (() => { const wanted = new URLSearchParams(window.location.search).get('tab') || ''; return BASE_TABS.some(tab => tab.key === wanted) ? wanted : 'approved'; })();
  const [tab, setTab] = useState(firstTab); // a base tab key, or "sheet:<id>"
  const [sheets, setSheets] = useState<SavedSheet[]>([]);
  const [items, setItems] = useState<OnlinePayment[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalCAD, setTotalCAD] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [columns, setColumns] = useState<string[]>(readColumns);
  const [picking, setPicking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<OnlinePayment | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const reviewedImportRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const cols = useListColumns('date', 'desc', () => setPage(1)); const { sort, direction } = cols;

  const sheet = tab.startsWith('sheet:') ? sheets.find(item => `sheet:${item.id}` === tab) || null : null;
  const base = sheet ? sheet.base : tab;
  const isList = LIST_BASES.includes(base);

  useEffect(() => { void (async () => { try { const response = await fetch('/api/v3/list-views?list=payments'); const data = await response.json(); if (response.ok && data.success) setSheets(data.views || []); } catch { /* no saved sheets */ } })(); }, []);
  useEffect(() => { if (!sheet) { try { localStorage.setItem('payments-columns', JSON.stringify(columns)); } catch { /* not saved */ } } }, [columns, sheet]);
  useEffect(() => { if (!picking) return; const close = (event: MouseEvent) => { if (!pickerRef.current?.contains(event.target as Node)) setPicking(false); }; document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close); }, [picking]);

  const load = useCallback(async (silent = false) => {
    if (!isList) return;
    if (!silent) { setLoading(true); setError(''); }
    const params = new URLSearchParams({ page: String(page), limit: '50', status: base }); for (const [key, value] of Object.entries(cols.filters)) params.set(`f_${key}`, value);
    if (search) params.set('search', search);
    if (method) params.set('method', method);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    params.set('sort', sort); params.set('direction', direction);
    try {
      const response = await fetch(`/api/v3/payments?${params.toString()}`);
      const data = await response.json() as PaymentResponse;
      if (!response.ok || !data.success) throw new Error(data.error || `Request failed (${response.status})`);
      setItems(data.items); setTotal(data.total); setTotalPages(Math.max(1, data.totalPages)); setTotalCAD(data.totalCAD);
    } catch (e: any) {
      if (!silent) setError(e.message || 'Unable to load payments.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [page, search, method, from, to, base, isList, cols.query]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => startLiveRefresh(() => void load(true)), [load]);
  useEffect(() => { setPage(1); }, [search, method, from, to, tab]);
  useEffect(() => { const timer = window.setTimeout(() => setSearch(searchInput.trim()), 220); return () => window.clearTimeout(timer); }, [searchInput]);

  // Open a sheet: put back everything it saved.
  const openTab = (key: string) => {
    setTab(key); setNotice(''); setError('');
    const chosen = key.startsWith('sheet:') ? sheets.find(item => `sheet:${item.id}` === key) : null;
    if (chosen) { setColumns(chosen.columns.length ? chosen.columns : DEFAULT_COLUMNS); cols.applyState({ sort: chosen.sort, direction: chosen.direction, filters: chosen.filters, labels: chosen.labels }); setSearchInput(chosen.search || ''); setMethod(chosen.method || ''); setFrom(chosen.from || ''); setTo(chosen.to || ''); }
    else if (sheet) { setColumns(readColumns()); cols.applyState({}); setSearchInput(''); setMethod(''); setFrom(''); setTo(''); }
    const url = new URL(window.location.href); if (key.startsWith('sheet:')) url.searchParams.delete('tab'); else url.searchParams.set('tab', key); window.history.replaceState(null, '', url.toString());
  };
  const saveSheets = async (next: SavedSheet[], message: string) => {
    try {
      const response = await fetch('/api/v3/list-views', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ list: 'payments', views: next }) });
      const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || 'Could not save the sheet.');
      setSheets(data.views || []); setNotice(message); return data.views as SavedSheet[];
    } catch (reason: any) { setError(reason.message || 'Could not save the sheet.'); return null; }
  };
  const current = (): Omit<SavedSheet, 'id' | 'name'> => ({ base, columns, filters: cols.filters, labels: cols.labels, sort, direction, search: searchInput.trim(), method, from, to });
  const saveAsNew = async () => {
    const name = window.prompt('Name for this sheet (for example “Campaign 2025 checks”):', sheet ? `${sheet.name} (copy)` : '');
    if (!name || !name.trim()) return;
    const id = crypto.randomUUID();
    const saved = await saveSheets([...sheets, { id, name: name.trim(), ...current() }], `Sheet “${name.trim()}” saved. It opens the same way every time.`);
    if (saved) setTab(`sheet:${id}`);
  };
  const updateSheet = async () => { if (!sheet) return; await saveSheets(sheets.map(item => item.id === sheet.id ? { ...item, ...current() } : item), `Sheet “${sheet.name}” updated.`); };
  const deleteSheet = async () => { if (!sheet || !window.confirm(`Delete the sheet “${sheet.name}”? The payments are not touched.`)) return; const saved = await saveSheets(sheets.filter(item => item.id !== sheet.id), 'Sheet deleted.'); if (saved) openTab('approved'); };

  const removePayment = async (payment: OnlinePayment) => {
    if (!window.confirm(`Delete the ${payment.date} payment of $${payment.amount.toFixed(2)} for ${payment.donorName}?`)) return;
    const response = await fetch(`/api/v3/payments/${encodeURIComponent(payment.id)}`, { method: 'DELETE', headers: { 'Idempotency-Key': crypto.randomUUID() } });
    const data = await response.json();
    if (!response.ok || !data.success) { alert(data.error || 'The payment could not be deleted.'); return; }
    await load();
  };

  const exportAllPayments = async () => {
    setExporting(true); setError('');
    try {
      const response = await fetch('/api/v3/payments/export.csv');
      if (!response.ok) { const text = await response.text(); throw new Error(text.startsWith('{') ? JSON.parse(text).error : `Export failed (${response.status})`); }
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement('a');
      link.href = url; link.download = `charitypro-all-payments-${new Date().toISOString().slice(0, 10)}.csv`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
      setNotice('All payments were exported successfully.');
    } catch (reason: any) { setError(reason.message || 'Unable to export all payments.'); }
    finally { setExporting(false); }
  };

  const importReviewedPayments = async (file: File) => {
    setImporting(true); setError(''); setNotice('');
    try {
      const parsed = JSON.parse(await file.text());
      const payments = Array.isArray(parsed) ? parsed : parsed.payments;
      if (!Array.isArray(payments) || !payments.length) throw new Error('The reviewed import file contains no payments.');
      let imported = 0; let skipped = 0;
      for (let start = 0; start < payments.length; start += 20) {
        const response = await fetch('/api/v3/payments/import-reviewed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payments: payments.slice(start, start + 20) }) });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || `Reviewed import failed (${response.status}).`);
        imported += Number(data.imported || 0); skipped += Number(data.skipped || 0);
      }
      setNotice(`Reviewed import complete: ${imported} payment${imported === 1 ? '' : 's'} added${skipped ? `, ${skipped} already present and skipped` : ''}.`);
      setPage(1); await load();
    } catch (reason: any) { setError(reason.message || 'Unable to import the reviewed payments.'); }
    finally { setImporting(false); if (reviewedImportRef.current) reviewedImportRef.current.value = ''; }
  };

  const filtered = searchInput !== '' || method !== '' || from !== '' || to !== '' || cols.hasFilters;
  const resetFilters = () => { setSearchInput(''); setMethod(''); setFrom(''); setTo(''); cols.clearFilters(); };
  const shownColumns = ALL_COLUMNS.filter(column => columns.includes(column.key));
  const toggleColumn = (key: string) => setColumns(current => current.includes(key) ? current.filter(item => item !== key) : ALL_COLUMNS.map(column => column.key).filter(item => item === key || current.includes(item)));

  const tabs = <div className="list-views" role="tablist" style={{ flexWrap: 'wrap' }}>
    {BASE_TABS.map(item => <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className={`list-view${tab === item.key ? ' active' : ''}`} onClick={() => openTab(item.key)}>
      {tab === item.key && isList && <span className="list-view-count">{total > 999 ? `${Math.floor(total / 1000)}k` : total}</span>}<span>{item.label}</span>
    </button>)}
    {sheets.map(item => <button key={item.id} type="button" role="tab" aria-selected={tab === `sheet:${item.id}`} className={`list-view${tab === `sheet:${item.id}` ? ' active' : ''}`} onClick={() => openTab(`sheet:${item.id}`)} title="Your saved sheet">
      {tab === `sheet:${item.id}` && <span className="list-view-count">{total > 999 ? `${Math.floor(total / 1000)}k` : total}</span>}<span>★ {item.name}</span>
    </button>)}
  </div>;

  if (base === 'verify') return <><main className="page list-page" style={{ paddingBottom: 0 }}><div className="page-inner">{tabs}</div></main><OnlinePendingPayments /></>;
  if (base === 'scheduled') return <><main className="page list-page" style={{ paddingBottom: 0 }}><div className="page-inner">{tabs}</div></main><OnlineSchedules /></>;

  return (
    <main className="page list-page">
      <div className="page-inner">
        {tabs}
        <div className="list-body">
          <ListToolbar end={<>
            <input ref={reviewedImportRef} type="file" accept="application/json,.json" hidden onChange={event => { const file = event.target.files?.[0]; if (file) void importReviewedPayments(file); }} />
            <button className="btn btn-secondary" onClick={() => reviewedImportRef.current?.click()} disabled={importing}>{importing ? 'Importing Reviewed…' : 'Import Reviewed Payments'}</button>
            <button className="btn btn-secondary" onClick={() => void exportAllPayments()} disabled={exporting}>{exporting ? 'Preparing Export…' : 'Export All Payments'}</button>
            <NewButton onClick={() => { setShowCreate(true); setNotice(''); }}>New Payment</NewButton>
          </>}>
            <input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Live search: donor, amount, notes or account" />
            <select value={method} onChange={e => setMethod(e.target.value)}>
              <option value="">All methods</option>
              {Object.entries(methodLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} title="From date" />
            <input type="date" value={to} onChange={e => setTo(e.target.value)} title="To date" />
            <div ref={pickerRef} style={{ position: 'relative' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setPicking(value => !value)} title="Choose which columns to show"><Columns3 size={15} /> Columns ({shownColumns.length})</button>
              {picking && <div className="card" style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 60, width: 260, maxHeight: 380, overflow: 'auto', padding: 10, display: 'grid', gap: 4, boxShadow: '0 12px 30px rgba(15,23,42,.18)' }}>
                <strong style={{ fontSize: 13 }}>Show these columns</strong>
                {ALL_COLUMNS.map(column => <label key={column.key} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}><input type="checkbox" checked={columns.includes(column.key)} onChange={() => toggleColumn(column.key)} />{column.label}</label>)}
                <button type="button" className="reset-link" onClick={() => setColumns(DEFAULT_COLUMNS)}>Back to the usual columns</button>
              </div>}
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => void saveAsNew()} title="Save this sheet (tab, columns, filters and sort) under a name"><Save size={15} /> Save as sheet</button>
            {sheet && <button type="button" className="btn btn-secondary" onClick={() => void updateSheet()} title={`Save the changes to “${sheet.name}”`}>Update “{sheet.name}”</button>}
            {sheet && <button type="button" className="btn btn-ghost" onClick={() => void deleteSheet()} title="Delete this sheet"><Trash2 size={15} /></button>}
            {filtered && <ResetLink onClick={resetFilters} />}
          </ListToolbar>
          <ColumnFilterChips cols={cols} />
          {base === 'postdated' && <div className="list-notice ok">Checks dated after today (not declined). They count when their date comes.</div>}

          {showCreate && <div className="modal-overlay" onClick={() => setShowCreate(false)}><div className="pay-modal" onClick={event => event.stopPropagation()}><OnlinePaymentForm onCancel={() => setShowCreate(false)} onCreated={createdStatus => {
            setShowCreate(false);
            setNotice(createdStatus === 'pending' ? 'Check saved safely in the cloud as pending. You can view it under Pending when you are ready.' : 'Payment saved safely in the cloud.');
            setPage(1);
            // Saving a payment must never move the operator to another view or tab; the live refresh shows it here when it belongs.
            void load(true);
          }} /></div></div>}
          {notice && <div className="list-notice ok">{notice}</div>}
          {error && <div className="list-notice bad">{error}</div>}

          <section className="list-table">
            {loading ? <div className="list-loading">Loading 50 payments from the cloud…</div> : (
              <div className="list-scroll">
                <table>
                  <thead><tr>{shownColumns.map(column => <ColumnTh key={column.key} cols={cols} column={column.key} label={column.label} kind={column.kind} align={column.right ? 'right' : 'left'} />)}<th className="row-actions" /></tr></thead>
                  <tbody>
                    {items.map(payment => (
                      <tr key={payment.id} onClick={() => setSelectedPayment(payment)} style={{ cursor: 'pointer' }}>
                        {shownColumns.map(column => <td key={column.key} style={column.right ? { textAlign: 'right', whiteSpace: 'nowrap' } : column.key === 'notes' ? { maxWidth: 420 } : undefined}>{column.cell(payment)}</td>)}
                        <td className="row-actions"><RowMenu items={[
                          { label: 'Open payment', onClick: () => setSelectedPayment(payment) },
                          { label: 'Delete', danger: true, onClick: () => void removePayment(payment) },
                        ]} /></td>
                      </tr>
                    ))}
                    {items.length === 0 && <tr><td colSpan={shownColumns.length + 1} className="list-empty">No matching payments.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
            <ListFooter page={page} totalPages={totalPages} total={total} pageSize={50} shown={items.length} loading={loading} onPage={setPage}>
              Total: ${totalCAD.toLocaleString('en-CA', { minimumFractionDigits: 2 })} CAD
            </ListFooter>
          </section>
        </div>
      </div>
      {selectedPayment && <CloudPaymentDetailsModal payment={selectedPayment} onClose={() => setSelectedPayment(null)} onUpdated={payment => { setSelectedPayment(payment); void load(true); }} />}
    </main>
  );
};
