import React, { useState } from 'react';
import { useStore } from '../store';
import { Search, Filter, ChevronRight, UserCircle } from 'lucide-react';

export const Donors: React.FC = () => {
  const { donors } = useStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDonor, setSelectedDonor] = useState<string | null>(null);

  const filteredDonors = donors.filter(d => 
    d.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    d.phone.includes(searchTerm)
  );

  return (
    <div className="grid grid-cols-3">
      <div className="card" style={{ gridColumn: selectedDonor ? 'span 1' : 'span 3' }}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="header-title" style={{ fontSize: '1.25rem' }}>Donors Directory</h2>
          <button className="btn btn-primary">+ Add Donor</button>
        </div>
        
        <div className="flex gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 text-secondary" size={18} />
            <input 
              type="text" 
              className="form-input" 
              style={{ paddingLeft: '40px' }}
              placeholder="Search donors by name, phone..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="btn btn-secondary">
            <Filter size={18} /> Filter
          </button>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Total Given</th>
                <th>Balance</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredDonors.map(donor => (
                <tr 
                  key={donor.id} 
                  style={{ cursor: 'pointer', backgroundColor: selectedDonor === donor.id ? 'rgba(79, 70, 229, 0.1)' : 'transparent' }}
                  onClick={() => setSelectedDonor(donor.id)}
                >
                  <td className="flex items-center gap-2">
                    <UserCircle className="text-secondary" />
                    <span style={{ fontWeight: 500 }}>{donor.name}</span>
                  </td>
                  <td>{donor.phone}</td>
                  <td className="text-success">${donor.totalGiven.toLocaleString()}</td>
                  <td className={donor.balanceOwed > 0 ? 'text-danger' : ''}>
                    ${donor.balanceOwed.toLocaleString()}
                  </td>
                  <td className="text-right">
                    <ChevronRight size={18} className="text-secondary" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedDonor && (
        <div className="card" style={{ gridColumn: 'span 2' }}>
          {/* Donor Detail View */}
          {donors.filter(d => d.id === selectedDonor).map(donor => (
            <div key={donor.id}>
              <div className="flex justify-between items-start mb-6 pb-6" style={{ borderBottom: '1px solid var(--border-color)' }}>
                <div className="flex items-center gap-4">
                  <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'var(--surface-lighter)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <UserCircle size={40} className="text-secondary" />
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>{donor.name}</h2>
                    <div style={{ color: 'var(--text-secondary)' }}>{donor.address}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="stat-label">Total Balance Owed</div>
                  <div className="stat-value text-danger" style={{ fontSize: '1.5rem' }}>${donor.balanceOwed.toLocaleString()}</div>
                </div>
              </div>

              <div className="tabs">
                <div className="tab active">Overview</div>
                <div className="tab">Pledges</div>
                <div className="tab">Transactions</div>
                <div className="tab text-danger">Declined</div>
                <div className="tab">Notes</div>
              </div>

              <div className="grid grid-cols-2 mb-6">
                <div className="glass-card">
                  <h4 className="stat-label mb-4">Payment Methods</h4>
                  <div className="flex justify-between items-center mb-2 p-3" style={{ backgroundColor: 'var(--surface-dark)', borderRadius: '8px', border: '1px solid var(--primary-color)' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>Visa ending in 4242</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Expires 12/26 (Default)</div>
                    </div>
                    <span className="badge badge-info">Active</span>
                  </div>
                  <div className="flex justify-between items-center p-3" style={{ backgroundColor: 'var(--surface-dark)', borderRadius: '8px' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>Mastercard ending in 5555</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Expires 08/25 (Backup)</div>
                    </div>
                    <span className="badge badge-secondary">Backup</span>
                  </div>
                  <button className="btn btn-secondary mt-4" style={{ width: '100%' }}>+ Add Payment Method</button>
                </div>

                <div className="glass-card">
                  <h4 className="stat-label mb-4">Quick Actions</h4>
                  <div className="grid" style={{ gap: '12px' }}>
                    <button className="btn btn-primary w-full justify-center">Process Payment Now</button>
                    <button className="btn btn-secondary w-full justify-center">Setup Recurring (Recording)</button>
                    <button className="btn btn-secondary w-full justify-center">Send SMS/Email Receipt</button>
                  </div>
                </div>
              </div>

              <h4 className="stat-label mb-4">Recent Transactions</h4>
              <table className="mb-4">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Type</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Jun 20, 2025</td>
                    <td>$1,000.00</td>
                    <td>Credit Card (4242)</td>
                    <td><span className="badge badge-success">Approved</span></td>
                  </tr>
                  <tr>
                    <td>May 20, 2025</td>
                    <td>$100.00</td>
                    <td>Monthly Recording</td>
                    <td><span className="badge badge-success">Approved</span></td>
                  </tr>
                  <tr>
                    <td>May 18, 2025</td>
                    <td>$100.00</td>
                    <td>Monthly Recording</td>
                    <td><span className="badge badge-danger">Declined (Moved to 4242)</span></td>
                  </tr>
                </tbody>
              </table>

            </div>
          ))}
        </div>
      )}
    </div>
  );
};
