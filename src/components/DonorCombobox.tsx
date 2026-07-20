import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

export const DonorCombobox: React.FC<{
  donors: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}> = ({ donors, value, onChange, placeholder = "Select Donor..." }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedDonor = donors.find(d => d.id === value);
  const selectedYiddishName = selectedDonor ? [(selectedDonor as any).hebFirstName, (selectedDonor as any).hebLastName].filter(Boolean).join(' ') : '';
  const selectedDisplayName = selectedDonor ? (selectedYiddishName ? `${selectedDonor.name} (${selectedYiddishName})` : selectedDonor.name) : <span style={{ color: 'var(--text-muted)' }}>{placeholder}</span>;

  const filteredDonors = donors.filter(d => {
    const q = search.toLowerCase();
    return (
      d.name.toLowerCase().includes(q) ||
      (d as any).hebFirstName?.toLowerCase().includes(q) ||
      (d as any).hebLastName?.toLowerCase().includes(q) ||
      (d as any).phone?.toLowerCase().includes(q) ||
      (d as any).mobilePhone?.toLowerCase().includes(q)
    );
  }).slice(0, 50); // limit to 50 for perf

  return (
    <div ref={wrapperRef} style={{ position: 'relative', flex: 1 }}>
      <div 
        onClick={() => setOpen(!open)}
        className="input"
        style={{ padding: '6px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: 'var(--bg-input)' }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedDisplayName}
        </span>
        <ChevronDown size={14} />
      </div>

      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999, background: 'var(--bg-modal)', border: '1px solid var(--border)', borderRadius: '8px', marginTop: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', maxHeight: '250px', display: 'flex', flexDirection: 'column' }}>
          <input
            type="text"
            className="input"
            style={{ margin: '8px', border: '1px solid var(--border)', padding: '6px' }}
            placeholder="Search by English/Yiddish name or phone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filteredDonors.length === 0 ? (
              <div style={{ padding: '8px', color: 'var(--text-muted)', textAlign: 'center' }}>No donors found.</div>
            ) : (
              filteredDonors.map((d: any) => {
                const yiddishName = [d.hebFirstName, d.hebLastName].filter(Boolean).join(' ');
                const displayName = yiddishName ? `${d.name} (${yiddishName})` : d.name;
                return (
                  <div 
                    key={d.id} 
                    style={{ padding: '8px 12px', cursor: 'pointer', background: value === d.id ? 'var(--blue-bg)' : 'transparent' }}
                    onClick={() => { onChange(d.id); setOpen(false); setSearch(''); }}
                  >
                    {displayName}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
