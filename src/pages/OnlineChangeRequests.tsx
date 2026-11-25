import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, Download, RotateCcw } from 'lucide-react';
import { startLiveRefresh } from '../utils/liveUpdates';

type ChangeRequest = { id: string; revision: number; text: string; page?: string; pageTitle?: string; createdAt: string; createdBy?: string; status: 'open' | 'done'; doneAt?: string; doneBy?: string; imageCount?: number };
const TABS = [{ key: 'open', label: 'To do' }, { key: 'done', label: 'Done' }, { key: 'all', label: 'All' }] as const;
const when = (iso?: string) => { if (!iso) return ''; const date = new Date(iso); return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
/** The text to paste to the programmer. */
const copyText = (item: ChangeRequest) => `Change request from ${item.createdBy || 'someone'} on ${when(item.createdAt)}\nPage: ${item.page || '(not given)'}${item.pageTitle ? ` (${item.pageTitle})` : ''}\n\n${item.text || '(no text)'}${item.imageCount ? `\n\nScreenshots: ${item.imageCount} (change-request-${item.id.slice(-8)}-1.jpg …)` : ''}`;

/** The screenshots of one request; loaded only when shown. Click one to open it big. */
const Screenshots: React.FC<{ item: ChangeRequest; onLoaded: (images: string[]) => void }> = ({ item, onLoaded }) => {
  const [images, setImages] = useState<string[] | null>(null); const [big, setBig] = useState('');
  useEffect(() => { if (!item.imageCount) return; let alive = true; void (async () => { try { const response = await fetch(`/api/v3/change-requests/${encodeURIComponent(item.id)}/images`); const data = await response.json(); if (alive && data.success) { setImages(data.images || []); onLoaded(data.images || []); } } catch { if (alive) setImages([]); } })(); return () => { alive = false; }; }, [item.id, item.imageCount]);
  if (!item.imageCount) return null;
  if (!images) return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading {item.imageCount} screenshot{item.imageCount > 1 ? 's' : ''}…</div>;
  return <>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{images.map((url, index) => <img key={index} src={url} alt={`Screenshot ${index + 1}`} onClick={() => setBig(url)} style={{ width: 180, height: 120, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--line)', cursor: 'zoom-in' }} />)}</div>
    {big && <div className="modal-overlay" style={{ zIndex: 4000 }} onClick={() => setBig('')}><img src={big} alt="Screenshot" style={{ maxWidth: '94vw', maxHeight: '90vh', borderRadius: 8, boxShadow: '0 20px 60px rgba(0,0,0,.4)' }} /></div>}
  </>;
};

/** Every change request someone sent with "Request a change": copy one and give it to the programmer, then mark it done. */
export const OnlineChangeRequests: React.FC = () => {
  const [tab, setTab] = useState<'open' | 'done' | 'all'>('open');
  const [items, setItems] = useState<ChangeRequest[]>([]); const [open, setOpen] = useState(0);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [pictures, setPictures] = useState<Record<string, string[]>>({});
  const load = useCallback(async () => {
    try { const response = await fetch(`/api/v3/change-requests?status=${tab}`); const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || 'Could not load.'); setItems(data.items || []); setOpen(Number(data.open || 0)); setError(''); }
    catch (reason: any) { setError(reason.message || 'Could not load.'); } finally { setLoading(false); }
  }, [tab]);
  useEffect(() => { setLoading(true); void load(); }, [load]);
  useEffect(() => startLiveRefresh(() => void load()), [load]);
  const copy = async (item: ChangeRequest) => { try { await navigator.clipboard.writeText(copyText(item)); setNotice('Copied. Paste it to Claude, and give the screenshots too.'); } catch { setNotice('Could not copy. Select the text and copy it yourself.'); } window.setTimeout(() => setNotice(''), 4000); };
  const download = (item: ChangeRequest) => { (pictures[item.id] || []).forEach((url, index) => { const link = document.createElement('a'); link.href = url; link.download = `change-request-${item.id.slice(-8)}-${index + 1}.jpg`; document.body.appendChild(link); link.click(); link.remove(); }); };
  const setStatus = async (item: ChangeRequest, status: 'open' | 'done') => {
    try { const response = await fetch(`/api/v3/change-requests/${encodeURIComponent(item.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, revision: item.revision }) }); const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || 'Could not save.'); await load(); }
    catch (reason: any) { setError(reason.message || 'Could not save.'); }
  };
  return <section style={{ display: 'grid', gap: 12 }}>
    <div className="card" style={{ display: 'grid', gap: 8 }}>
      <h2 style={{ margin: 0, color: 'var(--navy)' }}>Change requests</h2>
      <p style={{ margin: 0, color: 'var(--text-muted)' }}>What should be changed in the program, sent with the "Request a change" button at the top. Click <b>Copy</b> and paste it to Claude (and give the screenshots), then mark it <b>Done</b>.</p>
      <div className="list-views" role="tablist">{TABS.map(item => <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className={`list-view${tab === item.key ? ' active' : ''}`} onClick={() => setTab(item.key)}>{item.key === 'open' && <span className="list-view-count">{open}</span>}<span>{item.label}</span></button>)}</div>
    </div>
    {notice && <div className="list-notice ok">{notice}</div>}
    {error && <div className="card" style={{ color: 'var(--danger)' }}>{error}</div>}
    {loading ? <div className="card" style={{ textAlign: 'center', padding: 24 }}>Loading…</div> : items.length === 0 ? <div className="card" style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>{tab === 'open' ? 'Nothing to do. New requests show here.' : 'No requests here.'}</div> :
      items.map(item => <article key={item.id} className="card" style={{ display: 'grid', gap: 10, borderLeft: `4px solid ${item.status === 'done' ? 'var(--success)' : 'var(--accent)'}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'start' }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}><b style={{ color: 'var(--ink-1)' }}>{item.createdBy || 'Someone'}</b> · {when(item.createdAt)}{item.page && <> · page <Link to={item.page}>{item.pageTitle || item.page}</Link></>}{item.status === 'done' && <> · <span style={{ color: 'var(--success)', fontWeight: 700 }}>Done {when(item.doneAt)}</span></>}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copy(item)}><Copy size={14} /> Copy</button>
            {!!item.imageCount && <button type="button" className="btn btn-secondary btn-sm" onClick={() => download(item)} disabled={!pictures[item.id]}><Download size={14} /> Screenshots ({item.imageCount})</button>}
            {item.status === 'done' ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => void setStatus(item, 'open')}><RotateCcw size={14} /> Not done</button> : <button type="button" className="btn btn-primary btn-sm" onClick={() => void setStatus(item, 'done')}><Check size={14} /> Done</button>}
          </div>
        </div>
        <div dir="auto" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 14.5 }}>{item.text || <i style={{ color: 'var(--text-muted)' }}>(only screenshots)</i>}</div>
        <Screenshots item={item} onLoaded={images => setPictures(current => ({ ...current, [item.id]: images }))} />
      </article>)}
  </section>;
};
