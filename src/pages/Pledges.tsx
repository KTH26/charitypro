import React, { useState } from 'react';
import { useStore } from '../store';
import { HeartHandshake, Plus, Search, ChevronRight, Edit2, Upload } from 'lucide-react';
import { PaymentModal } from '../components/PaymentModal';
import { BulkUploadModal } from '../components/BulkUploadModal';
import { useT } from '../i18n';

export const Pledges: React.FC = () => {
  const { transactions, donors, isRtl, deleteTransactions } = useStore();
  const T = useT(isRtl);
  const [searchTerm, setSearchTerm] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [selectedDonorId, setSelectedDonorId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const pledges = transactions.filter(t => t.type === 'recording').sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const filteredPledges = pledges.filter(p => {
    const donor = donors.find(d => d.id === p.donorId);
    if (!donor) return false;
    return donor.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.amount.toString().includes(searchTerm);
  });

  const totalPledgesAmount = filteredPledges.reduce((sum, p) => sum + (p.amountCAD ?? p.amount), 0);

  const handleAddPledge = () => {
    if (donors.length > 0) {
      setSelectedDonorId(donors[0].id);
      setShowPayment(true);
    } else {
      alert("Please add a donor first.");
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(filteredPledges.map(p => p.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  return (
    <div style={{ display: 'grid', gap: '24px' }}>
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontFamily: 'Outfit, sans-serif', fontWeight: 700, color: 'var(--navy)' }}>
              Donor Pledges ({filteredPledges.length})
            </h2>
            <div style={{ color: 'var(--gold)', fontWeight: 700, marginTop: '4px' }}>
              Total Pledged: ${totalPledgesAmount.toLocaleString('en-CA', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowBulkUpload(true)}>
              <Upload size={14} /> Bulk Upload
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleAddPledge} style={{ background: 'linear-gradient(135deg, var(--gold-light), var(--gold))' }}>
              <HeartHandshake size={14} /> Add Pledge
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
          <div className="search-box" style={{ width: '300px' }}>
            <Search className="search-icon" size={18} />
            <input type="text" placeholder="Search pledges by donor..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
        </div>

        {selectedIds.length > 0 && (
          <div style={{ background: 'var(--red-bg)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '12px 16px', borderRadius: '12px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--red)', fontWeight: 600 }}>{selectedIds.length} pledges selected</span>
            <button className="btn btn-sm" style={{ background: 'var(--red)', color: 'white', border: 'none' }} onClick={() => {
              if (window.confirm(`Are you sure you want to permanently delete ${selectedIds.length} pledges?`)) {
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
                  <input type="checkbox" checked={selectedIds.length === filteredPledges.length && filteredPledges.length > 0} onChange={handleSelectAll} />
                </th>
                <th>Date</th>
                <th>Donor</th>
                <th>Amount</th>
                <th>Category</th>
                <th>Sponsor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredPledges.map(pledge => {
                const donor = donors.find(d => d.id === pledge.donorId);
                return (
                  <tr key={pledge.id}>
                    <td>
                      <input type="checkbox" checked={selectedIds.includes(pledge.id)} onChange={() => handleSelect(pledge.id)} />
                    </td>
                    <td>{pledge.date}</td>
                    <td style={{ fontWeight: 600 }}>{donor?.name || 'Unknown'}</td>
                    <td style={{ fontWeight: 700, color: 'var(--gold)' }}>${pledge.amount.toLocaleString()} {pledge.currency}</td>
                    <td style={{ fontSize: '0.9rem' }}>{pledge.category}</td>
                    <td style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{pledge.sponsor || '—'}</td>
                    <td><span className="badge badge-info">Pledge / Owed</span></td>
                  </tr>
                );
              })}
              {filteredPledges.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>No pledges found.</td></tr>
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
