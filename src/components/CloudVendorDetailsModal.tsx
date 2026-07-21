import React, { useEffect, useState } from 'react';
import { Calendar, X } from 'lucide-react';
import { CloudBillDetailsModal } from './CloudBillDetailsModal';

type VendorDetails = { vendor: Record<string, any>; bills: Record<string, any>[]; summary: { billCount: number; totalPaid: number; totalOwed: number } };
const money = (value: number) => Number(value || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const CloudVendorDetailsModal: React.FC<{ vendorName: string; onClose: () => void }> = ({ vendorName, onClose }) => {
  const [details, setDetails] = useState<VendorDetails | null>(null);
  const [selectedBill, setSelectedBill] = useState<any | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/v3/vendors/details?name=${encodeURIComponent(vendorName)}`, { signal: controller.signal }).then(async response => { const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load vendor details.'); setDetails(data); }).catch((reason: any) => { if (reason.name !== 'AbortError') setError(reason.message || 'Unable to load vendor details.'); });
    return () => controller.abort();
  }, [vendorName]);
  return <><div className="modal-overlay" onClick={onClose}><div className="modal" onClick={event => event.stopPropagation()} style={{ maxWidth: 820, width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
    <div className="modal-header"><h2 style={{ margin: 0 }}>{vendorName}</h2><button className="modal-close" onClick={onClose}><X size={20} /></button></div>
    <div className="modal-body">{error && <div style={{ color: 'var(--red)', fontWeight: 700 }}>{error}</div>}{!details && !error && <div style={{ padding: 40, textAlign: 'center' }}>Loading vendor details from the cloud...</div>}{details && <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 24 }}>
      <div><div className="card" style={{ padding: 20 }}><h3 style={{ margin: '0 0 16px', color: 'var(--navy)' }}>Vendor Details</h3><div style={{ color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>{details.vendor.id ? `Vendor ID: ${details.vendor.id}` : 'Unregistered Vendor'}</div>{details.vendor.phone && <div style={{ marginTop: 10 }}>{details.vendor.phone}</div>}{details.vendor.email && <div style={{ marginTop: 10 }}>{details.vendor.email}</div>}{details.vendor.address && <div style={{ marginTop: 10 }}>{details.vendor.address}</div>}<div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><span>Total Paid</span><strong style={{ color: 'var(--green)' }}>${money(details.summary.totalPaid)}</strong></div><div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Outstanding</span><strong style={{ color: 'var(--red)' }}>${money(details.summary.totalOwed)}</strong></div></div></div></div>
      <div><h3 style={{ margin: '0 0 16px', color: 'var(--navy)' }}>Transactions ({details.summary.billCount})</h3><div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 500, overflowY: 'auto', paddingRight: 8 }}>{details.bills.map(bill => <button key={bill.id} type="button" onClick={() => setSelectedBill(bill)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderRadius: 12, background: 'var(--bg-input)', border: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left', color: 'inherit' }}><div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><Calendar size={18} color={bill.status === 'paid' ? 'var(--green)' : bill.status === 'urgent' ? 'var(--red)' : 'var(--navy-muted)'} /><div><div style={{ fontWeight: 700 }}>{bill.dueDate}</div><div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{bill.status} · {bill.categoryName}</div></div></div><div style={{ fontWeight: 800, fontSize: 17, color: bill.status === 'paid' ? 'var(--text)' : 'var(--red)' }}>{bill.currency || 'CAD'} ${money(bill.amount)}</div></button>)}{details.bills.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No transactions found for this vendor.</div>}</div><div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 12 }}>Showing the latest 50 transactions.</div></div>
    </div>}</div>
  </div></div>{selectedBill && <CloudBillDetailsModal bill={selectedBill} onClose={() => setSelectedBill(null)} onUpdated={updated => { setSelectedBill(updated); setDetails(current => current ? { ...current, bills: current.bills.map(bill => bill.id === updated.id ? updated : bill) } : current); }} />}</>;
};
