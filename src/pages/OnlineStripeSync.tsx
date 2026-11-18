import React, { useEffect, useState } from 'react';
import { EyeOff, FileSpreadsheet, Link as LinkIcon, Plus, RefreshCw, Trash2, Undo2 } from 'lucide-react';
import { downloadExcel, type ExcelColumn } from '../utils/excel';
import { DonorPicker, type PickedDonor } from '../components/DonorPicker';
import { CloudPaymentDetailsModal } from '../components/CloudPaymentDetailsModal';

/**
 * Stripe Sync: every Stripe charge next to the US-dollar / Stripe payments in CharityPro.
 * Only in Stripe → add it for a donor, link it to an existing payment, or ignore it.
 * Only in CharityPro → open (edit / change donor), link to a Stripe charge, or delete.
 */
type Charge = { id: string; paymentIntentId: string; date: string; amount: number; currency: string; refunded: number; status: string; name: string; email: string; card: string; description: string; donorId?: string; donorGuess?: string; cadAmount: number | null; cadFee: number | null; rate: number | null; payoutCurrency: string };
type Pay = { id: string; revision: number; date: string; donor: string; donorName: string; donorId: string; amount: number; currency: string; amountCAD: number | null; method: string; status: string; notes: string; [key: string]: any };
type Result = { lastRead?: { at: string; from: string; count: number } | null; saved?: boolean; from: string; counts: Record<string, number>; matched: { stripe: Charge; payment: Pay; how: string }[]; onlyStripe: Charge[]; onlyCharityPro: Pay[]; ignored: Charge[] };
const money = (value: number | null | undefined) => value === null || value === undefined ? '' : Number(value).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const post = async (url: string, body: any, method = 'POST') => { const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: method === 'DELETE' ? undefined : JSON.stringify(body) }); const json = await response.json().catch(() => ({})); if (!response.ok || json.success === false) throw new Error(json.error || 'Something went wrong.'); return json; };
const close = (a: number, b: number) => Math.abs(a - b) < 0.005;

export const OnlineStripeSync: React.FC = () => {
  const [from, setFrom] = useState(() => { try { return localStorage.getItem('stripeSyncFrom') || '2024-01-01'; } catch { return '2024-01-01'; } }); const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<'stripe' | 'cp' | 'matched' | 'ignored'>('stripe');
  const [adding, setAdding] = useState<string | null>(null); const [donor, setDonor] = useState<PickedDonor | null>(null);
  const [busy, setBusy] = useState(''); const [openPayment, setOpenPayment] = useState<Pay | null>(null);
  const load = async (quiet = false, live = false) => {
    if (!quiet) setLoading(true); setError('');
    try { try { localStorage.setItem('stripeSyncFrom', from); } catch { /* ignore */ } const response = await fetch(`/api/v3/stripe/compare?from=${from}${live ? '&mode=live' : ''}`); const json = await response.json().catch(() => ({})); if (!response.ok || !json.success) throw new Error(json.error || 'Could not read Stripe.'); setData(json); }
    catch (reason: any) { setError(reason.message || 'Could not read Stripe.'); } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (key: string, run: () => Promise<any>, done: string) => { setBusy(key); setError(''); setNotice(''); try { await run(); setNotice(done); await load(true); } catch (reason: any) { setError(reason.message); } finally { setBusy(''); } };
  // US-dollar charge: the rate to Canadian dollars (Stripe's own rate when it paid out in CAD, otherwise the Bank of Canada rate of that day). You can change it.
  const [rate, setRate] = useState(''); const [rateNote, setRateNote] = useState('');
  const startAdding = (ch: Charge) => {
    const open = adding === ch.id ? null : ch.id; setAdding(open); setDonor(null); setRate(''); setRateNote('');
    if (!open || ch.currency !== 'USD') return;
    if (ch.payoutCurrency === 'CAD' && ch.cadAmount) { setRate((ch.cadAmount / ch.amount).toFixed(4)); setRateNote("Stripe's own rate"); return; }
    fetch(`/api/v3/exchange-rates/usd-cad?date=${encodeURIComponent(ch.date)}`).then(response => response.json()).then(json => { if (json.success) { setRate(String(json.rate)); setRateNote(`Bank of Canada rate of ${json.rateDate}`); } }).catch(() => undefined);
  };
  const addCharge = (ch: Charge) => { if (!donor) return; if (ch.currency === 'USD' && !(Number(rate) > 0 && Number(rate) < 100)) { setError('Enter the USD to CAD rate.'); return; } void act(ch.id, () => post('/api/v3/stripe/import', { chargeId: ch.id, donorId: donor.id, ...(ch.currency === 'USD' ? { exchangeRate: Number(rate) } : {}) }), `Added $${money(ch.amount)} ${ch.currency} for ${donor.name}${ch.currency === 'USD' ? ` = CAD $${money((ch.amount - ch.refunded) * Number(rate))}` : ''}.`).then(() => { setAdding(null); setDonor(null); }); };
  const link = (chargeId: string, paymentId: string) => { setBusy(chargeId); setError(''); setNotice(''); post('/api/v3/stripe/link', { chargeId, paymentId }).then(json => { setNotice(json.approved ? 'Linked - and marked approved, because Stripe charged it.' : 'Linked.'); return load(true); }).catch((reason: any) => setError(reason.message)).finally(() => setBusy('')); };
  const ignore = (ch: Charge, value: boolean) => act(ch.id, () => post('/api/v3/stripe/ignore', { chargeId: ch.id, ignore: value }), value ? 'Hidden from the list.' : 'Back in the list.');
  const remove = (p: Pay) => { if (!window.confirm(`Delete the payment of $${money(p.amount)} ${p.currency} on ${p.date} for ${p.donor}? (It goes to the Audit History and can be brought back.)`)) return; void act(p.id, () => post(`/api/v3/payments/${encodeURIComponent(p.id)}`, null, 'DELETE'), 'Payment deleted.'); };
  const exportExcel = () => {
    if (!data) return;
    const t = (key: string, header: string, width?: number): ExcelColumn => ({ key, header, type: 'text', width }); const m = (key: string, header: string): ExcelColumn => ({ key, header, type: 'money' }); const d = (key: string, header: string): ExcelColumn => ({ key, header, type: 'date' });
    const chargeCols = [d('date', 'Stripe date'), t('name', 'Name on card'), t('email', 'Email'), m('amount', 'Amount'), t('currency', 'Currency'), m('refunded', 'Refunded'), t('status', 'Status'), m('cadAmount', 'Paid out (CAD)'), m('cadFee', 'Stripe fee'), { key: 'rate', header: 'Rate', type: 'number' } as ExcelColumn, t('card', 'Card'), t('description', 'Description', 30), t('id', 'Stripe charge id')];
    const payCols = [d('date', 'Date'), t('donor', 'Donor'), m('amount', 'Amount'), t('currency', 'Currency'), m('amountCAD', 'Amount CAD'), t('method', 'Method'), t('status', 'Status'), t('notes', 'Notes', 40), t('id', 'CharityPro id')];
    downloadExcel(`Stripe vs CharityPro from ${data.from}`, [
      { name: 'Summary', title: `Stripe vs CharityPro since ${data.from}`, columns: [t('what', 'What', 40), { key: 'count', header: 'Records', type: 'number' }], rows: [{ what: 'Stripe charges', count: data.counts.stripe }, { what: 'US-dollar / Stripe payments in CharityPro', count: data.counts.charityPro }, { what: 'Matched', count: data.counts.matched }, { what: 'Only in Stripe (missing in CharityPro)', count: data.counts.onlyStripe }, { what: 'Only in CharityPro (not in Stripe)', count: data.counts.onlyCharityPro }, { what: 'Ignored Stripe charges', count: data.counts.ignored }] },
      { name: 'Matched', columns: [t('how', 'Matched by', 26), d('sDate', 'Stripe date'), t('sName', 'Name on card'), m('sAmount', 'Stripe amount'), t('sCurrency', 'Cur.'), m('sCad', 'Paid out (CAD)'), { key: 'sRate', header: 'Rate', type: 'number' } as ExcelColumn, t('sStatus', 'Stripe status'), d('pDate', 'CharityPro date'), t('pDonor', 'CharityPro donor'), m('pAmount', 'CharityPro amount'), m('pCad', 'CharityPro CAD'), t('sId', 'Stripe id'), t('pId', 'CharityPro id')], rows: data.matched.map(x => ({ how: x.how, sDate: x.stripe.date, sName: x.stripe.name, sAmount: x.stripe.amount, sCurrency: x.stripe.currency, sCad: x.stripe.cadAmount, sRate: x.stripe.rate, sStatus: x.stripe.status, pDate: x.payment.date, pDonor: x.payment.donor, pAmount: x.payment.amount, pCad: x.payment.amountCAD, sId: x.stripe.id, pId: x.payment.id })) },
      { name: 'Only in Stripe', columns: [t('donorGuess', 'Donor (from Stripe)'), ...chargeCols], rows: data.onlyStripe },
      { name: 'Only in CharityPro', columns: payCols, rows: data.onlyCharityPro },
      { name: 'Ignored', columns: chargeCols, rows: data.ignored },
    ]);
  };
  const tile = (label: string, value: number | undefined, color?: string) => <div className="card" style={{ padding: 14, minWidth: 150 }}><div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{label}</div><div style={{ fontSize: 26, fontWeight: 800, color: color || 'var(--navy)' }}>{value ?? '–'}</div></div>;
  const btn = (label: React.ReactNode, onClick: () => void, key: string, kind = 'btn-secondary') => <button type="button" className={`btn btn-sm ${kind}`} disabled={Boolean(busy)} onClick={onClick} style={{ whiteSpace: 'nowrap' }}>{busy === key ? '…' : label}</button>;
  const linkChoices = (amount: number, currency: string, list: Pay[]) => list.filter(p => close(Number(p.amount), amount) && String(p.currency || 'CAD') === currency);
  const chargeChoices = (p: Pay) => (data?.onlyStripe || []).filter(ch => close(ch.amount, Number(p.amount)) && ch.currency === String(p.currency || 'CAD'));
  return <div className="page page-inner" style={{ display: 'grid', gap: 16 }}>
    <div className="card" style={{ display: 'grid', gap: 12 }}>
      <div><h2 style={{ margin: 0, color: 'var(--navy)' }}>Stripe Sync (US-dollar cards)</h2><p style={{ margin: '4px 0 0', color: 'var(--text-muted)' }}>Your Stripe charges next to the US-dollar payments in CharityPro. Add a missing charge for a donor, link it to a payment that is already there, ignore it, or delete a payment that should not be there.</p></div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
        <label className="form-group" style={{ margin: 0 }}><span>From date</span><input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label>
        <button type="button" className="btn btn-primary btn-sm" disabled={loading} onClick={() => void load(false, true)}><RefreshCw size={15} /> {loading ? 'Reading Stripe…' : 'Read Stripe (get new charges)'}</button>
        {data?.lastRead && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Last read from Stripe: {new Date(data.lastRead.at).toLocaleString('en-CA')} · {data.lastRead.count} charges since {data.lastRead.from}</span>}
        {data && !data.lastRead && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Not read from Stripe yet - click Read Stripe.</span>}
        <button type="button" className="btn btn-secondary btn-sm" disabled={!data} onClick={exportExcel}><FileSpreadsheet size={15} /> Export to Excel</button>
      </div>
      {error && <div style={{ color: 'var(--red)' }}>{error}</div>}
      {notice && <div style={{ color: 'var(--green)', fontWeight: 700 }}>{notice}</div>}
    </div>
    {data && <>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>{tile('Stripe charges', data.counts.stripe)}{tile('In CharityPro', data.counts.charityPro)}{tile('Matched', data.counts.matched, 'var(--green)')}{tile('Only in Stripe', data.counts.onlyStripe, 'var(--red)')}{tile('Only in CharityPro', data.counts.onlyCharityPro, 'var(--red)')}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{([['stripe', `Only in Stripe (${data.onlyStripe.length})`], ['cp', `Only in CharityPro (${data.onlyCharityPro.length})`], ['matched', `Matched (${data.matched.length})`], ['ignored', `Ignored (${data.ignored.length})`]] as const).map(([key, label]) => <button key={key} type="button" className={`btn btn-sm ${tab === key ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab(key)}>{label}</button>)}</div>
      <div className="card table-container">
        {tab === 'stripe' && <table><thead><tr><th>Date</th><th>Name on card</th><th style={{ textAlign: 'right' }}>Amount</th><th style={{ textAlign: 'right' }}>Paid out CAD</th><th>Status</th><th>Card</th><th>What to do</th></tr></thead><tbody>
          {data.onlyStripe.map(ch => { const choices = linkChoices(ch.amount, ch.currency, data.onlyCharityPro); return <React.Fragment key={ch.id}>
            <tr><td>{ch.date}</td><td>{ch.name || ch.email}{ch.donorGuess && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Charged for: {ch.donorGuess}</div>}</td><td style={{ textAlign: 'right' }}>${money(ch.amount)} {ch.currency}{ch.refunded ? <div style={{ fontSize: 12, color: 'var(--red)' }}>refunded ${money(ch.refunded)}</div> : null}</td><td style={{ textAlign: 'right' }}>{ch.cadAmount !== null ? `$${money(ch.cadAmount)}` : ''}</td><td>{ch.status}</td><td>{ch.card}</td>
              <td><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {btn(<><Plus size={13} /> Add to donor</>, () => startAdding(ch), ch.id + '-add', 'btn-primary')}
                {choices.length > 0 && <select disabled={Boolean(busy)} value="" onChange={event => { if (event.target.value) void link(ch.id, event.target.value); }} style={{ width: 'auto' }}><option value="">Link to payment…</option>{choices.map(p => <option key={p.id} value={p.id}>{p.date} · {p.donor} · ${money(p.amount)}</option>)}</select>}
                {btn(<><EyeOff size={13} /> Ignore</>, () => void ignore(ch, true), ch.id)}
              </div></td></tr>
            {adding === ch.id && <tr><td colSpan={7} style={{ background: 'var(--bg-input)' }}><div style={{ display: 'grid', gap: 8, maxWidth: 560 }}><strong>Which donor is this ${money(ch.amount)} {ch.currency} from {ch.name || 'this card'}?</strong><DonorPicker value={donor} onChange={setDonor} autoFocus />{ch.currency === 'USD' && <label className="form-group" style={{ margin: 0 }}><span>USD → CAD rate</span><input type="number" min="0.0001" step="0.0001" value={rate} onChange={event => { setRate(event.target.value); setRateNote('Rate you entered'); }} placeholder="1.38" style={{ maxWidth: 160 }} /><small style={{ color: 'var(--text-muted)' }}>{Number(rate) > 0 ? `US${money(ch.amount - ch.refunded)} = CAD ${money((ch.amount - ch.refunded) * Number(rate))}` : ''}{rateNote ? ` · ${rateNote}` : ''}</small></label>}<div style={{ display: 'flex', gap: 8 }}>{btn('Save payment', () => addCharge(ch), ch.id, 'btn-primary')}<button type="button" className="btn btn-secondary btn-sm" onClick={() => { setAdding(null); setDonor(null); }}>Cancel</button></div><span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>It is saved{ch.currency === 'USD' ? ' with the Canadian amount from the rate above' : ''} and put on the donor's pledge for that date.</span></div></td></tr>}
          </React.Fragment>; })}
          {!data.onlyStripe.length && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24 }}>Nothing – every Stripe charge is in CharityPro.</td></tr>}
        </tbody></table>}
        {tab === 'cp' && <table><thead><tr><th>Date</th><th>Donor</th><th style={{ textAlign: 'right' }}>Amount</th><th style={{ textAlign: 'right' }}>CAD</th><th>Method</th><th>Notes</th><th>What to do</th></tr></thead><tbody>
          {data.onlyCharityPro.map(p => { const choices = chargeChoices(p); return <tr key={p.id}><td>{p.date}</td><td>{p.donor}</td><td style={{ textAlign: 'right' }}>${money(p.amount)} {p.currency}</td><td style={{ textAlign: 'right' }}>{p.amountCAD ? `$${money(p.amountCAD)}` : ''}</td><td>{p.method}</td><td style={{ maxWidth: 260 }}>{p.notes}</td>
            <td><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{btn('Open / edit', () => setOpenPayment(p), p.id + '-open')}{choices.length > 0 && <select disabled={Boolean(busy)} value="" onChange={event => { if (event.target.value) void link(event.target.value, p.id); }} style={{ width: 'auto' }}><option value="">Link to Stripe…</option>{choices.map(ch => <option key={ch.id} value={ch.id}>{ch.date} · {ch.name || ch.email} · ${money(ch.amount)}</option>)}</select>}{btn(<><Trash2 size={13} /> Delete</>, () => remove(p), p.id)}</div></td></tr>; })}
          {!data.onlyCharityPro.length && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24 }}>Nothing.</td></tr>}
        </tbody></table>}
        {tab === 'matched' && <table><thead><tr><th>Matched by</th><th>Stripe date</th><th>Name on card</th><th style={{ textAlign: 'right' }}>Stripe</th><th style={{ textAlign: 'right' }}>Paid out CAD</th><th>CharityPro</th><th style={{ textAlign: 'right' }}>CharityPro amount</th><th /></tr></thead><tbody>{data.matched.map(x => <tr key={x.stripe.id}><td>{x.how}</td><td>{x.stripe.date}</td><td>{x.stripe.name}</td><td style={{ textAlign: 'right' }}>${money(x.stripe.amount)} {x.stripe.currency}</td><td style={{ textAlign: 'right' }}>{x.stripe.cadAmount !== null ? `$${money(x.stripe.cadAmount)}` : ''}</td><td>{x.payment.date} · {x.payment.donor}</td><td style={{ textAlign: 'right' }}>${money(x.payment.amount)} {x.payment.currency}</td><td>{btn(<><LinkIcon size={13} /> Open</>, () => setOpenPayment(x.payment), x.payment.id + '-open')}</td></tr>)}</tbody></table>}
        {tab === 'ignored' && <table><thead><tr><th>Date</th><th>Name on card</th><th style={{ textAlign: 'right' }}>Amount</th><th>Status</th><th /></tr></thead><tbody>{data.ignored.map(ch => <tr key={ch.id}><td>{ch.date}</td><td>{ch.name || ch.email}</td><td style={{ textAlign: 'right' }}>${money(ch.amount)} {ch.currency}</td><td>{ch.status}</td><td>{btn(<><Undo2 size={13} /> Show again</>, () => void ignore(ch, false), ch.id)}</td></tr>)}{!data.ignored.length && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24 }}>Nothing ignored.</td></tr>}</tbody></table>}
      </div>
    </>}
    {openPayment && <CloudPaymentDetailsModal payment={openPayment} onClose={() => setOpenPayment(null)} onUpdated={() => { void load(true); }} />}
  </div>;
};
