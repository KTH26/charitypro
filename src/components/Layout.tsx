import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useStore } from '../store';
import { 
  LayoutDashboard, 
  Users, 
  Wallet, 
  PieChart, 
  Settings, 
  HeartHandshake
} from 'lucide-react';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isRtl } = useStore();
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/donors', label: 'Donors', icon: Users },
    { path: '/fundraisers', label: 'Fundraisers', icon: HeartHandshake },
    { path: '/accounting', label: 'Accounting', icon: Wallet },
    { path: '/expenses', label: 'Expenses & Bills', icon: PieChart },
    { path: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="app-container" dir={isRtl ? 'rtl' : 'ltr'}>
      <aside className="sidebar">
        <div className="sidebar-header">
          <HeartHandshake className="text-primary" size={28} />
          <span>CharityPro</span>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>
      
      <main className="main-content">
        <header className="top-header">
          <h1 className="header-title">
            {navItems.find((i) => i.path === location.pathname)?.label || 'Dashboard'}
          </h1>
          <div className="header-actions">
            <div className="badge badge-info" style={{ padding: '8px 16px', fontSize: '0.875rem' }}>
              Balance: $145,200.00 CAD
            </div>
            <button className="btn btn-primary">
              + New Donation
            </button>
          </div>
        </header>
        <div className="content-area">
          {children}
        </div>
      </main>
    </div>
  );
};
