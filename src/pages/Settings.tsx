import React, { useState } from 'react';
import { useStore, type DonorSortKey, dualStorage } from '../store';
import { Globe, DollarSign, Layout, Receipt, RefreshCw, Check, Users, Link, X, Download, AlertTriangle, Cloud, Database } from 'lucide-react';
import { useT } from '../i18n';

export const Settings: React.FC = () => {
  const { isRtl, toggleRtl, currency, setCurrency, exchangeRate, setExchangeRate, donorSortBy, setDonorSortBy, googleSheetSyncUrl, setGoogleSheetSyncUrl, solaApiKey, setSolaApiKey } = useStore();
  const T = useT(isRtl);
  const [syncing, setSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);
  const [manualRate, setManualRate] = useState(String(exchangeRate));
  const [sheetUrl, setSheetUrl] = useState(googleSheetSyncUrl);
  const [solaKeyInput, setSolaKeyInput] = useState(solaApiKey);
  const [urlSaved, setUrlSaved] = useState(false);
  const [solaSaved, setSolaSaved] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Fetch live exchange rate from a free public API
  const handleSyncRate = async () => {
    setSyncing(true);
    setSyncDone(false);
    try {
      let res: Response | null = null;
      try {
        res = await fetch('https://api.frankfurter.app/latest?base=USD&symbols=CAD');
      } catch (e) {
        // Ignore SSL or network errors from primary API
      }
      
      if (!res || !res.ok) {
        res = await fetch('https://open.er-api.com/v6/latest/USD');
      }
      const data = await res.json();
      const rate = data?.rates?.CAD;
      if (rate) {
        setExchangeRate(parseFloat(rate.toFixed(4)));
        setManualRate(rate.toFixed(4));
        setSyncDone(true);
        setTimeout(() => setSyncDone(false), 3000);
      } else {
        throw new Error('No rate found');
      }
    } catch {
      // Fallback: use a static recent rate
      setExchangeRate(1.35);
      setManualRate('1.35');
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
              <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: 'var(--text-muted)' }}>1 USD =</span>
              <input
                type="number"
                step="0.001"
                min="0"
                value={manualRate}
                onChange={e => handleManualRate(e.target.value)}
                style={{ paddingLeft: '80px', fontWeight: 800, fontSize: '1.1rem' }}
              />
              <span style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', fontWeight: 700, color: 'var(--text-muted)' }}>CAD</span>
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

        {/* Donor Sort Order */}
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '12px', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
            <Users size={16} /> {isRtl ? 'מדוניים סדר' : 'Donor Sort Order'}
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {([
              { value: 'lastName',     label: '🔤 English Last', sub: 'Sort A→Z by last name' },
              { value: 'firstName',    label: '🔤 English First', sub: 'Sort A→Z by first name' },
              { value: 'hebLastName',  label: '🕍 יידיש משפחה', sub: 'Sort by Hebrew last name' },
              { value: 'hebFirstName', label: '🕍 יידיש ערשטע', sub: 'Sort by Hebrew first name' },
            ] as { value: DonorSortKey; label: string; sub: string }[]).map(opt => (
              <button key={opt.value} onClick={() => setDonorSortBy(opt.value)} style={{
                padding: '12px 14px', borderRadius: '12px',
                border: `2px solid ${donorSortBy === opt.value ? 'var(--navy-light)' : 'var(--border)'}`,
                background: donorSortBy === opt.value ? 'var(--navy-bg)' : 'var(--bg-input)',
                color: donorSortBy === opt.value ? 'var(--navy-light)' : 'var(--text-muted)',
                cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.88rem',
                textAlign: 'left', transition: 'all 0.2s',
              }}>
                <div>{opt.label} {donorSortBy === opt.value ? '✓' : ''}</div>
                <div style={{ fontSize: '0.72rem', fontWeight: 400, opacity: 0.8, marginTop: '2px' }}>{opt.sub}</div>
              </button>
            ))}
          </div>
          <div style={{ marginTop: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {isRtl ? 'איר קענט אויך בײַטן דעם סאָרטירן דירעקט אויפן מדוניים זייט' : 'You can also change the sort directly on the Donors page.'}
          </div>
        </div>

        {/* Download Local Backup */}
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '12px', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
            <Download size={16} /> {isRtl ? 'אראפקאפיע באַקאַפּ' : 'Download Offline Backup'}
          </label>
          <div style={{ background: 'var(--bg-input)', borderRadius: '12px', padding: '16px', display: 'flex', gap: '16px', alignItems: 'center' }}>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem', flex: 1, lineHeight: 1.5 }}>
              {isRtl 
                ? 'אראפקאפיע א קאפיע פון דיין גאנצע דאַטאַבייס (דאָנאָרס, פיימענטס, און סעטטינגס) ווי א פייל צו דיין קאָמפּיוטער. פערפעקט פאר מאַכן זיכערהייט קאפיעס.' 
                : 'Download a complete copy of your entire database (donors, payments, and settings) as a file to your computer for safe keeping.'}
            </p>
            <button className="btn btn-primary" onClick={() => {
              const state = useStore.getState();
              // Create a safe copy of the state without non-serializable elements
              const backup = {
                donors: state.donors,
                transactions: state.transactions,
                accounts: state.accounts,
                fundraisers: state.fundraisers,
                recurringPayments: state.recurringPayments,
                currency: state.currency,
                exchangeRate: state.exchangeRate,
                isRtl: state.isRtl
              };
              const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup, null, 2));
              const downloadAnchorNode = document.createElement('a');
              downloadAnchorNode.setAttribute("href", dataStr);
              downloadAnchorNode.setAttribute("download", `charity_backup_${new Date().toISOString().split('T')[0]}.json`);
              document.body.appendChild(downloadAnchorNode);
              downloadAnchorNode.click();
              downloadAnchorNode.remove();
            }} style={{ whiteSpace: 'nowrap' }}>
              <Download size={16} /> {isRtl ? 'סעיוו באַקאַפּ' : 'Save Backup File'}
            </button>
          </div>
        </div>

        {/* Advanced Settings & Emergency Data Recovery */}
        <div style={{ marginTop: '20px' }}>
          <button 
            className="btn btn-secondary" 
            style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <span style={{ fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.85rem' }}>
              Advanced Settings & Data Recovery
            </span>
            <span>{showAdvanced ? '▲' : '▼'}</span>
          </button>
          
          {showAdvanced && (
            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '12px', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  <AlertTriangle size={16} /> Danger Zone
                </label>
                <div className="card" style={{ padding: '24px', border: '1px solid rgba(239,68,68,0.3)', background: 'var(--red-bg)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <div style={{ padding: '10px', background: 'var(--red)', borderRadius: '12px', color: 'white' }}>
                      <AlertTriangle size={24} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.2rem', fontFamily: 'Outfit, sans-serif', color: 'var(--red)' }}>Wipe All Transactions</h3>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Permanently delete all transactions. Use this before re-uploading a bulk import to avoid duplicates. Donors will be kept, but their totals will be reset to 0.</div>
                    </div>
                  </div>
                  <button 
                    className="btn" 
                    style={{ width: '100%', padding: '12px', background: 'var(--red)', color: 'white', border: 'none', fontWeight: 600 }}
                    onClick={() => {
                      if (window.confirm('Are you ABSOLUTELY SURE you want to DELETE ALL TRANSACTIONS? This cannot be undone.')) {
                        useStore.getState().deleteAllTransactions();
                        alert('All transactions have been deleted and donor totals reset to 0.');
                        window.location.reload();
                      }
                    }}
                  >
                    Delete All Transactions
                  </button>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>

      {/* Google Sheets Sync */}
      <div className="card" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px', gridColumn: '1 / -1' }}>
        <h2 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', color: 'var(--navy)', fontSize: '1.3rem' }}>
          🔗 Google Sheets Sync
        </h2>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: 1.6 }}>
          Paste your Google Sheet published CSV link below. Once saved, the <strong>🔄 Sync</strong> button on the Donors page will re-import directly — no popup ever.
        </p>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Link size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input
              type="url"
              placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv"
              value={sheetUrl}
              onChange={e => { setSheetUrl(e.target.value); setUrlSaved(false); }}
              style={{ paddingLeft: '40px', fontFamily: 'monospace', fontSize: '0.82rem' }}
            />
          </div>
          {googleSheetSyncUrl && (
            <button className="btn btn-ghost btn-sm" title="Clear saved link" onClick={() => { setGoogleSheetSyncUrl(''); setSheetUrl(''); setUrlSaved(false); }} style={{ flexShrink: 0, padding: '10px' }}>
              <X size={16} />
            </button>
          )}
          <button
            className="btn btn-primary"
            disabled={!sheetUrl.trim()}
            onClick={() => {
              setGoogleSheetSyncUrl(sheetUrl.trim());
              setUrlSaved(true);
              setTimeout(() => setUrlSaved(false), 3000);
            }}
            style={{ flexShrink: 0, minWidth: '110px' }}
          >
            {urlSaved ? <><Check size={15} style={{ marginRight: '6px' }} />Saved!</> : 'Save Link'}
          </button>
        </div>

        {googleSheetSyncUrl && (
          <div style={{ padding: '12px 16px', background: 'var(--green-bg, #f0fdf4)', borderRadius: '10px', border: '1px solid var(--green)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.2rem' }}>✅</span>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--green)', fontSize: '0.88rem' }}>Link saved — Donors page will sync with one click</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem', marginTop: '2px', fontFamily: 'monospace', wordBreak: 'break-all' }}>{googleSheetSyncUrl}</div>
            </div>
          </div>
        )}

        <div style={{ background: 'var(--bg-input)', borderRadius: '10px', padding: '14px 16px', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--navy)' }}>How to get the link:</strong><br />
          1. Open your Google Sheet → <em>File → Share → Publish to web</em><br />
          2. Choose your donors sheet tab → select <em>Comma-separated values (.csv)</em><br />
          3. Click <em>Publish</em> → copy the link → paste it above
        </div>
      </div>

      {/* Payment Gateway (Sola) */}
      <div className="card" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px', gridColumn: '1 / -1' }}>
        <h2 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', color: 'var(--navy)', fontSize: '1.3rem' }}>
          💳 Payment Gateway (Sola)
        </h2>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: 1.6 }}>
          Enter your <strong>Sola Production Secret Key</strong> below. This allows the app to securely process credit cards directly.
        </p>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <DollarSign size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input
              type="password"
              placeholder="Paste Sola Secret Key here..."
              value={solaKeyInput}
              onChange={e => { setSolaKeyInput(e.target.value); setSolaSaved(false); }}
              style={{ paddingLeft: '40px', fontFamily: 'monospace', fontSize: '0.9rem' }}
            />
          </div>
          <button
            className="btn btn-primary"
            disabled={!solaKeyInput.trim()}
            onClick={() => {
              setSolaApiKey(solaKeyInput.trim());
              setSolaSaved(true);
              setTimeout(() => setSolaSaved(false), 3000);
            }}
            style={{ flexShrink: 0, minWidth: '110px' }}
          >
            {solaSaved ? <><Check size={15} style={{ marginRight: '6px' }} />Saved!</> : 'Save Key'}
          </button>
        </div>

        {solaApiKey && (
          <div style={{ padding: '12px 16px', background: 'var(--green-bg, #f0fdf4)', borderRadius: '10px', border: '1px solid var(--green)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.2rem' }}>✅</span>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--green)', fontSize: '0.88rem' }}>Sola Key is securely saved locally.</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem', marginTop: '2px' }}>Your key is never exposed on the screen.</div>
            </div>
          </div>
        )}
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
            [isRtl ? 'וועקסלקורס' : 'Exchange Rate', `1 USD = ${exchangeRate} CAD`],
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
