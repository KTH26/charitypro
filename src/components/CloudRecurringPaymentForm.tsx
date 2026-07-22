import React, { useRef, useState } from 'react';

type Donor = { id: string; name: string };

export const CloudRecurringPaymentForm: React.FC<{
  donor: Donor;
  onCancel: () => void;
  onCreated: (schedule: Record<string, any>) => void;
}> = ({ donor, onCancel, onCreated }) => {
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'CAD' | 'USD'>('CAD');
  const [frequency, setFrequency] = useState('monthly');
  const [method, setMethod] = useState('credit_card');
  const [nextDate, setNextDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef('');

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || !nextDate) {
      setError('Enter a positive amount and the next payment date.');
      return;
    }
    const key = requestId.current || crypto.randomUUID();
    requestId.current = key;
    setSaving(true);
    setError('');
    try {
      const data = { donorId: donor.id, amount: parsedAmount, currency, frequency, method, nextDate, ...(endDate ? { endDate } : {}), active: true };
      const response = await fetch('/api/v3/records/recurringPayments', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify({ data })
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to save recurring payment.');
      requestId.current = '';
      onCreated({ ...result.item, donorName: donor.name });
    } catch (reason: any) {
      requestId.current = '';
      setError(reason.message || 'Unable to save recurring payment. You can safely try again.');
    } finally { setSaving(false); }
  };

  return <section className="card" style={{ padding: 22, border: '2px solid var(--green)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 16, marginBottom: 18 }}><div><h2 style={{ margin: 0, color: 'var(--navy)' }}>Set Up Recurring Payment</h2><div style={{ color: 'var(--text-muted)', marginTop: 4 }}>This schedule saves directly to the shared cloud database.</div></div><button type="button" className="btn btn-ghost" onClick={onCancel}>Close</button></div>
    <form onSubmit={save}>{error && <div style={{ color: 'var(--red)', marginBottom: 14, fontWeight: 700 }}>{error}</div>}<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 14 }}>
      <div className="form-group" style={{ margin: 0 }}><span>Donor</span><div style={{ padding: '10px 12px', background: 'var(--bg-input)', borderRadius: 8, fontWeight: 800 }}>{donor.name}</div></div>
      <label className="form-group" style={{ margin: 0 }}><span>Amount *</span><input type="number" min="0.01" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} /></label>
      <label className="form-group" style={{ margin: 0 }}><span>Currency</span><select value={currency} onChange={event => setCurrency(event.target.value as 'CAD' | 'USD')}><option>CAD</option><option>USD</option></select></label>
      <label className="form-group" style={{ margin: 0 }}><span>Frequency</span><select value={frequency} onChange={event => setFrequency(event.target.value)}><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option></select></label>
      <label className="form-group" style={{ margin: 0 }}><span>Payment method</span><select value={method} onChange={event => setMethod(event.target.value)}><option value="credit_card">Credit card</option><option value="check">Check</option><option value="cash">Cash</option><option value="e_transfer">E-transfer</option><option value="other">Other</option></select></label>
      <label className="form-group" style={{ margin: 0 }}><span>Next date *</span><input type="date" value={nextDate} onChange={event => setNextDate(event.target.value)} /></label>
      <label className="form-group" style={{ margin: 0 }}><span>End date</span><input type="date" value={endDate} onChange={event => setEndDate(event.target.value)} /></label>
    </div><div className="modal-footer" style={{ marginTop: 18 }}><button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving securely...' : 'Activate Recurring'}</button></div></form>
  </section>;
};
