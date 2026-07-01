import React, { useState } from 'react';
import { useStore } from '../store';
import { Search, CalendarClock, Play, Pause, Trash2, CheckSquare } from 'lucide-react';
import { useT } from '../i18n';

export const Schedules: React.FC = () => {
  const { recurringPayments, donors, toggleRecurring, deleteRecurring, deleteAllRecurring, isRtl } = useStore();
  const T = useT(isRtl);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filteredSchedules = recurringPayments.filter(r => {
    const donor = donors.find(d => d.id === r.donorId);
    if (!donor) return false;
    return donor.name.toLowerCase().includes(searchTerm.toLowerCase()) || r.amount.toString().includes(searchTerm);
  });

  const activeCount = filteredSchedules.filter(r => r.active).length;
  const pausedCount = filteredSchedules.filter(r => !r.active).length;

  const totalPages = Math.ceil(filteredSchedules.length / itemsPerPage);
  const paginatedSchedules = filteredSchedules.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const methodLabel: Record<string, string> = {
    credit_card: 'Credit Card', check: 'Check', cash: 'Cash', e_transfer: 'E-Transfer', vouchers: 'Vouchers', eizer: 'Eizer', bnei_leivy: 'Bnei Leivy', other: 'Other'
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(paginatedSchedules.map(s => s.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    if (confirm(`Are you sure you want to delete ${selectedIds.size} scheduled payments?`)) {
      deleteRecurring(Array.from(selectedIds));
      setSelectedIds(new Set());
    }
  };

  const handleDeleteAll = () => {
    if (recurringPayments.length === 0) return;
    if (confirm(`WARNING: Are you sure you want to delete ALL ${recurringPayments.length} scheduled payments? This cannot be undone.`)) {
      deleteAllRecurring();
      setSelectedIds(new Set());
    }
  };

  const handleDeleteSingle = (id: string) => {
    if (confirm('Are you sure you want to delete this scheduled payment?')) {
      deleteRecurring([id]);
    }
  };

  return (
    <div style={{ display: 'grid', gap: '24px' }}>
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontFamily: 'Outfit, sans-serif', fontWeight: 700, color: 'var(--navy)' }}>
              Scheduled Transactions ({filteredSchedules.length})
            </h2>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
              <span style={{ color: 'var(--green)', fontWeight: 700 }}>{activeCount} Active</span> · {pausedCount} Paused
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            {selectedIds.size > 0 && (
              <button className="btn btn-secondary" style={{ color: 'var(--red)', borderColor: 'var(--red)' }} onClick={handleDeleteSelected}>
                <Trash2 size={16} /> Delete Selected ({selectedIds.size})
              </button>
            )}
            <button className="btn btn-secondary" style={{ color: 'var(--red)', borderColor: 'var(--red)' }} onClick={handleDeleteAll}>
              <Trash2 size={16} /> Delete All
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
          <div className="search-box" style={{ width: '300px' }}>
            <Search className="search-icon" size={18} />
            <input type="text" placeholder="Search schedules..." value={searchTerm} onChange={e => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }} />
          </div>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input 
                    type="checkbox" 
                    checked={paginatedSchedules.length > 0 && selectedIds.size === paginatedSchedules.length}
                    onChange={handleSelectAll}
                  />
                </th>
                <th>Donor</th>
                <th>Amount</th>
                <th>Frequency</th>
                <th>Next Date</th>
                <th>End Date</th>
                <th>Method</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedSchedules.map(schedule => {
                const donor = donors.find(d => d.id === schedule.donorId);
                return (
                  <tr key={schedule.id} style={{ opacity: schedule.active ? 1 : 0.6 }}>
                    <td>
                      <input 
                        type="checkbox" 
                        checked={selectedIds.has(schedule.id)}
                        onChange={() => handleSelect(schedule.id)}
                      />
                    </td>
                    <td style={{ fontWeight: 600 }}>{donor?.name || 'Unknown'}</td>
                    <td style={{ fontWeight: 700, color: 'var(--navy)' }}>${schedule.amount.toLocaleString()} {schedule.currency}</td>
                    <td style={{ textTransform: 'capitalize' }}>{schedule.frequency}</td>
                    <td>{schedule.nextDate}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{schedule.endDate || 'No end'}</td>
                    <td>{methodLabel[schedule.method]}</td>
                    <td>
                      <span className={`badge ${schedule.active ? 'badge-green' : 'badge-gray'}`}>
                        {schedule.active ? 'Active' : 'Paused'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => toggleRecurring(schedule.id)}>
                          {schedule.active ? <Pause size={14} /> : <Play size={14} />}
                        </button>
                        <button className="btn btn-secondary btn-sm" style={{ color: 'var(--red)', padding: '6px' }} onClick={() => handleDeleteSingle(schedule.id)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredSchedules.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>No scheduled transactions found.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '24px', gap: '16px' }}>
            <button 
              className="btn btn-secondary btn-sm" 
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              Page {currentPage} of {totalPages}
            </span>
            <button 
              className="btn btn-secondary btn-sm" 
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
