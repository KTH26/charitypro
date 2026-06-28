import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import {
  LayoutDashboard, Users, Wallet, PieChart, Settings,
  HeartHandshake, Plus, UserPlus, BarChart3, Calendar, CheckSquare, Upload,
  Building, List, FileText, CalendarClock, Ticket, Store, Printer, Link as LinkIcon,
  LogOut, Megaphone, Medal
} from 'lucide-react';
import { AddDonorModal } from './AddDonorModal';
import { PaymentModal } from './PaymentModal';
import { BulkUploadModal } from './BulkUploadModal';
import { useT } from '../i18n';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isRtl, donors, tasks, accounts } = useStore();
  const location = useLocation();
  const navigate = useNavigate();
  const T = useT(isRtl);

  const [showQuickMenu, setShowQuickMenu] = useState(false);
  const [showAddDonor, setShowAddDonor] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [payDonorId] = useState(donors[0]?.id || '');

  const pendingTasks = tasks.filter(t => !t.completed).length;
  const highTasks = tasks.filter(t => !t.completed && t.priority === 'high').length;
  const totalBalance = accounts.filter(a => a.type === 'asset' && a.currency === 'CAD').reduce((s, a) => s + a.balance, 0);

  interface NavSubItem {
    path: string;
    label: string;
  }

  interface NavItem {
    path: string;
    label: string;
    icon: React.ElementType;
    badge?: number;
    badgeUrgent?: boolean;
    subItems?: NavSubItem[];
  }

  interface NavCategory {
    label: string;
    items: NavItem[];
  }

  const navCategories: NavCategory[] = [
    {
      label: T('nav_home_cat'),
      items: [
        { path: '/', label: T('nav_dashboard'), icon: LayoutDashboard },
        { path: '/calendar', label: T('nav_calendar'), icon: Calendar },
      ]
    },
    {
      label: T('nav_contacts_cat'),
      items: [
        { path: '/donors', label: T('nav_donors'), icon: Users }
      ]
    },
    {
      label: T('nav_donations_cat'),
      items: [
        { path: '/pledges', label: T('nav_pledges'), icon: HeartHandshake },
        { path: '/payments', label: T('nav_payments'), icon: Wallet },
        { path: '/schedules', label: T('nav_schedules'), icon: CalendarClock },
      ]
    },
    {
      label: T('nav_expenses_cat'),
      items: [
        { path: '/vendors', label: T('nav_vendors'), icon: Store },
        { path: '/expenses', label: T('nav_bills'), icon: FileText },
      ]
    },
    {
      label: T('nav_accounting_cat'),
      items: [
        { path: '/transactions', label: T('nav_transactions'), icon: Wallet },
        { path: '/chart-of-accounts', label: T('nav_chart_accounts'), icon: List },
        { path: '/bank-feed', label: T('nav_bank_feed'), icon: Building },
        { path: '/payroll', label: 'Payroll & T4A', icon: Users },
        { path: '/reconciliation', label: T('nav_reconciliation'), icon: CheckSquare },
        { path: '/sola-sync', label: 'Sola Payments Sync', icon: LinkIcon },
      ]
    },
    {
      label: T('nav_reports_cat'),
      items: [
        { path: '/reports', label: T('nav_fundraising_rep'), icon: BarChart3 },
        { path: '/coming-soon', label: T('nav_profit_loss'), icon: BarChart3 },
      ]
    },
    {
      label: T('nav_system_cat'),
      items: [
        { path: '/tasks', label: T('nav_tasks'), icon: CheckSquare, badge: pendingTasks > 0 ? pendingTasks : undefined, badgeUrgent: highTasks > 0 },
        { path: '/settings', label: T('nav_settings'), icon: Settings },
        { path: '#logout', label: T('nav_logout'), icon: LogOut },
      ]
    }
  ];

  // Flatten items to find current page label
  const flatNavItems = navCategories.flatMap(cat => cat.items);
  const pageLabel = flatNavItems.find(i => i.path === location.pathname && i.path !== '/coming-soon')?.label || T('nav_dashboard');

  return (
    <div className="app-container" dir={isRtl ? 'rtl' : 'ltr'}>
      <aside className="sidebar" style={{ padding: '24px 0', overflowY: 'auto' }}>
        <div className="sidebar-logo" style={{ padding: '0 24px 20px', borderBottom: '1px solid var(--border)', marginBottom: '20px' }}>
          <div className="sidebar-logo-icon">❤</div>
          <div>
            <div className="sidebar-logo-text">{T('app_name')}</div>
            <div className="sidebar-logo-sub">{T('app_sub')}</div>
          </div>
        </div>

        <nav className="sidebar-nav" style={{ padding: '0 16px' }}>
          {navCategories.map((category, idx) => (
            <div key={idx} style={{ marginBottom: '16px' }}>
              <div className="sidebar-section-label" style={{ paddingLeft: '8px', paddingRight: '8px', marginBottom: '8px' }}>
                {category.label}
              </div>
              {category.items.map((item, i) => (
                <div key={i} style={{ marginBottom: '4px' }}>
                  <Link
                    to={item.path === '#logout' ? '#' : item.path}
                    onClick={item.path === '#logout' ? (e) => { e.preventDefault(); alert("Logout functionality will clear tokens and redirect to login page."); window.location.href = '/login'; } : undefined}
                    className={`nav-item ${location.pathname === item.path && item.path !== '/coming-soon' ? 'active' : ''}`}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      opacity: item.path === '/coming-soon' ? 0.6 : 1
                    }}
                  >
                    <span className="nav-icon" style={{ opacity: 0.8 }}><item.icon size={18} /></span>
                    <span style={{ flex: 1, fontSize: '0.9rem' }}>{item.label}</span>
                    {item.badge !== undefined && (
                      <span style={{
                        background: item.badgeUrgent ? 'var(--red)' : 'rgba(255,255,255,0.2)',
                        color: '#fff', borderRadius: '999px', padding: '2px 8px',
                        fontSize: '0.7rem', fontWeight: 800, minWidth: '20px', textAlign: 'center'
                      }}>{item.badge}</span>
                    )}
                  </Link>
                  {item.subItems && (
                    <div style={{ paddingLeft: '32px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {item.subItems.map((sub, j) => (
                        <Link
                          key={j}
                          to={sub.path}
                          className="nav-item"
                          style={{
                            padding: '6px 12px',
                            fontSize: '0.85rem',
                            opacity: 0.7,
                            borderRadius: '8px'
                          }}
                        >
                          {sub.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer" style={{ padding: '20px 24px 0', borderTop: '1px solid var(--border)', marginTop: '20px' }}>
          {T('app_name')} v1.0 · Canada 🇨🇦
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontFamily: 'Outfit, sans-serif', fontWeight: 700, color: 'var(--navy)' }}>
            {pageLabel}
          </h1>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button className="btn btn-secondary" onClick={() => setShowBulkUpload(true)} style={{ gap: '8px' }}>
              <Upload size={16} /> {T('bulk_upload')}
            </button>
            <div style={{ padding: '8px 16px', fontSize: '0.875rem', fontWeight: 700, color: 'var(--green)', background: 'var(--green-bg)', borderRadius: '999px', border: '1px solid rgba(5,150,105,0.2)' }}>
              🏦 CAD ${totalBalance.toLocaleString()}
            </div>

            <div style={{ position: 'relative' }}>
              <button className="btn btn-primary" onClick={() => setShowQuickMenu(q => !q)}>
                <Plus size={18} /> {T('new_action')}
              </button>

              {showQuickMenu && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setShowQuickMenu(false)} />
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 8px)', right: isRtl ? 'auto' : 0, left: isRtl ? 0 : 'auto',
                    zIndex: 999, background: 'white', borderRadius: '14px', boxShadow: 'var(--shadow-float)',
                    border: '1px solid var(--border)', minWidth: '220px', overflow: 'hidden'
                  }}>
                    {[
                      { icon: <UserPlus size={18} style={{ color: 'var(--navy-light)' }} />, label: T('add_donor'), action: () => { setShowQuickMenu(false); setShowAddDonor(true); } },
                      { icon: <Wallet size={18} style={{ color: 'var(--green)' }} />, label: T('process_payment'), action: () => { setShowQuickMenu(false); setShowPayment(true); } },
                      { icon: <CheckSquare size={18} style={{ color: 'var(--yellow)' }} />, label: T('add_task'), action: () => { setShowQuickMenu(false); navigate('/tasks'); } },
                    ].map(item => (
                      <button key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '14px 20px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', transition: 'background 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-input)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                        onClick={item.action}>
                        {item.icon} {item.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <div className="content-area">
          {children}
        </div>
      </main>

      {showAddDonor && <AddDonorModal onClose={() => setShowAddDonor(false)} />}
      {showPayment && payDonorId && <PaymentModal donorId={payDonorId} onClose={() => setShowPayment(false)} />}
      {showBulkUpload && <BulkUploadModal onClose={() => setShowBulkUpload(false)} />}
    </div>
  );
};
