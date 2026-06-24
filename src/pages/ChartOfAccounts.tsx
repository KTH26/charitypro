import React from 'react';
import { useStore } from '../store';
import { Building, Plus } from 'lucide-react';
import { useT } from '../i18n';

export const ChartOfAccounts: React.FC = () => {
  const { bankAccounts, isRtl } = useStore();
  const T = useT(isRtl);

  const totalBalance = bankAccounts.reduce((sum, a) => sum + (a.currency === 'CAD' ? a.balance : a.balance * 1.35), 0);

  return (
    <div style={{ display: 'grid', gap: '24px' }}>
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontFamily: 'Outfit, sans-serif', fontWeight: 700, color: 'var(--navy)' }}>
              Chart of Accounts
            </h2>
            <div style={{ color: 'var(--navy-light)', fontWeight: 700, marginTop: '4px' }}>
              Total Equivalent Balance: ${totalBalance.toLocaleString('en-CA', { minimumFractionDigits: 2 })} CAD
            </div>
          </div>
          <button className="btn btn-primary btn-sm">
            <Plus size={14} /> Add Account
          </button>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Account Name</th>
                <th>Type</th>
                <th>Currency</th>
                <th>Current Balance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {bankAccounts.map(account => (
                <tr key={account.id}>
                  <td style={{ fontWeight: 600 }}>{account.name}</td>
                  <td style={{ textTransform: 'capitalize' }}>{account.type} {account.isInternal && '(Payroll/Hidden)'}</td>
                  <td style={{ fontWeight: 700, color: 'var(--text-muted)' }}>{account.currency}</td>
                  <td style={{ fontWeight: 800, color: account.balance >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    ${account.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td><span className="badge badge-success">Active</span></td>
                </tr>
              ))}
              {bankAccounts.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>No accounts found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
