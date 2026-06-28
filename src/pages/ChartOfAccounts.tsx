import React, { useState } from 'react';
import { useStore } from '../store';
import { Plus, X, ArrowUpRight, ArrowDownRight, Trash2 } from 'lucide-react';
import { useT } from '../i18n';
import { AddAccountModal } from '../components/AddAccountModal';

export const ChartOfAccounts: React.FC = () => {
  const { accounts, transactions, bills, isRtl, deleteAccount } = useStore();
  const T = useT(isRtl);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [showAddAccount, setShowAddAccount] = useState(false);

  const groupedAccounts = accounts.reduce((acc, account) => {
    if (!acc[account.type]) acc[account.type] = [];
    acc[account.type].push(account);
    return acc;
  }, {} as Record<string, typeof accounts>);

  const types = ['asset', 'liability', 'equity', 'revenue', 'expense'];

  const selectedAccount = accounts.find(a => a.id === selectedAccountId);

  // Combine transactions and paid bills for the selected account
  const accountHistory: { id: string; date: string; description: string; amount: number; type: 'tx' | 'bill'; isCredit: boolean; }[] = [];
  if (selectedAccount) {
    transactions.forEach(t => {
      if (t.sourceAccountId === selectedAccount.id || t.offsetAccountId === selectedAccount.id) {
        accountHistory.push({
          id: t.id,
          date: t.date,
          description: t.notes || 'Donation / Income',
          amount: t.amount,
          type: 'tx',
          isCredit: t.offsetAccountId === selectedAccount.id
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
          isCredit: b.offsetAccountId === selectedAccount.id
        });
      }
    });
    accountHistory.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: selectedAccount ? '1fr 380px' : '1fr', gap: '24px', alignItems: 'start' }}>
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
                        onClick={() => setSelectedAccountId(account.id)}
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

      {selectedAccount && (
        <div className="card slide-in-right" style={{ padding: 0, position: 'sticky', top: '24px' }}>
          <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', position: 'relative' }}>
            <button 
              onClick={() => setSelectedAccountId(null)} 
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
            >
              <X size={20} />
            </button>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
              {selectedAccount.type} · {selectedAccount.currency}
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
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg-input)', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Recent Transactions
            </div>
            <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
              {accountHistory.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  No recent activity
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
                    <div key={item.id + i} style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '2px', color: 'var(--navy)' }}>{item.description}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.date}</div>
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
    </div>
  );
};
