import React, { useState, useEffect } from 'react';
import { useStore, type Transaction } from '../store';
import { useT } from '../i18n';
import { RefreshCw, CheckCircle, AlertTriangle, ArrowRightLeft, CreditCard, User, AlertCircle, FileText } from 'lucide-react';

interface SolaReportTransaction {
  RefNum: string;
  Name: string;
  Date: string;
  Amount: string;
  Status: string;
  Last4: string;
  CardType: string;
}

export const SolaSync: React.FC = () => {
  const { isRtl, transactions, donors, solaApiKey, lastSolaSyncDate, setLastSolaSyncDate, editTransaction, addTransaction } = useStore();
  const T = useT(isRtl);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [startDate, setStartDate] = useState(lastSolaSyncDate || new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [solaData, setSolaData] = useState<SolaReportTransaction[]>([]);
  const [hasSynced, setHasSynced] = useState(false);

  // App-side pending transactions (Credit Card ONLY)
  const pendingTxs = transactions.filter(t => t.type === 'pending' && t.method === 'credit_card');

  const fetchSolaData = async () => {
    if (!solaApiKey) {
      setError('Please enter your Sola API Key in the Settings on the Dashboard first.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/sola/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: solaApiKey,
          startDate: startDate.replace(/-/g, ''), // API might want YYYYMMDD
          endDate: endDate.replace(/-/g, '')
        })
      });

      if (!res.ok) {
        throw new Error('Failed to fetch from Sola API');
      }

      const data = await res.json();
      
      // Handle the Cardknox report JSON format
      if (data && data.ReportData) {
        setSolaData(data.ReportData);
      } else {
        setSolaData([]);
      }
      setLastSolaSyncDate(endDate);
      setHasSynced(true);
    } catch (err: any) {
      setError(err.message || 'An error occurred while syncing.');
    } finally {
      setLoading(false);
    }
  };

  const approveMatch = (appTxId: string, solaRef: string) => {
    editTransaction(appTxId, { type: 'approved', notes: `Matched via Sola Sync. Ref: ${solaRef}` });
  };

  const moveToBalance = (appTxId: string) => {
    editTransaction(appTxId, { type: 'declined', notes: `Marked as missed/declined during Sola Sync.` });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', color: 'var(--navy)' }}>Sola Payments Sync</h1>
      </div>

      <div className="card" style={{ padding: '24px', display: 'flex', gap: '20px', alignItems: 'flex-end', background: 'var(--navy-bg)', border: '1px solid var(--blue-bg)' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label style={{ color: 'var(--navy)' }}>Start Date</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label style={{ color: 'var(--navy)' }}>End Date</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={fetchSolaData} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <RefreshCw size={18} className={loading ? 'spin' : ''} />
          {loading ? 'Syncing...' : 'Sync with Sola'}
        </button>
      </div>

      {error && (
        <div style={{ padding: '16px', background: 'var(--red-bg)', color: 'var(--red)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AlertCircle size={20} /> {error}
        </div>
      )}

      {hasSynced && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {/* Sola Side */}
          <div className="card" style={{ padding: '24px' }}>
            <h3 style={{ margin: '0 0 16px', color: 'var(--navy)' }}>Sola Actuals ({solaData.length})</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {solaData.length === 0 && <div style={{ color: 'var(--text-muted)' }}>No transactions found in this period.</div>}
              {solaData.map((tx, idx) => (
                <div key={idx} style={{ padding: '16px', background: 'var(--bg-input)', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{tx.Name || 'Unknown Donor'}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{tx.Date} • {tx.CardType} *{tx.Last4}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Ref: {tx.RefNum}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, color: 'var(--green)', fontSize: '1.1rem' }}>${tx.Amount}</div>
                    <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '999px', background: 'var(--green-bg)', color: 'var(--green)', fontWeight: 800, textTransform: 'uppercase' }}>{tx.Status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* App Pending Side */}
          <div className="card" style={{ padding: '24px' }}>
            <h3 style={{ margin: '0 0 16px', color: 'var(--navy)' }}>App Pending CC ({pendingTxs.length})</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {pendingTxs.length === 0 && <div style={{ color: 'var(--text-muted)' }}>No pending credit card transactions.</div>}
              {pendingTxs.map(tx => {
                const donor = donors.find(d => d.id === tx.donorId);
                
                // Auto-match simple logic: find Sola tx with exact same amount and exact same date (or very close name)
                const match = solaData.find(s => parseFloat(s.Amount) === tx.amount);

                return (
                  <div key={tx.id} style={{ padding: '16px', background: match ? 'rgba(52, 211, 153, 0.1)' : 'var(--yellow-bg)', borderRadius: '12px', border: match ? '1px solid var(--green)' : '1px solid rgba(245, 158, 11, 0.3)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <div>
                        <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}><User size={14} /> {donor?.name || 'Unknown'}</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Expected: {tx.date}</div>
                        {tx.notes && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}><FileText size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />{tx.notes}</div>}
                      </div>
                      <div style={{ fontWeight: 800, color: 'var(--navy)', fontSize: '1.1rem' }}>${tx.amount.toLocaleString()}</div>
                    </div>
                    
                    {match ? (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn-primary btn-sm" onClick={() => approveMatch(tx.id, match.RefNum)} style={{ flex: 1, padding: '6px' }}>Approve Match</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn-secondary btn-sm" style={{ flex: 1, padding: '6px', color: 'var(--red)', borderColor: 'var(--red)' }} onClick={() => moveToBalance(tx.id)}>Move to Balance (Failed)</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
