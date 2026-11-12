import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { OnlinePaymentForm } from './OnlinePaymentForm';
import { CloudRecurringPaymentForm } from './CloudRecurringPaymentForm';
import { CloudPaymentMethods } from './CloudPaymentMethods';
import { CloudDonorProfileModal } from './CloudDonorProfileModal';
import { OnlineDonorForm, type OnlineDonor } from './OnlineDonorForm';
import { donorNames } from '../utils/donorNames';
import { PledgeFormModal } from './PledgeFormModal';

type Donor = { id: string; name: string; email?: string; phone?: string; address?: string; city?: string; preTitle?: string; hebFirstName?: string; hebLastName?: string; title?: string; postTitle?: string };
type DonorBalance = { year: number; thisYear: number; total: number; pledgedThisYear: number };
const money = (value: number) => '$' + Number(value || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
type Choice = { id: string; name: string; percentage?: number };

/** What the donor answered. The first word is what shows in the call list. */
export const CALL_OUTCOMES: { value: string; label: string; hint: string }[] = [
  { value: 'Pledged', label: 'Pledged', hint: 'Enter the pledge now' },
  { value: 'Paid', label: 'Paid', hint: 'Enter the payment now' },
  { value: 'Call back', label: 'Call back', hint: 'Set a reminder' },
  { value: 'Pick up', label: 'Pick up money', hint: 'Add to the pickup list' },
  { value: 'No answer', label: 'No answer', hint: '' },
  { value: 'Left message', label: 'Left message', hint: '' },
  { value: 'Declined', label: 'Declined', hint: '' },
  { value: 'Other', label: 'Other', hint: '' }
];

const localToday = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };
const post = async (url: string, key: string, body: any) => {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.error || 'Unable to save.');
  return data;
};

type Step = 'call' | 'payment' | 'recurring' | 'done';

/**
 * One window for a whole donor call: who, which fundraiser and campaign, what he answered,
 * and then the pledge / payment / card / recurring / call-back / pickup — all from here.
 * The call is saved on the donor, so it also shows in the donor's pop-up.
 */
export const RecordCallModal: React.FC<{ donor?: Donor; onClose: () => void; onSaved: () => void }> = ({ donor: initialDonor, onClose, onSaved }) => {
  const [donor, setDonor] = useState<Donor | null>(initialDonor || null);
  const [donorSearch, setDonorSearch] = useState('');
  const [donors, setDonors] = useState<Donor[]>([]);
  const [fundraisers, setFundraisers] = useState<Choice[]>([]);
  const [campaigns, setCampaigns] = useState<Choice[]>([]);
  const [form, setForm] = useState({ date: localToday(), fundraiserId: '', campaignId: '', outcome: '', notes: '', followUpDate: '', pledgeAmount: '', pledgeCurrency: 'CAD', setUpPayments: false, pickupDate: '', pickupAmount: '', pickupAddress: '' });
  const [step, setStep] = useState<Step>('call');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [doneMessage, setDoneMessage] = useState('');
  const [saved, setSaved] = useState<{ contactId: string; revision: number; pledgeId: string; pledgeAmount: number } | null>(null);
  const [showCards, setShowCards] = useState(false);
  const [balance, setBalance] = useState<DonorBalance | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [editingDonor, setEditingDonor] = useState<OnlineDonor | null>(null);
  const [showPledge, setShowPledge] = useState(false);
  const keys = useRef({ pledge: crypto.randomUUID(), contact: crypto.randomUUID() });
  const pledgeIdRef = useRef('');
  const set = (field: string, value: any) => setForm(current => ({ ...current, [field]: value }));

  useEffect(() => {
    const controller = new AbortController();
    Promise.all(['/api/v3/records/fundraisers?limit=100', '/api/v3/records/campaigns?limit=100'].map(url => fetch(url, { signal: controller.signal }).then(response => response.json())))
      .then(([f, g]) => { if (f.success) setFundraisers(f.items || []); if (g.success) setCampaigns(g.items || []); }).catch(() => undefined);
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (donor) return;
    const timer = window.setTimeout(() => { fetch(`/api/v3/donors?limit=30&search=${encodeURIComponent(donorSearch)}`).then(response => response.json()).then(data => { if (data.success) setDonors(data.items || []); }).catch(() => undefined); }, 200);
    return () => window.clearTimeout(timer);
  }, [donorSearch, donor]);
  // When a donor is chosen, show what he still owes on pledges: this year big, all years small.
  useEffect(() => {
    setBalance(null);
    if (!donor) return;
    const controller = new AbortController();
    fetch(`/api/v3/donors/${encodeURIComponent(donor.id)}/profile`, { signal: controller.signal }).then(response => response.json()).then(data => {
      if (!data.success) return;
      const year = new Date().getFullYear();
      const pledges: any[] = data.pledges || [];
      const pledgeYear = (pledge: any) => Number(String(pledge.periodStart || pledge.date || '').slice(0, 4));
      const thisYearPledges = pledges.filter(pledge => pledgeYear(pledge) === year);
      setBalance({ year, thisYear: thisYearPledges.reduce((sum, pledge) => sum + Number(pledge.balance || 0), 0), pledgedThisYear: thisYearPledges.reduce((sum, pledge) => sum + Number(pledge.amountCAD ?? pledge.amount ?? 0), 0), total: Number(data.summary?.pledgeBalance || 0) });
    }).catch(() => undefined);
    return () => controller.abort();
  }, [donor?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (form.outcome === 'Pick up' && !form.pickupAddress && donor) set('pickupAddress', [donor.address, donor.city].filter(Boolean).join(', '));
  }, [form.outcome, donor]); // eslint-disable-line react-hooks/exhaustive-deps

  const linkToCall = async (data: Record<string, string>) => {
    if (!saved) return;
    try {
      const response = await fetch(`/api/v3/records/donorContacts/${encodeURIComponent(saved.contactId)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ revision: saved.revision, data }) });
      const result = await response.json();
      if (response.ok && result.success) setSaved(current => current ? { ...current, revision: Number(result.item?.revision || current.revision + 1) } : current);
    } catch { /* the payment itself is saved; the link is only a convenience */ }
  };

  // Check the call details before anything is saved.
  const callProblem = () => {
    if (!donor) return 'Choose the donor.';
    if (!form.date) return 'Choose the date of the call.';
    if (!form.outcome) return 'Choose what the donor answered.';
    if (form.outcome === 'Call back' && !form.followUpDate) return 'Choose the date to call back.';
    if (!form.notes.trim() && !['No answer', 'Left message'].includes(form.outcome)) return 'Write what the donor said.';
    return '';
  };
  // Save the call itself. For "Pledged" and "Paid" this runs only after the pledge / payment was saved,
  // so a declined card never leaves a half-finished call behind.
  const submitCall = async (links: { pledgeId?: string; pledgeAmount?: number; paymentId?: string; recurringId?: string } = {}) => {
    if (!donor) return null;
    const body: any = { donorId: donor.id, date: form.date, fundraiserId: form.fundraiserId, campaignId: form.campaignId, outcome: form.outcome, notes: form.notes.trim(), requestId: keys.current.contact };
    if (links.pledgeId) body.pledgeId = links.pledgeId;
    if (links.paymentId) body.paymentId = links.paymentId;
    if (links.recurringId) body.recurringId = links.recurringId;
    if (form.outcome === 'Call back') body.followUpDate = form.followUpDate;
    if (form.outcome === 'Pick up') Object.assign(body, { pickupDate: form.pickupDate, pickupAmount: form.pickupAmount, pickupAddress: form.pickupAddress });
    const result = await post('/api/v3/donor-contacts', keys.current.contact, body);
    const record = { contactId: String(result.item.id), revision: Number(result.item.revision || 1), pledgeId: links.pledgeId || '', pledgeAmount: Number(links.pledgeAmount || 0) };
    setSaved(record); onSaved();
    return record;
  };
  const saveCall = async () => {
    setError('');
    const problem = callProblem(); if (problem) { setError(problem); return; }
    if (form.outcome === 'Pledged') {
      // If the pledge was already saved but the call was not, just save the call (never a second pledge).
      if (pledgeIdRef.current) { void afterPledgeSaved({ id: pledgeIdRef.current, amount: saved?.pledgeAmount }); return; }
      setShowPledge(true); return;                                       // pledge window first
    }
    if (form.outcome === 'Paid') { setStep('payment'); return; }        // payment window first
    setSaving(true);
    try {
      await submitCall();
      setDoneMessage(form.outcome === 'Call back' ? `Call saved. A reminder to call back was set for ${form.followUpDate}.` : form.outcome === 'Pick up' ? 'Call saved. The donor was added to the pickup list on the Dashboard.' : 'Call saved.');
      setStep('done');
    } catch (reason: any) { setError(reason.message || 'Unable to save the call.'); }
    finally { setSaving(false); }
  };
  const afterPledgeSaved = async (pledge: any) => {
    setShowPledge(false); setSaving(true); setError('');
    pledgeIdRef.current = String(pledge?.id || '');
    try {
      await submitCall({ pledgeId: pledgeIdRef.current, pledgeAmount: Number(pledge?.amount || 0) });
      if (form.setUpPayments) setStep('recurring'); else { setDoneMessage('Call and pledge saved.'); setStep('done'); }
    } catch (reason: any) { setError(`The pledge was saved, but the call was not: ${reason.message || 'please try again'}. Press the button again to save the call.`); }
    finally { setSaving(false); }
  };
  const afterPaymentSaved = async (links: { paymentId?: string; recurringId?: string }, message: string) => {
    try {
      if (saved) { await linkToCall(links as Record<string, string>); }
      else await submitCall(links);
      setDoneMessage(message);
    } catch (reason: any) { setDoneMessage(`${message.replace('Call and p', 'P')} But the call itself could not be saved (${reason.message || 'error'}). Please record the call again.`); }
    setStep('done');
  };

  const outcomeButton = (item: typeof CALL_OUTCOMES[number]) => <button key={item.value} type="button" className={`call-outcome ${form.outcome === item.value ? 'is-selected' : ''}`} onClick={() => set('outcome', item.value)}>
    <strong>{item.label}</strong>{item.hint && <small>{item.hint}</small>}
  </button>;

  const title = step === 'payment' ? `Payment from ${donorNames(donor).main}` : step === 'recurring' ? `Set up payments for ${donor?.name}` : 'Record a Call';
  return <div className="modal-overlay" onClick={onClose}><div className="modal" onClick={event => event.stopPropagation()} style={{ maxWidth: 900, width: '94%', maxHeight: '94vh', overflowY: 'auto' }}>
    <div className="modal-header"><h2 style={{ margin: 0 }}>{title}</h2><button type="button" className="modal-close" onClick={onClose}><X size={20} /></button></div>
    <div className="modal-body">
      {error && <div style={{ color: 'var(--red)', fontWeight: 700, marginBottom: 14 }}>{error}</div>}

      {step === 'call' && <div style={{ display: 'grid', gap: 16 }}>
        <div className="form-grid-2">
          <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}><span>Donor *</span>
            {donor ? (() => { const names = donorNames(donor); return <div className="call-donor-card">
              <div className="call-donor-card-names"><strong dir={names.rtl ? 'rtl' : undefined}>{names.main}</strong>{names.other && <small>{names.other}</small>}{donor.phone && <a href={`tel:${donor.phone}`}>{donor.phone}</a>}</div>
              <div className="call-donor-card-balance">{balance ? <><span>Balance {balance.year}</span><strong className={balance.thisYear > 0.005 ? 'owes' : ''}>{money(balance.thisYear)}</strong><small>All years: {money(balance.total)}</small></> : <small>Loading balance…</small>}</div>
              <div className="call-donor-card-actions"><button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowProfile(true)}>Open donor</button>{!initialDonor && !saved && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDonor(null)}>Change</button>}</div>
            </div>; })()
              : <><input autoFocus value={donorSearch} onChange={event => setDonorSearch(event.target.value)} placeholder="Type a Yiddish or English name, or a phone…" />
                <div className="call-donor-results">{donors.slice(0, 8).map(item => { const names = donorNames(item); return <button type="button" key={item.id} onClick={() => { setDonor(item); setDonorSearch(''); }}><strong dir={names.rtl ? 'rtl' : undefined}>{names.main}</strong><small>{[names.other, item.phone].filter(Boolean).join(' · ')}</small></button>; })}{donors.length === 0 && <small style={{ color: 'var(--text-muted)', padding: 8 }}>No donors found.</small>}</div></>}
          </div>
          <label className="form-group" style={{ margin: 0 }}><span>Date of the call *</span><input type="date" value={form.date} onChange={event => set('date', event.target.value)} /></label>
          <label className="form-group" style={{ margin: 0 }}><span>Fundraiser</span><select value={form.fundraiserId} onChange={event => set('fundraiserId', event.target.value)}><option value="">— Select —</option>{fundraisers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}><span>Campaign</span><select value={form.campaignId} onChange={event => set('campaignId', event.target.value)}><option value="">— Select —</option>{campaigns.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        </div>

        <div><div style={{ fontWeight: 800, color: 'var(--navy)', marginBottom: 8 }}>What did he answer? *</div><div className="call-outcomes">{CALL_OUTCOMES.map(outcomeButton)}</div></div>

        {form.outcome === 'Pledged' && <div className="call-step-box" style={{ display: 'grid', gap: 8 }}>
          <div style={{ color: 'var(--text-muted)' }}>The full pledge window opens next, with all the options of the Pledges page (amount, currency, date, fundraiser team, reminder). The call is saved after the pledge.</div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700 }}><input type="checkbox" checked={form.setUpPayments} onChange={event => set('setUpPayments', event.target.checked)} /> After the pledge, set up payments for it (card or other)</label>
        </div>}
        {form.outcome === 'Paid' && <div className="call-step-box" style={{ color: 'var(--text-muted)' }}>Next, choose how he paid: card through Sola, check, cash, bank transfer… and the account. The call is saved only after the payment is saved, so if a card is declined you can try another way.</div>}
        {form.outcome === 'Call back' && <div className="call-step-box form-grid-2">
          <label className="form-group" style={{ margin: 0 }}><span>Call back on *</span><input type="date" value={form.followUpDate} onChange={event => set('followUpDate', event.target.value)} /></label>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, alignSelf: 'end' }}>A reminder will show in the bell 🔔 and on the Tasks page on that day{form.fundraiserId ? ', with the fundraiser’s name' : ''}.</div>
        </div>}
        {form.outcome === 'Pick up' && <div className="call-step-box form-grid-2">
          <label className="form-group" style={{ margin: 0 }}><span>Expected amount</span><input type="number" min="0" step="0.01" value={form.pickupAmount} onChange={event => set('pickupAmount', event.target.value)} /></label>
          <label className="form-group" style={{ margin: 0 }}><span>Pick up on</span><input type="date" value={form.pickupDate} onChange={event => set('pickupDate', event.target.value)} /></label>
          <label className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}><span>Address</span><input value={form.pickupAddress} onChange={event => set('pickupAddress', event.target.value)} /></label>
        </div>}

        <label className="form-group" style={{ margin: 0 }}><span>Discussion — exactly what he said {['No answer', 'Left message'].includes(form.outcome) ? '' : '*'}</span><textarea rows={5} value={form.notes} onChange={event => set('notes', event.target.value)} placeholder="Write the whole conversation and any notes" /></label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button><button type="button" className="btn btn-primary" disabled={saving} onClick={() => void saveCall()}>{saving ? 'Saving…' : form.outcome === 'Paid' ? 'Next: Enter Payment →' : form.outcome === 'Pledged' ? 'Next: Enter Pledge →' : 'Save Call'}</button></div>
      </div>}

      {step === 'payment' && donor && <div style={{ display: 'grid', gap: 14 }}>
        <div className="call-step-box" style={{ color: 'var(--text-muted)' }}>Enter how he paid. <strong>The call is saved after the payment is saved.</strong> If the card is declined, you can change the method and try again, or go back.</div>
        <div><button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowCards(value => !value)}>{showCards ? 'Hide cards' : '💳 Add a new card / see saved cards'}</button>{showCards && <div style={{ marginTop: 10 }}><CloudPaymentMethods donorId={donor.id} /><div style={{ color: 'var(--text-muted)', fontSize: 12.5, marginTop: 6 }}>After adding a card, click “Hide cards”. The new card will then show in the form below.</div></div>}</div>
        <OnlinePaymentForm key={showCards ? 'cards-open' : 'cards-closed'} donor={{ id: donor.id, name: donor.name, email: donor.email }} onCancel={() => setStep('call')} onCreated={(status, item) => void afterPaymentSaved(item?.id ? { paymentId: String(item.id) } : {}, status === 'pending' ? 'Call saved and payment saved as pending.' : 'Call and payment saved.')} />
        <div style={{ textAlign: 'right' }}><button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep('recurring')}>He wants monthly / recurring payments instead →</button></div>
      </div>}

      {step === 'recurring' && donor && <div style={{ display: 'grid', gap: 14 }}>
        {saved ? <div className="call-saved-note"><CheckCircle2 size={18} /> The call{saved.pledgeId ? ' and pledge are' : ' is'} saved. Now set up the payments.</div> : <div className="call-step-box" style={{ color: 'var(--text-muted)' }}>Set up the payments. <strong>The call is saved after the payments are set up.</strong></div>}{saved?.pledgeAmount ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>The pledge is ${saved.pledgeAmount.toLocaleString('en-CA')}. Enter the amount of <strong>each</strong> payment (for example, the monthly amount).</div> : null}
        <div><button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowCards(value => !value)}>{showCards ? 'Hide cards' : '💳 Add a new card / see saved cards'}</button>{showCards && <div style={{ marginTop: 10 }}><CloudPaymentMethods donorId={donor.id} /></div>}</div>
        <CloudRecurringPaymentForm key={showCards ? 'cards-open' : 'cards-closed'} donor={{ id: donor.id, name: donor.name }} defaultPledgeId={saved?.pledgeId || undefined} onCancel={() => { if (saved) { setDoneMessage('Call saved. No payments were set up.'); setStep('done'); } else setStep('payment'); }} onCreated={schedule => void afterPaymentSaved(schedule?.id ? { recurringId: String(schedule.id) } : {}, 'Call saved and payments set up.')} />
      </div>}

      {step === 'done' && <div style={{ textAlign: 'center', padding: 30 }}>
        <CheckCircle2 size={42} style={{ color: 'var(--green)' }} />
        <h3 style={{ margin: '10px 0 6px', color: 'var(--navy)' }}>{doneMessage}</h3>
        <div style={{ color: 'var(--text-muted)', marginBottom: 18 }}>It shows on the Tracker page and in {donor?.name}’s pop-up.</div>
        <button type="button" className="btn btn-primary" onClick={onClose}>Close</button>
      </div>}
    </div>
    {showPledge && donor && <PledgeFormModal defaultDonor={{ id: donor.id, name: donorNames(donor).main }} defaults={{ date: form.date, notes: form.notes.trim(), fundraiserAllocations: (() => { const commission = Number(fundraisers.find(item => item.id === form.fundraiserId)?.percentage || 0); return form.fundraiserId && commission > 0 && commission <= 100 ? [{ fundraiserId: form.fundraiserId, percentage: commission }] : []; })() }} onClose={() => setShowPledge(false)} onSaved={item => void afterPledgeSaved(item)} />}
    {showProfile && donor && <CloudDonorProfileModal donorId={donor.id} onClose={() => setShowProfile(false)} onEdit={item => { setShowProfile(false); setEditingDonor(item); }} />}
    {editingDonor && <div className="modal-overlay" onClick={() => setEditingDonor(null)}><div onClick={event => event.stopPropagation()} style={{ width: 'min(900px,94vw)', maxHeight: '92vh', overflowY: 'auto' }}><OnlineDonorForm donor={editingDonor} onCancel={() => setEditingDonor(null)} onSaved={() => setEditingDonor(null)} onConflict={() => setEditingDonor(null)} /></div></div>}
  </div></div>;
};
