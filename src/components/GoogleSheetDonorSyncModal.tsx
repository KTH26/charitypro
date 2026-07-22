import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw, ShieldCheck, X } from 'lucide-react';

type Preview = {
  sheetHash: string;
  summary: { rows: number; creates: number; updates: number; unchanged: number; skipped: number; conflicts: number };
  samples: Array<{ code: string; name: string; action: 'create' | 'update'; changedFields: string[] }>;
  warnings: string[];
  columns: string[];
};

export const GoogleSheetDonorSyncModal: React.FC<{ onClose: () => void; onApplied: (message: string) => void }> = ({ onClose, onApplied }) => {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef('');

  const loadPreview = async () => {
    setLoading(true); setError(''); setPreview(null);
    try {
      const response = await fetch('/api/v3/donors/google-sheet/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clearBlankFields: false }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to preview the Google Sheet.');
      setPreview(data);
    } catch (reason: any) { setError(reason.message || 'Unable to preview the Google Sheet.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void loadPreview(); }, []);

  const apply = async () => {
    if (!preview) return;
    setApplying(true); setError('');
    const key = requestId.current || crypto.randomUUID(); requestId.current = key;
    try {
      const response = await fetch('/api/v3/donors/google-sheet/apply', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({ requestId: key, sheetHash: preview.sheetHash, clearBlankFields: false })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to apply the Google Sheet.');
      requestId.current = '';
      onApplied(`Google Sheet complete: ${data.updated} donor(s) updated and ${data.created} new donor(s) added. Nothing was deleted.`);
    } catch (reason: any) { requestId.current = ''; setError(reason.message || 'Unable to apply the Google Sheet.'); }
    finally { setApplying(false); }
  };

  const totalChanges = (preview?.summary.creates || 0) + (preview?.summary.updates || 0);
  return <div className="modal-overlay" onClick={onClose}>
    <div className="modal modal-lg" onClick={event => event.stopPropagation()}>
      <div className="modal-header"><div><h2>Sync Donors from Google Sheet</h2><div style={{ color: 'var(--text-muted)', marginTop: 5 }}>Safe preview before any cloud record changes</div></div><button className="modal-close" onClick={onClose}><X size={20}/></button></div>
      <div className="modal-body">
        {loading && <div style={{ textAlign: 'center', padding: 42 }}><RefreshCw size={34} className="spin" style={{ color: 'var(--green)', marginBottom: 12 }}/><div style={{ fontWeight: 800 }}>Reading the published donor sheet…</div></div>}
        {error && <div style={{ padding: 16, borderRadius: 12, color: 'var(--red)', background: 'var(--red-bg)', display: 'flex', gap: 10, alignItems: 'flex-start' }}><AlertTriangle size={20}/><div><strong>Google Sheet could not be loaded</strong><div style={{ marginTop: 4 }}>{error}</div></div></div>}
        {preview && <div style={{ display: 'grid', gap: 18 }}>
          <div style={{ padding: 16, borderRadius: 12, background: 'var(--green-bg)', color: 'var(--green)', display: 'flex', gap: 12 }}><ShieldCheck size={23}/><div><strong>No deletion and no blank-field erasing</strong><div style={{ marginTop: 4, color: 'var(--text-primary)' }}>Existing donors are matched by CODE. Only nonblank sheet values update their profile; transactions, pledges, payments, and totals stay untouched.</div></div></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
            {[['Sheet rows', preview.summary.rows], ['Will update', preview.summary.updates], ['Will add', preview.summary.creates], ['No change', preview.summary.unchanged]].map(([label, value]) => <div key={String(label)} style={{ padding: 14, background: 'var(--bg-input)', borderRadius: 12 }}><div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{label}</div><div style={{ fontWeight: 900, fontSize: 22, color: 'var(--navy)' }}>{Number(value).toLocaleString()}</div></div>)}
          </div>
          {(preview.summary.skipped > 0 || preview.summary.conflicts > 0) && <div style={{ padding: 14, borderRadius: 12, background: 'var(--yellow-bg)', color: 'var(--text-primary)' }}><strong>Needs attention:</strong> {preview.summary.skipped} row(s) without CODE and {preview.summary.conflicts} duplicate/ambiguous CODE row(s) will be skipped.</div>}
          {preview.samples.length > 0 && <div><h3 style={{ margin: '0 0 10px', color: 'var(--navy)' }}>Preview of changes</h3><div style={{ maxHeight: 300, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th>CODE</th><th>Donor</th><th>Action</th><th>Fields</th></tr></thead><tbody>{preview.samples.map((sample, index) => <tr key={`${sample.code}-${index}`}><td style={{ fontWeight: 800 }}>{sample.code}</td><td>{sample.name}</td><td><span className={`badge ${sample.action === 'create' ? 'badge-success' : 'badge-info'}`}>{sample.action === 'create' ? 'Add' : 'Update'}</span></td><td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{sample.changedFields.join(', ') || 'new donor'}</td></tr>)}</tbody></table></div>{totalChanges > preview.samples.length && <div style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: 12 }}>Showing the first {preview.samples.length} of {totalChanges.toLocaleString()} changes.</div>}</div>}
          {totalChanges === 0 && <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>The online donor list already matches all nonblank values in this sheet.</div>}
        </div>}
      </div>
      <div className="modal-footer"><button className="btn btn-secondary" onClick={onClose}>Cancel</button>{error && <button className="btn btn-secondary" disabled={loading} onClick={() => void loadPreview()}>Try Again</button>}<button className="btn btn-primary" disabled={!preview || totalChanges === 0 || applying} onClick={() => void apply()}>{applying ? 'Applying safely…' : `Apply ${totalChanges.toLocaleString()} Change${totalChanges === 1 ? '' : 's'}`}</button></div>
    </div>
  </div>;
};
