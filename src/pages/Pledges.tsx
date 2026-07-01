import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { HeartHandshake, Plus, Search, ChevronRight, Edit2, Upload } from 'lucide-react';
import { PaymentModal } from '../components/PaymentModal';
import { BulkUploadModal } from '../components/BulkUploadModal';
import { useT } from '../i18n';
import { DonorProfileModal } from '../components/DonorProfileModal';

export const Pledges: React.FC = () => {
  const { pledges, transactions, donors, isRtl, deletePledges } = useStore();
  const navigate = useNavigate();
  const T = useT(isRtl);
  const [searchTerm, setSearchTerm] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [selectedDonorId, setSelectedDonorId] = useState<string | null>(null);
  const [showDonorProfile, setShowDonorProfile] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filterYear, setFilterYear] = useState('All');
  const [filterOpen, setFilterOpen] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 50;

  // Sum of actual approved payments per donor
  const donorPayments = useMemo(() => {
    const map = new Map<string, number>();
    transactions.forEach(t => {
      if (t.type === 'approved') {
        map.set(t.donorId, (map.get(t.donorId) || 0) + (t.amountCAD ?? t.amount));
      }
    });
    return map;
  }, [transactions]);

  // Calculate open balance for each pledge
  const pledgesWithBalance = useMemo(() => {
    const sorted = [...pledges].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const remainingPayments = new Map(donorPayments);

    const mapped = sorted.map(p => {
      const amount = p.amountCAD ?? p.amount;
      const donorPaid = remainingPayments.get(p.donorId) || 0;
      let balance = 0;
      if (donorPaid >= amount) {
        remainingPayments.set(p.donorId, donorPaid - amount);
      } else {
        balance = amount - donorPaid;
        remainingPayments.set(p.donorId, 0);
      }
      return { ...p, openBalance: balance };
    });
    return mapped.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [pledges, donorPayments]);

  const years = useMemo(() => {
    const y = new Set<string>();
    pledgesWithBalance.forEach(p => y.add(p.date.substring(0, 4)));
    return Array.from(y).sort((a, b) => b.localeCompare(a));
  }, [pledgesWithBalance]);

  const filteredPledges = pledgesWithBalance.filter(p => {
    if (filterYear !== 'All' && !p.date.startsWith(filterYear)) return false;
    if (filterOpen === 'Open' && p.openBalance <= 0) return false;
    const donor = donors.find(d => d.id === p.donorId);
    if (!donor) return false;
    return donor.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.amount.toString().includes(searchTerm);
  });

  const totalPledgesAmount = filteredPledges.reduce((sum, p) => sum + (p.amountCAD ?? p.amount), 0);
  const totalPages = Math.ceil(filteredPledges.length / PAGE_SIZE);
  const paginatedPledges = filteredPledges.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

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
      setSelectedIds(paginatedPledges.map(p => p.id));
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

        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div className="search-box" style={{ width: '300px' }}>
            <Search className="search-icon" size={18} />
            <input type="text" placeholder="Search pledges by donor..." value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }} />
          </div>
          <select className="filter-select" value={filterYear} onChange={e => { setFilterYear(e.target.value); setCurrentPage(1); }}>
            <option value="All">All Years</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="filter-select" value={filterOpen} onChange={e => { setFilterOpen(e.target.value); setCurrentPage(1); }}>
            <option value="All">All Pledges</option>
            <option value="Open">Open Pledges (Has Balance)</option>
          </select>
        </div>

        {selectedIds.length > 0 && (
          <div style={{ background: 'var(--red-bg)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '12px 16px', borderRadius: '12px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--red)', fontWeight: 600 }}>{selectedIds.length} pledges selected</span>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="btn btn-sm" style={{ background: 'var(--red)', color: 'white', border: 'none' }} onClick={() => {
                if (window.confirm(`Are you sure you want to permanently delete ${selectedIds.length} pledges?`)) {
                  deletePledges(selectedIds);
                  setSelectedIds([]);
                }
              }}>Delete Selected</button>

              <button className="btn btn-sm" style={{ background: 'white', color: 'var(--red)', border: '1px solid var(--red)' }} onClick={() => {
                if (window.confirm(`WARNING: Are you sure you want to permanently delete ALL ${filteredPledges.length} pledges that match your current filter? This cannot be undone.`)) {
                  deletePledges(filteredPledges.map(p => p.id));
                  setSelectedIds([]);
                }
              }}>Delete ALL {filteredPledges.length} Matching</button>
            </div>
          </div>
        )}

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input type="checkbox" checked={selectedIds.length === paginatedPledges.length && paginatedPledges.length > 0} onChange={handleSelectAll} />
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
              {paginatedPledges.map(pledge => {
                const donor = donors.find(d => d.id === pledge.donorId);
                return (
                  <tr key={pledge.id} onClick={() => setShowDonorProfile(pledge.donorId)} style={{ cursor: 'pointer' }} className="hover-bg">
                    <td onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.includes(pledge.id)} onChange={() => handleSelect(pledge.id)} />
                    </td>
                    <td>{pledge.date}</td>
                    <td style={{ fontWeight: 600 }}>{donor?.name || 'Unknown'}</td>
                    <td style={{ fontWeight: 700, color: 'var(--gold)' }}>
                      ${pledge.amount.toLocaleString()} {pledge.currency}
                      {pledge.openBalance > 0 && pledge.openBalance < (pledge.amountCAD ?? pledge.amount) && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--red)', fontWeight: 600 }}>Bal: ${pledge.openBalance.toLocaleString()}</div>
                      )}
                    </td>
                    <td style={{ fontSize: '0.9rem' }}>{pledge.category}</td>
                    <td style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{pledge.sponsor || '—'}</td>
                    <td>
                      {pledge.openBalance > 0 ? (
                        <span className="badge badge-warning">Open Balance</span>
                      ) : (
                        <span className="badge badge-success">Paid Off</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {paginatedPledges.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>No pledges found.</td></tr>
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
      {showDonorProfile && (
        <DonorProfileModal donorId={showDonorProfile} onClose={() => setShowDonorProfile(null)} />
      )}
      {showBulkUpload && (
        <BulkUploadModal onClose={() => setShowBulkUpload(false)} />
      )}
    </div>
  );
};
