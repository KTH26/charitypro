import React, { useState } from 'react';
import { useStore } from '../store';
import { Search, Wallet, Upload } from 'lucide-react';
import { PaymentModal } from '../components/PaymentModal';
import { BulkUploadModal } from '../components/BulkUploadModal';
import { useT } from '../i18n';

export const Payments: React.FC = () => {
  const { transactions, donors, isRtl } = useStore();
  const T = useT(isRtl);
  const [searchTerm, setSearchTerm] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [selectedDonorId, setSelectedDonorId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [filterMethod, setFilterMethod] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 50;

  const payments = transactions.filter(t => t.type === 'approved').sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const filteredPayments = payments.filter(p => {
    if (fromDate && p.date < fromDate) return false;
    if (toDate && p.date > toDate) return false;
    if (filterMethod && p.method !== filterMethod) return false;

    const donor = donors.find(d => d.id === p.donorId);
    if (!donor) return false;
    return donor.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.amount.toString().includes(searchTerm) || p.method.includes(searchTerm);
  });

  const totalPages = Math.ceil(filteredPayments.length / PAGE_SIZE);
  const paginatedPayments = filteredPayments.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const totalPaymentsAmount = filteredPayments.reduce((sum, p) => sum + (p.amountCAD ?? p.amount), 0);

  const handleAddPayment = () => {
    if (donors.length > 0) {
      setSelectedDonorId(donors[0].id);
      setShowPayment(true);
    } else {
      alert("Please add a donor first.");
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(paginatedPayments.map(p => p.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const { deleteTransactions } = useStore();

  const methodLabel: Record<string, string> = {
    credit_card: 'Credit Card', check: 'Check', cash: 'Cash', e_transfer: 'E-Transfer', vouchers: 'Vouchers', eizer: 'Eizer', bnei_leivy: 'Bnei Leivy', other: 'Other'
  };

  return (
    <div style={{ display: 'grid', gap: '24px' }}>
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontFamily: 'Outfit, sans-serif', fontWeight: 700, color: 'var(--navy)' }}>
              Donor Payments ({filteredPayments.length})
            </h2>
            <div style={{ color: 'var(--green)', fontWeight: 700, marginTop: '4px' }}>
              Total Received: ${totalPaymentsAmount.toLocaleString('en-CA', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowBulkUpload(true)}>
              <Upload size={14} /> Bulk Upload
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleAddPayment}>
              <Wallet size={14} /> Record Payment
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div className="search-box" style={{ width: '300px' }}>
            <Search className="search-icon" size={18} />
            <input type="text" placeholder="Search payments..." value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }} />
          </div>
          <select className="filter-select" value={filterMethod} onChange={e => { setFilterMethod(e.target.value); setCurrentPage(1); }}>
            <option value="">All Methods</option>
            <option value="credit_card">Credit Card</option>
            <option value="check">Check</option>
            <option value="cash">Cash</option>
            <option value="e_transfer">E-Transfer</option>
            <option value="vouchers">Vouchers</option>
            <option value="eizer">Eizer</option>
            <option value="bnei_leivy">Bnei Leivy</option>
            <option value="other">Other</option>
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>From:</span>
            <input type="date" className="filter-select" value={fromDate} onChange={e => { setFromDate(e.target.value); setCurrentPage(1); }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>To:</span>
            <input type="date" className="filter-select" value={toDate} onChange={e => { setToDate(e.target.value); setCurrentPage(1); }} />
          </div>
        </div>

        {selectedIds.length > 0 && (
          <div style={{ background: 'var(--red-bg)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '12px 16px', borderRadius: '12px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--red)', fontWeight: 600 }}>{selectedIds.length} payments selected</span>
            <button className="btn btn-sm" style={{ background: 'var(--red)', color: 'white', border: 'none' }} onClick={() => {
              if (window.confirm(`Are you sure you want to permanently delete ${selectedIds.length} payments?`)) {
                deleteTransactions(selectedIds);
                setSelectedIds([]);
              }
            }}>Delete Selected</button>
          </div>
        )}

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input type="checkbox" checked={selectedIds.length === paginatedPayments.length && paginatedPayments.length > 0} onChange={handleSelectAll} />
                </th>
                <th>Date</th>
                <th>Donor</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Category</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {paginatedPayments.map(payment => {
                const donor = donors.find(d => d.id === payment.donorId);
                return (
                  <tr key={payment.id}>
                    <td>
                      <input type="checkbox" checked={selectedIds.includes(payment.id)} onChange={() => handleSelect(payment.id)} />
                    </td>
                    <td>{payment.date}</td>
                    <td style={{ fontWeight: 600 }}>{donor?.name || 'Unknown'}</td>
                    <td style={{ fontWeight: 700, color: 'var(--green)' }}>${payment.amount.toLocaleString()} {payment.currency}</td>
                    <td>{methodLabel[payment.method]}</td>
                    <td style={{ fontSize: '0.9rem' }}>{payment.category}</td>
                    <td><span className="badge badge-success">Approved</span></td>
                  </tr>
                );
              })}
              {paginatedPayments.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>No payments found.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '20px', gap: '16px' }}>
            <button className="btn btn-secondary btn-sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>Previous</button>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Page {currentPage} of {totalPages}</span>
            <button className="btn btn-secondary btn-sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>Next</button>
          </div>
        )}
      </div>

      {showPayment && selectedDonorId && (
        <PaymentModal donorId={selectedDonorId} onClose={() => setShowPayment(false)} />
      )}
      {showBulkUpload && (
        <BulkUploadModal onClose={() => setShowBulkUpload(false)} />
      )}
    </div>
  );
};
