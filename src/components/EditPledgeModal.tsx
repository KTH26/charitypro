import React, { useState } from 'react';
import { useStore } from '../store';
import type { Pledge } from '../store';
import { X, Calendar, User, FileText } from 'lucide-react';

interface EditPledgeModalProps {
  pledge: Pledge;
  onClose: () => void;
}

export const EditPledgeModal: React.FC<EditPledgeModalProps> = ({ pledge, onClose }) => {
  const { editPledge, fundraisers, projects, exchangeRate } = useStore();
  const [amount, setAmount] = useState(pledge.amount.toString());
  const [currency, setCurrency] = useState<'CAD' | 'USD'>(pledge.currency as any || 'CAD');
  const [date, setDate] = useState(pledge.date);
  const [category, setCategory] = useState(pledge.category || 'General');
  const [notes, setNotes] = useState(pledge.notes || '');
  const [fundraiserId, setFundraiserId] = useState(pledge.fundraiserId || '');
  const [sponsor, setSponsor] = useState(pledge.sponsor || '');
  const [projectId, setProjectId] = useState(pledge.projectId || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || isNaN(+amount)) return;
    
    const getAmtCAD = (amt: string, curr: string) => {
      if (!amt || isNaN(+amt)) return 0;
      return curr === 'USD' ? parseFloat(amt) * exchangeRate : parseFloat(amt);
    };

    editPledge(pledge.id, {
      amount: parseFloat(amount),
      amountCAD: getAmtCAD(amount, currency),
      currency,
      date,
      category,
      fundraiserId: fundraiserId || undefined,
      sponsor: sponsor || undefined,
      projectId: projectId || undefined,
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
          
          {/* Amount + Currency */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'end' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Amount</label>
              <input 
                type="number" 
                step="0.01"
                value={amount} 
                onChange={e => setAmount(e.target.value)} 
                required 
                style={{ fontSize: '1.25rem', fontWeight: 700 }}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['CAD', 'USD'] as const).map(c => (
                <button type="button" key={c} onClick={() => setCurrency(c)} style={{
                  padding: '12px 16px', border: `2px solid ${currency === c ? 'var(--navy-light)' : 'var(--border)'}`,
                  borderRadius: '12px', background: currency === c ? 'var(--navy-bg)' : 'var(--bg-input)',
                  color: currency === c ? 'var(--navy-light)' : 'var(--text-muted)', fontWeight: 800,
                  cursor: 'pointer', transition: 'all 0.2s'
                }}>{c}</button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label><Calendar size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Referred by Fundraiser</label>
              <select value={fundraiserId} onChange={e => setFundraiserId(e.target.value)}>
                <option value="">— None —</option>
                {fundraisers.map(f => <option key={f.id} value={f.id}>{f.name} ({f.percentage}%)</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label><User size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />Sponsor (optional)</label>
              <input type="text" value={sponsor} onChange={e => setSponsor(e.target.value)} placeholder="e.g. In memory of..." />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Project Tag (optional)</label>
              <select value={projectId} onChange={e => setProjectId(e.target.value)}>
                <option value="">— No Project —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
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
            <label><FileText size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />Notes</label>
            <textarea 
              value={notes} 
              onChange={e => setNotes(e.target.value)} 
              rows={2}
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
