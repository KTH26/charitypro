import React, { useState } from 'react';
import { useStore } from '../store';
import { Search, CalendarClock, Play, Pause } from 'lucide-react';
import { useT } from '../i18n';

export const Schedules: React.FC = () => {
  const { recurringPayments, donors, toggleRecurring, isRtl } = useStore();
  const T = useT(isRtl);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredSchedules = recurringPayments.filter(r => {
    const donor = donors.find(d => d.id === r.donorId);
    if (!donor) return false;
    return donor.name.toLowerCase().includes(searchTerm.toLowerCase()) || r.amount.toString().includes(searchTerm);
  });

  const activeCount = filteredSchedules.filter(r => r.active).length;
  const pausedCount = filteredSchedules.filter(r => !r.active).length;

  const methodLabel: Record<string, string> = {
    credit_card: 'Credit Card', check: 'Check', cash: 'Cash', e_transfer: 'E-Transfer'
  };

  return (
    <div style={{ display: 'grid', gap: '24px' }}>
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontFamily: 'Outfit, sans-serif', fontWeight: 700, color: 'var(--navy)' }}>
              Scheduled Transactions ({filteredSchedules.length})
            </h2>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
              <span style={{ color: 'var(--green)', fontWeight: 700 }}>{activeCount} Active</span> · {pausedCount} Paused
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
          <div className="search-box" style={{ width: '300px' }}>
            <Search className="search-icon" size={18} />
            <input type="text" placeholder="Search schedules..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Donor</th>
                <th>Amount</th>
                <th>Frequency</th>
                <th>Next Date</th>
                <th>Method</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredSchedules.map(schedule => {
                const donor = donors.find(d => d.id === schedule.donorId);
                return (
                  <tr key={schedule.id} style={{ opacity: schedule.active ? 1 : 0.6 }}>
                    <td style={{ fontWeight: 600 }}>{donor?.name || 'Unknown'}</td>
                    <td style={{ fontWeight: 700, color: 'var(--navy)' }}>${schedule.amount.toLocaleString()} {schedule.currency}</td>
                    <td style={{ textTransform: 'capitalize' }}>{schedule.frequency}</td>
                    <td>{schedule.nextDate}</td>
                    <td>{methodLabel[schedule.method]}</td>
                    <td>
                      <span className={`badge ${schedule.active ? 'badge-green' : 'badge-gray'}`}>
                        {schedule.active ? 'Active' : 'Paused'}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => toggleRecurring(schedule.id)}>
                        {schedule.active ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Resume</>}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredSchedules.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>No scheduled transactions found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
