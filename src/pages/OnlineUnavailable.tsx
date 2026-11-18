import React from 'react';

export const OnlineUnavailable: React.FC<{ title: string }> = ({ title }) => (
  <main className="page">
    <div className="card" style={{ maxWidth: 720, margin: '60px auto', padding: 34, textAlign: 'center' }}>
      <div className="page-eyebrow">CHARITYPRO CLOUD</div>
      <h1 className="page-title">{title}</h1>
      <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 auto 22px', maxWidth: 560 }}>
        This option is visible so your familiar menu stays complete. It is being rebuilt to use the shared cloud database and will not open the retired local system.
      </p>
      <a className="btn btn-primary" href="/payments">Return to Payments</a>
    </div>
  </main>
);
