import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  BarChart3, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, House, Landmark, ListChecks,
  LogOut, Menu, Receipt, Settings, ShieldCheck, Users, X } from 'lucide-react';
import { ReminderBell } from './ReminderBell';
import { AskAiButton } from './AskAiButton';
import { ChangeRequestButton } from './ChangeRequestButton';
import { PageExportButton } from './PageExportButton';
import { startLiveRefresh, subscribeLiveStatus, type LiveStatus } from '../utils/liveUpdates';

type NavItem = { path: string; label: string };
type NavCategory = { label: string; icon: React.ElementType; items: NavItem[] };

// Menu groups fold open and closed, like DonorFuse. Same pages and links as before.
const categories: NavCategory[] = [
  { label: 'Home', icon: House, items: [
    { path: '/', label: 'Dashboard' },
    { path: '/calendar', label: 'Calendar' },
    { path: '/reminders', label: 'Reminders' }
  ] },
  { label: 'Contacts', icon: Users, items: [
    { path: '/donors', label: 'Donors' },
    { path: '/tracker', label: 'Call Tracker' },
    { path: '/fundraisers', label: 'Fundraisers' }
  ] },
  { label: 'Donations', icon: CircleDollarSign, items: [
    { path: '/pledges', label: 'Pledges' },
    { path: '/payments', label: 'Payments' },
    { path: '/campaigns', label: 'Campaigns' },
    { path: '/receipts', label: 'Official Receipts' }
  ] },
  { label: 'Expenses', icon: Receipt, items: [
    { path: '/vendors', label: 'Vendors' },
    { path: '/expenses', label: 'Bills & Expenses' },
    { path: '/write-checks', label: 'Write Checks' }
  ] },
  { label: 'Accounting', icon: Landmark, items: [
    { path: '/transactions', label: 'Transactions' },
    { path: '/chart-of-accounts', label: 'Chart of Accounts' },
    { path: '/bank-feed', label: 'Bank Feed' },
    { path: '/payroll', label: 'Payroll & T4A' },
    { path: '/reconciliation', label: 'Reconciliation' },
    { path: '/sola-sync', label: 'Sola Payments Sync' },
    { path: '/stripe-sync', label: 'Stripe Sync (USD)' }
  ] },
  { label: 'Reports', icon: BarChart3, items: [
    { path: '/reports', label: 'Reports' },
    { path: '/profit-loss', label: 'Profit & Loss' }
  ] },
  { label: 'Tasks & Activities', icon: ListChecks, items: [
    { path: '/tasks', label: 'Tasks' },
    { path: '/change-requests', label: 'Change requests' }
  ] },
  { label: 'Settings', icon: Settings, items: [
    { path: '/settings', label: 'Settings' }
  ] },
  { label: 'System', icon: ShieldCheck, items: [
    { path: '/audit-history', label: 'Audit History' }
  ] }
];

const groupOf = (path: string) => categories.find(category => category.items.some(item => item.path === path))?.label;
const readStored = (key: string) => { try { return window.localStorage.getItem(key); } catch { return null; } };
const writeStored = (key: string, value: string) => { try { window.localStorage.setItem(key, value); } catch { /* private window */ } };

export const CloudLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const pageLabel = categories.flatMap(category => category.items).find(item => item.path === location.pathname)?.label || 'CharityPro';

  useEffect(() => setNavigationOpen(false), [location.pathname]);

  // Which menu groups are open. The group of the current page always opens.
  const [openGroups, setOpenGroups] = useState<string[]>(() => {
    const current = groupOf(location.pathname);
    let saved: unknown = [];
    try { saved = JSON.parse(readStored('cp-open-menu-groups') || '[]'); } catch { saved = []; }
    const list = Array.isArray(saved) ? saved.filter((value): value is string => typeof value === 'string') : [];
    return Array.from(new Set([...list, ...(current ? [current] : [])]));
  });
  useEffect(() => {
    const current = groupOf(location.pathname);
    if (current) setOpenGroups(groups => groups.includes(current) ? groups : [...groups, current]);
  }, [location.pathname]);
  useEffect(() => writeStored('cp-open-menu-groups', JSON.stringify(openGroups)), [openGroups]);
  const toggleGroup = (label: string) => setOpenGroups(groups => groups.includes(label) ? groups.filter(group => group !== label) : [...groups, label]);

  // The arrow next to the page name hides or shows the menu on a computer screen.
  const [menuHidden, setMenuHidden] = useState(() => readStored('cp-menu-hidden') === '1');
  useEffect(() => writeStored('cp-menu-hidden', menuHidden ? '1' : '0'), [menuHidden]);

  // Keep the live-update check running on every page and show its real status.
  const [liveStatus, setLiveStatus] = useState<LiveStatus>('connecting');
  useEffect(() => subscribeLiveStatus(setLiveStatus), []);
  useEffect(() => startLiveRefresh(() => undefined), []);
  const liveLabel = liveStatus === 'live' ? 'Live' : liveStatus === 'offline' ? 'Offline – retrying' : 'Connecting…';
  const liveTitle = liveStatus === 'live'
    ? 'Changes made by anyone appear here within about 2 seconds.'
    : liveStatus === 'offline'
      ? 'Cannot reach the server right now. Your screen will catch up automatically when the connection returns.'
      : 'Connecting to live updates…';

  return (
    <div className={`app-container ${navigationOpen ? 'navigation-open' : ''} ${menuHidden ? 'menu-hidden' : ''}`}>
      <button className="navigation-scrim" type="button" aria-label="Close navigation" onClick={() => setNavigationOpen(false)} />
      <aside className="sidebar" aria-label="Main navigation">
        <div className="sidebar-logo">
          <img className="sidebar-brand-logo" src="/charitypro-kth-company-logo.png" alt="KTH CharityPro" />
          <div><div className="sidebar-logo-text">Hatzolah Tosh</div><div className="sidebar-logo-sub">CharityPro</div></div>
          <button className="sidebar-close" type="button" aria-label="Close navigation" onClick={() => setNavigationOpen(false)}><X size={20} /></button>
        </div>
        <nav className="sidebar-nav">
          {categories.map(category => {
            const open = openGroups.includes(category.label);
            const hasActive = category.items.some(item => item.path === location.pathname);
            return <div className={`nav-group${open ? ' is-open' : ''}${hasActive ? ' has-active' : ''}`} key={category.label}>
              <button type="button" className="nav-group-head" aria-expanded={open} onClick={() => toggleGroup(category.label)}>
                <span className="nav-icon"><category.icon size={17} /></span>
                <span className="nav-label">{category.label}</span>
                <ChevronDown className="nav-chevron" size={15} />
              </button>
              {open && <div className="nav-group-items">
                {category.items.map(item => <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <span className="nav-label">{item.label}</span>
                </NavLink>)}
              </div>}
            </div>;
          })}
        </nav>
        <div className="sidebar-footer">
          <button
            type="button"
            className="sidebar-logout"
            onClick={() => { window.location.href = '/cdn-cgi/access/logout'; }}
          >
            <LogOut size={16} /> Log out
          </button>
          <span>CharityPro Cloud · Canada 🇨🇦</span>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div className="topbar-brand">
            <button className="menu-button" type="button" aria-label="Open navigation" aria-expanded={navigationOpen} onClick={() => setNavigationOpen(true)}><Menu size={22} /></button>
            <button className="menu-toggle" type="button" aria-label={menuHidden ? 'Show menu' : 'Hide menu'} title={menuHidden ? 'Show menu' : 'Hide menu'} onClick={() => setMenuHidden(value => !value)}>{menuHidden ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</button>
            <h1>{pageLabel}</h1>
          </div>
          <div className="topbar-actions"><ChangeRequestButton/><AskAiButton/><PageExportButton path={location.pathname}/><ReminderBell/><div className={`cloud-status cloud-status-${liveStatus}`} title={liveTitle} role="status" aria-live="polite"><span />{liveLabel}</div></div>
        </header>
        <div className="content-area" style={{ padding: 0 }}>{children}</div>
      </main>
    </div>
  );
};
