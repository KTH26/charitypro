import React from 'react';
import { Calendar, CreditCard, DollarSign } from 'lucide-react';

export const Expenses: React.FC = () => {
  return (
    <div className="grid grid-cols-2">
      <div className="card">
        <div className="flex justify-between items-center mb-6">
          <h2 className="header-title" style={{ fontSize: '1.25rem' }}>Upcoming Bills & Scheduled Payments</h2>
          <button className="btn btn-primary">+ Add Bill</button>
        </div>
        
        <div className="grid gap-4">
          {[
            { vendor: 'Hatzolah Maintenance', amount: 1250.00, dueDate: '2025-07-01', status: 'pending' },
            { vendor: 'Fuel Supplier', amount: 3400.00, dueDate: '2025-06-25', status: 'urgent' },
            { vendor: 'Office Rent', amount: 2000.00, dueDate: '2025-07-05', status: 'pending' }
          ].map(bill => (
            <div key={bill.vendor} className="flex justify-between items-center p-4" style={{ backgroundColor: 'var(--surface-lighter)', borderRadius: '8px' }}>
              <div className="flex items-center gap-4">
                <Calendar className={bill.status === 'urgent' ? 'text-danger' : 'text-primary'} />
                <div>
                  <div style={{ fontWeight: 600 }}>{bill.vendor}</div>
                  <div style={{ fontSize: '0.875rem', color: bill.status === 'urgent' ? 'var(--danger)' : 'var(--text-secondary)' }}>
                    Due: {bill.dueDate}
                  </div>
                </div>
              </div>
              <div className="text-right flex items-center gap-4">
                <div className="stat-value" style={{ fontSize: '1.25rem', margin: 0 }}>${bill.amount.toFixed(2)}</div>
                <button className="btn btn-secondary" style={{ padding: '6px 12px' }}>Pay Now</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 className="header-title mb-6" style={{ fontSize: '1.25rem' }}>Expense Categories</h2>
        <table className="mb-6">
          <thead>
            <tr>
              <th>Category</th>
              <th>Sub-Category</th>
              <th>YTD Spent</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Ambulance Operations</td>
              <td>Fuel</td>
              <td>$24,500</td>
            </tr>
            <tr>
              <td>Ambulance Operations</td>
              <td>Maintenance</td>
              <td>$12,300</td>
            </tr>
            <tr>
              <td>Administration</td>
              <td>Rent</td>
              <td>$14,000</td>
            </tr>
            <tr>
              <td>Fundraising</td>
              <td>Events</td>
              <td>$5,400</td>
            </tr>
          </tbody>
        </table>
        <button className="btn btn-secondary w-full">+ Manage Categories</button>
      </div>
    </div>
  );
};
