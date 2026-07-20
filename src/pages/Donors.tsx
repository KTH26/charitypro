import React, { useState } from 'react';
import { useStore, type DonorSortKey } from '../store';
import { Search, ChevronRight } from 'lucide-react';
import { AddDonorModal } from '../components/AddDonorModal';
import { DonorProfileModal } from '../components/DonorProfileModal';
import { useLocation } from 'react-router-dom';
import { useT } from '../i18n';
import Papa from 'papaparse';


const SORT_OPTIONS: { value: DonorSortKey; label: string }[] = [
  { value: 'lastName',     label: 'Sort by English Last Name' },
  { value: 'firstName',    label: 'Sort by English First Name' },
  { value: 'hebLastName',  label: 'Sort by Hebrew Last Name (יידיש)' },
  { value: 'hebFirstName', label: 'Sort by Hebrew First Name (יידיש)' },
];

export const Donors: React.FC = () => {
  const {
    donors, transactions, recurringPayments,
    updateDonorNotes, toggleRecurring, fundraisers, isRtl,
    googleSheetSyncUrl, setGoogleSheetSyncUrl, addDonor, editDonor,
    donorSortBy, setDonorSortBy, deleteDonors, accounts
  } = useStore();
  const T = useT(isRtl);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterFundraiser, setFilterFundraiser] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 50;
  const [selectedDonorId, setSelectedDonorId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showAddDonor, setShowAddDonor] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [tempUrl, setTempUrl] = useState(googleSheetSyncUrl);
  const location = useLocation();

  React.useEffect(() => {
    const params = new URLSearchParams(location.search);
    const donorIdParam = params.get('donorId');
    if (donorIdParam && donors.some(d => d.id === donorIdParam)) {
      selectDonor(donorIdParam);
    }
  }, [location.search, donors]);

  const getSortValue = (d: typeof donors[0], key: DonorSortKey): string => {
    if (key === 'hebLastName')  return d.hebLastName  || d.lastName  || '';
    if (key === 'hebFirstName') return d.hebFirstName || d.firstName || '';
    return (d[key] as string) || '';
  };

  const filteredDonors = donors.filter(d => {
    const matchSearch =
      d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.phone.includes(searchTerm) ||
      d.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d.hebFirstName || '').includes(searchTerm) ||
      (d.hebLastName  || '').includes(searchTerm);
    const matchFundraiser = filterFundraiser ? d.fundraiserId === filterFundraiser : true;
    return matchSearch && matchFundraiser;
  }).sort((a, b) => getSortValue(a, donorSortBy).localeCompare(getSortValue(b, donorSortBy)));

  const totalPages = Math.ceil(filteredDonors.length / PAGE_SIZE);
  const paginatedDonors = filteredDonors.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const selectDonor = (id: string) => {
    setSelectedDonorId(id);
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(filteredDonors.map(d => d.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const statusBadge = (type: string) => {
    const map: Record<string, string> = {
      approved: 'badge-success', pending: 'badge-warning', recording: 'badge-info', declined: 'badge-danger'
    };
    return <span className={`badge ${map[type] || 'badge-gray'}`}>{type.charAt(0).toUpperCase() + type.slice(1)}</span>;
  };

  const methodLabel: Record<string, string> = {
    credit_card: 'Credit Card', check: 'Check', cash: 'Cash', e_transfer: 'E-Transfer', vouchers: 'Vouchers', eizer: 'Eizer', bnei_leivy: 'Bnei Leivy', other: 'Other'
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
          const upserts: any[] = [];
          data.forEach(row => {
            const displayId = row['CODE']?.toString().trim();
            if (!displayId) return;

            const donorUpdates = {
              firstName: row['HID First name']?.toString().trim() || row[' title ערשטע נאמען']?.toString().trim() || row['HH Given Names']?.toString().trim() || '',
              lastName: row['Last name']?.toString().trim() || row['משפחה נאמען']?.toString().trim() || row['HH Surname']?.toString().trim() || '',
              email: row['Email']?.toString().trim() || '',
              phone: row['MobilePhone']?.toString().trim() || row['HomePhone']?.toString().trim() || '',
              address: row['Street'] ? `${row['No.'] || ''} ${row['Street']} ${row['Type'] || ''} ${row['Building #'] ? `Bldg ${row['Building #']}` : ''} ${row['Apt.'] ? `Apt ${row['Apt.']}` : ''} ${row['Postel Code'] || ''}`.trim() : (row['HID Adress']?.toString().trim() || row['HH Address (columns J, I, and H combined)']?.toString().trim() || ''),
              notes: row['HID Note']?.toString().trim() || '',
              displayId,
              hebFirstName: row['ערשטע נאמען']?.toString().trim() || '',
              hebLastName: row['משפחה נאמען']?.toString().trim() || '',
              preTitle: (row['title'] ?? row['Title'] ?? row[' title'] ?? row['title '] ?? row['Title '] ?? row[' TITLE '])?.toString().trim() || '',
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
            upserts.push(donorUpdates);
          });
          if (upserts.length > 0) {
            useStore.getState().bulkUpsertDonors(upserts);
          } else {
            alert("No donors were found in the link you provided. Please make sure the link ends with 'pub?output=csv' and that your sheet has a 'CODE' column.");
          }
          setSyncing(false);
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

  // Yiddish full name: preTitle · hebFirstName · hebLastName · title
  const hebFullName = (d: typeof donors[0] | undefined) => {
    if (!d) return '';
    const parts = [d.preTitle, d.hebFirstName, d.hebLastName, d.title].filter(Boolean);
    return parts.join(' ');
  };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr',
      gap: '24px',
      direction: 'ltr',
    }}>
      {/* LEFT COLUMN: DONOR LIST */}
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontFamily: 'Outfit, sans-serif', fontWeight: 700, color: 'var(--navy)' }}>
            {T('donors_dir')} ({filteredDonors.length})
          </h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {googleSheetSyncUrl ? (
              <button className="btn btn-secondary btn-sm" onClick={() => handleSync(googleSheetSyncUrl)} disabled={syncing}>
                {syncing ? '⏳ Syncing...' : '🔄 Sync'}
              </button>
            ) : (
              <a href="/settings" style={{ fontSize: '0.8rem', color: 'var(--navy-light)', textDecoration: 'underline', whiteSpace: 'nowrap' }}>
                ⚙️ Configure Sheet URL in Settings
              </a>
            )}
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddDonor(true)}>+ {T('add_donor')}</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div className="search-box" style={{ flex: 1, minWidth: '180px' }}>
            <Search className="search-icon" size={18} />
            <input type="text" placeholder={T('search_donors')} value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }} />
          </div>
          <select className="filter-select" value={filterFundraiser} onChange={e => { setFilterFundraiser(e.target.value); setCurrentPage(1); }} style={{ minWidth: '130px' }}>
            <option value="">{T('all_fundraisers')}</option>
            {fundraisers.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <select
            className="filter-select"
            value={donorSortBy}
            onChange={e => setDonorSortBy(e.target.value as DonorSortKey)}
            style={{ minWidth: '220px' }}
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {selectedIds.length > 0 && (
          <div style={{ background: 'var(--red-bg)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '12px 16px', borderRadius: '12px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--red)', fontWeight: 600 }}>{selectedIds.length} donors selected</span>
            <button className="btn btn-sm" style={{ background: 'var(--red)', color: 'white', border: 'none' }} onClick={() => {
              if (window.confirm(`Are you sure you want to permanently delete ${selectedIds.length} donors and all their associated transactions/pledges?`)) {
                deleteDonors(selectedIds);
                setSelectedIds([]);
                if (selectedDonorId && selectedIds.includes(selectedDonorId)) {
                  setSelectedDonorId(null);
                }
              }
            }}>Delete Selected</button>
          </div>
        )}

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input type="checkbox" checked={selectedIds.length === paginatedDonors.length && paginatedDonors.length > 0} onChange={handleSelectAll} />
                </th>
                <th>{T('name')}</th>
                <th>{T('phone')}</th>
                <th>{T('given')}</th>
                <th>{T('balance')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {paginatedDonors.map(donor => (
                <tr key={donor.id}
                  style={{ cursor: 'pointer', background: selectedDonorId === donor.id ? 'var(--navy-bg)' : '' }}
                  onClick={() => selectDonor(donor.id)}
                >
                  <td onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedIds.includes(donor.id)} onChange={() => handleSelect(donor.id)} />
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div className="member-avatar" style={{ width: '36px', height: '36px', fontSize: '0.85rem' }}>
                        {donor.firstName[0]}{donor.lastName[0]}
                      </div>
                      <div>
                        <div className="member-name" style={{ fontSize: '0.95rem' }}>{donor.name}</div>
                        {(donor.preTitle || donor.hebFirstName || donor.hebLastName || donor.title) && (
                          <div style={{ fontSize: '0.82rem', color: 'var(--navy-light)', fontWeight: 600, direction: 'rtl', textAlign: 'left' }}>
                            {[donor.preTitle, donor.hebFirstName, donor.hebLastName, donor.title].filter(Boolean).join(' ')}
                          </div>
                        )}
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>ID: {donor.displayId} · {donor.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ fontSize: '0.9rem' }}>{donor.phone}</td>
                  <td style={{ color: 'var(--green)', fontWeight: 700 }}>${donor.totalGiven.toLocaleString()}</td>
                  <td>
                    {donor.balanceOwed > 0
                      ? <span style={{ color: 'var(--red)', fontWeight: 700 }}>${donor.balanceOwed.toLocaleString()}</span>
                      : donor.balanceOwed < 0
                      ? <span style={{ color: 'var(--green)', fontWeight: 700 }}>Credit: ${Math.abs(donor.balanceOwed).toLocaleString()}</span>
                      : <span style={{ color: 'var(--text-muted)' }}>—</span>
                    }
                  </td>
                  <td><ChevronRight size={16} style={{ color: 'var(--text-muted)' }} /></td>
                </tr>
              ))}
              {paginatedDonors.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>{T('no_donors')}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '20px', gap: '16px' }}>
            <button className="btn btn-secondary btn-sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>Previous</button>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Page {currentPage} of {totalPages}</span>
            <button className="btn btn-secondary btn-sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>Next</button>
          </div>
        )}
      </div>

      {showAddDonor && <AddDonorModal onClose={() => setShowAddDonor(false)} />}
      {selectedDonorId && (
        <DonorProfileModal
          donorId={selectedDonorId}
          onClose={() => setSelectedDonorId(null)}
        />
      )}
    </div>
  );
};
