import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, TrendingDown, TrendingUp, Wallet } from 'lucide-react';

type Entry = { id: string; name: string; section: 'revenue' | 'expense'; amount: number };
const money = (value: number) => Number(value || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const currentYear = new Date().getFullYear();

export const OnlineProfitLoss: React.FC = () => {
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate] = useState(`${currentYear}-12-31`);
  const [appliedRange, setAppliedRange] = useState({ startDate: `${currentYear}-01-01`, endDate: `${currentYear}-12-31` });
  const [items, setItems] = useState<Entry[]>([]);
  const [summary, setSummary] = useState({ revenue: 0, expenses: 0, netIncome: 0 });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({ ...appliedRange, page: String(page), limit: '50' });
      const response = await fetch(`/api/v3/profit-loss?${params.toString()}`);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to calculate Profit & Loss.');
      setItems(data.items || []);
      setSummary(data.summary || { revenue: 0, expenses: 0, netIncome: 0 });
      setTotalPages(Math.max(1, Number(data.totalPages || 1)));
      setError('');
    } catch (reason: any) {
      if (!silent) setError(reason.message || 'Unable to calculate Profit & Loss.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [appliedRange, page]);

  useEffect(() => { void load(); const timer = window.setInterval(() => void load(true), 5000); return () => window.clearInterval(timer); }, [load]);
  const revenue = useMemo(() => items.filter(item => item.section === 'revenue'), [items]);
  const expenses = useMemo(() => items.filter(item => item.section === 'expense'), [items]);
  const apply = (event: React.FormEvent) => { event.preventDefault(); setPage(1); setAppliedRange({ startDate, endDate }); };
  const exportCsv = () => {
    const rows = [['Section', 'Account', 'Amount CAD'], ...items.map(item => [item.section, item.name, item.amount]), [], ['Total Revenue', '', summary.revenue], ['Total Expenses', '', summary.expenses], ['Net Income', '', summary.netIncome]];
    const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a'); link.href = url; link.download = `charitypro-profit-loss-${appliedRange.startDate}-to-${appliedRange.endDate}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  return <main style={{ padding: 28, minHeight: '100vh', background: 'var(--bg)' }}><div style={{ maxWidth: 1200, margin: '0 auto' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, marginBottom: 22 }}><div><div style={{ color: 'var(--green)', fontWeight: 800, fontSize: 13 }}>CHARITYPRO CLOUD</div><h1 style={{ color: 'var(--navy)', margin: '4px 0' }}>Profit & Loss</h1><div style={{ color: 'var(--text-muted)' }}>Cash-basis income and paid expenses calculated directly from the shared online ledger.</div></div><button className="btn btn-secondary" onClick={exportCsv} disabled={loading || !items.length}><Download size={16} /> Export CSV</button></div>
    <form className="card" onSubmit={apply} style={{ padding: 18, display: 'flex', gap: 12, alignItems: 'end', marginBottom: 18, flexWrap: 'wrap' }}><label className="form-group" style={{ margin: 0 }}><span>From</span><input type="date" required value={startDate} onChange={event => setStartDate(event.target.value)} /></label><label className="form-group" style={{ margin: 0 }}><span>To</span><input type="date" required value={endDate} onChange={event => setEndDate(event.target.value)} /></label><button className="btn btn-primary">Run Report</button></form>
    {error && <div className="card" style={{ color: 'var(--red)', marginBottom: 18 }}>{error}</div>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 16, marginBottom: 18 }}><SummaryCard label="Total Revenue" value={summary.revenue} color="var(--green)" icon={TrendingUp} /><SummaryCard label="Total Expenses" value={summary.expenses} color="var(--red)" icon={TrendingDown} /><SummaryCard label="Net Income" value={summary.netIncome} color={summary.netIncome >= 0 ? 'var(--green)' : 'var(--red)'} icon={Wallet} /></div>
    <section className="card" style={{ padding: 0, overflow: 'hidden' }}>{loading ? <div style={{ padding: 44, textAlign: 'center' }}>Calculating online Profit & Loss...</div> : <><Statement title="Revenue" items={revenue} total={summary.revenue} color="var(--green)" /><Statement title="Expenses" items={expenses} total={summary.expenses} color="var(--red)" /><div style={{ display: 'flex', justifyContent: 'space-between', padding: '20px 24px', background: summary.netIncome >= 0 ? 'var(--green-bg)' : 'var(--red-bg)', fontWeight: 900, fontSize: 18, color: summary.netIncome >= 0 ? 'var(--green)' : 'var(--red)' }}><span>Net Income</span><span>CAD ${money(summary.netIncome)}</span></div></>}
      {totalPages > 1 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: 16, borderTop: '1px solid var(--border)' }}><span>Page {page} of {totalPages} · 50 accounts maximum</span><div style={{ display: 'flex', gap: 8 }}><button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button><button className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => setPage(value => value + 1)}>Next</button></div></div>}
    </section>
  </div></main>;
};

const SummaryCard: React.FC<{ label: string; value: number; color: string; icon: React.ElementType }> = ({ label, value, color, icon: Icon }) => <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><div style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: 13 }}>{label}</div><div style={{ color, fontSize: 25, fontWeight: 900, marginTop: 5 }}>CAD ${money(value)}</div></div><Icon size={28} color={color} /></div>;
const Statement: React.FC<{ title: string; items: Entry[]; total: number; color: string }> = ({ title, items, total, color }) => <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}><h2 style={{ color: 'var(--navy)', margin: '0 0 14px' }}>{title}</h2>{items.map(item => <div key={`${item.section}:${item.id}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-light)' }}><span>{item.name || 'Uncategorized'}</span><strong>CAD ${money(item.amount)}</strong></div>)}{!items.length && <div style={{ padding: 14, color: 'var(--text-muted)' }}>No {title.toLowerCase()} in this period.</div>}<div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 14, color, fontWeight: 900 }}><span>Total {title}</span><span>CAD ${money(total)}</span></div></div>;
