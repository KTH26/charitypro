import React, { useState } from 'react';
import { useStore, type Transaction, type Bill } from '../store';
import { Plus, X, ArrowUpRight, ArrowDownRight, Trash2, ArrowLeft, Filter, Edit2, Calendar, User, Download } from 'lucide-react';
import { useT } from '../i18n';
import { AddAccountModal } from '../components/AddAccountModal';
import { BatchDetailsModal } from '../components/BatchDetailsModal';

export const ChartOfAccounts: React.FC = () => {
  const { accounts, accountTransfers, transactions, bills, isRtl, deleteAccount, donors, editTransaction, editBill, addTransaction, addBill, markBillPaid, transferBetweenAccounts, editAccountTransfer, payPayrollEntity, employees, fundraisers, vendors, addVendor, projects } = useStore();
  const T = useT(isRtl);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [showAddAccount, setShowAddAccount] = useState(false);
  
  // Filters
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [filterMonth, setFilterMonth] = useState<string>('all'); // 'YYYY-MM'

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  React.useEffect(() => {
    setCurrentPage(1);
  }, [selectedAccountId, filterType, filterMonth]);

  // Edit Modals
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [viewTx, setViewTx] = useState<Transaction | null>(null);
  const [editBillState, setEditBillState] = useState<Bill | null>(null);

  // Manual Transaction Modal State
  const [showAddTx, setShowAddTx] = useState(false);
  const [txType, setTxType] = useState<'income' | 'expense' | 'transfer' | 'payroll'>('expense');
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);
  const [txAmount, setTxAmount] = useState('');
  const [txEntity, setTxEntity] = useState(''); 
  const [txCategory, setTxCategory] = useState(''); 
  const [txNotes, setTxNotes] = useState('');
  const [txT4aEligible, setTxT4aEligible] = useState(false);
  const [txNewVendorFund, setTxNewVendorFund] = useState('General');

  const groupedAccounts = accounts.reduce((acc, account) => {
    if (!acc[account.type]) acc[account.type] = [];
    acc[account.type].push(account);
    return acc;
  }, {} as Record<string, typeof accounts>);

  const types = ['asset', 'liability', 'equity', 'revenue'];

  const selectedAccount = accounts.find(a => a.id === selectedAccountId);

  // Combine transactions and paid bills for the selected account
  let accountHistory: { id: string; date: string; description: string; amount: number; type: 'tx' | 'bill'; isCredit: boolean; rawItem: any }[] = [];
  
  if (selectedAccount) {
    transactions.forEach(t => {
      // Exclude batched/deposited transactions from the Undeposited Funds view
      // so it only shows what is CURRENTLY undeposited.
      if (selectedAccount.id === 'sys-undeposited-funds' && t.depositStatus === 'deposited') {
        return;
      }

      if (t.type !== 'approved') {
        return;
      }

      let desc = t.notes || 'Donation / Income';
      if (t.donorId) {
        const donor = donors.find(d => d.id === t.donorId);
        if (donor) {
          const hebNameParts = [donor.preTitle, donor.hebFirstName, donor.hebLastName, donor.title, donor.postTitle].filter(Boolean);
          const hebName = hebNameParts.join(' ');
          desc = `${donor.name}${donor.phone ? ` (${donor.phone})` : ''}${hebName ? ` - ${hebName}` : ''}${t.notes ? ` - ${t.notes}` : ''}`;
        }
      }
      
      if (t.sourceAccountId === selectedAccount.id) {
        accountHistory.push({
          id: t.id + '-source',
          date: t.date,
          description: desc,
          amount: t.amount,
          type: 'tx',
          isCredit: false,
          rawItem: t
        });
      }
      
      if (t.offsetAccountId === selectedAccount.id) {
        accountHistory.push({
          id: t.id + '-offset',
          date: t.date,
          description: desc,
          amount: t.amount,
          type: 'tx',
          isCredit: true,
          rawItem: t
        });
      }
    });
    
    bills.forEach(b => {
      if (b.status === 'paid') {
        const desc = b.vendor + ' - ' + (b.category ? accounts.find(a => a.id === b.category)?.name || 'Bill Payment' : 'Bill Payment');
        
        if (b.sourceAccountId === selectedAccount.id) {
          accountHistory.push({
            id: b.id + '-source',
            date: b.dueDate,
            description: desc,
            amount: b.amount,
            type: 'bill',
            isCredit: true, // Paid from asset means it's a credit to asset
            rawItem: b
          });
        }

        if (b.creditAccountId === selectedAccount.id) {
          accountHistory.push({
            id: b.id + '-credit',
            date: b.dueDate,
            description: desc,
            amount: b.amount,
            type: 'bill',
            isCredit: false, // User treats creditAccountId as an INCOMING reimbursement (Debit to asset)
            rawItem: b
          });
        }
        
        if (b.category === selectedAccount.id) {
          accountHistory.push({
            id: b.id + '-category',
            date: b.dueDate,
            description: desc,
            amount: b.amount,
            type: 'bill',
            isCredit: false, // Category of bill is debited
            rawItem: b
          });
        }
      }
    });

    accountTransfers.forEach(tr => {
      if (tr.fromAccountId === selectedAccount.id) {
        accountHistory.push({
          id: tr.id + '-from',
          date: tr.date || new Date().toISOString().split('T')[0],
          description: `Internal Transfer to ${accounts.find(a => a.id === tr.toAccountId)?.name || 'Unknown'}`,
          amount: tr.amount,
          type: 'tx',
          isCredit: true, // Outgoing is credit for asset
          rawItem: { ...tr, isInternalTransfer: true }
        });
      }
      if (tr.toAccountId === selectedAccount.id) {
        accountHistory.push({
          id: tr.id + '-to',
          date: tr.date || new Date().toISOString().split('T')[0],
          description: `Internal Transfer from ${accounts.find(a => a.id === tr.fromAccountId)?.name || 'Unknown'}`,
          amount: tr.amount,
          type: 'tx',
          isCredit: false, // Incoming is debit
          rawItem: { ...tr, isInternalTransfer: true }
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

  const exportToCSV = () => {
    if (!selectedAccount) return;
    const headers = ['Date', 'Type', 'Description', 'Amount', 'Balance Impact'];
    const rows = accountHistory.map(item => {
      let impact = 0;
      if (selectedAccount.type === 'asset' || selectedAccount.type === 'expense') {
        impact = !item.isCredit ? item.amount : -item.amount;
      } else {
        impact = item.isCredit ? item.amount : -item.amount;
      }
      return [
        item.date,
        item.rawItem.isInternalTransfer ? 'Transfer' : item.type === 'tx' ? 'Transaction' : 'Bill',
        `"${item.description.replace(/"/g, '""')}"`,
        item.amount.toFixed(2),
        impact.toFixed(2)
      ].join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedAccount.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_ledger.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const paginatedHistory = accountHistory.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalPages = Math.ceil(accountHistory.length / itemsPerPage);

  // Generate available months for the filter based on ALL history before filtering
  const availableMonths = Array.from(new Set(
    (selectedAccount ? [...transactions, ...bills] : [])
      .filter(x => {
        if ('sourceAccountId' in x) {
          return x.sourceAccountId === selectedAccount?.id || x.offsetAccountId === selectedAccount?.id || (x as any).creditAccountId === selectedAccount?.id;
        }
        return false;
      })
      .map(x => ('date' in x ? x.date : x.dueDate)?.substring(0, 7))
      .filter(Boolean)
  )).sort().reverse();

  const handleManualTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount || !txAmount) return;
    
    const amount = parseFloat(txAmount);
    
    if (txType === 'expense') {
      const existingVendor = vendors.find(v => v.name.toLowerCase() === txEntity.toLowerCase());
      if (!existingVendor && txEntity) {
        addVendor({ name: txEntity, fund: txNewVendorFund });
      }
      const billId = addBill({
        vendor: txEntity || 'Unknown Vendor',
        amount,
        dueDate: txDate,
        status: 'pending',
        category: txCategory || 'unknown'
      });
      markBillPaid(billId, selectedAccount.id, txCategory || undefined);
    } else if (txType === 'income') {
      addTransaction({
        donorId: txEntity || 'unknown',
        amount,
        date: txDate,
        type: 'approved',
        method: 'other',
        currency: 'CAD',
        sourceAccountId: selectedAccount.id,
        offsetAccountId: txCategory || undefined,
        notes: txNotes
      });
    } else if (txType === 'transfer') {
      transferBetweenAccounts({
        fromAccountId: selectedAccount.id,
        toAccountId: txEntity,
        amount,
        date: txDate,
        notes: txNotes
      });
    } else if (txType === 'payroll') {
      const entity = [...employees, ...fundraisers].find(x => x.id === txEntity);
      if (entity) {
        payPayrollEntity(entity.id, 'role' in entity ? 'employee' : 'fundraiser', amount);
        const billId = addBill({
          vendor: `Payroll: ${entity.name}`,
          amount,
          dueDate: txDate,
          status: 'pending',
          category: 'Payroll Expense',
          t4aEligible: txT4aEligible
        });
        markBillPaid(billId, selectedAccount.id, 'Payroll Expense');
      }
    }
    
    setShowAddTx(false);
    setTxAmount('');
    setTxEntity('');
    setTxCategory('');
    setTxNotes('');
    setTxT4aEligible(false);
  };

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
                    {(() => {
                      const renderAccountRows = (parentId: string | undefined, depth: number): React.ReactNode => {
                        return typeAccounts
                          .filter(a => (parentId ? a.parentId === parentId : !a.parentId))
                          .map(account => (
                            <React.Fragment key={account.id}>
                              <tr 
                                onClick={() => { setSelectedAccountId(account.id); setFilterType('all'); setFilterMonth('all'); }}
                                style={{ cursor: 'pointer', background: selectedAccountId === account.id ? 'var(--bg-input)' : 'transparent' }}
                              >
                                <td style={{ fontWeight: depth === 0 ? 600 : 400, paddingLeft: `${depth * 20 + 16}px` }}>
                                  {depth > 0 ? '↳ ' : ''}{account.name}
                                </td>
                                <td style={{ textTransform: 'capitalize', color: 'var(--text-secondary)' }}>{account.subType || 'General'}</td>
                                <td style={{ fontWeight: 700, color: 'var(--text-muted)' }}>{account.currency}</td>
                                <td style={{ textAlign: 'right', fontWeight: 800, color: account.balance >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                  ${account.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </td>
                              </tr>
                              {renderAccountRows(account.id, depth + 1)}
                            </React.Fragment>
                          ));
                      };
                      return renderAccountRows(undefined, 0);
                    })()}
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
              <button className="btn btn-secondary btn-sm" onClick={exportToCSV}>
                <Download size={14} /> Export CSV
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => setShowAddTx(true)}>
                <Plus size={14} /> Add Transaction
              </button>
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
            <div className="table-container" style={{ maxHeight: '500px', overflowY: 'auto', borderRadius: 0, border: 'none' }}>
              <table style={{ margin: 0 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-card)' }}>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Description</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedHistory.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        No activity found
                      </td>
                    </tr>
                  ) : (
                    paginatedHistory.map((item, i) => {
                      let amountColor = 'var(--text-muted)';
                      let icon = null;
                      let prefix = '';
                      
                      if (selectedAccount.type === 'asset' || selectedAccount.type === 'expense') {
                        if (!item.isCredit) {
                          amountColor = 'var(--green)';
                          prefix = '+';
                          icon = <ArrowDownRight size={14} color="var(--green)" style={{ marginLeft: '6px' }} />;
                        } else {
                          amountColor = 'var(--navy)';
                          prefix = '-';
                          icon = <ArrowUpRight size={14} color="var(--navy)" style={{ marginLeft: '6px' }} />;
                        }
                      } else {
                        if (item.isCredit) {
                          amountColor = 'var(--green)';
                          prefix = '+';
                          icon = <ArrowDownRight size={14} color="var(--green)" style={{ marginLeft: '6px' }} />;
                        } else {
                          amountColor = 'var(--navy)';
                          prefix = '-';
                          icon = <ArrowUpRight size={14} color="var(--navy)" style={{ marginLeft: '6px' }} />;
                        }
                      }

                      return (
                        <tr 
                          key={item.id + i} 
                          onClick={() => {
                            if (item.type === 'tx') setViewTx(item.rawItem);
                            else setEditBillState(item.rawItem);
                          }}
                          style={{ cursor: 'pointer' }}
                          className="hover-bg-input"
                        >
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 600 }}>{item.date}</div>
                            {item.type === 'bill' && item.rawItem.paidDate && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Paid: {item.rawItem.paidDate}</div>
                            )}
                          </td>
                          <td>
                            <span style={{ 
                              padding: '4px 8px', 
                              borderRadius: '4px', 
                              fontSize: '0.75rem', 
                              fontWeight: 600,
                              background: 'var(--bg-hover)',
                              color: 'var(--text-muted)',
                              textTransform: 'uppercase'
                            }}>
                              {item.rawItem.isInternalTransfer ? 'Transfer' : item.type === 'tx' ? 'Transaction' : 'Bill'}
                            </span>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600, color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {item.description}
                              <Edit2 size={12} color="var(--text-muted)" style={{ opacity: 0.5 }} />
                            </div>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 800, color: amountColor, fontSize: '1.05rem', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                              {prefix}${item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              {icon}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div style={{ padding: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', borderTop: '1px solid var(--border)' }}>
                <button 
                  className="btn btn-secondary btn-sm"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Page {currentPage} of {totalPages}
                </div>
                <button 
                  className="btn btn-secondary btn-sm"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showAddAccount && <AddAccountModal onClose={() => setShowAddAccount(false)} />}
      
      {/* View Transaction Modal */}
      {viewTx && (viewTx.isBatch ? (
        <BatchDetailsModal batchId={viewTx.id} onClose={() => setViewTx(null)} />
      ) : (
        <div className="modal-overlay" onClick={() => setViewTx(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ margin: 0 }}>Transaction Details</h2>
              <button className="modal-close" onClick={() => setViewTx(null)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              {(() => {
                const txDonor = donors.find(d => d.id === viewTx.donorId);
                return (
                  <div style={{ display: 'grid', gap: '20px' }}>
                    {txDonor ? (
                      <div className="card" style={{ background: 'var(--bg-input)' }}>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <User size={18} color="var(--navy)" /> Donor Information
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.9rem' }}>
                          <div><strong>Name:</strong> {txDonor.name}</div>
                          <div><strong>Phone:</strong> {txDonor.phone || '-'}</div>
                          <div><strong>Hebrew Name:</strong> {[txDonor.preTitle, txDonor.hebFirstName, txDonor.hebLastName, txDonor.title, txDonor.postTitle].filter(Boolean).join(' ') || '-'}</div>
                          <div><strong>Email:</strong> {txDonor.email || '-'}</div>
                          <div style={{ gridColumn: '1 / -1' }}><strong>Address:</strong> {txDonor.address || '-'}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="card" style={{ background: 'var(--bg-input)', color: 'var(--text-muted)' }}>
                        No donor associated with this transaction.
                      </div>
                    )}
                    
                    <div>
                      <h3 style={{ margin: '0 0 12px 0', fontSize: '1.1rem' }}>Payment Details</h3>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.9rem' }}>
                        <div><strong>Amount:</strong> ${viewTx.amount} {viewTx.currency}</div>
                        <div><strong>Date:</strong> {viewTx.date}</div>
                        <div><strong>Method:</strong> {viewTx.method}</div>
                        <div><strong>Status:</strong> {viewTx.type}</div>
                        <div><strong>Asset Account:</strong> {accounts.find(a => a.id === viewTx.sourceAccountId)?.name || '-'}</div>
                        <div><strong>Revenue Account:</strong> {accounts.find(a => a.id === viewTx.offsetAccountId)?.name || '-'}</div>
                        <div style={{ gridColumn: '1 / -1' }}><strong>Notes:</strong> {viewTx.notes || '-'}</div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button className="btn btn-secondary" onClick={() => setViewTx(null)}>Close</button>
              <button className="btn btn-primary" onClick={() => { setEditTx(viewTx); setViewTx(null); }}>
                <Edit2 size={16} style={{ marginRight: '6px' }} /> Edit Transaction
              </button>
            </div>
          </div>
        </div>
      ))}
      
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
                {!(editTx as any).isInternalTransfer && (
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
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Date</label>
                    <input type="date" value={editTx.date} onChange={e => setEditTx({ ...editTx, date: e.target.value })} />
                  </div>
                  {!(editTx as any).isInternalTransfer && (
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Project Tag</label>
                      <select value={editTx.projectId || ''} onChange={e => setEditTx({ ...editTx, projectId: e.target.value || undefined })}>
                        <option value="">— No Project —</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                  )}
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>{(editTx as any).isInternalTransfer ? 'Transfer From' : 'Asset Account'}</label>
                  <select value={((editTx as any).isInternalTransfer ? (editTx as any).fromAccountId : editTx.sourceAccountId) || ''} onChange={e => {
                     if ((editTx as any).isInternalTransfer) {
                       setEditTx({ ...editTx, fromAccountId: e.target.value } as any);
                     } else {
                       setEditTx({ ...editTx, sourceAccountId: e.target.value });
                     }
                  }}>
                    <option value="">-- None --</option>
                    {['asset', 'liability', 'equity', 'revenue'].map(type => {
                      const typeAccounts = accounts.filter(a => a.type === type);
                      if (typeAccounts.length === 0) return null;
                      return (
                        <optgroup key={type} label={type.toUpperCase()}>
                          {typeAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </optgroup>
                      );
                    })}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>{(editTx as any).isInternalTransfer ? 'Transfer To' : 'Revenue Account'}</label>
                  <select value={((editTx as any).isInternalTransfer ? (editTx as any).toAccountId : editTx.offsetAccountId) || ''} onChange={e => {
                     if ((editTx as any).isInternalTransfer) {
                       setEditTx({ ...editTx, toAccountId: e.target.value } as any);
                     } else {
                       setEditTx({ ...editTx, offsetAccountId: e.target.value });
                     }
                  }}>
                    <option value="">-- None --</option>
                    {['asset', 'liability', 'equity', 'revenue'].map(type => {
                      const typeAccounts = accounts.filter(a => a.type === type);
                      if (typeAccounts.length === 0) return null;
                      return (
                        <optgroup key={type} label={type.toUpperCase()}>
                          {typeAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </optgroup>
                      );
                    })}
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
                if ((editTx as any).isInternalTransfer) {
                  editAccountTransfer(editTx.id, {
                    fromAccountId: (editTx as any).fromAccountId,
                    toAccountId: (editTx as any).toAccountId,
                    amount: editTx.amount,
                    date: editTx.date,
                    notes: editTx.notes
                  });
                } else {
                  editTransaction(editTx.id, editTx);
                }
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

      {/* Manual Transaction Modal */}
      {showAddTx && selectedAccount && (
        <div className="modal-overlay" onClick={() => setShowAddTx(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ margin: 0 }}>Add Transaction to {selectedAccount.name}</h2>
              <button className="modal-close" onClick={() => setShowAddTx(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleManualTransaction}>
              <div className="modal-body">
                <div style={{ display: 'grid', gap: '16px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Transaction Type</label>
                    <select value={txType} onChange={e => setTxType(e.target.value as any)}>
                      <option value="expense">Expense / Bill Payment</option>
                      <option value="income">Income / Deposit</option>
                      <option value="transfer">Account Transfer</option>
                      <option value="payroll">Payroll Payment</option>
                    </select>
                  </div>
                  
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Date</label>
                    <input type="date" required value={txDate} onChange={e => setTxDate(e.target.value)} />
                  </div>
                  
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Amount</label>
                    <input type="number" step="0.01" required value={txAmount} onChange={e => setTxAmount(e.target.value)} />
                  </div>

                  {txType === 'expense' && (
                    <>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Vendor</label>
                        <input type="text" placeholder="Vendor Name" required value={txEntity} onChange={e => setTxEntity(e.target.value)} />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Expense Category (Account)</label>
                        <select required value={txCategory} onChange={e => setTxCategory(e.target.value)}>
                          <option value="">-- Select Expense Account --</option>
                          {accounts.filter(a => a.type === 'expense').map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}

                  {txType === 'income' && (
                    <>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Donor / Source (Optional)</label>
                        <select value={txEntity} onChange={e => setTxEntity(e.target.value)}>
                          <option value="">-- Anonymous / None --</option>
                          {donors.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Income Category (Account)</label>
                        <select required value={txCategory} onChange={e => setTxCategory(e.target.value)}>
                          <option value="">-- Select Income Account --</option>
                          {accounts.filter(a => a.type === 'revenue').map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Notes</label>
                        <input type="text" value={txNotes} onChange={e => setTxNotes(e.target.value)} />
                      </div>
                    </>
                  )}

                  {txType === 'transfer' && (
                    <>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Destination / Offset Account</label>
                        <select required value={txEntity} onChange={e => setTxEntity(e.target.value)}>
                          <option value="">-- Select Account --</option>
                          {accounts.filter(a => a.id !== selectedAccount.id).map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Notes</label>
                        <input type="text" value={txNotes} onChange={e => setTxNotes(e.target.value)} />
                      </div>
                    </>
                  )}

                  {txType === 'payroll' && (
                    <>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Employee / Fundraiser</label>
                        <select required value={txEntity} onChange={e => setTxEntity(e.target.value)}>
                          <option value="">-- Select Entity --</option>
                          {employees.map(e => <option key={e.id} value={e.id}>{e.name} (Employee - Owes: ${e.balanceOwed.toFixed(2)})</option>)}
                          {fundraisers.map(f => <option key={f.id} value={f.id}>{f.name} (Fundraiser - Owes: ${f.balanceOwed.toFixed(2)})</option>)}
                        </select>
                      </div>
                      {txEntity && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '12px' }}>
                          <input type="checkbox" checked={txT4aEligible} onChange={e => setTxT4aEligible(e.target.checked)} style={{ width: 16, height: 16 }} />
                          <span>Include this payment in T4A (Box 48 Eligible)</span>
                        </label>
                      )}
                    </>
                  )}

                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddTx(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Record Transaction</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
