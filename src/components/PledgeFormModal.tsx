import React, { useEffect, useRef, useState } from 'react';
import { FundraiserAllocationEditor, type FundraiserAllocationDraft } from './FundraiserAllocationEditor';

export type PledgeForEdit = { id: string; revision: number; donorId: string; donorName: string; campaignId?: string; amount: number; currency: 'CAD' | 'USD'; date: string; notes?: string; followUpDate?: string; followUpNote?: string; fundraiserGroupId?: string; fundraiserAllocations?: FundraiserAllocationDraft[] };
type Donor = { id: string; name: string };
type Campaign = { id: string; name: string; year: number; startDate: string; endDate: string };
type PledgeForm = { id: string; revision: number; donorId: string; amount: string; currency: 'CAD' | 'USD'; date: string; notes: string; followUpDate: string; followUpNote: string; fundraiserGroupId: string; fundraiserAllocations: FundraiserAllocationDraft[] };

const localToday = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };

/**
 * The New / Edit Pledge window. Used on the Pledges page and from Record a Call, so both have the same options:
 * donor, amount, currency, date (the campaign is picked by date), follow-up reminder, fundraiser split or saved team, notes.
 */
export const PledgeFormModal: React.FC<{
  pledge?: PledgeForEdit | null;
  defaultDonor?: Donor | null;
  defaults?: Partial<Pick<PledgeForm, 'date' | 'notes' | 'fundraiserAllocations'>>;
  onClose: () => void;
  onSaved: (item: any, isNew: boolean) => void;
}> = ({ pledge, defaultDonor, defaults, onClose, onSaved }) => {
  const [form, setForm] = useState<PledgeForm>(() => pledge
    ? { id: pledge.id, revision: pledge.revision, donorId: pledge.donorId, amount: String(pledge.amount), currency: pledge.currency, date: pledge.date, notes: pledge.notes || '', followUpDate: pledge.followUpDate || '', followUpNote: pledge.followUpNote || '', fundraiserGroupId: pledge.fundraiserGroupId || '', fundraiserAllocations: pledge.fundraiserAllocations || [] }
    : { id: '', revision: 0, donorId: defaultDonor?.id || '', amount: '', currency: 'CAD', date: defaults?.date || localToday(), notes: defaults?.notes || '', followUpDate: '', followUpNote: '', fundraiserGroupId: '', fundraiserAllocations: defaults?.fundraiserAllocations || [] });
  const fixedDonor = pledge ? { id: pledge.donorId, name: pledge.donorName } : defaultDonor || null;
  const [donorSearch, setDonorSearch] = useState(fixedDonor?.name || '');
  const [donors, setDonors] = useState<Donor[]>(fixedDonor ? [fixedDonor] : []);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [fundraisers, setFundraisers] = useState<{ id: string; name: string; percentage?: number }[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string; allocations: FundraiserAllocationDraft[] }[]>([]);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [saving, setSaving] = useState(false);
  const requestId = useRef('');

  useEffect(() => {
    if (fixedDonor && donorSearch === fixedDonor.name) return;
    const timer = window.setTimeout(() => { fetch(`/api/v3/donors?limit=50&search=${encodeURIComponent(donorSearch)}`).then(response => response.json()).then(data => { if (data.success) setDonors(data.items); }).catch(() => undefined); }, 250);
    return () => window.clearTimeout(timer);
  }, [donorSearch]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    Promise.all(['/api/v3/records/campaigns?limit=100', '/api/v3/records/fundraisers?limit=100', '/api/v3/records/fundraisingGroups?limit=100'].map(url => fetch(url).then(response => response.json())))
      .then(([campaignData, fundraiserData, groupData]) => { if (campaignData.success) setCampaigns(campaignData.items || []); if (fundraiserData.success) setFundraisers(fundraiserData.items || []); if (groupData.success) setGroups(groupData.items || []); })
      .catch(() => undefined);
  }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!form.donorId || !Number.isFinite(amount) || amount <= 0 || !form.date) { setError('Donor, positive amount, and date are required.'); return; }
    const key = requestId.current || crypto.randomUUID(); requestId.current = key;
    const data = { ...(form.id ? { id: form.id } : {}), donorId: form.donorId, amount, currency: form.currency, date: form.date, notes: form.notes.trim(), followUpDate: form.followUpDate, followUpNote: form.followUpNote.trim(), fundraiserGroupId: form.fundraiserGroupId, fundraiserAllocations: form.fundraiserAllocations };
    setSaving(true); setError('');
    try {
      const response = await fetch(form.id ? `/api/v3/records/pledges/${encodeURIComponent(form.id)}` : '/api/v3/records/pledges', { method: form.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify({ revision: form.revision, data }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to save pledge.');
      onSaved(result.item, !form.id);
    } catch (reason: any) { requestId.current = ''; setError(reason.message || 'Unable to save pledge.'); }
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

  return <div className="modal-overlay" onClick={onClose}><form className="modal" onClick={event => event.stopPropagation()} onSubmit={save} style={{ maxWidth: 760, width: '92%', maxHeight: '94vh', overflowY: 'auto' }}>
    <div className="modal-header"><h2 style={{ margin: 0, color: 'var(--navy)' }}>{form.id ? 'Edit Pledge' : 'New Pledge'}</h2><button type="button" className="modal-close" onClick={onClose}>×</button></div>
    <div className="modal-body">
      {error && <div style={{ color: 'var(--red)', fontWeight: 700, marginBottom: 14 }}>{error}</div>}{notice && <div style={{ color: 'var(--green)', fontWeight: 700, marginBottom: 14 }}>{notice}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 14 }}>
        {defaultDonor && !pledge ? <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}><span>Donor</span><div style={{ padding: '11px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-input)', fontWeight: 800 }}>{defaultDonor.name}</div></div> : <>
          <label className="form-group" style={{ margin: 0 }}><span>Find donor</span><input value={donorSearch} onChange={event => setDonorSearch(event.target.value)} placeholder="Type a donor name" /></label>
          <label className="form-group" style={{ margin: 0 }}><span>Donor *</span><select value={form.donorId} onChange={event => setForm(current => ({ ...current, donorId: event.target.value }))}><option value="">Select from up to 50 matches</option>{donors.map(donor => <option key={donor.id} value={donor.id}>{donor.name}</option>)}</select></label>
        </>}
        <div className="form-group" style={{ margin: 0 }}><span>Campaign — automatic by date</span><div style={{ padding: '11px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-input)', fontWeight: 800 }}>{campaign ? `${campaign.name} (${campaign.year})` : 'No campaign covers this date'}</div></div>
        <label className="form-group" style={{ margin: 0 }}><span>Amount *</span><input type="number" min="0.01" step="0.01" autoFocus={Boolean(defaultDonor)} value={form.amount} onChange={event => setForm(current => ({ ...current, amount: event.target.value }))} /></label>
        <label className="form-group" style={{ margin: 0 }}><span>Currency</span><select value={form.currency} onChange={event => setForm(current => ({ ...current, currency: event.target.value as 'CAD' | 'USD' }))}><option>CAD</option><option>USD</option></select></label>
        <label className="form-group" style={{ margin: 0 }}><span>Date *</span><input type="date" value={form.date} onChange={event => setForm(current => ({ ...current, date: event.target.value }))} /></label>
        <label className="form-group" style={{ margin: 0 }}><span>Get back to donor on</span><input type="date" value={form.followUpDate} onChange={event => setForm(current => ({ ...current, followUpDate: event.target.value }))} /></label>
        {form.followUpDate && <label className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}><span>Reminder note</span><input value={form.followUpNote} onChange={event => setForm(current => ({ ...current, followUpNote: event.target.value }))} placeholder="What should I discuss with this donor?" /></label>}
        <label className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}><span>Saved fundraiser team</span><select value={form.fundraiserGroupId} onChange={event => { const group = groups.find(item => item.id === event.target.value); setForm(current => ({ ...current, fundraiserGroupId: event.target.value, fundraiserAllocations: group?.allocations || current.fundraiserAllocations })); }}><option value="">— Custom fundraiser split —</option>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
        <FundraiserAllocationEditor fundraisers={fundraisers} value={form.fundraiserAllocations} onChange={fundraiserAllocations => setForm(current => ({ ...current, fundraiserGroupId: '', fundraiserAllocations }))} />
        {!!form.fundraiserAllocations.length && <button type="button" className="btn btn-secondary btn-sm" style={{ gridColumn: '1 / -1', justifySelf: 'start' }} onClick={() => void saveGroup()}>Save this split as a team</button>}
        <label className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}><span>Notes</span><textarea value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} /></label>
      </div>
    </div>
    <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Pledge'}</button></div>
  </form></div>;
};
