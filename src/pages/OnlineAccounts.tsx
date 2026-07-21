import React, { useCallback, useEffect, useState } from 'react';

type Account = { id: string; name: string; type: string; subType?: string; currency: string; balance: number };

export const OnlineAccounts: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(''); }
    try {
      const response = await fetch(`/api/v3/accounts?page=${page}&limit=50&search=${encodeURIComponent(search)}`);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || `Request failed (${response.status})`);
      setAccounts(data.items);
      setTotalPages(Math.max(1, Number(data.totalPages || 1)));
    } catch (e: any) {
      if (!silent) setError(e.message || 'Unable to load accounts.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [page, search]);
  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(true), 3000);
    return () => window.clearInterval(interval);
  }, [load]);

  const grouped = accounts.reduce<Record<string, Account[]>>((result, account) => {
    (result[account.type] ||= []).push(account);
    return result;
  }, {});

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: 28, fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <div><div style={{ color: 'var(--green)', fontWeight: 800, fontSize: 13 }}>CHARITYPRO CLOUD</div><h1 style={{ color: 'var(--navy)', margin: '4px 0' }}>Chart of Accounts</h1><div style={{ color: 'var(--text-muted)' }}>Balances calculated directly from cloud payments, bills, and transfers. Updates automatically every 3 seconds.</div></div>
        </div>
        <section className="card" style={{ padding: 16, marginBottom: 18 }}><input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Search accounts" /></section>
        {error && <div className="card" style={{ padding: 16, color: 'var(--red)' }}>{error}</div>}
        {loading ? <div className="card" style={{ padding: 40, textAlign: 'center' }}>Calculating cloud balances…</div> : (
          <div style={{ display: 'grid', gap: 18 }}>
            {['asset','liability','equity','revenue','expense'].filter(type => grouped[type]?.length).map(type => (
              <section className="card" style={{ padding: 0, overflow: 'hidden' }} key={type}>
                <h2 style={{ margin: 0, padding: '16px 20px', textTransform: 'capitalize', color: 'var(--navy)', borderBottom: '1px solid var(--border)' }}>{type}</h2>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th>Account</th><th>Currency</th><th style={{ textAlign: 'right' }}>Cloud-calculated balance</th></tr></thead><tbody>
                  {grouped[type].map(account => <tr key={account.id}><td style={{ fontWeight: 700 }}>{account.name}</td><td>{account.currency}</td><td style={{ textAlign: 'right', fontWeight: 800, color: account.balance >= 0 ? 'var(--green)' : 'var(--red)' }}>{account.currency} ${account.balance.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</td></tr>)}
                </tbody></table>
              </section>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 14 }}><span>Page {page} of {totalPages} · 50 accounts maximum per page</span><div style={{ display: 'flex', gap: 8 }}><button className="btn btn-secondary btn-sm" disabled={page <= 1 || loading} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</button><button className="btn btn-secondary btn-sm" disabled={page >= totalPages || loading} onClick={() => setPage(value => Math.min(totalPages, value + 1))}>Next</button></div></div>
      </div>
    </main>
  );
};
