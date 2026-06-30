import React, { useState } from 'react';
import { useStore } from '../store';
import { Store, Search } from 'lucide-react';
import { useT } from '../i18n';
import { VendorModal } from '../components/VendorModal';

export const Vendors: React.FC = () => {
  const { bills, isRtl } = useStore();
  const T = useT(isRtl);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVendor, setSelectedVendor] = useState<string | null>(null);

  // Extract unique vendors and their stats
  const vendorMap = new Map<string, { name: string, totalBilled: number, balanceOwed: number, billCount: number }>();

  bills.forEach(b => {
    const v = vendorMap.get(b.vendor) || { name: b.vendor, totalBilled: 0, balanceOwed: 0, billCount: 0 };
    v.billCount++;
    v.totalBilled += b.amount;
    if (b.status !== 'paid') {
      v.balanceOwed += b.amount;
    }
    vendorMap.set(b.vendor, v);
  });

  const vendors = Array.from(vendorMap.values());

  const filteredVendors = vendors.filter(v => v.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div style={{ display: 'grid', gap: '24px' }}>
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontFamily: 'Outfit, sans-serif', fontWeight: 700, color: 'var(--navy)' }}>
              Vendors ({filteredVendors.length})
            </h2>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
          <div className="search-box" style={{ width: '300px' }}>
            <Search className="search-icon" size={18} />
            <input type="text" placeholder="Search vendors..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Vendor Name</th>
                <th>Total Billed</th>
                <th>Balance Owed</th>
                <th>Bill Count</th>
              </tr>
            </thead>
            <tbody>
              {filteredVendors.map(v => (
                <tr key={v.name} onClick={() => setSelectedVendor(v.name)} style={{ cursor: 'pointer' }} className="hover-row">
                  <td style={{ fontWeight: 600, color: 'var(--navy)' }}>{v.name}</td>
                  <td style={{ fontWeight: 700 }}>${v.totalBilled.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td style={{ fontWeight: 700, color: v.balanceOwed > 0 ? 'var(--red)' : 'var(--text-muted)' }}>
                    ${v.balanceOwed.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td>{v.billCount} bills</td>
                </tr>
              ))}
              {filteredVendors.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>No vendors found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedVendor && (
        <VendorModal 
          vendorName={selectedVendor} 
          onClose={() => setSelectedVendor(null)} 
        />
      )}
    </div>
  );
};
