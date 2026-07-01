import React, { useState } from 'react';
import { useStore, Transaction } from '../store';
import { X, CheckCircle2, Clock, XCircle, ArrowUpRight } from 'lucide-react';
import { useT } from '../i18n';

interface PledgeDetailsModalProps {
  pledgeId: string;
  onClose: () => void;
}

export const PledgeDetailsModal: React.FC<PledgeDetailsModalProps> = ({ pledgeId, onClose }) => {
  const { pledges, transactions, donors, isRtl } = useStore();
  const T = useT(isRtl);

  const pledge = pledges.find(p => p.id === pledgeId);
  const donor = donors.find(d => d.id === pledge?.donorId);
  
  if (!pledge || !donor) return null;

  const pledgeTxs = transactions.filter(t => t.pledgeId === pledgeId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  const totalPaid = pledgeTxs.filter(t => t.type === 'approved').reduce((sum, t) => sum + (t.amountCAD ?? t.amount), 0);
  const totalAmount = pledge.amountCAD ?? pledge.amount;
  const balance = Math.max(0, totalAmount - totalPaid);

  const getStatusIcon = (type: Transaction['type']) => {
    switch(type) {
      case 'approved': return <CheckCircle2 size={16} color="var(--green)" />;
      case 'pending': return <Clock size={16} color="var(--yellow)" />;
      case 'declined': return <XCircle size={16} color="var(--red)" />;
      default: return null;
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 style={{ margin: 0, color: 'var(--navy)', fontFamily: 'Outfit, sans-serif' }}>Pledge Details</h2>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
              Donor: <span style={{ fontWeight: 600, color: 'var(--navy)' }}>{donor.name}</span>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="modal-body">
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '24px' }}>
            <div className="card" style={{ padding: '16px', background: 'var(--bg-input)', border: 'none' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Pledge</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--gold)' }}>${totalAmount.toLocaleString()}</div>
            </div>
            <div className="card" style={{ padding: '16px', background: 'var(--bg-input)', border: 'none' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Paid</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--green)' }}>${totalPaid.toLocaleString()}</div>
            </div>
            <div className="card" style={{ padding: '16px', background: 'var(--bg-input)', border: 'none' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Remaining Balance</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--navy)' }}>${balance.toLocaleString()}</div>
            </div>
          </div>

          <div style={{ background: 'var(--bg-input)', padding: '16px', borderRadius: '12px', marginBottom: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div><span style={{ color: 'var(--text-muted)' }}>Date:</span> <span style={{ fontWeight: 600 }}>{pledge.date}</span></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Category:</span> <span style={{ fontWeight: 600 }}>{pledge.category}</span></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Sponsor:</span> <span style={{ fontWeight: 600 }}>{pledge.sponsor || '—'}</span></div>
              <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--text-muted)' }}>Notes:</span> <span style={{ fontWeight: 600 }}>{pledge.notes || '—'}</span></div>
            </div>
          </div>

          <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', color: 'var(--navy)' }}>Payments Linked to this Pledge</h3>
          
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {pledgeTxs.map(t => (
                  <tr key={t.id}>
                    <td>{t.date}</td>
                    <td style={{ textTransform: 'capitalize' }}>{t.method.replace('_', ' ')}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {getStatusIcon(t.type)}
                        <span style={{ textTransform: 'capitalize' }}>{t.type}</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: t.type === 'approved' ? 'var(--green)' : 'var(--text-muted)' }}>
                      ${t.amount.toLocaleString()} {t.currency}
                    </td>
                  </tr>
                ))}
                {pledgeTxs.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                      No payments found for this pledge.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
