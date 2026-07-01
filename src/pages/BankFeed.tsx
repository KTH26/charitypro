import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store';
import { Building, Send, Check, Link as LinkIcon, RefreshCw, X, Plus, Trash2 } from 'lucide-react';
import { useT } from '../i18n';
import { usePlaidLink } from 'react-plaid-link';
import { AddAccountModal } from '../components/AddAccountModal';

export const BankFeed: React.FC = () => {
  const { accounts, addAccount, isRtl, matchedBankTransactions, needsReviewBankTransactions, matchBankTransaction, markBankTransactionForReview, unmarkBankTransactionForReview, addBill, markBillPaid, addTransaction, bankFeeds, setBankFeed, transferBetweenAccounts, bills, vendors, addVendor, employees, payPayrollEntity, transactions, addBatchDeposit, donors, unmatchBankTransaction } = useStore();
  const T = useT(isRtl);
  
  const connectedBanks = accounts.filter(a => a.plaidConnected);
  const [selectedBank, setSelectedBank] = useState(connectedBanks.length > 0 ? connectedBanks[0].id : 'add');
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [plaidError, setPlaidError] = useState('');

  const [matchingTx, setMatchingTx] = useState<any | null>(null);
  const [matchType, setMatchType] = useState<'expense' | 'deposit' | 'transfer' | 'payroll' | 'match_multiple'>('expense');
  const [matchCategory, setMatchCategory] = useState('');
  const [matchEntity, setMatchEntity] = useState(''); // Vendor or Donor name
  const [newVendorFund, setNewVendorFund] = useState('General');
  const [selectedTab, setSelectedTab] = useState<'unmatched' | 'review' | 'matched'>('unmatched');
  const [batchSelectedIds, setBatchSelectedIds] = useState<string[]>([]);
  const [batchSearchTerm, setBatchSearchTerm] = useState('');
  const [batchDateFrom, setBatchDateFrom] = useState('');
  const [batchDateTo, setBatchDateTo] = useState('');
  
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [batchMethodFilter, setBatchMethodFilter] = useState('credit_card');

  // Ensure selectedBank is valid
  useEffect(() => {
    if (selectedBank !== 'add' && !accounts.find(a => a.id === selectedBank)) {
      setSelectedBank(connectedBanks[0]?.id || 'add');
    }
  }, [accounts, selectedBank, connectedBanks]);

  // 1. Fetch link token for adding new banks
  useEffect(() => {
    const fetchLinkToken = async () => {
      try {
        const res = await fetch('/api/plaid/create_link_token', { method: 'POST' });
        const data = await res.json();
        if (data.link_token) {
          setLinkToken(data.link_token);
        } else {
          let errorMsg = data.error || 'Invalid Plaid API Keys';
          if (data.details) {
            try {
              const detailsObj = JSON.parse(data.details);
              if (detailsObj.error_message) errorMsg = detailsObj.error_message;
            } catch (e) {}
          }
          setPlaidError(errorMsg);
          console.error('Plaid create_link_token error:', data);
        }
      } catch (err) {
        console.error('Failed to get link token', err);
      }
    };
    fetchLinkToken();
  }, []);

  // 2. Fetch live transactions from DB/Plaid for the currently selected bank
  const fetchTransactions = async (accountId: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/plaid/transactions', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId })
      });
      const data = await res.json();
      
      if (data.error) {
        console.error('Plaid transactions error:', data);
        alert(`Failed to sync bank: ${data.error}`);
      }
      
      if (data.transactions) {
        const mappedFeed = data.transactions.map((t: any) => ({
          id: t.transaction_id,
          date: t.date,
          description: t.name,
          amount: t.amount * -1,
          sourceAccountId: accountId
        }));
        setBankFeed(accountId, mappedFeed);
      }
    } catch (err) {
      console.error('Failed to fetch transactions', err);
    }
    setLoading(false);
  };

  // 3. Configure Plaid Link for Adding Banks
  const onSuccess = useCallback(async (public_token: string, metadata: any) => {
    setLoading(true);
    try {
      const newAccountId = Math.random().toString(36).substring(2, 10);
      
      // Auto-create Chart of Accounts entry
      addAccount({
        id: newAccountId,
        name: metadata.institution.name || 'Connected Bank',
        type: 'asset',
        subType: 'checking',
        balance: 0,
        currency: 'CAD',
        plaidConnected: true
      });

      // Securely store token mapped to this specific account
      await fetch('/api/plaid/exchange_public_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_token, accountId: newAccountId }),
      });
      
      setSelectedBank(newAccountId);
      await fetchTransactions(newAccountId);
    } catch (err) {
      console.error('Exchange failed', err);
    }
    setLoading(false);
  }, [addAccount]);

  const onExit = useCallback((err: any, metadata: any) => {
    if (err != null) {
      console.error('Plaid Link exited with error:', err);
      setPlaidError(err.display_message || err.error_message || 'Plaid connection closed unexpectedly.');
    }
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken!,
    onSuccess,
    onExit,
  });

  const handleSendReview = (id: string) => {
    markBankTransactionForReview(id);
  };

  const openMatchModal = (tx: any) => {
    setMatchingTx(tx);
    setMatchType(tx.amount < 0 ? 'expense' : 'deposit');
    setMatchEntity(tx.description);
    setMatchCategory('');
    setBatchSelectedIds([]);
    setBatchSearchTerm('');

    // Smart Date Filtering
    if (tx.date) {
      const d = new Date(tx.date);
      // We use local timezone offset adjustment to ensure day is correct based on string
      const dayOfWeek = new Date(d.getTime() + d.getTimezoneOffset() * 60000).getDay(); // 0 = Sun, 1 = Mon
      if (dayOfWeek === 1) {
        // Monday -> Fri to Sun
        const from = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
        from.setDate(from.getDate() - 3);
        const to = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
        to.setDate(to.getDate() - 1);
        setBatchDateFrom(from.toISOString().split('T')[0]);
        setBatchDateTo(to.toISOString().split('T')[0]);
      } else {
        // 1 day before
        const prev = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
        prev.setDate(prev.getDate() - 1);
        setBatchDateFrom(prev.toISOString().split('T')[0]);
        setBatchDateTo(prev.toISOString().split('T')[0]);
      }
    } else {
      setBatchDateFrom('');
      setBatchDateTo('');
    }
  };

  const submitMatch = () => {
    if (!matchingTx) return;

    if (matchType === 'match_multiple') {
      const selectedTxs = transactions.filter(t => batchSelectedIds.includes(t.id));
      const totalSelected = selectedTxs.reduce((sum, t) => sum + Number(t.amountCAD ?? t.amount), 0);
      
      addBatchDeposit(
        matchingTx.id,
        batchSelectedIds,
        selectedBank, // Link the batch deposit to this bank account
        totalSelected, // The batch amount
        matchingTx.date, // The date of the bank feed tx
        matchingTx.description || 'Deposit Batch'
      );
      setMatchingTx(null);
      return;
    }

    if (!matchEntity && matchType !== 'deposit') {
      const transferAccount = accounts.find(a => a.id === matchEntity);
      if (!transferAccount) return alert('Transfer account not found');
      
      const isOutbound = matchingTx.amount < 0;
      transferBetweenAccounts({
        fromAccountId: isOutbound ? matchingTx.sourceAccountId : transferAccount.id,
        toAccountId: isOutbound ? transferAccount.id : matchingTx.sourceAccountId,
        amount: Math.abs(matchingTx.amount),
        date: matchingTx.date,
        notes: matchingTx.description,
        bankTransactionId: matchingTx.id
      });
      matchBankTransaction(matchingTx.id);
      setMatchingTx(null);
      return;
    }

    if (matchType === 'payroll') {
      const employee = employees.find(e => e.id === matchEntity);
      if (!employee) return alert('Employee not found');
      
      payPayrollEntity(employee.id, 'employee', Math.abs(matchingTx.amount));
      const billId = addBill({
        vendor: `Payroll: ${employee.name}`,
        amount: Math.abs(matchingTx.amount),
        dueDate: matchingTx.date,
        status: 'pending',
        category: 'Payroll Expense',
        bankTransactionId: matchingTx.id
      });
      markBillPaid(billId, matchingTx.sourceAccountId, 'Payroll Expense');
      matchBankTransaction(matchingTx.id);
      setMatchingTx(null);
      return;
    }

    if (matchType === 'expense') {
      // Create vendor if new
      const existingVendor = vendors.find(v => v.name.toLowerCase() === matchEntity.toLowerCase());
      if (!existingVendor && matchEntity) {
        addVendor({ name: matchEntity, fund: newVendorFund });
      }
      const billId = addBill({
        vendor: matchEntity,
        amount: Math.abs(matchingTx.amount),
        dueDate: matchingTx.date,
        status: 'pending',
        category: matchCategory || 'Uncategorized Expense',
        bankTransactionId: matchingTx.id
      });
      markBillPaid(billId, matchingTx.sourceAccountId, matchCategory || 'Uncategorized Expense');
    } else {
      addTransaction({
        donorId: 'unknown',
        amount: Math.abs(matchingTx.amount),
        date: matchingTx.date,
        type: 'approved',
        method: 'e_transfer',
        currency: 'CAD',
        sourceAccountId: matchingTx.sourceAccountId,
        category: matchCategory || 'General Donation',
        notes: `Bank Deposit: ${matchEntity}`,
        bankTransactionId: matchingTx.id
      });
    }

    matchBankTransaction(matchingTx.id);
    setMatchingTx(null);
  };

  const currentBankFeeds = bankFeeds[selectedBank] || [];
  
  const currentFeed = currentBankFeeds.filter((t: any) => {
    const isMatched = matchedBankTransactions.includes(t.id);
    const isReview = needsReviewBankTransactions.includes(t.id);
    if (selectedTab === 'unmatched') return !isMatched && !isReview;
    if (selectedTab === 'review') return isReview && !isMatched;
    if (selectedTab === 'matched') return isMatched;
    return false;
  });

  return (
    <div style={{ display: 'grid', gap: '24px' }}>
      <div className="card" style={{ padding: '0' }}>
        
        {/* Tab Bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-input)', borderTopLeftRadius: '12px', borderTopRightRadius: '12px', overflowX: 'auto' }}>
          {connectedBanks.map(bank => (
            <button
              key={bank.id}
              onClick={() => setSelectedBank(bank.id)}
              style={{
                padding: '16px 24px',
                background: selectedBank === bank.id ? 'var(--bg)' : 'transparent',
                border: 'none',
                borderBottom: selectedBank === bank.id ? '2px solid var(--navy)' : '2px solid transparent',
                color: selectedBank === bank.id ? 'var(--navy)' : 'var(--text-muted)',
                fontWeight: selectedBank === bank.id ? 700 : 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Building size={16} /> {bank.name}
            </button>
          ))}
          <button
            onClick={() => setSelectedBank('add')}
            style={{
              padding: '16px 24px',
              background: selectedBank === 'add' ? 'var(--bg)' : 'transparent',
              border: 'none',
              borderBottom: selectedBank === 'add' ? '2px solid var(--green)' : '2px solid transparent',
              color: selectedBank === 'add' ? 'var(--green)' : 'var(--text-muted)',
              fontWeight: selectedBank === 'add' ? 700 : 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Plus size={16} /> Add New Bank
          </button>
        </div>

        <div style={{ padding: '24px' }}>
          {selectedBank === 'add' ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', maxWidth: '400px', margin: '0 auto' }}>
              <Building size={48} style={{ color: 'var(--border)', marginBottom: '16px' }} />
              <h3 style={{ margin: '0 0 8px 0', color: 'var(--navy)' }}>Connect a New Bank</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '24px', lineHeight: 1.5 }}>
                Securely link another bank account. It will automatically be added to your Chart of Accounts.
              </p>
              
              {plaidError && <div style={{ color: 'var(--red)', fontSize: '0.85rem', fontWeight: 600, marginBottom: '16px', background: '#fef2f2', padding: '12px', borderRadius: '8px' }}>{plaidError}</div>}
              
              <button className="btn btn-primary" onClick={() => open()} disabled={!ready || loading} style={{ width: '100%' }}>
                <LinkIcon size={16} /> 
                {loading ? 'Connecting...' : 'Securely Connect Bank'}
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.25rem', fontFamily: 'Outfit, sans-serif', fontWeight: 700, color: 'var(--navy)' }}>
                    Transactions Queue
                  </h2>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
                    Match items below to clear them from your queue and record them in your Chart of Accounts.
                  </div>
                </div>
                
                <button className="btn btn-secondary" onClick={() => fetchTransactions(selectedBank)} disabled={loading}>
                  <RefreshCw size={16} className={loading ? 'spin' : ''} />
                  {loading ? ' Syncing...' : ' Sync Latest'}
                </button>
              </div>

              {/* Sub Tabs */}
              <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', borderBottom: '1px solid var(--border)' }}>
                {(['unmatched', 'review', 'matched'] as const).map(tab => {
                  let count = 0;
                  if (tab === 'unmatched') count = currentBankFeeds.filter((t: any) => !matchedBankTransactions.includes(t.id) && !needsReviewBankTransactions.includes(t.id)).length;
                  if (tab === 'review') count = currentBankFeeds.filter((t: any) => needsReviewBankTransactions.includes(t.id) && !matchedBankTransactions.includes(t.id)).length;
                  
                  return (
                    <button
                      key={tab}
                      onClick={() => setSelectedTab(tab)}
                      style={{
                        padding: '12px 16px',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: selectedTab === tab ? '2px solid var(--navy)' : '2px solid transparent',
                        color: selectedTab === tab ? 'var(--navy)' : 'var(--text-muted)',
                        fontWeight: selectedTab === tab ? 700 : 500,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                    >
                      {tab === 'unmatched' ? 'Unmatched' : tab === 'review' ? 'Needs Review' : 'Matched'}
                      {count > 0 && <span className={`badge ${tab === 'review' ? 'badge-urgent' : 'badge-primary'}`}>{count}</span>}
                    </button>
                  );
                })}
              </div>

              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Bank Description</th>
                      <th>Amount</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentFeed.map((t: any) => (
                      <tr key={t.id}>
                        <td>{t.date}</td>
                        <td style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.9rem' }}>{t.description}</td>
                        <td style={{ fontWeight: 700, color: t.amount > 0 ? 'var(--green)' : 'var(--navy)' }}>
                          ${Math.abs(t.amount).toFixed(2)} {t.amount < 0 ? '(Out)' : '(In)'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            {selectedTab !== 'matched' && (
                              <button className="btn btn-secondary btn-sm" onClick={() => openMatchModal(t)} title="Categorize and Record">
                                <Check size={14} /> Match
                              </button>
                            )}
                            {selectedTab === 'unmatched' && (
                              <button className="btn btn-ghost btn-sm" onClick={() => handleSendReview(t.id)} title="Send for Review">
                                <Send size={14} style={{ color: 'var(--gold)' }} /> Review
                              </button>
                            )}
                            {selectedTab === 'review' && (
                              <button className="btn btn-ghost btn-sm" onClick={() => unmarkBankTransactionForReview(t.id)} title="Remove from Review">
                                <X size={14} style={{ color: 'var(--text-muted)' }} /> Unmark
                              </button>
                            )}
                            {selectedTab === 'matched' && (
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <span style={{ color: 'var(--green)', fontWeight: 600, fontSize: '0.85rem' }}>Matched</span>
                                <button className="btn btn-ghost btn-sm" onClick={() => { if(window.confirm('Are you sure you want to unmatch this transaction? This will delete the internal records created.')) { unmatchBankTransaction(t.id); } }} style={{ color: 'var(--red)' }} title="Unmatch and Delete Records">
                                  <Trash2 size={14} /> Unmatch
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {currentFeed.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 20px' }}>
                          <Check size={40} style={{ color: 'var(--green)', opacity: 0.5, marginBottom: '12px' }} />
                          <div>No transactions in this view.</div>
                          <div style={{ fontSize: '0.85rem', marginTop: '4px' }}>Click "Sync Latest" to pull any new transactions from your bank.</div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {matchingTx && (
        <div className="modal-overlay" onClick={() => setMatchingTx(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Match Transaction</h2>
              <button className="modal-close" onClick={() => setMatchingTx(null)}><X size={20} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: 'var(--bg-input)', padding: '12px', borderRadius: '8px' }}>
                <div style={{ fontWeight: 600 }}>{matchingTx.description}</div>
                <div style={{ color: 'var(--text-muted)' }}>{matchingTx.date} • ${Math.abs(matchingTx.amount).toFixed(2)}</div>
              </div>

              <div className="form-group">
                <label>Type</label>
                <select value={matchType} onChange={e => setMatchType(e.target.value as any)}>
                  <option value="expense">Expense / Bill</option>
                  <option value="deposit">Deposit / Donation</option>
                  <option value="transfer">Transfer to/from Account</option>
                  <option value="payroll">Employee Payroll</option>
                  <option value="match_multiple">Match to Existing Transactions (Batch)</option>
                </select>
              </div>

              <div className="form-group">
                <label>
                  {matchType === 'expense' ? 'Vendor Name' : matchType === 'transfer' ? 'Transfer Account' : matchType === 'payroll' ? 'Employee' : 'Donor / Source Name'}
                </label>
                {matchType === 'expense' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <input 
                      list="vendors-list" 
                      type="text" 
                      value={matchEntity} 
                      onChange={e => setMatchEntity(e.target.value)} 
                      placeholder="Type to search or add vendor..."
                      style={{ width: '100%' }}
                    />
                    <datalist id="vendors-list">
                      {vendors.map(v => (
                        <option key={v.id} value={v.name} />
                      ))}
                    </datalist>
                    {/* Show Fund selector if this is a new vendor */}
                    {matchEntity && !vendors.find(v => v.name.toLowerCase() === matchEntity.toLowerCase()) && (
                      <div className="form-group" style={{ marginTop: '8px', padding: '8px', background: 'var(--bg-card)', borderRadius: '4px', border: '1px dashed var(--border)' }}>
                        <label style={{ fontSize: '12px' }}>New Vendor Detected. Select Fund:</label>
                        <select value={newVendorFund} onChange={e => setNewVendorFund(e.target.value)}>
                          <option value="Canadian WFW">Canadian WFW</option>
                          <option value="US Fund">US Fund</option>
                          <option value="Israel Fund">Israel Fund</option>
                          <option value="General">General</option>
                        </select>
                      </div>
                    )}
                  </div>
                ) : matchType === 'transfer' ? (
                  <select value={matchEntity} onChange={e => setMatchEntity(e.target.value)}>
                    <option value="">— Select Account —</option>
                    {accounts.filter(a => a.id !== selectedBank).map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                ) : matchType === 'payroll' ? (
                  <select value={matchEntity} onChange={e => setMatchEntity(e.target.value)}>
                    <option value="">— Select Employee —</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>{e.name} (Owes: ${e.balanceOwed.toFixed(2)})</option>
                    ))}
                  </select>
                ) : (
                  <input type="text" value={matchEntity} onChange={e => setMatchEntity(e.target.value)} />
                )}
              </div>

              {matchType !== 'transfer' && matchType !== 'payroll' && matchType !== 'match_multiple' && (
                <div className="form-group">
                  <label>Category / Fund</label>
                  {matchType === 'expense' ? (
                    <select 
                      value={matchCategory} 
                      onChange={e => {
                        if (e.target.value === 'ADD_NEW') {
                          setShowAddAccount(true);
                        } else {
                          setMatchCategory(e.target.value);
                        }
                      }}
                      required
                    >
                      <option value="">— Select Expense Category —</option>
                      {accounts.filter(a => a.type === 'expense').map(a => (
                        <option key={a.id} value={a.name}>{a.name}</option>
                      ))}
                      <option value="ADD_NEW">+ Add New Category</option>
                    </select>
                  ) : (
                    <input type="text" placeholder="e.g. Office Supplies, General Fund" value={matchCategory} onChange={e => setMatchCategory(e.target.value)} />
                  )}
                </div>
              )}

              {matchType === 'match_multiple' && (
                <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--navy)' }}>Select Internal Transactions</h3>
                    <div style={{ background: 'var(--bg-input)', padding: '4px 12px', borderRadius: '20px', fontSize: '0.9rem', fontWeight: 700 }}>
                      Selected: <span style={{ color: 'var(--green)' }}>${transactions.filter(t => batchSelectedIds.includes(t.id)).reduce((sum, t) => sum + Number(t.amountCAD ?? t.amount), 0).toFixed(2)}</span> 
                      <span style={{ color: 'var(--text-muted)', margin: '0 8px' }}>/</span> 
                      <span>${Math.abs(matchingTx.amount).toFixed(2)}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <input 
                      type="text" 
                      placeholder="Search by donor name..." 
                      value={batchSearchTerm}
                      onChange={e => setBatchSearchTerm(e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <input 
                      type="date" 
                      value={batchDateFrom}
                      onChange={e => setBatchDateFrom(e.target.value)}
                      title="From Date"
                      style={{ width: '130px' }}
                    />
                    <input 
                      type="date" 
                      value={batchDateTo}
                      onChange={e => setBatchDateTo(e.target.value)}
                      title="To Date"
                      style={{ width: '130px' }}
                    />
                    <select
                      value={batchMethodFilter}
                      onChange={e => setBatchMethodFilter(e.target.value)}
                      style={{ width: '130px' }}
                    >
                      <option value="">All Methods</option>
                      <option value="credit_card">Credit Card</option>
                      <option value="check">Check</option>
                      <option value="cash">Cash</option>
                      <option value="e_transfer">E-Transfer</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
                        <tr>
                          <th style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}></th>
                          <th style={{ padding: '8px', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>Date</th>
                          <th style={{ padding: '8px', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>Method</th>
                          <th style={{ padding: '8px', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>Donor</th>
                          <th style={{ padding: '8px', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactions
                          .filter(t => !t.isBatch && !t.batchTransactionId && t.type === 'approved')
                          .filter(t => {
                            if (batchMethodFilter && t.method !== batchMethodFilter) return false;
                            if (batchDateFrom && t.date < batchDateFrom) return false;
                            if (batchDateTo && t.date > batchDateTo) return false;
                            if (!batchSearchTerm) return true;
                            const donor = donors.find(d => d.id === t.donorId);
                            return donor?.name.toLowerCase().includes(batchSearchTerm.toLowerCase());
                          })
                          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                          .slice(0, 50)
                          .map(t => {
                            const donor = donors.find(d => d.id === t.donorId);
                            return (
                              <tr key={t.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: batchSelectedIds.includes(t.id) ? 'var(--blue-bg)' : 'transparent' }} onClick={() => {
                                setBatchSelectedIds(prev => prev.includes(t.id) ? prev.filter(id => id !== t.id) : [...prev, t.id]);
                              }}>
                                <td style={{ padding: '8px', textAlign: 'center' }}>
                                  <input type="checkbox" checked={batchSelectedIds.includes(t.id)} readOnly />
                                </td>
                                <td style={{ padding: '8px' }}>{t.date}</td>
                                <td style={{ padding: '8px' }}>
                                  <span style={{ fontSize: '0.75rem', background: 'var(--bg)', padding: '2px 6px', borderRadius: '4px' }}>
                                    {t.method.replace('_', ' ')}
                                  </span>
                                </td>
                                <td style={{ padding: '8px' }}>{donor?.name || 'Unknown'}</td>
                                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>${Number(t.amountCAD ?? t.amount).toFixed(2)}</td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ marginTop: '24px' }}>
              <button className="btn btn-secondary" onClick={() => setMatchingTx(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitMatch} disabled={matchType === 'match_multiple' && batchSelectedIds.length === 0}>
                Record {matchType === 'expense' ? 'Expense' : matchType === 'transfer' ? 'Transfer' : matchType === 'match_multiple' ? 'Batch Match' : 'Deposit'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
      {showAddAccount && (
        <AddAccountModal 
          onClose={() => setShowAddAccount(false)}
          defaultType="expense"
        />
      )}

    </div>
  );
};
