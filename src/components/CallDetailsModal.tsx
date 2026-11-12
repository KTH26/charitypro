import React, { useState } from 'react';
import { X } from 'lucide-react';
import { CALL_OUTCOMES } from './RecordCallModal';

export type CallRecord = {
  id: string; revision: number; donorId: string; donorName: string; donorPhone?: string; donorAddress?: string;
  date: string; outcome: string; notes: string; followUpDate?: string; fundraiserId?: string; fundraiserName?: string;
  campaignId?: string; campaignName?: string; pledgeId?: string; paymentId?: string; recurringId?: string;
  pickupStatus?: string; pickupDate?: string; pickupAmount?: number; pickupAddress?: string; createdBy?: string; createdAt?: string;
};

const money = (value: number) => `$${Number(value || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Shows everything about one call, and lets you fix the answer or the notes. */
export const CallDetailsModal: React.FC<{ call: CallRecord; onClose: () => void; onSaved: (call: CallRecord) => void; onOpenDonor?: (donorId: string) => void }> = ({ call, onClose, onSaved, onOpenDonor }) => {
  const [editing, setEditing] = useState(false);
  const [outcome, setOutcome] = useState(call.outcome);
  const [notes, setNotes] = useState(call.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setSaving(true); setError('');
    try {
      const response = await fetch(`/api/v3/records/donorContacts/${encodeURIComponent(call.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ revision: call.revision, data: { outcome, notes: notes.trim() } }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to save.');
      onSaved({ ...call, ...data.item, donorName: call.donorName, fundraiserName: call.fundraiserName, campaignName: call.campaignName });
      setEditing(false);
    } catch (reason: any) { setError(reason.message || 'Unable to save.'); } finally { setSaving(false); }
  };
  const row = (label: string, value: React.ReactNode) => value ? <div className="call-detail-row"><span>{label}</span><div>{value}</div></div> : null;
  return <div className="modal-overlay" onClick={onClose}><div className="modal" onClick={event => event.stopPropagation()} style={{ maxWidth: 680, width: '94%', maxHeight: '92vh', overflowY: 'auto' }}>
    <div className="modal-header"><h2 style={{ margin: 0 }}>Call with {call.donorName}</h2><button type="button" className="modal-close" onClick={onClose}><X size={20} /></button></div>
    <div className="modal-body">
      {error && <div style={{ color: 'var(--red)', fontWeight: 700, marginBottom: 14 }}>{error}</div>}
      <div style={{ display: 'grid', gap: 2, marginBottom: 16 }}>
        {row('Donor', <>{onOpenDonor ? <button type="button" className="link-button" onClick={() => onOpenDonor(call.donorId)}>{call.donorName}</button> : call.donorName}{call.donorPhone && <> · <a href={`tel:${call.donorPhone}`}>{call.donorPhone}</a></>}</>)}
        {row('Date', call.date)}
        {row('Fundraiser', call.fundraiserName)}
        {row('Campaign', call.campaignName)}
        {!editing && row('Answer', <span className={`call-badge call-badge-${call.outcome.toLowerCase().replace(/\s+/g, '-')}`}>{call.outcome}</span>)}
        {row('Call back on', call.followUpDate)}
        {call.pickupStatus && row('Pick up', <>{call.pickupAmount ? money(call.pickupAmount) : 'Amount not set'}{call.pickupDate ? ` on ${call.pickupDate}` : ''}{call.pickupAddress ? ` · ${call.pickupAddress}` : ''} — <strong>{call.pickupStatus === 'open' ? 'still to pick up' : call.pickupStatus === 'done' ? 'picked up' : 'cancelled'}</strong></>)}
        {row('Pledge', call.pledgeId ? 'A pledge was entered from this call' : '')}
        {row('Payment', call.paymentId ? 'A payment was entered from this call' : '')}
        {row('Recurring', call.recurringId ? 'Payments were set up from this call' : '')}
        {row('Recorded by', call.createdBy)}
      </div>
      {editing ? <div style={{ display: 'grid', gap: 12 }}>
        <label className="form-group" style={{ margin: 0 }}><span>Answer</span><select value={outcome} onChange={event => setOutcome(event.target.value)}>{[...CALL_OUTCOMES.map(item => item.value), ...(CALL_OUTCOMES.some(item => item.value === call.outcome) ? [] : [call.outcome])].map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="form-group" style={{ margin: 0 }}><span>Discussion and notes</span><textarea rows={8} value={notes} onChange={event => setNotes(event.target.value)} /></label>
      </div> : <div><div style={{ fontWeight: 800, color: 'var(--navy)', marginBottom: 6 }}>Discussion and notes</div><div className="call-notes">{call.notes || <span style={{ color: 'var(--text-muted)' }}>No notes.</span>}</div></div>}
    </div>
    <div className="modal-footer">{editing ? <><button type="button" className="btn btn-secondary" disabled={saving} onClick={() => { setEditing(false); setOutcome(call.outcome); setNotes(call.notes || ''); }}>Cancel</button><button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</button></> : <><button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>Edit notes</button><button type="button" className="btn btn-primary" onClick={onClose}>Close</button></>}</div>
  </div></div>;
};
