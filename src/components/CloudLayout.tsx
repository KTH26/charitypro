import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  BarChart3, Building, Calendar, CalendarClock, CheckSquare, FileText,
  HeartHandshake, LayoutDashboard, Link as LinkIcon, List, LogOut, Printer,
  Menu, Settings, ShieldCheck, Store, Users, Wallet, X
} from 'lucide-react';
import { ReminderBell } from './ReminderBell';

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
    { path: '/campaigns', label: 'Campaigns', icon: HeartHandshake, ready: true },
    { path: '/pledges', label: 'Pledges', icon: HeartHandshake, ready: true },
    { path: '/payments', label: 'Payments', icon: Wallet, ready: true },
    { path: '/pending-payments', label: 'Pending Verification', icon: CalendarClock, ready: true },
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
    { path: '/payroll', label: 'Payroll & T4A', icon: Users, ready: true },
    { path: '/reconciliation', label: 'Reconciliation', icon: CheckSquare, ready: true },
    { path: '/sola-sync', label: 'Sola Payments Sync', icon: LinkIcon, ready: true }
  ] },
  { label: 'REPORTS', items: [
    { path: '/reports', label: 'Fundraising Reports', icon: BarChart3, ready: true },
    { path: '/profit-loss', label: 'Profit & Loss', icon: BarChart3, ready: true }
  ] },
  { label: 'SYSTEM', items: [
    { path: '/tasks', label: 'Tasks', icon: CheckSquare, ready: true },
    { path: '/audit-history', label: 'Audit History', icon: ShieldCheck, ready: true },
    { path: '/settings', label: 'Settings', icon: Settings, ready: true }
  ] }
];

export const CloudLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const pageLabel = categories.flatMap(category => category.items).find(item => item.path === location.pathname)?.label || 'CharityPro';

  useEffect(() => setNavigationOpen(false), [location.pathname]);

  return (
    <div className={`app-container ${navigationOpen ? 'navigation-open' : ''}`}>
      <button className="navigation-scrim" type="button" aria-label="Close navigation" onClick={() => setNavigationOpen(false)} />
      <aside className="sidebar" aria-label="Main navigation">
        <div className="sidebar-logo">
          <img className="sidebar-brand-logo" src="/charitypro-kth-logo.png" alt="KTH CharityPro" />
          <div><div className="sidebar-logo-text">Hatzolah Tosh</div><div className="sidebar-logo-sub">CharityPro</div></div>
          <button className="sidebar-close" type="button" aria-label="Close navigation" onClick={() => setNavigationOpen(false)}><X size={20} /></button>
        </div>
        <nav className="sidebar-nav">
          {categories.map(category => <div className="sidebar-section" key={category.label}>
            <div className="sidebar-section-label">{category.label}</div>
            {category.items.map(item => <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="nav-icon"><item.icon size={18} /></span>
              <span className="nav-label">{item.label}</span>
              {!item.ready && <span title="Being rebuilt for cloud" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--yellow)', opacity: 0.8 }} />}
            </NavLink>)}
          </div>)}
        </nav>
        <div className="sidebar-footer">
          <a className="sidebar-logout" href="/cdn-cgi/access/logout"><LogOut size={16} /> Log out</a>
          <span>CharityPro Cloud · Canada 🇨🇦</span>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div className="topbar-brand"><button className="menu-button" type="button" aria-label="Open navigation" aria-expanded={navigationOpen} onClick={() => setNavigationOpen(true)}><Menu size={22} /></button><img src="/charitypro-kth-logo.png" alt="" /><div><span className="topbar-eyebrow">Hatzolah Tosh</span><h1>{pageLabel}</h1></div></div>
          <div className="topbar-actions"><ReminderBell/><div className="cloud-status"><span />Cloud live</div></div>
        </header>
        <div className="content-area" style={{ padding: 0 }}>{children}</div>
      </main>
    </div>
  );
};
