import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SolaCardCapture } from './SolaCardCapture';
import { CloudPledgeAllocationEditor, type PledgeAllocationDraft } from './CloudPledgeAllocationEditor';
import { FundraiserAllocationEditor, type FundraiserAllocationDraft } from './FundraiserAllocationEditor';
import { DonorPicker, type PickedDonor } from './DonorPicker';
import { StripeCardBox, type StripeHandle } from './StripeCardBox';

type Donor = PickedDonor;
type Account = { id: string; name: string; type: string; currency: 'CAD' | 'USD' };
type Choice = { id: string; name: string };
type PaymentStatus = 'approved' | 'pending';
type SavedCard = { id: string; brand: string; last4: string; expiryMonth: number; expiryYear: number; isDefault: boolean; status: string; priority: number };

/** The ways a donor can pay. "Charge a card" charges through Sola right now. */
export const PAYMENT_METHODS: { value: string; label: string; hint: string }[] = [
  { value: 'saved_card', label: 'Charge a card', hint: 'Charge now (CAD Sola · USD Stripe)' },
  { value: 'credit_card', label: 'Card already charged', hint: 'Charged outside the program' },
  { value: 'check', label: 'Check', hint: 'Pending until deposited' },
  { value: 'cash', label: 'Cash', hint: '' },
  { value: 'e_transfer', label: 'E-Transfer', hint: '' },
  { value: 'wire', label: 'Wire', hint: '' },
  { value: 'vouchers', label: 'Vouchers', hint: '' },
  { value: 'eizer', label: 'Eizer', hint: '' },
  { value: 'bnei_leivy', label: 'Bnei Leivy', hint: '' },
  { value: 'other', label: 'Other', hint: '' }
];

// When nothing was remembered yet, guess the account from its name.
const NAME_HINTS: Record<string, RegExp> = {
  saved_card: /sola|undeposit|merchant|credit ?card/i, credit_card: /sola|undeposit|merchant|credit ?card/i,
  check: /bmo|chequ|check|bank/i, e_transfer: /bmo|chequ|check|bank/i, wire: /bmo|chequ|check|bank/i,
  cash: /cash/i, vouchers: /voucher/i, eizer: /eizer/i, bnei_leivy: /bnei|leivy/i, other: /^$/
};
export const guessAccount = (method: string, currency: string, accounts: Account[], remembered: Record<string, string>) => {
  const remember = remembered[`${method}:${currency}`];
  if (method === 'saved_card' && currency === 'USD') { const stripe = accounts.find(account => /stripe/i.test(account.name)); if (!remember && stripe) return stripe.id; }
  if (remember && accounts.some(account => account.id === remember)) return remember;
  const sameCurrency = accounts.filter(account => account.currency === currency);
  const hint = NAME_HINTS[method];
  const byName = hint ? (sameCurrency.find(account => hint.test(account.name)) || accounts.find(account => hint.test(account.name))) : undefined;
  if (byName) return byName.id;
  return sameCurrency.length === 1 ? sameCurrency[0].id : '';
};
/** Canadian money goes to the Canadian donations account, US money to the US one. */
export const guessRevenue = (currency: string, accounts: Account[]) => {
  const sameCurrency = accounts.filter(account => account.currency === currency);
  return (sameCurrency.find(account => /donation/i.test(account.name)) || sameCurrency[0] || accounts.find(account => /donation/i.test(account.name)) || accounts[0])?.id || '';
};
const money = (value: number, currency = 'CAD') => `${currency === 'USD' ? 'US$' : '$'}${Number(value || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const localToday = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };

export const OnlinePaymentForm: React.FC<{
  onCreated: (status: PaymentStatus, item?: any) => void;
  onCancel: () => void;
  donor?: Donor;
  defaultAmount?: number;
  defaultDate?: string;
  defaultSourceAccountId?: string;
  forceApproved?: boolean;
  defaultCurrency?: 'CAD' | 'USD';
  /** Pre-fill which pledge(s) this payment pays (for "paid right away" on a new pledge). */
  defaultAllocations?: PledgeAllocationDraft[];
  title?: string;
}> = ({ onCreated, onCancel, donor: fixedDonor, defaultAmount, defaultDate, defaultSourceAccountId, forceApproved = false, defaultCurrency, defaultAllocations, title }) => {
  const [picked, setPicked] = useState<PickedDonor | null>(fixedDonor || null);
  const donorId = picked?.id || '';
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [remembered, setRemembered] = useState<Record<string, string>>({});
  const [projects, setProjects] = useState<Choice[]>([]);
  const [fundraisers, setFundraisers] = useState<Choice[]>([]);
  const [fundraisingGroups, setFundraisingGroups] = useState<{ id: string; name: string; allocations: FundraiserAllocationDraft[] }[]>([]);
  const [amount, setAmount] = useState(defaultAmount ? String(defaultAmount) : '');
  const [currency, setCurrency] = useState<'CAD' | 'USD'>(defaultCurrency || 'CAD');
  const [exchangeRate, setExchangeRate] = useState('');
  const [exchangeRateSource, setExchangeRateSource] = useState<'bank_of_canada' | 'agreed'>('bank_of_canada');
  const [exchangeRateDate, setExchangeRateDate] = useState('');
  const [loadingRate, setLoadingRate] = useState(false);
  const [method, setMethod] = useState('');
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  // Enter a new card right here (Sola secure fields); after saving it is picked automatically.
  const [addingCard, setAddingCard] = useState(false);
  const [cardsVersion, setCardsVersion] = useState(0);
  const knownCardIds = useRef<string[] | null>(null);
  // "Use once": a card typed in for this payment only; it is not kept on the donor's cards.
  const [oneTimeCard, setOneTimeCard] = useState<SavedCard | null>(null);
  const [addingOneTime, setAddingOneTime] = useState(false);
  // US dollars: the card is charged through Stripe.
  const stripeHandle = useRef<StripeHandle | null>(null);
  const stripeCharged = useRef<{ intentId: string; key: string } | null>(null);
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [availabilityDate, setAvailabilityDate] = useState(defaultDate || localToday());
  const [date, setDate] = useState(defaultDate || localToday());
  const [sourceAccountId, setSourceAccountId] = useState(defaultSourceAccountId || '');
  const [revenueOverride, setRevenueOverride] = useState('');
  const [notes, setNotes] = useState('');
  const [projectId, setProjectId] = useState('');
  const [fundraiserAllocations, setFundraiserAllocations] = useState<FundraiserAllocationDraft[]>([]);
  const [fundraiserGroupId, setFundraiserGroupId] = useState('');
  const [allocations, setAllocations] = useState<PledgeAllocationDraft[]>(defaultAllocations || []);
  const [sponsor, setSponsor] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const pendingRequestId = useRef('');

  useEffect(() => {
    const controller = new AbortController();
    Promise.all(['/api/v3/accounts?limit=100', '/api/v3/records/projects?limit=100', '/api/v3/records/fundraisers?limit=100', '/api/v3/records/fundraisingGroups?limit=100'].map(url => fetch(url, { signal: controller.signal }).then(async response => { const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load payment choices.'); return data; })))
      .then(([accountData, projectData, fundraiserData, groupData]) => { setAccounts(accountData.items || []); setProjects(projectData.items || []); setFundraisers(fundraiserData.items || []); setFundraisingGroups(groupData.items || []); })
      .catch(e => { if (e.name !== 'AbortError') setError(e.message || 'Unable to load payment choices.'); });
    fetch('/api/v3/payment-account-defaults', { signal: controller.signal }).then(response => response.json()).then(data => { if (data.success) setRemembered(data.defaults || {}); }).catch(() => undefined);
    return () => controller.abort();
  }, []);

  const assetAccounts = useMemo(() => accounts.filter(account => account.type === 'asset'), [accounts]);
  const revenueAccounts = useMemo(() => accounts.filter(account => account.type === 'revenue'), [accounts]);
  const offsetAccountId = revenueOverride || guessRevenue(currency, revenueAccounts);
  const revenueName = revenueAccounts.find(account => account.id === offsetAccountId)?.name || '';

  // Choosing a method (or currency) fills in the account it goes into. You can still change it.
  useEffect(() => {
    if (defaultSourceAccountId || !method || method === 'check') return;
    setSourceAccountId(guessAccount(method, currency, assetAccounts, remembered));
  }, [method, currency, assetAccounts, remembered, defaultSourceAccountId]);

  const firstDonor = useRef(donorId);
  useEffect(() => { if (firstDonor.current === donorId) return; firstDonor.current = donorId; setAllocations([]); }, [donorId]);
  useEffect(() => { if (!donorId) { setSavedCards([]); setPaymentMethodId(''); return; } const controller = new AbortController(); fetch(`/api/v3/donors/${encodeURIComponent(donorId)}/payment-methods`, { signal: controller.signal }).then(async response => { const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load saved cards.'); const active = (data.items || []).filter((item: SavedCard) => item.status === 'active'); setSavedCards(active); const added = knownCardIds.current ? active.find((item: SavedCard) => !knownCardIds.current!.includes(item.id)) : undefined; knownCardIds.current = null; setPaymentMethodId(current => added ? added.id : current && active.some((item: SavedCard) => item.id === current) ? current : (active.find((item: SavedCard) => item.isDefault) || active[0])?.id || ''); }).catch(reason => { if (reason.name !== 'AbortError') setError(reason.message || 'Unable to load saved cards.'); }); return () => controller.abort(); }, [donorId, cardsVersion]);
  useEffect(() => { if (currency !== 'USD' || exchangeRateSource !== 'bank_of_canada') return; const controller = new AbortController(); setLoadingRate(true); fetch(`/api/v3/exchange-rates/usd-cad?date=${encodeURIComponent(date)}`, { signal: controller.signal }).then(async response => { const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load the official USD/CAD rate.'); setExchangeRate(String(data.rate)); setExchangeRateDate(String(data.rateDate)); }).catch(reason => { if (reason.name !== 'AbortError') setError(reason.message || 'Unable to load the official USD/CAD rate. You can choose an agreed rate instead.'); }).finally(() => { if (!controller.signal.aborted) setLoadingRate(false); }); return () => controller.abort(); }, [currency, date, exchangeRateSource]);

  const parsedAmount = Number(amount);
  const usdCard = method === 'saved_card' && currency === 'USD';
  const card = oneTimeCard && oneTimeCard.id === paymentMethodId ? oneTimeCard : savedCards.find(item => item.id === paymentMethodId);
  // What is still missing, in the order of the form. The Save button says it.
  const missing = !donorId ? 'Choose the donor' : !(parsedAmount > 0) ? 'Enter the amount' : !method ? 'Choose how he paid'
    : method === 'saved_card' && !usdCard && !paymentMethodId ? 'Choose or enter a card'
    : method === 'check' && !checkNumber.trim() ? 'Enter the check number'
    : method === 'check' && (!availabilityDate || availabilityDate < date) ? 'Choose when the check can be deposited'
    : method !== 'check' && !sourceAccountId ? 'Choose the account it goes into'
    : !offsetAccountId ? 'Choose the donation account (More options)'
    : currency === 'USD' && !(Number(exchangeRate) > 0) ? 'Enter the exchange rate' : '';
  const saveLabel = saving ? (method === 'saved_card' ? 'Charging…' : 'Saving…')
    : usdCard ? `Charge ${money(parsedAmount || 0, currency)} through Stripe`
    : method === 'saved_card' ? `Charge ${money(parsedAmount || 0, currency)}${card ? ` to ${card.brand} •••• ${card.last4}` : ''}`
    : method === 'check' ? 'Save check (pending until deposited)' : 'Save payment';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (missing) { setError(missing + '.'); return; }
    if (allocations.reduce((sum, item) => sum + Number(item.amount || 0), 0) - parsedAmount > 0.005) { setError('The amounts applied to pledges are more than the payment.'); return; }
    setSaving(true);
    const requestId = pendingRequestId.current || crypto.randomUUID();
    pendingRequestId.current = requestId;
    try {
      const status: PaymentStatus = forceApproved ? 'approved' : method === 'check' ? 'pending' : 'approved';
      // US dollars: Stripe charges the card first; then the payment is saved (the server checks with Stripe).
      let stripePaymentIntentId = '';
      if (usdCard) {
        if (stripeCharged.current?.key === requestId) stripePaymentIntentId = stripeCharged.current.intentId; // already charged: only save again
        else {
          const handle = stripeHandle.current; if (!handle) throw new Error('The Stripe card box is not ready yet.');
          const intentResponse = await fetch('/api/v3/stripe/payment-intent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ donorId, amount: parsedAmount, currency, requestId }) });
          const intent = await intentResponse.json(); if (!intentResponse.ok || !intent.success) { pendingRequestId.current = ''; throw new Error(intent.error || 'Stripe could not start the payment.'); }
          const result = await handle.stripe.confirmCardPayment(intent.clientSecret, { payment_method: { card: handle.card, billing_details: { name: picked?.name || undefined } } });
          if (result.error) { pendingRequestId.current = ''; throw new Error(`The card was not charged: ${result.error.message}`); }
          if (result.paymentIntent?.status !== 'succeeded') { pendingRequestId.current = ''; throw new Error(`The card was not charged (Stripe: ${result.paymentIntent?.status || 'unknown'}).`); }
          stripePaymentIntentId = result.paymentIntent.id; stripeCharged.current = { intentId: stripePaymentIntentId, key: requestId };
        }
      }
      const chargingSavedCard = method === 'saved_card' && !usdCard;
      const response = await fetch(chargingSavedCard ? `/api/v3/donors/${encodeURIComponent(donorId)}/charge-saved-card` : '/api/v3/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestId },
        body: JSON.stringify({ requestId, donorId, amount: parsedAmount, currency, exchangeRate: currency === 'USD' ? Number(exchangeRate) : undefined, exchangeRateSource: currency === 'USD' ? exchangeRateSource : undefined, exchangeRateDate: currency === 'USD' ? (exchangeRateDate || date) : undefined, method: method === 'saved_card' ? 'credit_card' : method, paymentMethodId: chargingSavedCard ? paymentMethodId : undefined, stripePaymentIntentId: stripePaymentIntentId || undefined, date, sourceAccountId, offsetAccountId, notes, projectId, fundraiserAllocations, allocations, sponsor, checkNumber, availabilityDate, type: status })
      });
      const responseText = await response.text();
      let data: any; try { data = JSON.parse(responseText); } catch { throw new Error(response.ok ? 'The server returned an unreadable response.' : `The payment server failed (${response.status}). Please try again.`); }
      if (!response.ok || !data.success) {
        // If Sola may have charged the card (no clear answer, or still processing), keep the same request key:
        // pressing Save again then only shows the same result and can never charge the card a second time.
        const unclear = Boolean(data.reviewRequired || data.processing);
        if (stripePaymentIntentId) throw new Error(`The card WAS charged in Stripe (${stripePaymentIntentId}), but the payment was not saved: ${data.error || 'error'}. Press the button again to save it (it will not charge again).`);
        if (!unclear) pendingRequestId.current = '';
        throw new Error(unclear ? `${data.error || 'The card result is not clear.'} Check the payment in Sola before trying again. To start over, close this form and open it again.` : (data.error || 'The payment could not be saved.'));
      }
      pendingRequestId.current = ''; stripeCharged.current = null;
      // Remember the account for this method, so next time it is filled in by itself.
      const memoryKey = `${method}:${currency}`;
      if (method !== 'check' && sourceAccountId && !defaultSourceAccountId && remembered[memoryKey] !== sourceAccountId) void fetch('/api/v3/payment-account-defaults', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: memoryKey, accountId: sourceAccountId }) }).catch(() => undefined);
      onCreated(status, data.item);
    } catch (e: any) {
      setError(e.message || 'The payment could not be saved. You can safely try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card pay-form">
      <div className="pay-form-head">
        <h2>{title || 'New payment'}</h2>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Close</button>
      </div>
      <form onSubmit={submit}>
        <div className="pay-step">
          <div className="pay-step-title"><span>1</span>Who paid?</div>
          <DonorPicker value={picked} onChange={setPicked} locked={Boolean(fixedDonor)} autoFocus={!fixedDonor} />
        </div>

        <div className="pay-step">
          <div className="pay-step-title"><span>2</span>How much?</div>
          <div className="pay-amount-row">
            <label className="pay-amount"><span>{currency === 'USD' ? 'US$' : '$'}</span><input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></label>
            <div className="pay-toggle" role="group" aria-label="Currency">{(['CAD', 'USD'] as const).map(value => <button type="button" key={value} className={currency === value ? 'active' : ''} onClick={() => { setCurrency(value); setRevenueOverride(''); }}>{value}</button>)}</div>
            <label className="form-group pay-date"><span>Date</span><input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
          </div>
          {currency === 'USD' && <div className="pay-usd">
            <select value={exchangeRateSource} onChange={e => setExchangeRateSource(e.target.value as 'bank_of_canada' | 'agreed')}><option value="bank_of_canada">Bank of Canada rate</option><option value="agreed">Rate agreed with donor</option></select>
            <input type="number" min="0.0001" step="0.0001" readOnly={exchangeRateSource === 'bank_of_canada'} value={exchangeRate} onChange={e => setExchangeRate(e.target.value)} placeholder={loadingRate ? 'Loading…' : '1.3500'} />
            <span>= CAD {money(parsedAmount * Number(exchangeRate || 0))}{exchangeRateSource === 'bank_of_canada' && exchangeRateDate ? ` (rate of ${exchangeRateDate})` : ''}</span>
          </div>}
        </div>

        <div className="pay-step">
          <div className="pay-step-title"><span>3</span>How did he pay?</div>
          <div className="pay-methods">{PAYMENT_METHODS.map(item => <button type="button" key={item.value} className={method === item.value ? 'active' : ''} onClick={() => setMethod(item.value)}><strong>{item.label}</strong>{item.hint && <small>{item.hint}</small>}</button>)}</div>

          {usdCard && <div className="pay-detail"><StripeCardBox onReady={handle => { stripeHandle.current = handle; }} /></div>}
          {method === 'saved_card' && !usdCard && <div className="pay-detail">
            {oneTimeCard && oneTimeCard.id === paymentMethodId ? <div className="pay-onetime"><strong>{oneTimeCard.brand} •••• {oneTimeCard.last4}</strong> <span>used once – not saved</span><button type="button" className="btn btn-ghost btn-sm" onClick={() => { setOneTimeCard(null); setPaymentMethodId((savedCards.find(item => item.isDefault) || savedCards[0])?.id || ''); }}>Change</button></div>
              : <label className="form-group"><span>Card</span><select value={paymentMethodId} onChange={event => setPaymentMethodId(event.target.value)} disabled={!donorId}><option value="">{!donorId ? 'Choose the donor first' : savedCards.length ? 'Choose a saved card' : 'No saved cards yet'}</option>{savedCards.map(item => <option key={item.id} value={item.id}>{item.brand} •••• {item.last4} · expires {String(item.expiryMonth).padStart(2, '0')}/{item.expiryYear}{item.isDefault ? ' · Default' : ''}</option>)}</select></label>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAddingCard(true)} disabled={saving || !donorId}>+ New card (save it)</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAddingOneTime(true)} disabled={saving || !donorId}>Use a card once (don't save)</button>
            </div>
            <small className="pay-note">Charged securely through Sola in Canadian dollars. The full card number is never shown here.</small>
          </div>}
          {method === 'check' && <div className="pay-detail pay-detail-grid">
            <label className="form-group"><span>Check number</span><input value={checkNumber} onChange={e => setCheckNumber(e.target.value)} maxLength={100} /></label>
            <label className="form-group"><span>Can be deposited on</span><input type="date" min={date} value={availabilityDate} onChange={e => setAvailabilityDate(e.target.value)} /></label>
            <small className="pay-note" style={{ gridColumn: '1 / -1' }}>The check waits under "Pending checks" until you mark it deposited. You get a reminder on that date.</small>
          </div>}
          {method && method !== 'check' && <div className="pay-detail">
            <label className="form-group"><span>Goes into account</span><select value={sourceAccountId} onChange={e => setSourceAccountId(e.target.value)}><option value="">Choose the account</option>{assetAccounts.map(account => <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>)}</select></label>
            <small className="pay-note">Filled in by itself. If you change it, the program remembers it for next time.</small>
          </div>}
        </div>

        {donorId && <div className="pay-step">
          <div className="pay-step-title"><span>4</span>Which pledge does it pay? <small>(optional)</small></div>
          <CloudPledgeAllocationEditor donorId={donorId} totalAmount={parsedAmount || 0} currency={currency} value={allocations} onChange={setAllocations} disabled={saving} />
        </div>}

        <details className="pay-more">
          <summary>More options: notes, project, fundraiser, donation account{revenueName ? ` (${revenueName})` : ''}</summary>
          <div className="pay-detail-grid">
            <label className="form-group" style={{ gridColumn: '1 / -1' }}><span>Notes</span><textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={2000} rows={2} /></label>
            <label className="form-group"><span>Donation account</span><select value={offsetAccountId} onChange={e => setRevenueOverride(e.target.value)}>{revenueAccounts.map(account => <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>)}</select><small>Chosen by the currency. Change it only if needed.</small></label>
            <label className="form-group"><span>Project</span><select value={projectId} onChange={e => setProjectId(e.target.value)}><option value="">— No project —</option>{projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="form-group"><span>Sponsor / source</span><input value={sponsor} onChange={e => setSponsor(e.target.value)} maxLength={300} /></label>
            {allocations.length === 0 ? <div style={{ gridColumn: '1 / -1', display: 'grid', gap: 8 }}>
              <label className="form-group"><span>Fundraiser team</span><select value={fundraiserGroupId} onChange={event => { const group = fundraisingGroups.find(item => item.id === event.target.value); setFundraiserGroupId(event.target.value); if (group) setFundraiserAllocations(group.allocations || []); }}><option value="">— Custom split —</option>{fundraisingGroups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select><small>Only when this money does not pay a pledge. A pledge payment uses the pledge's fundraisers.</small></label>
              <FundraiserAllocationEditor fundraisers={fundraisers} value={fundraiserAllocations} onChange={value => { setFundraiserGroupId(''); setFundraiserAllocations(value); }} disabled={saving} />
            </div> : <small className="pay-note" style={{ gridColumn: '1 / -1' }}>The fundraisers come from the pledge automatically.</small>}
          </div>
        </details>

        {error && <div className="pay-error">{error}</div>}
        <div className="pay-footer">
          <span className="pay-missing">{missing ? `Still needed: ${missing.toLowerCase()}` : '✓ Everything is filled in'}</span>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving || Boolean(missing)}>{saveLabel}</button>
        </div>
      </form>
      {addingOneTime && <div className="modal-overlay" onClick={() => setAddingOneTime(false)}><div className="modal" onClick={event => event.stopPropagation()} style={{ maxWidth: 620, width: '94%' }}><div className="modal-header"><h2 style={{ margin: 0 }}>Card for this payment only – {picked?.name || 'this donor'}</h2></div><div className="modal-body"><SolaCardCapture oneTime donorId={donorId} onCancel={() => setAddingOneTime(false)} onSaved={item => { setAddingOneTime(false); if (item?.id) { setOneTimeCard(item); setPaymentMethodId(String(item.id)); } }} /></div></div></div>}
      {addingCard && <div className="modal-overlay" onClick={() => setAddingCard(false)}><div className="modal" onClick={event => event.stopPropagation()} style={{ maxWidth: 620, width: '94%' }}><div className="modal-header"><h2 style={{ margin: 0 }}>New card for {picked?.name || 'this donor'}</h2></div><div className="modal-body"><SolaCardCapture donorId={donorId} onCancel={() => setAddingCard(false)} onSaved={() => { knownCardIds.current = savedCards.map(item => item.id); setAddingCard(false); setCardsVersion(value => value + 1); }} /></div></div></div>}
    </section>
  );
};
