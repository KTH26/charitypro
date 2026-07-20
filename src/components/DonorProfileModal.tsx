import React, { useState } from 'react';
import { useStore, type Transaction } from '../store';
import { Edit2, X, ArrowRightLeft } from 'lucide-react';
import { PaymentModal } from './PaymentModal';
import { AddDonorModal } from './AddDonorModal';
import { TransferCreditModal } from './TransferCreditModal';
import { useT } from '../i18n';
import { getPledgeStats } from '../utils/pledgeUtils';

type DonorTab = 'overview' | 'transactions' | 'recurring' | 'pledges' | 'declined' | 'notes';

interface Props {
  donorId: string;
  onClose: () => void;
}

const hebFullName = (donor: any) => {
  const parts = [donor.preTitle, donor.hebFirstName, donor.hebLastName, donor.title].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : null;
};

export const DonorProfileModal: React.FC<Props> = ({ donorId, onClose }) => {
  const {
    donors, transactions, pledges, recurringPayments,
    updateDonorNotes, toggleRecurring, fundraisers, isRtl,
    accounts, projects
  } = useStore();
  const T = useT(isRtl);

  const [donorTab, setDonorTab] = useState<DonorTab>('overview');
  const [showPayment, setShowPayment] = useState(false);
  const [editDonorActive, setEditDonorActive] = useState(false);
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [expandedPledgeId, setExpandedPledgeId] = useState<string | null>(null);
  const [creditTransferPledgeId, setCreditTransferPledgeId] = useState<string | null>(null);

  const selectedDonor = donors.find(d => d.id === donorId);
  const [notesDraft, setNotesDraft] = useState(selectedDonor?.notes || '');

  if (!selectedDonor) return null;

  const donorTransactions = transactions.filter(t => t.donorId === donorId && !t.isBatch);
  const donorDeclined = donorTransactions.filter(t => t.type === 'declined');
  const donorRecurring = recurringPayments.filter(r => r.donorId === donorId);
  const donorPledges = pledges.filter(p => p.donorId === donorId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Sort pledges by date ascending for period calculations
  const donorPledgesSorted = [...donorPledges].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const approvedTxns = donorTransactions.filter(t => t.type === 'approved');
  const todayStr = new Date().toISOString().split('T')[0];
  const todayDate = new Date(todayStr + 'T00:00:00Z');

  // Helper: get the date-period for a pledge (start = pledge.date, end = next pledge start or far future)
  const getPledgePeriod = (pledgeId: string): { start: Date; end: Date } => {
    const idx = donorPledgesSorted.findIndex(p => p.id === pledgeId);
    const p = donorPledgesSorted[idx];
    const start = new Date(p.date + 'T00:00:00Z');
    const end = idx + 1 < donorPledgesSorted.length
      ? new Date(donorPledgesSorted[idx + 1].date + 'T00:00:00Z')
      : new Date('2099-12-31T00:00:00Z');
    return { start, end };
  };

  // Helper: payments received within a pledge's period
  const getPledgeStatsWrapper = (p: any) => {
    return getPledgeStats(p, donorPledgesSorted, donorTransactions, donorRecurring);
  };

  const pledgeStats = donorPledges.map(p => getPledgeStatsWrapper(p));
  const totalPledged = pledgeStats.reduce((s, st) => s + st.amount, 0);
  const totalPaid = pledgeStats.reduce((s, st) => s + st.paid, 0);
  const totalScheduled = pledgeStats.reduce((s, st) => s + st.scheduled, 0);
  
  // To make the math perfectly align for the user (Pledged - Paid - Scheduled), we use algebraic sum:
  const openBalance = totalPledged - totalPaid - totalScheduled;



  const methodLabel: Record<string, string> = {
    credit_card: 'Credit Card',
    ach: 'ACH / eCheck',
    check: 'Physical Check',
    cash: 'Cash',
    wire: 'Wire Transfer',
    zelle: 'Zelle',
    other: 'Other'
  };

  const statusBadge = (type: string) => {
    switch (type) {
      case 'approved': return <span className="badge badge-green">Approved</span>;
      case 'pending': return <span className="badge badge-yellow">Pending</span>;
      case 'declined': return <span className="badge badge-red">Declined</span>;
      case 'recording': return <span className="badge badge-gray">Recording</span>;
      default: return <span className="badge badge-gray">{type}</span>;
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h2 style={{ margin: 0 }}>Donor Profile</h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body">
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', flex: 1 }}>
              <div className="member-avatar" style={{ width: '56px', height: '56px', fontSize: '1.3rem', flexShrink: 0 }}>
                {selectedDonor.firstName[0]}{selectedDonor.lastName[0]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* English name row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <h2 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', color: 'var(--navy)', fontSize: '1.15rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {selectedDonor.name}
                  </h2>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditDonorActive(true)}><Edit2 size={15} /></button>
                </div>

                {/* Hebrew / Yiddish name */}
                {hebFullName(selectedDonor) && (
                  <div style={{
                    direction: 'rtl',
                    fontSize: '1.05rem',
                    fontWeight: 700,
                    color: 'var(--navy-light)',
                    background: 'var(--blue-bg)',
                    borderRadius: '8px',
                    padding: '4px 10px',
                    marginBottom: '6px',
                    display: 'inline-block',
                  }}>
                    {hebFullName(selectedDonor)}
                  </div>
                )}

                {/* ID / phone / email */}
                <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, color: 'var(--navy-light)', background: 'var(--blue-bg)', padding: '2px 8px', borderRadius: '4px' }}>
                    ID: {selectedDonor.displayId}
                  </span>
                  {selectedDonor.phone && <span>{selectedDonor.phone}</span>}
                  {selectedDonor.email && <span>· {selectedDonor.email}</span>}
                </div>
              </div>
            </div>

            {/* Total given */}
            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '2px' }}>Total Given</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--navy)', fontFamily: 'Outfit, sans-serif' }}>${selectedDonor.totalGiven.toLocaleString()}</div>
              {selectedDonor.balanceOwed > 0 && (
                <div style={{ color: 'var(--red)', fontWeight: 700, fontSize: '0.85rem' }}>Owes ${selectedDonor.balanceOwed.toLocaleString()}</div>
              )}
              {selectedDonor.balanceOwed < 0 && (
                <div style={{ color: 'var(--green)', fontWeight: 700, fontSize: '0.85rem' }}>Credit: ${Math.abs(selectedDonor.balanceOwed).toLocaleString()}</div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setShowPayment(true)}>💳 {T('process_payment')}</button>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowPayment(true)}>🔁 {T('setup_recurring')}</button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '20px', overflowX: 'auto' }}>
            {([
              ['overview', T('overview')],
              ['transactions', `${T('payments')} (${donorTransactions.filter(t => t.type !== 'declined').length})`],
              ['pledges', `Pledges (${donorPledges.length})`],
              ['recurring', `${T('recurring')} (${donorRecurring.length})`],
              ['declined', `${T('declined')} (${donorDeclined.length})`],
              ['notes', T('notes')],
            ] as [DonorTab, string][]).map(([key, label]) => (
              <button key={key} onClick={() => setDonorTab(key)} style={{
                padding: '10px 12px', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 700,
                fontSize: '0.78rem', color: donorTab === key ? 'var(--navy-light)' : 'var(--text-muted)',
                borderBottom: donorTab === key ? '3px solid var(--navy-light)' : '3px solid transparent',
                transition: 'all 0.2s', fontFamily: 'inherit', whiteSpace: 'nowrap'
              }}>{label}</button>
            ))}
          </div>

          {/* ── OVERVIEW TAB ── */}
          {donorTab === 'overview' && (
            <div>
              {/* Stats row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                {[
                  { label: T('total_given'), val: `$${selectedDonor.totalGiven.toLocaleString()}`, color: 'var(--green)' },
                  { 
                    label: selectedDonor.balanceOwed < 0 ? 'CREDIT' : T('balance_owed'), 
                    val: `$${Math.abs(selectedDonor.balanceOwed).toLocaleString()}`, 
                    color: selectedDonor.balanceOwed > 0 ? 'var(--red)' : selectedDonor.balanceOwed < 0 ? 'var(--green)' : 'var(--text-muted)' 
                  },
                  { label: T('active_recurring'), val: String(donorRecurring.filter(r => r.active).length), color: 'var(--navy-light)' },
                ].map(s => (
                  <div key={s.label} style={{ background: 'var(--bg-input)', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px' }}>{s.label}</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: s.color, fontFamily: 'Outfit, sans-serif' }}>{s.val}</div>
                  </div>
                ))}
              </div>

              {/* Yiddish / Family Info + Contact side by side */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                {/* Yiddish / Family Info */}
                <div style={{ background: 'var(--bg-input)', borderRadius: '12px', padding: '14px' }}>
                  <div style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: '10px', borderBottom: '1px solid var(--border)', paddingBottom: '6px', fontSize: '0.88rem' }}>
                    יידיש / Family Info
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', fontSize: '0.84rem' }}>
                    {[['Pre-Title (פאר טיטל)', selectedDonor.preTitle],
                      ['Hebrew First (ערשטע נאמען)', selectedDonor.hebFirstName],
                      ['Hebrew Last (משפחה)', selectedDonor.hebLastName],
                      ['Title (טיטל)', selectedDonor.title],
                      ['Post-Title', selectedDonor.postTitle],
                      ['His Father', selectedDonor.hisFather],
                      ['Her Father', selectedDonor.herFather],
                    ].map(([label, val]) => val ? (
                      <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '6px' }}>
                        <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>{label}:</span>
                        <span style={{ direction: 'rtl', textAlign: 'right', fontWeight: 600 }}>{val}</span>
                      </div>
                    ) : null)}
                    {![selectedDonor.preTitle, selectedDonor.hebFirstName, selectedDonor.hebLastName,
                       selectedDonor.title, selectedDonor.postTitle, selectedDonor.hisFather, selectedDonor.herFather].some(Boolean) && (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No Yiddish/family info on file</span>
                    )}
                  </div>
                </div>

                {/* Contact Details */}
                <div style={{ background: 'var(--bg-input)', borderRadius: '12px', padding: '14px' }}>
                  <div style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: '10px', borderBottom: '1px solid var(--border)', paddingBottom: '6px', fontSize: '0.88rem' }}>
                    Contact Details
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', fontSize: '0.84rem' }}>
                    {[['📞 Main', selectedDonor.phone],
                      ['🏠 Home', selectedDonor.homePhone],
                      ['📱 Mobile 1', selectedDonor.mobilePhone],
                      ['📱 Mobile 2', selectedDonor.mobilePhone2],
                      ['📱 Phone 3', selectedDonor.phone3],
                      ['✉️ Email', selectedDonor.email],
                      ['📍 Address', selectedDonor.address],
                      ['City', (selectedDonor as any).city],
                      ['Province', (selectedDonor as any).province],
                      ['Postal', (selectedDonor as any).postalCode],
                    ].map(([label, val]) => val ? (
                      <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', gap: '6px' }}>
                        <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>{label}:</span>
                        <span style={{ textAlign: 'right', fontWeight: 500 }}>{val}</span>
                      </div>
                    ) : null)}
                    {![selectedDonor.phone, selectedDonor.homePhone, selectedDonor.mobilePhone,
                       selectedDonor.mobilePhone2, selectedDonor.phone3, selectedDonor.email,
                       selectedDonor.address].some(Boolean) && (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No contact info on file</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── TRANSACTIONS TAB ── */}
          {donorTab === 'transactions' && (
            <div className="table-container">
              <table>
                <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Deposit</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {donorTransactions.filter(t => t.type !== 'declined').map(t => (
                    <tr key={t.id}>
                      <td>{t.date}</td>
                      <td style={{ fontWeight: 700 }}>${t.amount.toLocaleString()} {t.currency}</td>
                      <td>{methodLabel[t.method] || t.method}</td>
                      <td>
                        {t.depositStatus === 'undeposited'
                          ? <span className="badge badge-yellow">Undeposited</span>
                          : t.depositStatus === 'deposited'
                          ? <span className="badge badge-green">Deposited</span>
                          : <span className="badge badge-gray">Direct</span>}
                      </td>
                      <td>{statusBadge(t.type)}</td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditTx(t)}><Edit2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── PLEDGES TAB ── */}
          {donorTab === 'pledges' && (
            <div>
              {/* Summary bar */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
                {[
                  { label: 'Total Pledges', val: `$${totalPledged.toLocaleString()}`, color: 'var(--gold)' },
                  { label: 'Total Paid', val: `$${totalPaid.toLocaleString()}`, color: 'var(--green)' },
                  { label: 'Total Scheduled', val: `$${totalScheduled.toLocaleString()}`, color: 'var(--blue)' },
                  { label: 'Open Balance', val: `$${openBalance.toLocaleString()}`, color: openBalance > 0 ? 'var(--red)' : openBalance < 0 ? 'var(--green)' : 'var(--text-muted)' },
                ].map(s => (
                  <div key={s.label} style={{ background: 'var(--bg-input)', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px' }}>{s.label}</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: s.color, fontFamily: 'Outfit, sans-serif' }}>{s.val}</div>
                  </div>
                ))}
              </div>

              {donorPledges.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>No pledges found for this donor.</div>
              ) : (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Currency</th>
                        <th>Category</th>
                        <th>Sponsor</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {donorPledges.map((p, i) => {
                        const isExpanded = expandedPledgeId === p.id;
                        const stats = pledgeStats[i];
                        
                        // Calculate scheduledAmount and realArrears for display purposes only
                        const pledgeTxs = donorTransactions.filter(t => t.pledgeId === p.id);
                        const scheduledAmountDisplay = stats.scheduled;
                        
                        return (
                          <React.Fragment key={p.id}>
                            <tr 
                              style={{ cursor: 'pointer', background: isExpanded ? 'var(--bg-input)' : 'transparent', borderLeft: isExpanded ? '4px solid var(--navy)' : '4px solid transparent' }} 
                              onClick={() => setExpandedPledgeId(isExpanded ? null : p.id)}
                            >
                              <td>{p.date}</td>
                              <td style={{ fontWeight: 700, color: 'var(--gold)' }}>${stats.amount.toLocaleString()}</td>
                              <td>{p.currency}</td>
                              <td style={{ fontSize: '0.9rem' }}>{p.category || '—'}</td>
                              <td style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{p.sponsor || '—'}</td>
                              <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.notes || '—'}</td>
                            </tr>
                            {isExpanded && (
                              <tr style={{ background: 'var(--bg-surface)' }}>
                                <td colSpan={6} style={{ padding: '20px', borderBottom: '1px solid var(--border)' }}>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                                    
                                    <div style={{ background: 'var(--bg-panel)', padding: '12px', borderRadius: '8px' }}>
                                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Pledge</div>
                                      <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--gold)' }}>${stats.amount.toLocaleString()}</div>
                                    </div>

                                    <div style={{ background: 'var(--bg-panel)', padding: '12px', borderRadius: '8px' }}>
                                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Payments Made</div>
                                      <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--green)' }}>${stats.paid.toLocaleString()}</div>
                                    </div>

                                    <div style={{ background: 'var(--bg-panel)', padding: '12px', borderRadius: '8px' }}>
                                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Pledge Balance</div>
                                      <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--navy)' }}>${stats.balance.toLocaleString()}</div>
                                    </div>

                                    <div style={{ background: 'var(--bg-panel)', padding: '12px', borderRadius: '8px', borderLeft: '3px solid var(--blue)' }}>
                                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                        Scheduled
                                      </div>
                                      <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--blue)' }}>
                                        ${scheduledAmountDisplay.toLocaleString()}
                                      </div>
                                    </div>
                                      
                                  </div>
                                  <div style={{ marginTop: '16px', display: 'flex', gap: '12px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                                    {stats.balance > 0 ? (
                                      <button 
                                        className="btn btn-secondary" 
                                        style={{ fontSize: '0.85rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                                        onClick={() => setCreditTransferPledgeId(p.id)}
                                      >
                                        <ArrowRightLeft size={14} /> Use Credit from Other Pledge
                                      </button>
                                    ) : null}
                                    {stats.balance < 0 ? (
                                      <div style={{ fontSize: '0.85rem', color: 'var(--green)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}>
                                        <ArrowRightLeft size={14} /> This pledge is overpaid by ${Math.abs(stats.balance).toLocaleString()}
                                      </div>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          
          {/* ── RECURRING TAB ── */}
          {donorTab === 'recurring' && (
            <div>
              {donorRecurring.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>
                  {T('no_recurring')}
                </div>
              ) : (
                donorRecurring.map(r => (
                  <div key={r.id} style={{ padding: '14px', background: 'var(--bg-input)', borderRadius: '12px', marginBottom: '10px' }}>
                    <div style={{ fontWeight: 700, fontSize: '1rem' }}>${r.amount.toLocaleString()} {r.currency} / {r.frequency}</div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── NOTES TAB ── */}
          {donorTab === 'notes' && (
            <div>
              <textarea
                value={notesDraft}
                onChange={e => setNotesDraft(e.target.value)}
                rows={8}
                style={{ width: '100%' }}
              />
              <button className="btn btn-primary" style={{ marginTop: '12px' }} onClick={() => updateDonorNotes(selectedDonor.id, notesDraft)}>
                {T('save_notes')}
              </button>
            </div>
          )}

        </div>
      </div>
      
      {showPayment && <PaymentModal donorId={selectedDonor.id} onClose={() => setShowPayment(false)} />}
      {editDonorActive && <AddDonorModal editDonorData={selectedDonor} onClose={() => setEditDonorActive(false)} />}
      {creditTransferPledgeId && (
        <TransferCreditModal 
          donorId={donorId} 
          targetPledgeId={creditTransferPledgeId} 
          targetPledgeBalance={Math.max(0, (donorPledges.find(p => p.id === creditTransferPledgeId)?.amountCAD ?? donorPledges.find(p => p.id === creditTransferPledgeId)?.amount ?? 0) - donorTransactions.filter(t => t.pledgeId === creditTransferPledgeId && t.type === 'approved').reduce((sum, t) => sum + (t.amountCAD ?? t.amount), 0))}
          onClose={() => setCreditTransferPledgeId(null)} 
        />
      )}

      {editTx && (
        <div className="modal-overlay" onClick={() => setEditTx(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ margin: 0 }}>Edit Transaction</h2>
              <button className="modal-close" onClick={() => setEditTx(null)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gap: '16px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Amount</label>
                  <input type="number" value={editTx.amount} onChange={e => setEditTx({ ...editTx, amount: parseFloat(e.target.value) || 0 })} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Status</label>
                    <select value={editTx.type} onChange={e => setEditTx({ ...editTx, type: e.target.value as any })}>
                      <option value="approved">Approved</option>
                      <option value="pending">Pending</option>
                      <option value="recording">Recording / Pledge</option>
                      <option value="declined">Declined</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Method</label>
                    <select value={editTx.method} onChange={e => setEditTx({ ...editTx, method: e.target.value as any })}>
                      <option value="credit_card">Credit Card</option>
                      <option value="check">Check</option>
                      <option value="cash">Cash</option>
                      <option value="e_transfer">E-Transfer</option>
                      <option value="vouchers">Vouchers</option>
                      <option value="eizer">Eizer</option>
                      <option value="bnei_leivy">Bnei Leivy</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Date</label>
                    <input type="date" value={editTx.date} onChange={e => setEditTx({ ...editTx, date: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Project Tag</label>
                    <select value={editTx.projectId || ''} onChange={e => setEditTx({ ...editTx, projectId: e.target.value || undefined })}>
                      <option value="">— No Project —</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Asset Account (Deposited To)</label>
                    <select value={editTx.sourceAccountId || ''} onChange={e => setEditTx({ ...editTx, sourceAccountId: e.target.value })}>
                      <option value="">-- None --</option>
                      {['asset', 'liability', 'equity', 'revenue'].map(type => {
                        const typeAccounts = accounts.filter(a => a.type === type);
                        if (typeAccounts.length === 0) return null;
                        return (
                          <optgroup key={type} label={type.toUpperCase()}>
                            {typeAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </optgroup>
                        );
                      })}
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Revenue Account</label>
                    <select value={editTx.offsetAccountId || ''} onChange={e => setEditTx({ ...editTx, offsetAccountId: e.target.value })}>
                      <option value="">-- None --</option>
                      {['asset', 'liability', 'equity', 'revenue'].map(type => {
                        const typeAccounts = accounts.filter(a => a.type === type);
                        if (typeAccounts.length === 0) return null;
                        return (
                          <optgroup key={type} label={type.toUpperCase()}>
                            {typeAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </optgroup>
                        );
                      })}
                    </select>
                  </div>
                </div>
                {/* Pledge Dropdown */}
                {donorPledges.length > 0 && (
                  <div className="form-group" style={{ margin: 0, padding: '12px', background: 'var(--gold-bg)', borderRadius: '8px', border: '1px solid rgba(217, 119, 6, 0.2)' }}>
                    <label style={{ color: 'var(--gold)', fontWeight: 700 }}>Apply to Existing Pledge (Optional)</label>
                    <select value={editTx.pledgeId || ''} onChange={e => setEditTx({ ...editTx, pledgeId: e.target.value || undefined })} style={{ border: '1px solid rgba(217, 119, 6, 0.4)' }}>
                      <option value="">— Do not apply to a pledge —</option>
                      {donorPledges.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.date} - ${p.amount.toLocaleString()} ({p.category || 'Pledge'})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditTx(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => { 
                useStore.getState().editTransaction(editTx.id, editTx);
                setEditTx(null); 
              }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
