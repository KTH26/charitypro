import React, { useState } from 'react';
import { useStore, type Transaction } from '../store';
import { Search, ChevronRight, Edit2, X } from 'lucide-react';
import { PaymentModal } from '../components/PaymentModal';
import { AddDonorModal } from '../components/AddDonorModal';
import { useLocation } from 'react-router-dom';
import { useT } from '../i18n';
import Papa from 'papaparse';

type DonorTab = 'overview' | 'transactions' | 'recurring' | 'declined' | 'notes';

export const Donors: React.FC = () => {
  const { donors, transactions, recurringPayments, updateDonorNotes, toggleRecurring, fundraisers, isRtl, googleSheetSyncUrl, setGoogleSheetSyncUrl, addDonor, editDonor } = useStore();
  const T = useT(isRtl);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterFundraiser, setFilterFundraiser] = useState('');
  const [sortBy, setSortBy] = useState<'lastName' | 'firstName'>('lastName');
  const [selectedDonorId, setSelectedDonorId] = useState<string | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [showAddDonor, setShowAddDonor] = useState(false);
  const [donorTab, setDonorTab] = useState<DonorTab>('overview');
  const [notesDraft, setNotesDraft] = useState('');
  const [editDonorActive, setEditDonorActive] = useState(false);
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [tempUrl, setTempUrl] = useState(googleSheetSyncUrl);
  const location = useLocation();

  React.useEffect(() => {
    const params = new URLSearchParams(location.search);
    const donorIdParam = params.get('donorId');
    if (donorIdParam && donors.some(d => d.id === donorIdParam)) {
      selectDonor(donorIdParam);
    }
  }, [location.search, donors]);

  const filteredDonors = donors.filter(d => {
    const matchSearch = d.name.toLowerCase().includes(searchTerm.toLowerCase()) || d.phone.includes(searchTerm) || d.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchFundraiser = filterFundraiser ? d.fundraiserId === filterFundraiser : true;
    return matchSearch && matchFundraiser;
  }).sort((a, b) => a[sortBy].localeCompare(b[sortBy]));

  const selectedDonor = donors.find(d => d.id === selectedDonorId);

  const donorTransactions = transactions.filter(t => t.donorId === selectedDonorId);
  const donorDeclined = donorTransactions.filter(t => t.type === 'declined');
  const donorRecurring = recurringPayments.filter(r => r.donorId === selectedDonorId);

  const selectDonor = (id: string) => {
    const d = donors.find(x => x.id === id);
    setSelectedDonorId(id);
    setDonorTab('overview');
    setNotesDraft(d?.notes || '');
  };

  const statusBadge = (type: string) => {
    const map: Record<string, string> = {
      approved: 'badge-success', pending: 'badge-warning', recording: 'badge-info', declined: 'badge-danger'
    };
    return <span className={`badge ${map[type] || 'badge-gray'}`}>{type.charAt(0).toUpperCase() + type.slice(1)}</span>;
  };

  const methodLabel: Record<string, string> = {
    credit_card: 'Credit Card', check: 'Check', cash: 'Cash', e_transfer: 'E-Transfer'
  };

  const handleSync = async (urlToSync: string) => {
    if (!urlToSync) return;
    setSyncing(true);
    try {
      const response = await fetch(urlToSync);
      const csvText = await response.text();
      
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const data = results.data as any[];
          data.forEach(row => {
            const displayId = row['CODE']?.toString().trim();
            if (!displayId) return; // Skip if no ID

            const existing = donors.find(d => d.displayId === displayId);
            
            const donorUpdates = {
              firstName: row['HID First name']?.toString().trim() || row[' title ערשטע נאמען']?.toString().trim() || row['HH Given Names']?.toString().trim() || '',
              lastName: row['Last name']?.toString().trim() || row['משפחה נאמען']?.toString().trim() || row['HH Surname']?.toString().trim() || '',
              email: row['Email']?.toString().trim() || '',
              phone: row['MobilePhone']?.toString().trim() || row['HomePhone']?.toString().trim() || '',
              address: row['Street'] ? `${row['No.'] || ''} ${row['Street']} ${row['Type'] || ''} ${row['Building #'] ? `Bldg ${row['Building #']}` : ''} ${row['Apt.'] ? `Apt ${row['Apt.']}` : ''} ${row['Postel Code'] || ''}`.trim() : (row['HID Adress']?.toString().trim() || row['HH Address (columns J, I, and H combined)']?.toString().trim() || ''),
              notes: row['HID Note']?.toString().trim() || '',
              displayId,
              hebFirstName: row[' title ערשטע נאמען']?.toString().trim() || '',
              hebLastName: row['משפחה נאמען']?.toString().trim() || '',
              title: row['טיטל']?.toString().trim() || '',
              postTitle: row['נאך טיטל']?.toString().trim() || '',
              doubleNames: row['דאפעלטע נעמען']?.toString().trim() || '',
              hisFather: row['זיין טאטע']?.toString().trim() || '',
              herFather: row['איר טאטע']?.toString().trim() || '',
              householdFullName: row['Household Full Name']?.toString().trim() || '',
              allMaiden: row['All Maiden']?.toString().trim() || '',
              homePhone: row['HomePhone']?.toString().trim() || '',
              mobilePhone: row['MobilePhone']?.toString().trim() || '',
              mobilePhone2: row['MobilePhone2']?.toString().trim() || '',
              phone3: row['Phone 3']?.toString().trim() || '',
              confidentialMobile: row['Confidentiel Mobile Phone not to display']?.toString().trim() || '',
              confidentialMobile2: row['2 Confidentiel Mobile Phone not to display']?.toString().trim() || '',
              addrBuildingNum: row['Building #']?.toString().trim() || '',
              addrStreet: row['Street']?.toString().trim() || '',
              addrApt: row['Apt.']?.toString().trim() || '',
              addrType: row['Type']?.toString().trim() || '',
              addrNo: row['No.']?.toString().trim() || '',
              addrPostalCode: row['Postel Code']?.toString().trim() || '',
              addrLandlord: row['Landlord']?.toString().trim() || '',
            };

            if (existing) {
              editDonor(existing.id, donorUpdates);
            } else {
              addDonor(donorUpdates);
            }
          });
          setSyncing(false);
          setShowSyncModal(false);
        },
        error: (err: any) => {
          setSyncing(false);
          alert('Error parsing CSV: ' + err.message);
        }
      });
    } catch (err: any) {
      setSyncing(false);
      alert('Error downloading CSV: ' + err.message);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: selectedDonor ? '1fr 450px' : '1fr', gap: '24px', direction: 'ltr', alignItems: 'start' }}>
      {/* LEFT COLUMN: DONOR LIST */}
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontFamily: 'Outfit, sans-serif', fontWeight: 700, color: 'var(--navy)' }}>
            {T('donors_dir')} ({filteredDonors.length})
          </h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => {
              if (googleSheetSyncUrl) handleSync(googleSheetSyncUrl);
              else setShowSyncModal(true);
            }} disabled={syncing}>
              {syncing ? 'Syncing...' : '🔄 Sync Sheets'}
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddDonor(true)}>+ {T('add_donor')}</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div className="search-box" style={{ flex: 1, minWidth: '180px' }}>
            <Search className="search-icon" size={18} />
            <input type="text" placeholder={T('search_donors')} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <select className="filter-select" value={filterFundraiser} onChange={e => setFilterFundraiser(e.target.value)} style={{ minWidth: '150px' }}>
            <option value="">{T('all_fundraisers')}</option>
            {fundraisers.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <select className="filter-select" value={sortBy} onChange={e => setSortBy(e.target.value as any)} style={{ minWidth: '150px' }}>
            <option value="lastName">Sort by Last Name</option>
            <option value="firstName">Sort by First Name</option>
          </select>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>{T('name')}</th>
                <th>{T('phone')}</th>
                <th>{T('given')}</th>
                <th>{T('balance')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredDonors.map(donor => (
                <tr key={donor.id}
                  style={{ cursor: 'pointer', background: selectedDonorId === donor.id ? 'var(--navy-bg)' : '' }}
                  onClick={() => selectDonor(donor.id)}
                >
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div className="member-avatar" style={{ width: '36px', height: '36px', fontSize: '0.85rem' }}>{donor.firstName[0]}{donor.lastName[0]}</div>
                      <div>
                        <div className="member-name" style={{ fontSize: '0.95rem' }}>{donor.name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ID: {donor.displayId} · {donor.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ fontSize: '0.9rem' }}>{donor.phone}</td>
                  <td style={{ color: 'var(--green)', fontWeight: 700 }}>${donor.totalGiven.toLocaleString()}</td>
                  <td>
                    {donor.balanceOwed > 0
                      ? <span style={{ color: 'var(--red)', fontWeight: 700 }}>${donor.balanceOwed.toLocaleString()}</span>
                      : <span style={{ color: 'var(--green)' }}>—</span>
                    }
                  </td>
                  <td><ChevronRight size={16} style={{ color: 'var(--text-muted)' }} /></td>
                </tr>
              ))}
              {filteredDonors.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>{T('no_donors')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* RIGHT COLUMN: DONOR DETAILS PANEL */}
      {selectedDonor && (
        <div className="card slide-in-right" style={{ padding: '24px', position: 'sticky', top: '24px' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
              <div className="member-avatar" style={{ width: '64px', height: '64px', fontSize: '1.5rem' }}>{selectedDonor.firstName[0]}{selectedDonor.lastName[0]}</div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h2 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', color: 'var(--navy)' }}>{selectedDonor.name}</h2>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditDonorActive(true)}><Edit2 size={16} /></button>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontWeight: 800, color: 'var(--navy-light)', background: 'var(--blue-bg)', padding: '2px 8px', borderRadius: '4px' }}>
                    ID: {selectedDonor.displayId}
                  </span>
                  <span>{selectedDonor.phone}</span>
                  <span>· {selectedDonor.email}</span>
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Total Given</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--navy)', fontFamily: 'Outfit, sans-serif' }}>${selectedDonor.totalGiven.toLocaleString()}</div>
              {selectedDonor.balanceOwed > 0 && (
                <div style={{ color: 'var(--red)', fontWeight: 700, fontSize: '0.95rem' }}>Owes ${selectedDonor.balanceOwed.toLocaleString()}</div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setShowPayment(true)}>💳 {T('process_payment')}</button>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowPayment(true)}>🔁 {T('setup_recurring')}</button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '20px' }}>
            {([
              ['overview', T('overview')],
              ['transactions', `${T('payments')} (${donorTransactions.filter(t => t.type !== 'declined').length})`],
              ['recurring', `${T('recurring')} (${donorRecurring.length})`],
              ['declined', `${T('declined')} (${donorDeclined.length})`],
              ['notes', T('notes')],
            ] as [DonorTab, string][]).map(([key, label]) => (
              <button key={key} onClick={() => setDonorTab(key)} style={{
                padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 700,
                fontSize: '0.82rem', color: donorTab === key ? 'var(--navy-light)' : 'var(--text-muted)',
                borderBottom: donorTab === key ? '3px solid var(--navy-light)' : '3px solid transparent',
                transition: 'all 0.2s', fontFamily: 'inherit', whiteSpace: 'nowrap'
              }}>{label}</button>
            ))}
          </div>

          {/* Overview tab */}
          {donorTab === 'overview' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                {[
                  { label: T('total_given'), val: `$${selectedDonor.totalGiven.toLocaleString()}`, color: 'var(--green)' },
                  { label: T('balance_owed'), val: `$${selectedDonor.balanceOwed.toLocaleString()}`, color: selectedDonor.balanceOwed > 0 ? 'var(--red)' : 'var(--text-muted)' },
                  { label: T('active_recurring'), val: String(donorRecurring.filter(r => r.active).length), color: 'var(--navy-light)' },
                ].map(s => (
                  <div key={s.label} style={{ background: 'var(--bg-input)', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>{s.label}</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: s.color, fontFamily: 'Outfit, sans-serif' }}>{s.val}</div>
                  </div>
                ))}
              </div>

              {/* Detailed Donor Info Sections */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                {/* Hebrew/Family Info */}
                <div style={{ background: 'var(--bg-input)', borderRadius: '12px', padding: '16px' }}>
                  <div style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: '12px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>Yiddish / Family Info</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '8px', fontSize: '0.85rem' }}>
                    {selectedDonor.title && <><span style={{ color: 'var(--text-muted)' }}>Title:</span> <span style={{ direction: 'rtl', textAlign: 'right' }}>{selectedDonor.title}</span></>}
                    {selectedDonor.hebFirstName && <><span style={{ color: 'var(--text-muted)' }}>First:</span> <span style={{ direction: 'rtl', textAlign: 'right' }}>{selectedDonor.hebFirstName}</span></>}
                    {selectedDonor.hebLastName && <><span style={{ color: 'var(--text-muted)' }}>Last:</span> <span style={{ direction: 'rtl', textAlign: 'right' }}>{selectedDonor.hebLastName}</span></>}
                    {selectedDonor.postTitle && <><span style={{ color: 'var(--text-muted)' }}>Post-Title:</span> <span style={{ direction: 'rtl', textAlign: 'right' }}>{selectedDonor.postTitle}</span></>}
                    {selectedDonor.hisFather && <><span style={{ color: 'var(--text-muted)' }}>His Father:</span> <span style={{ direction: 'rtl', textAlign: 'right' }}>{selectedDonor.hisFather}</span></>}
                    {selectedDonor.herFather && <><span style={{ color: 'var(--text-muted)' }}>Her Father:</span> <span style={{ direction: 'rtl', textAlign: 'right' }}>{selectedDonor.herFather}</span></>}
                  </div>
                </div>

                {/* Additional Contact Info */}
                <div style={{ background: 'var(--bg-input)', borderRadius: '12px', padding: '16px' }}>
                  <div style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: '12px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>Contact Details</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '8px', fontSize: '0.85rem' }}>
                    {selectedDonor.homePhone && <><span style={{ color: 'var(--text-muted)' }}>Home:</span> <span>{selectedDonor.homePhone}</span></>}
                    {selectedDonor.mobilePhone && <><span style={{ color: 'var(--text-muted)' }}>Mobile 1:</span> <span>{selectedDonor.mobilePhone}</span></>}
                    {selectedDonor.mobilePhone2 && <><span style={{ color: 'var(--text-muted)' }}>Mobile 2:</span> <span>{selectedDonor.mobilePhone2}</span></>}
                    {selectedDonor.phone3 && <><span style={{ color: 'var(--text-muted)' }}>Phone 3:</span> <span>{selectedDonor.phone3}</span></>}
                    {selectedDonor.confidentialMobile && <><span style={{ color: 'var(--text-muted)' }}>Private 1:</span> <span>{selectedDonor.confidentialMobile}</span></>}
                    {selectedDonor.confidentialMobile2 && <><span style={{ color: 'var(--text-muted)' }}>Private 2:</span> <span>{selectedDonor.confidentialMobile2}</span></>}
                  </div>
                </div>
              </div>

              {/* Address Breakdown */}
              <div style={{ background: 'var(--bg-input)', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
                <div style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: '12px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>Full Address Breakdown</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px', fontSize: '0.85rem' }}>
                  {selectedDonor.addrNo && <div><div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>No.</div><div style={{ fontWeight: 600 }}>{selectedDonor.addrNo}</div></div>}
                  {selectedDonor.addrStreet && <div><div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Street</div><div style={{ fontWeight: 600 }}>{selectedDonor.addrStreet}</div></div>}
                  {selectedDonor.addrType && <div><div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Type</div><div style={{ fontWeight: 600 }}>{selectedDonor.addrType}</div></div>}
                  {selectedDonor.addrBuildingNum && <div><div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Building #</div><div style={{ fontWeight: 600 }}>{selectedDonor.addrBuildingNum}</div></div>}
                  {selectedDonor.addrApt && <div><div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Apt</div><div style={{ fontWeight: 600 }}>{selectedDonor.addrApt}</div></div>}
                  {selectedDonor.addrPostalCode && <div><div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Postal Code</div><div style={{ fontWeight: 600 }}>{selectedDonor.addrPostalCode}</div></div>}
                  {selectedDonor.addrLandlord && <div><div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Landlord</div><div style={{ fontWeight: 600 }}>{selectedDonor.addrLandlord}</div></div>}
                </div>
              </div>

              {selectedDonor.cards && selectedDonor.cards.length > 0 && (
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>{T('cards_on_file')}</div>
                  {selectedDonor.cards.map(card => (
                    <div key={card.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--bg-input)', borderRadius: '10px', marginBottom: '8px', border: card.isDefault ? '1px solid var(--navy-light)' : '1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{card.brand} ending in {card.last4}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Expires {card.expiry}</div>
                      </div>
                      {card.isDefault && <span className="badge badge-info">Default</span>}
                    </div>
                  ))}
                </div>
              )}
              {selectedDonor.fundraiserId && (
                <div style={{ marginTop: '16px', padding: '12px 16px', background: 'var(--yellow-bg)', borderRadius: '10px', border: '1px solid rgba(217,119,6,0.2)' }}>
                  <div style={{ color: 'var(--yellow)', fontWeight: 700, fontSize: '0.85rem' }}>
                    🤝 {T('referred_by')}: {fundraisers.find(f => f.id === selectedDonor.fundraiserId)?.name || '—'}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Transactions tab */}
          {donorTab === 'transactions' && (
            <div className="table-container">
              <table>
                <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {donorTransactions.filter(t => t.type !== 'declined').map(t => (
                    <tr key={t.id}>
                      <td>{t.date}</td>
                      <td style={{ fontWeight: 700 }}>${t.amount.toLocaleString()} {t.currency}</td>
                      <td>{methodLabel[t.method]}</td>
                      <td>{statusBadge(t.type)}</td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditTx(t)}><Edit2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
                  {donorTransactions.filter(t => t.type !== 'declined').length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px' }}>{T('no_donors')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Recurring tab */}
          {donorTab === 'recurring' && (
            <div>
              {donorRecurring.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🔁</div>
                  {T('no_recurring')}
                  <br /><br />
                  <button className="btn btn-primary" onClick={() => setShowPayment(true)}>+ {T('setup_recurring')}</button>
                </div>
              ) : (
                donorRecurring.map(r => (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'var(--bg-input)', borderRadius: '12px', marginBottom: '10px', border: `1px solid ${r.active ? 'var(--green-bg)' : 'var(--border)'}` }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>${r.amount.toLocaleString()} {r.currency} / {r.frequency}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Next: {r.nextDate} · via {methodLabel[r.method]}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span className={`badge ${r.active ? 'badge-green' : 'badge-gray'}`}>{r.active ? (isRtl ? 'אַקטיוו' : 'Active') : (isRtl ? 'פּאָזירט' : 'Paused')}</span>
                      <button className="btn btn-secondary btn-sm" onClick={() => toggleRecurring(r.id)}>
                        {r.active ? (isRtl ? 'פּאָזירן' : 'Pause') : (isRtl ? 'ווידעראויפֿנעמען' : 'Resume')}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Declined tab */}
          {donorTab === 'declined' && (
            <div className="table-container">
              <table>
                <thead><tr><th>Date</th><th>Amount</th><th>Notes</th></tr></thead>
                <tbody>
                  {donorDeclined.map(t => (
                    <tr key={t.id}>
                      <td>{t.date}</td>
                      <td style={{ fontWeight: 700, color: 'var(--red)' }}>${t.amount.toLocaleString()} {t.currency}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t.notes || '—'}</td>
                    </tr>
                  ))}
                  {donorDeclined.length === 0 && (
                    <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--green)', padding: '30px' }}>{T('no_declined')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Notes tab */}
          {donorTab === 'notes' && (
            <div>
              <textarea
                value={notesDraft}
                onChange={e => setNotesDraft(e.target.value)}
                rows={8}
                placeholder={T('notes_placeholder')}
                style={{ width: '100%' }}
              />
              <button className="btn btn-primary" style={{ marginTop: '12px' }} onClick={() => updateDonorNotes(selectedDonor.id, notesDraft)}>
                {T('save_notes')}
              </button>
            </div>
          )}
        </div>
      )}

      {showAddDonor && <AddDonorModal onClose={() => setShowAddDonor(false)} />}
      {showPayment && selectedDonorId && <PaymentModal donorId={selectedDonorId} onClose={() => setShowPayment(false)} />}
      
      {showSyncModal && (
        <div className="modal-overlay" onClick={() => setShowSyncModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ margin: 0 }}>Configure Google Sheets Sync</h2>
              <button className="modal-close" onClick={() => setShowSyncModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group" style={{ margin: 0 }}>
                <label>Published CSV Link</label>
                <input 
                  type="text" 
                  placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv" 
                  value={tempUrl} 
                  onChange={e => setTempUrl(e.target.value)} 
                />
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px', marginBottom: 0 }}>
                  In Google Sheets, go to File &gt; Share &gt; Publish to Web. Choose the specific sheet and "Comma-separated values (.csv)", then paste the link here.
                </p>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowSyncModal(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={!tempUrl || syncing} onClick={() => {
                setGoogleSheetSyncUrl(tempUrl);
                handleSync(tempUrl);
              }}>
                {syncing ? 'Syncing...' : 'Save & Sync'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Modals */}
      {showAddDonor && (
        <AddDonorModal onClose={() => setShowAddDonor(false)} />
      )}
      {editDonorActive && selectedDonor && (
        <AddDonorModal editDonorData={selectedDonor} onClose={() => setEditDonorActive(false)} />
      )}
      
      {/* Reusing Edit Transaction UI inline */}
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
                    </select>
                  </div>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Date</label>
                  <input type="date" value={editTx.date} onChange={e => setEditTx({ ...editTx, date: e.target.value })} />
                </div>
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
