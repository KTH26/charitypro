import React, { useEffect, useRef, useState } from 'react';
import { CreditCard, LockKeyhole, ShieldCheck } from 'lucide-react';

type GatewayConfig = { configured: boolean; ifieldsKey: string; ifieldsVersion: string; softwareName: string; softwareVersion: string };

const loadScript = (src: string) => new Promise<void>((resolve, reject) => {
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  if (existing?.dataset.loaded === 'true') return resolve();
  const script = existing || document.createElement('script');
  script.src = src; script.async = true;
  script.addEventListener('load', () => { script.dataset.loaded = 'true'; resolve(); }, { once: true });
  script.addEventListener('error', () => reject(new Error('The secure Sola card fields could not be loaded.')), { once: true });
  if (!existing) document.head.appendChild(script);
});

export const SolaCardCapture: React.FC<{ donorId: string; onSaved: () => void; onCancel: () => void }> = ({ donorId, onSaved, onCancel }) => {
  const [config, setConfig] = useState<GatewayConfig | null>(null);
  const [ready, setReady] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const [cardholderName, setCardholderName] = useState(''); const [expiryMonth, setExpiryMonth] = useState(''); const [expiryYear, setExpiryYear] = useState(''); const [isDefault, setIsDefault] = useState(false);
  const requestId = useRef('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v3/payment-gateway/client-config', { signal: controller.signal }).then(async response => {
      const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load secure card entry.');
      setConfig(data); if (!data.configured) return;
      const src = `https://cdn.cardknox.com/ifields/${data.ifieldsVersion}/ifields.min.js`;
      await loadScript(src); if (controller.signal.aborted) return;
      const gateway = window as any; gateway.setAccount(data.ifieldsKey, data.softwareName, data.softwareVersion);
      gateway.enableAutoFormatting?.(' ');
      const fieldStyle = { border: '0', width: '100%', height: '42px', padding: '10px 12px', 'font-size': '15px', 'font-family': 'Inter, sans-serif', color: '#19282f', background: '#fff' };
      gateway.setIfieldStyle?.('card-number', fieldStyle); gateway.setIfieldStyle?.('cvv', fieldStyle); setReady(true);
    }).catch(reason => { if (reason.name !== 'AbortError') setError(reason.message || 'Unable to load secure card entry.'); });
    return () => controller.abort();
  }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    const month = Number(expiryMonth); const year = Number(expiryYear);
    if (!ready || !month || !year || !cardholderName.trim()) { setError('Enter the cardholder name, expiration date, card number, and security code.'); return; }
    setSaving(true);
    try {
      await new Promise<void>((resolve, reject) => (window as any).getTokens(resolve, () => reject(new Error('Sola could not verify the secure card fields. Check the number and security code.')), 30000));
      const cardNumberToken = document.querySelector<HTMLInputElement>('[data-ifields-id="card-number-token"]')?.value || '';
      const cvvToken = document.querySelector<HTMLInputElement>('[data-ifields-id="cvv-token"]')?.value || '';
      if (!cardNumberToken || !cvvToken) throw new Error('Sola did not return secure card tokens. Please try again.');
      const key = requestId.current || crypto.randomUUID(); requestId.current = key;
      const response = await fetch(`/api/v3/donors/${encodeURIComponent(donorId)}/payment-methods/tokenize`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify({ cardNumberToken, cvvToken, expiryMonth: month, expiryYear: year, cardholderName: cardholderName.trim(), isDefault }) });
      const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.error || 'Unable to save this card.');
      requestId.current = ''; (window as any).clearIfield?.('card-number'); (window as any).clearIfield?.('cvv'); onSaved();
    } catch (reason: any) { requestId.current = ''; setError(reason.message || 'Unable to save this card.'); }
    finally { setSaving(false); }
  };

  if (config && !config.configured) return <div className="secure-card-setup"><ShieldCheck size={28}/><div><strong>Secure card entry needs one final setting.</strong><p>Add the public Sola iFields key under Settings → Payment Gateway. The private API key alone cannot safely collect a new card.</p></div><button type="button" className="btn btn-secondary" onClick={onCancel}>Close</button></div>;
  return <form className="secure-card-form" onSubmit={save}>
    <div className="secure-card-heading"><div><span className="page-kicker">SOLA SECURE FIELDS</span><h3><CreditCard size={20}/> Add a card on file</h3><p>The card number and security code go directly to Sola. CharityPro receives only temporary tokens and stores only a reusable gateway token plus masked details.</p></div><LockKeyhole size={30}/></div>
    {error && <div role="alert" className="secure-card-error">{error}</div>}
    <div className="secure-card-grid">
      <label><span>Cardholder name</span><input autoComplete="cc-name" value={cardholderName} onChange={event => setCardholderName(event.target.value)} /></label>
      <label className="secure-card-number"><span>Card number</span><iframe title="Secure card number" data-ifields-id="card-number" data-ifields-placeholder="Card number" src={`https://cdn.cardknox.com/ifields/${config?.ifieldsVersion || '3.5.2607.1401'}/ifield.htm`} /><input data-ifields-id="card-number-token" name="xCardNum" type="hidden" /></label>
      <label><span>Security code</span><iframe title="Secure card security code" data-ifields-id="cvv" data-ifields-placeholder="CVV" src={`https://cdn.cardknox.com/ifields/${config?.ifieldsVersion || '3.5.2607.1401'}/ifield.htm`} /><input data-ifields-id="cvv-token" name="xCVV" type="hidden" /></label>
      <label><span>Expiry month</span><select autoComplete="cc-exp-month" value={expiryMonth} onChange={event => setExpiryMonth(event.target.value)}><option value="">Month</option>{Array.from({length:12},(_,index)=>index+1).map(month=><option key={month} value={month}>{String(month).padStart(2,'0')}</option>)}</select></label>
      <label><span>Expiry year</span><select autoComplete="cc-exp-year" value={expiryYear} onChange={event => setExpiryYear(event.target.value)}><option value="">Year</option>{Array.from({length:20},(_,index)=>new Date().getFullYear()+index).map(year=><option key={year} value={year}>{year}</option>)}</select></label>
    </div>
    <label className="secure-card-default"><input type="checkbox" checked={isDefault} onChange={event => setIsDefault(event.target.checked)} /> Make this the donor’s default card</label>
    <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button><button className="btn btn-primary" disabled={!ready || saving}>{saving ? 'Tokenizing securely…' : 'Save Card Securely'}</button></div>
  </form>;
};
