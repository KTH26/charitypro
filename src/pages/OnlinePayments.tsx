import React, { useCallback, useEffect, useRef, useState } from 'react';
import { startLiveRefresh } from '../utils/liveUpdates';
import { OnlinePaymentForm } from '../components/OnlinePaymentForm';
import { CloudPaymentDetailsModal } from '../components/CloudPaymentDetailsModal';
import { ColumnTh, ColumnFilterChips, useListColumns } from '../components/ColumnTh';
import { ListFooter, ListToolbar, NewButton, ResetLink, RowMenu, ViewTabs } from '../components/ListLayout';

type OnlinePayment = {
  id: string;
  donorId: string;
  donorName: string;
  amount: number;
  amountCAD?: number;
  date: string;
  method: string;
  currency: 'CAD' | 'USD';
  type: 'approved' | 'pending';
  notes?: string;
  sourceName?: string;
  offsetName?: string;
  [key: string]: any;
};

type PaymentResponse = {
  success: boolean;
  items: OnlinePayment[];
  page: number;
  total: number;
  totalPages: number;
  totalCAD: number;
  error?: string;
};

const methodLabel: Record<string, string> = {
  credit_card: 'Credit Card', check: 'Check', cash: 'Cash', e_transfer: 'E-Transfer', wire: 'Wire',
  vouchers: 'Vouchers', eizer: 'Eizer', bnei_leivy: 'Bnei Leivy', other: 'Other'
};

export const OnlinePayments: React.FC = () => {
  const [items, setItems] = useState<OnlinePayment[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalCAD, setTotalCAD] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState('');
  const [status, setStatus] = useState<'approved' | 'pending'>('approved');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<OnlinePayment | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const reviewedImportRef = useRef<HTMLInputElement>(null);
  const cols = useListColumns('date', 'desc', () => setPage(1)); const { sort, direction } = cols;

  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(''); }
    const params = new URLSearchParams({ page: String(page), limit: '50', status }); for (const [key, value] of Object.entries(cols.filters)) params.set(`f_${key}`, value);
    if (search) params.set('search', search);
    if (method) params.set('method', method);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    params.set('sort', sort); params.set('direction', direction);
    try {
      const response = await fetch(`/api/v3/payments?${params.toString()}`);
      const data = await response.json() as PaymentResponse;
      if (!response.ok || !data.success) throw new Error(data.error || `Request failed (${response.status})`);
      setItems(data.items);
      setTotal(data.total);
      setTotalPages(Math.max(1, data.totalPages));
      setTotalCAD(data.totalCAD);
    } catch (e: any) {
      if (!silent) setError(e.message || 'Unable to load payments.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [page, search, method, from, to, status, cols.query]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    return startLiveRefresh(() => void load(true));
  }, [load]);
  useEffect(() => { setPage(1); }, [search, method, from, to, status]);
  useEffect(() => { const timer = window.setTimeout(() => setSearch(searchInput.trim()), 220); return () => window.clearTimeout(timer); }, [searchInput]);

  const removePayment = async (payment: OnlinePayment) => {
    if (!window.confirm(`Delete the ${payment.date} payment of $${payment.amount.toFixed(2)} for ${payment.donorName}?`)) return;
    const response = await fetch(`/api/v3/payments/${encodeURIComponent(payment.id)}`, {
      method: 'DELETE',
      headers: { 'Idempotency-Key': crypto.randomUUID() }
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      alert(data.error || 'The payment could not be deleted.');
      return;
    }
    await load();
  };

  const exportAllPayments = async () => {
    setExporting(true);
    setError('');
    try {
      const response = await fetch('/api/v3/payments/export.csv');
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text.startsWith('{') ? JSON.parse(text).error : `Export failed (${response.status})`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `charitypro-all-payments-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice('All payments were exported successfully.');
    } catch (reason: any) {
      setError(reason.message || 'Unable to export all payments.');
    } finally {
      setExporting(false);
    }
  };

  const importReviewedPayments = async (file: File) => {
    setImporting(true); setError(''); setNotice('');
    try {
      const parsed = JSON.parse(await file.text());
      const payments = Array.isArray(parsed) ? parsed : parsed.payments;
      if (!Array.isArray(payments) || !payments.length) throw new Error('The reviewed import file contains no payments.');
      let imported = 0; let skipped = 0;
      for (let start = 0; start < payments.length; start += 20) {
        const response = await fetch('/api/v3/payments/import-reviewed', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payments: payments.slice(start, start + 20) }),
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || `Reviewed import failed (${response.status}).`);
        imported += Number(data.imported || 0); skipped += Number(data.skipped || 0);
      }
      setNotice(`Reviewed import complete: ${imported} payment${imported === 1 ? '' : 's'} added${skipped ? `, ${skipped} already present and skipped` : ''}.`);
      setPage(1); await load();
    } catch (reason: any) {
      setError(reason.message || 'Unable to import the reviewed payments.');
    } finally {
      setImporting(false);
      if (reviewedImportRef.current) reviewedImportRef.current.value = '';
    }
  };

  const filtered = searchInput !== '' || method !== '' || from !== '' || to !== '' || cols.hasFilters;
  const resetFilters = () => { setSearchInput(''); setMethod(''); setFrom(''); setTo(''); cols.clearFilters(); };

  return (
    <main className="page list-page">
      <div className="page-inner">
        <ViewTabs
          views={[
            { key: 'approved', label: 'Received', count: status === 'approved' ? total : undefined },
            { key: 'pending', label: 'Pending checks', count: status === 'pending' ? total : undefined },
          ]}
          value={status}
          onChange={key => setStatus(key as 'approved' | 'pending')}
        />
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
            {filtered && <ResetLink onClick={resetFilters} />}
          </ListToolbar>
<ColumnFilterChips cols={cols} />

          {showCreate && <div className="modal-overlay" onClick={() => setShowCreate(false)}><div className="pay-modal" onClick={event => event.stopPropagation()}><OnlinePaymentForm onCancel={() => setShowCreate(false)} onCreated={createdStatus => {
            setShowCreate(false);
            setNotice(createdStatus === 'pending'
              ? 'Check saved safely in the cloud as pending. You can view it under Pending checks when you are ready.'
              : 'Payment saved safely in the cloud.');
            setPage(1);
            // Saving a payment must never move the operator to another view or tab.
            // The three-second cloud refresh will show it here when it belongs to the
            // current filter; pending checks remain available under Pending checks.
            if (status === createdStatus) void load();
          }} /></div></div>}
          {notice && <div className="list-notice ok">{notice}</div>}
          {error && <div className="list-notice bad">{error}</div>}

          <section className="list-table">
            {loading ? (
              <div className="list-loading">Loading 50 payments from the cloud…</div>
            ) : (
              <div className="list-scroll">
                <table>
                  <thead><tr><ColumnTh cols={cols} column="date" label="Date" kind="date" /><ColumnTh cols={cols} column="donor" label="Donor" /><ColumnTh cols={cols} column="status" label="Status" /><ColumnTh cols={cols} column="method" label="Method" /><ColumnTh cols={cols} column="notes" label="Notes" /><ColumnTh cols={cols} column="amount" label="Amount" kind="number" align="right" /><th className="row-actions" /></tr></thead>
                  <tbody>
                    {items.map(payment => (
                      <tr key={payment.id} onClick={() => setSelectedPayment(payment)} style={{ cursor: 'pointer' }}>
                        <td>{payment.date}</td>
                        <td className="cell-main">{payment.donorName}</td>
                        <td>{payment.type === 'pending' ? 'Pending' : 'Received'}</td>
                        <td>{methodLabel[payment.method] || payment.method}</td>
                        <td style={{ color: 'var(--text-muted)', maxWidth: 420 }}>{payment.notes || ''}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{payment.currency} ${payment.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="row-actions"><RowMenu items={[
                          { label: 'Open payment', onClick: () => setSelectedPayment(payment) },
                          { label: 'Delete', danger: true, onClick: () => void removePayment(payment) },
                        ]} /></td>
                      </tr>
                    ))}
                    {items.length === 0 && <tr><td colSpan={7} className="list-empty">No matching payments.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
            <ListFooter page={page} totalPages={totalPages} total={total} pageSize={50} shown={items.length} loading={loading} onPage={setPage}>
              {status === 'approved' ? 'Total received' : 'Pending total'}: ${totalCAD.toLocaleString('en-CA', { minimumFractionDigits: 2 })} CAD
            </ListFooter>
          </section>
        </div>
      </div>
      {selectedPayment && <CloudPaymentDetailsModal payment={selectedPayment} onClose={() => setSelectedPayment(null)} onUpdated={payment => { setSelectedPayment(payment); void load(true); }} />}
    </main>
  );
};
