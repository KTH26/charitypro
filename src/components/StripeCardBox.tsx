import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

/** Load Stripe's script once (it must come from js.stripe.com so card numbers never touch this program). */
let stripeScript: Promise<any> | null = null;
const loadStripeScript = () => {
  if ((window as any).Stripe) return Promise.resolve((window as any).Stripe);
  if (!stripeScript) stripeScript = new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://js.stripe.com/v3/'; script.async = true;
    script.onload = () => resolve((window as any).Stripe); script.onerror = () => { stripeScript = null; reject(new Error('Could not load Stripe. Check the internet connection.')); };
    document.head.appendChild(script);
  });
  return stripeScript;
};
export type StripeHandle = { stripe: any; card: any };

/** The card box for US-dollar charges. Gives the parent what it needs to charge the card. */
export const StripeCardBox: React.FC<{ onReady: (handle: StripeHandle | null) => void }> = ({ onReady }) => {
  const mount = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'not-set-up' | 'error'>('loading');
  const [message, setMessage] = useState(''); const [testMode, setTestMode] = useState(false);
  useEffect(() => {
    let card: any = null; let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/v3/stripe/settings'); const data = await response.json();
        if (!data.success || !data.configured) { if (!cancelled) setState('not-set-up'); return; }
        setTestMode(Boolean(data.testMode));
        const Stripe = await loadStripeScript(); if (cancelled || !mount.current) return;
        const stripe = Stripe(data.publishableKey);
        card = stripe.elements().create('card', { hidePostalCode: false, style: { base: { fontSize: '16px' } } });
        card.mount(mount.current);
        card.on('change', (event: any) => setMessage(event.error?.message || ''));
        setState('ready'); onReady({ stripe, card });
      } catch (reason: any) { if (!cancelled) { setState('error'); setMessage(reason.message); } }
    })();
    return () => { cancelled = true; onReady(null); try { card?.destroy(); } catch { /* already gone */ } };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (state === 'not-set-up') return <div className="pay-note" style={{ color: 'var(--red)' }}>US-dollar cards need Stripe. Add your Stripe keys in <Link to="/settings">Settings → US dollar cards (Stripe)</Link>.</div>;
  return <div style={{ display: 'grid', gap: 6 }}>
    <div ref={mount} className="stripe-card-box" />
    {state === 'loading' && <small className="pay-note">Loading the secure Stripe card box…</small>}
    {testMode && <small className="pay-note" style={{ color: '#b45309' }}>Stripe test mode: no real money is charged.</small>}
    {message && <small style={{ color: 'var(--red)', fontWeight: 700 }}>{message}</small>}
    <small className="pay-note">Charged in US dollars through Stripe. The card number goes straight to Stripe and is not saved.</small>
  </div>;
};

/** Settings → US dollar cards (Stripe). */
export const StripeSettingsPanel: React.FC = () => {
  const [status, setStatus] = useState<any>(null); const [publishableKey, setPublishableKey] = useState(''); const [secretKey, setSecretKey] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const load = () => fetch('/api/v3/stripe/settings').then(response => response.json()).then(data => { if (data.success) { setStatus(data); setPublishableKey(data.publishableKey || ''); } }).catch(() => undefined);
  useEffect(() => { void load(); }, []);
  const save = async () => {
    const response = await fetch('/api/v3/stripe/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ publishableKey, secretKey }) });
    const data = await response.json(); setMessage(data.success ? { ok: true, text: 'Stripe saved.' } : { ok: false, text: data.error }); setSecretKey(''); void load();
  };
  return <section className="card msg-settings" style={{ gridColumn: '1 / -1' }}>
    <h2 style={{ margin: 0, color: 'var(--navy)' }}>US dollar cards (Stripe) <span className={`badge ${status?.configured ? 'badge-green' : 'badge-gray'}`}>{status?.configured ? (status.testMode ? 'Connected – test mode' : 'Connected') : 'Not connected'}</span></h2>
    <p style={{ margin: 0, color: 'var(--text-muted)' }}>When a payment is in USD and you choose "Charge a card", the card is charged in US dollars through your Stripe account. In Stripe: Developers → API keys.</p>
    <div className="pay-detail-grid">
      <label className="form-group"><span>Publishable key</span><input value={publishableKey} onChange={event => setPublishableKey(event.target.value)} placeholder="pk_live_…" /></label>
      <label className="form-group"><span>Secret key {status?.secretSaved && <small>(saved)</small>}</span><input type="password" autoComplete="off" value={secretKey} onChange={event => setSecretKey(event.target.value)} placeholder="sk_live_…" /></label>
    </div>
    {message && <div style={{ fontWeight: 700, color: message.ok ? 'var(--green)' : 'var(--red)' }}>{message.text}</div>}
    <div><button className="btn btn-primary" onClick={() => void save()}>Save Stripe</button></div>
  </section>;
};
