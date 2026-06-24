import React, { useState } from 'react';
import { useStore } from '../store';
import { CheckSquare } from 'lucide-react';
import { useT } from '../i18n';

export const Reconciliation: React.FC = () => {
  const { bankAccounts, isRtl } = useStore();
  const T = useT(isRtl);
  const [selectedBank, setSelectedBank] = useState(bankAccounts[0]?.id || '');
  const [statementBalance, setStatementBalance] = useState('');
  
  const account = bankAccounts.find(a => a.id === selectedBank);
  const diff = account ? account.balance - (parseFloat(statementBalance) || 0) : 0;

  return (
    <div style={{ display: 'grid', gap: '24px' }}>
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontFamily: 'Outfit, sans-serif', fontWeight: 700, color: 'var(--navy)' }}>
              Account Reconciliation
            </h2>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Select Account to Reconcile</label>
            <select value={selectedBank} onChange={e => setSelectedBank(e.target.value)}>
              {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Ending Statement Balance</label>
            <input type="number" placeholder="0.00" value={statementBalance} onChange={e => setStatementBalance(e.target.value)} />
          </div>
        </div>

        {account && (
          <div style={{ background: diff === 0 && statementBalance ? 'var(--green-bg)' : 'var(--bg-input)', padding: '20px', borderRadius: '12px', border: diff === 0 && statementBalance ? '1px solid var(--green)' : '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span>System Balance:</span>
              <span style={{ fontWeight: 700 }}>${account.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span>Statement Balance:</span>
              <span style={{ fontWeight: 700 }}>${(parseFloat(statementBalance) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-light)', paddingTop: '10px', marginTop: '10px' }}>
              <span style={{ fontWeight: 800 }}>Difference:</span>
              <span style={{ fontWeight: 800, color: diff === 0 ? 'var(--green)' : 'var(--red)' }}>
                ${Math.abs(diff).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div style={{ marginTop: '20px', textAlign: 'right' }}>
              <button className="btn btn-primary" disabled={diff !== 0 || !statementBalance}>
                <CheckSquare size={16} /> Reconcile Account
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
