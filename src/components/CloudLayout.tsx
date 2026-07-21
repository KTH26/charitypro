import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  BarChart3, Building, Calendar, CalendarClock, CheckSquare, FileText,
  HeartHandshake, LayoutDashboard, Link as LinkIcon, List, LogOut, Printer,
  Settings, Store, Users, Wallet
} from 'lucide-react';

type NavItem = { path: string; label: string; icon: React.ElementType; ready?: boolean };
type NavCategory = { label: string; items: NavItem[] };

const categories: NavCategory[] = [
  { label: 'HOME', items: [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard, ready: true },
    { path: '/calendar', label: 'Calendar', icon: Calendar, ready: true }
  ] },
  { label: 'CONTACTS', items: [
    { path: '/donors', label: 'Donors', icon: Users, ready: true }
  ] },
  { label: 'DONATIONS', items: [
    { path: '/pledges', label: 'Pledges', icon: HeartHandshake, ready: true },
    { path: '/payments', label: 'Payments', icon: Wallet, ready: true },
    { path: '/schedules', label: 'Schedules', icon: CalendarClock, ready: true }
  ] },
  { label: 'EXPENSES', items: [
    { path: '/vendors', label: 'Vendors', icon: Store, ready: true },
    { path: '/expenses', label: 'Bills & Expenses', icon: FileText, ready: true },
    { path: '/write-checks', label: 'Write Checks', icon: Printer, ready: true }
  ] },
  { label: 'ACCOUNTING', items: [
    { path: '/transactions', label: 'Transactions', icon: Wallet, ready: true },
    { path: '/chart-of-accounts', label: 'Chart of Accounts', icon: List, ready: true },
    { path: '/bank-feed', label: 'Bank Feed', icon: Building, ready: true },
    { path: '/payroll', label: 'Payroll & T4A', icon: Users },
    { path: '/reconciliation', label: 'Reconciliation', icon: CheckSquare },
    { path: '/sola-sync', label: 'Sola Payments Sync', icon: LinkIcon }
  ] },
  { label: 'REPORTS', items: [
    { path: '/reports', label: 'Fundraising Reports', icon: BarChart3 },
    { path: '/profit-loss', label: 'Profit & Loss', icon: BarChart3 }
  ] },
  { label: 'SYSTEM', items: [
    { path: '/tasks', label: 'Tasks', icon: CheckSquare, ready: true },
    { path: '/settings', label: 'Settings', icon: Settings }
  ] }
];

export const CloudLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const pageLabel = categories.flatMap(category => category.items).find(item => item.path === location.pathname)?.label || 'CharityPro';

  return (
    <div className="app-container">
      <aside className="sidebar" style={{ padding: '24px 0', overflowY: 'auto' }}>
        <div className="sidebar-logo" style={{ padding: '0 24px 20px', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
          <div className="sidebar-logo-icon">❤</div>
          <div><div className="sidebar-logo-text">CharityPro</div><div className="sidebar-logo-sub">Cloud Accounting</div></div>
        </div>
        <nav className="sidebar-nav" style={{ padding: '0 16px' }}>
          {categories.map(category => <div key={category.label} style={{ marginBottom: 16 }}>
            <div className="sidebar-section-label" style={{ padding: '0 8px', marginBottom: 8 }}>{category.label}</div>
            {category.items.map(item => <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              style={{ padding: '8px 12px', borderRadius: 8, marginBottom: 4 }}
            >
              <span className="nav-icon" style={{ opacity: 0.8 }}><item.icon size={18} /></span>
              <span style={{ flex: 1, fontSize: '0.9rem' }}>{item.label}</span>
              {!item.ready && <span title="Being rebuilt for cloud" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--yellow)', opacity: 0.8 }} />}
            </NavLink>)}
          </div>)}
        </nav>
        <div className="sidebar-footer" style={{ padding: '20px 24px 0', borderTop: '1px solid var(--border)', marginTop: 20 }}>
          <a href="/cdn-cgi/access/logout" style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'inherit', textDecoration: 'none', marginBottom: 12 }}><LogOut size={16} /> Log out</a>
          CharityPro Cloud · Canada 🇨🇦
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontFamily: 'Outfit, sans-serif', fontWeight: 700, color: 'var(--navy)' }}>{pageLabel}</h1>
          <div style={{ padding: '8px 16px', fontSize: '0.85rem', fontWeight: 800, color: 'var(--green)', background: 'var(--green-bg)', borderRadius: 999, border: '1px solid rgba(5,150,105,0.2)' }}>● CLOUD ONLY</div>
        </header>
        <div className="content-area" style={{ padding: 0 }}>{children}</div>
      </main>
    </div>
  );
};
