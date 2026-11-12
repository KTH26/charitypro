import React, { useCallback, useEffect, useState } from 'react';
import { HandCoins } from 'lucide-react';
import { startLiveRefresh } from '../utils/liveUpdates';
import { OnlinePaymentForm } from './OnlinePaymentForm';
import type { CallRecord } from './CallDetailsModal';

const money = (value: number) => `$${Number(value || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };

/** Dashboard box: donors we have to pick up money from. Click a name to enter what he gave. */
export const PickupsBox: React.FC = () => {
  const [items, setItems] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [collecting, setCollecting] = useState<CallRecord | null>(null);
  const [notice, setNotice] = useState('');

  const load = useCallback(async (silent = false) => {
    try {
      const response = await fetch('/api/v3/pickups');
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load pickups.');
      setItems(data.items || []); setError('');
    } catch (reason: any) { if (!silent) setError(reason.message || 'Unable to load pickups.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => startLiveRefresh(() => void load(true)), [load]);

  const update = async (item: CallRecord, data: Record<string, any>) => {
    const response = await fetch(`/api/v3/records/donorContacts/${encodeURIComponent(item.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ revision: item.revision, data }) });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || 'Unable to update the pickup.');
  };
  const remove = async (item: CallRecord) => {
    if (!window.confirm(`Take ${item.donorName} off the pickup list without entering a payment?`)) return;
    try { await update(item, { pickupStatus: 'cancelled' }); await load(true); } catch (reason: any) { setError(reason.message); }
  };

  return <section className="card loans-box" style={{ padding: 0, overflow: 'hidden', marginTop: 18 }}>
    <div className="loans-box-header"><div>
      <h2 style={{ margin: 0, color: 'var(--navy)', fontSize: 19, display: 'flex', alignItems: 'center', gap: 8 }}><HandCoins size={20} /> Money to Pick Up</h2>
      <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>{items.length ? `${items.length} donor${items.length === 1 ? '' : 's'} · click a name to enter what he gave` : 'Nothing to pick up'}</div>
    </div><a href="/tracker" className="btn btn-secondary btn-sm">Open Tracker</a></div>
    {error && <div style={{ padding: '12px 22px', color: 'var(--red)', fontWeight: 700 }}>{error}</div>}
    {notice && <div style={{ padding: '12px 22px', color: 'var(--green)', fontWeight: 800 }}>{notice}</div>}
    {loading ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
      : items.length === 0 ? <div style={{ padding: 26, textAlign: 'center', color: 'var(--text-muted)' }}>When a donor says “come pick it up”, record the call in the Tracker and choose “Pick up money”. He will show here.</div>
      : <div className="loans-box-scroll"><table className="loans-table">
        <thead><tr><th>Donor</th><th>Address</th><th style={{ textAlign: 'right' }}>Amount</th><th>Pick up on</th><th></th></tr></thead>
        <tbody>{items.map(item => {
          const late = item.pickupDate && item.pickupDate < today();
          return <tr key={item.id}>
            <td><button type="button" className="link-button" onClick={() => { setCollecting(item); setNotice(''); }}>{item.donorName}</button>{item.donorPhone && <small style={{ display: 'block', color: 'var(--text-muted)' }}>{item.donorPhone}</small>}</td>
            <td>{item.pickupAddress || item.donorAddress || '—'}</td>
            <td style={{ textAlign: 'right', fontWeight: 800, whiteSpace: 'nowrap' }}>{item.pickupAmount ? money(item.pickupAmount) : '—'}</td>
            <td style={{ whiteSpace: 'nowrap', color: late ? 'var(--red)' : undefined, fontWeight: late ? 800 : undefined }}>{item.pickupDate || 'Any time'}</td>
            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><button className="btn btn-primary btn-sm" onClick={() => { setCollecting(item); setNotice(''); }}>Picked up</button> <button className="btn btn-ghost btn-sm" onClick={() => void remove(item)}>Remove</button></td>
          </tr>;
        })}</tbody>
      </table></div>}
    {collecting && <div className="modal-overlay" onClick={() => setCollecting(null)}><div onClick={event => event.stopPropagation()} style={{ width: 'min(900px,94vw)', maxHeight: '92vh', overflowY: 'auto' }}>
      <OnlinePaymentForm donor={{ id: collecting.donorId, name: collecting.donorName }} defaultAmount={collecting.pickupAmount || undefined} onCancel={() => setCollecting(null)} onCreated={async (_status, payment) => {
        const item = collecting; setCollecting(null);
        try { await update(item, { pickupStatus: 'done', pickupCollectedDate: today(), ...(payment?.id ? { pickupPaymentId: String(payment.id) } : {}) }); setNotice(`Payment from ${item.donorName} saved and taken off the pickup list.`); }
        catch { setNotice(`Payment from ${item.donorName} saved. Click “Remove” to take him off the list.`); }
        await load(true);
      }} />
    </div></div>}
  </section>;
};
