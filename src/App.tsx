import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SyncEngine } from './components/SyncEngine';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Donors } from './pages/Donors';
import { Fundraisers } from './pages/Fundraisers';
import { Accounting } from './pages/Accounting';
import { Expenses } from './pages/Expenses';
import { Reports } from './pages/Reports';
import { CalendarPage } from './pages/CalendarPage';
import { Tasks } from './pages/Tasks';
import { Settings } from './pages/Settings';
import { AuditHistory } from './pages/AuditHistory';
import { ComingSoon } from './pages/ComingSoon';
import { Pledges } from './pages/Pledges';
import { Payments } from './pages/Payments';
import { Schedules } from './pages/Schedules';
import { Vendors } from './pages/Vendors';
import { WriteChecks } from './pages/WriteChecks';
import { PrintCheckLayout } from './pages/PrintCheckLayout';
import { Transactions } from './pages/Transactions';
import { ChartOfAccounts } from './pages/ChartOfAccounts';
import { BankFeed } from './pages/BankFeed';
import { Reconciliation } from './pages/Reconciliation';
import { SolaSync } from './pages/SolaSync';
import { Payroll } from './pages/Payroll';
import { OnlinePayments } from './pages/OnlinePayments';
import { OnlineAccounts } from './pages/OnlineAccounts';
import { OnlineDonors } from './pages/OnlineDonors';
import { OnlineExpenses } from './pages/OnlineExpenses';

import { SyncEngineHardened } from './components/SyncEngineHardened';
const SYNC_ENGINE_VERSION = import.meta.env.VITE_SYNC_ENGINE_VERSION ?? 'v2_hardened';

function App() {
  const [hasHydrated, setHasHydrated] = useState(false);
  const isServerRoute = window.location.pathname.startsWith('/online/');

  useEffect(() => {
    // Zustand persist exports .persist object on the store hook
    import('./store').then(({ useStore }) => {
      const unsub = useStore.persist.onFinishHydration(() => {
        setHasHydrated(true);
        useStore.getState().checkSystemAccounts();
        useStore.getState().recalculateBalances(); // always recompute from source of truth
      });
      if (useStore.persist.hasHydrated()) {
        setHasHydrated(true);
        useStore.getState().checkSystemAccounts();
        useStore.getState().recalculateBalances(); // always recompute from source of truth
      }
      return unsub;
    });
  }, []);

  if (!isServerRoute && !hasHydrated) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg-app)' }}><div className="loader" style={{ width: '40px', height: '40px', border: '4px solid var(--border)', borderTopColor: 'var(--navy)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}><style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style></div></div>;
  }

  return (
    <BrowserRouter>
      {!isServerRoute && (SYNC_ENGINE_VERSION === 'v2_hardened' ? <SyncEngineHardened /> : <SyncEngine />)}
      <Routes>
        <Route path="/online/payments" element={<OnlinePayments />} />
        <Route path="/online/accounts" element={<OnlineAccounts />} />
        <Route path="/online/donors" element={<OnlineDonors />} />
        <Route path="/online/expenses" element={<OnlineExpenses />} />
        <Route path="/" element={<Layout><Dashboard /></Layout>} />
        <Route path="/donors" element={<Layout><Donors /></Layout>} />
        <Route path="/fundraisers" element={<Layout><Fundraisers /></Layout>} />
        <Route path="/transactions" element={<Layout><Transactions /></Layout>} />
        <Route path="/chart-of-accounts" element={<Layout><ChartOfAccounts /></Layout>} />
        <Route path="/write-checks" element={<Layout><WriteChecks /></Layout>} />
        <Route path="/bank-feed" element={<Layout><BankFeed /></Layout>} />
        <Route path="/payroll" element={<Layout><Payroll /></Layout>} />
        <Route path="/reconciliation" element={<Layout><Reconciliation /></Layout>} />
        <Route path="/accounting" element={<Layout><Accounting /></Layout>} />
        <Route path="/vendors" element={<Layout><Vendors /></Layout>} />
        <Route path="/expenses" element={<Layout><Expenses /></Layout>} />
        <Route path="/print-check" element={<Layout><PrintCheckLayout /></Layout>} />
        <Route path="/pledges" element={<Layout><Pledges /></Layout>} />
        <Route path="/payments" element={<Layout><Payments /></Layout>} />
        <Route path="/schedules" element={<Layout><Schedules /></Layout>} />
        <Route path="/reports" element={<Layout><Reports /></Layout>} />
        <Route path="/calendar" element={<Layout><CalendarPage /></Layout>} />
        <Route path="/tasks" element={<Layout><Tasks /></Layout>} />
        <Route path="/settings" element={<Layout><Settings /></Layout>} />
        <Route path="/settings/audit" element={<Layout><AuditHistory /></Layout>} />
        <Route path="/print-checks" element={<Layout><PrintCheckLayout /></Layout>} />
        <Route path="/coming-soon" element={<Layout><ComingSoon /></Layout>} />
        <Route path="/sola-sync" element={<Layout><SolaSync /></Layout>} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
