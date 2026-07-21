import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { CloudLayout } from './components/CloudLayout';
import { OnlineAccounts } from './pages/OnlineAccounts';
import { OnlineBank } from './pages/OnlineBank';
import { OnlineDashboard } from './pages/OnlineDashboard';
import { OnlineDonors } from './pages/OnlineDonors';
import { OnlineExpenses } from './pages/OnlineExpenses';
import { OnlinePayments } from './pages/OnlinePayments';
import { OnlinePledges } from './pages/OnlinePledges';
import { OnlineSchedules } from './pages/OnlineSchedules';
import { OnlineVendors } from './pages/OnlineVendors';
import { OnlineTransactions } from './pages/OnlineTransactions';
import { OnlineWriteChecks } from './pages/OnlineWriteChecks';
import { OnlineTasks } from './pages/OnlineTasks';
import { OnlineUnavailable } from './pages/OnlineUnavailable';

const OnlineCalendar = React.lazy(() => import('./pages/OnlineCalendar').then(module => ({ default: module.OnlineCalendar })));

/**
 * Production is cloud-only. Local-store pages and synchronization engines are
 * intentionally not imported or mounted here. Their source remains in project
 * history solely as a recovery reference while the remaining tools are rebuilt
 * against server-owned APIs.
 */
function App() {
  const cloudPage = (page: React.ReactNode) => <CloudLayout>{page}</CloudLayout>;
  const waitingPage = (title: string) => cloudPage(<OnlineUnavailable title={title} />);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={cloudPage(<OnlineDashboard />)} />
        <Route path="/payments" element={cloudPage(<OnlinePayments />)} />
        <Route path="/donors" element={cloudPage(<OnlineDonors />)} />
        <Route path="/expenses" element={cloudPage(<OnlineExpenses />)} />
        <Route path="/chart-of-accounts" element={cloudPage(<OnlineAccounts />)} />
        <Route path="/bank-feed" element={cloudPage(<OnlineBank />)} />
        <Route path="/calendar" element={cloudPage(<React.Suspense fallback={<div className="card" style={{ padding: 40, textAlign: 'center' }}>Loading calendar...</div>}><OnlineCalendar /></React.Suspense>)} />
        <Route path="/pledges" element={cloudPage(<OnlinePledges />)} />
        <Route path="/schedules" element={cloudPage(<OnlineSchedules />)} />
        <Route path="/vendors" element={cloudPage(<OnlineVendors />)} />
        <Route path="/write-checks" element={cloudPage(<OnlineWriteChecks />)} />
        <Route path="/transactions" element={cloudPage(<OnlineTransactions />)} />
        <Route path="/payroll" element={waitingPage('Payroll & T4A')} />
        <Route path="/reconciliation" element={waitingPage('Reconciliation')} />
        <Route path="/sola-sync" element={waitingPage('Sola Payments Sync')} />
        <Route path="/reports" element={waitingPage('Fundraising Reports')} />
        <Route path="/profit-loss" element={waitingPage('Profit & Loss')} />
        <Route path="/tasks" element={cloudPage(<OnlineTasks />)} />
        <Route path="/settings" element={waitingPage('Settings')} />

        {/* Temporary aliases for bookmarks created during the migration. */}
        <Route path="/online/payments" element={<Navigate to="/payments" replace />} />
        <Route path="/online/donors" element={<Navigate to="/donors" replace />} />
        <Route path="/online/expenses" element={<Navigate to="/expenses" replace />} />
        <Route path="/online/accounts" element={<Navigate to="/chart-of-accounts" replace />} />
        <Route path="/online/bank" element={<Navigate to="/bank-feed" replace />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
