import React from 'react';
import { useStore } from '../store';
import { X } from 'lucide-react';

export const CategoryBillsModal: React.FC<{ categoryId: string; onClose: () => void }> = ({ categoryId, onClose }) => {
  const { bills, accounts, projects } = useStore();
  
  const category = accounts.find(a => a.id === categoryId);
  const categoryBills = bills.filter(b => b.category === categoryId).sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  
  const total = categoryBills.reduce((s, b) => s + b.amount, 0);

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '600px', maxWidth: '90vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-card)' }}>
        <div className="modal-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            Bills for Category: {category?.name}
          </h2>
          <button className="btn btn-ghost" style={{ padding: '8px' }} onClick={onClose}><X size={20} /></button>
        </div>
        
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {categoryBills.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              No bills attached to this category.
            </div>
          ) : (
            <>
              <div style={{ marginBottom: '16px', fontWeight: 700, color: 'var(--navy)', fontSize: '1.1rem' }}>
                Total: ${total.toLocaleString('en-CA', { minimumFractionDigits: 2 })}
              </div>
              <table style={{ width: '100%', fontSize: '0.9rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '8px 4px' }}>Date</th>
                    <th style={{ padding: '8px 4px' }}>Vendor</th>
                    <th style={{ padding: '8px 4px' }}>Project</th>
                    <th style={{ padding: '8px 4px' }}>Status</th>
                    <th style={{ padding: '8px 4px', textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryBills.map(b => {
                    const project = projects.find(p => p.id === b.projectId);
                    return (
                      <tr key={b.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px 4px' }}>{b.dueDate}</td>
                        <td style={{ padding: '12px 4px', fontWeight: 600 }}>{b.vendor}</td>
                        <td style={{ padding: '12px 4px' }}>{project ? project.name : '-'}</td>
                        <td style={{ padding: '12px 4px' }}>
                          <span style={{ 
                            padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600,
                            background: b.status === 'paid' ? 'var(--green-bg)' : b.status === 'pending' ? 'var(--yellow-bg)' : 'var(--red-bg)',
                            color: b.status === 'paid' ? 'var(--green)' : b.status === 'pending' ? 'var(--yellow)' : 'var(--red)'
                          }}>
                            {b.status.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '12px 4px', textAlign: 'right', fontWeight: 700 }}>
                          ${b.amount.toLocaleString('en-CA', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
