import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useStore } from '../store';

interface Props {
  onClose: () => void;
}

export const AddDonorModal: React.FC<Props> = ({ onClose }) => {
  const { addDonor, fundraisers } = useStore();
  const [form, setForm] = useState({
    name: '', email: '', phone: '', address: '', fundraiserId: '', notes: ''
  });
  const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Full name is required';
    if (!form.phone.trim()) e.phone = 'Phone number is required';
    return e;
  };

  const handle = (field: string, val: string) => {
    setForm(f => ({ ...f, [field]: val }));
    setErrors(e => ({ ...e, [field]: '' }));
  };

  const handleSubmit = () => {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    addDonor({
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      fundraiserId: form.fundraiserId || undefined,
      notes: form.notes.trim(),
    });
    setSuccess(true);
    setTimeout(onClose, 1800);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 style={{ margin: 0 }}>Add New Donor</h2>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
              Fill in the donor details below
            </div>
          </div>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        {success ? (
          <div className="modal-body" style={{ textAlign: 'center', padding: '60px 40px' }}>
            <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'var(--green-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: '2.5rem' }}>✅</div>
            <h3 style={{ color: 'var(--green)', margin: '0 0 8px' }}>Donor Added!</h3>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>{form.name} has been added to the system.</p>
          </div>
        ) : (
          <>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                {/* Name */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Full Name *</label>
                  <input type="text" placeholder="e.g. Avraham Schwartz" value={form.name} onChange={e => handle('name', e.target.value)} />
                  {errors.name && <span style={{ color: 'var(--red)', fontSize: '0.8rem' }}>{errors.name}</span>}
                </div>

                {/* Phone */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Phone Number *</label>
                  <input type="tel" placeholder="e.g. 416-555-0198" value={form.phone} onChange={e => handle('phone', e.target.value)} />
                  {errors.phone && <span style={{ color: 'var(--red)', fontSize: '0.8rem' }}>{errors.phone}</span>}
                </div>

                {/* Email */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Email Address</label>
                  <input type="email" placeholder="e.g. avraham@email.com" value={form.email} onChange={e => handle('email', e.target.value)} />
                </div>

                {/* Address */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Address</label>
                  <input type="text" placeholder="e.g. 123 Main St, Toronto, ON" value={form.address} onChange={e => handle('address', e.target.value)} />
                </div>

                {/* Fundraiser */}
                <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                  <label>Referred by Fundraiser (optional)</label>
                  <select value={form.fundraiserId} onChange={e => handle('fundraiserId', e.target.value)}>
                    <option value="">— No referral —</option>
                    {fundraisers.map(f => (
                      <option key={f.id} value={f.id}>{f.name} ({f.percentage}% commission)</option>
                    ))}
                  </select>
                </div>

                {/* Notes */}
                <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                  <label>Notes (optional)</label>
                  <textarea
                    placeholder="e.g. Prefers to be called in the evening. Met at the 2025 gala."
                    value={form.notes}
                    onChange={e => handle('notes', e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmit}>
                + Add Donor
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
