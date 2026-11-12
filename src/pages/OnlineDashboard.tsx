import React, { useEffect, useState } from 'react';
import { LoansPayableBox } from '../components/LoansPayableBox';

type Summary = { donors: number; payments: number; expenses: number; assets: number; declined: number; reminders:number; overdue:number; dueToday:number };

export const OnlineDashboard: React.FC = () => {
  const [summary, setSummary] = useState<Summary>({ donors: 0, payments: 0, expenses: 0, assets: 0, declined: 0, reminders:0, overdue:0, dueToday:0 });
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/v3/donors?limit=1').then(response => response.json()),
      fetch('/api/v3/payments?limit=1&status=approved').then(response => response.json()),
      fetch('/api/v3/bills?limit=1&status=open').then(response => response.json()),
      fetch('/api/v3/accounts?limit=1').then(response => response.json()),
      fetch('/api/v3/payments?limit=1&status=declined&method=credit_card').then(response=>response.json()),
      fetch('/api/v3/tasks?status=pending&limit=6&page=1').then(response=>response.json())
    ]).then(([donors, payments, expenses, accounts,declined,tasks]) => {setSummary({
      donors: Number(donors.total || 0),
      payments: Number(payments.total || 0),
      expenses: Number(expenses.total || 0),
      assets: Number(accounts.total || 0),declined:Number(declined.total||0),reminders:Number(tasks.summary?.pending||0),overdue:Number(tasks.summary?.overdue||0),dueToday:Number(tasks.summary?.dueToday||0)
    });}).catch(() => setError('The cloud summary could not be loaded. Your records were not changed.'));
  }, []);

  const cards = [
    { label: 'Donors', value: summary.donors.toLocaleString(), href: '/donors' },
    { label: 'Approved Payments', value: summary.payments.toLocaleString(), href: '/payments' },
    { label: 'Open Expenses', value: summary.expenses.toLocaleString(), href: '/expenses' },
    { label: 'Accounts', value: summary.assets.toLocaleString(), href: '/chart-of-accounts' },
    { label: 'Declined Payments', value: summary.declined.toLocaleString(), href: '/pending-payments', danger: true },
    { label: 'Open Reminders', value: summary.reminders.toLocaleString(), href: '/tasks', danger: summary.overdue>0 }
  ];

  return <main className="dashboard-page"><div className="dashboard-shell">
    <div className="dashboard-hero"><div><div className="page-kicker">CHARITYPRO CLOUD</div><h1>Good to see you.</h1><p>Your fundraising and finances, clearly organized in one place.</p></div><div className="dashboard-date">Live shared data<br/><strong>{new Intl.DateTimeFormat('en-CA', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date())}</strong></div></div>
    {error && <div className="card" style={{ padding: 16, color: 'var(--red)', marginBottom: 18 }}>{error}</div>}
    <div className="dashboard-stats">
      {cards.map((card, index) => <a key={card.label} href={card.href} className={`dashboard-stat ${card.danger ? 'is-alert' : ''}`}><span className="dashboard-stat-index">{String(index + 1).padStart(2, '0')}</span><span className="dashboard-stat-label">{card.label}</span><strong>{card.value}</strong><span className="dashboard-stat-link">View details →</span></a>)}
    </div>
    <LoansPayableBox />
  </div></main>;
};
