import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Banknote, CalendarDays, CreditCard, Edit2, FileText, Mail, MapPin, Phone, Repeat, Scale, Send, Smartphone, User, X } from 'lucide-react';
import type { OnlineDonor } from './OnlineDonorForm';
import { CloudPaymentDetailsModal } from './CloudPaymentDetailsModal';
import { CloudPledgeDetailsModal } from './CloudPledgeDetailsModal';
import { CloudScheduleDetailsModal } from './CloudScheduleDetailsModal';
import { OnlinePaymentForm } from './OnlinePaymentForm';
import { CloudRecurringPaymentForm } from './CloudRecurringPaymentForm';
import { CloudPaymentMethods } from './CloudPaymentMethods';
import { RecordCallModal } from './RecordCallModal';
import { CallDetailsModal, type CallRecord } from './CallDetailsModal';
import { SendStatementModal } from './SendStatementModal';

type Profile = { donor: OnlineDonor & Record<string, any>; payments: any[]; pledges: any[]; recurring: any[]; contacts:any[]; summary: Record<string, number> };
type Tab = 'overview' | 'transactions' | 'pledges' | 'recurring' | 'cards' | 'declined' | 'contacts' | 'notes';
const money = (value: number) => Number(value || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const CloudDonorProfileModal: React.FC<{ donorId: string; onClose: () => void; onEdit: (donor: OnlineDonor) => void }> = ({ donorId, onClose, onEdit }) => {
  const [profile, setProfile] = useState<Profile | null>(null); const [tab, setTab] = useState<Tab>('overview');
  const [error, setError] = useState(''); const [notes, setNotes] = useState(''); const [saving, setSaving] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<any | null>(null); const [selectedPledgeId, setSelectedPledgeId] = useState<string | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<any | null>(null);
  const [showPayment, setShowPayment] = useState(false); const [showRecurring, setShowRecurring] = useState(false); const [notice, setNotice] = useState('');
  const [showStatement, setShowStatement] = useState(false);
  const [showContact,setShowContact]=useState(false);const [selectedCall,setSelectedCall]=useState<CallRecord|null>(null);
  const requestId = useRef('');
  const loadProfile = useCallback(async (signal?: AbortSignal) => { try { const response = await fetch(`/api/v3/donors/${encodeURIComponent(donorId)}/profile`, { signal }); const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load donor profile.'); setProfile(data); setNotes(data.donor.notes || ''); setError(''); } catch (e: any) { if (e.name !== 'AbortError') setError(e.message || 'Unable to load donor profile.'); } }, [donorId]);
  useEffect(() => { const controller = new AbortController(); void loadProfile(controller.signal); return () => controller.abort(); }, [loadProfile]);
  const saveNotes = async () => { if (!profile) return; setSaving(true); const key = requestId.current || crypto.randomUUID(); requestId.current = key; try { const response = await fetch(`/api/v3/donors/${encodeURIComponent(profile.donor.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify({ requestId: key, revision: profile.donor.revision, notes }) }); const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || 'Unable to save notes.'); requestId.current = ''; setProfile(current => current ? { ...current, donor: { ...current.donor, ...data.item } } : current); } catch (e: any) { requestId.current = ''; setError(e.message || 'Unable to save notes.'); } finally { setSaving(false); } };
  const statusBadge = (type: string) => <span className={`badge ${type === 'approved' ? 'badge-green' : type === 'pending' ? 'badge-yellow' : type === 'declined' ? 'badge-red' : 'badge-gray'}`}>{type}</span>;
  const donor = profile?.donor; const summary = profile?.summary || {}; const declined = profile?.payments.filter(payment => payment.type === 'declined') || [];
  const hebrewName = donor ? [donor.preTitle, donor.hebFirstName, donor.hebLastName, donor.title, donor.postTitle].filter(Boolean).join(' ') : '';
  const tabs: [Tab, string][] = [['overview','Overview'],['transactions',`Payments (${summary.paymentCount || 0})`],['pledges',`Pledges (${summary.pledgeCount || 0})`],['recurring',`Recurring (${summary.recurringCount || 0})`],['cards','Saved Cards'],['declined',`Declined (${summary.declinedCount || 0})`],['contacts',`Contact History (${summary.contactCount||0})`],['notes','Notes']];

  // Laid out like the DonorFuse donor page: name, contact and action boxes on top,
  // a "Balance Summary" row of four totals, then tabs. Same data and buttons as before.
  const contactLines: [React.ElementType, string | undefined][] = donor ? [[Phone, donor.phone], [Phone, donor.homePhone], [Smartphone, donor.mobilePhone], [Smartphone, donor.mobilePhone2], [Phone, donor.phone3], [Mail, donor.email], [MapPin, [donor.address, donor.city, donor.postalCode].filter(Boolean).join(', ')]] : [];
  const totals = [
    { label: 'Total Pledges', value: `$${money(summary.pledgedTotal)}`, icon: FileText },
    { label: 'Total Payments', value: `$${money(summary.approvedTotal)}`, icon: Banknote },
    { label: 'Total On Schedule', value: `$${money(summary.scheduledTotal)}`, icon: CalendarDays },
    { label: 'Total Open Balance', value: `$${money(summary.pledgeBalance)}`, icon: Scale, alert: Number(summary.pledgeBalance || 0) > 0 }
  ];
  const infoRows = (rows: [string, any][], rtl = false) => rows.filter(([, value]) => value).map(([label, value]) => <div key={label} className="info-row"><span className="info-label">{label}</span><span className="info-value" dir={rtl ? 'rtl' : undefined}>{value}</span></div>);

  return <><div className="modal-overlay" onClick={onClose}><div className="modal donor-sheet" onClick={event => event.stopPropagation()}>
    <div className="modal-header"><div className="donor-crumbs"><button type="button" className="donor-crumb-link" onClick={onClose}>Donors</button><span className="donor-crumb-sep">›</span><span>{donor ? (donor.displayId || donor.id) : 'Donor Profile'}</span></div><button className="modal-close" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
    <div className="modal-body">{error && <div className="list-notice bad">{error}</div>}{notice && <div className="list-notice ok">{notice}</div>}{!profile && !error && <div className="list-loading">Loading donor details from the cloud...</div>}{profile && donor && <>
      <div className="donor-top">
        <div className="donor-box donor-name-box">
          {hebrewName && <div dir="rtl" className="donor-heb">{hebrewName}</div>}
          <div className={hebrewName ? 'donor-eng' : 'donor-heb'}>{donor.name}</div>
          <div className="donor-id">ID: {donor.displayId || donor.id}</div>
        </div>
        <div className="donor-box donor-contact-box">
          {contactLines.filter(([, value]) => value).map(([Icon, value], index) => <div key={index} className="donor-contact-line"><Icon size={14} /><span>{value}</span></div>)}
          {contactLines.every(([, value]) => !value) && <span className="muted">No contact details yet.</span>}
        </div>
        <div className="donor-box donor-action-box">
          <button type="button" className="btn btn-primary" onClick={() => { setShowPayment(true); setNotice(''); }}><CreditCard size={15} />Process Payment</button>
          <div className="donor-action-row">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setShowRecurring(true); setNotice(''); }}><Repeat size={14} />Set Up Recurring</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowStatement(true)}><Send size={14} />Send Statement</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEdit(donor)}><Edit2 size={14} />Edit</button>
          </div>
        </div>
      </div>{showStatement && <SendStatementModal donorId={donorId} onClose={() => setShowStatement(false)} />}
      <div className="donor-summary">
        <div className="donor-summary-head">Balance Summary : All Accounts</div>
        <div className="sum-grid">{totals.map(item => <div key={item.label} className={`sum-card${item.alert ? ' is-alert' : ''}`}><span className="sum-icon"><item.icon size={17} /></span><div><div className="sum-label">{item.label}</div><div className="sum-value">{item.value}</div></div></div>)}</div>
      </div>
      <div className="card-tabs donor-tabs">{tabs.map(([key,label]) => <button key={key} type="button" className={`card-tab${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>{key === 'overview' ? 'General' : label}</button>)}</div>
      <div className="donor-tab-body">
      {tab === 'overview' && <div><h3 className="donor-section-title">General</h3><div className="info-grid">
        <div className="info-panel"><div className="info-panel-head"><User size={15} />Donor Details</div>{infoRows([['English Name', donor.name], ['Hebrew Name', hebrewName], ['Pre-Title', donor.preTitle], ['Hebrew First', donor.hebFirstName], ['Hebrew Last', donor.hebLastName], ['Title', donor.title], ['Post-Title', donor.postTitle], ['His Father', donor.hisFather], ['Her Father', donor.herFather]], true)}</div>
        <div className="info-panel"><div className="info-panel-head"><MapPin size={15} />Contact Details</div>{infoRows([['Main', donor.phone], ['Home', donor.homePhone], ['Mobile 1', donor.mobilePhone], ['Mobile 2', donor.mobilePhone2], ['Phone 3', donor.phone3], ['Email', donor.email], ['Address', donor.address], ['City', donor.city], ['Province', donor.province], ['Postal', donor.postalCode]])}<div className="info-row"><span className="info-label">Active Recurring</span><span className="info-value">{String(summary.activeRecurringCount || 0)}</span></div>{Array.isArray((donor as any).tags) && (donor as any).tags.length > 0 && <div className="info-row"><span className="info-label">Tags</span><span className="info-value">{((donor as any).tags as string[]).map(tag => <span key={tag} className="badge" dir="auto" style={{ background: 'var(--info-soft)', color: 'var(--info-ink)', marginRight: 4 }}>{tag}</span>)}</span></div>}{(donor as any).isBusiness && <div className="info-row"><span className="info-label">Business account – its donors</span><span className="info-value">{((donor as any).businessMembers || []).map((member: any) => member.name).join(', ') || 'None linked yet (Edit to add)'}</span></div>}{((donor as any).memberOfBusinesses || []).length > 0 && <div className="info-row"><span className="info-label">Part of business</span><span className="info-value">{((donor as any).memberOfBusinesses || []).map((business: any) => business.name).join(', ')}</span></div>}</div>
      </div></div>}
      {tab === 'transactions' && <RecordTable rows={profile.payments.filter(payment => payment.type !== 'declined')} columns={['Date','Amount','Campaign','Method','Deposit','Status']} render={payment => [payment.date,`${payment.currency} $${money(payment.amount)}`,(payment as any).campaignName || '—',String(payment.method || '').replace('_',' '),payment.depositStatus || 'Direct',statusBadge(payment.type)]} empty="No payments found for this donor." onRow={payment => setSelectedPayment(payment)} />}
      {tab === 'pledges' && <><div className="sum-grid sum-grid-5">{[{label:'Total Pledges',value:summary.pledgedTotal},{label:'Approved Paid',value:summary.pledgePaidTotal},{label:'Pending',value:summary.pledgePendingTotal},{label:'Future Scheduled',value:summary.scheduledTotal},{label:'Unscheduled Balance',value:summary.pledgeBalance}].map(item => <div key={item.label} className="sum-card sum-card-plain"><div><div className="sum-label">{item.label}</div><div className="sum-value">${money(item.value)}</div></div></div>)}</div><RecordTable rows={profile.pledges} columns={['Pledge Date','Pledge','Campaign','Approved','Pending','Scheduled','Balance']} render={pledge => [pledge.date,`${pledge.currency || 'CAD'} $${money(pledge.amount)}`,(pledge as any).campaignName || '—',`$${money(pledge.paid)}`,`$${money(pledge.pending)}`,`$${money(pledge.scheduled)}`,`$${money(pledge.balance)}`]} empty="No pledges found for this donor." onRow={pledge => setSelectedPledgeId(pledge.id)} /></>}
      {tab === 'recurring' && <RecordTable rows={profile.recurring} columns={['Next Date','Amount','Pays pledge','Frequency','Method','Status']} render={schedule => [schedule.nextDate,`${schedule.currency} $${money(schedule.amount)}`,(schedule as any).pledgeLabel || '—',schedule.frequency,String(schedule.method || '').replace('_',' '),schedule.active ? 'Active' : 'Paused']} empty="No recurring payments found for this donor." onRow={schedule => setSelectedSchedule({ ...schedule, donorName: donor.name })} />}
      {tab === 'cards' && <CloudPaymentMethods donorId={donor.id} />}
      {tab === 'declined' && <RecordTable rows={declined} columns={['Date','Amount','Method','Notes','Status']} render={payment => [payment.date,`${payment.currency} $${money(payment.amount)}`,String(payment.method || '').replace('_',' '),payment.notes || '',statusBadge(payment.type)]} empty="No declined payments." onRow={payment => setSelectedPayment(payment)} />}
      {tab === 'contacts' && <><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,marginBottom:12,flexWrap:'wrap'}}><span style={{color:'var(--text-muted)',fontSize:13}}>All calls with this donor. The full list of all calls is on the Call Tracker page.</span><button className="btn btn-primary" onClick={()=>setShowContact(true)}>+ Record a Call</button></div><RecordTable rows={profile.contacts||[]} columns={['Date','Answer','What donor said','Fundraiser','Call back']} render={contact=>[contact.date,<span className={`call-badge call-badge-${String(contact.outcome||'').toLowerCase().replace(/\s+/g,'-')}`}>{contact.outcome}</span>,String(contact.notes||'').length>80?`${String(contact.notes).slice(0,80)}…`:contact.notes,contact.fundraiserName||'—',contact.followUpDate||'—']} empty="No calls recorded for this donor yet." onRow={contact=>setSelectedCall({...contact,donorName:donor.name,donorPhone:donor.phone})}/></>}
      {tab === 'notes' && <div><textarea value={notes} onChange={event => setNotes(event.target.value)} rows={8} style={{ width: '100%' }} /><button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => void saveNotes()} disabled={saving}>{saving ? 'Saving...' : 'Save Notes'}</button></div>}
      <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 12 }}>Each activity tab shows at most the latest 50 records so the page stays responsive.</div>
      </div>
    </>}</div>
</div></div>{showPayment && donor && <div className="modal-overlay" onClick={() => setShowPayment(false)}><div onClick={event => event.stopPropagation()} style={{ width: 'min(900px,92vw)', maxHeight: '92vh', overflowY: 'auto' }}><OnlinePaymentForm donor={donor as any} onCancel={() => setShowPayment(false)} onCreated={status => { setShowPayment(false); setNotice(status === 'pending' ? 'Check saved safely as pending.' : 'Payment saved safely.'); setTab('transactions'); void loadProfile(); }} /></div></div>}{showRecurring && donor && <div className="modal-overlay" onClick={() => setShowRecurring(false)}><div onClick={event => event.stopPropagation()} style={{ width: 'min(820px,92vw)', maxHeight: '92vh', overflowY: 'auto' }}><CloudRecurringPaymentForm donor={{ id: donor.id, name: donor.name }} onCancel={() => setShowRecurring(false)} onCreated={() => { setShowRecurring(false); setNotice('Recurring payment schedule saved safely.'); setTab('recurring'); void loadProfile(); }} /></div></div>}{selectedPayment && <CloudPaymentDetailsModal payment={{ ...selectedPayment, donorName: donor?.name }} onClose={() => setSelectedPayment(null)} onUpdated={payment => { setSelectedPayment(payment); void loadProfile(); }} />}{selectedPledgeId && <CloudPledgeDetailsModal pledgeId={selectedPledgeId} onClose={() => setSelectedPledgeId(null)} />}{showContact && donor && <RecordCallModal donor={{ id: donor.id, name: donor.name, email: donor.email, phone: donor.phone, address: donor.address, city: donor.city }} onClose={() => { setShowContact(false); void loadProfile(); }} onSaved={() => void loadProfile()} />}{selectedCall && <CallDetailsModal call={selectedCall} onClose={() => setSelectedCall(null)} onSaved={call => { setSelectedCall(call); void loadProfile(); }} onDeleted={() => { setSelectedCall(null); void loadProfile(); }} />}{selectedSchedule && <CloudScheduleDetailsModal schedule={selectedSchedule} onClose={() => setSelectedSchedule(null)} onUpdated={schedule => { setSelectedSchedule(schedule); setProfile(current => current ? { ...current, recurring: current.recurring.map(item => item.id === schedule.id ? schedule : item) } : current); }} />}</>;
};

const RecordTable: React.FC<{ rows: any[]; columns: string[]; render: (row: any) => React.ReactNode[]; empty: string; onRow?: (row: any) => void }> = ({ rows, columns, render, empty, onRow }) => <div className="table-container"><table><thead><tr>{columns.map(column => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} onClick={() => onRow?.(row)} style={onRow ? { cursor: 'pointer' } : undefined}>{render(row).map((value,index) => <td key={index}>{value}</td>)}</tr>)}{rows.length === 0 && <tr><td colSpan={columns.length} style={{ padding: 20, textAlign: 'center' }}>{empty}</td></tr>}</tbody></table></div>;
