import React, { useState } from 'react';
import { RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react';

type SafetyReport = {
  generatedAt: string;
  counts: { type: string; active: number; deleted: number }[];
  totals: { approved: number; pending: number; declined: number; pledged: number; expenses: number };
  issues: { code: string; label: string; severity: 'error' | 'warning' | 'review'; count: number }[];
};
type SafetyDetail = { id?: string; type?: string; revision?: number; updatedAt?: number; data?: Record<string, any>; duplicateCount?: number; recordIds?: string[]; donorId?: string; amount?: number; currency?: string; method?: string; status?: string; frequency?: string; date?: string };

const money = (value: number) => Number(value || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const CloudDataSafetyPanel: React.FC = () => {
  const [report, setReport] = useState<SafetyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedIssue, setSelectedIssue] = useState<SafetyReport['issues'][number] | null>(null);
  const [details, setDetails] = useState<SafetyDetail[]>([]);
  const [detailPage, setDetailPage] = useState(1);
  const [detailPages, setDetailPages] = useState(1);
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);
  const [repairing, setRepairing] = useState<SafetyDetail | null>(null);
  const [repairValues, setRepairValues] = useState<Record<string,string>>({});
  const [repairOptions, setRepairOptions] = useState<any[]>([]);
  const [repairSearch, setRepairSearch] = useState('');
  const [repairSaving, setRepairSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const run = async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/v3/system/data-safety');
      const text = await response.text();
      let data: any;
      try { data = JSON.parse(text); }
      catch { throw new Error(`Safety review failed (${response.status}). The server did not return a valid report.`); }
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to run the data safety review.');
      setReport(data);
    } catch (reason: any) { setError(reason.message || 'Unable to run the data safety review.'); }
    finally { setLoading(false); }
  };

  const loadDetails = async (issue: SafetyReport['issues'][number], page = 1) => {
    setSelectedIssue(issue); setDetailLoading(true); setError(''); setRepairing(null); setNotice('');
    try {
      const response = await fetch(`/api/v3/system/data-safety/${encodeURIComponent(issue.code)}?page=${page}&limit=25`);
      const text = await response.text(); let data: any;
      try { data = JSON.parse(text); } catch { throw new Error(`Unable to load review details (${response.status}).`); }
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load review details.');
      setDetails(data.items || []); setDetailPage(Number(data.page || 1)); setDetailPages(Math.max(1, Number(data.totalPages || 1))); setDetailTotal(Number(data.total || 0));
    } catch (reason: any) { setError(reason.message || 'Unable to load review details.'); }
    finally { setDetailLoading(false); }
  };
  const detailSummary = (item: SafetyDetail) => {
    if (item.recordIds) return `${item.duplicateCount} records: ${item.recordIds.join(', ')}`;
    const value = item.data || {};
    return [value.name || value.vendor || value.donorName || value.notes, value.date || value.dueDate || value.nextDate, value.amount != null ? `${value.currency || 'CAD'} $${money(value.amountCAD ?? value.amount)}` : '', value.method, value.status || value.type].filter(Boolean).join(' · ') || 'No descriptive fields saved';
  };
  const recordLink = (item: SafetyDetail) => item.type === 'transactions' ? '/payments' : item.type === 'pledges' ? '/pledges' : item.type === 'recurringPayments' ? '/schedules' : item.type === 'bills' ? '/expenses' : item.type === 'paymentAllocations' ? '/payments' : '';
  const repairable = new Set(['approved_missing_account','payment_missing_donor','pledge_missing_donor','schedule_missing_donor','paid_bill_missing_account','bill_missing_category','schedule_missing_account','schedule_missing_end','usd_missing_rate','invalid_payment_date']);
  const beginRepair = async (item: SafetyDetail) => {
    if (!selectedIssue || !item.id) return; setRepairing(item); setRepairValues({}); setRepairOptions([]); setRepairSearch(''); setError(''); setNotice('');
    if (['approved_missing_account','paid_bill_missing_account','bill_missing_category','schedule_missing_account'].includes(selectedIssue.code)) {
      try { const response=await fetch('/api/v3/accounts?limit=100'); const data=await response.json(); if(!response.ok||!data.success)throw new Error(data.error||'Unable to load accounts.'); setRepairOptions(data.items||[]); } catch(reason:any){setError(reason.message||'Unable to load accounts.');}
    }
  };
  const searchDonors = async () => {
    if (repairSearch.trim().length<2) return; try { const response=await fetch(`/api/v3/donors?search=${encodeURIComponent(repairSearch.trim())}&limit=50`); const data=await response.json(); if(!response.ok||!data.success)throw new Error(data.error||'Unable to search donors.'); setRepairOptions(data.items||[]); } catch(reason:any){setError(reason.message||'Unable to search donors.');}
  };
  const saveRepair = async () => {
    if(!selectedIssue||!repairing?.id||!repairing.revision)return;setRepairSaving(true);setError('');setNotice('');
    try { const response=await fetch('/api/v3/system/data-safety/repair',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({code:selectedIssue.code,id:repairing.id,recordType:repairing.type,revision:repairing.revision,changes:repairValues,reason:`Reviewed and repaired ${selectedIssue.label} in Production Data Safety Center`})});const text=await response.text();let data:any;try{data=JSON.parse(text);}catch{throw new Error(`Repair failed (${response.status}).`);}if(!response.ok||!data.success)throw new Error(data.error||'Unable to save this repair.');setNotice('Repair saved with a complete audit entry.');setRepairing(null);await loadDetails(selectedIssue,detailPage);void run();}catch(reason:any){setError(reason.message||'Unable to save this repair.');}finally{setRepairSaving(false);}
  };
  const donorRepair = selectedIssue&&['payment_missing_donor','pledge_missing_donor','schedule_missing_donor'].includes(selectedIssue.code);
  const assetRepair = selectedIssue&&['approved_missing_account','paid_bill_missing_account'].includes(selectedIssue.code);

  const problemCount = report?.issues.reduce((sum, item) => sum + item.count, 0) || 0;
  return <section className="card" style={{ gridColumn: '1 / -1', display: 'grid', gap: 18 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}><ShieldCheck size={34} color="var(--blue)"/><div style={{ flex: 1 }}><h2 style={{ margin: '0 0 6px', color: 'var(--navy)' }}>Production Data Safety Center</h2><p style={{ margin: 0, color: 'var(--text-muted)' }}>Read-only baseline for the full upgrade. It never changes, merges, or deletes a record.</p></div><button className="btn btn-primary" disabled={loading} onClick={() => void run()}><RefreshCw size={16}/>{loading ? 'Reviewing...' : report ? 'Run Again' : 'Run Safety Review'}</button></div>
    {notice && <div style={{color:'var(--green)',fontWeight:800}}>{notice}</div>}{error && <div style={{ color: 'var(--red)', fontWeight: 700 }}>{error}</div>}
    {report && <><div style={{ padding: 12, borderRadius: 10, background: problemCount ? 'var(--yellow-bg)' : 'var(--green-bg)', color: problemCount ? '#8a5a00' : 'var(--green)', fontWeight: 800 }}>{problemCount ? <><TriangleAlert size={16}/> {problemCount.toLocaleString()} record conditions need review before migration.</> : <>✓ No listed migration risks were detected.</>} <small style={{ marginLeft: 8 }}>Generated {new Date(report.generatedAt).toLocaleString()}</small></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 10 }}>{Object.entries(report.totals).map(([label, value]) => <div key={label} style={{ background: 'var(--bg-input)', borderRadius: 10, padding: 12 }}><div style={{ color: 'var(--text-muted)', textTransform: 'capitalize', fontSize: 12 }}>{label}</div><strong>${money(value)}</strong></div>)}</div>
      <div className="table-container"><table><thead><tr><th>Safety check</th><th>Level</th><th style={{ textAlign: 'right' }}>Count</th><th/></tr></thead><tbody>{report.issues.map(item => <tr key={item.code}><td>{item.label}</td><td style={{ textTransform: 'capitalize', color: item.severity === 'error' ? 'var(--red)' : item.severity === 'warning' ? '#8a5a00' : 'var(--blue)', fontWeight: 800 }}>{item.severity}</td><td style={{ textAlign: 'right', fontWeight: 800 }}>{item.count.toLocaleString()}</td><td style={{textAlign:'right'}}><button className="btn btn-secondary btn-sm" disabled={!item.count||detailLoading} onClick={()=>void loadDetails(item,1)}>{selectedIssue?.code===item.code&&detailLoading?'Loading...':'Review records'}</button></td></tr>)}</tbody></table></div>
      {selectedIssue&&<section style={{border:'1px solid var(--border)',borderRadius:12,overflow:'hidden'}}><div style={{padding:16,display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,background:'var(--bg-input)'}}><div><strong style={{color:'var(--navy)'}}>{selectedIssue.label}</strong><div style={{fontSize:12,color:'var(--text-muted)'}}>{detailTotal.toLocaleString()} record{detailTotal===1?'':'s'} · Review each record before changing it</div></div><button className="btn btn-ghost btn-sm" onClick={()=>{setSelectedIssue(null);setDetails([]);setRepairing(null);}}>Close</button></div>{repairing&&<div style={{padding:16,borderBottom:'1px solid var(--border)',background:'#fff',display:'grid',gap:12}}><strong>Repair {repairing.id}</strong>{donorRepair&&<><div style={{display:'flex',gap:8}}><input value={repairSearch} onChange={event=>setRepairSearch(event.target.value)} placeholder="Type English or Yiddish donor name"/><button className="btn btn-secondary" onClick={()=>void searchDonors()}>Search</button></div><select value={repairValues.donorId||''} onChange={event=>setRepairValues({donorId:event.target.value})}><option value="">Choose the correct donor</option>{repairOptions.map(item=><option key={item.id} value={item.id}>{item.name}{item.hebrewName?` — ${item.hebrewName}`:''} — {item.id}</option>)}</select></>}{assetRepair&&<select value={repairValues.sourceAccountId||''} onChange={event=>setRepairValues({sourceAccountId:event.target.value})}><option value="">Choose receiving / paid-from asset account</option>{repairOptions.filter(item=>item.type==='asset').map(item=><option key={item.id} value={item.id}>{item.name} ({item.currency||'CAD'})</option>)}</select>}{selectedIssue.code==='bill_missing_category'&&<select value={repairValues.category||''} onChange={event=>setRepairValues({category:event.target.value,internalCategory:event.target.options[event.target.selectedIndex]?.text||''})}><option value="">Choose expense category</option>{repairOptions.filter(item=>item.type==='expense').map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>}{selectedIssue.code==='schedule_missing_account'&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}><select value={repairValues.sourceAccountId||''} onChange={event=>setRepairValues(current=>({...current,sourceAccountId:event.target.value}))}><option value="">Receiving asset account</option>{repairOptions.filter(item=>item.type==='asset').map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={repairValues.offsetAccountId||''} onChange={event=>setRepairValues(current=>({...current,offsetAccountId:event.target.value}))}><option value="">Revenue account</option>{repairOptions.filter(item=>item.type==='revenue').map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></div>}{selectedIssue.code==='schedule_missing_end'&&<label className="form-group" style={{margin:0}}><span>Schedule end date</span><input type="date" value={repairValues.endDate||''} onChange={event=>setRepairValues({endDate:event.target.value})}/></label>}{selectedIssue.code==='invalid_payment_date'&&<label className="form-group" style={{margin:0}}><span>Correct payment date</span><input type="date" value={repairValues.date||''} onChange={event=>setRepairValues({date:event.target.value})}/></label>}{selectedIssue.code==='usd_missing_rate'&&<label className="form-group" style={{margin:0}}><span>CAD value of 1 USD for this record</span><input type="number" min="0.0001" step="0.0001" value={repairValues.exchangeRate||''} onChange={event=>setRepairValues({exchangeRate:event.target.value})}/></label>}<div style={{display:'flex',justifyContent:'flex-end',gap:8}}><button className="btn btn-secondary" onClick={()=>setRepairing(null)}>Cancel</button><button className="btn btn-primary" disabled={repairSaving||!Object.values(repairValues).some(Boolean)} onClick={()=>void saveRepair()}>{repairSaving?'Saving audited repair...':'Save audited repair'}</button></div></div>}{detailLoading?<div style={{padding:30,textAlign:'center'}}>Loading records…</div>:<div className="table-container"><table><thead><tr><th>Record</th><th>Current saved details</th><th>Updated</th><th/></tr></thead><tbody>{details.map((item,index)=><tr key={item.id||item.recordIds?.join('-')||index}><td><strong>{item.id||`Duplicate group (${item.duplicateCount})`}</strong><div style={{fontSize:12,color:'var(--text-muted)'}}>{item.type||item.status||''}</div></td><td style={{maxWidth:620}}>{detailSummary(item)}</td><td>{item.updatedAt?new Date(item.updatedAt).toLocaleString():'—'}</td><td style={{textAlign:'right',whiteSpace:'nowrap'}}>{item.id&&repairable.has(selectedIssue.code)&&<button className="btn btn-primary btn-sm" onClick={()=>void beginRepair(item)}>Repair safely</button>} {recordLink(item)&&<a className="btn btn-secondary btn-sm" href={recordLink(item)}>Open section</a>}</td></tr>)}{!details.length&&<tr><td colSpan={4} style={{padding:28,textAlign:'center'}}>No records currently match this condition.</td></tr>}</tbody></table></div>}<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:12,borderTop:'1px solid var(--border)'}}><span>Page {detailPage} of {detailPages}</span><div style={{display:'flex',gap:8}}><button className="btn btn-secondary btn-sm" disabled={detailLoading||detailPage<=1} onClick={()=>selectedIssue&&void loadDetails(selectedIssue,detailPage-1)}>Previous</button><button className="btn btn-secondary btn-sm" disabled={detailLoading||detailPage>=detailPages} onClick={()=>selectedIssue&&void loadDetails(selectedIssue,detailPage+1)}>Next</button></div></div></section>}
      <details><summary style={{ cursor: 'pointer', fontWeight: 800 }}>Record inventory ({report.counts.length} types)</summary><div className="table-container" style={{ marginTop: 10 }}><table><thead><tr><th>Record type</th><th style={{ textAlign: 'right' }}>Active</th><th style={{ textAlign: 'right' }}>Deleted history</th></tr></thead><tbody>{report.counts.map(item => <tr key={item.type}><td>{item.type}</td><td style={{ textAlign: 'right' }}>{item.active.toLocaleString()}</td><td style={{ textAlign: 'right' }}>{item.deleted.toLocaleString()}</td></tr>)}</tbody></table></div></details>
    </>}
  </section>;
};
