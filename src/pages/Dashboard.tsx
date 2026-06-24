import React from 'react';
import { useStore } from '../store';
import { TrendingUp, Users, AlertCircle, Calendar } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { currency } = useStore();

  return (
    <div className="grid">
      <div className="grid grid-cols-4">
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h3 className="stat-label">Total Income (YTD)</h3>
            <TrendingUp size={20} className="text-success" />
          </div>
          <div className="stat-value">$1,245,000</div>
          <div className="stat-change positive">+15% from last year</div>
        </div>
        
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h3 className="stat-label">Total Donors</h3>
            <Users size={20} className="text-primary" />
          </div>
          <div className="stat-value">3,421</div>
          <div className="stat-change positive">+42 new this month</div>
        </div>

        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h3 className="stat-label">Pending Pledges</h3>
            <AlertCircle size={20} className="text-warning" />
          </div>
          <div className="stat-value">$45,200</div>
          <div className="stat-change">124 pending transactions</div>
        </div>

        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h3 className="stat-label">Upcoming Bills</h3>
            <Calendar size={20} className="text-danger" />
          </div>
          <div className="stat-value">$12,400</div>
          <div className="stat-change negative">Due within 30 days</div>
        </div>
      </div>

      <div className="grid grid-cols-2">
        <div className="card">
          <h3 className="stat-label mb-4">Recent Activity</h3>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Donor</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Avraham Schwartz</td>
                  <td>$1,000.00</td>
                  <td><span className="badge badge-success">Approved</span></td>
                  <td>Today</td>
                </tr>
                <tr>
                  <td>Yitzchok Cohen</td>
                  <td>$500.00</td>
                  <td><span className="badge badge-warning">Pending</span></td>
                  <td>Yesterday</td>
                </tr>
                <tr>
                  <td>Chaim Levy</td>
                  <td>$100.00</td>
                  <td><span className="badge badge-info">Recording</span></td>
                  <td>Jun 21, 2025</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h3 className="stat-label mb-4">Declined Cards Alert</h3>
          <div className="p-4" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
            <div className="flex items-center gap-4 mb-2">
              <AlertCircle className="text-danger" size={24} />
              <h4 style={{ margin: 0, fontWeight: 600, color: 'var(--danger)' }}>Action Required</h4>
            </div>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              4 recurring payments were declined today. The system automatically tried backup cards for 2 donors. 2 donors require manual follow-up.
            </p>
            <button className="btn btn-danger mt-4" style={{ width: '100%' }}>Review Declined Payments</button>
          </div>
        </div>
      </div>
    </div>
  );
};
