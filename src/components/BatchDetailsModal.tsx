import React from 'react';
import { useStore } from '../store';
import { X } from 'lucide-react';

interface Props {
  batchId: string;
  onClose: () => void;
}

export const BatchDetailsModal: React.FC<Props> = ({ batchId, onClose }) => {
  const { transactions, donors } = useStore();
  
  const batchTx = transactions.find(t => t.id === batchId);
  const childTxs = transactions.filter(t => t.batchTransactionId === batchId);

  if (!batchTx) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%' }}>
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Batch Details</h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        
        <div style={{ padding: '16px', background: 'var(--bg-input)', borderRadius: '8px', marginBottom: '16px' }}>
          <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--navy)' }}>{batchTx.notes || 'Batch Deposit'}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            {batchTx.date} · Total: <span style={{ fontWeight: 700, color: 'var(--green)' }}>${batchTx.amount.toLocaleString()}</span>
          </div>
        </div>

        <div className="table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Donor</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {childTxs.map(t => {
                const donor = donors.find(d => d.id === t.donorId);
                return (
                  <tr key={t.id}>
                    <td>{t.date}</td>
                    <td style={{ fontWeight: 600 }}>{donor?.name || 'Unknown'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>${Number(t.amountCAD ?? t.amount).toLocaleString()}</td>
                  </tr>
                );
              })}
              {childTxs.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>No transactions found in this batch.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
