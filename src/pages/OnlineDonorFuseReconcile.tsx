import React, { useMemo, useState } from 'react';

type Operation = { action: 'create' | 'update' | 'delete'; type: 'pledges' | 'transactions'; id: string; revision: number; changes?: Record<string, unknown>; data?: Record<string, unknown>; reason?: string };

export const OnlineDonorFuseReconcile: React.FC = () => {
  const [operations, setOperations] = useState<Operation[]>([]);
  const [fileName, setFileName] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);
  const [conflicts, setConflicts] = useState<Operation[]>([]);
  const counts = useMemo(() => operations.reduce<Record<string, number>>((result, item) => {
    const key = `${item.action} ${item.type}`;
    result[key] = (result[key] || 0) + 1;
    return result;
  }, {}), [operations]);

  const chooseFile = async (file?: File) => {
    setError(''); setComplete(false); setProgress(0); setConflicts([]); setOperations([]); setFileName(file?.name || '');
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const next = Array.isArray(parsed?.operations) ? parsed.operations : [];
      if (!next.length) throw new Error('This file does not contain reconciliation operations.');
      setOperations(next);
    } catch (reason: any) { setError(reason.message || 'Unable to read this reconciliation file.'); }
  };

  const apply = async () => {
    if (!operations.length || running) return;
    setRunning(true); setError(''); setComplete(false); setProgress(0);
    try {
      const skipped: Operation[] = [];
      for (let start = 0; start < operations.length; start += 25) {
        const batch = operations.slice(start, start + 25);
        const response = await fetch('/api/v3/admin/reconcile-donorfuse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `donorfuse-reconcile-${start}-${batch.map(item => item.id).join('-').slice(0, 110)}` },
          body: JSON.stringify({ operations: batch })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) {
          if (response.status === 409 || Array.isArray(result.conflicts)) {
            for (const item of batch) {
              const singleResponse = await fetch('/api/v3/admin/reconcile-donorfuse', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `donorfuse-reconcile-single-${item.type}-${item.id}-${item.revision}` },
                body: JSON.stringify({ operations: [item] })
              });
              const singleResult = await singleResponse.json().catch(() => ({}));
              if (!singleResponse.ok || !singleResult.success) skipped.push(item);
            }
          } else throw new Error(result.error || `Reconciliation stopped at record ${start + 1}.`);
        }
        setProgress(Math.min(operations.length, start + batch.length));
      }
      setConflicts(skipped);
      setComplete(true);
    } catch (reason: any) { setError(reason.message || 'Unable to apply this reconciliation.'); }
    finally { setRunning(false); }
  };

  return <div className="page-container">
    <div className="page-header"><div><div className="eyebrow">CHARITYPRO CLOUD</div><h1>DonorFuse Pledge Reconciliation</h1><p className="muted">Guarded administrator tool for restoring the old system's exact pledge allocations.</p></div></div>
    <div className="card" style={{ maxWidth: 850, padding: 28 }}>
      <label className="form-label" htmlFor="donorfuse-plan">Reconciliation file</label>
      <input id="donorfuse-plan" type="file" accept="application/json,.json" onChange={event => chooseFile(event.target.files?.[0])} />
      {fileName && <p className="muted" style={{ marginTop: 10 }}>{fileName}</p>}
      {operations.length > 0 && <>
        <div className="card" style={{ marginTop: 20, padding: 18, background: '#f5f7fa' }}>
          <strong>{operations.length.toLocaleString()} guarded changes ready</strong>
          <ul>{Object.entries(counts).map(([key, value]) => <li key={key}>{value.toLocaleString()} — {key}</li>)}</ul>
          <p className="muted">Every change checks the current cloud revision first. If any record changed since the backup, that batch stops without changing anything.</p>
        </div>
        <button className="btn btn-primary" style={{ marginTop: 18 }} disabled={running || complete} onClick={apply}>{running ? `Applying ${progress.toLocaleString()} of ${operations.length.toLocaleString()}…` : complete ? 'Reconciliation completed' : 'Apply verified reconciliation'}</button>
      </>}
      {error && <div className="alert alert-error" style={{ marginTop: 18 }}>{error}</div>}
      {complete && conflicts.length === 0 && <div className="alert alert-success" style={{ marginTop: 18 }}>All verified DonorFuse pledge and payment links were applied successfully.</div>}
      {conflicts.length > 0 && <div className="alert alert-error" style={{ marginTop: 18 }}>{conflicts.length.toLocaleString()} changed records were safely skipped and need a fresh backup before they can be reconciled.</div>}
    </div>
  </div>;
};
