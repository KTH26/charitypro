import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import { ComingSoon } from './pages/ComingSoon';
import { Pledges } from './pages/Pledges';
import { Payments } from './pages/Payments';
import { Schedules } from './pages/Schedules';
import { Vendors } from './pages/Vendors';
import { PrintCheckLayout } from './pages/PrintCheckLayout';
import { Transactions } from './pages/Transactions';
import { ChartOfAccounts } from './pages/ChartOfAccounts';
import { BankFeed } from './pages/BankFeed';
import { Reconciliation } from './pages/Reconciliation';
import { SolaSync } from './pages/SolaSync';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout><Dashboard /></Layout>} />
        <Route path="/donors" element={<Layout><Donors /></Layout>} />
        <Route path="/fundraisers" element={<Layout><Fundraisers /></Layout>} />
        <Route path="/transactions" element={<Layout><Transactions /></Layout>} />
        <Route path="/chart-of-accounts" element={<Layout><ChartOfAccounts /></Layout>} />
        <Route path="/bank-feed" element={<Layout><BankFeed /></Layout>} />
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
        <Route path="/coming-soon" element={<Layout><ComingSoon /></Layout>} />
        <Route path="/sola-sync" element={<Layout><SolaSync /></Layout>} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
