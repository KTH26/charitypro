import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useStore } from '../store';
import {
  LayoutDashboard, Users, Wallet, PieChart, Settings,
  HeartHandshake, Plus, UserPlus, BarChart3, Calendar, CheckSquare,
} from 'lucide-react';
import { AddDonorModal } from './AddDonorModal';
import { PaymentModal } from './PaymentModal';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isRtl, donors, tasks, bankAccounts } = useStore();
  const location = useLocation();
  const [showQuickMenu, setShowQuickMenu] = useState(false);
  const [showAddDonor, setShowAddDonor] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [payDonorId] = useState(donors[0]?.id || '');

  const pendingTasks = tasks.filter(t => !t.completed).length;
  const highTasks = tasks.filter(t => !t.completed && t.priority === 'high').length;
  const totalBalance = bankAccounts.filter(a => !a.isInternal && a.currency === 'CAD').reduce((s, a) => s + a.balance, 0);

  const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/donors', label: 'Donors', icon: Users },
    { path: '/fundraisers', label: 'Fundraisers', icon: HeartHandshake },
    { path: '/accounting', label: 'Accounting', icon: Wallet },
    { path: '/expenses', label: 'Expenses & Bills', icon: PieChart },
    { path: '/reports', label: 'Reports', icon: BarChart3 },
    { path: '/calendar', label: 'Calendar', icon: Calendar },
    { path: '/tasks', label: 'Tasks', icon: CheckSquare, badge: pendingTasks > 0 ? pendingTasks : undefined, badgeUrgent: highTasks > 0 },
    { path: '/settings', label: 'Settings', icon: Settings },
  ];

  const pageLabel = navItems.find(i => i.path === location.pathname)?.label || 'Dashboard';

  return (
    <div className="app-container" dir={isRtl ? 'rtl' : 'ltr'}>
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">❤</div>
          <div>
            <div className="sidebar-logo-text">CharityPro</div>
            <div className="sidebar-logo-sub">Management System</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-label">Main Menu</div>
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
            >
              <span className="nav-icon"><item.icon size={20} /></span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge !== undefined && (
                <span style={{
                  background: item.badgeUrgent ? 'var(--red)' : 'rgba(255,255,255,0.2)',
                  color: '#fff', borderRadius: '999px', padding: '2px 8px',
                  fontSize: '0.7rem', fontWeight: 800, minWidth: '20px', textAlign: 'center'
                }}>{item.badge}</span>
              )}
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          CharityPro v1.0 · Canada 🇨🇦
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontFamily: 'Outfit, sans-serif', fontWeight: 700, color: 'var(--navy)' }}>
            {pageLabel}
          </h1>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ padding: '8px 16px', fontSize: '0.875rem', fontWeight: 700, color: 'var(--green)', background: 'var(--green-bg)', borderRadius: '999px', border: '1px solid rgba(5,150,105,0.2)' }}>
              🏦 CAD Balance: ${totalBalance.toLocaleString()}
            </div>

            <div style={{ position: 'relative' }}>
              <button className="btn btn-primary" onClick={() => setShowQuickMenu(q => !q)}>
                <Plus size={18} /> New Action
              </button>

              {showQuickMenu && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setShowQuickMenu(false)} />
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 999,
                    background: 'white', borderRadius: '14px', boxShadow: 'var(--shadow-float)',
                    border: '1px solid var(--border)', minWidth: '220px', overflow: 'hidden'
                  }}>
                    {[
                      { icon: <UserPlus size={18} style={{ color: 'var(--navy-light)' }} />, label: 'Add New Donor', action: () => { setShowQuickMenu(false); setShowAddDonor(true); } },
                      { icon: <Wallet size={18} style={{ color: 'var(--green)' }} />, label: 'Process Donation', action: () => { setShowQuickMenu(false); setShowPayment(true); } },
                      { icon: <CheckSquare size={18} style={{ color: 'var(--yellow)' }} />, label: 'Add Task', action: () => { setShowQuickMenu(false); window.location.href = '/tasks'; } },
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
    </div>
  );
};
