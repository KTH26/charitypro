import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileCheck2, Send, Settings2 } from 'lucide-react';
import { startLiveRefresh } from '../utils/liveUpdates';

type Waiting = { paymentId: string; donorId: string; donorName: string; email: string; amount: number; date: string; method: string; receiptNumber: string; error: string };
type Receipt = { id: string; paymentId: string; receiptNumber: string; donorName: string; amount: number; giftDate: string; method: string; status: string; sentTo?: string; sentAt?: string; error?: string; voidReason?: string; voidedAt?: string };
type Tab = 'waiting' | 'sent' | 'failed' | 'void';
const METHODS: Record<string, string> = { credit_card: 'Credit card', check: 'Check', e_transfer: 'E-Transfer', wire: 'Wire', ach: 'ACH', cash: 'Cash', vouchers: 'Vouchers', eizer: 'Eizer', bnei_leivy: 'Bnei Leivy', other: 'Other' };
const money = (value: number) => '$' + Number(value || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Open the receipt PDF in a new tab (to look at it or print it). */
const openPdf = async (paymentId: string, voidNumber = '') => {
  const tab = window.open('', '_blank');
  const response = await fetch(`/api/v3/receipts/${encodeURIComponent(paymentId)}/pdf${voidNumber ? `?void=${encodeURIComponent(voidNumber)}` : ''}`);
  if (!response.ok) { tab?.close(); alert('Unable to open the receipt.'); return; }
  const url = URL.createObjectURL(await response.blob());
  if (tab) tab.location.href = url; else window.open(url, '_blank');
};

/** Settings for receipts: automatic sending, next number, which payment methods, email text. */
const ReceiptSettingsBox: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [data, setData] = useState<any>(null); const [nextNumber, setNextNumber] = useState(''); const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { fetch('/api/v3/receipts/settings').then(response => response.json()).then(result => { if (result.success) { setData(result); setNextNumber(result.nextNumber); } else setMessage({ ok: false, text: result.error }); }).catch(() => undefined); }, []);
  if (!data) return <section className="card">Loading…{message && <div className="pay-error">{message.text}</div>}</section>;
  const set = (key: string, value: any) => setData((current: any) => ({ ...current, settings: { ...current.settings, [key]: value } }));
  const save = async () => {
    setMessage(null);
    const body: any = { settings: { ...data.settings }, receiptAuto: data.receiptAuto, receiptCc: data.receiptCc || '' };
    if (nextNumber !== data.nextNumber) body.settings.nextNumber = Number(nextNumber);
    const response = await fetch('/api/v3/receipts/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json(); setMessage(result.success ? { ok: true, text: 'Saved.' } : { ok: false, text: result.error });
  };
  const methods: string[] = data.settings.eligibleMethods || [];
  return <section className="card receipt-settings">
    <h2 style={{ margin: 0, color: 'var(--navy)' }}><Settings2 size={18} /> Receipt settings</h2>
    <label className="msg-check"><input type="checkbox" checked={Boolean(data.receiptAuto)} onChange={event => setData((current: any) => ({ ...current, receiptAuto: event.target.checked }))} /> Send receipts by themselves: right after a card is charged or a payment is entered, and when a check is marked deposited</label>
    <small style={{ color: 'var(--text-muted)' }}>Payments that come from imports or the Sola sync are never sent by themselves; they wait in "To send" so you can look first.</small>
    <div className="pay-detail-grid">
      <label className="form-group"><span>Next receipt number</span><input value={nextNumber} onChange={event => setNextNumber(event.target.value.replace(/\D/g, ''))} /><small>Your last paper receipt was 00663? Then type 664.</small></label>
      <label className="form-group"><span>Receipts start from (date)</span><input type="date" value={data.settings.startDate || ''} onChange={event => set('startDate', event.target.value)} /><small>Older payments are not listed.</small></label>
      <label className="form-group"><span>Send a copy of every receipt to (optional)</span><input value={data.receiptCc || ''} onChange={event => setData((current: any) => ({ ...current, receiptCc: event.target.value }))} placeholder="office@example.com" /></label>
    </div>
    <div className="form-group" style={{ margin: 0 }}><span>Payment methods that get a receipt</span><div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>{Object.entries(METHODS).map(([value, label]) => <label key={value} className="msg-check"><input type="checkbox" checked={methods.includes(value)} onChange={event => set('eligibleMethods', event.target.checked ? [...methods, value] : methods.filter(item => item !== value))} /> {label}</label>)}</div></div>
    <label className="form-group" style={{ margin: 0 }}><span>Email subject</span><input value={data.settings.emailSubject} onChange={event => set('emailSubject', event.target.value)} /></label>
    <label className="form-group" style={{ margin: 0 }}><span>Email text (the receipt PDF is attached)</span><textarea rows={6} dir="auto" value={data.settings.emailMessage} onChange={event => set('emailMessage', event.target.value)} /><small>You can use: {'{{donorName}} {{amount}} {{giftDate}} {{receiptNumber}}'}</small></label>
    {message && <div style={{ fontWeight: 700, color: message.ok ? 'var(--green)' : 'var(--red)' }}>{message.text}</div>}
    <div style={{ display: 'flex', gap: 8 }}><button className="btn btn-primary" onClick={() => void save()}>Save</button><button className="btn btn-secondary" onClick={onClose}>Close</button></div>
  </section>;
};

/** Official receipts: who still has to get one, who got one, what failed, what was cancelled. */
export const OnlineReceipts: React.FC = () => {
  const [tab, setTab] = useState<Tab>('waiting');
  const [waiting, setWaiting] = useState<Waiting[]>([]); const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null); const [sending, setSending] = useState(false); const [showSettings, setShowSettings] = useState(false);
  const load = useCallback(async () => {
    const params = new URLSearchParams({ status: tab, search, from, to });
    const response = await fetch(`/api/v3/receipts?${params}`); const data = await response.json();
    if (!response.ok || !data.success) { setMessage({ ok: false, text: data.error || 'Unable to load receipts.' }); return; }
    if (tab === 'waiting') setWaiting(data.items || []); else setReceipts(data.items || []);
  }, [tab, search, from, to]);
  useEffect(() => { setSelected(new Set()); void load(); return startLiveRefresh(() => void load()); }, [load]);

  const send = async (paymentIds: string[], resend = false) => {
    if (!paymentIds.length) return;
    if (paymentIds.length > 1 && !window.confirm(`Email ${paymentIds.length} official receipts now?`)) return;
    setSending(true); setMessage(null);
    try {
      const response = await fetch('/api/v3/receipts/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paymentIds, resend }) });
      const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || 'Not sent.');
      const problems = (data.results || []).filter((item: any) => !item.ok);
      setMessage({ ok: problems.length === 0, text: `${data.sent} receipt${data.sent === 1 ? '' : 's'} sent.${problems.length ? ` Not sent (${problems.length}): ${problems.slice(0, 5).map((item: any) => item.error).join(' · ')}` : ''}` });
      setSelected(new Set()); void load();
    } catch (reason: any) { setMessage({ ok: false, text: reason.message }); } finally { setSending(false); }
  };
  const cancel = async (receipt: Receipt) => {
    const reason = window.prompt(`Cancel (void) receipt #${receipt.receiptNumber} for ${receipt.donorName}? It stays saved as cancelled, and you can send a new one after.\n\nWhy?`);
    if (reason === null) return;
    const response = await fetch(`/api/v3/receipts/${encodeURIComponent(receipt.paymentId)}/void`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
    const data = await response.json(); setMessage(data.success ? { ok: true, text: `Receipt #${receipt.receiptNumber} cancelled. The payment is back in "To send".` } : { ok: false, text: data.error });
    void load();
  };
  const withEmail = useMemo(() => waiting.filter(item => item.email), [waiting]);
  const total = (tab === 'waiting' ? waiting : receipts).reduce((sum, item: any) => sum + Number(item.amount || 0), 0);
  const toggle = (id: string) => setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  return <div style={{ padding: 28, maxWidth: 1300, margin: '0 auto', display: 'grid', gap: 16 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div><div style={{ color: 'var(--green)', fontWeight: 800, fontSize: 13 }}>CHARITYPRO CLOUD</div><h1 style={{ margin: '4px 0', color: 'var(--navy)' }}><FileCheck2 size={24} /> Official Receipts</h1><div style={{ color: 'var(--text-muted)' }}>Tax receipts in the Hatzolah design, sent by email as a PDF. Email must be connected in <Link to="/settings">Settings</Link>.</div></div>
      <button className="btn btn-secondary" onClick={() => setShowSettings(value => !value)}><Settings2 size={15} /> Receipt settings</button>
    </div>
    {showSettings && <ReceiptSettingsBox onClose={() => setShowSettings(false)} />}
    <div className="account-view-tabs">{([['waiting', 'To send'], ['sent', 'Sent'], ['failed', 'Not sent (error)'], ['void', 'Cancelled']] as const).map(([value, label]) => <button key={value} type="button" className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{label}</button>)}</div>
    <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="filter-strip"><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search donor or amount" /><input type="date" value={from} onChange={event => setFrom(event.target.value)} title="From date" /><input type="date" value={to} onChange={event => setTo(event.target.value)} title="To date" /></div>
      {message && <div style={{ padding: '10px 16px', fontWeight: 700, color: message.ok ? 'var(--green)' : 'var(--red)' }}>{message.text}</div>}
      {tab === 'waiting' && <div className="receipt-actions">
        <label className="msg-check"><input type="checkbox" checked={withEmail.length > 0 && withEmail.every(item => selected.has(item.paymentId))} onChange={event => setSelected(event.target.checked ? new Set(withEmail.map(item => item.paymentId)) : new Set())} /> Select all with email ({withEmail.length})</label>
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>{waiting.length} payments · {money(total)}</span>
        <button className="btn btn-primary" disabled={sending || selected.size === 0} onClick={() => void send([...selected])}><Send size={15} /> {sending ? 'Sending…' : `Send ${selected.size || ''} receipt${selected.size === 1 ? '' : 's'}`}</button>
      </div>}
      <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
        {tab === 'waiting' ? <><thead><tr><th /><th>Date</th><th>Donor</th><th>Email</th><th>Paid by</th><th style={{ textAlign: 'right' }}>Amount</th><th /></tr></thead><tbody>
          {waiting.map(item => <tr key={item.paymentId}>
            <td><input type="checkbox" disabled={!item.email} checked={selected.has(item.paymentId)} onChange={() => toggle(item.paymentId)} /></td>
            <td>{item.date}</td><td style={{ fontWeight: 700 }}>{item.donorName}</td>
            <td>{item.email || <span style={{ color: 'var(--red)' }}>No email – add it on the donor</span>}{item.error && <div style={{ color: 'var(--red)', fontSize: 12 }}>Last try: {item.error}</div>}</td>
            <td>{METHODS[item.method] || item.method}</td><td style={{ textAlign: 'right', fontWeight: 800 }}>{money(item.amount)}</td>
            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><button className="btn btn-ghost btn-sm" onClick={() => void openPdf(item.paymentId)}>View</button> <button className="btn btn-secondary btn-sm" disabled={!item.email || sending} onClick={() => void send([item.paymentId])}>Send</button></td>
          </tr>)}
          {waiting.length === 0 && <tr><td colSpan={7} style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>Every payment got its receipt.</td></tr>}
        </tbody></> : <><thead><tr><th>Receipt #</th><th>Date of gift</th><th>Donor</th><th>Paid by</th><th style={{ textAlign: 'right' }}>Amount</th><th>{tab === 'void' ? 'Why cancelled' : tab === 'failed' ? 'Problem' : 'Sent to'}</th><th /></tr></thead><tbody>
          {receipts.map(item => <tr key={item.id}>
            <td style={{ fontWeight: 800 }}>{item.receiptNumber}</td><td>{item.giftDate}</td><td style={{ fontWeight: 700 }}>{item.donorName}</td><td>{METHODS[item.method] || item.method}</td><td style={{ textAlign: 'right', fontWeight: 800 }}>{money(item.amount)}</td>
            <td style={{ fontSize: 13 }}>{tab === 'void' ? `${item.voidReason || '—'} (${String(item.voidedAt || '').slice(0, 10)})` : tab === 'failed' ? <span style={{ color: 'var(--red)' }}>{item.error}</span> : `${item.sentTo || ''} · ${String(item.sentAt || '').slice(0, 10)}`}</td>
            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><button className="btn btn-ghost btn-sm" onClick={() => void openPdf(item.paymentId, tab === 'void' ? item.receiptNumber : '')}>View</button>{tab !== 'void' && <> <button className="btn btn-secondary btn-sm" disabled={sending} onClick={() => void send([item.paymentId], true)}>{tab === 'failed' ? 'Try again' : 'Send again'}</button> <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => void cancel(item)}>Cancel</button></>}</td>
          </tr>)}
          {receipts.length === 0 && <tr><td colSpan={7} style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>Nothing here.</td></tr>}
        </tbody></>}
      </table></div>
    </section>
  </div>;
};
