import React, { useState } from 'react';
import { useStore } from '../store';
import type { Pledge } from '../store';
import { X } from 'lucide-react';

interface EditPledgeModalProps {
  pledge: Pledge;
  onClose: () => void;
}

export const EditPledgeModal: React.FC<EditPledgeModalProps> = ({ pledge, onClose }) => {
  const { editPledge } = useStore();
  const [amount, setAmount] = useState(pledge.amount.toString());
  const [date, setDate] = useState(pledge.date);
  const [category, setCategory] = useState(pledge.category || 'General');
  const [notes, setNotes] = useState(pledge.notes || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || isNaN(+amount)) return;
    
    editPledge(pledge.id, {
      amount: parseFloat(amount),
      date,
      category,
      notes,
    });
    
    // Also trigger balance recalculation
    const { recalculateBalances } = useStore.getState();
    recalculateBalances();
    
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 10000 }}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ margin: 0 }}>Edit Pledge</h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body" style={{ display: 'grid', gap: '16px' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Amount</label>
            <input 
              type="number" 
              step="0.01"
              value={amount} 
              onChange={e => setAmount(e.target.value)} 
              required 
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Date</label>
            <input 
              type="date" 
              value={date} 
              onChange={e => setDate(e.target.value)} 
              required 
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Category</label>
            <input 
              type="text" 
              value={category} 
              onChange={e => setCategory(e.target.value)} 
              required 
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Notes</label>
            <textarea 
              value={notes} 
              onChange={e => setNotes(e.target.value)} 
              rows={3}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  );
};
