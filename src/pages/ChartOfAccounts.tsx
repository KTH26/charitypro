import React from 'react';
import { useStore } from '../store';
import { Plus } from 'lucide-react';

export const ChartOfAccounts: React.FC = () => {
  const { accounts } = useStore();

  const groupedAccounts = accounts.reduce((acc, account) => {
    if (!acc[account.type]) acc[account.type] = [];
    acc[account.type].push(account);
    return acc;
  }, {} as Record<string, typeof accounts>);

  const types = ['asset', 'liability', 'equity', 'revenue', 'expense'];

  return (
    <div style={{ display: 'grid', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: '1.5rem', fontFamily: 'Outfit, sans-serif', fontWeight: 800, color: 'var(--navy)' }}>
          Chart of Accounts
        </h2>
        <button className="btn btn-primary btn-sm">
          <Plus size={14} /> Add Account
        </button>
      </div>

      {types.map(type => {
        const typeAccounts = groupedAccounts[type] || [];
        if (typeAccounts.length === 0) return null;

        const typeTotal = typeAccounts.reduce((sum, a) => sum + (a.currency === 'CAD' ? a.balance : a.balance * 1.35), 0);

        return (
          <div key={type} className="card" style={{ padding: '0', overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px', background: 'var(--bg-input)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', textTransform: 'capitalize', color: 'var(--navy)', fontWeight: 800 }}>{type}s</h3>
              <div style={{ fontWeight: 700, color: 'var(--text-muted)' }}>
                Total: ${typeTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} CAD
              </div>
            </div>
            <div className="table-container">
              <table style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th>Account Name</th>
                    <th>Sub-Type</th>
                    <th>Currency</th>
                    <th style={{ textAlign: 'right' }}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {typeAccounts.map(account => (
                    <tr key={account.id}>
                      <td style={{ fontWeight: 600 }}>{account.name}</td>
                      <td style={{ textTransform: 'capitalize', color: 'var(--text-secondary)' }}>{account.subType || 'General'}</td>
                      <td style={{ fontWeight: 700, color: 'var(--text-muted)' }}>{account.currency}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: account.balance >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        ${account.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
};
