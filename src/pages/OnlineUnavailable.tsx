import React from 'react';

export const OnlineUnavailable: React.FC<{ title: string }> = ({ title }) => (
  <main style={{ minHeight: 'calc(100vh - 76px)', background: 'var(--bg)', padding: 28, fontFamily: 'Inter, sans-serif' }}>
    <div className="card" style={{ maxWidth: 720, margin: '60px auto', padding: 34, textAlign: 'center' }}>
      <div style={{ color: 'var(--green)', fontWeight: 800, fontSize: 13 }}>CHARITYPRO CLOUD</div>
      <h1 style={{ color: 'var(--navy)', marginBottom: 10 }}>{title}</h1>
      <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 auto 22px', maxWidth: 560 }}>
        This option is visible so your familiar menu stays complete. It is being rebuilt to use the shared cloud database and will not open the retired local system.
      </p>
      <a className="btn btn-primary" href="/payments">Return to Payments</a>
    </div>
  </main>
);
