import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, CreditCard, RotateCcw } from 'lucide-react';
import { startLiveRefresh } from '../utils/liveUpdates';

type Declined = { id: string; revision: number; donorId?: string; donorName?: string; title: string; notes?: string; dueDate: string; completed?: boolean; completedAt?: string; paymentAmount?: number; paymentCurrency?: string; paymentType?: string };

const money = (value: number, currency = 'CAD') => `${currency} $${Number(value || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const monthName = (month: string) => new Intl.DateTimeFormat('en-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
const niceDate = (date: string) => date ? new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`)) : '';

/** Sola page: declined / not received card payments to follow up. Mark one Solved and it leaves the list. These are not tasks, so they never fill the bell. */
export const SolaDeclinedPayments: React.FC = () => {
  const [items, setItems] = useState<Declined[]>([]);
  const [show, setShow] = useState<'open' | 'solved'>('open');
  const [month, setMonth] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const all: Declined[] = [];
      for (let page = 1; page <= 20; page++) {
        const response = await fetch(`/api/v3/tasks?taskType=declined_payment&status=${show === 'open' ? 'pending' : 'completed'}&limit=100&page=${page}`);
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Could not load declined payments.');
        all.push(...(data.items || []));
        if (page >= Number(data.totalPages || 1)) break;
      }
      setItems(all); setError('');
    } catch (reason: any) { setError(reason.message || 'Could not load declined payments.'); }
    finally { setLoading(false); }
  }, [show]);
  useEffect(() => { setLoading(true); void load(); }, [load]);
  useEffect(() => startLiveRefresh(() => void load()), [load]);

  const months = useMemo(() => [...new Set(items.map(item => String(item.dueDate || '').slice(0, 7)).filter(Boolean))].sort().reverse(), [items]);
  const visible = items.filter(item => !month || String(item.dueDate || '').startsWith(month)).sort((a, b) => String(b.dueDate).localeCompare(String(a.dueDate)) || String(a.donorName || '').localeCompare(String(b.donorName || '')));
  const totals = visible.reduce<Record<string, number>>((sum, item) => item.paymentAmount ? { ...sum, [item.paymentCurrency || 'CAD']: (sum[item.paymentCurrency || 'CAD'] || 0) + item.paymentAmount } : sum, {});

  const setSolved = async (item: Declined, solved: boolean) => {
    setBusy(item.id); setError('');
    try {
      const response = await fetch(`/api/v3/records/tasks/${encodeURIComponent(item.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ revision: item.revision, data: solved ? { completed: true, completedAt: new Date().toISOString() } : { completed: false, completedAt: null } }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not save.');
      setItems(current => current.filter(row => row.id !== item.id));
    } catch (reason: any) { setError(reason.message || 'Could not save.'); await load(); }
    finally { setBusy(''); }
  };

  return <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
    <div style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
      <div>
        <h2 style={{ margin: 0, color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: 8 }}><CreditCard size={20} /> Declined Payments{show === 'open' ? ` (${items.length} to follow up)` : ' (solved)'}</h2>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 3 }}>Card payments that were declined or did not come in. Follow up, then click Solved and it leaves the list.{Object.keys(totals).length ? ` Total: ${Object.entries(totals).map(([currency, total]) => money(total, currency)).join(' · ')}` : ''}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={month} onChange={event => setMonth(event.target.value)} aria-label="Month">
          <option value="">All months</option>
          {months.map(value => <option key={value} value={value}>{monthName(value)} ({items.filter(item => item.dueDate?.startsWith(value)).length})</option>)}
        </select>
        <div className="segmented" style={{ display: 'flex', gap: 4 }}>
          <button type="button" className={`btn btn-sm ${show === 'open' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setShow('open'); setMonth(''); }}>To follow up</button>
          <button type="button" className={`btn btn-sm ${show === 'solved' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setShow('solved'); setMonth(''); }}>Solved</button>
        </div>
      </div>
    </div>
    {error && <div style={{ padding: '10px 18px', color: 'var(--red)', fontWeight: 600 }}>{error}</div>}
    {loading ? <div style={{ padding: 18, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
      : visible.length === 0 ? <div style={{ padding: 18, textAlign: 'center', color: show === 'open' ? 'var(--green)' : 'var(--text-muted)', fontWeight: 600 }}>{show === 'open' ? 'No declined payments to follow up.' : 'Nothing solved yet.'}</div>
      : <div className="table-container" style={{ maxHeight: 420, overflow: 'auto' }}><table>
        <thead><tr><th>Date</th><th>Donor</th><th>What happened</th><th style={{ textAlign: 'right' }}>Amount</th><th></th></tr></thead>
        <tbody>{visible.map(item => <tr key={item.id}>
          <td style={{ whiteSpace: 'nowrap' }}>{niceDate(item.dueDate)}</td>
          <td style={{ fontWeight: 600 }}>{item.donorName || 'Unknown donor'}</td>
          <td><div style={{ fontWeight: 600 }}>{item.title === 'Sola payment not received' ? 'Did not come in' : 'Declined'}{item.paymentType === 'approved' ? <span style={{ color: 'var(--green)', marginLeft: 6 }}>· paid since</span> : null}</div>{item.notes ? <small style={{ color: 'var(--text-muted)' }}>{item.notes}</small> : null}</td>
          <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>{item.paymentAmount ? money(item.paymentAmount, item.paymentCurrency) : '—'}</td>
          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{show === 'open'
            ? <button type="button" className="btn btn-sm btn-secondary" disabled={busy === item.id} onClick={() => void setSolved(item, true)}><Check size={14} /> Solved</button>
            : <button type="button" className="btn btn-sm btn-ghost" disabled={busy === item.id} title="Put it back on the follow-up list" onClick={() => void setSolved(item, false)}><RotateCcw size={14} /> Undo</button>}</td>
        </tr>)}</tbody>
      </table></div>}
  </section>;
};
