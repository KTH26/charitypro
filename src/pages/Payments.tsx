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

  const payments = transactions.filter(t => t.type === 'approved').sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const filteredPayments = payments.filter(p => {
    const donor = donors.find(d => d.id === p.donorId);
    if (!donor) return false;
    return donor.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.amount.toString().includes(searchTerm) || p.method.includes(searchTerm);
  });

  const totalPaymentsAmount = filteredPayments.reduce((sum, p) => sum + (p.amountCAD ?? p.amount), 0);

  const handleAddPayment = () => {
    if (donors.length > 0) {
      setSelectedDonorId(donors[0].id);
      setShowPayment(true);
    } else {
      alert("Please add a donor first.");
    }
  };

  const methodLabel: Record<string, string> = {
    credit_card: 'Credit Card', check: 'Check', cash: 'Cash', e_transfer: 'E-Transfer'
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

        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
          <div className="search-box" style={{ width: '300px' }}>
            <Search className="search-icon" size={18} />
            <input type="text" placeholder="Search payments..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Donor</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Category</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.map(payment => {
                const donor = donors.find(d => d.id === payment.donorId);
                return (
                  <tr key={payment.id}>
                    <td>{payment.date}</td>
                    <td style={{ fontWeight: 600 }}>{donor?.name || 'Unknown'}</td>
                    <td style={{ fontWeight: 700, color: 'var(--green)' }}>${payment.amount.toLocaleString()} {payment.currency}</td>
                    <td>{methodLabel[payment.method]}</td>
                    <td style={{ fontSize: '0.9rem' }}>{payment.category}</td>
                    <td><span className="badge badge-success">Approved</span></td>
                  </tr>
                );
              })}
              {filteredPayments.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>No payments found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
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
