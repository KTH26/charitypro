import React, { useCallback, useEffect, useState } from 'react';
import { CreditCard, Pause, Play, Star, Trash2 } from 'lucide-react';

type PaymentMethod = {
  id: string;
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  cardholderName?: string;
  priority: number;
  isDefault: boolean;
  status: 'active' | 'paused';
  revision: number;
};

export const CloudPaymentMethods: React.FC<{ donorId: string }> = ({ donorId }) => {
  const [items, setItems] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/v3/donors/${encodeURIComponent(donorId)}/payment-methods`, { signal });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to load saved cards.');
      setItems(result.items);
      setError('');
    } catch (reason: any) {
      if (reason.name !== 'AbortError') setError(reason.message || 'Unable to load saved cards.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [donorId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const update = async (item: PaymentMethod, changes: Partial<PaymentMethod>) => {
    setWorkingId(item.id); setError('');
    try {
      const response = await fetch(`/api/v3/donors/${encodeURIComponent(donorId)}/payment-methods/${encodeURIComponent(item.id)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ revision: item.revision, ...changes }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to update this card.');
      await load();
    } catch (reason: any) { setError(reason.message || 'Unable to update this card.'); }
    finally { setWorkingId(''); }
  };

  const remove = async (item: PaymentMethod) => {
    if (!window.confirm(`Remove ${item.brand} ending in ${item.last4}?`)) return;
    setWorkingId(item.id); setError('');
    try {
      const response = await fetch(`/api/v3/donors/${encodeURIComponent(donorId)}/payment-methods/${encodeURIComponent(item.id)}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ revision: item.revision }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to remove this card.');
      await load();
    } catch (reason: any) { setError(reason.message || 'Unable to remove this card.'); }
    finally { setWorkingId(''); }
  };

  if (loading) return <div style={{ padding: 30, textAlign: 'center' }}>Loading saved cards...</div>;
  return <div>
    <div style={{ marginBottom: 14, color: 'var(--text-muted)', fontSize: 13 }}>Only masked card details are shown. Private gateway tokens never appear on this screen.</div>
    {error ? <div role="alert" style={{ color: 'var(--red)', fontWeight: 700, marginBottom: 14 }}>{error}</div> : null}
    <div style={{ display: 'grid', gap: 12 }}>{items.map(item => {
      const busy = workingId === item.id;
      return <div key={item.id} style={{ padding: 16, border: `1px solid ${item.isDefault ? 'var(--navy-light)' : 'var(--border)'}`, borderRadius: 12, background: 'var(--bg-input)', display: 'flex', alignItems: 'center', gap: 14 }}>
        <CreditCard size={28} color="var(--navy-light)" aria-hidden="true" />
        <div style={{ flex: 1 }}><div style={{ fontWeight: 800 }}>{item.brand} •••• {item.last4} {item.isDefault ? <span className="badge badge-green">Default</span> : null}</div><div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Expires {String(item.expiryMonth).padStart(2, '0')}/{item.expiryYear} · Priority {item.priority} · {item.status === 'active' ? 'Active' : 'Paused'}</div></div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {!item.isDefault ? <button type="button" className="btn btn-secondary btn-sm" disabled={busy || item.status !== 'active'} onClick={() => void update(item, { isDefault: true })}><Star size={14} /> Make Default</button> : null}
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy || item.isDefault} onClick={() => void update(item, { status: item.status === 'active' ? 'paused' : 'active' })}>{item.status === 'active' ? <Pause size={14} /> : <Play size={14} />} {item.status === 'active' ? 'Pause' : 'Activate'}</button>
          <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} disabled={busy} onClick={() => void remove(item)}><Trash2 size={14} /> Remove</button>
        </div>
      </div>;
    })}{items.length === 0 ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>No tokenized cards are saved for this donor yet.</div> : null}</div>
  </div>;
};
