import React, { useState } from 'react';
import { RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react';

type SafetyReport = {
  generatedAt: string;
  counts: { type: string; active: number; deleted: number }[];
  totals: { approved: number; pending: number; declined: number; pledged: number; expenses: number };
  issues: { code: string; label: string; severity: 'error' | 'warning' | 'review'; count: number }[];
};

const money = (value: number) => Number(value || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const CloudDataSafetyPanel: React.FC = () => {
  const [report, setReport] = useState<SafetyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/v3/system/data-safety');
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to run the data safety review.');
      setReport(data);
    } catch (reason: any) { setError(reason.message || 'Unable to run the data safety review.'); }
    finally { setLoading(false); }
  };

  const problemCount = report?.issues.reduce((sum, item) => sum + item.count, 0) || 0;
  return <section className="card" style={{ gridColumn: '1 / -1', display: 'grid', gap: 18 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}><ShieldCheck size={34} color="var(--blue)"/><div style={{ flex: 1 }}><h2 style={{ margin: '0 0 6px', color: 'var(--navy)' }}>Production Data Safety Center</h2><p style={{ margin: 0, color: 'var(--text-muted)' }}>Read-only baseline for the full upgrade. It never changes, merges, or deletes a record.</p></div><button className="btn btn-primary" disabled={loading} onClick={() => void run()}><RefreshCw size={16}/>{loading ? 'Reviewing...' : report ? 'Run Again' : 'Run Safety Review'}</button></div>
    {error && <div style={{ color: 'var(--red)', fontWeight: 700 }}>{error}</div>}
    {report && <><div style={{ padding: 12, borderRadius: 10, background: problemCount ? 'var(--yellow-bg)' : 'var(--green-bg)', color: problemCount ? '#8a5a00' : 'var(--green)', fontWeight: 800 }}>{problemCount ? <><TriangleAlert size={16}/> {problemCount.toLocaleString()} record conditions need review before migration.</> : <>✓ No listed migration risks were detected.</>} <small style={{ marginLeft: 8 }}>Generated {new Date(report.generatedAt).toLocaleString()}</small></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 10 }}>{Object.entries(report.totals).map(([label, value]) => <div key={label} style={{ background: 'var(--bg-input)', borderRadius: 10, padding: 12 }}><div style={{ color: 'var(--text-muted)', textTransform: 'capitalize', fontSize: 12 }}>{label}</div><strong>${money(value)}</strong></div>)}</div>
      <div className="table-container"><table><thead><tr><th>Safety check</th><th>Level</th><th style={{ textAlign: 'right' }}>Count</th></tr></thead><tbody>{report.issues.map(item => <tr key={item.code}><td>{item.label}</td><td style={{ textTransform: 'capitalize', color: item.severity === 'error' ? 'var(--red)' : item.severity === 'warning' ? '#8a5a00' : 'var(--blue)', fontWeight: 800 }}>{item.severity}</td><td style={{ textAlign: 'right', fontWeight: 800 }}>{item.count.toLocaleString()}</td></tr>)}</tbody></table></div>
      <details><summary style={{ cursor: 'pointer', fontWeight: 800 }}>Record inventory ({report.counts.length} types)</summary><div className="table-container" style={{ marginTop: 10 }}><table><thead><tr><th>Record type</th><th style={{ textAlign: 'right' }}>Active</th><th style={{ textAlign: 'right' }}>Deleted history</th></tr></thead><tbody>{report.counts.map(item => <tr key={item.type}><td>{item.type}</td><td style={{ textAlign: 'right' }}>{item.active.toLocaleString()}</td><td style={{ textAlign: 'right' }}>{item.deleted.toLocaleString()}</td></tr>)}</tbody></table></div></details>
    </>}
  </section>;
};
