import React, { useRef, useState } from 'react';

export type OnlineDonor = {
  id: string;
  revision: number;
  displayId?: string;
  firstName: string;
  lastName: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
  preTitle?: string;
  hebFirstName?: string;
  hebLastName?: string;
  title?: string;
  postTitle?: string;
  homePhone?: string;
  mobilePhone?: string;
  totalGiven: number;
};

export const OnlineDonorForm: React.FC<{
  donor?: OnlineDonor;
  onSaved: (message: string) => void;
  onCancel: () => void;
  onConflict: (message: string) => void;
}> = ({ donor, onSaved, onCancel, onConflict }) => {
  const [form, setForm] = useState({
    firstName: donor?.firstName || '', lastName: donor?.lastName || '', phone: donor?.phone || '',
    email: donor?.email || '', address: donor?.address || '', displayId: donor?.displayId || '', notes: donor?.notes || '',
    preTitle: donor?.preTitle || '', hebFirstName: donor?.hebFirstName || '', hebLastName: donor?.hebLastName || '',
    title: donor?.title || '', postTitle: donor?.postTitle || '', homePhone: donor?.homePhone || '', mobilePhone: donor?.mobilePhone || ''
  });
  const [advanced, setAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const pendingRequestId = useRef('');
  const set = (field: string, value: string) => setForm(current => ({ ...current, [field]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!form.firstName.trim() || !form.lastName.trim() || !form.phone.trim()) {
      setError('First name, last name, and phone are required.');
      return;
    }
    setSaving(true);
    const requestId = pendingRequestId.current || crypto.randomUUID();
    pendingRequestId.current = requestId;
    try {
      const response = await fetch(donor ? `/api/v3/donors/${encodeURIComponent(donor.id)}` : '/api/v3/donors', {
        method: donor ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestId },
        body: JSON.stringify({ ...form, requestId, ...(donor ? { revision: donor.revision } : {}) })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        pendingRequestId.current = '';
        if (data.conflict) { onConflict(data.error || 'This donor was changed by another user.'); return; }
        throw new Error(data.error || 'The donor could not be saved.');
      }
      pendingRequestId.current = '';
      onSaved(donor ? 'Donor changes saved directly to the cloud.' : 'New donor saved directly to the cloud.');
    } catch (e: any) {
      setError(e.message || 'The donor could not be saved. You can safely try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
    <section className="modal" onClick={event => event.stopPropagation()} style={{ maxWidth: 900, width: '92%', maxHeight: '90vh', overflowY: 'auto' }}>
      <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'start' }}>
        <div><h2 style={{ color: 'var(--navy)', margin: 0 }}>{donor ? `Edit ${donor.name}` : 'Add donor to the cloud'}</h2><div style={{ color: 'var(--text-muted)', marginTop: 4 }}>Changes are shared immediately with every signed-in user.</div></div>
        <button className="btn btn-ghost" type="button" onClick={onCancel}>Close</button>
      </div>
      <form className="modal-body" onSubmit={submit}>
        {error && <div style={{ color: 'var(--red)', fontWeight: 700, marginBottom: 14 }}>{error}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <label className="form-group" style={{ margin: 0 }}><span>First name *</span><input value={form.firstName} onChange={e => set('firstName', e.target.value)} /></label>
          <label className="form-group" style={{ margin: 0 }}><span>Last name *</span><input value={form.lastName} onChange={e => set('lastName', e.target.value)} /></label>
          <label className="form-group" style={{ margin: 0 }}><span>Phone *</span><input value={form.phone} onChange={e => set('phone', e.target.value)} /></label>
          <label className="form-group" style={{ margin: 0 }}><span>Email</span><input type="email" value={form.email} onChange={e => set('email', e.target.value)} /></label>
          <label className="form-group" style={{ margin: 0 }}><span>Donor ID</span><input value={form.displayId} onChange={e => set('displayId', e.target.value)} placeholder="Generated automatically if blank" /></label>
          <label className="form-group" style={{ margin: 0 }}><span>Address</span><input value={form.address} onChange={e => set('address', e.target.value)} /></label>
        </div>
        <label className="form-group" style={{ margin: '14px 0 0' }}><span>Notes</span><textarea rows={3} maxLength={2000} value={form.notes} onChange={e => set('notes', e.target.value)} /></label>
        <button type="button" className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => setAdvanced(value => !value)}>{advanced ? 'Hide additional fields' : 'Show Hebrew and additional phone fields'}</button>
        {advanced && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginTop: 12, padding: 16, background: 'var(--bg-input)', borderRadius: 12 }}>
          <label className="form-group" style={{ margin: 0 }}><span>Pre-title</span><input value={form.preTitle} onChange={e => set('preTitle', e.target.value)} /></label>
          <label className="form-group" style={{ margin: 0 }}><span>Hebrew first name</span><input dir="rtl" value={form.hebFirstName} onChange={e => set('hebFirstName', e.target.value)} /></label>
          <label className="form-group" style={{ margin: 0 }}><span>Hebrew last name</span><input dir="rtl" value={form.hebLastName} onChange={e => set('hebLastName', e.target.value)} /></label>
          <label className="form-group" style={{ margin: 0 }}><span>Title</span><input dir="rtl" value={form.title} onChange={e => set('title', e.target.value)} /></label>
          <label className="form-group" style={{ margin: 0 }}><span>Post-title</span><input dir="rtl" value={form.postTitle} onChange={e => set('postTitle', e.target.value)} /></label>
          <label className="form-group" style={{ margin: 0 }}><span>Home phone</span><input value={form.homePhone} onChange={e => set('homePhone', e.target.value)} /></label>
          <label className="form-group" style={{ margin: 0 }}><span>Mobile phone</span><input value={form.mobilePhone} onChange={e => set('mobilePhone', e.target.value)} /></label>
        </div>}
        <div className="modal-footer" style={{ margin: '18px -22px -22px', padding: '16px 22px' }}><button className="btn btn-secondary" type="button" onClick={onCancel} disabled={saving}>Cancel</button><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving securely...' : donor ? 'Save Changes' : 'Add Donor'}</button></div>
      </form>
    </section>
    </div>
  );
};
