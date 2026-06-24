import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Donors } from './pages/Donors';
import { Accounting } from './pages/Accounting';
import { Fundraisers } from './pages/Fundraisers';
import { Settings } from './pages/Settings';
import { Expenses } from './pages/Expenses';

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/donors" element={<Donors />} />
          <Route path="/accounting" element={<Accounting />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/fundraisers" element={<Fundraisers />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
