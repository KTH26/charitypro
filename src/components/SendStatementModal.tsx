import React, { useEffect, useState } from 'react';
import { Mail, MessageSquare, X } from 'lucide-react';

type Statement = { name: string; html: string; text: string; email: string; phone: string; summary: { pledged: number; paid: number; balanceThisYear: number; balanceTotal: number; year: number } };
const localToday = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };

/** Send a donor his statement: this year or from a date, by email (with a PDF copy) or a short text. */
export const SendStatementModal: React.FC<{ donorId: string; onClose: () => void }> = ({ donorId, onClose }) => {
  const year = new Date().getFullYear();
  const [period, setPeriod] = useState<'year' | 'dates' | 'all'>('year');
  const [from, setFrom] = useState(`${year}-01-01`); const [to, setTo] = useState(localToday());
  const [channel, setChannel] = useState<'email' | 'sms'>('email');
  const [statement, setStatement] = useState<Statement | null>(null);
  const [recipient, setRecipient] = useState(''); const [text, setText] = useState(''); const [attachPdf, setAttachPdf] = useState(true);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null); const [sending, setSending] = useState(false);
  const range = period === 'year' ? { from: `${year}-01-01`, to: `${year}-12-31` } : period === 'dates' ? { from, to } : { from: '', to: '' };

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/v3/donors/${encodeURIComponent(donorId)}/statement?from=${range.from}&to=${range.to}`, { signal: controller.signal }).then(response => response.json()).then(data => {
      if (!data.success) { setMessage({ ok: false, text: data.error || 'Unable to prepare the statement.' }); return; }
      setStatement(data); setText(data.text);
    }).catch(() => undefined);
    return () => controller.abort();
  }, [donorId, range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (statement) setRecipient(channel === 'email' ? statement.email : statement.phone); }, [channel, statement?.email, statement?.phone]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    setSending(true); setMessage(null);
    try {
      const response = await fetch(`/api/v3/donors/${encodeURIComponent(donorId)}/statement/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...range, channel, to: recipient, text, attachPdf }) });
      const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || 'Not sent.');
      setMessage({ ok: true, text: channel === 'email' ? `Statement emailed to ${recipient}.` : `Text sent to ${recipient}.` });
    } catch (reason: any) { setMessage({ ok: false, text: reason.message }); } finally { setSending(false); }
  };

  return <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1200 }}><div className="modal" onClick={event => event.stopPropagation()} style={{ maxWidth: 820, width: '96%', maxHeight: '96vh', overflowY: 'auto' }}>
    <div className="modal-header"><h2 style={{ margin: 0 }}>Send statement{statement ? ` – ${statement.name}` : ''}</h2><button className="modal-close" onClick={onClose}><X size={20} /></button></div>
    <div className="modal-body" style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="pay-toggle">{([['year', `This year (${year})`], ['dates', 'From a date'], ['all', 'All years']] as const).map(([value, label]) => <button type="button" key={value} className={period === value ? 'active' : ''} onClick={() => setPeriod(value)}>{label}</button>)}</div>
        {period === 'dates' && <><label className="form-group" style={{ margin: 0 }}><span>From</span><input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label><label className="form-group" style={{ margin: 0 }}><span>To</span><input type="date" value={to} onChange={event => setTo(event.target.value)} /></label></>}
      </div>
      {statement && <div className="stmt-summary">
        <div><small>Pledged in period</small><strong>${statement.summary.pledged.toFixed(2)}</strong></div>
        <div><small>Paid in period</small><strong style={{ color: 'var(--green)' }}>${statement.summary.paid.toFixed(2)}</strong></div>
        <div><small>Balance {statement.summary.year}</small><strong style={{ color: 'var(--red)' }}>${statement.summary.balanceThisYear.toFixed(2)}</strong></div>
        <div><small>All years</small><strong style={{ color: 'var(--red)' }}>${statement.summary.balanceTotal.toFixed(2)}</strong></div>
      </div>}
      <div className="pay-toggle" style={{ justifySelf: 'start' }}><button type="button" className={channel === 'email' ? 'active' : ''} onClick={() => setChannel('email')}><Mail size={14} /> Email</button><button type="button" className={channel === 'sms' ? 'active' : ''} onClick={() => setChannel('sms')}><MessageSquare size={14} /> Text message</button></div>
      <label className="form-group" style={{ margin: 0 }}><span>{channel === 'email' ? 'Email address' : 'Phone number'}</span><input value={recipient} onChange={event => setRecipient(event.target.value)} placeholder={channel === 'email' ? 'No email on file – type one' : 'No phone on file – type one'} /></label>
      {channel === 'email' ? <>
        <label className="msg-check"><input type="checkbox" checked={attachPdf} onChange={event => setAttachPdf(event.target.checked)} /> Also attach it as a PDF</label>
        {statement && <iframe title="Statement preview" className="stmt-preview" srcDoc={statement.html} />}
      </> : <label className="form-group" style={{ margin: 0 }}><span>Text (you can change it)</span><textarea rows={4} value={text} onChange={event => setText(event.target.value)} maxLength={1500} /></label>}
      {message && <div style={{ fontWeight: 700, color: message.ok ? 'var(--green)' : 'var(--red)' }}>{message.text}</div>}
    </div>
    <div className="modal-footer"><button className="btn btn-secondary" onClick={onClose}>Close</button><button className="btn btn-primary" disabled={sending || !statement || !recipient.trim()} onClick={() => void send()}>{sending ? 'Sending…' : channel === 'email' ? 'Send email' : 'Send text'}</button></div>
  </div></div>;
};
