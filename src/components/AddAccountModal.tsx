import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useStore } from '../store';
import { useT } from '../i18n';

interface Props {
  onClose: () => void;
}

export const AddAccountModal: React.FC<Props> = ({ onClose }) => {
  const { addAccount, isRtl } = useStore();
  const T = useT(isRtl);
  
  const [name, setName] = useState('');
  const [type, setType] = useState<'asset' | 'liability' | 'equity' | 'revenue' | 'expense'>('asset');
  const [subType, setSubType] = useState<'checking' | 'savings' | 'credit_card' | 'loan' | 'payroll' | 'general' | 'internal'>('checking');
  const [currency, setCurrency] = useState<'CAD' | 'USD'>('CAD');
  const [balance, setBalance] = useState('');

  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!name.trim()) {
      setError('Account name is required');
      return;
    }
    
    addAccount({
      name: name.trim(),
      type,
      subType,
      currency,
      balance: parseFloat(balance) || 0
    });
    
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ margin: 0 }}>Add New Account</h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        
        <div className="modal-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Account Name</label>
              <input type="text" value={name} onChange={e => { setName(e.target.value); setError(''); }} placeholder="e.g. BMO Checking" />
              {error && <span style={{ color: 'var(--red)', fontSize: '0.8rem', marginTop: '4px' }}>{error}</span>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Account Type</label>
                <select value={type} onChange={e => setType(e.target.value as any)}>
                  <option value="asset">Asset (Bank Accounts)</option>
                  <option value="liability">Liability (Credit Cards/Loans)</option>
                  <option value="equity">Equity</option>
                  <option value="revenue">Revenue (Income/Donations)</option>
                  <option value="expense">Expense (Bills/Payroll)</option>
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Sub-Type</label>
                <select value={subType} onChange={e => setSubType(e.target.value as any)}>
                  <option value="checking">Checking</option>
                  <option value="savings">Savings</option>
                  <option value="credit_card">Credit Card</option>
                  <option value="loan">Loan</option>
                  <option value="payroll">Payroll</option>
                  <option value="general">General</option>
                  <option value="internal">Internal</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Currency</label>
                <select value={currency} onChange={e => setCurrency(e.target.value as any)}>
                  <option value="CAD">CAD</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Starting Balance</label>
                <input type="number" value={balance} onChange={e => setBalance(e.target.value)} placeholder="0.00" />
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit}>Create Account</button>
        </div>
      </div>
    </div>
  );
};
