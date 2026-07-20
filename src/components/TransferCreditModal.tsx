import React, { useState, useMemo } from 'react';
import { useStore } from '../store';
import type { Pledge } from '../store';
import { X, ArrowRightLeft, AlertCircle } from 'lucide-react';

interface Props {
  donorId: string;
  targetPledgeId: string; // the pledge in arrears that needs credit
  targetPledgeBalance: number; // how much it needs
  onClose: () => void;
}

export const TransferCreditModal: React.FC<Props> = ({ donorId, targetPledgeId, targetPledgeBalance, onClose }) => {
  const { pledges, transactions, transferPledgeCredit } = useStore();
  const [sourcePledgeId, setSourcePledgeId] = useState('');
  const [amount, setAmount] = useState(targetPledgeBalance.toString());

  const targetPledge = pledges.find(p => p.id === targetPledgeId);

  const overpaidPledges = useMemo(() => {
    const donorPledges = pledges.filter(p => p.donorId === donorId && p.id !== targetPledgeId);
    const totals = new Map<string, number>();
    
    for (const tx of transactions) {
      if (tx.donorId === donorId && tx.type === 'approved' && tx.pledgeId) {
        totals.set(tx.pledgeId, (totals.get(tx.pledgeId) || 0) + (tx.amountCAD ?? tx.amount));
      }
    }

    return donorPledges.map(p => {
      const paid = totals.get(p.id) || 0;
      const pledgeAmount = p.amountCAD ?? p.amount;
      return {
        ...p,
        overpaidAmount: paid > pledgeAmount ? paid - pledgeAmount : 0
      };
    }).filter(p => p.overpaidAmount > 0);
  }, [donorId, targetPledgeId, pledges, transactions]);

  const selectedSource = overpaidPledges.find(p => p.id === sourcePledgeId);

  const handleTransfer = () => {
    if (!sourcePledgeId || !amount || isNaN(+amount) || +amount <= 0) return;
    transferPledgeCredit(donorId, sourcePledgeId, targetPledgeId, parseFloat(amount));
    // Trigger balance recalculation to update UI correctly since transactions changed
    useStore.getState().recalculateBalances();
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 10005 }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ArrowRightLeft size={24} color="var(--navy)" />
            Transfer Credit
          </h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        
        <div className="modal-body" style={{ display: 'grid', gap: '20px' }}>
          
          <div style={{ background: 'var(--blue-bg)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700, marginBottom: '4px' }}>Target Pledge</div>
            <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>
              {targetPledge?.date} - ${targetPledge?.amount.toLocaleString()} ({targetPledge?.category})
            </div>
            <div style={{ color: 'var(--red)', fontWeight: 700, marginTop: '4px' }}>Needs: ${targetPledgeBalance.toLocaleString()}</div>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label>Transfer From (Overpaid Pledges)</label>
            {overpaidPledges.length === 0 ? (
              <div style={{ padding: '12px', background: 'var(--yellow-bg)', color: 'var(--yellow)', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.2)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={16} /> No overpaid pledges available to transfer credit from.
              </div>
            ) : (
              <select value={sourcePledgeId} onChange={e => setSourcePledgeId(e.target.value)} style={{ padding: '12px' }}>
                <option value="">— Select Pledge —</option>
                {overpaidPledges.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.date} - ${p.amount.toLocaleString()} ({p.category}) — Overpaid by ${p.overpaidAmount.toLocaleString()}
                  </option>
                ))}
              </select>
            )}
          </div>

          {sourcePledgeId && (
            <div className="form-group" style={{ margin: 0 }}>
              <label>Amount to Transfer</label>
              <input 
                type="number" 
                step="0.01" 
                max={selectedSource?.overpaidAmount}
                value={amount} 
                onChange={e => setAmount(e.target.value)} 
                style={{ fontSize: '1.25rem', fontWeight: 700 }}
              />
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                Available credit: <strong>${selectedSource?.overpaidAmount?.toLocaleString()}</strong>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button 
              className="btn btn-primary" 
              onClick={handleTransfer} 
              disabled={!sourcePledgeId || !amount || +amount <= 0 || +amount > (selectedSource?.overpaidAmount || 0)}
              style={{ background: 'var(--navy)', color: 'white' }}
            >
              Transfer Credit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
