import React from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import { Construction } from 'lucide-react';

export const ComingSoon: React.FC = () => {
  const { isRtl } = useStore();
  const T = useT(isRtl);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', textAlign: 'center' }}>
      <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--blue-bg)', color: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
        <Construction size={40} />
      </div>
      <h2 style={{ fontSize: '2rem', margin: '0 0 16px', color: 'var(--navy)' }}>
        {isRtl ? 'קומט באַלד!' : 'Coming Soon!'}
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', maxWidth: '400px' }}>
        {isRtl 
          ? 'די פיטשור ווערט איצט אנטוויקלט און וועט זיין גרייט אין די קומענדיגע אפדעיטס.' 
          : 'This feature is currently under development and will be available in upcoming updates.'}
      </p>
    </div>
  );
};
