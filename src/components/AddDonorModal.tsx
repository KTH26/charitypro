import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useStore, type Donor } from '../store';

interface Props {
  onClose: () => void;
  editDonorData?: Donor;
}

import { useT } from '../i18n';

export const AddDonorModal: React.FC<Props> = ({ onClose, editDonorData }) => {
  const { addDonor, editDonor, fundraisers, isRtl } = useStore();
  const T = useT(isRtl);
  const [form, setForm] = useState({
    firstName: editDonorData?.firstName || '', 
    lastName: editDonorData?.lastName || '', 
    email: editDonorData?.email || '', 
    phone: editDonorData?.phone || '', 
    address: editDonorData?.address || '', 
    displayId: editDonorData?.displayId || '',
    fundraiserId: editDonorData?.fundraiserId || '', 
    notes: editDonorData?.notes || '',
    hebFirstName: editDonorData?.hebFirstName || '',
    hebLastName: editDonorData?.hebLastName || '',
    preTitle: editDonorData?.preTitle || '',
    title: editDonorData?.title || '',
    postTitle: editDonorData?.postTitle || '',
    doubleNames: editDonorData?.doubleNames || '',
    hisFather: editDonorData?.hisFather || '',
    herFather: editDonorData?.herFather || '',
    householdFullName: editDonorData?.householdFullName || '',
    allMaiden: editDonorData?.allMaiden || '',
    homePhone: editDonorData?.homePhone || '',
    mobilePhone: editDonorData?.mobilePhone || '',
    mobilePhone2: editDonorData?.mobilePhone2 || '',
    phone3: editDonorData?.phone3 || '',
    confidentialMobile: editDonorData?.confidentialMobile || '',
    confidentialMobile2: editDonorData?.confidentialMobile2 || '',
    addrBuildingNum: editDonorData?.addrBuildingNum || '',
    addrStreet: editDonorData?.addrStreet || '',
    addrApt: editDonorData?.addrApt || '',
    addrType: editDonorData?.addrType || '',
    addrNo: editDonorData?.addrNo || '',
    addrPostalCode: editDonorData?.addrPostalCode || '',
    addrLandlord: editDonorData?.addrLandlord || '',
  });
  const [success, setSuccess] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.firstName.trim()) e.firstName = 'First name is required';
    if (!form.lastName.trim()) e.lastName = 'Last name is required';
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
    
    const donorData = {
      ...form,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      displayId: form.displayId.trim() || undefined,
      fundraiserId: form.fundraiserId || undefined,
      notes: form.notes.trim(),
    };

    if (editDonorData) {
      editDonor(editDonorData.id, donorData);
    } else {
      addDonor(donorData);
    }
    
    setSuccess(true);
    setTimeout(onClose, 1800);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 style={{ margin: 0 }}>{editDonorData ? 'Edit Donor' : 'Add New Donor'}</h2>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
              {editDonorData ? 'Update donor details below' : 'Fill in the donor details below'}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        {success ? (
          <div className="modal-body" style={{ textAlign: 'center', padding: '60px 40px' }}>
            <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'var(--green-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: '2.5rem' }}>✅</div>
            <h3 style={{ color: 'var(--green)', margin: '0 0 8px' }}>{editDonorData ? 'Donor Updated!' : 'Donor Added!'}</h3>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>{form.firstName} {form.lastName} has been {editDonorData ? 'updated' : 'added to the system'}.</p>
          </div>
        ) : (
          <>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                {/* First Name */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label>{T('first_name') || 'First Name'} *</label>
                  <input type="text" placeholder="e.g. Avraham" value={form.firstName} onChange={e => handle('firstName', e.target.value)} />
                  {errors.firstName && <span style={{ color: 'var(--red)', fontSize: '0.8rem' }}>{errors.firstName}</span>}
                </div>

                {/* Last Name */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label>{T('last_name') || 'Last Name'} *</label>
                  <input type="text" placeholder="e.g. Schwartz" value={form.lastName} onChange={e => handle('lastName', e.target.value)} />
                  {errors.lastName && <span style={{ color: 'var(--red)', fontSize: '0.8rem' }}>{errors.lastName}</span>}
                </div>

                {/* Custom ID */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Custom ID (optional)</label>
                  <input type="text" placeholder="e.g. Latch-5532" value={form.displayId} onChange={e => handle('displayId', e.target.value)} />
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
                  <label>{T('referred_optional') || 'Referred by Fundraiser'}</label>
                  <select value={form.fundraiserId} onChange={e => handle('fundraiserId', e.target.value)}>
                    <option value="">{T('no_referral') || '— No referral —'}</option>
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
                
                {/* Advanced Toggle */}
                <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '8px' }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setShowAdvanced(!showAdvanced)} style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                    {showAdvanced ? 'Hide Advanced Hebrew & Address Fields ▲' : 'Show Advanced Hebrew & Address Fields ▼'}
                  </button>
                </div>

                {showAdvanced && (
                  <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', background: 'var(--bg-input)', padding: '20px', borderRadius: '12px' }}>
                    {/* Hebrew Info */}
                    <div className="form-group" style={{ margin: 0 }}><label>Pre-Title (פאר טיטל)</label><input type="text" value={form.preTitle} onChange={e => handle('preTitle', e.target.value)} dir="rtl" /></div>
                    <div className="form-group" style={{ margin: 0 }}><label>Hebrew First Name (ערשטע נאמען)</label><input type="text" value={form.hebFirstName} onChange={e => handle('hebFirstName', e.target.value)} dir="rtl" /></div>
                    <div className="form-group" style={{ margin: 0 }}><label>Hebrew Last Name (משפחה נאמען)</label><input type="text" value={form.hebLastName} onChange={e => handle('hebLastName', e.target.value)} dir="rtl" /></div>
                    <div className="form-group" style={{ margin: 0 }}><label>Title (טיטל)</label><input type="text" value={form.title} onChange={e => handle('title', e.target.value)} dir="rtl" /></div>
                    <div className="form-group" style={{ margin: 0 }}><label>Post Title (נאך טיטל)</label><input type="text" value={form.postTitle} onChange={e => handle('postTitle', e.target.value)} dir="rtl" /></div>
                    <div className="form-group" style={{ margin: 0 }}><label>His Father (זיין טאטע)</label><input type="text" value={form.hisFather} onChange={e => handle('hisFather', e.target.value)} dir="rtl" /></div>
                    <div className="form-group" style={{ margin: 0 }}><label>Her Father (איר טאטע)</label><input type="text" value={form.herFather} onChange={e => handle('herFather', e.target.value)} dir="rtl" /></div>
                    
                    <div style={{ gridColumn: '1 / -1', borderBottom: '1px solid var(--border)', margin: '10px 0' }}></div>

                    {/* Extended Contact */}
                    <div className="form-group" style={{ margin: 0 }}><label>Home Phone</label><input type="text" value={form.homePhone} onChange={e => handle('homePhone', e.target.value)} /></div>
                    <div className="form-group" style={{ margin: 0 }}><label>Mobile 1</label><input type="text" value={form.mobilePhone} onChange={e => handle('mobilePhone', e.target.value)} /></div>
                    <div className="form-group" style={{ margin: 0 }}><label>Mobile 2</label><input type="text" value={form.mobilePhone2} onChange={e => handle('mobilePhone2', e.target.value)} /></div>
                    <div className="form-group" style={{ margin: 0 }}><label>Private Mobile 1</label><input type="text" value={form.confidentialMobile} onChange={e => handle('confidentialMobile', e.target.value)} /></div>

                    <div style={{ gridColumn: '1 / -1', borderBottom: '1px solid var(--border)', margin: '10px 0' }}></div>

                    {/* Extended Address */}
                    <div className="form-group" style={{ margin: 0 }}><label>No.</label><input type="text" value={form.addrNo} onChange={e => handle('addrNo', e.target.value)} /></div>
                    <div className="form-group" style={{ margin: 0 }}><label>Street</label><input type="text" value={form.addrStreet} onChange={e => handle('addrStreet', e.target.value)} /></div>
                    <div className="form-group" style={{ margin: 0 }}><label>Type (St/Ave/Blvd)</label><input type="text" value={form.addrType} onChange={e => handle('addrType', e.target.value)} /></div>
                    <div className="form-group" style={{ margin: 0 }}><label>Building #</label><input type="text" value={form.addrBuildingNum} onChange={e => handle('addrBuildingNum', e.target.value)} /></div>
                    <div className="form-group" style={{ margin: 0 }}><label>Apt.</label><input type="text" value={form.addrApt} onChange={e => handle('addrApt', e.target.value)} /></div>
                    <div className="form-group" style={{ margin: 0 }}><label>Postal Code</label><input type="text" value={form.addrPostalCode} onChange={e => handle('addrPostalCode', e.target.value)} /></div>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={onClose}>{T('cancel')}</button>
              <button className="btn btn-primary" onClick={handleSubmit}>
                {editDonorData ? 'Save Changes' : `+ ${T('add_donor')}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
