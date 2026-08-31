import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { OnlinePaymentForm } from "../components/OnlinePaymentForm";
import { CloudTransactionModal } from "../components/CloudTransactionModal";

type BankAccount = {
  id: string;
  name: string;
  currency: string;
  bankConnected: boolean;
  savedTransactionCount?: number;
};
type CloudAccount = {
  id: string;
  name: string;
  currency: string;
  type: string;
};
type BankTransaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  sourceAccountId: string;
};
type Candidate = {
  id: string;
  donorName: string;
  amount: number;
  amountCAD?: number;
  date: string;
  method: string;
};
type BillCandidate = {
  id: string;
  revision: number;
  vendor: string;
  amount: number;
  currency?: string;
  dueDate: string;
  paidDate?: string;
  status: string;
  categoryName: string;
};
type RefundCandidate = BillCandidate & {
  refundableAmount: number;
  memo?: string;
};
type BankVendorRule = { vendor: string; category: string; internalCategory?: string; taxCategory?: string; taxable: boolean };

export const OnlineBank: React.FC = () => {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [allAccounts, setAllAccounts] = useState<CloudAccount[]>([]);
  const [selectedBank, setSelectedBank] = useState(() => window.localStorage.getItem("charitypro:selected-bank-account") || "");
  const [feed, setFeed] = useState<BankTransaction[]>([]);
  const [tab, setTab] = useState<"unmatched" | "matched" | "dismissed">("unmatched");
  const [startDate, setStartDate] = useState("");
  const [feedPage, setFeedPage] = useState(1);
  const [feedPages, setFeedPages] = useState(1);
  const [lastSyncDate, setLastSyncDate] = useState("");
  const [search, setSearch] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [matching, setMatching] = useState<BankTransaction | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidateWindow, setCandidateWindow] = useState({
    startDate: "",
    endDate: "",
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [depositAction, setDepositAction] = useState<"payments" | "refund">("payments");
  const [refundCandidates, setRefundCandidates] = useState<RefundCandidate[]>([]);
  const [refundBillId, setRefundBillId] = useState("");
  const [showMissingPayment, setShowMissingPayment] = useState(false);
  const [outgoing, setOutgoing] = useState<BankTransaction | null>(null);
  const [outgoingAction, setOutgoingAction] = useState<"expense" | "existing_bill" | "transfer">("expense");
  const [vendor, setVendor] = useState("");
  const [category, setCategory] = useState("");
  const [taxable, setTaxable] = useState(false);
  const [targetAccountId, setTargetAccountId] = useState("");
  const [billId, setBillId] = useState("");
  const [billCandidates, setBillCandidates] = useState<BillCandidate[]>([]);
  const [saving, setSaving] = useState(false);
  const [showFullExpense, setShowFullExpense] = useState(false);
  const [bankVendorRule, setBankVendorRule] = useState<BankVendorRule | null>(null);
  const [linkToken,setLinkToken]=useState<string|null>(null);
  const [connectionMode,setConnectionMode]=useState<'add'|'reconnect'>('add');
  const [connectionAccountId,setConnectionAccountId]=useState('');
  const [connectionNeedsExchange,setConnectionNeedsExchange]=useState(false);
  const [launchPlaid,setLaunchPlaid]=useState(false);
  const matchRequestIds = useRef<Record<string, string>>({});

  const beginBankConnection=async(mode:'add'|'reconnect',accountId='')=>{setLoading(true);setError('');setNotice('');setConnectionMode(mode);setConnectionAccountId(accountId);try{const response=await fetch('/api/plaid/create_link_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(mode==='reconnect'?{accountId}:{})});const data=await response.json();if(!response.ok||!data.link_token)throw new Error(data.error||'Unable to start the secure bank connection.');setConnectionNeedsExchange(data.mode!=='reconnect');setLinkToken(data.link_token);setLaunchPlaid(true);}catch(reason:any){setError(reason.message||'Unable to start the secure bank connection.');setLoading(false);}};
  const onPlaidSuccess=useCallback(async(publicToken:string,metadata:any)=>{setLoading(true);setError('');try{if(connectionMode==='reconnect'){if(connectionNeedsExchange){const exchangeResponse=await fetch('/api/plaid/exchange_public_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({public_token:publicToken,accountId:connectionAccountId})});const exchange=await exchangeResponse.json();if(!exchangeResponse.ok||!exchange.success)throw new Error(exchange.error||'Unable to save the repaired bank connection.');}setNotice('Bank connection repaired successfully. You can sync transactions again.');}else{const accountId=crypto.randomUUID();const name=String(metadata?.institution?.name||'Connected Bank').trim();const createKey=crypto.randomUUID();const createResponse=await fetch('/api/v3/records/accounts',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':createKey},body:JSON.stringify({data:{id:accountId,name,type:'asset',subType:'checking',currency:'CAD',startingBalance:0,plaidConnected:true}})});const created=await createResponse.json();if(!createResponse.ok||!created.success)throw new Error(created.error||'Unable to add the bank account.');const exchangeResponse=await fetch('/api/plaid/exchange_public_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({public_token:publicToken,accountId})});const exchange=await exchangeResponse.json();if(!exchangeResponse.ok||!exchange.success)throw new Error(exchange.error||'The bank was added, but its secure connection could not be saved. Use Reconnect Bank to finish.');setSelectedBank(accountId);setNotice(`${name} was added successfully.`);}const stateResponse=await fetch('/api/v3/bank/state');const state=await stateResponse.json();if(stateResponse.ok&&state.success)setAccounts(state.accounts||[]);}catch(reason:any){setError(reason.message||'Unable to finish the bank connection.');}finally{setLaunchPlaid(false);setLoading(false);setLinkToken(null);}},[connectionMode,connectionNeedsExchange,connectionAccountId]);
  const onPlaidExit=useCallback((reason:any)=>{setLaunchPlaid(false);setLoading(false);setLinkToken(null);if(reason)setError(reason.display_message||reason.error_message||'The bank connection was not completed.');},[]);
  const {open:openPlaid,ready:plaidReady}=usePlaidLink({token:linkToken,onSuccess:onPlaidSuccess,onExit:onPlaidExit});
  useEffect(()=>{if(launchPlaid&&plaidReady)openPlaid();},[launchPlaid,plaidReady,openPlaid]);

  const loadState = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError("");
    }
    try {
      const response = await fetch("/api/v3/bank/state");
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Unable to load bank state.");
      setAccounts(data.accounts);
      setSelectedBank((current) => (current && data.accounts.some((account: BankAccount) => account.id === current) ? current : data.accounts[0]?.id || ""));
    } catch (e: any) {
      if (!silent) setError(e.message || "Unable to load bank state.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadFeed = useCallback(
    async (silent = false) => {
      if (!selectedBank) return;
      if (!silent) setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          accountId: selectedBank,
          page: String(feedPage),
          limit: "50",
          matchStatus: tab,
          search,
          from: filterFrom,
          to: filterTo,
        });
        const response = await fetch(`/api/v3/bank/feed?${params}`);
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || "Unable to load saved bank transactions.");
        setFeed(
          (data.items || []).map((transaction: any) => ({
            ...transaction,
            sourceAccountId: selectedBank,
          })),
        );
        setFeedPages(Math.max(1, Number(data.totalPages || 1)));
        setLastSyncDate(String(data.sync?.lastSuccessfulDate || ""));
      } catch (e: any) {
        if (!silent) setError(e.message || "Unable to load saved bank transactions.");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [selectedBank, feedPage, tab, search, filterFrom, filterTo],
  );

  const syncFeed = async () => {
    if (!selectedBank) return;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/plaid/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: selectedBank,
          startDate: startDate || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.details ? JSON.parse(data.details).error_message || data.error : data.error || "Unable to sync bank transactions.");
      setFeedPage(1);
      setStartDate("");
      setNotice(`Bank feed updated from ${data.sync?.fetchedFrom || "the last sync"} through ${data.sync?.fetchedTo || "today"}. ${data.transactions?.length || 0} transactions checked and saved in the cloud.`);
      await loadFeed(true);
    } catch (e: any) {
      setError(e.message || "Unable to sync bank transactions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadState();
  }, [loadState]);
  useEffect(() => {
    if (selectedBank) window.localStorage.setItem("charitypro:selected-bank-account", selectedBank);
  }, [selectedBank]);
  useEffect(() => {
    const interval = window.setInterval(() => void loadState(true), 3000);
    return () => window.clearInterval(interval);
  }, [loadState]);
  useEffect(() => {
    if (selectedBank) void loadFeed();
  }, [selectedBank, feedPage, loadFeed]);
  useEffect(() => {
    fetch("/api/v3/accounts?limit=100")
      .then((response) => response.json())
      .then((data) => {
        if (data.success) setAllAccounts(data.items);
      })
      .catch(() => undefined);
  }, []);

  const loadDepositCandidates = async (transaction: BankTransaction, from?: string, to?: string) => {
    const params = new URLSearchParams({
      bankDate: transaction.date,
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    });
    const response = await fetch(`/api/v3/bank/deposit-candidates?${params}`);
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || "Unable to load deposit candidates.");
    setCandidates(data.items);
    setCandidateWindow({ startDate: data.startDate, endDate: data.endDate });
  };
  const loadRefundCandidates = async (transaction: BankTransaction) => {
    const response = await fetch(`/api/v3/bank/refund-candidates?accountId=${encodeURIComponent(selectedBank)}&amount=${encodeURIComponent(String(transaction.amount))}`);
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || "Unable to load refundable expenses.");
    setRefundCandidates(data.items || []);
  };
  const openDepositMatch = async (transaction: BankTransaction) => {
    setMatching(transaction);
    setDepositAction("payments");
    setRefundCandidates([]);
    setRefundBillId("");
    setSelectedIds([]);
    setCandidates([]);
    setError("");
    setNotice("");
    try {
      await loadDepositCandidates(transaction);
    } catch (e: any) {
      setError(e.message || "Unable to load deposit candidates.");
    }
  };

  const selectedTotal = candidates.filter((candidate) => selectedIds.includes(candidate.id)).reduce((sum, candidate) => sum + Number(candidate.amountCAD ?? candidate.amount), 0);
  const totalsMatch = matching ? Math.abs(selectedTotal - matching.amount) < 0.005 : false;
  const removeMatchedFromVisibleFeed = (bankTransactionId: string) => setFeed((current) => current.filter((transaction) => transaction.id !== bankTransactionId));
  const changeFeedStatus = async (transaction: BankTransaction, action: "dismiss" | "restore") => {
    setSaving(true); setError(""); setNotice("");
    try {
      const requestId = crypto.randomUUID();
      const response = await fetch("/api/v3/bank/feed-status", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": requestId }, body: JSON.stringify({ requestId, action, accountId: selectedBank, bankTransactionId: transaction.id }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Unable to update this bank transaction.");
      removeMatchedFromVisibleFeed(transaction.id);
      setNotice(action === "dismiss" ? "Transaction moved to Dismissed. No accounting entry was created." : "Transaction restored to Unmatched and is ready to review.");
      await loadFeed(true);
    } catch (reason: any) { setError(reason.message || "Unable to update this bank transaction."); }
    finally { setSaving(false); }
  };
  const matchDepositPayments = async (transactionIds: string[]) => {
    if (!matching || transactionIds.length === 0) return;
    setSaving(true);
    setError("");
    const requestId = matchRequestIds.current[matching.id] || crypto.randomUUID();
    matchRequestIds.current[matching.id] = requestId;
    try {
      const response = await fetch("/api/v3/bank/match-deposit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": requestId,
        },
        body: JSON.stringify({
          requestId,
          accountId: selectedBank,
          bankTransactionId: matching.id,
          bankDate: matching.date,
          candidateFrom: candidateWindow.startDate,
          candidateTo: candidateWindow.endDate,
          description: matching.description,
          amount: matching.amount,
          transactionIds,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        delete matchRequestIds.current[matching.id];
        throw new Error(data.error || "The bank deposit could not be matched.");
      }
      const matchedId = matching.id;
      delete matchRequestIds.current[matchedId];
      removeMatchedFromVisibleFeed(matchedId);
      setMatching(null);
      setCandidates([]);
      setSelectedIds([]);
      setNotice(`Deposit matched to ${data.selectedCount} cloud payment${data.selectedCount === 1 ? "" : "s"}.`);
      await Promise.all([loadState(true), loadFeed(true)]);
    } catch (e: any) {
      setError(e.message || "The bank deposit could not be matched. You can safely try again.");
      if (e.message?.includes("changed")) {
        setMatching(null);
        await loadState(true);
      }
    } finally {
      setSaving(false);
    }
  };
  const confirmDeposit = async () => {
    if (!totalsMatch || selectedIds.length === 0) return;
    await matchDepositPayments(selectedIds);
  };
  const confirmRefund = async () => {
    if (!matching || !refundBillId) return;
    const bill = refundCandidates.find((item) => item.id === refundBillId);
    if (!bill) return;
    setSaving(true);
    setError("");
    const requestId = matchRequestIds.current[matching.id] || crypto.randomUUID();
    matchRequestIds.current[matching.id] = requestId;
    try {
      const response = await fetch("/api/v3/bank/match-refund", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": requestId,
        },
        body: JSON.stringify({
          requestId,
          accountId: selectedBank,
          bankTransactionId: matching.id,
          bankDate: matching.date,
          description: matching.description,
          amount: matching.amount,
          billId: bill.id,
          revision: bill.revision,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        delete matchRequestIds.current[matching.id];
        throw new Error(data.error || "The refund could not be matched.");
      }
      const matchedId = matching.id;
      delete matchRequestIds.current[matchedId];
      removeMatchedFromVisibleFeed(matchedId);
      setMatching(null);
      setRefundCandidates([]);
      setRefundBillId("");
      setNotice("Refund linked to the original expense and applied to its category.");
      await Promise.all([loadState(true), loadFeed(true)]);
    } catch (reason: any) {
      setError(reason.message || "The refund could not be matched. You can safely try again.");
    } finally {
      setSaving(false);
    }
  };

  const openOutgoingMatch = async (transaction: BankTransaction) => {
    setOutgoingAction("expense");
    setBankVendorRule(null);
    setVendor(transaction.description);
    setCategory("");
    setTaxable(false);
    setTargetAccountId("");
    setBillId("");
    setBillCandidates([]);
    setError("");
    setNotice("");
    try {
      const [billResponse, ruleResponse] = await Promise.all([
        fetch(`/api/v3/bank/bill-candidates?accountId=${encodeURIComponent(selectedBank)}&amount=${encodeURIComponent(String(Math.abs(transaction.amount)))}`),
        fetch(`/api/v3/bank/vendor-rule?description=${encodeURIComponent(transaction.description)}`),
      ]);
      const [billData, ruleData] = await Promise.all([billResponse.json(), ruleResponse.json()]);
      if (billResponse.ok && billData.success) setBillCandidates(billData.items);
      if (ruleResponse.ok && ruleData.success && ruleData.rule) setBankVendorRule(ruleData.rule);
    } catch {
      /* New expense and transfer matching remain available. */
    } finally {
      setOutgoing(transaction);
      setShowFullExpense(true);
    }
  };

  const confirmOutgoing = async () => {
    if (!outgoing) return;
    if (outgoingAction === "expense" && (!vendor.trim() || !category)) {
      setError("Vendor and expense category are required.");
      return;
    }
    if (outgoingAction === "existing_bill" && !billId) {
      setError("Choose an existing bill.");
      return;
    }
    if (outgoingAction === "transfer" && !targetAccountId) {
      setError("Choose the destination account.");
      return;
    }
    setSaving(true);
    setError("");
    const requestId = matchRequestIds.current[outgoing.id] || crypto.randomUUID();
    matchRequestIds.current[outgoing.id] = requestId;
    const selectedBill = billCandidates.find((bill) => bill.id === billId);
    try {
      const response = await fetch("/api/v3/bank/match-outgoing", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": requestId,
        },
        body: JSON.stringify({
          requestId,
          action: outgoingAction,
          accountId: selectedBank,
          bankTransactionId: outgoing.id,
          bankDate: outgoing.date,
          description: outgoing.description,
          amount: Math.abs(outgoing.amount),
          vendor: vendor.trim(),
          category,
          taxable,
          targetAccountId,
          billId,
          revision: selectedBill?.revision,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        delete matchRequestIds.current[outgoing.id];
        throw new Error(data.error || "The outgoing transaction could not be matched.");
      }
      const matchedId = outgoing.id;
      delete matchRequestIds.current[matchedId];
      removeMatchedFromVisibleFeed(matchedId);
      setOutgoing(null);
      setNotice(data.action === "expense" ? "Bank transaction recorded as a paid cloud expense." : data.action === "existing_bill" ? "Bank transaction linked to the existing cloud bill." : "Bank transaction recorded as a cloud account transfer.");
      await Promise.all([loadState(true), loadFeed(true)]);
    } catch (e: any) {
      setError(e.message || "The outgoing transaction could not be matched. You can safely try again.");
      if (e.message?.includes("changed")) {
        setOutgoing(null);
        await loadState(true);
      }
    } finally {
      setSaving(false);
    }
  };

  const visibleFeed = useMemo(() => feed, [feed]);
  const selectedAccount = accounts.find((account) => account.id === selectedBank);
  const expenseAccounts = allAccounts.filter((account) => account.type === "expense");
  const transferAccounts = allAccounts.filter((account) => account.id !== selectedBank);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        padding: 28,
        fontFamily: "Inter, sans-serif",
      }}
    >
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <div style={{ marginBottom: 22 }}>
          <div style={{ color: "var(--green)", fontWeight: 800, fontSize: 13 }}>CHARITYPRO CLOUD</div>
          <h1 style={{ color: "var(--navy)", margin: "4px 0" }}>Bank Matching</h1>
          <div style={{ color: "var(--text-muted)" }}>Plaid feed with cloud-owned match history. Match state updates automatically every 3 seconds.</div>
        </div>
        {accounts.length === 0 && !loading && (
          <div className="card" style={{ padding: 24, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <span>No connected cloud bank was found.</span>
            <button className="btn btn-primary" onClick={() => void beginBankConnection("add")}>
              + Add New Bank
            </button>
          </div>
        )}
        {accounts.length > 0 && (
          <section className="card" style={{ padding: 18, marginBottom: 18 }}>
            <div
              style={{
                display: "flex",
                gap: 8,
                overflowX: "auto",
                paddingBottom: 14,
                marginBottom: 14,
                borderBottom: "1px solid var(--border)",
              }}
            >
              {accounts.map((account) => (
                <button
                  key={account.id}
                  className={`btn ${selectedBank === account.id ? "btn-primary" : "btn-secondary"}`}
                  style={{
                    whiteSpace: "nowrap",
                    display: "grid",
                    gap: 2,
                    textAlign: "left",
                  }}
                  onClick={() => {
                    setSelectedBank(account.id);
                    setFeedPage(1);
                    setSearch("");
                    setFilterFrom("");
                    setFilterTo("");
                  }}
                >
                  <strong>{account.name}</strong>
                  <small>
                    {Number(account.savedTransactionCount || 0).toLocaleString()} saved transaction
                    {Number(account.savedTransactionCount || 0) === 1 ? "" : "s"}
                    {account.bankConnected ? "" : " · reconnect required"}
                  </small>
                </button>
              ))}
              <button className="btn btn-secondary" style={{whiteSpace:'nowrap'}} disabled={loading} onClick={()=>void beginBankConnection('add')}>+ Add New Bank</button>
            </div>
            {selectedAccount&&!selectedAccount.bankConnected&&<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,padding:14,marginBottom:14,border:'1px solid var(--red)',borderRadius:10,background:'var(--red-bg)'}}><div><strong style={{color:'var(--red)'}}>This bank is disconnected.</strong><div style={{fontSize:13,color:'var(--text-muted)'}}>Reconnect it securely before syncing new transactions.</div></div><button className="btn btn-primary" disabled={loading} onClick={()=>void beginBankConnection('reconnect',selectedAccount.id)}>{loading&&connectionMode==='reconnect'&&connectionAccountId===selectedAccount.id?'Opening Plaid...':'Reconnect Bank'}</button></div>}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(190px,1fr) auto auto",
                gap: 10,
              }}
            >
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} title="Optional: choose an earlier date for this sync" />
              <button className="btn btn-primary" onClick={() => void syncFeed()} disabled={loading || !selectedAccount?.bankConnected}>
                {loading ? "Syncing..." : `Sync New Transactions for ${selectedAccount?.name || "Bank"}`}
              </button>
              <button className="btn btn-secondary" onClick={() => selectedAccount && void beginBankConnection("reconnect", selectedAccount.id)} disabled={loading || !selectedAccount}>
                Reconnect Bank
              </button>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>Each bank keeps its own saved feed. Transactions load automatically when you open a bank tab. Sync only checks for newer transactions, starting from {startDate ? `your selected date (${startDate})` : lastSyncDate ? `the last successful sync (${lastSyncDate})` : "the last 30 days for this first sync"}.</div>
          </section>
        )}
        {matching && (
          <div
            className="modal-overlay"
            onClick={() => {
              setMatching(null);
              setSelectedIds([]);
            }}
          >
            <section
              className="card"
              onClick={(event) => event.stopPropagation()}
              style={{
                padding: 22,
                border: "2px solid var(--green)",
                width: "min(920px,94vw)",
                maxHeight: "90vh",
                overflowY: "auto",
                background: "#fff",
                boxShadow: "0 24px 70px rgba(15,23,42,.3)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 16,
                }}
              >
                <div>
                  <h2 style={{ color: "var(--navy)", margin: 0 }}>Match deposit: ${matching.amount.toFixed(2)}</h2>
                  <div style={{ color: "var(--text-muted)", marginTop: 4 }}>
                    {matching.date} · {matching.description}
                  </div>
                </div>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setMatching(null);
                    setSelectedIds([]);
                  }}
                >
                  Close
                </button>
              </div>
              <label className="form-group" style={{ marginTop: 16 }}>
                <span>What is this deposit?</span>
                <select
                  value={depositAction}
                  onChange={(event) => {
                    const action = event.target.value as "payments" | "refund";
                    setDepositAction(action);
                    setError("");
                    if (action === "refund") void loadRefundCandidates(matching);
                  }}
                >
                  <option value="payments">Donor payments</option>
                  <option value="refund">Refund from an expense</option>
                </select>
              </label>
              {depositAction === "payments" && (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr auto",
                      gap: 8,
                      alignItems: "end",
                      margin: "16px 0",
                      padding: 12,
                      background: "var(--bg-input)",
                      borderRadius: 10,
                    }}
                  >
                    <label className="form-group" style={{ margin: 0 }}>
                      <span>Payment date from</span>
                      <input
                        type="date"
                        value={candidateWindow.startDate}
                        onChange={(event) =>
                          setCandidateWindow((current) => ({
                            ...current,
                            startDate: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="form-group" style={{ margin: 0 }}>
                      <span>Payment date to</span>
                      <input
                        type="date"
                        value={candidateWindow.endDate}
                        onChange={(event) =>
                          setCandidateWindow((current) => ({
                            ...current,
                            endDate: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <button className="btn btn-secondary" onClick={() => void loadDepositCandidates(matching, candidateWindow.startDate, candidateWindow.endDate)}>
                      Search Dates
                    </button>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                      margin: "0 0 12px",
                      flexWrap: "wrap",
                    }}
                  >
                    <p style={{ margin: 0 }}>
                      Showing eligible Undeposited Funds payments from <strong>{candidateWindow.startDate}</strong> through <strong>{candidateWindow.endDate}</strong>.
                    </p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-primary btn-sm" disabled={!candidates.length || selectedIds.length === candidates.length} onClick={() => setSelectedIds(candidates.map((candidate) => candidate.id))}>
                        Select All ({candidates.length})
                      </button>
                      <button className="btn btn-secondary btn-sm" disabled={!selectedIds.length} onClick={() => setSelectedIds([])}>
                        Clear All
                      </button>
                    </div>
                  </div>
                  <div
                    style={{
                      maxHeight: 390,
                      overflow: "auto",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                    }}
                  >
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={{ width: 40 }}>
                            <input type="checkbox" aria-label="Select all payments" checked={candidates.length > 0 && selectedIds.length === candidates.length} onChange={(event) => setSelectedIds(event.target.checked ? candidates.map((candidate) => candidate.id) : [])} />
                          </th>
                          <th>Date</th>
                          <th>Donor</th>
                          <th>Method</th>
                          <th style={{ textAlign: "right" }}>Amount CAD</th>
                        </tr>
                      </thead>
                      <tbody>
                        {candidates.map((candidate) => (
                          <tr key={candidate.id}>
                            <td>
                              <input type="checkbox" checked={selectedIds.includes(candidate.id)} onChange={() => setSelectedIds((ids) => (ids.includes(candidate.id) ? ids.filter((id) => id !== candidate.id) : [...ids, candidate.id]))} />
                            </td>
                            <td>{candidate.date}</td>
                            <td>{candidate.donorName}</td>
                            <td>{candidate.method}</td>
                            <td style={{ textAlign: "right", fontWeight: 800 }}>${Number(candidate.amountCAD ?? candidate.amount).toFixed(2)}</td>
                          </tr>
                        ))}
                        {candidates.length === 0 && (
                          <tr>
                            <td colSpan={5} style={{ padding: 25, textAlign: "center" }}>
                              <div style={{ marginBottom: 10 }}>No eligible payments in this date window.</div>
                              <button className="btn btn-primary" onClick={() => setShowMissingPayment(true)}>
                                Enter Missing Payment
                              </button>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginTop: 16,
                    }}
                  >
                    <button className="btn btn-secondary" onClick={() => setShowMissingPayment(true)}>
                      + Enter New Payment
                    </button>
                    <div>
                      <strong>
                        {selectedIds.length} selected · ${selectedTotal.toFixed(2)}
                      </strong>
                      <span
                        style={{
                          color: totalsMatch ? "var(--green)" : "var(--red)",
                          marginLeft: 12,
                        }}
                      >
                        {totalsMatch ? "Exact match" : `Difference: $${(matching.amount - selectedTotal).toFixed(2)}`}
                      </span>
                    </div>
                    <button className="btn btn-primary" disabled={!totalsMatch || selectedIds.length === 0 || saving} onClick={() => void confirmDeposit()}>
                      {saving ? "Matching securely..." : "Confirm Deposit Match"}
                    </button>
                  </div>
                </>
              )}
              {depositAction === "refund" && (
                <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
                  <label className="form-group" style={{ margin: 0 }}>
                    <span>Original paid expense *</span>
                    <select value={refundBillId} onChange={(event) => setRefundBillId(event.target.value)}>
                      <option value="">Select the expense that was refunded</option>
                      {refundCandidates.map((bill) => (
                        <option key={bill.id} value={bill.id}>
                          {bill.vendor} — {bill.currency || "CAD"} ${Math.abs(Number(bill.amount)).toFixed(2)} — {bill.paidDate || bill.dueDate} — {bill.categoryName} — refundable ${bill.refundableAmount.toFixed(2)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!refundCandidates.length && <div style={{ color: "var(--text-muted)" }}>No paid expense has enough remaining value for this refund.</div>}
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                    <button className="btn btn-secondary" onClick={() => setMatching(null)}>
                      Cancel
                    </button>
                    <button className="btn btn-primary" disabled={!refundBillId || saving} onClick={() => void confirmRefund()}>
                      {saving ? "Matching refund securely..." : "Match Refund to Expense"}
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
        {showMissingPayment && matching && (
          <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={() => setShowMissingPayment(false)}>
            <div
              onClick={(event) => event.stopPropagation()}
              style={{
                width: "min(940px,94vw)",
                maxHeight: "94vh",
                overflowY: "auto",
              }}
            >
              <OnlinePaymentForm
                defaultAmount={matching.amount}
                defaultDate={candidateWindow.endDate || matching.date}
                defaultSourceAccountId="sys-undeposited-funds"
                forceApproved
                onCancel={() => setShowMissingPayment(false)}
                onCreated={(_status, item) => {
                  setShowMissingPayment(false);
                  if (item?.id) {
                    setSelectedIds([item.id]);
                    void matchDepositPayments([item.id]);
                  } else {
                    setNotice("Payment saved. Select it below to finish the deposit match.");
                    void loadDepositCandidates(matching, candidateWindow.startDate, candidateWindow.endDate);
                  }
                }}
              />
            </div>
          </div>
        )}
        {outgoing && !showFullExpense && (
          <div className="modal-overlay" onClick={() => setOutgoing(null)}>
            <section
              className="card"
              onClick={(event) => event.stopPropagation()}
              style={{
                padding: 22,
                border: "2px solid var(--green)",
                width: "min(760px,94vw)",
                maxHeight: "90vh",
                overflowY: "auto",
                background: "#fff",
                boxShadow: "0 24px 70px rgba(15,23,42,.3)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 16,
                  marginBottom: 16,
                }}
              >
                <div>
                  <h2 style={{ color: "var(--navy)", margin: 0 }}>Match money out: ${Math.abs(outgoing.amount).toFixed(2)}</h2>
                  <div style={{ color: "var(--text-muted)", marginTop: 4 }}>
                    {outgoing.date} · {outgoing.description}
                  </div>
                </div>
                <button className="btn btn-ghost" onClick={() => setOutgoing(null)}>
                  Close
                </button>
              </div>
              <label className="form-group">
                <span>What is this transaction?</span>
                <select
                  value={outgoingAction}
                  onChange={(e) => {
                    const action = e.target.value as "expense" | "existing_bill" | "transfer";
                    setOutgoingAction(action);
                    setShowFullExpense(action === "expense");
                    setError("");
                  }}
                >
                  <option value="expense">New expense</option>
                  <option value="existing_bill">Match existing bill</option>
                  <option value="transfer">Transfer to another account</option>
                </select>
              </label>
              {outgoingAction === "existing_bill" && (
                <label className="form-group">
                  <span>Existing bill with the exact amount *</span>
                  <select value={billId} onChange={(e) => setBillId(e.target.value)}>
                    <option value="">Select bill</option>
                    {billCandidates.map((bill) => (
                      <option key={bill.id} value={bill.id}>
                        {bill.vendor} — {bill.currency || "CAD"} ${bill.amount.toFixed(2)} — {bill.dueDate} — {bill.status}
                      </option>
                    ))}
                  </select>
                  {billCandidates.length === 0 && <small style={{ color: "var(--text-muted)" }}>No unlinked bill has this exact amount.</small>}
                </label>
              )}
              {outgoingAction === "transfer" && (
                <label className="form-group">
                  <span>Transfer to *</span>
                  <select value={targetAccountId} onChange={(e) => setTargetAccountId(e.target.value)}>
                    <option value="">Select destination account</option>
                    {transferAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} ({account.currency})
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                  marginTop: 18,
                }}
              >
                <button className="btn btn-secondary" onClick={() => setOutgoing(null)}>
                  Cancel
                </button>
                {outgoingAction !== "expense" && (
                  <button className="btn btn-primary" disabled={saving} onClick={() => void confirmOutgoing()}>
                    {saving ? "Matching securely..." : "Confirm Match"}
                  </button>
                )}
              </div>
            </section>
          </div>
        )}
        {showFullExpense && outgoing && (
          <CloudTransactionModal
            mode="add"
            initialData={{
              id: outgoing.id,
              revision: 1,
              vendor: bankVendorRule?.vendor || outgoing.description,
              amount: Math.abs(outgoing.amount),
              dueDate: outgoing.date,
              status: "paid",
              sourceAccountId: selectedBank,
              memo: outgoing.description,
              category: bankVendorRule?.category,
              internalCategory: bankVendorRule?.internalCategory || bankVendorRule?.taxCategory,
              taxable: bankVendorRule?.taxable,
            }}
            bankMatch={{
              accountId: selectedBank,
              bankTransactionId: outgoing.id,
              bankDate: outgoing.date,
              description: outgoing.description,
              amount: Math.abs(outgoing.amount),
            }}
            onBankActionChange={(action) => {
              setOutgoingAction(action);
              setShowFullExpense(action === "expense");
              setError("");
            }}
            onClose={() => {
              setShowFullExpense(false);
              setOutgoing(null);
            }}
            onSaved={(message) => {
              removeMatchedFromVisibleFeed(outgoing.id);
              setShowFullExpense(false);
              setOutgoing(null);
              setNotice(message);
              void Promise.all([loadState(true), loadFeed(true)]);
            }}
          />
        )}
        {notice && (
          <div
            className="card"
            style={{
              padding: 14,
              color: "var(--green)",
              fontWeight: 800,
              marginBottom: 16,
            }}
          >
            {notice}
          </div>
        )}
        {error && (
          <div
            className="card"
            style={{
              padding: 14,
              color: "var(--red)",
              fontWeight: 700,
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}
        <section className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              display: "flex",
              gap: 8,
              padding: 16,
              borderBottom: "1px solid var(--border)",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              className={`btn ${tab === "unmatched" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => {
                setTab("unmatched");
                setFeedPage(1);
              }}
            >
              Unmatched
            </button>
            <button
              className={`btn ${tab === "matched" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => {
                setTab("matched");
                setFeedPage(1);
              }}
            >
              Matched
            </button>
            <button
              className={`btn ${tab === "dismissed" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => {
                setTab("dismissed");
                setFeedPage(1);
              }}
            >
              Dismissed
            </button>
            <input
              style={{ marginLeft: "auto", minWidth: 260 }}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setFeedPage(1);
              }}
              placeholder="Live search description, date or amount"
            />
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => {
                setFilterFrom(e.target.value);
                setFeedPage(1);
              }}
              title="From date"
            />
            <input
              type="date"
              value={filterTo}
              onChange={(e) => {
                setFilterTo(e.target.value);
                setFeedPage(1);
              }}
              title="To date"
            />
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Direction</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibleFeed.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>{transaction.date}</td>
                    <td style={{ fontWeight: 700 }}>{transaction.description}</td>
                    <td>{transaction.amount > 0 ? "Money in" : "Money out"}</td>
                    <td
                      style={{
                        textAlign: "right",
                        fontWeight: 800,
                        color: transaction.amount > 0 ? "var(--green)" : "var(--red)",
                      }}
                    >
                      {transaction.amount > 0 ? "+" : "-"}${Math.abs(transaction.amount).toFixed(2)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {tab === "unmatched" && <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                        {transaction.amount > 0 && <button className="btn btn-primary btn-sm" onClick={() => void openDepositMatch(transaction)}>Match Deposit</button>}
                        {transaction.amount < 0 && <button className="btn btn-primary btn-sm" onClick={() => void openOutgoingMatch(transaction)}>Match Transaction</button>}
                        <button className="btn btn-secondary btn-sm" disabled={saving} onClick={() => void changeFeedStatus(transaction,"dismiss")}>Dismiss</button>
                      </div>}
                      {tab === "matched" && <span style={{ color: "var(--green)", fontWeight: 700 }}>Matched</span>}
                      {tab === "dismissed" && <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => void changeFeedStatus(transaction,"restore")}>Restore to Unmatched</button>}
                    </td>
                  </tr>
                ))}
                {visibleFeed.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: 30, textAlign: "center" }}>
                      No bank transactions match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {feedPages > 1 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: 14,
                borderTop: "1px solid var(--border)",
              }}
            >
              <button className="btn btn-secondary btn-sm" disabled={feedPage <= 1} onClick={() => setFeedPage((value) => value - 1)}>
                Previous
              </button>
              <span>
                Page {feedPage} of {feedPages} · 50 transactions maximum
              </span>
              <button className="btn btn-secondary btn-sm" disabled={feedPage >= feedPages} onClick={() => setFeedPage((value) => value + 1)}>
                Next
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
};
