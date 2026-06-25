import React, { useState } from 'react';
import { useStore } from '../store';
import { Search } from 'lucide-react';
import { useT } from '../i18n';

export const Transactions: React.FC = () => {
  const { transactions, accounts, isRtl, deleteTransactions } = useStore();
  const T = useT(isRtl);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAccount, setFilterAccount] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const filteredTransactions = transactions.filter(t => {
    const matchSearch = t.notes?.toLowerCase().includes(searchTerm.toLowerCase()) || t.category?.toLowerCase().includes(searchTerm.toLowerCase()) || t.amount.toString().includes(searchTerm);
    const matchAccount = filterAccount ? (t.sourceAccountId === filterAccount || t.offsetAccountId === filterAccount) : true;
    return matchSearch && matchAccount;
  });

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(filteredTransactions.map(t => t.id));
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

        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
          <div className="search-box" style={{ width: '300px' }}>
            <Search className="search-icon" size={18} />
            <input type="text" placeholder="Search transactions..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <select className="filter-select" value={filterAccount} onChange={e => setFilterAccount(e.target.value)} style={{ minWidth: '200px' }}>
            <option value="">All Accounts</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
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
                  <input type="checkbox" checked={selectedIds.length === filteredTransactions.length && filteredTransactions.length > 0} onChange={handleSelectAll} />
                </th>
                <th>Date</th>
                <th>Type</th>
                <th>Category / Notes</th>
                <th>Source Account (Dr)</th>
                <th>Offset Account (Cr)</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map(t => (
                <tr key={t.id}>
                  <td>
                    <input type="checkbox" checked={selectedIds.includes(t.id)} onChange={() => handleSelect(t.id)} />
                  </td>
                  <td>{t.date}</td>
                  <td><span className={`badge ${t.type === 'approved' ? 'badge-success' : 'badge-gray'}`}>{t.type}</span></td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{t.category || 'General'}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t.notes}</div>
                  </td>
                  <td>
                    <span style={{ color: 'var(--navy)', fontWeight: 600 }}>{accounts.find(a => a.id === t.sourceAccountId)?.name || '—'}</span>
                  </td>
                  <td>
                    <span style={{ color: 'var(--text-secondary)' }}>{accounts.find(a => a.id === t.offsetAccountId)?.name || '—'}</span>
                  </td>
                  <td style={{ fontWeight: 700, textAlign: 'right' }}>${t.amount.toLocaleString()} {t.currency}</td>
                </tr>
              ))}
              {filteredTransactions.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>No transactions found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
