import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store';
import { Building, Send, Check, Link as LinkIcon, RefreshCw, X, Plus } from 'lucide-react';
import { useT } from '../i18n';
import { usePlaidLink } from 'react-plaid-link';

export const BankFeed: React.FC = () => {
  const { accounts, addAccount, isRtl, matchedBankTransactions, matchBankTransaction, addBill, addTransaction, bankFeeds, setBankFeed } = useStore();
  const T = useT(isRtl);
  
  const connectedBanks = accounts.filter(a => a.plaidConnected);
  const [selectedBank, setSelectedBank] = useState(connectedBanks.length > 0 ? connectedBanks[0].id : 'add');
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [plaidError, setPlaidError] = useState('');

  // Match Modal State
  const [matchingTx, setMatchingTx] = useState<any | null>(null);
  const [matchType, setMatchType] = useState<'expense' | 'deposit'>('expense');
  const [matchCategory, setMatchCategory] = useState('');
  const [matchEntity, setMatchEntity] = useState(''); // Vendor or Donor name

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
    alert('Transaction sent to "Needs Review" tab for the other user.');
  };

  const openMatchModal = (tx: any) => {
    setMatchingTx(tx);
    setMatchType(tx.amount < 0 ? 'expense' : 'deposit');
    setMatchEntity(tx.description);
    setMatchCategory('');
  };

  const submitMatch = () => {
    if (!matchingTx) return;

    if (matchType === 'transfer') {
      const transferAccount = accounts.find(a => a.id === matchEntity);
      if (!transferAccount) return alert('Transfer account not found');
      
      const isOutbound = tx.amount < 0;
      transferBetweenAccounts({
        fromAccountId: isOutbound ? accountId : transferAccount.id,
        toAccountId: isOutbound ? transferAccount.id : accountId,
        amount: Math.abs(tx.amount),
        date: tx.date,
        notes: tx.description
      });
      matchBankTransaction(tx.transaction_id);
      setMatchingTx(null);
      return;
    }

    if (matchType === 'expense') {
      addBill({
        vendor: matchEntity,
        amount: Math.abs(matchingTx.amount),
        dueDate: matchingTx.date,
        status: 'paid',
        category: matchCategory || 'Uncategorized Expense',
        paidDate: matchingTx.date,
        sourceAccountId: matchingTx.sourceAccountId,
      });
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
        notes: `Bank Deposit: ${matchEntity}`
      });
    }

    matchBankTransaction(matchingTx.id);
    setMatchingTx(null);
  };

  // Only show unmatched transactions
  const currentFeed = (bankFeeds[selectedBank] || []).filter((t: any) => !matchedBankTransactions.includes(t.id));

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
                            <button className="btn btn-secondary btn-sm" onClick={() => openMatchModal(t)} title="Categorize and Record">
                              <Check size={14} /> Match
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => handleSendReview(t.id)} title="Send for Review">
                              <Send size={14} style={{ color: 'var(--gold)' }} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {currentFeed.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 20px' }}>
                          <Check size={40} style={{ color: 'var(--green)', opacity: 0.5, marginBottom: '12px' }} />
                          <div>No pending transactions in your queue.</div>
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
                </select>
              </div>

              <div className="form-group">
                <label>
                  {matchType === 'expense' ? 'Vendor Name' : matchType === 'transfer' ? 'Transfer Account' : 'Donor / Source Name'}
                </label>
                {matchType === 'expense' ? (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select value={matchEntity} onChange={e => setMatchEntity(e.target.value)} style={{ flex: 1 }}>
                      <option value="">— Select Vendor —</option>
                      {Array.from(new Set(bills.map(b => b.vendor))).sort().map(vendor => (
                        <option key={vendor} value={vendor}>{vendor}</option>
                      ))}
                    </select>
                    <button className="btn btn-secondary" onClick={() => {
                      const newVendor = prompt('Enter new vendor name:');
                      if (newVendor) setMatchEntity(newVendor);
                    }}>New</button>
                  </div>
                ) : matchType === 'transfer' ? (
                  <select value={matchEntity} onChange={e => setMatchEntity(e.target.value)}>
                    <option value="">— Select Account —</option>
                    {accounts.filter(a => a.id !== accountId).map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                ) : (
                  <input type="text" value={matchEntity} onChange={e => setMatchEntity(e.target.value)} />
                )}
              </div>

              {matchType !== 'transfer' && (
                <div className="form-group">
                  <label>Category / Fund</label>
                  <input type="text" placeholder="e.g. Office Supplies, General Fund" value={matchCategory} onChange={e => setMatchCategory(e.target.value)} />
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ marginTop: '24px' }}>
              <button className="btn btn-secondary" onClick={() => setMatchingTx(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitMatch}>Record {matchType === 'expense' ? 'Expense' : matchType === 'transfer' ? 'Transfer' : 'Deposit'}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
};
