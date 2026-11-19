import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { CloudPledgeDetailsModal } from './CloudPledgeDetailsModal';
import { buildWorkbook } from '../utils/excel';

export type CampaignTotals = { id: string; campaign: string; year?: string | number; pledges: number; donors: number; openPledges: number; pledged: number; paid: number; pending: number; balance: number; scheduled: number; notScheduled: number; overpaid: number; goal?: number };
type PledgeRow = { id: string; donorId: string; donor: string; hebrewName: string; date: string; amountCAD: number; paid: number; pending: number; scheduled: number; balance: number; campaignId: string; phone?: string };
export const money = (value: number) => `$${Number(value || 0).toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** One campaign: every pledge in it, with what is paid and what is still open. Click a pledge to open it. */
export const CampaignPledgesModal: React.FC<{ campaign: CampaignTotals; onClose: () => void }> = ({ campaign, onClose }) => {
  const [rows, setRows] = useState<PledgeRow[] | null>(null); const [error, setError] = useState(''); const [search, setSearch] = useState('');
  const [show, setShow] = useState<'all' | 'open' | 'paid'>('all'); const [sort, setSort] = useState<{ key: keyof PledgeRow; dir: 1 | -1 }>({ key: 'balance', dir: -1 }); const [pledgeId, setPledgeId] = useState('');
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try { const response = await fetch('/api/v3/report-data?source=pledges'); const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || 'Could not load the pledges.'); if (!cancelled) setRows((data.rows || []).filter((row: PledgeRow) => String(row.campaignId || '') === campaign.id)); }
      catch (reason: any) { if (!cancelled) setError(reason.message); }
    })();
    return () => { cancelled = true; };
  }, [campaign.id]);
  const shown = useMemo(() => {
    const words = search.trim().toLowerCase();
    return (rows || []).filter(row => (show === 'all' || (show === 'open' ? row.balance > 0.005 : row.balance <= 0.005)) && (!words || `${row.donor} ${row.hebrewName} ${row.phone || ''}`.toLowerCase().includes(words)))
      .sort((a, b) => { const x = a[sort.key] ?? ''; const y = b[sort.key] ?? ''; return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sort.dir; });
  }, [rows, search, show, sort]);
  const th = (key: keyof PledgeRow, label: string, right = false) => <th style={{ cursor: 'pointer', textAlign: right ? 'right' : undefined, whiteSpace: 'nowrap' }} onClick={() => setSort(current => ({ key, dir: current.key === key ? (current.dir === 1 ? -1 : 1) : (right ? -1 : 1) }))}>{label}{sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</th>;
  const sum = (key: 'amountCAD' | 'paid' | 'pending' | 'scheduled' | 'balance') => shown.reduce((total, row) => total + Number(row[key] || 0), 0);
  const exportExcel = async () => {
    const blob = buildWorkbook([{ name: 'Pledges', title: `${campaign.campaign} – pledges`, columns: [{ key: 'donor', header: 'Donor', type: 'text' }, { key: 'hebrewName', header: 'Hebrew name', type: 'text' }, { key: 'date', header: 'Date', type: 'date' }, { key: 'amountCAD', header: 'Pledged', type: 'money' }, { key: 'paid', header: 'Paid', type: 'money' }, { key: 'pending', header: 'Waiting', type: 'money' }, { key: 'scheduled', header: 'Scheduled', type: 'money' }, { key: 'balance', header: 'Still owes', type: 'money' }], rows: shown, totals: { donor: 'Total', amountCAD: sum('amountCAD'), paid: sum('paid'), pending: sum('pending'), scheduled: sum('scheduled'), balance: sum('balance') } }]);
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${campaign.campaign.replace(/[^\w\- ]+/g, '')} pledges.xlsx`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  return <div className="modal-overlay" onClick={onClose}><div className="modal" onClick={event => event.stopPropagation()} style={{ maxWidth: 1100, width: '96%' }}>
    <div className="modal-header"><div><h2 style={{ margin: 0 }}>{campaign.campaign}</h2><small style={{ color: 'var(--text-muted)' }}>{campaign.pledges} pledges · {campaign.donors} donors · pledged {money(campaign.pledged)} · paid {money(campaign.paid)} · still open {money(campaign.balance)}</small></div><button className="modal-close" onClick={onClose}><X size={20} /></button></div>
    <div className="modal-body" style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input placeholder="Search donor or phone…" value={search} onChange={event => setSearch(event.target.value)} style={{ flex: 1, minWidth: 200 }} />
        <select value={show} onChange={event => setShow(event.target.value as 'all' | 'open' | 'paid')}><option value="all">All pledges</option><option value="open">Still open</option><option value="paid">Paid up</option></select>
        <button className="btn btn-secondary btn-sm" disabled={!shown.length} onClick={() => void exportExcel()}>Export to Excel</button>
      </div>
      {error && <div className="pay-error">{error}</div>}
      <div className="table-container" style={{ maxHeight: '60vh', overflow: 'auto' }}><table>
        <thead><tr>{th('donor', 'Donor')}{th('date', 'Date')}{th('amountCAD', 'Pledged', true)}{th('paid', 'Paid', true)}{th('pending', 'Waiting', true)}{th('scheduled', 'Scheduled', true)}{th('balance', 'Still owes', true)}</tr></thead>
        <tbody>
          {!rows && !error && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 20 }}>Loading…</td></tr>}
          {shown.map(row => <tr key={row.id} style={{ cursor: 'pointer' }} onClick={() => setPledgeId(row.id)} title="Open this pledge">
            <td><strong>{row.donor || '—'}</strong>{row.hebrewName && <div dir="rtl" style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'left' }}>{row.hebrewName}</div>}</td><td>{row.date}</td>
            <td style={{ textAlign: 'right' }}>{money(row.amountCAD)}</td><td style={{ textAlign: 'right' }}>{money(row.paid)}</td><td style={{ textAlign: 'right' }}>{row.pending ? money(row.pending) : '—'}</td><td style={{ textAlign: 'right' }}>{row.scheduled ? money(row.scheduled) : '—'}</td>
            <td style={{ textAlign: 'right', fontWeight: 700, color: row.balance > 0.005 ? 'var(--red)' : row.balance < -0.005 ? 'var(--blue, #2563eb)' : 'var(--green)' }}>{row.balance > 0.005 ? money(row.balance) : row.balance < -0.005 ? `${money(-row.balance)} over` : 'Paid'}</td>
          </tr>)}
          {rows && !shown.length && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>No pledges here.</td></tr>}
        </tbody>
        {shown.length > 0 && <tfoot><tr style={{ fontWeight: 700 }}><td>Total ({shown.length})</td><td /><td style={{ textAlign: 'right' }}>{money(sum('amountCAD'))}</td><td style={{ textAlign: 'right' }}>{money(sum('paid'))}</td><td style={{ textAlign: 'right' }}>{money(sum('pending'))}</td><td style={{ textAlign: 'right' }}>{money(sum('scheduled'))}</td><td style={{ textAlign: 'right' }}>{money(shown.reduce((total, row) => total + Math.max(0, row.balance), 0))}</td></tr></tfoot>}
      </table></div>
    </div>
    {pledgeId && <CloudPledgeDetailsModal pledgeId={pledgeId} onClose={() => setPledgeId('')} />}
  </div></div>;
};
