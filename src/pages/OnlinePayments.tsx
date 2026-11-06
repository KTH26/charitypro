import React, { useCallback, useEffect, useRef, useState } from 'react';
import { OnlinePaymentForm } from '../components/OnlinePaymentForm';
import { CloudPaymentDetailsModal } from '../components/CloudPaymentDetailsModal';
import { SortableTh, type SortDirection } from '../components/SortableTh';

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
  credit_card: 'Credit Card', check: 'Check', cash: 'Cash', e_transfer: 'E-Transfer',
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
  const [sort, setSort] = useState('date');
  const [direction, setDirection] = useState<SortDirection>('desc');
  const changeSort = (column: string) => { setDirection(current => sort === column ? (current === 'asc' ? 'desc' : 'asc') : (column === 'date' || column === 'amount' ? 'desc' : 'asc')); setSort(column); setPage(1); };

  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(''); }
    const params = new URLSearchParams({ page: String(page), limit: '50', status });
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
  }, [page, search, method, from, to, status, sort, direction]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const interval = window.setInterval(() => void load(true), 3000);
    return () => window.clearInterval(interval);
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

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '28px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'center', marginBottom: 22 }}>
          <div>
            <div style={{ color: 'var(--green)', fontWeight: 800, fontSize: 13, letterSpacing: 0.6 }}>CHARITYPRO CLOUD</div>
            <h1 style={{ margin: '4px 0', color: 'var(--navy)' }}>Donor Payments ({total.toLocaleString()})</h1>
            <div style={{ color: 'var(--green)', fontWeight: 700 }}>{status === 'approved' ? 'Total received' : 'Pending total'}: ${totalCAD.toLocaleString('en-CA', { minimumFractionDigits: 2 })} CAD</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 3 }}>Live cloud data — updates automatically every 3 seconds</div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <input ref={reviewedImportRef} type="file" accept="application/json,.json" hidden onChange={event => { const file = event.target.files?.[0]; if (file) void importReviewedPayments(file); }} />
            <button className="btn btn-secondary" onClick={() => reviewedImportRef.current?.click()} disabled={importing}>{importing ? 'Importing Reviewed…' : 'Import Reviewed Payments'}</button>
            <button className="btn btn-secondary" onClick={() => void exportAllPayments()} disabled={exporting}>{exporting ? 'Preparing Export…' : 'Export All Payments'}</button>
            <button className="btn btn-primary" onClick={() => { setShowCreate(true); setNotice(''); }}>New Payment</button>
          </div>
        </div>

        {showCreate && <OnlinePaymentForm onCancel={() => setShowCreate(false)} onCreated={createdStatus => {
          setShowCreate(false);
          setNotice(createdStatus === 'pending'
            ? 'Check saved safely in the cloud as pending. You can view it under Pending checks when you are ready.'
            : 'Payment saved safely in the cloud.');
          setPage(1);
          // Saving a payment must never move the operator to another view or tab.
          // The three-second cloud refresh will show it here when it belongs to the
          // current filter; pending checks remain available under Pending checks.
          if (status === createdStatus) void load();
        }} />}
        {notice && <div className="card" style={{ padding: 14, color: 'var(--green)', fontWeight: 800, marginBottom: 16 }}>{notice}</div>}

        <section className="card" style={{ padding: 18, marginBottom: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px,1fr) 160px 145px 145px 145px', gap: 10 }}>
            <input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Live search: donor, amount, notes or account" />
            <select value={status} onChange={e => setStatus(e.target.value as 'approved' | 'pending')}><option value="approved">Received</option><option value="pending">Pending checks</option></select>
            <select value={method} onChange={e => setMethod(e.target.value)}>
              <option value="">All methods</option>
              {Object.entries(methodLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} title="From date" />
            <input type="date" value={to} onChange={e => setTo(e.target.value)} title="To date" />
          </div>
        </section>

        {error && <div className="card" style={{ padding: 16, color: 'var(--red)', marginBottom: 16 }}>{error}</div>}
        <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading 50 payments from the cloud…</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><SortableTh column="date" label="Date" sort={sort} direction={direction} onSort={changeSort} /><SortableTh column="donor" label="Donor" sort={sort} direction={direction} onSort={changeSort} /><SortableTh column="status" label="Status" sort={sort} direction={direction} onSort={changeSort} /><SortableTh column="method" label="Method" sort={sort} direction={direction} onSort={changeSort} /><SortableTh column="notes" label="Notes" sort={sort} direction={direction} onSort={changeSort} /><SortableTh column="amount" label="Amount" sort={sort} direction={direction} onSort={changeSort} align="right" /><th /></tr></thead>
                <tbody>
                  {items.map(payment => (
                    <tr key={payment.id} onClick={() => setSelectedPayment(payment)} style={{ cursor: 'pointer' }}>
                      <td>{payment.date}</td>
                      <td style={{ fontWeight: 700 }}>{payment.donorName}</td>
                      <td>{payment.type === 'pending' ? 'Pending' : 'Received'}</td>
                      <td>{methodLabel[payment.method] || payment.method}</td>
                      <td style={{ color: 'var(--text-muted)', maxWidth: 420 }}>{payment.notes || ''}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800 }}>{payment.currency} ${payment.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td style={{ textAlign: 'right' }}><button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={event => { event.stopPropagation(); void removePayment(payment); }}>Delete</button></td>
                    </tr>
                  ))}
                  {items.length === 0 && <tr><td colSpan={7} style={{ padding: 30, textAlign: 'center' }}>No matching payments.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderTop: '1px solid var(--border)' }}>
            <span>Page {page} of {totalPages}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" disabled={page <= 1 || loading} onClick={() => setPage(p => Math.max(1, p - 1))}>Previous</button>
              <button className="btn btn-secondary btn-sm" disabled={page >= totalPages || loading} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Next</button>
            </div>
          </div>
        </section>
      </div>
      {selectedPayment && <CloudPaymentDetailsModal payment={selectedPayment} onClose={() => setSelectedPayment(null)} onUpdated={payment => { setSelectedPayment(payment); void load(true); }} />}
    </main>
  );
};
