import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useStore } from '../store';
import {
  LayoutDashboard,
  Users,
  Wallet,
  PieChart,
  Settings,
  HeartHandshake,
  Plus,
  UserPlus,
} from 'lucide-react';
import { AddDonorModal } from './AddDonorModal';
import { PaymentModal } from './PaymentModal';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isRtl, donors } = useStore();
  const location = useLocation();
  const [showQuickMenu, setShowQuickMenu] = useState(false);
  const [showAddDonor, setShowAddDonor] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [payDonorId, setPayDonorId] = useState('');

  const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/donors', label: 'Donors', icon: Users },
    { path: '/fundraisers', label: 'Fundraisers', icon: HeartHandshake },
    { path: '/accounting', label: 'Accounting', icon: Wallet },
    { path: '/expenses', label: 'Expenses & Bills', icon: PieChart },
    { path: '/settings', label: 'Settings', icon: Settings },
  ];

  const pageLabel = navItems.find(i => i.path === location.pathname)?.label || 'Dashboard';

  return (
    <div className="app-container" dir={isRtl ? 'rtl' : 'ltr'}>
      <aside className="sidebar">
        {/* Logo */}
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
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          CharityPro v1.0 · Canada 🇨🇦
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontFamily: 'Outfit, sans-serif', fontWeight: 700, color: 'var(--navy)' }}>
              {pageLabel}
            </h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="badge badge-green" style={{ padding: '8px 16px', fontSize: '0.875rem' }}>
              🏦 Balance: $169,700 CAD
            </div>

            {/* Quick Action Button */}
            <div style={{ position: 'relative' }}>
              <button
                className="btn btn-primary"
                onClick={() => setShowQuickMenu(q => !q)}
                style={{ gap: '8px' }}
              >
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
                    <button style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '14px 20px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-input)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                      onClick={() => { setShowQuickMenu(false); setShowAddDonor(true); }}>
                      <UserPlus size={18} style={{ color: 'var(--navy-light)' }} /> Add New Donor
                    </button>
                    <div style={{ height: '1px', background: 'var(--border)' }} />
                    <button style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '14px 20px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-input)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                      onClick={() => { setShowQuickMenu(false); setPayDonorId(donors[0]?.id || ''); setShowPayment(true); }}>
                      <Wallet size={18} style={{ color: 'var(--green)' }} /> Process Donation
                    </button>
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
