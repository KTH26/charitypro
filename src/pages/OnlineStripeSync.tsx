import React, { useState } from 'react';
import { FileSpreadsheet, RefreshCw } from 'lucide-react';
import { downloadExcel, type ExcelColumn } from '../utils/excel';

/**
 * Stripe Sync (read only): every Stripe charge next to the US-dollar / Stripe payments in CharityPro.
 * Shows what matches, what only Stripe has, and what only CharityPro has. Nothing is changed.
 */
type Charge = { id: string; paymentIntentId: string; date: string; amount: number; currency: string; refunded: number; status: string; name: string; email: string; card: string; description: string; donorGuess?: string; cadAmount: number | null; cadFee: number | null; rate: number | null; payoutCurrency: string };
type Pay = { id: string; date: string; donor: string; amount: number; currency: string; amountCAD: number | null; method: string; status: string; notes: string };
type Result = { from: string; counts: Record<string, number>; matched: { stripe: Charge; payment: Pay; how: string }[]; onlyStripe: Charge[]; onlyCharityPro: Pay[] };
const money = (value: number | null | undefined) => value === null || value === undefined ? '' : Number(value).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const OnlineStripeSync: React.FC = () => {
  const [from, setFrom] = useState('2024-01-01'); const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [tab, setTab] = useState<'matched' | 'stripe' | 'cp'>('stripe');
  const load = async () => {
    setLoading(true); setError('');
    try { const response = await fetch(`/api/v3/stripe/compare?from=${from}`); const json = await response.json().catch(() => ({})); if (!response.ok || !json.success) throw new Error(json.error || 'Could not read Stripe.'); setData(json); }
    catch (reason: any) { setError(reason.message || 'Could not read Stripe.'); } finally { setLoading(false); }
  };
  const exportExcel = () => {
    if (!data) return;
    const t = (key: string, header: string, width?: number): ExcelColumn => ({ key, header, type: 'text', width }); const m = (key: string, header: string): ExcelColumn => ({ key, header, type: 'money' }); const d = (key: string, header: string): ExcelColumn => ({ key, header, type: 'date' });
    const chargeCols = [d('date', 'Stripe date'), t('name', 'Name on card'), t('email', 'Email'), m('amount', 'Amount'), t('currency', 'Currency'), m('refunded', 'Refunded'), t('status', 'Status'), m('cadAmount', 'Paid out (CAD)'), m('cadFee', 'Stripe fee'), { key: 'rate', header: 'Rate', type: 'number' } as ExcelColumn, t('card', 'Card'), t('description', 'Description', 30), t('id', 'Stripe charge id')];
    const payCols = [d('date', 'Date'), t('donor', 'Donor'), m('amount', 'Amount'), t('currency', 'Currency'), m('amountCAD', 'Amount CAD'), t('method', 'Method'), t('status', 'Status'), t('notes', 'Notes', 40), t('id', 'CharityPro id')];
    downloadExcel(`Stripe vs CharityPro from ${data.from}`, [
      { name: 'Summary', title: `Stripe vs CharityPro since ${data.from} (nothing was changed)`, columns: [t('what', 'What', 40), { key: 'count', header: 'Records', type: 'number' }], rows: [{ what: 'Stripe charges', count: data.counts.stripe }, { what: 'US-dollar / Stripe payments in CharityPro', count: data.counts.charityPro }, { what: 'Matched', count: data.counts.matched }, { what: 'Only in Stripe (missing in CharityPro)', count: data.counts.onlyStripe }, { what: 'Only in CharityPro (not in Stripe)', count: data.counts.onlyCharityPro }] },
      { name: 'Matched', columns: [t('how', 'Matched by', 26), d('sDate', 'Stripe date'), t('sName', 'Name on card'), m('sAmount', 'Stripe amount'), t('sCurrency', 'Cur.'), m('sCad', 'Paid out (CAD)'), { key: 'sRate', header: 'Rate', type: 'number' } as ExcelColumn, t('sStatus', 'Stripe status'), d('pDate', 'CharityPro date'), t('pDonor', 'CharityPro donor'), m('pAmount', 'CharityPro amount'), m('pCad', 'CharityPro CAD'), t('sId', 'Stripe id'), t('pId', 'CharityPro id')], rows: data.matched.map(x => ({ how: x.how, sDate: x.stripe.date, sName: x.stripe.name, sAmount: x.stripe.amount, sCurrency: x.stripe.currency, sCad: x.stripe.cadAmount, sRate: x.stripe.rate, sStatus: x.stripe.status, pDate: x.payment.date, pDonor: x.payment.donor, pAmount: x.payment.amount, pCad: x.payment.amountCAD, sId: x.stripe.id, pId: x.payment.id })) },
      { name: 'Only in Stripe', columns: [t('donorGuess', 'Donor (from Stripe)'), ...chargeCols], rows: data.onlyStripe },
      { name: 'Only in CharityPro', columns: payCols, rows: data.onlyCharityPro },
    ]);
  };
  const tile = (label: string, value: number | undefined, color?: string) => <div className="card" style={{ padding: 14, minWidth: 150 }}><div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{label}</div><div style={{ fontSize: 26, fontWeight: 800, color: color || 'var(--navy)' }}>{value ?? '–'}</div></div>;
  return <div style={{ padding: 28, display: 'grid', gap: 16 }}>
    <div className="card" style={{ display: 'grid', gap: 12 }}>
      <div><h2 style={{ margin: 0, color: 'var(--navy)' }}>Stripe Sync (US-dollar cards)</h2><p style={{ margin: '4px 0 0', color: 'var(--text-muted)' }}>Reads your Stripe charges with the saved Stripe key and puts them next to the US-dollar payments in CharityPro. It only reads – nothing is changed.</p></div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
        <label className="form-group" style={{ margin: 0 }}><span>From date</span><input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label>
        <button type="button" className="btn btn-primary btn-sm" disabled={loading} onClick={() => void load()}><RefreshCw size={15} /> {loading ? 'Reading Stripe…' : 'Read Stripe'}</button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={!data} onClick={exportExcel}><FileSpreadsheet size={15} /> Export to Excel</button>
      </div>
      {error && <div style={{ color: 'var(--red)' }}>{error}</div>}
    </div>
    {data && <>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>{tile('Stripe charges', data.counts.stripe)}{tile('In CharityPro', data.counts.charityPro)}{tile('Matched', data.counts.matched, 'var(--green)')}{tile('Only in Stripe', data.counts.onlyStripe, 'var(--red)')}{tile('Only in CharityPro', data.counts.onlyCharityPro, 'var(--red)')}</div>
      <div style={{ display: 'flex', gap: 8 }}>{([['stripe', `Only in Stripe (${data.onlyStripe.length})`], ['cp', `Only in CharityPro (${data.onlyCharityPro.length})`], ['matched', `Matched (${data.matched.length})`]] as const).map(([key, label]) => <button key={key} type="button" className={`btn btn-sm ${tab === key ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab(key)}>{label}</button>)}</div>
      <div className="card table-container">
        {tab === 'stripe' && <table><thead><tr><th>Date</th><th>Name on card</th><th>Donor</th><th style={{ textAlign: 'right' }}>Amount</th><th style={{ textAlign: 'right' }}>Paid out CAD</th><th>Rate</th><th>Status</th><th>Card</th></tr></thead><tbody>{data.onlyStripe.map(x => <tr key={x.id}><td>{x.date}</td><td>{x.name || x.email}</td><td>{x.donorGuess}</td><td style={{ textAlign: 'right' }}>${money(x.amount)} {x.currency}</td><td style={{ textAlign: 'right' }}>{x.cadAmount !== null ? `$${money(x.cadAmount)}` : ''}</td><td>{x.rate ?? ''}</td><td>{x.status}</td><td>{x.card}</td></tr>)}{!data.onlyStripe.length && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24 }}>Nothing – every Stripe charge is in CharityPro.</td></tr>}</tbody></table>}
        {tab === 'cp' && <table><thead><tr><th>Date</th><th>Donor</th><th style={{ textAlign: 'right' }}>Amount</th><th style={{ textAlign: 'right' }}>CAD</th><th>Method</th><th>Notes</th></tr></thead><tbody>{data.onlyCharityPro.map(x => <tr key={x.id}><td>{x.date}</td><td>{x.donor}</td><td style={{ textAlign: 'right' }}>${money(x.amount)} {x.currency}</td><td style={{ textAlign: 'right' }}>{x.amountCAD ? `$${money(x.amountCAD)}` : ''}</td><td>{x.method}</td><td>{x.notes}</td></tr>)}{!data.onlyCharityPro.length && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24 }}>Nothing.</td></tr>}</tbody></table>}
        {tab === 'matched' && <table><thead><tr><th>Matched by</th><th>Stripe date</th><th>Name on card</th><th style={{ textAlign: 'right' }}>Stripe</th><th style={{ textAlign: 'right' }}>Paid out CAD</th><th>CharityPro</th><th style={{ textAlign: 'right' }}>CharityPro amount</th></tr></thead><tbody>{data.matched.map(x => <tr key={x.stripe.id}><td>{x.how}</td><td>{x.stripe.date}</td><td>{x.stripe.name}</td><td style={{ textAlign: 'right' }}>${money(x.stripe.amount)} {x.stripe.currency}</td><td style={{ textAlign: 'right' }}>{x.stripe.cadAmount !== null ? `$${money(x.stripe.cadAmount)}` : ''}</td><td>{x.payment.date} · {x.payment.donor}</td><td style={{ textAlign: 'right' }}>${money(x.payment.amount)} {x.payment.currency}</td></tr>)}</tbody></table>}
      </div>
    </>}
  </div>;
};
