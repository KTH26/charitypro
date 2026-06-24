import React, { useState } from 'react';
import { useStore } from '../store';
import { Search, Building, Filter } from 'lucide-react';
import { useT } from '../i18n';

export const Transactions: React.FC = () => {
  const { transactions, bankAccounts, isRtl } = useStore();
  const T = useT(isRtl);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAccount, setFilterAccount] = useState('');

  const filteredTransactions = transactions.filter(t => {
    const matchSearch = t.notes?.toLowerCase().includes(searchTerm.toLowerCase()) || t.category?.toLowerCase().includes(searchTerm.toLowerCase()) || t.amount.toString().includes(searchTerm);
    const matchAccount = filterAccount ? t.bankAccountId === filterAccount : true;
    return matchSearch && matchAccount;
  });

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
            <option value="">All Bank Accounts</option>
            {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Category / Notes</th>
                <th>Bank Account</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map(t => (
                <tr key={t.id}>
                  <td>{t.date}</td>
                  <td><span className={`badge ${t.type === 'approved' ? 'badge-success' : 'badge-gray'}`}>{t.type}</span></td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{t.category || 'General'}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t.notes}</div>
                  </td>
                  <td>{bankAccounts.find(a => a.id === t.bankAccountId)?.name || '—'}</td>
                  <td style={{ fontWeight: 700 }}>${t.amount.toLocaleString()} {t.currency}</td>
                </tr>
              ))}
              {filteredTransactions.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>No transactions found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
