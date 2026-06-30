import React, { useState, useMemo } from 'react';
import { useStore } from '../store';
import { ArrowUpRight, Search, FileText, Layers } from 'lucide-react';
import { useT } from '../i18n';
import { BatchDetailsModal } from '../components/BatchDetailsModal';

export const Transactions: React.FC = () => {
  const { transactions, accounts, isRtl, deleteTransactions, editTransaction } = useStore();
  const T = useT(isRtl);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAccount, setFilterAccount] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [filterMethod, setFilterMethod] = useState('');
  const [filterType, setFilterType] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showBatchDetails, setShowBatchDetails] = useState<string | null>(null);
  const PAGE_SIZE = 50;

  const filteredTransactions = transactions.filter(t => {
    if (t.batchTransactionId) return false; // Hide individual transactions that are part of a batch
    if (fromDate && t.date < fromDate) return false;
    if (toDate && t.date > toDate) return false;
    if (filterMethod && t.method !== filterMethod) return false;
    if (filterType && t.type !== filterType) return false;
    
    const matchSearch = t.notes?.toLowerCase().includes(searchTerm.toLowerCase()) || t.category?.toLowerCase().includes(searchTerm.toLowerCase()) || t.amount.toString().includes(searchTerm);
    const matchAccount = filterAccount ? (t.sourceAccountId === filterAccount || t.offsetAccountId === filterAccount) : true;
    return matchSearch && matchAccount;
  });

  const totalPages = Math.ceil(filteredTransactions.length / PAGE_SIZE);
  const paginatedTransactions = filteredTransactions.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(paginatedTransactions.map(t => t.id));
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
              Master Transactions Ledger ({filteredTransactions.length})
            </h2>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div className="search-box" style={{ width: '300px' }}>
            <Search className="search-icon" size={18} />
            <input type="text" placeholder="Search transactions..." value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }} />
          </div>
          <select className="filter-select" value={filterAccount} onChange={e => { setFilterAccount(e.target.value); setCurrentPage(1); }} style={{ minWidth: '150px' }}>
            <option value="">All Accounts</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
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
          <select className="filter-select" value={filterType} onChange={e => { setFilterType(e.target.value); setCurrentPage(1); }}>
            <option value="">All Types</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending</option>
            <option value="declined">Declined</option>
            <option value="recording">Pledge (Recording)</option>
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
            <span style={{ color: 'var(--red)', fontWeight: 600 }}>{selectedIds.length} transactions selected</span>
            <button className="btn btn-sm" style={{ background: 'var(--red)', color: 'white', border: 'none' }} onClick={() => {
              if (window.confirm(`Are you sure you want to permanently delete ${selectedIds.length} transactions?`)) {
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
                  <input type="checkbox" checked={selectedIds.length === paginatedTransactions.length && paginatedTransactions.length > 0} onChange={handleSelectAll} />
                </th>
                <th>Date</th>
                <th>Type</th>
                <th>Category / Notes</th>
                <th>Source Account (Dr)</th>
                <th>Offset Account (Cr)</th>
                <th style={{ textAlign: 'center' }}>Invoice</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {paginatedTransactions.map(t => (
                <tr key={t.id} onClick={() => { if (t.isBatch) setShowBatchDetails(t.id); }} style={{ cursor: t.isBatch ? 'pointer' : 'default', background: t.isBatch ? 'var(--blue-bg)' : '' }}>
                  <td onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedIds.includes(t.id)} onChange={() => handleSelect(t.id)} />
                  </td>
                  <td>{t.date}</td>
                  <td>
                    {t.isBatch ? (
                      <span className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Layers size={12} /> Batch
                      </span>
                    ) : (
                      <span className={`badge ${t.type === 'approved' ? 'badge-success' : 'badge-gray'}`}>{t.type}</span>
                    )}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{t.category || (t.isBatch ? 'Batch Deposit' : 'General')}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t.notes}</div>
                  </td>
                  <td>
                    <span style={{ color: 'var(--navy)', fontWeight: 600 }}>{accounts.find(a => a.id === t.sourceAccountId)?.name || '—'}</span>
                  </td>
                  <td>
                    <span style={{ color: 'var(--text-secondary)' }}>{accounts.find(a => a.id === t.offsetAccountId)?.name || '—'}</span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button 
                      className={`btn btn-sm ${t.invoiceSaved ? 'btn-primary' : 'btn-ghost'}`} 
                      onClick={() => editTransaction(t.id, { invoiceSaved: !t.invoiceSaved })}
                      title={t.invoiceSaved ? 'Invoice saved' : 'Mark invoice as saved'}
                      style={{ padding: '6px' }}
                    >
                      <FileText size={16} />
                    </button>
                  </td>
                  <td style={{ fontWeight: 700, textAlign: 'right' }}>${t.amount.toLocaleString()} {t.currency}</td>
                </tr>
              ))}
              {paginatedTransactions.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>No transactions found.</td></tr>
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

      {showBatchDetails && (
        <BatchDetailsModal batchId={showBatchDetails} onClose={() => setShowBatchDetails(null)} />
      )}
    </div>
  );
};
