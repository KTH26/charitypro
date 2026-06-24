import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store';
import { Building, Send, Check, Link as LinkIcon, RefreshCw, X } from 'lucide-react';
import { useT } from '../i18n';
import { usePlaidLink } from 'react-plaid-link';

export const BankFeed: React.FC = () => {
  const { accounts, isRtl, matchedBankTransactions, matchBankTransaction, addBill, addTransaction } = useStore();
  const T = useT(isRtl);
  const [selectedBank, setSelectedBank] = useState(accounts[0]?.id || '');
  const [feed, setFeed] = useState<any[]>([]);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasConnection, setHasConnection] = useState(false);

  // Match Modal State
  const [matchingTx, setMatchingTx] = useState<any | null>(null);
  const [matchType, setMatchType] = useState<'expense' | 'deposit'>('expense');
  const [matchCategory, setMatchCategory] = useState('');
  const [matchEntity, setMatchEntity] = useState(''); // Vendor or Donor name

  // 1. Fetch link token on mount
  useEffect(() => {
    const fetchLinkToken = async () => {
      try {
        const res = await fetch('/api/plaid/create_link_token', { method: 'POST' });
        const data = await res.json();
        if (data.link_token) {
          setLinkToken(data.link_token);
        }
      } catch (err) {
        console.error('Failed to get link token', err);
      }
    };
    fetchLinkToken();
  }, []);

  // 2. Fetch live transactions from DB/Plaid
  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/plaid/transactions', { method: 'POST' });
      const data = await res.json();
      if (data.transactions) {
        // Map Plaid transactions to our feed format
        const mappedFeed = data.transactions.map((t: any) => ({
          id: t.transaction_id,
          date: t.date,
          description: t.name,
          amount: t.amount * -1, // Plaid positive amount is a withdrawal (expense), so flip it for our UI
          status: matchedBankTransactions.includes(t.transaction_id) ? 'matched' : 'unmatched',
          sourceAccountId: selectedBank || 'default'
        }));
        setFeed(mappedFeed);
        setHasConnection(true);
      } else {
        setHasConnection(false);
      }
    } catch (err) {
      console.error('Failed to fetch transactions', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTransactions();
  }, [matchedBankTransactions]); // re-run or re-map when matchedBankTransactions changes

  // 3. Configure Plaid Link
  const onSuccess = useCallback(async (public_token: string, metadata: any) => {
    setLoading(true);
    try {
      await fetch('/api/plaid/exchange_public_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_token }),
      });
      await fetchTransactions();
    } catch (err) {
      console.error('Exchange failed', err);
    }
    setLoading(false);
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken!,
    onSuccess,
  });

  const handleSendReview = (id: string) => {
    setFeed(feed.map(f => f.id === id ? { ...f, status: 'review' } : f));
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

    if (matchType === 'expense') {
      addBill({
        vendor: matchEntity,
        amount: Math.abs(matchingTx.amount),
        dueDate: matchingTx.date,
        status: 'paid', // Bank feed means it's already paid
        category: matchCategory || 'Uncategorized Expense',
        paidDate: matchingTx.date,
        sourceAccountId: selectedBank,
      });
    } else {
      // It's a deposit (e.g. from a donor)
      addTransaction({
        donorId: 'unknown', // Ideally we'd map this to a real donor, but for simple matching we just record the deposit
        amount: Math.abs(matchingTx.amount),
        date: matchingTx.date,
        type: 'approved',
        method: 'e_transfer',
        currency: 'CAD',
        sourceAccountId: selectedBank,
        category: matchCategory || 'General Donation',
        notes: `Bank Deposit: ${matchEntity}`
      });
    }

    matchBankTransaction(matchingTx.id);
    setMatchingTx(null);
  };

  return (
    <div style={{ display: 'grid', gap: '24px' }}>
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontFamily: 'Outfit, sans-serif', fontWeight: 700, color: 'var(--navy)' }}>
              Live Bank Feed
            </h2>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
              Securely sync your bank to automatically track expenses and deposits.
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {hasConnection ? (
              <button className="btn btn-secondary" onClick={fetchTransactions} disabled={loading}>
                <RefreshCw size={16} className={loading ? 'spin' : ''} />
                {loading ? ' Syncing...' : ' Sync Latest'}
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => open()} disabled={!ready || loading}>
                <LinkIcon size={16} /> 
                {loading ? 'Connecting...' : 'Connect Bank'}
              </button>
            )}
            
            <select className="filter-select" value={selectedBank} onChange={e => setSelectedBank(e.target.value)} style={{ minWidth: '200px' }}>
              <option value="">All Accounts</option>
              {accounts.filter(a => a.type === 'asset').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Bank Description</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {feed.map(t => (
                <tr key={t.id} style={{ opacity: t.status === 'matched' ? 0.6 : 1 }}>
                  <td>{t.date}</td>
                  <td style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.9rem' }}>{t.description}</td>
                  <td style={{ fontWeight: 700, color: t.amount > 0 ? 'var(--green)' : 'var(--navy)' }}>
                    ${Math.abs(t.amount).toFixed(2)} {t.amount < 0 ? '(Out)' : '(In)'}
                  </td>
                  <td>
                    {t.status === 'unmatched' && <span className="badge badge-warning">Unmatched</span>}
                    {t.status === 'matched' && <span className="badge badge-success">Matched</span>}
                    {t.status === 'review' && <span className="badge badge-info">Sent for Review</span>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {t.status === 'unmatched' && (
                        <>
                          <button className="btn btn-secondary btn-sm" onClick={() => openMatchModal(t)} title="Categorize and Record">
                            <Check size={14} /> Match
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleSendReview(t.id)} title="Send for Review">
                            <Send size={14} style={{ color: 'var(--gold)' }} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {feed.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 20px' }}>
                    {!hasConnection ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                        <Building size={48} style={{ color: 'var(--border)' }} />
                        <div>No bank connected yet.</div>
                        <button className="btn btn-primary" onClick={() => open()} disabled={!ready}>
                          Connect Bank to see transactions
                        </button>
                      </div>
                    ) : (
                      'No pending bank feed items. You are all caught up!'
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
                </select>
              </div>

              <div className="form-group">
                <label>{matchType === 'expense' ? 'Vendor Name' : 'Donor / Source Name'}</label>
                <input type="text" value={matchEntity} onChange={e => setMatchEntity(e.target.value)} />
              </div>

              <div className="form-group">
                <label>Category / Fund</label>
                <input type="text" placeholder="e.g. Office Supplies, General Fund" value={matchCategory} onChange={e => setMatchCategory(e.target.value)} />
              </div>
            </div>
            <div className="modal-footer" style={{ marginTop: '24px' }}>
              <button className="btn btn-secondary" onClick={() => setMatchingTx(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitMatch}>Record {matchType === 'expense' ? 'Expense' : 'Deposit'}</button>
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
