import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, ImagePlus, MessageSquarePlus, Send, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { pokeLiveUpdates } from '../utils/liveUpdates';

const MAX_IMAGES = 4;

/** Makes a picture smaller (at most 1600 wide, JPEG) so it can be saved: a screenshot is often several MB. */
export const shrinkImage = (source: CanvasImageSource & { width: number; height: number }, maxWidth = 1600): string => {
  const scale = Math.min(1, maxWidth / Math.max(1, source.width));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(source.width * scale); canvas.height = Math.round(source.height * scale);
  const context = canvas.getContext('2d'); if (!context) return '';
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(source, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.8, 0.65, 0.5]) { const url = canvas.toDataURL('image/jpeg', quality); if (url.length < 1_300_000) return url; }
  return canvas.toDataURL('image/jpeg', 0.4);
};
const fileToImage = (file: Blob) => new Promise<string>((resolve, reject) => {
  const url = URL.createObjectURL(file); const image = new Image();
  image.onload = () => { const result = shrinkImage(image); URL.revokeObjectURL(url); resolve(result); };
  image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This file is not a picture.')); };
  image.src = url;
});

/** "Request a change" in the top bar: write what should be changed in the program, with screenshots. It goes to the Change requests page. */
export const ChangeRequestButton: React.FC = () => {
  const location = useLocation();
  const [open, setOpen] = useState(false); const [hidden, setHidden] = useState(false);
  const [text, setText] = useState(''); const [images, setImages] = useState<string[]>([]);
  const [sending, setSending] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const addFiles = async (files: Blob[]) => {
    setError('');
    for (const file of files.filter(item => item.type.startsWith('image/'))) {
      try { const url = await fileToImage(file); setImages(current => current.length >= MAX_IMAGES ? current : [...current, url]); }
      catch (reason: any) { setError(reason.message || 'Could not add the picture.'); }
    }
  };
  // Ctrl+V of a screenshot while the window is open.
  useEffect(() => {
    if (!open) return;
    const paste = (event: ClipboardEvent) => { const files = [...(event.clipboardData?.items || [])].filter(item => item.type.startsWith('image/')).map(item => item.getAsFile()).filter(Boolean) as Blob[]; if (files.length) { event.preventDefault(); void addFiles(files); } };
    window.addEventListener('paste', paste); return () => window.removeEventListener('paste', paste);
  }, [open]);
  // Takes a picture of the screen (the browser asks which tab or window). This window hides for a moment so it is not in the picture.
  const capture = async () => {
    setError('');
    const media: any = navigator.mediaDevices;
    if (!media?.getDisplayMedia) { setError('This browser cannot take screenshots. Press the Print Screen key, then Ctrl+V here.'); return; }
    let stream: MediaStream | null = null;
    try {
      stream = await media.getDisplayMedia({ video: true, audio: false, preferCurrentTab: true });
      setHidden(true); await new Promise(resolve => setTimeout(resolve, 450));
      const video = document.createElement('video'); video.srcObject = stream; video.muted = true; await video.play();
      await new Promise(resolve => setTimeout(resolve, 150));
      const frame = document.createElement('canvas'); frame.width = video.videoWidth; frame.height = video.videoHeight; frame.getContext('2d')?.drawImage(video, 0, 0);
      const url = shrinkImage(frame); if (url) setImages(current => current.length >= MAX_IMAGES ? current : [...current, url]);
    } catch (reason: any) { if (reason?.name !== 'NotAllowedError') setError('Could not take the screenshot. Press the Print Screen key, then Ctrl+V here.'); }
    finally { stream?.getTracks().forEach(track => track.stop()); setHidden(false); }
  };
  const send = async () => {
    setSending(true); setError('');
    try {
      const response = await fetch('/api/v3/change-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, images, page: `${location.pathname}${location.search}`, pageTitle: document.querySelector('.topbar h1, h1')?.textContent || document.title }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not send.');
      setOpen(false); setText(''); setImages([]); pokeLiveUpdates(); setNotice('Sent. It is on the Change requests page.'); window.setTimeout(() => setNotice(''), 5000);
    } catch (reason: any) { setError(reason.message || 'Could not send.'); } finally { setSending(false); }
  };
  return <>
    <button type="button" className="btn btn-secondary" onClick={() => { setError(''); setOpen(true); }} title="Request a change in the program (with screenshots)" style={{ height: 42, display: 'inline-flex', alignItems: 'center', gap: 6 }}><MessageSquarePlus size={16} /> Request a change</button>
    {notice && createPortal(<div role="status" onClick={() => setNotice('')} style={{ position: 'fixed', right: 16, top: 70, zIndex: 5000, background: 'var(--success-soft)', color: 'var(--success-ink)', border: '1px solid var(--success)', borderRadius: 8, padding: '10px 14px', fontWeight: 600, boxShadow: '0 10px 30px rgba(15,23,42,.18)', cursor: 'pointer' }}>{notice}</div>, document.body)}
    {open && createPortal(<div className="modal-overlay" style={{ zIndex: 4000, visibility: hidden ? 'hidden' : 'visible' }} onClick={() => !sending && setOpen(false)}>
      <section role="dialog" aria-label="Request a change" className="card" onClick={event => event.stopPropagation()} style={{ width: 'min(620px, calc(100vw - 32px))', maxHeight: '90vh', overflowY: 'auto', display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8 }}>
          <div><h3 style={{ margin: 0, color: 'var(--navy)' }}>Request a change</h3><small style={{ color: 'var(--text-muted)' }}>Write what should be changed in the program. It goes to the Change requests page. Page: {location.pathname}</small></div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Close"><X size={16} /></button>
        </div>
        <textarea autoFocus value={text} onChange={event => setText(event.target.value)} rows={6} dir="auto" placeholder="For example: on the Pledges page, add a column with the donor's phone number." style={{ width: '100%', resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void capture()} disabled={images.length >= MAX_IMAGES}><Camera size={15} /> Take a screenshot</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileInput.current?.click()} disabled={images.length >= MAX_IMAGES}><ImagePlus size={15} /> Add a picture</button>
          <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={event => { void addFiles([...(event.target.files || [])]); event.target.value = ''; }} />
          <small style={{ color: 'var(--text-muted)' }}>Or paste a screenshot here with Ctrl+V. Up to {MAX_IMAGES}.</small>
        </div>
        {images.length > 0 && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{images.map((url, index) => <div key={index} style={{ position: 'relative' }}><img src={url} alt={`Screenshot ${index + 1}`} style={{ width: 130, height: 90, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--line)' }} /><button type="button" onClick={() => setImages(current => current.filter((_, k) => k !== index))} aria-label="Remove this picture" style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%', border: 0, background: 'rgba(0,0,0,.6)', color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center' }}><X size={13} /></button></div>)}</div>}
        {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)} disabled={sending}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={() => void send()} disabled={sending || (!text.trim() && !images.length)}><Send size={15} /> {sending ? 'Sending…' : 'Send'}</button>
        </div>
      </section>
    </div>, document.body)}
  </>;
};
