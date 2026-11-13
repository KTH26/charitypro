import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { FundraiserAllocationEditor, type FundraiserAllocationDraft } from './FundraiserAllocationEditor';
import { DonorPicker, type PickedDonor } from './DonorPicker';
import { HebrewCalendarPicker } from './HebrewCalendar';
import { OnlinePaymentForm } from './OnlinePaymentForm';
import { type CalendarSlot, type Dedication, slotId, slotLabel } from '../utils/hebrewCalendar';

export type PledgeForEdit = { id: string; revision: number; donorId: string; donorName: string; campaignId?: string; amount: number; currency: 'CAD' | 'USD'; date: string; notes?: string; followUpDate?: string; followUpNote?: string; fundraiserGroupId?: string; fundraiserAllocations?: FundraiserAllocationDraft[] };
type Campaign = { id: string; name: string; year: number; startDate: string; endDate: string };
type PledgeForm = { id: string; revision: number; amount: string; currency: 'CAD' | 'USD'; date: string; notes: string; followUpDate: string; followUpNote: string; fundraiserGroupId: string; fundraiserAllocations: FundraiserAllocationDraft[] };

const localToday = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };
const postJson = async (url: string, body: any, method = 'POST') => { const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || 'Unable to save.'); return data; };

/**
 * The New / Edit Pledge window. Used on the Pledges page and from Record a Call, so both have the same options:
 * donor, amount, currency, date (the campaign is picked by date), calendar dates he takes (days / week / month)
 * with the name to show, follow-up reminder, fundraiser split or saved team, notes, and "paid right away".
 */
export const PledgeFormModal: React.FC<{
  pledge?: PledgeForEdit | null;
  defaultDonor?: PickedDonor | null;
  defaults?: Partial<Pick<PledgeForm, 'date' | 'notes' | 'fundraiserAllocations'>>;
  onClose: () => void;
  onSaved: (item: any, isNew: boolean) => void;
}> = ({ pledge, defaultDonor, defaults, onClose, onSaved }) => {
  const [form, setForm] = useState<PledgeForm>(() => pledge
    ? { id: pledge.id, revision: pledge.revision, amount: String(pledge.amount), currency: pledge.currency, date: pledge.date, notes: pledge.notes || '', followUpDate: pledge.followUpDate || '', followUpNote: pledge.followUpNote || '', fundraiserGroupId: pledge.fundraiserGroupId || '', fundraiserAllocations: pledge.fundraiserAllocations || [] }
    : { id: '', revision: 0, amount: '', currency: 'CAD', date: defaults?.date || localToday(), notes: defaults?.notes || '', followUpDate: '', followUpNote: '', fundraiserGroupId: '', fundraiserAllocations: defaults?.fundraiserAllocations || [] });
  const fixedDonor: PickedDonor | null = pledge ? { id: pledge.donorId, name: pledge.donorName } : defaultDonor || null;
  const [donor, setDonor] = useState<PickedDonor | null>(fixedDonor);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [fundraisers, setFundraisers] = useState<{ id: string; name: string; percentage?: number }[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string; allocations: FundraiserAllocationDraft[] }[]>([]);
  // Calendar dates: the ones already booked with this pledge, and new ones chosen now.
  const [booked, setBooked] = useState<Dedication[]>([]);
  const [newSlots, setNewSlots] = useState<CalendarSlot[]>([]);
  const [honoree, setHonoree] = useState('');
  const [picking, setPicking] = useState(false);
  const [payNow, setPayNow] = useState(false);
  const [paying, setPaying] = useState<any>(null);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [saving, setSaving] = useState(false);
  const requestId = useRef('');

  useEffect(() => {
    Promise.all(['/api/v3/records/campaigns?limit=100', '/api/v3/records/fundraisers?limit=100', '/api/v3/records/fundraisingGroups?limit=100'].map(url => fetch(url).then(response => response.json())))
      .then(([campaignData, fundraiserData, groupData]) => { if (campaignData.success) setCampaigns(campaignData.items || []); if (fundraiserData.success) setFundraisers(fundraiserData.items || []); if (groupData.success) setGroups(groupData.items || []); })
      .catch(() => undefined);
    if (pledge) fetch(`/api/v3/dedications?pledgeId=${encodeURIComponent(pledge.id)}`).then(response => response.json()).then(data => { if (data.success) { setBooked(data.items || []); setHonoree(data.items?.[0]?.honoree || ''); } }).catch(() => undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const mine = useMemo(() => new Set(booked.map(item => item.id)), [booked]);

  const removeBooked = async (item: Dedication) => {
    if (!window.confirm(`Free ${item.label}? It will no longer be booked for this donor.`)) return;
    try { const response = await fetch(`/api/v3/dedications/${encodeURIComponent(item.id)}`, { method: 'DELETE' }); const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error); setBooked(current => current.filter(entry => entry.id !== item.id)); }
    catch (reason: any) { setError(reason.message || 'Unable to free this date.'); }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!donor || !Number.isFinite(amount) || amount <= 0 || !form.date) { setError('Donor, amount and date are needed.'); return; }
    setSaving(true); setError('');
    try {
      // First make sure the dates are still free, so nothing is saved when one is taken.
      if (newSlots.length) await postJson('/api/v3/dedications', { checkOnly: true, items: newSlots });
      const key = requestId.current || crypto.randomUUID(); requestId.current = key;
      const data = { ...(form.id ? { id: form.id } : {}), donorId: donor.id, amount, currency: form.currency, date: form.date, notes: form.notes.trim(), followUpDate: form.followUpDate, followUpNote: form.followUpNote.trim(), fundraiserGroupId: form.fundraiserGroupId, fundraiserAllocations: form.fundraiserAllocations };
      const response = await fetch(form.id ? `/api/v3/records/pledges/${encodeURIComponent(form.id)}` : '/api/v3/records/pledges', { method: form.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify({ revision: form.revision, data }) });
      const result = await response.json();
      if (!response.ok || !result.success) { requestId.current = ''; throw new Error(result.error || 'Unable to save pledge.'); }
      const item = result.item; const isNew = !form.id;
      // From here the pledge is saved; never save it a second time.
      setForm(current => ({ ...current, id: String(item.id), revision: Number(item.revision || current.revision + 1) }));
      if (newSlots.length) {
        try { await postJson('/api/v3/dedications', { donorId: donor.id, pledgeId: item.id, honoree, items: newSlots }); setNewSlots([]); }
        catch (reason: any) { setError(`The pledge was saved, but the dates were not booked: ${reason.message}`); return; }
      }
      if (honoree !== (booked[0]?.honoree || '') && booked.length) await Promise.all(booked.map(entry => postJson(`/api/v3/dedications/${encodeURIComponent(entry.id)}`, { honoree, notes: entry.notes || '' }, 'PUT'))).catch(() => undefined);
      if (isNew && payNow) { setPaying({ item, isNew }); return; }
      onSaved(item, isNew);
    } catch (reason: any) { setError(reason.message || 'Unable to save pledge.'); }
    finally { setSaving(false); }
  };
  const saveGroup = async () => {
    const name = window.prompt('Name this fundraiser team'); if (!name?.trim() || !form.fundraiserAllocations.length) return;
    try {
      const response = await fetch('/api/v3/records/fundraisingGroups', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ data: { name: name.trim(), allocations: form.fundraiserAllocations } }) });
      const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || 'Unable to save team.');
      setGroups(current => [...current, data.item]); setForm(current => ({ ...current, fundraiserGroupId: data.item.id })); setNotice('Team saved and selected.');
    } catch (reason: any) { setError(reason.message || 'Unable to save team.'); }
  };
  const campaign = campaigns.filter(item => item.startDate <= form.date && item.endDate >= form.date).sort((left, right) => right.startDate.localeCompare(left.startDate) || left.endDate.localeCompare(right.endDate))[0];

  // "Paid right away": the payment window opens with this pledge already chosen.
  if (paying && donor) return <div className="modal-overlay"><div className="pay-modal" onClick={event => event.stopPropagation()}>
    <div className="call-saved-note" style={{ marginBottom: 8, background: 'var(--bg-card)', padding: 12, borderRadius: 10 }}>✓ The pledge is saved. Now enter how he paid.</div>
    <OnlinePaymentForm title="Payment for this pledge" donor={donor} defaultAmount={Number(form.amount)} defaultCurrency={form.currency} defaultAllocations={[{ pledgeId: String(paying.item.id), amount: Number(form.amount) }]} onCancel={() => onSaved(paying.item, paying.isNew)} onCreated={() => onSaved(paying.item, paying.isNew)} />
  </div></div>;

  return <div className="modal-overlay" onClick={onClose}><form className="modal" onClick={event => event.stopPropagation()} onSubmit={save} style={{ maxWidth: 760, width: '92%', maxHeight: '94vh', overflowY: 'auto' }}>
    <div className="modal-header"><h2 style={{ margin: 0, color: 'var(--navy)' }}>{pledge ? 'Edit Pledge' : 'New Pledge'}</h2><button type="button" className="modal-close" onClick={onClose}>×</button></div>
    <div className="modal-body">
      {error && <div style={{ color: 'var(--red)', fontWeight: 700, marginBottom: 14 }}>{error}</div>}{notice && <div style={{ color: 'var(--green)', fontWeight: 700, marginBottom: 14 }}>{notice}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 14 }}>
        <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}><span>Donor *</span><DonorPicker value={donor} onChange={setDonor} locked={Boolean(fixedDonor)} autoFocus={!fixedDonor} /></div>
        <label className="form-group" style={{ margin: 0 }}><span>Amount *</span><input type="number" min="0.01" step="0.01" autoFocus={Boolean(fixedDonor)} value={form.amount} onChange={event => setForm(current => ({ ...current, amount: event.target.value }))} /></label>
        <label className="form-group" style={{ margin: 0 }}><span>Currency</span><select value={form.currency} onChange={event => setForm(current => ({ ...current, currency: event.target.value as 'CAD' | 'USD' }))}><option>CAD</option><option>USD</option></select></label>
        <label className="form-group" style={{ margin: 0 }}><span>Date *</span><input type="date" value={form.date} onChange={event => setForm(current => ({ ...current, date: event.target.value }))} /></label>
        <div className="form-group" style={{ margin: 0 }}><span>Campaign — automatic by date</span><div style={{ padding: '11px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-input)', fontWeight: 800 }}>{campaign ? `${campaign.name} (${campaign.year})` : 'No campaign covers this date'}</div></div>

        <div className="pledge-extra">
          <strong style={{ color: 'var(--navy)' }}><CalendarDays size={15} style={{ verticalAlign: -2 }} /> Calendar dates (optional)</strong>
          <small style={{ color: 'var(--text-muted)' }}>If he takes days, a week or a month on the Hebrew calendar. Taken dates are red, so nothing is sold twice.</small>
          <div className="hcal-chips">
            {booked.map(item => <span key={item.id} className="hcal-chip" style={{ background: '#dbeafe', color: '#1e3a8a' }} dir="rtl">{slotLabel(item)}<button type="button" title="Free this date" onClick={() => void removeBooked(item)}>×</button></span>)}
            {newSlots.map(slot => <span key={slotId(slot)} className="hcal-chip" dir="rtl">{slotLabel(slot)}<button type="button" onClick={() => setNewSlots(current => current.filter(item => slotId(item) !== slotId(slot)))}>×</button></span>)}
          </div>
          {(booked.length > 0 || newSlots.length > 0) && <label className="form-group" style={{ margin: 0 }}><span>Name to show on these dates</span><input dir="auto" value={honoree} onChange={event => setHonoree(event.target.value)} placeholder="לעילוי נשמת ר׳ ... בן ..." maxLength={300} /></label>}
          <button type="button" className="btn btn-secondary btn-sm" style={{ justifySelf: 'start' }} onClick={() => setPicking(true)}>{booked.length || newSlots.length ? 'Change dates…' : 'Choose dates…'}</button>
        </div>

        <label className="form-group" style={{ margin: 0 }}><span>Get back to donor on</span><input type="date" value={form.followUpDate} onChange={event => setForm(current => ({ ...current, followUpDate: event.target.value }))} /></label>
        {form.followUpDate && <label className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}><span>Reminder note</span><input value={form.followUpNote} onChange={event => setForm(current => ({ ...current, followUpNote: event.target.value }))} placeholder="What should I discuss with this donor?" /></label>}
        <label className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}><span>Saved fundraiser team</span><select value={form.fundraiserGroupId} onChange={event => { const group = groups.find(item => item.id === event.target.value); setForm(current => ({ ...current, fundraiserGroupId: event.target.value, fundraiserAllocations: group?.allocations || current.fundraiserAllocations })); }}><option value="">— Custom fundraiser split —</option>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
        <FundraiserAllocationEditor fundraisers={fundraisers} value={form.fundraiserAllocations} onChange={fundraiserAllocations => setForm(current => ({ ...current, fundraiserGroupId: '', fundraiserAllocations }))} />
        {!!form.fundraiserAllocations.length && <button type="button" className="btn btn-secondary btn-sm" style={{ gridColumn: '1 / -1', justifySelf: 'start' }} onClick={() => void saveGroup()}>Save this split as a team</button>}
        <label className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}><span>Notes</span><textarea value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} /></label>
        {!pledge && <label style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'center', fontWeight: 800, padding: 12, borderRadius: 10, background: 'var(--bg-input)' }}><input type="checkbox" checked={payNow} onChange={event => setPayNow(event.target.checked)} /> He already paid (or pays now) – open the payment after saving</label>}
      </div>
    </div>
    <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : payNow && !pledge ? 'Save Pledge & Enter Payment →' : 'Save Pledge'}</button></div>
    {picking && <HebrewCalendarPicker title={`Calendar dates for ${donor?.name || 'this donor'}`} initial={[...booked, ...newSlots]} initialHonoree={honoree} mine={mine} onClose={() => setPicking(false)} onDone={(slots, nextHonoree) => {
      const keep = new Set(slots.map(slotId));
      const dropped = booked.filter(item => !keep.has(item.id));
      setNewSlots(slots.filter(slot => !mine.has(slotId(slot)))); setHonoree(nextHonoree); setPicking(false);
      dropped.forEach(item => void removeBooked(item));
    }} />}
  </form></div>;
};
