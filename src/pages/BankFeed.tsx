import React, { useState, useEffect, useCallback } from 'react';
import { useStore, UNDEPOSITED_FUNDS_ID } from '../store';
import { Building, Send, Check, Link as LinkIcon, RefreshCw, X, Plus, Trash2 } from 'lucide-react';
import { useT } from '../i18n';
import { usePlaidLink } from 'react-plaid-link';
import { AddAccountModal } from '../components/AddAccountModal';
import { BatchDetailsModal } from '../components/BatchDetailsModal';
import { DonorCombobox } from '../components/DonorCombobox';
import { TransactionModal } from '../components/TransactionModal';
import Papa from 'papaparse';

export const BankFeed: React.FC = () => {
  const { accounts, addAccount, isRtl, matchedBankTransactions, needsReviewBankTransactions, matchBankTransaction,
    markBankTransactionForReview, unmarkBankTransactionForReview, addBill, editBill, markBillPaid, addTransaction, bankFeeds,
    setBankFeed, transferBetweenAccounts, bills, vendors, addVendor, employees, payPayrollEntity, transactions,
    addBatchDeposit, donors, unmatchBankTransaction, autoMatchBankTransactions } = useStore();
  const T = useT(isRtl);
  
  const connectedBanks = accounts.filter(a => a.plaidConnected);
  const [selectedBank, setSelectedBank] = useState(connectedBanks.length > 0 ? connectedBanks[0].id : 'add');
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [plaidError, setPlaidError] = useState('');

  const [matchingTx, setMatchingTx] = useState<any | null>(null);
  const [matchType, setMatchType] = useState<'expense' | 'deposit' | 'transfer' | 'payroll' | 'match_multiple' | 'match_bill'>('expense');
  const [matchCategory, setMatchCategory] = useState('');
  const [matchEntity, setMatchEntity] = useState(''); // Vendor or Donor name
  const [matchExistingBillId, setMatchExistingBillId] = useState('');
  const [newVendorFund, setNewVendorFund] = useState('General');
  const [viewBatchId, setViewBatchId] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<'unmatched' | 'review' | 'matched'>('unmatched');
  const [batchSelectedIds, setBatchSelectedIds] = useState<string[]>([]);
  const [batchSearchTerm, setBatchSearchTerm] = useState('');
  const [batchDateFrom, setBatchDateFrom] = useState('');
  const [batchDateTo, setBatchDateTo] = useState('');
  const [isPayrollExpense, setIsPayrollExpense] = useState(false);
  const [payrollEmployeeId, setPayrollEmployeeId] = useState('');
  const [payrollT4a, setPayrollT4a] = useState(false);
  const [matchTaxable, setMatchTaxable] = useState(false);
  const [feedSearchDesc, setFeedSearchDesc] = useState('');
  const [feedSearchDate, setFeedSearchDate] = useState('');
  const [syncStartDate, setSyncStartDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const [showAddAccount, setShowAddAccount] = useState(false);
  const [payrollT4aEligible, setPayrollT4aEligible] = useState(false);
  const [batchMethodFilter, setBatchMethodFilter] = useState('');
  
  const [transactionModal, setTransactionModal] = useState<{ mode: 'match', initialData?: any } | null>(null);

  const handleTransactionModalSave = (result: any) => {
    const { type, data } = result;
    const t = transactionModal?.initialData;
    if (!t) return;

    if (type === 'expense') {
      let finalVendor = data.vendor;
      if (finalVendor === 'ADD_NEW_VENDOR') {
        const newName = prompt('Enter new vendor name:');
        if (newName) {
          finalVendor = newName;
          addVendor({ name: newName, fund: 'General' });
        }
      }
      const billId = addBill({
        vendor: finalVendor,
        amount: data.amount,
        dueDate: data.dueDate,
        status: data.status,
        category: data.category,
        taxable: data.taxable,
        projectId: data.projectId,
        creditAccountId: data.creditAccountId,
        isRecurring: data.isRecurring,
        recurringFrequency: data.recurringFrequency,
        isPayrollExpense: data.isPayrollExpense,
        employeeId: data.isPayrollExpense ? data.employeeId : undefined,
        t4aEligible: data.isPayrollExpense ? data.t4aEligible : undefined,
        bankTransactionId: t.id,
      });
      markBillPaid(billId, data.sourceAccountId);
      matchBankTransaction(t.id);
    } else if (type === 'transfer') {
      transferBetweenAccounts({
        fromAccountId: data.sourceAccountId,
        toAccountId: data.transferAccountId,
        amount: data.amount,
        date: data.dueDate,
        notes: 'Transfer',
        bankTransactionId: t.id,
      });
      matchBankTransaction(t.id);
    } else if (type === 'existing_bill') {
      const { billId } = data;
      editBill(billId, { bankTransactionId: t.id });
      markBillPaid(billId, selectedBank);
      matchBankTransaction(t.id);
    }
    setTransactionModal(null);
  };

  const isReconnectingRef = React.useRef(false);

  useEffect(() => {
    if (selectedBank !== 'add' && !accounts.find(a => a.id === selectedBank)) {
      setSelectedBank(connectedBanks[0]?.id || 'add');
    }
  }, [accounts, selectedBank, connectedBanks]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedTab, feedSearchDesc, feedSearchDate, selectedBank]);

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
  const fetchTransactions = async (accountId: string, start?: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/plaid/transactions', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, startDate: start })
      });
      const data = await res.json();
      
      if (data.error) {
        console.error('Plaid transactions error:', data);
        let errorMsg = data.error;
        if (data.details) {
          try {
            const parsed = JSON.parse(data.details);
            errorMsg = parsed.error_message || data.error;
          } catch(e) {}
        }
        alert(`Failed to sync bank: ${errorMsg}`);
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const mapped = results.data.map((row: any) => {
          const keys = Object.keys(row);
          const findKey = (searchStrings: string[]) => keys.find(k => searchStrings.some(s => k.toLowerCase().includes(s)));
          
          const dateKey = findKey(['date']);
          const descKey = findKey(['description', 'memo', 'payee', 'transaction']);
          const amountKey = findKey(['amount', 'transaction amount']);
          const debitKey = findKey(['debit', 'money out', 'expense', 'withdraw']);
          const creditKey = findKey(['credit', 'money in', 'deposit']);

          const date = dateKey ? row[dateKey] : new Date().toISOString().split('T')[0];
          const desc = descKey ? row[descKey] : 'Unknown Transaction';
          
          let amount = 0;
          if (amountKey) {
            amount = parseFloat(String(row[amountKey]).replace(/[^0-9.-]+/g, ''));
          } else if (debitKey && row[debitKey]) {
            amount = -Math.abs(parseFloat(String(row[debitKey]).replace(/[^0-9.-]+/g, '')));
          } else if (creditKey && row[creditKey]) {
            amount = Math.abs(parseFloat(String(row[creditKey]).replace(/[^0-9.-]+/g, '')));
          }

          if (isNaN(amount)) amount = 0;

          let formattedDate = date;
          try {
            const d = new Date(date);
            if (!isNaN(d.getTime())) {
              formattedDate = d.toISOString().split('T')[0];
            } else {
              const parts = String(date).split(/[\/\-.]/);
              if (parts.length === 3) {
                const day = parts[0].padStart(2, '0');
                const month = parts[1].padStart(2, '0');
                let year = parts[2];
                if (year.length === 2) year = '20' + year;
                formattedDate = `${year}-${month}-${day}`;
              }
            }
          } catch(e) {}

          return {
            id: `csv_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`,
            date: formattedDate,
            description: desc,
            amount: amount,
            sourceAccountId: selectedBank
          };
        }).filter(t => t.amount !== 0);

        if (mapped.length > 0) {
          const existing = bankFeeds[selectedBank] || [];
          setBankFeed(selectedBank, [...mapped, ...existing]);
          alert(`Successfully imported ${mapped.length} transactions from CSV!`);
        } else {
          alert('Could not parse any valid transactions from the CSV. Please ensure it has Date, Description, and Amount columns.');
        }
        
        e.target.value = '';
      }
    });
  };

  // 3. Configure Plaid Link for Adding Banks
  const onSuccess = useCallback(async (public_token: string, metadata: any) => {
    setLoading(true);
    try {
      let targetAccountId = selectedBank;
      
      if (!isReconnectingRef.current) {
        targetAccountId = Math.random().toString(36).substring(2, 10);
        
        // Auto-create Chart of Accounts entry
        addAccount({
          id: targetAccountId,
          name: metadata.institution.name || 'Connected Bank',
          type: 'asset',
          subType: 'checking',
          balance: 0,
          currency: 'CAD',
          plaidConnected: true
        });
      }

      // Securely store token mapped to this specific account
      await fetch('/api/plaid/exchange_public_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_token, accountId: targetAccountId }),
      });
      
      setSelectedBank(targetAccountId);
      isReconnectingRef.current = false;
      await fetchTransactions(targetAccountId);
    } catch (err) {
      console.error('Exchange failed', err);
    }
    setLoading(false);
  }, [addAccount, selectedBank]);

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
    if (tx.amount < 0) {
      setTransactionModal({
        mode: 'match',
        initialData: {
          id: tx.id,
          amount: Math.abs(tx.amount),
          dueDate: tx.date,
          vendor: tx.description,
          sourceAccountId: selectedBank,
          status: 'paid'
        }
      });
      return;
    }

    setMatchingTx(tx);
    setMatchType('deposit');
    setMatchEntity(''); // Clear so user picks from dropdown
    setMatchCategory('');
    setMatchExistingBillId('');
    setIsPayrollExpense(false);
    setPayrollEmployeeId('');
    setPayrollT4a(false);
    setMatchTaxable(false);
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

    if (matchType === 'match_bill') {
      if (!matchExistingBillId) return alert('Please select an existing bill to match.');
      const bill = bills.find(b => b.id === matchExistingBillId);
      if (!bill) return;

      if (bill.status === 'paid') {
        // Bill is already recorded as paid — just link the bank transaction to it (no balance changes)
        editBill(matchExistingBillId, { bankTransactionId: matchingTx.id });
      } else {
        // Bill is still pending — mark it paid from this bank account and link the bank transaction
        editBill(matchExistingBillId, { bankTransactionId: matchingTx.id, sourceAccountId: matchingTx.sourceAccountId });
        markBillPaid(matchExistingBillId, matchingTx.sourceAccountId);
      }
      matchBankTransaction(matchingTx.id);
      setMatchingTx(null);
      return;
    }

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


    if (matchType === 'expense') {
      // Create vendor if new
      const existingVendor = vendors.find(v => v.name.toLowerCase() === (matchEntity || '').toLowerCase());
      const vendorName = matchEntity || (isPayrollExpense && employees.find(e => e.id === payrollEmployeeId)?.name) || 'Unknown Vendor';
      if (!existingVendor && vendorName) {
        addVendor({ name: vendorName, fund: newVendorFund });
      }

      // 1. Create the expense bill (shows in Expenses page under selected category)
      const billId = addBill({
        vendor: vendorName,
        amount: Math.abs(matchingTx.amount),
        dueDate: matchingTx.date,
        status: 'pending',
        category: matchCategory || 'Uncategorized Expense',
        taxable: matchTaxable,
        bankTransactionId: matchingTx.id
      });
      markBillPaid(billId, matchingTx.sourceAccountId);

      // 2. If this is also a payroll payment, create a paid payroll entry for the employee
      if (isPayrollExpense && payrollEmployeeId) {
        const employee = employees.find(e => e.id === payrollEmployeeId);
        if (employee) {
          // Create a payroll-type paid bill to show the payment on the Payroll tab
          const payrollBillId = addBill({
            vendor: `Payroll: ${employee.name}`,
            employeeId: employee.id,
            amount: Math.abs(matchingTx.amount),
            dueDate: matchingTx.date,
            status: 'pending',
            category: 'Payroll Expense',
            isPayroll: true,
            bankTransactionId: matchingTx.id,
            t4aEligible: payrollT4a,
            taxable: matchTaxable
          });
          // Mark it paid immediately — this records the payment on the Payroll tab
          // and reduces the employee's balance
          markBillPaid(payrollBillId, matchingTx.sourceAccountId);
          // Directly reduce employee's balanceOwed by the payment amount
          payPayrollEntity(employee.id, 'employee', Math.abs(matchingTx.amount));
        }
      }
    } else {
      const isKnownDonor = donors.some(d => d.id === matchEntity);
      addTransaction({
        donorId: isKnownDonor ? matchEntity : 'unknown',
        amount: Math.abs(matchingTx.amount),
        date: matchingTx.date,
        type: 'approved',
        method: 'e_transfer',
        currency: 'CAD',
        sourceAccountId: matchingTx.sourceAccountId,
        category: matchCategory || 'General Donation',
        notes: isKnownDonor ? `Bank Deposit` : `Bank Deposit: ${matchEntity}`,
        bankTransactionId: matchingTx.id
      });
    }

    matchBankTransaction(matchingTx.id);
    setMatchingTx(null);
  };

  const currentBankFeeds = bankFeeds[selectedBank] || [];
  
  const currentFeed = currentBankFeeds.filter((t: any) => {
    if (feedSearchDesc && !t.description.toLowerCase().includes(feedSearchDesc.toLowerCase())) return false;
    if (feedSearchDate && t.date !== feedSearchDate) return false;

    const isMatched = matchedBankTransactions.includes(t.id);
    const isReview = needsReviewBankTransactions.includes(t.id);
    if (selectedTab === 'unmatched') return !isMatched && !isReview;
    if (selectedTab === 'review') return isReview && !isMatched;
    if (selectedTab === 'matched') return isMatched;
    return false;
  });

  const paginatedFeed = currentFeed.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontFamily: 'Outfit, sans-serif', fontWeight: 700, color: 'var(--navy)' }}>
                      Transactions Queue
                    </h2>
                    <button 
                      className="btn btn-ghost btn-sm" 
                      style={{ color: 'var(--blue)', border: '1px solid var(--blue-light)' }}
                      onClick={() => {
                        isReconnectingRef.current = true;
                        open();
                      }}
                      disabled={!ready || loading}
                      title="Update your bank connection to fetch more historical data"
                    >
                      <LinkIcon size={14} /> Reconnect Bank
                    </button>
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
                    Match items below to clear them from your queue and record them in your Chart of Accounts.
                  </div>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input 
                    type="date" 
                    value={syncStartDate} 
                    onChange={e => setSyncStartDate(e.target.value)} 
                    style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '0.85rem' }} 
                    title="Custom Start Date"
                  />
                  <button className="btn btn-secondary" onClick={() => fetchTransactions(selectedBank, syncStartDate)} disabled={loading}>
                    <RefreshCw size={16} className={loading ? 'spin' : ''} />
                    {loading ? ' Syncing...' : ' Sync Date'}
                  </button>
                  <button className="btn btn-secondary" onClick={() => fetchTransactions(selectedBank)} disabled={loading}>
                    <RefreshCw size={16} className={loading ? 'spin' : ''} />
                    {loading ? ' Syncing...' : ' Sync Latest'}
                  </button>
                  <button className="btn btn-secondary" onClick={() => { autoMatchBankTransactions(); alert('Auto-recovery complete. Orphaned records have been re-linked.'); }}>
                    Auto-Recover Matches
                  </button>
                  <label className="btn btn-primary" style={{ cursor: 'pointer', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Plus size={16} /> Upload CSV
                    <input type="file" accept=".csv, .xlsx, .xls" style={{ display: 'none' }} onChange={handleFileUpload} />
                  </label>
                </div>
              </div>

              {/* Feed Search Filters */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
                <input 
                  type="text" 
                  placeholder="Search by description..." 
                  value={feedSearchDesc}
                  onChange={e => setFeedSearchDesc(e.target.value)}
                  style={{ flex: '1 1 250px', padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border)', minWidth: '200px' }}
                />
                <div style={{ display: 'flex', gap: '12px', flex: '0 0 auto' }}>
                  <input 
                    type="date" 
                    value={feedSearchDate}
                    onChange={e => setFeedSearchDate(e.target.value)}
                    style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border)', width: '150px' }}
                  />
                  {(feedSearchDesc || feedSearchDate) && (
                    <button className="btn btn-ghost" onClick={() => { setFeedSearchDesc(''); setFeedSearchDate(''); }} style={{ color: 'var(--red)' }}>
                      <X size={16} /> Clear
                    </button>
                  )}
                </div>
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
                    {paginatedFeed.map(t => {
                      const internalTx = transactions.find(itx => itx.bankTransactionId === t.id);
                      const isBatch = internalTx?.isBatch;
                      return (
                      <tr 
                        key={t.id} 
                        style={{ opacity: selectedTab === 'matched' ? 0.6 : 1, cursor: selectedTab === 'matched' && isBatch ? 'pointer' : 'default' }}
                        onClick={() => {
                          if (selectedTab === 'matched' && isBatch && internalTx) {
                            setViewBatchId(internalTx.id);
                          }
                        }}
                      >
                        <td>{t.date}</td>
                        <td style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.9rem' }}>{t.description}</td>
                        <td style={{ fontWeight: 700, color: t.amount > 0 ? 'var(--green)' : 'var(--navy)' }}>
                          ${Math.abs(t.amount).toFixed(2)} {t.amount < 0 ? '(Out)' : '(In)'}
                        </td>

                        <td>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            {selectedTab !== 'matched' && (
                              <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); openMatchModal(t); }} title="Categorize and Record">
                                Match
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
                      );
                    })}
                    {currentFeed.length === 0 && (
                      <tr>
                        <td colSpan={selectedTab === 'unmatched' ? 5 : 4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 20px' }}>
                          <Check size={40} style={{ color: 'var(--green)', opacity: 0.5, marginBottom: '12px' }} />
                          <div>No transactions in this view.</div>
                          <div style={{ fontSize: '0.85rem', marginTop: '4px' }}>Click "Sync Latest" to pull any new transactions from your bank.</div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {currentFeed.length > itemsPerPage && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginTop: '20px' }}>
                  <button 
                    className="btn btn-secondary" 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                    Page {currentPage} of {Math.ceil(currentFeed.length / itemsPerPage)}
                  </span>
                  <button 
                    className="btn btn-secondary" 
                    disabled={currentPage >= Math.ceil(currentFeed.length / itemsPerPage)}
                    onClick={() => setCurrentPage(p => p + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
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
                <label>Action</label>
                <select value={matchType} onChange={e => setMatchType(e.target.value as any)}>
                  {matchingTx.amount < 0 ? (
                    <>
                      <option value="expense">Expense / Bill (New)</option>
                      <option value="match_bill">Match to Existing Bill / Expense</option>
                      <option value="transfer">Transfer to/from Account</option>
                    </>
                  ) : (
                    <>
                      <option value="deposit">Deposit / Donation (New)</option>
                      <option value="match_multiple">Match to Existing Transactions (Batch)</option>
                      <option value="transfer">Transfer to/from Account</option>
                    </>
                  )}
                </select>
              </div>

              <div className="form-group">
                <label>
                  {matchType === 'expense' ? 'Vendor' : matchType === 'match_bill' ? 'Existing Bill' : matchType === 'transfer' ? 'Transfer Account' : 'Donor / Source Name'}
                </label>
                {matchType === 'expense' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <select 
                      value={matchEntity} 
                      onChange={e => {
                        if (e.target.value === '__NEW__') {
                          setMatchEntity('');
                        } else {
                          setMatchEntity(e.target.value);
                        }
                      }}
                      style={{ width: '100%' }}
                    >
                      <option value="">— Select Vendor —</option>
                      {vendors.map(v => (
                        <option key={v.id} value={v.name}>{v.name}</option>
                      ))}
                      <option value="__NEW__">+ Type a New Vendor Name...</option>
                    </select>
                    {/* Allow typing a custom new vendor name */}
                    {(matchEntity === '' || !vendors.find(v => v.name === matchEntity)) && matchEntity !== '' && (
                      <div className="form-group" style={{ marginTop: '0' }}>
                        <input 
                          type="text"
                          value={matchEntity}
                          onChange={e => setMatchEntity(e.target.value)}
                          placeholder="Type new vendor name..."
                          style={{ width: '100%' }}
                        />
                      </div>
                    )}
                    {/* If no vendor yet selected, show new vendor name input when __NEW__ chosen */}
                    {matchEntity === '' && (
                      <input 
                        type="text"
                        placeholder="Or type a new vendor name here..."
                        onChange={e => setMatchEntity(e.target.value)}
                        style={{ width: '100%' }}
                      />
                    )}
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
                ) : matchType === 'match_bill' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <select
                      value={matchExistingBillId}
                      onChange={e => setMatchExistingBillId(e.target.value)}
                      style={{ width: '100%' }}
                    >
                      <option value="">— Select Existing Bill —</option>
                      <optgroup label="Pending Bills">
                        {bills.filter(b => b.status !== 'paid').map(b => (
                          <option key={b.id} value={b.id}>
                            {b.vendor} — ${b.amount.toFixed(2)} ({b.dueDate}) [Pending]
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Already Paid Bills (Link Only)">
                        {bills.filter(b => b.status === 'paid').map(b => (
                          <option key={b.id} value={b.id}>
                            {b.vendor} — ${b.amount.toFixed(2)} ({b.paidDate || b.dueDate}) [Paid]
                          </option>
                        ))}
                      </optgroup>
                    </select>
                    {matchExistingBillId && (() => {
                      const bill = bills.find(b => b.id === matchExistingBillId);
                      return bill ? (
                        <div style={{ background: bill.status === 'paid' ? 'rgba(var(--green-rgb, 34,197,94), 0.08)' : 'var(--bg-input)', padding: '10px', borderRadius: '8px', fontSize: '0.88rem', border: `1px solid ${bill.status === 'paid' ? 'var(--green)' : 'var(--border)'}` }}>
                          <strong>{bill.vendor}</strong> — ${bill.amount.toFixed(2)}<br />
                          Category: {accounts.find(a => a.id === bill.category)?.name || bill.category || 'Uncategorized'}<br />
                          Due: {bill.dueDate}<br />
                          Status: <span style={{ color: bill.status === 'paid' ? 'var(--green)' : 'var(--gold)', fontWeight: 600 }}>{bill.status === 'paid' ? '✓ Already Paid — bank transaction will just be linked' : '⏳ Pending — will be marked Paid from your bank account'}</span>
                        </div>
                      ) : null;
                    })()}
                  </div>
                ) : matchType === 'transfer' ? (
                  <select value={matchEntity} onChange={e => setMatchEntity(e.target.value)}>
                    <option value="">— Select Account —</option>
                    {accounts.filter(a => a.id !== selectedBank).map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                ) : (
                  <DonorCombobox donors={donors} value={matchEntity} onChange={setMatchEntity} />
                )}
              </div>

              {matchType !== 'transfer' && matchType !== 'match_multiple' && matchType !== 'match_bill' && (
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
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                      <option value="ADD_NEW">+ Add New Category</option>
                    </select>
                  ) : (
                    <input type="text" placeholder="e.g. Office Supplies, General Fund" value={matchCategory} onChange={e => setMatchCategory(e.target.value)} />
                  )}
                </div>
              )}

              {/* Payroll checkbox — only shown for expense type */}
              {matchType === 'expense' && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 600, color: 'var(--navy)', marginBottom: '12px' }}>
                    <input 
                      type="checkbox" 
                      checked={matchTaxable} 
                      onChange={e => setMatchTaxable(e.target.checked)}
                      style={{ width: 16, height: 16 }} 
                    />
                    Taxable (GST/QST applied)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 600, color: 'var(--navy)' }}>
                    <input 
                      type="checkbox" 
                      checked={isPayrollExpense} 
                      onChange={e => { setIsPayrollExpense(e.target.checked); setPayrollEmployeeId(''); setPayrollT4a(false); }}
                      style={{ width: 16, height: 16 }} 
                    />
                    This expense is also a payroll payment
                  </label>
                  {isPayrollExpense && (
                    <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px', background: 'var(--bg-input)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Employee receiving payment</label>
                        <select value={payrollEmployeeId} onChange={e => setPayrollEmployeeId(e.target.value)} style={{ width: '100%' }}>
                          <option value="">— Select Employee —</option>
                          {employees.map(e => (
                            <option key={e.id} value={e.id}>{e.name} (Balance owed: ${e.balanceOwed.toFixed(2)})</option>
                          ))}
                        </select>
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
                        <input type="checkbox" checked={payrollT4a} onChange={e => setPayrollT4a(e.target.checked)} style={{ width: 14, height: 14 }} />
                        <span>Include in T4A (Box 48 Eligible)</span>
                      </label>
                    </div>
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
                    {(() => {
                      const candidateTxs = transactions
                        .filter(t => t.type === 'approved' && !t.batchTransactionId)
                        .filter(t => t.sourceAccountId === 'sys-undeposited-funds' || t.depositStatus === 'undeposited' || ['credit_card', 'check', 'e_transfer'].includes(t.method))
                        .filter(t => {
                          if (batchMethodFilter && t.method !== batchMethodFilter) return false;
                          if (batchDateFrom && t.date < batchDateFrom) return false;
                          if (batchDateTo && t.date > batchDateTo) return false;
                          if (!batchSearchTerm) return true;
                          const donor = donors.find(d => d.id === t.donorId);
                          return donor?.name.toLowerCase().includes(batchSearchTerm.toLowerCase());
                        })
                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                        .slice(0, 500);

                      const grouped = candidateTxs.reduce((acc, tx) => {
                        const key = tx.solaBatchId || 'none';
                        if (!acc[key]) acc[key] = [];
                        acc[key].push(tx);
                        return acc;
                      }, {} as Record<string, typeof candidateTxs>);
                      
                      const allCandidateIds = candidateTxs.map(t => t.id);
                      const isAllSelected = allCandidateIds.length > 0 && allCandidateIds.every(id => batchSelectedIds.includes(id));
                      
                      const toggleAll = () => {
                        if (isAllSelected) {
                          setBatchSelectedIds(prev => prev.filter(id => !allCandidateIds.includes(id)));
                        } else {
                          const newIds = allCandidateIds.filter(id => !batchSelectedIds.includes(id));
                          setBatchSelectedIds(prev => [...prev, ...newIds]);
                        }
                      };

                      return (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                          <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
                            <tr>
                              <th style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>
                                <input 
                                  type="checkbox" 
                                  checked={isAllSelected}
                                  onChange={toggleAll}
                                />
                              </th>
                              <th style={{ padding: '8px', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>Date</th>
                              <th style={{ padding: '8px', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>Method</th>
                              <th style={{ padding: '8px', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>Donor</th>
                              <th style={{ padding: '8px', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(grouped).map(([batchId, groupTxs]) => {
                            const isGroup = batchId !== 'none';
                            const allSelected = groupTxs.every(t => batchSelectedIds.includes(t.id));
                            const toggleGroup = () => {
                              if (allSelected) {
                                setBatchSelectedIds(prev => prev.filter(id => !groupTxs.some(t => t.id === id)));
                              } else {
                                const newIds = groupTxs.filter(t => !batchSelectedIds.includes(t.id)).map(t => t.id);
                                setBatchSelectedIds(prev => [...prev, ...newIds]);
                              }
                            };

                            return (
                              <React.Fragment key={batchId}>
                                {isGroup && (
                                  <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '8px', textAlign: 'center' }}>
                                      <input type="checkbox" checked={allSelected} onChange={toggleGroup} />
                                    </td>
                                    <td colSpan={3} style={{ padding: '8px', fontWeight: 600, color: 'var(--navy)' }}>
                                      Sola Batch #{batchId}
                                    </td>
                                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>
                                      ${groupTxs.reduce((sum, t) => sum + Number(t.amountCAD ?? t.amount), 0).toFixed(2)}
                                    </td>
                                  </tr>
                                )}
                                {groupTxs.map(t => {
                                  const donor = donors.find(d => d.id === t.donorId);
                                  return (
                                    <tr key={t.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: batchSelectedIds.includes(t.id) ? 'var(--blue-bg)' : 'transparent' }} onClick={() => {
                                      setBatchSelectedIds(prev => prev.includes(t.id) ? prev.filter(id => id !== t.id) : [...prev, t.id]);
                                    }}>
                                      <td style={{ padding: '8px', textAlign: 'center' }}>
                                        <input type="checkbox" checked={batchSelectedIds.includes(t.id)} readOnly />
                                      </td>
                                      <td style={{ padding: '8px', paddingLeft: isGroup ? '24px' : '8px' }}>{t.date}</td>
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
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    );
                  })()}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ marginTop: '24px' }}>
              <button className="btn btn-secondary" onClick={() => setMatchingTx(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={(e) => { (e.target as HTMLButtonElement).disabled = true; submitMatch(); }} disabled={matchType === 'match_multiple' && batchSelectedIds.length === 0}>
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
      {viewBatchId && (
        <BatchDetailsModal batchId={viewBatchId} onClose={() => setViewBatchId(null)} />
      )}
      {transactionModal && (
        <TransactionModal
          mode={transactionModal.mode}
          initialData={transactionModal.initialData}
          onClose={() => setTransactionModal(null)}
          onSave={handleTransactionModalSave}
        />
      )}
    </div>
  );
};
