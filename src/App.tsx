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

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout><Dashboard /></Layout>} />
        <Route path="/donors" element={<Layout><Donors /></Layout>} />
        <Route path="/fundraisers" element={<Layout><Fundraisers /></Layout>} />
        <Route path="/accounting" element={<Layout><Accounting /></Layout>} />
        <Route path="/expenses" element={<Layout><Expenses /></Layout>} />
        <Route path="/reports" element={<Layout><Reports /></Layout>} />
        <Route path="/calendar" element={<Layout><CalendarPage /></Layout>} />
        <Route path="/tasks" element={<Layout><Tasks /></Layout>} />
        <Route path="/settings" element={<Layout><Settings /></Layout>} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
