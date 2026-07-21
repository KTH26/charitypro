import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type BankAccount = { id: string; name: string; currency: string; bankConnected: boolean };
type CloudAccount = { id: string; name: string; currency: string; type: string };
type BankTransaction = { id: string; date: string; description: string; amount: number; sourceAccountId: string };
type Candidate = { id: string; donorName: string; amount: number; amountCAD?: number; date: string; method: string };
type BillCandidate = { id: string; revision: number; vendor: string; amount: number; currency?: string; dueDate: string; paidDate?: string; status: string; categoryName: string };

const thirtyDaysAgo = () => { const date = new Date(); date.setDate(date.getDate() - 30); return date.toISOString().slice(0, 10); };

export const OnlineBank: React.FC = () => {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [allAccounts, setAllAccounts] = useState<CloudAccount[]>([]);
  const [selectedBank, setSelectedBank] = useState('');
  const [matchedIds, setMatchedIds] = useState<string[]>([]);
  const [feed, setFeed] = useState<BankTransaction[]>([]);
  const [tab, setTab] = useState<'unmatched' | 'matched'>('unmatched');
  const [startDate, setStartDate] = useState(thirtyDaysAgo);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [matching, setMatching] = useState<BankTransaction | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidateWindow, setCandidateWindow] = useState({ startDate: '', endDate: '' });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [outgoing, setOutgoing] = useState<BankTransaction | null>(null);
  const [outgoingAction, setOutgoingAction] = useState<'expense' | 'existing_bill' | 'transfer'>('expense');
  const [vendor, setVendor] = useState('');
  const [category, setCategory] = useState('');
  const [taxable, setTaxable] = useState(false);
  const [targetAccountId, setTargetAccountId] = useState('');
  const [billId, setBillId] = useState('');
  const [billCandidates, setBillCandidates] = useState<BillCandidate[]>([]);
  const [saving, setSaving] = useState(false);
  const matchRequestIds = useRef<Record<string, string>>({});

  const loadState = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(''); }
    try {
      const response = await fetch('/api/v3/bank/state');
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load bank state.');
      setAccounts(data.accounts);
      setMatchedIds(data.matchedIds);
      setSelectedBank(current => current && data.accounts.some((account: BankAccount) => account.id === current) ? current : data.accounts[0]?.id || '');
    } catch (e: any) { if (!silent) setError(e.message || 'Unable to load bank state.'); }
    finally { if (!silent) setLoading(false); }
  }, []);

  const loadFeed = useCallback(async () => {
    if (!selectedBank) return;
    setLoading(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/plaid/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: selectedBank, startDate }) });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.details ? (JSON.parse(data.details).error_message || data.error) : (data.error || 'Unable to download bank transactions.'));
      const mapped = (data.transactions || []).map((transaction: any) => ({ id: transaction.transaction_id, date: transaction.date, description: transaction.name, amount: Number(transaction.amount) * -1, sourceAccountId: selectedBank }));
      setFeed(mapped.sort((a: BankTransaction, b: BankTransaction) => b.date.localeCompare(a.date)));
      setNotice(`Loaded ${mapped.length} bank transactions securely.`);
    } catch (e: any) { setError(e.message || 'Unable to download bank transactions.'); }
    finally { setLoading(false); }
  }, [selectedBank, startDate]);

  useEffect(() => { void loadState(); }, [loadState]);
  useEffect(() => { const interval = window.setInterval(() => void loadState(true), 3000); return () => window.clearInterval(interval); }, [loadState]);
  useEffect(() => { if (selectedBank) void loadFeed(); }, [selectedBank]);
  useEffect(() => { fetch('/api/v3/accounts').then(response => response.json()).then(data => { if (data.success) setAllAccounts(data.items); }).catch(() => undefined); }, []);

  const openDepositMatch = async (transaction: BankTransaction) => {
    setMatching(transaction); setSelectedIds([]); setCandidates([]); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/v3/bank/deposit-candidates?bankDate=${encodeURIComponent(transaction.date)}`);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load deposit candidates.');
      setCandidates(data.items); setCandidateWindow({ startDate: data.startDate, endDate: data.endDate });
    } catch (e: any) { setError(e.message || 'Unable to load deposit candidates.'); }
  };

  const selectedTotal = candidates.filter(candidate => selectedIds.includes(candidate.id)).reduce((sum, candidate) => sum + Number(candidate.amountCAD ?? candidate.amount), 0);
  const totalsMatch = matching ? Math.abs(selectedTotal - matching.amount) < 0.005 : false;
  const confirmDeposit = async () => {
    if (!matching || !totalsMatch || selectedIds.length === 0) return;
    setSaving(true); setError('');
    const requestId = matchRequestIds.current[matching.id] || crypto.randomUUID(); matchRequestIds.current[matching.id] = requestId;
    try {
      const response = await fetch('/api/v3/bank/match-deposit', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestId }, body: JSON.stringify({ requestId, accountId: selectedBank, bankTransactionId: matching.id, bankDate: matching.date, description: matching.description, amount: matching.amount, transactionIds: selectedIds }) });
      const data = await response.json();
      if (!response.ok || !data.success) { delete matchRequestIds.current[matching.id]; throw new Error(data.error || 'The bank deposit could not be matched.'); }
      delete matchRequestIds.current[matching.id]; setMatching(null); setCandidates([]); setSelectedIds([]); setNotice(`Deposit matched to ${data.selectedCount} cloud payment${data.selectedCount === 1 ? '' : 's'}.`); await loadState(true);
    } catch (e: any) { setError(e.message || 'The bank deposit could not be matched. You can safely try again.'); if (e.message?.includes('changed')) { setMatching(null); await loadState(true); } }
    finally { setSaving(false); }
  };

  const openOutgoingMatch = async (transaction: BankTransaction) => {
    setOutgoing(transaction); setOutgoingAction('expense'); setVendor(transaction.description); setCategory(''); setTaxable(false); setTargetAccountId(''); setBillId(''); setBillCandidates([]); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/v3/bank/bill-candidates?accountId=${encodeURIComponent(selectedBank)}&amount=${encodeURIComponent(String(Math.abs(transaction.amount)))}`);
      const data = await response.json();
      if (response.ok && data.success) setBillCandidates(data.items);
    } catch { /* New expense and transfer matching remain available. */ }
  };

  const confirmOutgoing = async () => {
    if (!outgoing) return;
    if (outgoingAction === 'expense' && (!vendor.trim() || !category)) { setError('Vendor and expense category are required.'); return; }
    if (outgoingAction === 'existing_bill' && !billId) { setError('Choose an existing bill.'); return; }
    if (outgoingAction === 'transfer' && !targetAccountId) { setError('Choose the destination account.'); return; }
    setSaving(true); setError('');
    const requestId = matchRequestIds.current[outgoing.id] || crypto.randomUUID(); matchRequestIds.current[outgoing.id] = requestId;
    const selectedBill = billCandidates.find(bill => bill.id === billId);
    try {
      const response = await fetch('/api/v3/bank/match-outgoing', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestId }, body: JSON.stringify({ requestId, action: outgoingAction, accountId: selectedBank, bankTransactionId: outgoing.id, bankDate: outgoing.date, description: outgoing.description, amount: Math.abs(outgoing.amount), vendor: vendor.trim(), category, taxable, targetAccountId, billId, revision: selectedBill?.revision }) });
      const data = await response.json();
      if (!response.ok || !data.success) { delete matchRequestIds.current[outgoing.id]; throw new Error(data.error || 'The outgoing transaction could not be matched.'); }
      delete matchRequestIds.current[outgoing.id]; setOutgoing(null); setNotice(data.action === 'expense' ? 'Bank transaction recorded as a paid cloud expense.' : data.action === 'existing_bill' ? 'Bank transaction linked to the existing cloud bill.' : 'Bank transaction recorded as a cloud account transfer.'); await loadState(true);
    } catch (e: any) { setError(e.message || 'The outgoing transaction could not be matched. You can safely try again.'); if (e.message?.includes('changed')) { setOutgoing(null); await loadState(true); } }
    finally { setSaving(false); }
  };

  const visibleFeed = useMemo(() => feed.filter(transaction => {
    if (search && !transaction.description.toLowerCase().includes(search.toLowerCase()) && !transaction.date.includes(search)) return false;
    const matched = matchedIds.includes(transaction.id);
    return tab === 'matched' ? matched : !matched;
  }), [feed, matchedIds, search, tab]);
  const selectedAccount = accounts.find(account => account.id === selectedBank);
  const expenseAccounts = allAccounts.filter(account => account.type === 'expense');
  const transferAccounts = allAccounts.filter(account => account.id !== selectedBank);

  return <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: 28, fontFamily: 'Inter, sans-serif' }}><div style={{ maxWidth: 1400, margin: '0 auto' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'center', marginBottom: 22 }}><div><div style={{ color: 'var(--green)', fontWeight: 800, fontSize: 13 }}>CHARITYPRO CLOUD</div><h1 style={{ color: 'var(--navy)', margin: '4px 0' }}>Bank Matching</h1><div style={{ color: 'var(--text-muted)' }}>Plaid feed with cloud-owned match history. Match state updates automatically every 3 seconds.</div></div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}><a className="btn btn-secondary" href="/expenses">Expenses</a><a className="btn btn-secondary" href="/payments">Payments</a><a className="btn btn-secondary" href="/chart-of-accounts">Accounts</a></div></div>
    {accounts.length === 0 && !loading && <div className="card" style={{ padding: 24 }}>No connected cloud bank was found. Use the current bank page to connect one.</div>}
    {accounts.length > 0 && <section className="card" style={{ padding: 18, marginBottom: 18 }}><div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px,1fr) 170px auto', gap: 10 }}><select value={selectedBank} onChange={e => setSelectedBank(e.target.value)}>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}{account.bankConnected ? '' : ' — reconnect required'}</option>)}</select><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} title="Download transactions from" /><button className="btn btn-primary" onClick={() => void loadFeed()} disabled={loading || !selectedAccount?.bankConnected}>{loading ? 'Loading...' : 'Refresh Bank Feed'}</button></div></section>}
    {matching && <section className="card" style={{ padding: 22, marginBottom: 18, border: '2px solid var(--green)' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}><div><h2 style={{ color: 'var(--navy)', margin: 0 }}>Match deposit: ${matching.amount.toFixed(2)}</h2><div style={{ color: 'var(--text-muted)', marginTop: 4 }}>{matching.date} · {matching.description}</div></div><button className="btn btn-ghost" onClick={() => { setMatching(null); setSelectedIds([]); }}>Close</button></div><p>Showing Undeposited Funds payments from <strong>{candidateWindow.startDate}</strong> through <strong>{candidateWindow.endDate}</strong>.</p><div style={{ maxHeight: 390, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={{ width: 40 }} /><th>Date</th><th>Donor</th><th>Method</th><th style={{ textAlign: 'right' }}>Amount CAD</th></tr></thead><tbody>{candidates.map(candidate => <tr key={candidate.id}><td><input type="checkbox" checked={selectedIds.includes(candidate.id)} onChange={() => setSelectedIds(ids => ids.includes(candidate.id) ? ids.filter(id => id !== candidate.id) : [...ids, candidate.id])} /></td><td>{candidate.date}</td><td>{candidate.donorName}</td><td>{candidate.method}</td><td style={{ textAlign: 'right', fontWeight: 800 }}>${Number(candidate.amountCAD ?? candidate.amount).toFixed(2)}</td></tr>)}{candidates.length === 0 && <tr><td colSpan={5} style={{ padding: 25, textAlign: 'center' }}>No eligible payments in this date window.</td></tr>}</tbody></table></div><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}><div><strong>Selected: ${selectedTotal.toFixed(2)}</strong><span style={{ color: totalsMatch ? 'var(--green)' : 'var(--red)', marginLeft: 12 }}>{totalsMatch ? 'Exact match' : `Difference: $${(matching.amount - selectedTotal).toFixed(2)}`}</span></div><button className="btn btn-primary" disabled={!totalsMatch || selectedIds.length === 0 || saving} onClick={() => void confirmDeposit()}>{saving ? 'Matching securely...' : 'Confirm Deposit Match'}</button></div></section>}
    {outgoing && <section className="card" style={{ padding: 22, marginBottom: 18, border: '2px solid var(--green)' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}><div><h2 style={{ color: 'var(--navy)', margin: 0 }}>Match money out: ${Math.abs(outgoing.amount).toFixed(2)}</h2><div style={{ color: 'var(--text-muted)', marginTop: 4 }}>{outgoing.date} · {outgoing.description}</div></div><button className="btn btn-ghost" onClick={() => setOutgoing(null)}>Close</button></div>
      <label className="form-group"><span>What is this transaction?</span><select value={outgoingAction} onChange={e => { setOutgoingAction(e.target.value as any); setError(''); }}><option value="expense">New expense</option><option value="existing_bill">Match existing bill</option><option value="transfer">Transfer to another account</option></select></label>
      {outgoingAction === 'expense' && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}><label className="form-group" style={{ margin: 0 }}><span>Vendor *</span><input value={vendor} onChange={e => setVendor(e.target.value)} /></label><label className="form-group" style={{ margin: 0 }}><span>Expense category *</span><select value={category} onChange={e => setCategory(e.target.value)}><option value="">Select category</option>{expenseAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><label style={{ display: 'flex', gap: 8, gridColumn: '1 / -1' }}><input type="checkbox" checked={taxable} onChange={e => setTaxable(e.target.checked)} /> Taxable</label></div>}
      {outgoingAction === 'existing_bill' && <label className="form-group"><span>Existing bill with the exact amount *</span><select value={billId} onChange={e => setBillId(e.target.value)}><option value="">Select bill</option>{billCandidates.map(bill => <option key={bill.id} value={bill.id}>{bill.vendor} — {bill.currency || 'CAD'} ${bill.amount.toFixed(2)} — {bill.dueDate} — {bill.status}</option>)}</select>{billCandidates.length === 0 && <small style={{ color: 'var(--text-muted)' }}>No unlinked bill has this exact amount.</small>}</label>}
      {outgoingAction === 'transfer' && <label className="form-group"><span>Transfer to *</span><select value={targetAccountId} onChange={e => setTargetAccountId(e.target.value)}><option value="">Select destination account</option>{transferAccounts.map(account => <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>)}</select></label>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}><button className="btn btn-secondary" onClick={() => setOutgoing(null)}>Cancel</button><button className="btn btn-primary" disabled={saving} onClick={() => void confirmOutgoing()}>{saving ? 'Matching securely...' : 'Confirm Match'}</button></div>
    </section>}
    {notice && <div className="card" style={{ padding: 14, color: 'var(--green)', fontWeight: 800, marginBottom: 16 }}>{notice}</div>}{error && <div className="card" style={{ padding: 14, color: 'var(--red)', fontWeight: 700, marginBottom: 16 }}>{error}</div>}
    <section className="card" style={{ padding: 0, overflow: 'hidden' }}><div style={{ display: 'flex', gap: 8, padding: 16, borderBottom: '1px solid var(--border)', alignItems: 'center' }}><button className={`btn ${tab === 'unmatched' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('unmatched')}>Unmatched</button><button className={`btn ${tab === 'matched' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('matched')}>Matched</button><input style={{ marginLeft: 'auto', maxWidth: 320 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search description or date" /></div><div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th>Date</th><th>Description</th><th>Direction</th><th style={{ textAlign: 'right' }}>Amount</th><th /></tr></thead><tbody>{visibleFeed.map(transaction => <tr key={transaction.id}><td>{transaction.date}</td><td style={{ fontWeight: 700 }}>{transaction.description}</td><td>{transaction.amount > 0 ? 'Money in' : 'Money out'}</td><td style={{ textAlign: 'right', fontWeight: 800, color: transaction.amount > 0 ? 'var(--green)' : 'var(--red)' }}>{transaction.amount > 0 ? '+' : '-'}${Math.abs(transaction.amount).toFixed(2)}</td><td style={{ textAlign: 'right' }}>{tab === 'unmatched' && transaction.amount > 0 && <button className="btn btn-primary btn-sm" onClick={() => void openDepositMatch(transaction)}>Match Deposit</button>}{tab === 'unmatched' && transaction.amount < 0 && <button className="btn btn-primary btn-sm" onClick={() => void openOutgoingMatch(transaction)}>Match Transaction</button>}{tab === 'matched' && <span style={{ color: 'var(--green)', fontWeight: 700 }}>Matched</span>}</td></tr>)}{visibleFeed.length === 0 && <tr><td colSpan={5} style={{ padding: 30, textAlign: 'center' }}>{feed.length ? 'No transactions in this tab.' : 'Refresh the bank feed to begin.'}</td></tr>}</tbody></table></div></section>
  </div></main>;
};
