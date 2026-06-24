import React, { useState } from 'react';
import { useStore } from '../store';
import { RefreshCw, Plus, X, ArrowRight } from 'lucide-react';

export const Accounting: React.FC = () => {
  const { bankAccounts, accountTransfers, transactions, addBankAccount, transferBetweenAccounts, fundraisers } = useStore();
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [accForm, setAccForm] = useState({ name: '', currency: 'CAD' as 'CAD' | 'USD', type: 'checking' as 'checking' | 'savings' });
  const [transferForm, setTransferForm] = useState({ fromId: '', toId: '', amount: '', notes: '' });
  const [transferSuccess, setTransferSuccess] = useState(false);

  const regularAccounts = bankAccounts.filter(a => !a.isInternal);
  const internalAccounts = bankAccounts.filter(a => a.isInternal);

  const bankFeedItems = [
    { bank: 'Deposit – Check 442', amount: 500, match: 'Yitzchok Cohen', sub: 'Pending Check', status: 'match' },
    { bank: 'Cardnox Payout', amount: 1000, match: 'Avraham Schwartz', sub: 'Credit Card (Approved)', status: 'match' },
    { bank: 'Unknown Deposit', amount: 150, match: null, sub: 'No match found', status: 'unmatched' },
  ];

  const handleTransfer = () => {
    if (!transferForm.fromId || !transferForm.toId || !transferForm.amount) return;
    transferBetweenAccounts({
      fromAccountId: transferForm.fromId,
      toAccountId: transferForm.toId,
      amount: parseFloat(transferForm.amount),
      date: new Date().toISOString().split('T')[0],
      notes: transferForm.notes,
    });
    setTransferSuccess(true);
    setTimeout(() => { setTransferSuccess(false); setShowTransfer(false); setTransferForm({ fromId: '', toId: '', amount: '', notes: '' }); }, 1800);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Bank Account Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
        {regularAccounts.map(acc => (
          <div key={acc.id} className="card" style={{ padding: '24px' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>{acc.name}</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: acc.currency === 'USD' ? 'var(--green)' : 'var(--navy)', fontFamily: 'Outfit, sans-serif', marginBottom: '4px' }}>
              ${acc.balance.toLocaleString()}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{acc.currency} Account</div>
          </div>
        ))}
      </div>

      {/* Account Actions */}
      <div style={{ display: 'flex', gap: '12px' }}>
        <button className="btn btn-primary" onClick={() => setShowTransfer(true)}>
          <ArrowRight size={16} /> Transfer Between Accounts
        </button>
        <button className="btn btn-secondary" onClick={() => setShowAddAccount(true)}>
          <Plus size={16} /> Add Bank Account
        </button>
      </div>

      {/* Main two-column section */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>

        {/* Bank Feed Matching */}
        <div className="card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 style={{ margin: '0 0 4px', fontFamily: 'Outfit, sans-serif', color: 'var(--navy)' }}>Bank Feed Match</h3>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Automatically match bank deposits to donor records</p>
            </div>
            <button className="btn btn-secondary btn-sm"><RefreshCw size={14} /> Sync</button>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Bank Transaction</th>
                  <th>System Match</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {bankFeedItems.map((item, i) => (
                  <tr key={i}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{item.bank}</div>
                      <div style={{ color: 'var(--green)', fontWeight: 700 }}>${item.amount.toLocaleString()}</div>
                    </td>
                    <td>
                      {item.match
                        ? <><div style={{ fontWeight: 700 }}>{item.match}</div><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.sub}</div></>
                        : <span style={{ color: 'var(--yellow)', fontWeight: 700 }}>⚠ {item.sub}</span>
                      }
                    </td>
                    <td>
                      {item.status === 'match'
                        ? <button className="btn btn-primary btn-sm">Confirm</button>
                        : <button className="btn btn-secondary btn-sm">Categorize</button>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Transfer History */}
          {accountTransfers.length > 0 && (
            <div style={{ marginTop: '20px' }}>
              <div style={{ fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>Recent Transfers</div>
              {accountTransfers.slice(0, 3).map(t => {
                const from = bankAccounts.find(a => a.id === t.fromAccountId);
                const to = bankAccounts.find(a => a.id === t.toAccountId);
                return (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border-light)', fontSize: '0.85rem' }}>
                    <div style={{ color: 'var(--text-secondary)' }}>{from?.name} → {to?.name}</div>
                    <div style={{ fontWeight: 700, color: 'var(--navy)' }}>${t.amount.toLocaleString()} · {t.date}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right column: Chart of Accounts + Internal Accounts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Chart of Accounts */}
          <div className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', color: 'var(--navy)' }}>Chart of Accounts</h3>
              <button className="btn btn-primary btn-sm"><Plus size={12} /> New</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { name: 'Income – Unrestricted', type: 'Income', balance: '$850,000', color: 'var(--green)' },
                { name: 'Income – Specific Campaign', type: 'Income', balance: '$395,000', color: 'var(--green)' },
                { name: 'Expense – Ambulance', type: 'Expense', balance: '$45,000', color: 'var(--red)' },
                { name: 'Expense – Fuel', type: 'Expense', balance: '$12,000', color: 'var(--red)' },
                { name: 'Liability – Fundraiser Payouts', type: 'Liability', balance: '$1,650', color: 'var(--yellow)' },
              ].map(acc => (
                <div key={acc.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-input)', borderRadius: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{acc.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{acc.type}</div>
                  </div>
                  <div style={{ fontWeight: 800, color: acc.color, fontFamily: 'Outfit, sans-serif' }}>{acc.balance}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Internal Fundraiser Accounts */}
          <div className="card" style={{ padding: '24px' }}>
            <div style={{ marginBottom: '12px' }}>
              <h3 style={{ margin: '0 0 4px', fontFamily: 'Outfit, sans-serif', color: 'var(--navy)' }}>Internal Fundraiser Accounts</h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Hidden accounts tracking expenses charged to each fundraiser</p>
            </div>
            {fundraisers.map(f => (
              <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: 'var(--bg-input)', borderRadius: '8px', marginBottom: '8px' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{f.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Expenses charged on their behalf</div>
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: 'var(--yellow)', fontFamily: 'Outfit, sans-serif', textAlign: 'right' }}>${(f.internalAccountBalance || 0).toLocaleString()}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'right' }}>Net owed: ${Math.max(0, f.balanceOwed - (f.internalAccountBalance || 0)).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add Account Modal */}
      {showAddAccount && (
        <div className="modal-overlay" onClick={() => setShowAddAccount(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ margin: 0 }}>Add Bank Account</h2>
              <button className="modal-close" onClick={() => setShowAddAccount(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gap: '16px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Account Name *</label>
                  <input type="text" placeholder="e.g. TD Bank Canadian Account" value={accForm.name} onChange={e => setAccForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Currency</label>
                    <select value={accForm.currency} onChange={e => setAccForm(f => ({ ...f, currency: e.target.value as any }))}>
                      <option value="CAD">CAD ($)</option>
                      <option value="USD">USD ($)</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Type</label>
                    <select value={accForm.type} onChange={e => setAccForm(f => ({ ...f, type: e.target.value as any }))}>
                      <option value="checking">Checking</option>
                      <option value="savings">Savings</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAddAccount(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={!accForm.name} onClick={() => { addBankAccount({ ...accForm, balance: 0 }); setShowAddAccount(false); }}>+ Add Account</button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {showTransfer && (
        <div className="modal-overlay" onClick={() => setShowTransfer(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ margin: 0 }}>Transfer Between Accounts</h2>
              <button className="modal-close" onClick={() => setShowTransfer(false)}><X size={20} /></button>
            </div>
            {transferSuccess ? (
              <div className="modal-body" style={{ textAlign: 'center', padding: '60px' }}>
                <div style={{ fontSize: '3rem', marginBottom: '12px' }}>✅</div>
                <h3 style={{ color: 'var(--green)' }}>Transfer Complete!</h3>
              </div>
            ) : (
              <>
                <div className="modal-body">
                  <div style={{ display: 'grid', gap: '16px' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Amount *</label>
                      <input type="number" placeholder="0.00" value={transferForm.amount} onChange={e => setTransferForm(f => ({ ...f, amount: e.target.value }))} style={{ fontSize: '1.5rem', fontWeight: 700, textAlign: 'center' }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '12px', alignItems: 'center' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>From Account *</label>
                        <select value={transferForm.fromId} onChange={e => setTransferForm(f => ({ ...f, fromId: e.target.value }))}>
                          <option value="">— Select —</option>
                          {regularAccounts.map(a => <option key={a.id} value={a.id}>{a.name} (${a.balance.toLocaleString()})</option>)}
                        </select>
                      </div>
                      <div style={{ textAlign: 'center', color: 'var(--navy-light)', fontWeight: 800, marginTop: '20px' }}>→</div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>To Account *</label>
                        <select value={transferForm.toId} onChange={e => setTransferForm(f => ({ ...f, toId: e.target.value }))}>
                          <option value="">— Select —</option>
                          {regularAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Notes (optional)</label>
                      <input type="text" placeholder="e.g. Moving USD proceeds to CAD account" value={transferForm.notes} onChange={e => setTransferForm(f => ({ ...f, notes: e.target.value }))} />
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-secondary" onClick={() => setShowTransfer(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleTransfer} disabled={!transferForm.fromId || !transferForm.toId || !transferForm.amount}>
                    <ArrowRight size={16} /> Transfer Now
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
