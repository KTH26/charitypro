import React from 'react';
import { useStore } from '../store';
import { HeartHandshake, Percent, DollarSign } from 'lucide-react';

export const Fundraisers: React.FC = () => {
  const { fundraisers } = useStore();

  return (
    <div className="grid">
      <div className="flex justify-between items-center mb-6">
        <h2 className="header-title" style={{ fontSize: '1.25rem' }}>Fundraisers Management</h2>
        <button className="btn btn-primary">+ Add Fundraiser</button>
      </div>

      <div className="grid grid-cols-2">
        {fundraisers.map(fundraiser => (
          <div key={fundraiser.id} className="card">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-4">
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <HeartHandshake size={24} className="text-success" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>{fundraiser.name}</h3>
                  <div className="flex items-center gap-2" style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                    <Percent size={14} /> {fundraiser.percentage}% Commission
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center p-4 mb-4" style={{ backgroundColor: 'var(--surface-lighter)', borderRadius: '8px' }}>
              <div>
                <div className="stat-label">Balance Owed</div>
                <div className="stat-value text-warning" style={{ fontSize: '1.5rem', margin: '4px 0 0 0' }}>
                  ${fundraiser.balanceOwed.toLocaleString()}
                </div>
              </div>
              <button className="btn btn-secondary">
                <DollarSign size={16} /> Pay Out
              </button>
            </div>

            <h4 className="stat-label mb-4">Recent Referrals</h4>
            <table style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th style={{ padding: '8px 0' }}>Donor</th>
                  <th style={{ padding: '8px 0' }}>Amount</th>
                  <th style={{ padding: '8px 0', textAlign: 'right' }}>Commission</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: '8px 0' }}>Chaim Levy</td>
                  <td style={{ padding: '8px 0' }}>$1,000.00</td>
                  <td style={{ padding: '8px 0', textAlign: 'right', color: 'var(--success)' }}>
                    ${(1000 * (fundraiser.percentage / 100)).toLocaleString()}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 0' }}>Shlomo Greenberg</td>
                  <td style={{ padding: '8px 0' }}>$500.00</td>
                  <td style={{ padding: '8px 0', textAlign: 'right', color: 'var(--success)' }}>
                    ${(500 * (fundraiser.percentage / 100)).toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
};
