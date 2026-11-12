import React, { useCallback, useEffect, useState } from 'react';
import { startLiveRefresh } from '../utils/liveUpdates';
import { CloudAccountDetailsModal } from '../components/CloudAccountDetailsModal';
import { SortableTh, type SortDirection } from '../components/SortableTh';
import { CloudAddAccountModal } from '../components/CloudAddAccountModal';
import { CloudNewTransferModal } from '../components/CloudNewTransferModal';
import { ArrowLeftRight, Plus } from 'lucide-react';

type Account = { id: string; revision: number; name: string; type: string; subType?: string; currency: string; balance: number; actualBalance?:number; fundraiserReserved?:number; availableBalance?:number; startingBalance?: number };

export const OnlineAccounts: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [sort, setSort] = useState('type');
  const [direction, setDirection] = useState<SortDirection>('asc');
  const [showAdd, setShowAdd] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [notice, setNotice] = useState('');
  const changeSort = (column: string) => { setDirection(current => sort === column ? (current === 'asc' ? 'desc' : 'asc') : (column === 'balance' ? 'desc' : 'asc')); setSort(column); setPage(1); };
  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(''); }
    try {
      const response = await fetch(`/api/v3/accounts?page=${page}&limit=50&search=${encodeURIComponent(search)}&sort=${sort}&direction=${direction}`);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || `Request failed (${response.status})`);
      setAccounts(data.items);
      setTotalPages(Math.max(1, Number(data.totalPages || 1)));
    } catch (e: any) {
      if (!silent) setError(e.message || 'Unable to load accounts.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [page, search, sort, direction]);
  useEffect(() => {
    void load();
    return startLiveRefresh(() => void load(true));
  }, [load]);

  const grouped = accounts.reduce<Record<string, Account[]>>((result, account) => {
    (result[account.type] ||= []).push(account);
    return result;
  }, {});

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: 28, fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
          <div><div style={{ color: 'var(--green)', fontWeight: 800, fontSize: 13 }}>CHARITYPRO CLOUD</div><h1 style={{ color: 'var(--navy)', margin: '4px 0' }}>Chart of Accounts</h1><div style={{ color: 'var(--text-muted)' }}>Balances calculated directly from cloud payments, bills, and transfers. Updates automatically.</div></div>
          <div className="page-actions"><button className="btn btn-secondary" onClick={() => setShowTransfer(true)}><ArrowLeftRight size={16} /> New Transfer</button><button className="btn btn-primary" onClick={() => setShowAdd(true)}><Plus size={16} /> New Account</button></div>
        </div>
        {notice && <div className="card" style={{ padding: 14, color: 'var(--green)', fontWeight: 700, marginBottom: 16 }}>{notice}</div>}
        <section className="card" style={{ padding: 16, marginBottom: 18 }}><input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Search accounts" /></section>
        {error && <div className="card" style={{ padding: 16, color: 'var(--red)' }}>{error}</div>}
        {loading ? <div className="card" style={{ padding: 40, textAlign: 'center' }}>Calculating cloud balances…</div> : (
          <div style={{ display: 'grid', gap: 18 }}>
            {['asset','liability','equity','revenue','expense'].filter(type => grouped[type]?.length).map(type => (
              <section className="card" style={{ padding: 0, overflow: 'hidden' }} key={type}>
                <h2 style={{ margin: 0, padding: '16px 20px', textTransform: 'capitalize', color: 'var(--navy)', borderBottom: '1px solid var(--border)' }}>{type}</h2>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><SortableTh column="name" label="Account" sort={sort} direction={direction} onSort={changeSort}/><SortableTh column="currency" label="Currency" sort={sort} direction={direction} onSort={changeSort}/><SortableTh column="balance" label="Actual balance" sort={sort} direction={direction} onSort={changeSort} align="right"/><th style={{textAlign:'right'}}>Fundraiser reserve</th><th style={{textAlign:'right'}}>Available balance</th></tr></thead><tbody>
                  {grouped[type].map(account => <tr key={account.id} onClick={() => setSelectedAccount(account)} style={{ cursor: 'pointer' }}><td style={{ fontWeight: 700 }}>{account.name}</td><td>{account.currency}</td><td style={{ textAlign: 'right', fontWeight: 800 }}>{account.currency} ${Number(account.actualBalance??account.balance).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</td><td style={{textAlign:'right',color:Number(account.fundraiserReserved||0)>0?'var(--gold)':'var(--text-muted)'}}>{account.type==='asset'?`${account.currency} $${Number(account.fundraiserReserved||0).toFixed(2)}`:'—'}</td><td style={{ textAlign: 'right', fontWeight: 900, color: Number(account.availableBalance??account.balance) >= 0 ? 'var(--green)' : 'var(--red)' }}>{account.currency} ${Number(account.availableBalance??account.balance).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</td></tr>)}
                </tbody></table>
              </section>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 14 }}><span>Page {page} of {totalPages} · 50 accounts maximum per page</span><div style={{ display: 'flex', gap: 8 }}><button className="btn btn-secondary btn-sm" disabled={page <= 1 || loading} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</button><button className="btn btn-secondary btn-sm" disabled={page >= totalPages || loading} onClick={() => setPage(value => Math.min(totalPages, value + 1))}>Next</button></div></div>
      </div>
      {selectedAccount && <CloudAccountDetailsModal account={selectedAccount} onClose={() => setSelectedAccount(null)} onUpdated={account => { setSelectedAccount(account); setAccounts(current => current.map(item => item.id === account.id ? account : item)); }} onDeleted={accountId=>{setSelectedAccount(null);setAccounts(current=>current.filter(item=>item.id!==accountId));void load(true);}} />}
      {showAdd && <CloudAddAccountModal onClose={() => setShowAdd(false)} onSaved={account => { setShowAdd(false); setNotice(`Account "${account.name}" was added.`); void load(true); }} />}
      {showTransfer && <CloudNewTransferModal onClose={() => setShowTransfer(false)} onSaved={() => { setShowTransfer(false); setNotice('Transfer saved. Balances were updated.'); void load(true); }} />}
    </main>
  );
};
