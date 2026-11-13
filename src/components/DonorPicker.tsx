import React, { useEffect, useState } from 'react';
import { donorNames } from '../utils/donorNames';

export type PickedDonor = { id: string; name: string; email?: string; phone?: string; address?: string; city?: string; preTitle?: string; hebFirstName?: string; hebLastName?: string; title?: string; postTitle?: string };
type Balance = { year: number; thisYear: number; total: number };
const money = (value: number) => '$' + Number(value || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** What the donor still owes on his pledges: this year, and all years together. */
export const useDonorBalance = (donorId?: string) => {
  const [balance, setBalance] = useState<Balance | null>(null);
  useEffect(() => {
    setBalance(null);
    if (!donorId) return;
    const controller = new AbortController();
    fetch(`/api/v3/donors/${encodeURIComponent(donorId)}/profile`, { signal: controller.signal }).then(response => response.json()).then(data => {
      if (!data.success) return;
      const year = new Date().getFullYear();
      const pledgeYear = (pledge: any) => Number(String(pledge.periodStart || pledge.date || '').slice(0, 4));
      const thisYear = (data.pledges || []).filter((pledge: any) => pledgeYear(pledge) === year).reduce((sum: number, pledge: any) => sum + Number(pledge.balance || 0), 0);
      setBalance({ year, thisYear, total: Number(data.summary?.pledgeBalance || 0) });
    }).catch(() => undefined);
    return () => controller.abort();
  }, [donorId]);
  return balance;
};

/**
 * One search box for a donor: type a Yiddish or English name or a phone, click the donor.
 * After choosing, a card shows his names, phone and what he still owes.
 */
export const DonorPicker: React.FC<{ value: PickedDonor | null; onChange: (donor: PickedDonor | null) => void; locked?: boolean; autoFocus?: boolean }> = ({ value, onChange, locked, autoFocus }) => {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<PickedDonor[]>([]);
  const [loading, setLoading] = useState(false);
  const balance = useDonorBalance(value?.id);

  useEffect(() => {
    if (value) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetch(`/api/v3/donors?limit=30&search=${encodeURIComponent(search.trim())}`, { signal: controller.signal }).then(response => response.json()).then(data => { if (data.success) setResults(data.items || []); }).catch(() => undefined).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [search, value]);

  if (value) {
    const names = donorNames(value);
    return <div className="call-donor-card">
      <div className="call-donor-card-names"><strong dir={names.rtl ? 'rtl' : undefined}>{names.main}</strong>{names.other && <small>{names.other}</small>}{value.phone && <small>{value.phone}</small>}</div>
      <div className="call-donor-card-balance">{balance ? <><span>Balance {balance.year}</span><strong className={balance.thisYear > 0.005 ? 'owes' : ''}>{money(balance.thisYear)}</strong><small>All years: {money(balance.total)}</small></> : <small>Loading balance…</small>}</div>
      <div className="call-donor-card-actions">{!locked && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(null)}>Change</button>}</div>
    </div>;
  }
  return <div>
    <input style={{ width: '100%', boxSizing: 'border-box' }} autoFocus={autoFocus} value={search} onChange={event => setSearch(event.target.value)} placeholder="Type a Yiddish or English name, or a phone…" />
    <div className="call-donor-results">
      {results.slice(0, 8).map(item => { const names = donorNames(item); return <button type="button" key={item.id} onClick={() => { onChange(item); setSearch(''); }}><strong dir={names.rtl ? 'rtl' : undefined}>{names.main}</strong><small>{[names.other, item.phone, item.city].filter(Boolean).join(' · ')}</small></button>; })}
      {!loading && results.length === 0 && <small style={{ color: 'var(--text-muted)', padding: 8 }}>No donors found.</small>}
    </div>
  </div>;
};
