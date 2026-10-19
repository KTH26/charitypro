import React, { useEffect, useRef, useState } from 'react';

type Donor = { id: string; name: string };
type Choice = { id: string; name?: string; brand?: string; last4?: string; status?: string; isDefault?: boolean; type?: string };

export const CloudRecurringPaymentForm: React.FC<{
  donor: Donor;
  onCancel: () => void;
  onCreated: (schedule: Record<string, any>) => void;
}> = ({ donor, onCancel, onCreated }) => {
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'CAD' | 'USD'>('CAD');
  const [frequency, setFrequency] = useState('monthly');
  const [method, setMethod] = useState('credit_card');
  const [nextDate, setNextDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [cards, setCards] = useState<Choice[]>([]); const [paymentMethodIds,setPaymentMethodIds]=useState<string[]>([]);
  const [accounts,setAccounts]=useState<Choice[]>([]);const[sourceAccountId,setSourceAccountId]=useState('');const[offsetAccountId,setOffsetAccountId]=useState('');
  const [pledges,setPledges]=useState<any[]>([]);const[pledgeId,setPledgeId]=useState('');const[retryDays,setRetryDays]=useState('2');const[maxAttempts,setMaxAttempts]=useState('3');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef('');

  useEffect(()=>{const controller=new AbortController();Promise.all([fetch(`/api/v3/donors/${encodeURIComponent(donor.id)}/payment-methods`,{signal:controller.signal}),fetch('/api/v3/accounts?limit=100',{signal:controller.signal}),fetch(`/api/v3/donors/${encodeURIComponent(donor.id)}/profile`,{signal:controller.signal})]).then(async responses=>Promise.all(responses.map(async response=>{const data=await response.json();if(!response.ok||!data.success)throw new Error(data.error||'Unable to load recurring-payment choices.');return data;}))).then(([cardData,accountData,profileData])=>{const active=(cardData.items||[]).filter((item:Choice)=>item.status==='active');setCards(active);setPaymentMethodIds(active.map((item:Choice)=>item.id));setAccounts(accountData.items||[]);setPledges(profileData.pledges||[]);}).catch(reason=>{if(reason.name!=='AbortError')setError(reason.message||'Unable to load recurring-payment choices.');});return()=>controller.abort();},[donor.id]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || !nextDate) {
      setError('Enter a positive amount and the next payment date.');
      return;
    }
    if(endDate&&endDate<nextDate){setError('End date must be on or after the next payment date.');return;}
    if(!sourceAccountId||!offsetAccountId){setError('Choose the receiving account and revenue account.');return;}
    if(method==='credit_card'&&!paymentMethodIds.length){setError('Choose at least one active saved card.');return;}
    const key = requestId.current || crypto.randomUUID();
    requestId.current = key;
    setSaving(true);
    setError('');
    try {
      const data = { donorId: donor.id, amount: parsedAmount, currency, frequency, method, nextDate, ...(endDate ? { endDate } : {}),sourceAccountId,offsetAccountId,...(pledgeId?{pledgeId}:{}),...(method==='credit_card'?{paymentMethodIds,retryDays:Number(retryDays),maxAttempts:Number(maxAttempts)}:{}), active: true };
      const response = await fetch('/api/v3/records/recurringPayments', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify({ data })
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to save recurring payment.');
      requestId.current = '';
      onCreated({ ...result.item, donorName: donor.name });
    } catch (reason: any) {
      requestId.current = '';
      setError(reason.message || 'Unable to save recurring payment. You can safely try again.');
    } finally { setSaving(false); }
  };

  return <section className="card" style={{ padding: 22, border: '2px solid var(--green)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 16, marginBottom: 18 }}><div><h2 style={{ margin: 0, color: 'var(--navy)' }}>Set Up Recurring Payment</h2><div style={{ color: 'var(--text-muted)', marginTop: 4 }}>This schedule saves directly to the shared cloud database.</div></div><button type="button" className="btn btn-ghost" onClick={onCancel}>Close</button></div>
    <form onSubmit={save}>{error && <div style={{ color: 'var(--red)', marginBottom: 14, fontWeight: 700 }}>{error}</div>}<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 14 }}>
      <div className="form-group" style={{ margin: 0 }}><span>Donor</span><div style={{ padding: '10px 12px', background: 'var(--bg-input)', borderRadius: 8, fontWeight: 800 }}>{donor.name}</div></div>
      <label className="form-group" style={{ margin: 0 }}><span>Amount *</span><input type="number" min="0.01" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} /></label>
      <label className="form-group" style={{ margin: 0 }}><span>Currency</span><select value={currency} onChange={event => setCurrency(event.target.value as 'CAD' | 'USD')}><option>CAD</option><option>USD</option></select></label>
      <label className="form-group" style={{ margin: 0 }}><span>Frequency</span><select value={frequency} onChange={event => setFrequency(event.target.value)}><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option></select></label>
      <label className="form-group" style={{ margin: 0 }}><span>Payment method</span><select value={method} onChange={event => setMethod(event.target.value)}><option value="credit_card">Credit card</option><option value="check">Check</option><option value="cash">Cash</option><option value="e_transfer">E-transfer</option><option value="other">Other</option></select></label>
      <label className="form-group" style={{ margin: 0 }}><span>Next date *</span><input type="date" value={nextDate} onChange={event => setNextDate(event.target.value)} /></label>
      <label className="form-group" style={{ margin: 0 }}><span>End date</span><input type="date" value={endDate} onChange={event => setEndDate(event.target.value)} /></label>
      <label className="form-group" style={{margin:0}}><span>Receiving account *</span><select value={sourceAccountId} onChange={event=>setSourceAccountId(event.target.value)}><option value="">Select account</option>{accounts.filter(item=>item.type==='asset').map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="form-group" style={{margin:0}}><span>Revenue account *</span><select value={offsetAccountId} onChange={event=>setOffsetAccountId(event.target.value)}><option value="">Select account</option>{accounts.filter(item=>item.type==='revenue').map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="form-group" style={{margin:0}}><span>Apply to pledge</span><select value={pledgeId} onChange={event=>setPledgeId(event.target.value)}><option value="">Automatic / newest pledge</option>{pledges.map(pledge=><option key={pledge.id} value={pledge.id}>{pledge.date} · {pledge.currency||'CAD'} ${Number(pledge.amount||0).toFixed(2)} · balance ${Number(pledge.balance||0).toFixed(2)}</option>)}</select></label>
      {method==='credit_card'&&<><div className="form-group" style={{margin:0,gridColumn:'1 / -1'}}><span>Card order — CharityPro tries them in this order</span><div style={{display:'grid',gap:8}}>{cards.map(card=>{const selected=paymentMethodIds.includes(card.id);const position=paymentMethodIds.indexOf(card.id);return <label key={card.id} style={{display:'flex',alignItems:'center',gap:9,padding:10,border:'1px solid var(--border)',borderRadius:9,background:'var(--bg-input)'}}><input type="checkbox" checked={selected} onChange={event=>setPaymentMethodIds(current=>event.target.checked?[...current,card.id]:current.filter(id=>id!==card.id))}/><strong>{selected?`${position+1}. `:''}{card.brand} •••• {card.last4}</strong>{card.isDefault?<span className="badge badge-green">Default</span>:null}{selected&&position>0?<button type="button" className="btn btn-ghost btn-sm" style={{marginLeft:'auto'}} onClick={()=>setPaymentMethodIds(current=>{const next=[...current];[next[position-1],next[position]]=[next[position],next[position-1]];return next;})}>Move up</button>:null}</label>;})}{!cards.length?<div style={{color:'var(--red)',fontWeight:700}}>No active saved cards. Add a tokenized card in the donor’s Saved Cards tab first.</div>:null}</div></div><label className="form-group" style={{margin:0}}><span>Retry after days</span><input type="number" min="1" max="30" value={retryDays} onChange={event=>setRetryDays(event.target.value)}/></label><label className="form-group" style={{margin:0}}><span>Maximum attempts per card</span><input type="number" min="1" max="10" value={maxAttempts} onChange={event=>setMaxAttempts(event.target.value)}/></label></>}
    </div><div className="modal-footer" style={{ marginTop: 18 }}><button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving securely...' : 'Activate Recurring'}</button></div></form>
  </section>;
};
