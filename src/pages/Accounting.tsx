import React from 'react';
import { useStore } from '../store';
import { RefreshCw, CheckCircle, HelpCircle } from 'lucide-react';

export const Accounting: React.FC = () => {
  return (
    <div className="grid">
      <div className="grid grid-cols-3">
        <div className="card">
          <h3 className="stat-label">BMO Canadian Account</h3>
          <div className="stat-value text-primary">$124,500.00</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Account ending in 8899</p>
        </div>
        <div className="card">
          <h3 className="stat-label">Chase USD Account</h3>
          <div className="stat-value text-success">$45,200.00</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Account ending in 4455</p>
        </div>
        <div className="card">
          <h3 className="stat-label">Total Liabilities (Fundraisers)</h3>
          <div className="stat-value text-warning">$1,650.00</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Owed to internal reps</p>
        </div>
      </div>

      <div className="grid grid-cols-2">
        <div className="card">
          <div className="flex justify-between items-center mb-6">
            <h3 className="stat-label">Bank Feed Match</h3>
            <button className="btn btn-secondary"><RefreshCw size={16} /> Sync</button>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '16px' }}>
            System automatically matches bank transactions to pledges/payments.
          </p>
          
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Bank Trans.</th>
                  <th>System Match</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <div style={{ fontWeight: 600 }}>Deposit - Check 442</div>
                    <div className="text-success">$500.00</div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>Yitzchok Cohen</div>
                    <div className="text-secondary" style={{ fontSize: '0.75rem' }}>Pending Check</div>
                  </td>
                  <td>
                    <button className="btn btn-primary" style={{ padding: '6px 12px' }}>Confirm</button>
                  </td>
                </tr>
                <tr>
                  <td>
                    <div style={{ fontWeight: 600 }}>Cardnox Payout</div>
                    <div className="text-success">$1,000.00</div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>Avraham Schwartz</div>
                    <div className="text-secondary" style={{ fontSize: '0.75rem' }}>Credit Card (Approved)</div>
                  </td>
                  <td>
                    <button className="btn btn-primary" style={{ padding: '6px 12px' }}>Confirm</button>
                  </td>
                </tr>
                <tr>
                  <td>
                    <div style={{ fontWeight: 600 }}>Unknown Deposit</div>
                    <div className="text-success">$150.00</div>
                  </td>
                  <td>
                    <span className="text-warning">No match found</span>
                  </td>
                  <td>
                    <button className="btn btn-secondary" style={{ padding: '6px 12px' }}>Categorize</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="flex justify-between items-center mb-6">
            <h3 className="stat-label">Chart of Accounts</h3>
            <button className="btn btn-primary" style={{ padding: '6px 12px' }}>+ New Account</button>
          </div>
          <div className="grid gap-2">
            {[
              { name: 'Income - Unrestricted', type: 'Income', balance: '$850,000' },
              { name: 'Income - Specific Campaign', type: 'Income', balance: '$395,000' },
              { name: 'Expense - Ambulance Maintenance', type: 'Expense', balance: '$45,000' },
              { name: 'Expense - Fuel', type: 'Expense', balance: '$12,000' },
              { name: 'Liability - Fundraiser Payouts', type: 'Liability', balance: '$1,650' }
            ].map(acc => (
              <div key={acc.name} className="flex justify-between items-center p-3" style={{ backgroundColor: 'var(--surface-lighter)', borderRadius: '8px' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{acc.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{acc.type}</div>
                </div>
                <div style={{ fontWeight: 600 }}>{acc.balance}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
