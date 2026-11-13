import React, { useEffect, useState } from 'react';
import { Mail, MessageSquare, Send } from 'lucide-react';

type MessagingSettings = { orgName: string; emailFromName: string; replyTo: string; reminderByEmail: boolean; reminderBySms: boolean; reminderEmails: string; reminderPhones: string; smsSenders: string; smsSenderNames: string; receiptAuto: boolean; receiptCc: string };
type Status = { settings: MessagingSettings; email: { configured: boolean; scriptUrl: string; scriptCode: string }; sms: { configured: boolean; accountSid: string; fromNumber: string; tokenSaved: boolean; inboundUrl: string } };

const send = async (url: string, method: string, body: any) => { const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || 'Unable to save.'); return data; };

/**
 * Settings → Email & text messages: connect Gmail (Google Apps Script) and Twilio,
 * and choose who gets the daily reminders and who may text the balance number.
 */
export const MessagingSettingsPanel: React.FC = () => {
  const [status, setStatus] = useState<Status | null>(null);
  const [form, setForm] = useState<MessagingSettings | null>(null);
  const [scriptUrl, setScriptUrl] = useState('');
  const [twilio, setTwilio] = useState({ sid: '', token: '', from: '' });
  const [test, setTest] = useState({ email: '', phone: '' });
  const [showCode, setShowCode] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState('');

  const load = async () => {
    const response = await fetch('/api/v3/messaging/settings'); const data = await response.json();
    if (!response.ok || !data.success) { setMessage({ ok: false, text: data.error || 'Unable to load.' }); return; }
    setStatus(data); setForm(data.settings); setScriptUrl(data.email.scriptUrl || ''); setTwilio({ sid: '', token: '', from: data.sms.fromNumber || '' });
  };
  useEffect(() => { void load(); }, []);
  const run = async (key: string, action: () => Promise<any>, done: string) => {
    setBusy(key); setMessage(null);
    try { await action(); setMessage({ ok: true, text: done }); await load(); } catch (reason: any) { setMessage({ ok: false, text: reason.message }); } finally { setBusy(''); }
  };
  if (!status || !form) return <section className="card" style={{ gridColumn: '1 / -1' }}>Loading email & text settings…{message && <div className="pay-error">{message.text}</div>}</section>;
  const set = (key: keyof MessagingSettings, value: any) => setForm(current => current ? { ...current, [key]: value } : current);

  return <section className="card msg-settings" style={{ gridColumn: '1 / -1' }}>
    <h2 style={{ margin: 0, color: 'var(--navy)' }}><Send size={20} /> Email & text messages</h2>
    <p style={{ margin: 0, color: 'var(--text-muted)' }}>Used for reminders, statements, official receipts and the balance text number.</p>
    {message && <div style={{ fontWeight: 700, color: message.ok ? 'var(--green)' : 'var(--red)' }}>{message.text}</div>}

    <div className="msg-grid">
      <div className="msg-box">
        <h3><Mail size={16} /> Email (from your Gmail) <span className={`badge ${status.email.configured ? 'badge-green' : 'badge-gray'}`}>{status.email.configured ? 'Connected' : 'Not connected'}</span></h3>
        <ol className="msg-steps">
          <li>Open <a href="https://script.google.com/home/projects/create" target="_blank" rel="noreferrer">script.google.com</a> while signed in to the Gmail that should send the emails.</li>
          <li>Delete what is there and paste this code: <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowCode(value => !value)}>{showCode ? 'Hide code' : 'Show code'}</button> <button type="button" className="btn btn-secondary btn-sm" onClick={() => void navigator.clipboard.writeText(status.email.scriptCode).then(() => setMessage({ ok: true, text: 'Code copied.' }))}>Copy code</button></li>
          <li>Click <b>Deploy → New deployment → Web app</b>. "Execute as": <b>Me</b>. "Who has access": <b>Anyone</b>. Allow access when Google asks.</li>
          <li>Copy the <b>Web app URL</b> (ends with /exec) and paste it here:</li>
        </ol>
        {showCode && <textarea readOnly value={status.email.scriptCode} rows={10} style={{ fontFamily: 'monospace', fontSize: 12 }} />}
        <div className="msg-row"><input value={scriptUrl} onChange={event => setScriptUrl(event.target.value)} placeholder="https://script.google.com/macros/s/…/exec" /><button type="button" className="btn btn-primary btn-sm" disabled={busy === 'script'} onClick={() => void run('script', () => send('/api/v3/messaging/settings', 'PUT', { scriptUrl }), 'Email link saved.')}>Save</button></div>
        <div className="msg-row"><input value={test.email} onChange={event => setTest(current => ({ ...current, email: event.target.value }))} placeholder="Send a test email to…" /><button type="button" className="btn btn-secondary btn-sm" disabled={!status.email.configured || busy === 'test-email'} onClick={() => void run('test-email', () => send('/api/v3/messaging/test', 'POST', { channel: 'email', to: test.email }), 'Test email sent. Check the inbox.')}>Send test</button></div>
      </div>

      <div className="msg-box">
        <h3><MessageSquare size={16} /> Text messages (Twilio) <span className={`badge ${status.sms.configured ? 'badge-green' : 'badge-gray'}`}>{status.sms.configured ? 'Connected' : 'Not connected'}</span></h3>
        <ol className="msg-steps">
          <li>Open an account at <a href="https://www.twilio.com/try-twilio" target="_blank" rel="noreferrer">twilio.com</a> and buy a Canadian phone number that can send and receive texts.</li>
          <li>On the Twilio Console home page, copy the <b>Account SID</b> and <b>Auth Token</b> into the boxes here.</li>
          <li>For the balance number: in Twilio, open the phone number → <b>Messaging</b> → "A message comes in" → Webhook, and paste: <code style={{ userSelect: 'all' }}>{status.sms.inboundUrl}</code></li>
        </ol>
        <div className="pay-detail-grid">
          <label className="form-group"><span>Account SID {status.sms.accountSid && <small>(saved: {status.sms.accountSid})</small>}</span><input value={twilio.sid} onChange={event => setTwilio(current => ({ ...current, sid: event.target.value }))} placeholder="AC…" /></label>
          <label className="form-group"><span>Auth Token {status.sms.tokenSaved && <small>(saved)</small>}</span><input type="password" value={twilio.token} onChange={event => setTwilio(current => ({ ...current, token: event.target.value }))} autoComplete="off" /></label>
          <label className="form-group"><span>Twilio phone number</span><input value={twilio.from} onChange={event => setTwilio(current => ({ ...current, from: event.target.value }))} placeholder="+15145551234" /></label>
        </div>
        <div className="msg-row"><button type="button" className="btn btn-primary btn-sm" disabled={busy === 'twilio'} onClick={() => void run('twilio', () => send('/api/v3/messaging/settings', 'PUT', { twilioSid: twilio.sid, twilioToken: twilio.token, twilioFrom: twilio.from }), 'Twilio saved.')}>Save Twilio</button></div>
        <div className="msg-row"><input value={test.phone} onChange={event => setTest(current => ({ ...current, phone: event.target.value }))} placeholder="Send a test text to…" /><button type="button" className="btn btn-secondary btn-sm" disabled={!status.sms.configured || busy === 'test-sms'} onClick={() => void run('test-sms', () => send('/api/v3/messaging/test', 'POST', { channel: 'sms', to: test.phone }), 'Test text sent.')}>Send test</button></div>
      </div>
    </div>

    <div className="msg-grid">
      <div className="msg-box">
        <h3>Daily reminders</h3>
        <small style={{ color: 'var(--text-muted)' }}>Every morning, the reminders for that day (who to call, his phone and balance) are sent here.</small>
        <label className="msg-check"><input type="checkbox" checked={form.reminderByEmail} onChange={event => set('reminderByEmail', event.target.checked)} /> Send by email to:</label>
        <input value={form.reminderEmails} onChange={event => set('reminderEmails', event.target.value)} placeholder="me@example.com, partner@example.com" />
        <label className="msg-check"><input type="checkbox" checked={form.reminderBySms} onChange={event => set('reminderBySms', event.target.checked)} /> Send by text to:</label>
        <input value={form.reminderPhones} onChange={event => set('reminderPhones', event.target.value)} placeholder="514-555-1234, 450-555-9876" />
      </div>
      <div className="msg-box">
        <h3>Balance text number</h3>
        <small style={{ color: 'var(--text-muted)' }}>Only these phones may text the last 4 digits of a donor's phone and get his balance back.</small>
        <input value={form.smsSenders} onChange={event => set('smsSenders', event.target.value)} placeholder="514-555-1234, 450-555-9876" />
        <h3 style={{ marginTop: 10 }}>Sender name & receipts</h3>
        <label className="form-group" style={{ margin: 0 }}><span>Organization name</span><input value={form.orgName} onChange={event => set('orgName', event.target.value)} /></label>
        <label className="form-group" style={{ margin: 0 }}><span>Emails come from (name)</span><input value={form.emailFromName} onChange={event => set('emailFromName', event.target.value)} /></label>
        <label className="form-group" style={{ margin: 0 }}><span>Replies go to (email, optional)</span><input value={form.replyTo} onChange={event => set('replyTo', event.target.value)} /></label>
      </div>
    </div>
    <div><button type="button" className="btn btn-primary" disabled={busy === 'settings'} onClick={() => void run('settings', () => send('/api/v3/messaging/settings', 'PUT', { settings: form }), 'Saved.')}>Save these settings</button></div>
  </section>;
};
