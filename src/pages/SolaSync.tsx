import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import { RefreshCw, CheckCircle, AlertTriangle, User, AlertCircle, FileText, Check, X, PlusCircle, Trash2, ChevronDown } from 'lucide-react';

interface SolaReportTransaction {
  RefNum: string;
  Name: string;
  Date: string;
  Amount: string;
  Status: string;
  Last4: string;
  CardType: string;
  Batch: string;
}

import { DonorCombobox } from '../components/DonorCombobox';

export const SolaSync: React.FC = () => {
  const { 
    isRtl, transactions, donors, solaApiKey, editDonor,
    cachedSolaData, setCachedSolaData,
    cachedSolaStartDate, setCachedSolaStartDate,
    cachedSolaEndDate, setCachedSolaEndDate,
    hasSolaSynced, setHasSolaSynced,
    editTransaction, addTransaction, dismissedSolaRefs, dismissSolaRef, bulkEditTransactions
  } = useStore();
  
  const T = useT(isRtl);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [startDate, setStartDate] = useState(cachedSolaStartDate || new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(cachedSolaEndDate || new Date().toISOString().split('T')[0]);
  
  const [ignoredAutoMatches, setIgnoredAutoMatches] = useState<string[]>([]);

  const [selectedDonorForImport, setSelectedDonorForImport] = useState<Record<string, string>>({});
  const [selectedMatchForSola, setSelectedMatchForSola] = useState<Record<string, string>>({});

  // Get App-side Credit Card transactions in date range
  // Include ALL pending, plus approved ones that DO NOT have a Sola Ref in their notes.
  const appTxs = transactions.filter(t => {
    if (t.method !== 'credit_card') return false;
    if (t.date < startDate || t.date > endDate) return false;
    
    if (t.type === 'pending') return true;
    if (t.type === 'approved' && (!t.notes || !t.notes.includes('Ref:'))) return true;
    return false;
  });

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
          startDate: `${startDate} 00:00:00`,
          endDate: `${endDate} 23:59:59`
        })
      });

      if (!res.ok) throw new Error('Failed to fetch from Sola API');

      const data = await res.json();
      
      if (data.xResult === 'E') {
        throw new Error(data.xError || 'Cardknox API Error');
      }
      
      let finalData: SolaReportTransaction[] = [];
      if (data && data.ReportData) {
        finalData = data.ReportData;
      } else if (data && data.xReportData) {
        // Map xReportData keys to standard ReportData keys
        finalData = data.xReportData.map((x: any) => ({
          RefNum: x.xRefNum || x.RefNum,
          Name: x.xName || x.Name || 'Unknown',
          Date: x.xEnteredDate || x.Date,
          Amount: x.xAmount || x.Amount,
          Status: x.xResponseResult || x.Status || 'Unknown',
          Last4: x.xMaskedCardNumber ? x.xMaskedCardNumber.slice(-4) : (x.Last4 || '****'),
          CardType: x.CardType || 'Credit',
          Batch: x.xBatch || x.Batch || ''
        }));
      }

      setCachedSolaData(finalData);
      setCachedSolaStartDate(startDate);
      setCachedSolaEndDate(endDate);
      setHasSolaSynced(true);
    } catch (err: any) {
      setError(err.message || 'An error occurred while syncing.');
    } finally {
      setLoading(false);
    }
  };

  // Only show APPROVED sola transactions that haven't been dismissed
  const visibleSola = cachedSolaData.filter(s => 
    s.Status && s.Status.toLowerCase() === 'approved' && 
    !dismissedSolaRefs.includes(s.RefNum)
  );

  // Optimize matching logic to prevent O(N^2) browser freezes with large datasets
  const { matchedAppTxs, unmatchedAppTxs, perfectlyMatchedSolaRefs, getAutoMatch } = React.useMemo(() => {
    const matchedTxs: typeof appTxs = [];
    const unmatchedTxs: typeof appTxs = [];
    const matchedSolaRefs = new Set<string>();
    const matchCache = new Map<string, SolaReportTransaction | undefined>();

    // Pre-process Sola transactions for faster lookup
    const solaByAmount = new Map<number, SolaReportTransaction[]>();
    for (const s of visibleSola) {
      if (ignoredAutoMatches.includes(s.RefNum)) continue; // skip ignored
      const amt = parseFloat(s.Amount);
      if (!solaByAmount.has(amt)) solaByAmount.set(amt, []);
      solaByAmount.get(amt)!.push(s);
    }

    const findMatch = (appTx: any) => {
      const possibleMatches = solaByAmount.get(appTx.amount);
      if (!possibleMatches) return undefined;
      
      const donor = donors.find(d => d.id === appTx.donorId);
      if (!donor) return undefined;
      
      const donorFirstName = donor.name.toLowerCase().split(' ')[0] || '';
      return possibleMatches.find(s => {
        const solaFirstName = s.Name.toLowerCase().split(' ')[0] || '';
        const nameMatch = solaFirstName.includes(donorFirstName) || donorFirstName.includes(solaFirstName);
        
        // Also check aliases
        const aliasMatch = donor.aliases?.some(alias => alias.toLowerCase() === s.Name.toLowerCase());
        
        return nameMatch || aliasMatch;
      });
    };

    for (const tx of appTxs) {
      const match = findMatch(tx);
      matchCache.set(tx.id, match);
      if (match) {
        matchedTxs.push(tx);
        matchedSolaRefs.add(match.RefNum);
      } else {
        unmatchedTxs.push(tx);
      }
    }

    return { 
      matchedAppTxs: matchedTxs, 
      unmatchedAppTxs: unmatchedTxs, 
      perfectlyMatchedSolaRefs: matchedSolaRefs,
      getAutoMatch: (tx: any) => matchCache.get(tx.id)
    };
  }, [appTxs, visibleSola, donors, ignoredAutoMatches]);

  const unmatchedSola = visibleSola.filter(s => !perfectlyMatchedSolaRefs.has(s.RefNum)).slice(0, 50); // Limit rendering to 50 to prevent DOM freeze

  const learnAlias = (donorId: string, solaName: string) => {
    const donor = donors.find(d => d.id === donorId);
    if (donor && solaName) {
      const currentAliases = donor.aliases || [];
      if (!currentAliases.includes(solaName)) {
        editDonor(donorId, { aliases: [...currentAliases, solaName] });
      }
    }
  };

  const approveMatch = (appTxId: string, solaRef: string, solaName?: string, solaTx?: SolaReportTransaction) => {
    const appTx = transactions.find(t => t.id === appTxId);
    editTransaction(appTxId, { 
      type: 'approved', 
      depositStatus: 'undeposited',
      sourceAccountId: 'sys-undeposited-funds',
      solaBatchId: solaTx?.Batch || '',
      notes: `Matched via Sola Sync. Ref: ${solaRef}` 
    });
    
    // Learn the alias if a Sola name was provided
    if (appTx && solaName) {
      learnAlias(appTx.donorId, solaName);
    }

    // Hide it from the Sola Actuals list now that it's matched
    dismissSolaRef(solaRef);
  };

  const manualApproveMatch = (solaTx: SolaReportTransaction) => {
    const appTxId = selectedMatchForSola[solaTx.RefNum];
    if (appTxId) {
      approveMatch(appTxId, solaTx.RefNum, solaTx.Name, solaTx);
    }
  };

  const importAsNew = (solaTx: SolaReportTransaction) => {
    const donorId = selectedDonorForImport[solaTx.RefNum];
    if (!donorId) {
      alert('Please select a donor first.');
      return;
    }
    addTransaction({
      donorId,
      amount: parseFloat(solaTx.Amount),
      amountCAD: parseFloat(solaTx.Amount), // Assumes same currency for simplicity
      date: solaTx.Date ? new Date(solaTx.Date).toISOString().split('T')[0] : endDate,
      type: 'approved',
      method: 'credit_card',
      currency: 'CAD',
      depositStatus: 'undeposited',
      sourceAccountId: 'sys-undeposited-funds',
      solaBatchId: solaTx.Batch || '',
      notes: `Imported as new via Sola Sync. Ref: ${solaTx.RefNum}`,
    });
    
    // Learn the alias
    learnAlias(donorId, solaTx.Name);
    
    dismissSolaRef(solaTx.RefNum); // Hide from left column
  };

  const autoDeclineLeftovers = () => {
    const pendingIds = unmatchedAppTxs.filter(t => t.type === 'pending').map(t => t.id);
    if (pendingIds.length === 0) {
      alert('No pending transactions left to decline!');
      return;
    }
    if (confirm(`Are you sure you want to mark ${pendingIds.length} unmatched pending transactions as declined?`)) {
      bulkEditTransactions(pendingIds, { type: 'declined', notes: 'Auto-declined after Sola Sync.' });
    }
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

      {hasSolaSynced && (
        <>
          {/* Smart Auto Matches Section */}
          {matchedAppTxs.length > 0 && (
            <div className="card" style={{ padding: '24px', background: 'rgba(52, 211, 153, 0.05)', border: '1px solid var(--green)' }}>
              <h3 style={{ margin: '0 0 16px', color: 'var(--green)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle size={20} /> Smart Auto-Matches Found ({matchedAppTxs.length})
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {matchedAppTxs.map(tx => {
                  const donor = donors.find(d => d.id === tx.donorId);
                  const match = getAutoMatch(tx);
                  if (!match) return null;
                  return (
                    <div key={tx.id} style={{ padding: '16px', background: 'var(--bg)', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <User size={14} /> App Donor: {donor?.name || 'Unknown'}
                        </div>
                        <div style={{ fontWeight: 700, color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Check size={14} /> Sola Name: {match.Name}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>${tx.amount.toLocaleString()} • {tx.date}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Matched to: {match.RefNum}</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <button className="btn btn-primary btn-sm" onClick={() => approveMatch(tx.id, match.RefNum, match.Name)}>Approve Match</button>
                        <button className="btn btn-secondary btn-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }} onClick={() => setIgnoredAutoMatches(prev => [...prev, match.RefNum])}>Unmatch</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            {/* Left Side: Sola Actuals (Unmatched) */}
            <div className="card" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, color: 'var(--navy)' }}>Sola Actuals (Unmatched)</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Declined charges hidden</span>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {unmatchedSola.length === 0 && <div style={{ color: 'var(--text-muted)' }}>No unmatched Sola charges.</div>}
                
                {unmatchedSola.map((tx, idx) => (
                  <div key={idx} style={{ padding: '16px', background: 'var(--bg-input)', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--navy)' }}>{tx.Name || 'Unknown Donor'}</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>{tx.Date} • *{tx.Last4} • Ref: {tx.RefNum}</div>
                      </div>
                      <div style={{ fontWeight: 800, color: 'var(--green)', fontSize: '1.2rem' }}>${tx.Amount}</div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px', borderTop: '1px solid var(--border-light)', paddingTop: '12px' }}>
                      
                      {/* Action 1: Import as New */}
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <DonorCombobox
                          donors={donors}
                          value={selectedDonorForImport[tx.RefNum] || ''}
                          onChange={(id) => setSelectedDonorForImport({...selectedDonorForImport, [tx.RefNum]: id})}
                          placeholder="Search for donor to import..."
                        />
                        <button className="btn btn-primary btn-sm" onClick={() => importAsNew(tx)}><PlusCircle size={16} /> Import</button>
                      </div>

                      {/* Action 2: Match Manually */}
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <select 
                          className="input" 
                          style={{ flex: 1, padding: '6px' }}
                          value={selectedMatchForSola[tx.RefNum] || ''}
                          onChange={e => setSelectedMatchForSola({...selectedMatchForSola, [tx.RefNum]: e.target.value})}
                        >
                          <option value="">Link to existing app transaction...</option>
                          {unmatchedAppTxs.map(appTx => {
                            const d = donors.find(d => d.id === appTx.donorId);
                            return <option key={appTx.id} value={appTx.id}>{d?.name} - ${appTx.amount} ({appTx.date})</option>;
                          })}
                        </select>
                        <button className="btn btn-secondary btn-sm" onClick={() => manualApproveMatch(tx)}>Link</button>
                      </div>

                      {/* Action 3: Dismiss */}
                      <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start', color: 'var(--text-muted)', border: 'none', background: 'none', padding: 0 }} onClick={() => dismissSolaRef(tx.RefNum)}>
                        <X size={14} style={{ marginRight: '4px' }} /> Dismiss / Hide from Sync
                      </button>

                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Side: App Transactions (Unmatched) */}
            <div className="card" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, color: 'var(--navy)' }}>App CC Transactions ({unmatchedAppTxs.length})</h3>
                <button className="btn btn-secondary btn-sm" style={{ color: 'var(--red)', borderColor: 'var(--red)' }} onClick={autoDeclineLeftovers}>
                  <AlertTriangle size={14} style={{ marginRight: '6px' }} /> Auto-Decline Pending
                </button>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {unmatchedAppTxs.length === 0 && <div style={{ color: 'var(--text-muted)' }}>No unmatched credit card transactions.</div>}
                
                {unmatchedAppTxs.map(tx => {
                  const donor = donors.find(d => d.id === tx.donorId);
                  const isPending = tx.type === 'pending';
                  
                  return (
                    <div key={tx.id} style={{ padding: '16px', background: isPending ? 'var(--yellow-bg)' : 'var(--bg)', borderRadius: '12px', border: isPending ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <User size={14} /> {donor?.name || 'Unknown'}
                          </div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Date: {tx.date}</div>
                          {tx.notes && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}><FileText size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />{tx.notes}</div>}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 800, color: 'var(--navy)', fontSize: '1.1rem' }}>${tx.amount.toLocaleString()}</div>
                          <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: isPending ? 'rgba(245, 158, 11, 0.2)' : 'var(--navy-light)', color: isPending ? '#b45309' : 'white', fontWeight: 700, textTransform: 'uppercase' }}>
                            {tx.type}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
