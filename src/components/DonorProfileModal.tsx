import React, { useState } from 'react';
import { useStore, type Transaction } from '../store';
import { Edit2, X } from 'lucide-react';
import { PaymentModal } from './PaymentModal';
import { AddDonorModal } from './AddDonorModal';
import { useT } from '../i18n';

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
    accounts
  } = useStore();
  const T = useT(isRtl);

  const [donorTab, setDonorTab] = useState<DonorTab>('overview');
  const [showPayment, setShowPayment] = useState(false);
  const [editDonorActive, setEditDonorActive] = useState(false);
  const [editTx, setEditTx] = useState<Transaction | null>(null);

  const selectedDonor = donors.find(d => d.id === donorId);
  const [notesDraft, setNotesDraft] = useState(selectedDonor?.notes || '');

  if (!selectedDonor) return null;

  const donorTransactions = transactions.filter(t => t.donorId === donorId && !t.isBatch);
  const donorDeclined = donorTransactions.filter(t => t.type === 'declined');
  const donorRecurring = recurringPayments.filter(r => r.donorId === donorId);
  const donorPledges = pledges.filter(p => p.donorId === donorId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Calculate open balance per pledge (total pledged minus total paid)
  const totalPaid = donorTransactions
    .filter(t => t.type === 'approved')
    .reduce((sum, t) => sum + (t.amountCAD ?? t.amount), 0);
  const totalPledged = donorPledges.reduce((sum, p) => sum + (p.amountCAD ?? p.amount), 0);
  const openBalance = Math.max(0, totalPledged - totalPaid);

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
                  { label: T('balance_owed'), val: `$${selectedDonor.balanceOwed.toLocaleString()}`, color: selectedDonor.balanceOwed > 0 ? 'var(--red)' : 'var(--text-muted)' },
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '6px' }}>
                      <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Pre-Title:</span>
                      <span style={{ direction: 'rtl', textAlign: 'right', fontWeight: 600 }}>{selectedDonor.preTitle || '—'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '6px' }}>
                      <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Title:</span>
                      <span style={{ direction: 'rtl', textAlign: 'right', fontWeight: 600 }}>{selectedDonor.title || '—'}</span>
                    </div>
                  </div>
                </div>

                {/* Contact Details */}
                <div style={{ background: 'var(--bg-input)', borderRadius: '12px', padding: '14px' }}>
                  <div style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: '10px', borderBottom: '1px solid var(--border)', paddingBottom: '6px', fontSize: '0.88rem' }}>
                    Contact Details
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', fontSize: '0.84rem' }}>
                    {selectedDonor.homePhone && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px' }}>
                        <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', minWidth: '58px' }}>Home:</span>
                        <span>{selectedDonor.homePhone}</span>
                      </div>
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
                <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Deposit</th><th>Status</th></tr></thead>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                {[
                  { label: 'Total Pledged', val: `$${totalPledged.toLocaleString()}`, color: 'var(--gold)' },
                  { label: 'Total Paid', val: `$${totalPaid.toLocaleString()}`, color: 'var(--green)' },
                  { label: 'Open Balance', val: `$${openBalance.toLocaleString()}`, color: openBalance > 0 ? 'var(--red)' : 'var(--text-muted)' },
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
                      {donorPledges.map(p => (
                        <tr key={p.id}>
                          <td>{p.date}</td>
                          <td style={{ fontWeight: 700, color: 'var(--gold)' }}>${(p.amountCAD ?? p.amount).toLocaleString()}</td>
                          <td>{p.currency}</td>
                          <td style={{ fontSize: '0.9rem' }}>{p.category || '—'}</td>
                          <td style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{p.sponsor || '—'}</td>
                          <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.notes || '—'}</td>
                        </tr>
                      ))}
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
    </div>
  );
};
