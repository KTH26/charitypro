import React from 'react';
import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';

export const NotFound: React.FC = () => (
  <div className="page-container" style={{ textAlign: 'center', paddingTop: 80, paddingBottom: 80 }}>
    <div style={{
      fontSize: '6rem',
      fontFamily: 'Outfit, sans-serif',
      fontWeight: 800,
      color: 'var(--navy)',
      lineHeight: 1,
      marginBottom: 16,
      opacity: 0.15,
    }}>
      404
    </div>
    <h1 className="page-title" style={{ marginBottom: 12 }}>Page not found</h1>
    <p className="page-subtitle" style={{ marginBottom: 32, maxWidth: 400, margin: '0 auto 32px' }}>
      The page you're looking for doesn't exist or may have been moved.
    </p>
    <Link
      to="/"
      className="btn btn-primary"
      style={{ display: 'inline-flex', gap: 8, alignItems: 'center', textDecoration: 'none' }}
    >
      <Home size={18} /> Back to Dashboard
    </Link>
  </div>
);
