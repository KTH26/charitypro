import React, { useMemo, useState } from 'react';
import { CreditCard, Download, X } from 'lucide-react';
import { DonorPicker, type PickedDonor } from './DonorPicker';

type SavedCard = { paymentMethodId: string; customerId: string; name: string; email: string; phone: string; brand: string; last4: string; expiryMonth: number; expiryYear: number; expired: boolean; donorId: string; donorName: string; matchedBy: string; alreadyInCharityPro: boolean };

/** The cards saved in Sola: check which donor each belongs to, then bring them into the donors' profiles to charge from CharityPro. */
export const SolaSavedCards: React.FC = () => {
  const [items, setItems] = useState<SavedCard[] | null>(null); const [loading, setLoading] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const [chosen, setChosen] = useState<Record<string, PickedDonor | null>>({}); const [filter, setFilter] = useState<'todo' | 'all'>('todo'); const [editing, setEditing] = useState('');
  const load = async () => {
    setLoading(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/v3/sola/saved-cards/preview', { method: 'POST' }); const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not read the saved cards from Sola.');
      setItems(data.items || []); setChosen(Object.fromEntries((data.items || []).filter((item: SavedCard) => item.donorId).map((item: SavedCard) => [item.paymentMethodId, { id: item.donorId, name: item.donorName }])));
    } catch (reason: any) { setError(reason.message); } finally { setLoading(false); }
  };
  const ready = useMemo(() => (items || []).filter(item => !item.alreadyInCharityPro && !item.expired && chosen[item.paymentMethodId]), [items, chosen]);
  const shown = (items || []).filter(item => filter === 'all' || (!item.alreadyInCharityPro && !item.expired));
  const bringIn = async () => {
    if (!ready.length) return; setLoading(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/v3/sola/saved-cards/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: ready.map(item => ({ paymentMethodId: item.paymentMethodId, donorId: chosen[item.paymentMethodId]!.id })) }) });
      const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || 'The cards were not saved.');
      setMessage(`${data.imported} card${data.imported === 1 ? '' : 's'} added to the donors' profiles${data.skipped ? `, ${data.skipped} already there or expired` : ''}.${data.errors?.length ? ` Not saved: ${data.errors.join('; ')}` : ''}`);
      setItems(current => (current || []).map(item => ready.some(done => done.paymentMethodId === item.paymentMethodId) ? { ...item, alreadyInCharityPro: true } : item));
    } catch (reason: any) { setError(reason.message); } finally { setLoading(false); }
  };
  if (!items) return <section className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
    <CreditCard size={18} /><div style={{ flex: 1, minWidth: 220 }}><strong>Saved cards in Sola</strong><div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Bring the cards saved in Sola into the donors' profiles, so you can charge them from CharityPro without asking for the card again.</div></div>
    <button className="btn btn-secondary" disabled={loading} onClick={() => void load()}><Download size={15} /> {loading ? 'Reading Sola…' : 'Bring saved cards from Sola'}</button>
    {error && <div className="pay-error" style={{ width: '100%' }}>{error}</div>}
  </section>;
  const counts = { all: items.length, done: items.filter(item => item.alreadyInCharityPro).length, expired: items.filter(item => item.expired && !item.alreadyInCharityPro).length };
  return <section className="card">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div><h2 style={{ margin: 0 }}>Saved cards in Sola ({counts.all})</h2><small style={{ color: 'var(--text-muted)' }}>{counts.done} already in CharityPro · {counts.expired} expired (not brought in) · check the donor of each card, then press the button.</small></div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={filter} onChange={event => setFilter(event.target.value as 'todo' | 'all')}><option value="todo">Still to bring in</option><option value="all">All cards</option></select>
        <button className="btn btn-primary" disabled={loading || !ready.length} onClick={() => void bringIn()}>{loading ? 'Saving…' : `Bring in ${ready.length} card${ready.length === 1 ? '' : 's'}`}</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setItems(null)}><X size={14} /> Close</button>
      </div>
    </div>
    {error && <div className="pay-error" style={{ marginTop: 10 }}>{error}</div>}
    {message && <div style={{ marginTop: 10, color: 'var(--green)', fontWeight: 600 }}>{message}</div>}
    <div className="table-container" style={{ marginTop: 10, maxHeight: 520, overflow: 'auto' }}><table>
      <thead><tr><th>Name in Sola</th><th>Card</th><th>Phone</th><th style={{ minWidth: 320 }}>Donor in CharityPro</th><th>Found by</th><th>Status</th></tr></thead>
      <tbody>{shown.map(item => <tr key={item.paymentMethodId} style={{ opacity: item.alreadyInCharityPro || item.expired ? 0.6 : 1 }}>
        <td><strong>{item.name || '—'}</strong>{item.email && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.email}</div>}</td>
        <td>{item.brand} ••••{item.last4}<div style={{ fontSize: 12, color: item.expired ? 'var(--red)' : 'var(--text-muted)' }}>exp {String(item.expiryMonth).padStart(2, '0')}/{String(item.expiryYear).slice(-2)}</div></td>
        <td>{item.phone || '—'}</td>
        <td>{item.alreadyInCharityPro ? (item.donorName || '—') : editing !== item.paymentMethodId && chosen[item.paymentMethodId]
          ? <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span>{chosen[item.paymentMethodId]!.name}</span><button className="btn btn-ghost btn-sm" onClick={() => setEditing(item.paymentMethodId)}>Change</button><button className="btn btn-ghost btn-sm" title="Not this donor" onClick={() => setChosen(current => ({ ...current, [item.paymentMethodId]: null }))}><X size={13} /></button></div>
          : editing === item.paymentMethodId || !chosen[item.paymentMethodId] ? (editing === item.paymentMethodId ? <DonorPicker value={null} autoFocus onChange={donor => { setChosen(current => ({ ...current, [item.paymentMethodId]: donor })); if (donor) setEditing(''); }} /> : <button className="btn btn-secondary btn-sm" onClick={() => setEditing(item.paymentMethodId)}>Choose donor</button>) : null}</td>
        <td>{chosen[item.paymentMethodId]?.id === item.donorId && item.matchedBy ? item.matchedBy : chosen[item.paymentMethodId] ? 'you' : '—'}</td>
        <td style={{ fontWeight: 600, color: item.alreadyInCharityPro ? 'var(--green)' : item.expired ? 'var(--red)' : 'var(--text-muted)' }}>{item.alreadyInCharityPro ? 'In CharityPro' : item.expired ? 'Expired' : chosen[item.paymentMethodId] ? 'Ready' : 'Choose the donor'}</td>
      </tr>)}{!shown.length && <tr><td colSpan={6} style={{ color: 'var(--text-muted)' }}>Nothing left to bring in.</td></tr>}</tbody>
    </table></div>
  </section>;
};
