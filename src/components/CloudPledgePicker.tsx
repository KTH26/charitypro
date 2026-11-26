import React, { useEffect, useState } from 'react';

export type PledgeChoice = {
  id: string;
  date: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  currency?: string;
  paid: number;
  pending: number;
  scheduled: number;
  balance: number;
  category?: string;
  notes?: string;
};

const money = (value: number) => Number(value || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const CloudPledgePicker: React.FC<{
  donorId: string;
  /** Not used to choose a pledge: a payment pays a pledge only when one is chosen here. */
  paymentDate?: string;
  value: string;
  onChange: (pledgeId: string) => void;
  label?: string;
  disabled?: boolean;
}> = ({ donorId, value, onChange, label = 'Apply to pledge', disabled = false }) => {
  const [items, setItems] = useState<PledgeChoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!donorId) { setItems([]); setError(''); return; }
    const controller = new AbortController();
    setLoading(true); setError('');
    fetch(`/api/v3/donors/${encodeURIComponent(donorId)}/pledge-choices?limit=100`, { signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load this donor’s pledges.');
        setItems(data.items || []);
      })
      .catch((reason: any) => { if (reason.name !== 'AbortError') setError(reason.message || 'Unable to load pledges.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [donorId]);

  return <label className="form-group" style={{ margin: 0 }}>
    <span>{label}</span>
    <select value={value || ''} onChange={event => onChange(event.target.value)} disabled={disabled || loading || !donorId}>
      <option value="">{loading ? 'Loading donor pledges…' : 'No pledge (a plain donation)'}</option>
      {items.map(item => <option key={item.id} value={item.id}>
        {item.date} · {item.currency || 'CAD'} ${money(item.amount)} · paid ${money(item.paid)} · pending ${money(item.pending)} · scheduled ${money(item.scheduled)} · balance ${money(item.balance)}
      </option>)}
    </select>
    {error && <small style={{ color: 'var(--red)' }}>{error}</small>}
  </label>;
};
