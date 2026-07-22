import React, { useEffect, useRef, useState } from 'react';

type Donor = { id: string; name: string; email?: string };
type Account = { id: string; name: string; type: string; currency: 'CAD' | 'USD' };
type Choice = { id: string; name: string };
type PledgeChoice = { id: string; amount: number; currency?: string; date?: string; balance?: number };
type PaymentStatus = 'approved' | 'pending';

const methods = [
  ['credit_card', 'Credit Card (already charged)'], ['check', 'Check'], ['cash', 'Cash'], ['e_transfer', 'E-Transfer'],
  ['vouchers', 'Vouchers'], ['eizer', 'Eizer'], ['bnei_leivy', 'Bnei Leivy'], ['other', 'Other']
] as const;

export const OnlinePaymentForm: React.FC<{
  onCreated: (status: PaymentStatus) => void;
  onCancel: () => void;
  donor?: Donor;
}> = ({ onCreated, onCancel, donor }) => {
  const [donorQuery, setDonorQuery] = useState(donor?.name || '');
  const [donors, setDonors] = useState<Donor[]>(donor ? [donor] : []);
  const [donorId, setDonorId] = useState(donor?.id || '');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [projects, setProjects] = useState<Choice[]>([]);
  const [fundraisers, setFundraisers] = useState<Choice[]>([]);
  const [pledges, setPledges] = useState<PledgeChoice[]>([]);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'CAD' | 'USD'>('CAD');
  const [method, setMethod] = useState('other');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [offsetAccountId, setOffsetAccountId] = useState('');
  const [notes, setNotes] = useState('');
  const [projectId, setProjectId] = useState('');
  const [fundraiserId, setFundraiserId] = useState('');
  const [pledgeId, setPledgeId] = useState('');
  const [sponsor, setSponsor] = useState('');
  const [loadingDonors, setLoadingDonors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const pendingRequestId = useRef('');

  useEffect(() => {
    const controller = new AbortController();
    Promise.all(['/api/v3/accounts?limit=100','/api/v3/records/projects?limit=100','/api/v3/records/fundraisers?limit=100'].map(url=>fetch(url,{signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok||!data.success)throw new Error(data.error||'Unable to load payment choices.');return data;})))
      .then(([accountData,projectData,fundraiserData]) => {
        setAccounts(accountData.items||[]); setProjects(projectData.items||[]); setFundraisers(fundraiserData.items||[]);
      })
      .catch(e => { if (e.name !== 'AbortError') setError(e.message || 'Unable to load payment choices.'); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (donor) return;
    const query = donorQuery.trim();
    if (query.length < 2) {
      setDonors([]);
      setLoadingDonors(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoadingDonors(true);
      setError('');
      try {
        const response = await fetch(`/api/v3/donors?limit=25&search=${encodeURIComponent(query)}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Unable to search donors.');
        setDonors(data.items);
      } catch (e: any) {
        if (e.name !== 'AbortError') setError(e.message || 'Unable to search donors.');
      } finally {
        if (!controller.signal.aborted) setLoadingDonors(false);
      }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [donor, donorQuery]);

  useEffect(()=>{setPledgeId('');setPledges([]);if(!donorId)return;const controller=new AbortController();fetch(`/api/v3/donors/${encodeURIComponent(donorId)}/pledge-choices?limit=100`,{signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok||!data.success)throw new Error(data.error||'Unable to load this donor’s pledges.');setPledges(data.items||[]);}).catch(e=>{if(e.name!=='AbortError')setError(e.message||'Unable to load this donor’s pledges.');});return()=>controller.abort();},[donorId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!donorId || !sourceAccountId || !offsetAccountId) {
      setError('Choose a donor, the receiving account, and the revenue account.');
      return;
    }
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Enter a payment amount greater than zero.');
      return;
    }

    setSaving(true);
    const requestId = pendingRequestId.current || crypto.randomUUID();
    pendingRequestId.current = requestId;
    try {
      const status: PaymentStatus = method === 'check' ? 'pending' : 'approved';
      const response = await fetch('/api/v3/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestId },
        body: JSON.stringify({ requestId, donorId, amount: parsedAmount, currency, method, date, sourceAccountId, offsetAccountId, notes, projectId, fundraiserId, pledgeId, sponsor, type: status })
      });
      const responseText = await response.text();
      let data: any; try { data = JSON.parse(responseText); } catch { throw new Error(response.ok ? 'The server returned an unreadable response.' : `The payment server failed (${response.status}). Please try again.`); }
      if (!response.ok || !data.success) {
        pendingRequestId.current = '';
        throw new Error(data.error || 'The payment could not be saved.');
      }
      pendingRequestId.current = '';
      onCreated(status);
    } catch (e: any) {
      setError(e.message || 'The payment could not be saved. You can safely try again.');
    } finally {
      setSaving(false);
    }
  };

  const assetAccounts = accounts.filter(account => account.type === 'asset');
  const revenueAccounts = accounts.filter(account => account.type === 'revenue');

  return (
    <section className="card" style={{ padding: 22, marginBottom: 18, border: '2px solid var(--green)', background: '#ffffff', boxShadow: '0 18px 55px rgba(15,23,42,.22)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 16, marginBottom: 18 }}>
        <div><h2 style={{ margin: 0, color: 'var(--navy)' }}>Record a payment in the cloud</h2><div style={{ color: 'var(--text-muted)', marginTop: 4 }}>This saves directly to the shared database. It cannot create a local sync conflict.</div></div>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Close</button>
      </div>
      <form onSubmit={submit}>
        {error && <div style={{ color: 'var(--red)', marginBottom: 14, fontWeight: 700 }}>{error}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          {donor ? <div className="form-group" style={{ margin: 0 }}><span>Donor</span><div style={{ padding: '10px 12px', background: 'var(--bg-input)', borderRadius: 8, fontWeight: 800 }}>{donor.name}</div></div> : <>
            <label className="form-group" style={{ margin: 0 }}><span>Find donor</span><input value={donorQuery} onChange={e => { setDonorQuery(e.target.value); setDonorId(''); }} placeholder="Type at least 2 letters" /></label>
            <label className="form-group" style={{ margin: 0 }}><span>Choose donor</span><select value={donorId} onChange={e => setDonorId(e.target.value)} disabled={loadingDonors || donors.length === 0}><option value="">{loadingDonors ? 'Searching...' : donors.length ? 'Select donor' : 'Search first'}</option>{donors.map(item => <option key={item.id} value={item.id}>{item.name}{item.email ? ` — ${item.email}` : ''}</option>)}</select></label>
          </>}
          <label className="form-group" style={{ margin: 0 }}><span>Amount</span><input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></label>
          <label className="form-group" style={{ margin: 0 }}><span>Currency</span><select value={currency} onChange={e => setCurrency(e.target.value as 'CAD' | 'USD')}><option value="CAD">CAD</option><option value="USD">USD</option></select></label>
          <label className="form-group" style={{ margin: 0 }}><span>Payment method</span><select value={method} onChange={e => setMethod(e.target.value)}>{methods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="form-group" style={{ margin: 0 }}><span>Date</span><input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
          <label className="form-group" style={{ margin: 0 }}><span>Paid into (asset)</span><select value={sourceAccountId} onChange={e => setSourceAccountId(e.target.value)}><option value="">Select receiving account</option>{assetAccounts.map(account => <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>)}</select></label>
          <label className="form-group" style={{ margin: 0 }}><span>Allocated to (revenue)</span><select value={offsetAccountId} onChange={e => setOffsetAccountId(e.target.value)}><option value="">Select revenue account</option>{revenueAccounts.map(account => <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>)}</select></label>
          <label className="form-group" style={{ margin: 0 }}><span>Project (optional)</span><select value={projectId} onChange={e=>setProjectId(e.target.value)}><option value="">— No Project —</option>{projects.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="form-group" style={{ margin: 0 }}><span>Fundraiser / Campaign (optional)</span><select value={fundraiserId} onChange={e=>setFundraiserId(e.target.value)}><option value="">— No Fundraiser —</option>{fundraisers.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="form-group" style={{ margin: 0 }}><span>Apply to pledge (optional)</span><select value={pledgeId} onChange={e=>setPledgeId(e.target.value)} disabled={!donorId}><option value="">{donorId?'— No Specific Pledge —':'Choose a donor first'}</option>{pledges.map(item=><option key={item.id} value={item.id}>{item.date||'Pledge'} · {item.currency||'CAD'} ${Number(item.amount||0).toLocaleString()} · Balance ${Number(item.balance??item.amount??0).toLocaleString()}</option>)}</select></label>
          <label className="form-group" style={{ margin: 0 }}><span>Sponsor / Source (optional)</span><input value={sponsor} onChange={e=>setSponsor(e.target.value)} maxLength={300}/></label>
        </div>
        <label className="form-group" style={{ margin: '14px 0 0' }}><span>Notes (optional)</span><textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={2000} rows={2} /></label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}><button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving securely...' : 'Save Payment'}</button></div>
      </form>
    </section>
  );
};
