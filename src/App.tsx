import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { OnlineAccounts } from './pages/OnlineAccounts';
import { OnlineBank } from './pages/OnlineBank';
import { OnlineDonors } from './pages/OnlineDonors';
import { OnlineExpenses } from './pages/OnlineExpenses';
import { OnlinePayments } from './pages/OnlinePayments';

/**
 * Production is cloud-only. Local-store pages and synchronization engines are
 * intentionally not imported or mounted here. Their source remains in project
 * history solely as a recovery reference while the remaining tools are rebuilt
 * against server-owned APIs.
 */
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/payments" replace />} />
        <Route path="/payments" element={<OnlinePayments />} />
        <Route path="/donors" element={<OnlineDonors />} />
        <Route path="/expenses" element={<OnlineExpenses />} />
        <Route path="/chart-of-accounts" element={<OnlineAccounts />} />
        <Route path="/bank-feed" element={<OnlineBank />} />

        {/* Temporary aliases for bookmarks created during the migration. */}
        <Route path="/online/payments" element={<Navigate to="/payments" replace />} />
        <Route path="/online/donors" element={<Navigate to="/donors" replace />} />
        <Route path="/online/expenses" element={<Navigate to="/expenses" replace />} />
        <Route path="/online/accounts" element={<Navigate to="/chart-of-accounts" replace />} />
        <Route path="/online/bank" element={<Navigate to="/bank-feed" replace />} />

        <Route path="*" element={<Navigate to="/payments" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
