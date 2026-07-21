import React, { useCallback, useEffect, useState } from 'react';
import { OnlinePaymentForm } from '../components/OnlinePaymentForm';

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

  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(''); }
    const params = new URLSearchParams({ page: String(page), limit: '50', status });
    if (search) params.set('search', search);
    if (method) params.set('method', method);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
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
  }, [page, search, method, from, to, status]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const interval = window.setInterval(() => void load(true), 3000);
    return () => window.clearInterval(interval);
  }, [load]);
  useEffect(() => { setPage(1); }, [search, method, from, to, status]);

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
          <button className="btn btn-primary" onClick={() => { setShowCreate(true); setNotice(''); }}>New Payment</button>
        </div>

        {showCreate && <OnlinePaymentForm onCancel={() => setShowCreate(false)} onCreated={createdStatus => {
          setShowCreate(false);
          setNotice(createdStatus === 'pending' ? 'Check saved safely in the cloud as pending.' : 'Payment saved safely in the cloud.');
          setPage(1);
          if (status === createdStatus) void load(); else setStatus(createdStatus);
        }} />}
        {notice && <div className="card" style={{ padding: 14, color: 'var(--green)', fontWeight: 800, marginBottom: 16 }}>{notice}</div>}

        <section className="card" style={{ padding: 18, marginBottom: 18 }}>
          <form onSubmit={e => { e.preventDefault(); setSearch(searchInput.trim()); }} style={{ display: 'grid', gridTemplateColumns: 'minmax(220px,1fr) 160px 145px 145px 145px auto', gap: 10 }}>
            <input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Search donor, amount, or notes" />
            <select value={status} onChange={e => setStatus(e.target.value as 'approved' | 'pending')}><option value="approved">Received</option><option value="pending">Pending checks</option></select>
            <select value={method} onChange={e => setMethod(e.target.value)}>
              <option value="">All methods</option>
              {Object.entries(methodLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} title="From date" />
            <input type="date" value={to} onChange={e => setTo(e.target.value)} title="To date" />
            <button className="btn btn-primary" type="submit">Search</button>
          </form>
        </section>

        {error && <div className="card" style={{ padding: 16, color: 'var(--red)', marginBottom: 16 }}>{error}</div>}
        <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading 50 payments from the cloud…</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th>Date</th><th>Donor</th><th>Status</th><th>Method</th><th>Notes</th><th style={{ textAlign: 'right' }}>Amount</th><th /></tr></thead>
                <tbody>
                  {items.map(payment => (
                    <tr key={payment.id}>
                      <td>{payment.date}</td>
                      <td style={{ fontWeight: 700 }}>{payment.donorName}</td>
                      <td>{payment.type === 'pending' ? 'Pending' : 'Received'}</td>
                      <td>{methodLabel[payment.method] || payment.method}</td>
                      <td style={{ color: 'var(--text-muted)', maxWidth: 420 }}>{payment.notes || ''}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800 }}>{payment.currency} ${payment.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td style={{ textAlign: 'right' }}><button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => void removePayment(payment)}>Delete</button></td>
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
    </main>
  );
};
