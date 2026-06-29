import React, { useState } from 'react';
import { useStore, type Transaction, type Bill } from '../store';
import { Plus, X, ArrowUpRight, ArrowDownRight, Trash2, ArrowLeft, Filter, Edit2, Calendar } from 'lucide-react';
import { useT } from '../i18n';
import { AddAccountModal } from '../components/AddAccountModal';

export const ChartOfAccounts: React.FC = () => {
  const { accounts, transactions, bills, isRtl, deleteAccount, donors, editTransaction, editBill } = useStore();
  const T = useT(isRtl);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [showAddAccount, setShowAddAccount] = useState(false);
  
  // Filters
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [filterMonth, setFilterMonth] = useState<string>('all'); // 'YYYY-MM'

  // Edit Modals
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [editBillState, setEditBillState] = useState<Bill | null>(null);

  const groupedAccounts = accounts.reduce((acc, account) => {
    if (!acc[account.type]) acc[account.type] = [];
    acc[account.type].push(account);
    return acc;
  }, {} as Record<string, typeof accounts>);

  const types = ['asset', 'liability', 'equity', 'revenue', 'expense'];

  const selectedAccount = accounts.find(a => a.id === selectedAccountId);

  // Combine transactions and paid bills for the selected account
  let accountHistory: { id: string; date: string; description: string; amount: number; type: 'tx' | 'bill'; isCredit: boolean; rawItem: any }[] = [];
  
  if (selectedAccount) {
    transactions.forEach(t => {
      if (t.sourceAccountId === selectedAccount.id || t.offsetAccountId === selectedAccount.id) {
        let desc = t.notes || 'Donation / Income';
        if (t.donorId) {
          const donor = donors.find(d => d.id === t.donorId);
          if (donor) {
            const hebNameParts = [donor.preTitle, donor.hebFirstName, donor.hebLastName, donor.title, donor.postTitle].filter(Boolean);
            const hebName = hebNameParts.join(' ');
            desc = `${donor.name}${donor.phone ? ` (${donor.phone})` : ''}${hebName ? ` - ${hebName}` : ''}${t.notes ? ` - ${t.notes}` : ''}`;
          }
        }
        accountHistory.push({
          id: t.id,
          date: t.date,
          description: desc,
          amount: t.amount,
          type: 'tx',
          isCredit: t.offsetAccountId === selectedAccount.id,
          rawItem: t
        });
      }
    });
    bills.forEach(b => {
      if (b.status === 'paid' && (b.sourceAccountId === selectedAccount.id || b.offsetAccountId === selectedAccount.id)) {
        accountHistory.push({
          id: b.id,
          date: b.dueDate,
          description: b.vendor + ' - ' + (b.category || 'Bill Payment'),
          amount: b.amount,
          type: 'bill',
          isCredit: b.sourceAccountId === selectedAccount.id,
          rawItem: b
        });
      }
    });
    
    // Apply Filters
    if (filterType !== 'all') {
      accountHistory = accountHistory.filter(item => {
        // determine income/expense based on account type and isCredit
        let isIncome = false;
        if (selectedAccount.type === 'asset' || selectedAccount.type === 'expense') {
          isIncome = !item.isCredit;
        } else {
          isIncome = item.isCredit;
        }
        return filterType === 'income' ? isIncome : !isIncome;
      });
    }

    if (filterMonth !== 'all') {
      accountHistory = accountHistory.filter(item => {
        if (!item.date) return false;
        return item.date.startsWith(filterMonth); // item.date is YYYY-MM-DD
      });
    }

    accountHistory.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  // Generate available months for the filter based on ALL history before filtering
  const availableMonths = Array.from(new Set(
    (selectedAccount ? [...transactions, ...bills] : [])
      .filter(x => {
        if ('sourceAccountId' in x) {
          return x.sourceAccountId === selectedAccount?.id || x.offsetAccountId === selectedAccount?.id;
        }
        return false;
      })
      .map(x => ('date' in x ? x.date : x.dueDate)?.substring(0, 7))
      .filter(Boolean)
  )).sort().reverse();

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px', alignItems: 'start' }}>
      {!selectedAccount ? (
        <div style={{ display: 'grid', gap: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontFamily: 'Outfit, sans-serif', fontWeight: 800, color: 'var(--navy)' }}>
            Chart of Accounts
          </h2>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddAccount(true)}>
            <Plus size={14} /> Add Account
          </button>
        </div>

        {types.map(type => {
          const typeAccounts = groupedAccounts[type] || [];
          if (typeAccounts.length === 0) return null;

          const typeTotal = typeAccounts.reduce((sum, a) => sum + (a.currency === 'CAD' ? a.balance : a.balance * 1.35), 0);

          return (
            <div key={type} className="card" style={{ padding: '0', overflow: 'hidden' }}>
              <div style={{ padding: '16px 24px', background: 'var(--bg-input)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', textTransform: 'capitalize', color: 'var(--navy)', fontWeight: 800 }}>{type}s</h3>
                <div style={{ fontWeight: 700, color: 'var(--text-muted)' }}>
                  Total: ${typeTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} CAD
                </div>
              </div>
              <div className="table-container">
                <table style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th>Account Name</th>
                      <th>Sub-Type</th>
                      <th>Currency</th>
                      <th style={{ textAlign: 'right' }}>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {typeAccounts.map(account => (
                      <tr 
                        key={account.id} 
                        onClick={() => { setSelectedAccountId(account.id); setFilterType('all'); setFilterMonth('all'); }}
                        style={{ cursor: 'pointer', background: selectedAccountId === account.id ? 'var(--bg-input)' : 'transparent' }}
                      >
                        <td style={{ fontWeight: 600 }}>{account.name}</td>
                        <td style={{ textTransform: 'capitalize', color: 'var(--text-secondary)' }}>{account.subType || 'General'}</td>
                        <td style={{ fontWeight: 700, color: 'var(--text-muted)' }}>{account.currency}</td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: account.balance >= 0 ? 'var(--green)' : 'var(--red)' }}>
                          ${account.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
      ) : (
        <div className="card slide-in-right" style={{ padding: 0 }}>
          <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', position: 'relative' }}>
            <button 
              onClick={() => setSelectedAccountId(null)} 
              style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 0 16px 0', fontSize: '1rem', fontWeight: 600 }}
            >
              <ArrowLeft size={20} /> Back to Accounts
            </button>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
              {selectedAccount.type} A {selectedAccount.currency}
            </div>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.4rem', color: 'var(--navy)', fontFamily: 'Outfit, sans-serif' }}>
              {selectedAccount.name}
            </h3>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => { if(window.confirm('Are you sure you want to delete this account?')) { deleteAccount(selectedAccount.id); setSelectedAccountId(null); } }} style={{ color: 'var(--red)' }}>
                <Trash2 size={14} /> Delete Account
              </button>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Current Balance</div>
            <div style={{ fontSize: '2.2rem', fontWeight: 800, color: selectedAccount.balance >= 0 ? 'var(--green)' : 'var(--red)', fontFamily: 'Outfit, sans-serif' }}>
              ${selectedAccount.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>

          <div style={{ padding: '0' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg-input)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Recent Transactions
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Filter size={14} color="var(--text-muted)" />
                  <select 
                    value={filterType} 
                    onChange={e => setFilterType(e.target.value as any)}
                    style={{ padding: '6px 24px 6px 12px', fontSize: '0.85rem', borderRadius: '6px', border: '1px solid var(--border)' }}
                  >
                    <option value="all">All Types</option>
                    <option value="income">Incoming Only</option>
                    <option value="expense">Expenses Only</option>
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Calendar size={14} color="var(--text-muted)" />
                  <select 
                    value={filterMonth} 
                    onChange={e => setFilterMonth(e.target.value)}
                    style={{ padding: '6px 24px 6px 12px', fontSize: '0.85rem', borderRadius: '6px', border: '1px solid var(--border)' }}
                  >
                    <option value="all">All Time</option>
                    {availableMonths.map(m => {
                      const date = new Date(`${m}-01`);
                      return (
                        <option key={m} value={m}>
                          {date.toLocaleString('default', { month: 'short', year: 'numeric' })}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            </div>
            <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
              {accountHistory.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  No activity found
                </div>
              ) : (
                accountHistory.map((item, i) => {
                  let amountColor = 'var(--text-muted)';
                  let icon = null;
                  let prefix = '';
                  
                  if (selectedAccount.type === 'asset' || selectedAccount.type === 'expense') {
                    if (!item.isCredit) {
                      amountColor = 'var(--green)';
                      prefix = '+';
                      icon = <ArrowDownRight size={14} color="var(--green)" />;
                    } else {
                      amountColor = 'var(--navy)';
                      prefix = '-';
                      icon = <ArrowUpRight size={14} color="var(--navy)" />;
                    }
                  } else {
                    if (item.isCredit) {
                      amountColor = 'var(--green)';
                      prefix = '+';
                      icon = <ArrowDownRight size={14} color="var(--green)" />;
                    } else {
                      amountColor = 'var(--navy)';
                      prefix = '-';
                      icon = <ArrowUpRight size={14} color="var(--navy)" />;
                    }
                  }

                  return (
                    <div 
                      key={item.id + i} 
                      onClick={() => {
                        if (item.type === 'tx') setEditTx(item.rawItem);
                        else setEditBillState(item.rawItem);
                      }}
                      style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                      className="hover-bg-input"
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '2px', color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {item.description}
                          <Edit2 size={12} color="var(--text-muted)" style={{ opacity: 0.5 }} />
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.date}  {item.type === 'tx' ? 'Transaction' : 'Bill Payment'}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, color: amountColor, fontSize: '1.05rem' }}>
                        {prefix}${item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        {icon}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {showAddAccount && <AddAccountModal onClose={() => setShowAddAccount(false)} />}
      
      {/* Edit Transaction Modal */}
      {editTx && (
        <div className="modal-overlay" onClick={() => setEditTx(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ margin: 0 }}>Edit Transaction</h2>
              <button className="modal-close" onClick={() => setEditTx(null)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gap: '16px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Amount</label>
                  <input type="number" value={editTx.amount} onChange={e => setEditTx({ ...editTx, amount: parseFloat(e.target.value) || 0 })} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Status</label>
                    <select value={editTx.type} onChange={e => setEditTx({ ...editTx, type: e.target.value as any })}>
                      <option value="approved">Approved</option>
                      <option value="pending">Pending</option>
                      <option value="recording">Recording / Pledge</option>
                      <option value="declined">Declined</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Method</label>
                    <select value={editTx.method} onChange={e => setEditTx({ ...editTx, method: e.target.value as any })}>
                      <option value="credit_card">Credit Card</option>
                      <option value="check">Check</option>
                      <option value="cash">Cash</option>
                      <option value="e_transfer">E-Transfer</option>
                    </select>
                  </div>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Date</label>
                  <input type="date" value={editTx.date} onChange={e => setEditTx({ ...editTx, date: e.target.value })} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Asset Account</label>
                  <select value={editTx.sourceAccountId || ''} onChange={e => setEditTx({ ...editTx, sourceAccountId: e.target.value })}>
                    {accounts.filter(a => a.type === 'asset').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Revenue Account</label>
                  <select value={editTx.offsetAccountId || ''} onChange={e => setEditTx({ ...editTx, offsetAccountId: e.target.value })}>
                    {accounts.filter(a => a.type === 'revenue').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Notes</label>
                  <input type="text" value={editTx.notes || ''} onChange={e => setEditTx({ ...editTx, notes: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditTx(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => { 
                editTransaction(editTx.id, editTx);
                setEditTx(null); 
              }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Bill Modal */}
      {editBillState && (
        <div className="modal-overlay" onClick={() => setEditBillState(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ margin: 0 }}>Edit Bill / Expense</h2>
              <button className="modal-close" onClick={() => setEditBillState(null)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gap: '16px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Vendor</label>
                  <input type="text" value={editBillState.vendor} onChange={e => setEditBillState({ ...editBillState, vendor: e.target.value })} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Amount</label>
                  <input type="number" value={editBillState.amount} onChange={e => setEditBillState({ ...editBillState, amount: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Date / Due Date</label>
                  <input type="date" value={editBillState.dueDate} onChange={e => setEditBillState({ ...editBillState, dueDate: e.target.value })} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Paid From (Asset)</label>
                  <select value={editBillState.sourceAccountId || ''} onChange={e => setEditBillState({ ...editBillState, sourceAccountId: e.target.value })}>
                    <option value="">-- None --</option>
                    {accounts.filter(a => a.type === 'asset').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Expense Category (Offset)</label>
                  <select value={editBillState.offsetAccountId || ''} onChange={e => setEditBillState({ ...editBillState, offsetAccountId: e.target.value })}>
                    <option value="">-- None --</option>
                    {accounts.filter(a => a.type === 'expense').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditBillState(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => { 
                editBill(editBillState.id, editBillState);
                setEditBillState(null); 
              }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
