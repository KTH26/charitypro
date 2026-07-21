import React, { useEffect, useState } from 'react';

type Summary = { donors: number; payments: number; expenses: number; assets: number };

export const OnlineDashboard: React.FC = () => {
  const [summary, setSummary] = useState<Summary>({ donors: 0, payments: 0, expenses: 0, assets: 0 });
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/v3/donors?limit=1').then(response => response.json()),
      fetch('/api/v3/payments?limit=1&status=approved').then(response => response.json()),
      fetch('/api/v3/bills?limit=1&status=open').then(response => response.json()),
      fetch('/api/v3/accounts').then(response => response.json())
    ]).then(([donors, payments, expenses, accounts]) => setSummary({
      donors: Number(donors.total || 0),
      payments: Number(payments.total || 0),
      expenses: Number(expenses.total || 0),
      assets: Array.isArray(accounts.items) ? accounts.items.filter((account: any) => account.type === 'asset').reduce((sum: number, account: any) => sum + Number(account.calculatedBalanceCAD || 0), 0) : 0
    })).catch(() => setError('The cloud summary could not be loaded. Your records were not changed.'));
  }, []);

  const cards = [
    { label: 'Donors', value: summary.donors.toLocaleString(), href: '/donors' },
    { label: 'Approved Payments', value: summary.payments.toLocaleString(), href: '/payments' },
    { label: 'Open Expenses', value: summary.expenses.toLocaleString(), href: '/expenses' },
    { label: 'Asset Balance', value: `$${summary.assets.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, href: '/chart-of-accounts' }
  ];

  return <main style={{ minHeight: 'calc(100vh - 76px)', background: 'var(--bg)', padding: 28, fontFamily: 'Inter, sans-serif' }}><div style={{ maxWidth: 1400, margin: '0 auto' }}>
    <div style={{ marginBottom: 22 }}><div style={{ color: 'var(--green)', fontWeight: 800, fontSize: 13 }}>CHARITYPRO CLOUD</div><h1 style={{ color: 'var(--navy)', margin: '4px 0' }}>Dashboard</h1><div style={{ color: 'var(--text-muted)' }}>A live summary calculated from the shared online database.</div></div>
    {error && <div className="card" style={{ padding: 16, color: 'var(--red)', marginBottom: 18 }}>{error}</div>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 18 }}>
      {cards.map(card => <a key={card.label} href={card.href} className="card" style={{ padding: 24, textDecoration: 'none', color: 'inherit' }}><div style={{ color: 'var(--text-muted)', fontWeight: 700 }}>{card.label}</div><div style={{ color: 'var(--navy)', fontSize: 28, fontWeight: 900, marginTop: 8 }}>{card.value}</div></a>)}
    </div>
  </div></main>;
};
