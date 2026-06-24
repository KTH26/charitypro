import React, { useState } from 'react';
import { useStore } from '../store';
import { Globe, DollarSign, Layout, Receipt, RefreshCw, Check } from 'lucide-react';
import { useT } from '../i18n';

export const Settings: React.FC = () => {
  const { isRtl, toggleRtl, currency, setCurrency, exchangeRate, setExchangeRate } = useStore();
  const T = useT(isRtl);
  const [syncing, setSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);
  const [manualRate, setManualRate] = useState(String(exchangeRate));

  // Fetch live exchange rate from a free public API
  const handleSyncRate = async () => {
    setSyncing(true);
    setSyncDone(false);
    try {
      const res = await fetch('https://api.frankfurter.app/latest?from=CAD&to=USD');
      const data = await res.json();
      const rate = data?.rates?.USD;
      if (rate) {
        setExchangeRate(parseFloat(rate.toFixed(4)));
        setManualRate(rate.toFixed(4));
        setSyncDone(true);
        setTimeout(() => setSyncDone(false), 3000);
      }
    } catch {
      // Fallback: use a static recent rate
      setExchangeRate(0.73);
      setManualRate('0.73');
      setSyncDone(true);
      setTimeout(() => setSyncDone(false), 3000);
    } finally {
      setSyncing(false);
    }
  };

  const handleManualRate = (val: string) => {
    setManualRate(val);
    const n = parseFloat(val);
    if (!isNaN(n) && n > 0) setExchangeRate(n);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>

      {/* System Preferences */}
      <div className="card" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '28px' }}>
        <h2 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', color: 'var(--navy)', fontSize: '1.3rem' }}>
          {T('system_prefs')}
        </h2>

        {/* Language / RTL */}
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '12px', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
            <Layout size={16} /> {T('language_layout')}
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <button
              onClick={() => { if (isRtl) toggleRtl(); }}
              style={{
                padding: '16px', borderRadius: '12px', border: `2px solid ${!isRtl ? 'var(--navy-light)' : 'var(--border)'}`,
                background: !isRtl ? 'var(--navy-bg)' : 'var(--bg-input)',
                color: !isRtl ? 'var(--navy-light)' : 'var(--text-muted)',
                cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.95rem',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', transition: 'all 0.2s'
              }}>
              <span style={{ fontSize: '1.5rem' }}>🇨🇦</span>
              {T('english_ltr')}
              {!isRtl && <span style={{ fontSize: '0.75rem', color: 'var(--navy-light)' }}>✓ Active</span>}
            </button>
            <button
              onClick={() => { if (!isRtl) toggleRtl(); }}
              style={{
                padding: '16px', borderRadius: '12px', border: `2px solid ${isRtl ? 'var(--navy-light)' : 'var(--border)'}`,
                background: isRtl ? 'var(--navy-bg)' : 'var(--bg-input)',
                color: isRtl ? 'var(--navy-light)' : 'var(--text-muted)',
                cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.95rem',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', transition: 'all 0.2s'
              }}>
              <span style={{ fontSize: '1.5rem' }}>🕍</span>
              {T('yiddish_rtl')}
              {isRtl && <span style={{ fontSize: '0.75rem', color: 'var(--navy-light)' }}>✓ {isRtl ? 'אַקטיוו' : 'Active'}</span>}
            </button>
          </div>
          {isRtl && (
            <div style={{ marginTop: '12px', padding: '10px 14px', background: 'var(--navy-bg)', borderRadius: '10px', fontSize: '0.85rem', color: 'var(--navy-light)', fontWeight: 600 }}>
              🕍 מאָד: ייִדיש / רעכטס צו לינקס אַקטיוו — כל הטקסטים בממשק מוצגים ביידיש
            </div>
          )}
        </div>

        {/* Currency */}
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '12px', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
            <Globe size={16} /> {T('default_currency')}
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {(['CAD', 'USD'] as const).map(c => (
              <button key={c} onClick={() => setCurrency(c)} style={{
                padding: '14px', borderRadius: '12px', border: `2px solid ${currency === c ? 'var(--navy-light)' : 'var(--border)'}`,
                background: currency === c ? 'var(--navy-bg)' : 'var(--bg-input)',
                color: currency === c ? 'var(--navy-light)' : 'var(--text-muted)',
                cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: '1rem', transition: 'all 0.2s'
              }}>{c} ($) {currency === c ? '✓' : ''}</button>
            ))}
          </div>
        </div>

        {/* Exchange Rate */}
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '12px', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
            <DollarSign size={16} /> {T('exchange_rate')}
          </label>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: 'var(--text-muted)' }}>1 CAD =</span>
              <input
                type="number"
                step="0.001"
                min="0"
                value={manualRate}
                onChange={e => handleManualRate(e.target.value)}
                style={{ paddingLeft: '80px', fontWeight: 800, fontSize: '1.1rem' }}
              />
              <span style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', fontWeight: 700, color: 'var(--text-muted)' }}>USD</span>
            </div>
            <button
              className="btn btn-secondary"
              onClick={handleSyncRate}
              disabled={syncing}
              style={{ whiteSpace: 'nowrap', minWidth: '140px', gap: '8px' }}
            >
              {syncDone
                ? <><Check size={16} style={{ color: 'var(--green)' }} /> {isRtl ? 'פֿאַרטיק!' : 'Updated!'}</>
                : syncing
                  ? <><RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> {T('syncing')}</>
                  : <><RefreshCw size={16} /> {T('sync_rate')}</>
              }
            </button>
          </div>
          <div style={{ marginTop: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {isRtl ? 'דאַטן פֿון Frankfurter API' : 'Live data from Frankfurter API (European Central Bank)'}
          </div>
        </div>
      </div>

      {/* Receipts & Legal */}
      <div className="card" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <h2 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', color: 'var(--navy)', fontSize: '1.3rem' }}>
          {T('receipts')}
        </h2>

        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '12px', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
            <Receipt size={16} /> {T('receipt_template')}
          </label>
          <div style={{ background: 'var(--bg-input)', borderRadius: '12px', border: '2px dashed var(--border)', padding: '48px 24px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--navy-light)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            onClick={() => alert(isRtl ? 'PDF רעדאַגירן קומט באַלד' : 'PDF editor coming soon!')}>
            <Receipt size={40} style={{ color: 'var(--text-muted)', display: 'block', margin: '0 auto 12px' }} />
            <p style={{ margin: 0, color: 'var(--text-muted)', fontWeight: 600 }}>{T('click_edit')}</p>
          </div>
          <button className="btn btn-secondary" style={{ marginTop: '16px', width: '100%' }}
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file'; input.accept = '.pdf,.png,.jpg';
              input.click();
            }}>
            {T('upload_design')}
          </button>
        </div>

        {/* App Info */}
        <div style={{ marginTop: 'auto', padding: '16px', background: 'var(--bg-input)', borderRadius: '12px' }}>
          <div style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: '8px' }}>
            {isRtl ? 'סיסטעם אינפֿאָרמאַציע' : 'System Information'}
          </div>
          {[
            [isRtl ? 'ווערסיע' : 'Version', '1.0.0'],
            [isRtl ? 'שפּראַך' : 'Language', isRtl ? 'ייִדיש' : 'English'],
            [isRtl ? 'וואַלוטע' : 'Currency', currency],
            [isRtl ? 'וועקסלקורס' : 'Exchange Rate', `1 CAD = ${exchangeRate} USD`],
            [isRtl ? 'לייאַוט' : 'Layout', isRtl ? 'רעכטס-לינקס' : 'Left-to-Right'],
          ].map(([label, val]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-light)', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>{label}</span>
              <span style={{ fontWeight: 700 }}>{val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* CSS animation for spinner */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};
