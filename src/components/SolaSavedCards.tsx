import React, { useMemo, useState } from 'react';
import { CreditCard, Download, Eye, EyeOff, X } from 'lucide-react';
import { DonorPicker, type PickedDonor } from './DonorPicker';

type SavedCard = { paymentMethodId: string; customerId: string; name: string; email: string; phone: string; brand: string; last4: string; expiryMonth: number; expiryYear: number; expired: boolean; donorId: string; donorName: string; matchedBy: string; alreadyInCharityPro: boolean; hidden?: boolean; sameCardIds?: string[] };
type Filter = 'todo' | 'all' | 'in' | 'expired' | 'hidden';

/**
 * The cards saved in Sola: check which donor each belongs to, then bring them into the donors' profiles to charge from CharityPro.
 * Cards not needed can be hidden: they stay in Sola untouched, and come off the donor's profile in CharityPro.
 */
export const SolaSavedCards: React.FC = () => {
  const [items, setItems] = useState<SavedCard[] | null>(null); const [loading, setLoading] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const [chosen, setChosen] = useState<Record<string, PickedDonor | null>>({}); const [filter, setFilter] = useState<Filter>('todo'); const [editing, setEditing] = useState('');
  const [ticked, setTicked] = useState<string[]>([]); const [search, setSearch] = useState('');
  const load = async (keepMessage = false) => {
    setLoading(true); setError(''); if (!keepMessage) setMessage('');
    try {
      const response = await fetch('/api/v3/sola/saved-cards/preview', { method: 'POST' }); const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not read the saved cards from Sola.');
      setItems(data.items || []); setTicked([]); setChosen(Object.fromEntries((data.items || []).filter((item: SavedCard) => item.donorId).map((item: SavedCard) => [item.paymentMethodId, { id: item.donorId, name: item.donorName }])));
    } catch (reason: any) { setError(reason.message); } finally { setLoading(false); }
  };
  const ready = useMemo(() => (items || []).filter(item => !item.hidden && !item.alreadyInCharityPro && chosen[item.paymentMethodId]), [items, chosen]);
  const words = search.trim().toLowerCase();
  const shown = (items || []).filter(item => (filter === 'hidden' ? item.hidden : !item.hidden && (filter === 'all' || (filter === 'todo' ? !item.alreadyInCharityPro : filter === 'in' ? item.alreadyInCharityPro : item.expired && !item.alreadyInCharityPro)))
    && (!words || `${item.name} ${item.email} ${item.phone} ${item.last4} ${chosen[item.paymentMethodId]?.name || item.donorName}`.toLowerCase().includes(words)));
  const bringIn = async () => {
    if (!ready.length) return; setLoading(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/v3/sola/saved-cards/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: ready.map(item => ({ paymentMethodId: item.paymentMethodId, donorId: chosen[item.paymentMethodId]!.id })) }) });
      const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || 'The cards were not saved.');
      setMessage(`${data.imported} card${data.imported === 1 ? '' : 's'} added to the donors' profiles${data.skipped ? `, ${data.skipped} already there` : ''}.${data.errors?.length ? ` Not saved: ${data.errors.join('; ')}` : ''}`);
      setLoading(false); await load(true); // show what is really saved now
      return;
    } catch (reason: any) { setError(reason.message); } finally { setLoading(false); }
  };
  /** Hide (or show again) cards. Hidden cards stay in Sola; in CharityPro they come off the donor's profile. */
  const copiesOf = (rows: string[]) => [...new Set(rows.flatMap(id => (items || []).find(item => item.paymentMethodId === id)?.sameCardIds || [id]))];
  const setHidden = async (rows: string[], hidden: boolean) => {
    if (!rows.length) return; const ids = copiesOf(rows);
    const inProfiles = (items || []).filter(item => rows.includes(item.paymentMethodId) && item.alreadyInCharityPro).length;
    if (hidden && !confirm(`Hide ${rows.length} card${rows.length === 1 ? '' : 's'}?\n\nThey stay in Sola untouched.${inProfiles ? `\n${inProfiles} of them ${inProfiles === 1 ? 'is' : 'are'} in a donor's profile in CharityPro and will be taken off it (you can bring ${inProfiles === 1 ? 'it' : 'them'} in again later).` : ''}`)) return;
    setLoading(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/v3/sola/saved-cards/hide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paymentMethodIds: ids, hidden }) });
      const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || 'Not saved.');
      const blocked: string[] = data.blocked || [];
      setItems(current => (current || []).map(item => !rows.includes(item.paymentMethodId) || (item.sameCardIds || [item.paymentMethodId]).some(id => blocked.includes(id)) ? item : { ...item, hidden, ...(hidden ? { alreadyInCharityPro: false } : {}) }));
      setTicked([]);
      setMessage(hidden ? `${rows.length - blocked.length > 0 ? rows.length : 0} card${rows.length === 1 ? '' : 's'} hidden${data.removedFromProfiles ? `, ${data.removedFromProfiles} taken off donors' profiles` : ''}.${blocked.length ? ` ${blocked.length} not hidden: a CharityPro schedule charges ${blocked.length === 1 ? 'that card' : 'those cards'} – change the schedule first.` : ''}` : `${rows.length} card${rows.length === 1 ? '' : 's'} shown again.`);
    } catch (reason: any) { setError(reason.message); } finally { setLoading(false); }
  };
  const tick = (id: string) => setTicked(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  const allTicked = shown.length > 0 && shown.every(item => ticked.includes(item.paymentMethodId));

  if (!items) return <section className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
    <CreditCard size={18} /><div style={{ flex: 1, minWidth: 220 }}><strong>Saved cards in Sola</strong><div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Bring the cards saved in Sola into the donors' profiles, so you can charge them from CharityPro without asking for the card again. Nothing is charged when you bring them in.</div></div>
    <button className="btn btn-secondary" disabled={loading} onClick={() => void load()}><Download size={15} /> {loading ? 'Reading Sola…' : 'Bring saved cards from Sola'}</button>
    {error && <div className="pay-error" style={{ width: '100%' }}>{error}</div>}
  </section>;
  const visible = items.filter(item => !item.hidden);
  const counts = { all: visible.length, todo: visible.filter(item => !item.alreadyInCharityPro).length, in: visible.filter(item => item.alreadyInCharityPro).length, expired: visible.filter(item => item.expired && !item.alreadyInCharityPro).length, hidden: items.length - visible.length };
  return <section className="card">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div><h2 style={{ margin: 0 }}>Saved cards in Sola ({counts.all})</h2><small style={{ color: 'var(--text-muted)' }}>{counts.todo} still to bring in · {counts.in} already in CharityPro · {counts.hidden} hidden · expired cards can be brought in too · nothing is charged when you bring cards in.</small></div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input placeholder="Search name, phone, last 4…" value={search} onChange={event => setSearch(event.target.value)} style={{ width: 200 }} />
        <select value={filter} onChange={event => { setFilter(event.target.value as Filter); setTicked([]); }}>
          <option value="todo">Still to bring in ({counts.todo})</option><option value="in">In CharityPro ({counts.in})</option><option value="expired">Expired ({counts.expired})</option><option value="all">All cards ({counts.all})</option><option value="hidden">Hidden ({counts.hidden})</option>
        </select>
        {filter !== 'hidden' && <button className="btn btn-primary" disabled={loading || !ready.length} onClick={() => void bringIn()}>{loading ? 'Saving…' : `Bring in ${ready.length} card${ready.length === 1 ? '' : 's'}`}</button>}
        {ticked.length > 0 && (filter === 'hidden'
          ? <button className="btn btn-secondary" disabled={loading} onClick={() => void setHidden(ticked, false)}><Eye size={15} /> Show {ticked.length} again</button>
          : <button className="btn btn-danger" disabled={loading} onClick={() => void setHidden(ticked, true)}><EyeOff size={15} /> Hide {ticked.length} chosen</button>)}
        <button className="btn btn-ghost btn-sm" onClick={() => setItems(null)}><X size={14} /> Close</button>
      </div>
    </div>
    {error && <div className="pay-error" style={{ marginTop: 10 }}>{error}</div>}
    {message && <div style={{ marginTop: 10, color: 'var(--green)', fontWeight: 600 }}>{message}</div>}
    <div className="table-container" style={{ marginTop: 10, maxHeight: 520, overflow: 'auto' }}><table>
      <thead><tr><th style={{ width: 32 }}><input type="checkbox" checked={allTicked} title="Choose all shown" onChange={() => setTicked(allTicked ? [] : shown.map(item => item.paymentMethodId))} /></th><th>Name in Sola</th><th>Card</th><th>Phone</th><th style={{ minWidth: 320 }}>Donor in CharityPro</th><th>Found by</th><th>Status</th><th /></tr></thead>
      <tbody>{shown.map(item => <tr key={item.paymentMethodId} style={{ opacity: item.hidden || item.alreadyInCharityPro ? 0.65 : 1 }}>
        <td><input type="checkbox" checked={ticked.includes(item.paymentMethodId)} onChange={() => tick(item.paymentMethodId)} /></td>
        <td><strong>{item.name || '—'}</strong>{item.email && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.email}</div>}</td>
        <td>{item.brand} ••••{item.last4}<div style={{ fontSize: 12, color: item.expired ? 'var(--red)' : 'var(--text-muted)' }}>exp {String(item.expiryMonth).padStart(2, '0')}/{String(item.expiryYear).slice(-2)}</div></td>
        <td>{item.phone || '—'}</td>
        <td>{item.hidden ? '—' : item.alreadyInCharityPro ? (item.donorName || '—') : editing !== item.paymentMethodId && chosen[item.paymentMethodId]
          ? <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span>{chosen[item.paymentMethodId]!.name}</span><button className="btn btn-ghost btn-sm" onClick={() => setEditing(item.paymentMethodId)}>Change</button><button className="btn btn-ghost btn-sm" title="Not this donor" onClick={() => setChosen(current => ({ ...current, [item.paymentMethodId]: null }))}><X size={13} /></button></div>
          : editing === item.paymentMethodId ? <DonorPicker value={null} autoFocus onChange={donor => { setChosen(current => ({ ...current, [item.paymentMethodId]: donor })); if (donor) setEditing(''); }} /> : <button className="btn btn-secondary btn-sm" onClick={() => setEditing(item.paymentMethodId)}>Choose donor</button>}</td>
        <td>{item.hidden ? '' : chosen[item.paymentMethodId]?.id === item.donorId && item.matchedBy ? item.matchedBy : chosen[item.paymentMethodId] ? 'you' : '—'}</td>
        <td style={{ fontWeight: 600, color: item.hidden ? 'var(--text-muted)' : item.alreadyInCharityPro ? 'var(--green)' : item.expired ? 'var(--red)' : 'var(--text-muted)' }}>{item.hidden ? 'Hidden' : item.alreadyInCharityPro ? 'In CharityPro' : chosen[item.paymentMethodId] ? (item.expired ? 'Ready (expired card)' : 'Ready') : 'Choose the donor'}</td>
        <td>{item.hidden
          ? <button className="btn btn-ghost btn-sm" disabled={loading} onClick={() => void setHidden([item.paymentMethodId], false)} title="Show this card again"><Eye size={14} /> Show</button>
          : <button className="btn btn-ghost btn-sm" disabled={loading} onClick={() => void setHidden([item.paymentMethodId], true)} title="Hide this card (it stays in Sola)"><EyeOff size={14} /> Hide</button>}</td>
      </tr>)}{!shown.length && <tr><td colSpan={8} style={{ color: 'var(--text-muted)' }}>No cards here.</td></tr>}</tbody>
    </table></div>
  </section>;
};
