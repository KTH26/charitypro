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

// Above every pop-up of the site (they use layers up to 9999).
const LAYER = { form: 10000, floating: 10001, crop: 10002, notice: 10003 };
/** The pop-up open on the page now (not this one), and its title, if there is one. */
const openPopup = () => { const overlay = [...document.querySelectorAll<HTMLElement>('.modal-overlay, [role="dialog"]')].find(item => !item.closest('[data-change-request]')); if (!overlay) return null; const title = overlay.querySelector('h1, h2, h3, h4, strong')?.textContent?.trim() || ''; return { title: title.slice(0, 80) }; };

type Box = { x: number; y: number; w: number; h: number };
/** The frozen screenshot fills the screen; drag a box around the part to keep. */
const CropScreen: React.FC<{ image: string; onDone: (url: string) => void; onCancel: () => void }> = ({ image, onDone, onCancel }) => {
  const picture = useRef<HTMLImageElement>(null); const [start, setStart] = useState<{ x: number; y: number } | null>(null); const [box, setBox] = useState<Box | null>(null);
  useEffect(() => { const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel(); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [onCancel]);
  const cut = (area: Box | null) => {
    const element = picture.current; if (!element) return; const shown = element.getBoundingClientRect(); const scale = element.naturalWidth / shown.width;
    const region = area && area.w > 8 && area.h > 8 ? { x: (area.x - shown.left) * scale, y: (area.y - shown.top) * scale, w: area.w * scale, h: area.h * scale } : { x: 0, y: 0, w: element.naturalWidth, h: element.naturalHeight };
    const x = Math.max(0, region.x), y = Math.max(0, region.y); const w = Math.min(element.naturalWidth - x, region.w), h = Math.min(element.naturalHeight - y, region.h);
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(w)); canvas.height = Math.max(1, Math.round(h)); canvas.getContext('2d')?.drawImage(element, x, y, w, h, 0, 0, canvas.width, canvas.height);
    onDone(shrinkImage(canvas));
  };
  const point = (event: React.PointerEvent) => ({ x: event.clientX, y: event.clientY });
  return createPortal(<div data-change-request style={{ position: 'fixed', inset: 0, zIndex: LAYER.crop, background: '#111', cursor: 'crosshair', userSelect: 'none', touchAction: 'none' }}
    onPointerDown={event => { if ((event.target as HTMLElement).closest('button')) return; (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); const p = point(event); setStart(p); setBox({ x: p.x, y: p.y, w: 0, h: 0 }); }}
    onPointerMove={event => { if (!start) return; const p = point(event); setBox({ x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) }); }}
    onPointerUp={() => { if (!start) return; setStart(null); if (box && box.w > 8 && box.h > 8) cut(box); }}>
    <img ref={picture} src={image} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
    {box && box.w > 0 ? <div style={{ position: 'fixed', left: box.x, top: box.y, width: box.w, height: box.h, border: '2px solid #4da3ff', boxShadow: '0 0 0 9999px rgba(0,0,0,.45)', pointerEvents: 'none' }} /> : <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.25)', pointerEvents: 'none' }} />}
    <div style={{ position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 8, alignItems: 'center', background: 'rgba(17,24,39,.92)', color: '#fff', padding: '8px 12px', borderRadius: 10, fontSize: 14, boxShadow: '0 8px 24px rgba(0,0,0,.35)', cursor: 'default' }}>
      <span>Drag a box around the part you want</span>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => cut(null)}>Whole screen</button>
      <button type="button" className="btn btn-ghost btn-sm" style={{ color: '#fff' }} onClick={onCancel}>Cancel</button>
    </div>
  </div>, document.body);
};

/** "Request a change" in the top bar: write what should be changed in the program, with screenshots. It goes to the Change requests page. */
export const ChangeRequestButton: React.FC = () => {
  const location = useLocation();
  const [open, setOpen] = useState(false); const [hidden, setHidden] = useState(false); const [cropping, setCropping] = useState(''); const [popup, setPopup] = useState<{ title: string } | null>(null); const [popupOpen, setPopupOpen] = useState(false);
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
  // When a pop-up is open, its background covers the top bar: show a small button over it (bottom right).
  useEffect(() => { const check = () => setPopupOpen(!!openPopup()); check(); const watcher = new MutationObserver(check); watcher.observe(document.body, { childList: true, subtree: true }); return () => watcher.disconnect(); }, []);
  const start = () => { setError(''); setPopup(openPopup()); setOpen(true); };
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
      setHidden(true); await new Promise(resolve => setTimeout(resolve, 120));
      stream = await media.getDisplayMedia({ video: { displaySurface: 'browser' }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude' });
      await new Promise(resolve => setTimeout(resolve, 450));
      const video = document.createElement('video'); video.srcObject = stream; video.muted = true; await video.play();
      await new Promise(resolve => setTimeout(resolve, 150));
      const frame = document.createElement('canvas'); frame.width = video.videoWidth; frame.height = video.videoHeight; frame.getContext('2d')?.drawImage(video, 0, 0);
      stream?.getTracks().forEach(track => track.stop()); stream = null;
      setCropping(frame.toDataURL('image/png'));
    } catch (reason: any) { setHidden(false); if (reason?.name !== 'NotAllowedError') setError('Could not take the screenshot. Press the Print Screen key, then Ctrl+V here.'); }
    finally { stream?.getTracks().forEach(track => track.stop()); }
  };
  const send = async () => {
    setSending(true); setError('');
    try {
      const response = await fetch('/api/v3/change-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, images, page: `${location.pathname}${location.search}`, pageTitle: `${document.querySelector('.topbar h1, h1')?.textContent || document.title}${popup?.title ? ` — pop-up: ${popup.title}` : popup ? ' — in a pop-up' : ''}` }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not send.');
      setOpen(false); setText(''); setImages([]); pokeLiveUpdates(); setNotice('Sent. It is on the Change requests page.'); window.setTimeout(() => setNotice(''), 5000);
    } catch (reason: any) { setError(reason.message || 'Could not send.'); } finally { setSending(false); }
  };
  return <>
    <button type="button" className="btn btn-secondary" onClick={start} title="Request a change in the program (with screenshots)" style={{ height: 42, display: 'inline-flex', alignItems: 'center', gap: 6 }}><MessageSquarePlus size={16} /> Request a change</button>
    {popupOpen && !open && createPortal(<button type="button" data-change-request onClick={start} title="Request a change (this pop-up stays open)" aria-label="Request a change" style={{ position: 'fixed', right: 18, bottom: 18, zIndex: LAYER.floating, width: 48, height: 48, borderRadius: '50%', border: 0, background: 'var(--brand, #24372f)', color: '#fff', boxShadow: '0 8px 24px rgba(0,0,0,.3)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}><MessageSquarePlus size={22} /></button>, document.body)}
    {cropping && <CropScreen image={cropping} onCancel={() => { setCropping(''); setHidden(false); }} onDone={url => { setCropping(''); setHidden(false); if (url) setImages(current => current.length >= MAX_IMAGES ? current : [...current, url]); }} />}
    {notice && createPortal(<div role="status" onClick={() => setNotice('')} style={{ position: 'fixed', right: 16, top: 70, zIndex: LAYER.notice, background: 'var(--success-soft)', color: 'var(--success-ink)', border: '1px solid var(--success)', borderRadius: 8, padding: '10px 14px', fontWeight: 600, boxShadow: '0 10px 30px rgba(15,23,42,.18)', cursor: 'pointer' }}>{notice}</div>, document.body)}
    {open && createPortal(<div className="modal-overlay" data-change-request style={{ zIndex: LAYER.form, visibility: hidden ? 'hidden' : 'visible' }} onClick={() => !sending && setOpen(false)}>
      <section role="dialog" aria-label="Request a change" className="card" onClick={event => event.stopPropagation()} style={{ width: 'min(620px, calc(100vw - 32px))', maxHeight: '90vh', overflowY: 'auto', display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8 }}>
          <div><h3 style={{ margin: 0, color: 'var(--navy)' }}>Request a change</h3><small style={{ color: 'var(--text-muted)' }}>Write what should be changed in the program. It goes to the Change requests page. Page: {location.pathname}{popup ? ` (pop-up${popup.title ? `: ${popup.title}` : ''})` : ''}</small></div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Close"><X size={16} /></button>
        </div>
        <textarea autoFocus value={text} onChange={event => setText(event.target.value)} rows={6} dir="auto" placeholder="For example: on the Pledges page, add a column with the donor's phone number." style={{ width: '100%', resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void capture()} disabled={images.length >= MAX_IMAGES}><Camera size={15} /> Take a screenshot</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileInput.current?.click()} disabled={images.length >= MAX_IMAGES}><ImagePlus size={15} /> Add a picture</button>
          <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={event => { void addFiles([...(event.target.files || [])]); event.target.value = ''; }} />
          <small style={{ color: 'var(--text-muted)' }}>Take a screenshot: click Allow, then drag a box around the part you want. Or paste one with Ctrl+V. Up to {MAX_IMAGES}.</small>
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
