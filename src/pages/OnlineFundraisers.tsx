import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Users, UserPlus, X } from 'lucide-react';
import { startLiveRefresh } from '../utils/liveUpdates';
import { FundraiserAllocationEditor, type FundraiserAllocationDraft } from '../components/FundraiserAllocationEditor';
import { LoanDueDateField, isLoanAccount } from '../components/LoanDueDateField';

type Fundraiser = { id: string; revision: number; name: string; phone?: string; email?: string; percentage?: number; notes?: string; totalRaised?: number; commissionEarned?: number; commissionPaid?: number; balanceOwed?: number };
type Team = { id: string; revision: number; name: string; allocations: FundraiserAllocationDraft[] };
type Account = { id: string; name: string; type: string; subType?: string; currency: string };
type Payout = { id: string; fundraiserId: string; amount: number; date: string; memo?: string; sourceAccountId?: string };

const money = (value: number | undefined) => '$' + Number(value || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const localToday = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };
const send = async (url: string, method: string, body: any) => {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.error || 'Unable to save.');
  return data;
};

/**
 * Fundraisers: who they are, their commission %, and what we owe them.
 * Owed = commission earned on payments received (from the pledge or payment split) minus what was paid out.
 * Teams: a saved set of fundraisers with their % shares, to pick on a pledge in one click.
 */
export const OnlineFundraisers: React.FC = () => {
  const [tab, setTab] = useState<'fundraisers' | 'teams'>('fundraisers');
  const [fundraisers, setFundraisers] = useState<Fundraiser[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<Partial<Fundraiser> | null>(null);
  const [editingTeam, setEditingTeam] = useState<Partial<Team> | null>(null);
  const [paying, setPaying] = useState<Fundraiser | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [people, groups] = await Promise.all([
        fetch('/api/v3/payroll/entities?type=fundraisers&limit=100').then(response => response.json()),
        fetch('/api/v3/records/fundraisingGroups?limit=100').then(response => response.json())
      ]);
      if (!people.success) throw new Error(people.error || 'Unable to load fundraisers.');
      setFundraisers(people.items || []);
      if (groups.success) setTeams((groups.items || []).map((item: any) => ({ ...item, allocations: Array.isArray(item.allocations) ? item.allocations : [] })));
      setError('');
    } catch (reason: any) { if (!silent) setError(reason.message || 'Unable to load fundraisers.'); }
    finally { if (!silent) setLoading(false); }
  }, []);
  useEffect(() => { void load(); return startLiveRefresh(() => void load(true)); }, [load]);
  useEffect(() => { fetch('/api/v3/accounts?limit=100&types=asset,liability&sort=name').then(response => response.json()).then(data => { if (data.success) setAccounts(data.items || []); }).catch(() => undefined); }, []);

  const shown = useMemo(() => { const q = search.trim().toLowerCase(); return q ? fundraisers.filter(item => [item.name, item.phone, item.email].join(' ').toLowerCase().includes(q)) : fundraisers; }, [fundraisers, search]);
  const totals = useMemo(() => fundraisers.reduce((sum, item) => ({ earned: sum.earned + Number(item.commissionEarned || 0), paid: sum.paid + Number(item.commissionPaid || 0), owed: sum.owed + Number(item.balanceOwed || 0) }), { earned: 0, paid: 0, owed: 0 }), [fundraisers]);
  const nameOf = (id: string) => fundraisers.find(item => item.id === id)?.name || 'Unknown';

  const saveFundraiser = async (event: React.FormEvent) => {
    event.preventDefault(); if (!editing) return;
    const name = String(editing.name || '').trim(); const percentage = Number(editing.percentage);
    if (!name) { setError('Enter the fundraiser name.'); return; }
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) { setError('Commission % must be between 0 and 100.'); return; }
    const data = { name, phone: String(editing.phone || '').trim(), email: String(editing.email || '').trim(), percentage, notes: String(editing.notes || '').trim() };
    try {
      if (editing.id) await send(`/api/v3/records/fundraisers/${encodeURIComponent(editing.id)}`, 'PUT', { revision: editing.revision, data });
      else await send('/api/v3/records/fundraisers', 'POST', { data });
      setEditing(null); setError(''); setNotice(`Fundraiser "${name}" saved.`); await load(true);
    } catch (reason: any) { setError(reason.message); }
  };
  const saveTeam = async (event: React.FormEvent) => {
    event.preventDefault(); if (!editingTeam) return;
    const name = String(editingTeam.name || '').trim(); const allocations = (editingTeam.allocations || []).filter(item => item.fundraiserId).map(item => ({ fundraiserId: item.fundraiserId, percentage: Number(item.percentage) }));
    if (!name) { setError('Enter the team name.'); return; }
    if (!allocations.length) { setError('Add at least one fundraiser to the team.'); return; }
    if (allocations.some(item => !Number.isFinite(item.percentage) || item.percentage <= 0 || item.percentage > 100)) { setError('Each share must be more than 0% and at most 100%.'); return; }
    if (allocations.reduce((sum, item) => sum + item.percentage, 0) > 100) { setError('The shares add up to more than 100%.'); return; }
    if (new Set(allocations.map(item => item.fundraiserId)).size !== allocations.length) { setError('Each fundraiser can be in the team only once.'); return; }
    try {
      if (editingTeam.id) await send(`/api/v3/records/fundraisingGroups/${encodeURIComponent(editingTeam.id)}`, 'PUT', { revision: editingTeam.revision, data: { name, allocations } });
      else await send('/api/v3/records/fundraisingGroups', 'POST', { data: { name, allocations } });
      setEditingTeam(null); setError(''); setNotice(`Team "${name}" saved.`); await load(true);
    } catch (reason: any) { setError(reason.message); }
  };
  const deleteTeam = async (team: Team) => {
    if (!window.confirm(`Delete the team "${team.name}"?\n\nPledges that already used it keep their fundraiser split.`)) return;
    try { await send(`/api/v3/records/fundraisingGroups/${encodeURIComponent(team.id)}`, 'DELETE', { revision: team.revision }); setNotice(`Team "${team.name}" deleted.`); await load(true); }
    catch (reason: any) { setError(reason.message); }
  };

  return <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: 28 }}><div style={{ maxWidth: 1200, margin: '0 auto' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
      <div><div style={{ color: 'var(--green)', fontWeight: 800, fontSize: 13 }}>CHARITYPRO CLOUD</div><h1 style={{ color: 'var(--navy)', margin: '4px 0' }}>Fundraisers</h1><div style={{ color: 'var(--text-muted)' }}>Fundraisers, their commission %, teams, and how much we owe each one.</div></div>
      <div className="page-actions">{tab === 'fundraisers' ? <button className="btn btn-primary" onClick={() => { setError(''); setEditing({ percentage: 10 }); }}><UserPlus size={16} /> New Fundraiser</button> : <button className="btn btn-primary" disabled={!fundraisers.length} onClick={() => { setError(''); setEditingTeam({ allocations: [] }); }}><Plus size={16} /> New Team</button>}</div>
    </div>
    <div className="fundraiser-totals">
      <div><span>Commission earned</span><strong>{money(totals.earned)}</strong></div>
      <div><span>Paid to fundraisers</span><strong>{money(totals.paid)}</strong></div>
      <div className="owed"><span>We owe now</span><strong>{money(totals.owed)}</strong></div>
    </div>
    <div className="account-view-tabs" role="tablist">
      <button type="button" role="tab" aria-selected={tab === 'fundraisers'} className={tab === 'fundraisers' ? 'active' : ''} onClick={() => setTab('fundraisers')}>Fundraisers ({fundraisers.length})<small>Name, commission %, and balance</small></button>
      <button type="button" role="tab" aria-selected={tab === 'teams'} className={tab === 'teams' ? 'active' : ''} onClick={() => setTab('teams')}>Teams ({teams.length})<small>Fundraisers who share a pledge</small></button>
    </div>
    {notice && <div className="card" style={{ padding: 14, color: 'var(--green)', fontWeight: 700, marginBottom: 14 }}>{notice}</div>}
    {error && !editing && !editingTeam && !paying && <div className="card" style={{ padding: 14, color: 'var(--red)', fontWeight: 700, marginBottom: 14 }}>{error}</div>}

    {tab === 'fundraisers' && <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: 14, borderBottom: '1px solid var(--border)' }}><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search fundraisers" /></div>
      {loading ? <div style={{ padding: 40, textAlign: 'center' }}>Loading fundraisers…</div> : <div className="table-container"><table><thead><tr><th>Name</th><th>Phone</th><th style={{ textAlign: 'right' }}>Commission</th><th style={{ textAlign: 'right' }}>Raised</th><th style={{ textAlign: 'right' }}>Earned</th><th style={{ textAlign: 'right' }}>Paid</th><th style={{ textAlign: 'right' }}>We owe</th><th /></tr></thead><tbody>
        {shown.map(item => <tr key={item.id}>
          <td style={{ fontWeight: 800 }}>{item.name}</td><td>{item.phone ? <a href={`tel:${item.phone}`}>{item.phone}</a> : '—'}</td>
          <td style={{ textAlign: 'right' }}>{Number(item.percentage || 0)}%</td><td style={{ textAlign: 'right' }}>{money(item.totalRaised)}</td><td style={{ textAlign: 'right' }}>{money(item.commissionEarned)}</td><td style={{ textAlign: 'right' }}>{money(item.commissionPaid)}</td>
          <td style={{ textAlign: 'right', fontWeight: 900, color: Number(item.balanceOwed || 0) > 0.005 ? 'var(--red)' : 'var(--green)' }}>{money(item.balanceOwed)}</td>
          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><button className="btn btn-secondary btn-sm" onClick={() => { setError(''); setEditing(item); }}>Edit</button> <button className="btn btn-primary btn-sm" disabled={Number(item.balanceOwed || 0) < 0.005} onClick={() => { setError(''); setPaying(item); }}>Pay</button></td>
        </tr>)}
        {!shown.length && <tr><td colSpan={8} style={{ padding: 30, textAlign: 'center' }}>{fundraisers.length ? 'No fundraiser matches this search.' : 'No fundraisers yet. Click "New Fundraiser" to add the first one.'}</td></tr>}
      </tbody></table></div>}
    </section>}

    {tab === 'teams' && <section className="card" style={{ padding: 0, overflow: 'hidden' }}><div className="table-container"><table><thead><tr><th>Team</th><th>Fundraisers and their share</th><th style={{ textAlign: 'right' }}>Total</th><th /></tr></thead><tbody>
      {teams.map(team => { const total = team.allocations.reduce((sum, item) => sum + Number(item.percentage || 0), 0); return <tr key={team.id}>
        <td style={{ fontWeight: 800 }}>{team.name}</td><td>{team.allocations.map(item => `${nameOf(item.fundraiserId)} ${Number(item.percentage)}%`).join(' · ') || '—'}</td><td style={{ textAlign: 'right', fontWeight: 800 }}>{total}%</td>
        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><button className="btn btn-secondary btn-sm" onClick={() => { setError(''); setEditingTeam({ ...team, allocations: team.allocations.map(item => ({ ...item })) }); }}>Edit</button> <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => void deleteTeam(team)}>Delete</button></td>
      </tr>; })}
      {!teams.length && <tr><td colSpan={4} style={{ padding: 30, textAlign: 'center' }}>No teams yet. A team is a group of fundraisers who share a pledge, for example Yossi 5% and Moshe 5%.</td></tr>}
    </tbody></table></div></section>}
    </div>

    {editing && <div className="modal-overlay" onClick={() => setEditing(null)}><form className="modal" onClick={event => event.stopPropagation()} onSubmit={saveFundraiser} style={{ maxWidth: 560, width: '94%' }}>
      <div className="modal-header"><h2 style={{ margin: 0 }}>{editing.id ? 'Edit Fundraiser' : 'New Fundraiser'}</h2><button type="button" className="modal-close" onClick={() => setEditing(null)}><X size={20} /></button></div>
      <div className="modal-body">{error && <div style={{ color: 'var(--red)', fontWeight: 700, marginBottom: 14 }}>{error}</div>}<div className="form-grid-2">
        <label className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}><span>Name *</span><input autoFocus value={editing.name || ''} onChange={event => setEditing({ ...editing, name: event.target.value })} /></label>
        <label className="form-group" style={{ margin: 0 }}><span>Phone</span><input value={editing.phone || ''} onChange={event => setEditing({ ...editing, phone: event.target.value })} /></label>
        <label className="form-group" style={{ margin: 0 }}><span>Email</span><input type="email" value={editing.email || ''} onChange={event => setEditing({ ...editing, email: event.target.value })} /></label>
        <label className="form-group" style={{ margin: 0 }}><span>Commission % *</span><input type="number" min="0" max="100" step="0.01" value={editing.percentage ?? ''} onChange={event => setEditing({ ...editing, percentage: event.target.value === '' ? undefined : Number(event.target.value) })} /><small style={{ color: 'var(--text-muted)' }}>Used when he works alone. A team sets its own shares.</small></label>
        <label className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}><span>Notes</span><textarea rows={2} value={editing.notes || ''} onChange={event => setEditing({ ...editing, notes: event.target.value })} /></label>
      </div></div>
      <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button><button className="btn btn-primary">Save Fundraiser</button></div>
    </form></div>}

    {editingTeam && <div className="modal-overlay" onClick={() => setEditingTeam(null)}><form className="modal" onClick={event => event.stopPropagation()} onSubmit={saveTeam} style={{ maxWidth: 620, width: '94%' }}>
      <div className="modal-header"><h2 style={{ margin: 0 }}><Users size={18} style={{ verticalAlign: -3 }} /> {editingTeam.id ? 'Edit Team' : 'New Team'}</h2><button type="button" className="modal-close" onClick={() => setEditingTeam(null)}><X size={20} /></button></div>
      <div className="modal-body">{error && <div style={{ color: 'var(--red)', fontWeight: 700, marginBottom: 14 }}>{error}</div>}<div style={{ display: 'grid', gap: 14 }}>
        <label className="form-group" style={{ margin: 0 }}><span>Team name *</span><input autoFocus value={editingTeam.name || ''} onChange={event => setEditingTeam({ ...editingTeam, name: event.target.value })} placeholder="For example: Yossi and Moshe" /></label>
        <FundraiserAllocationEditor fundraisers={fundraisers} value={editingTeam.allocations || []} onChange={allocations => setEditingTeam({ ...editingTeam, allocations })} />
      </div></div>
      <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setEditingTeam(null)}>Cancel</button><button className="btn btn-primary">Save Team</button></div>
    </form></div>}

    {paying && <PayFundraiserModal fundraiser={paying} accounts={accounts} onClose={() => setPaying(null)} onPaid={amount => { setPaying(null); setNotice(`Paid ${money(amount)} to ${paying.name}. His balance went down.`); void load(true); }} />}
  </main>;
};

const PayFundraiserModal: React.FC<{ fundraiser: Fundraiser; accounts: Account[]; onClose: () => void; onPaid: (amount: number) => void }> = ({ fundraiser, accounts, onClose, onPaid }) => {
  const owed = Math.round(Number(fundraiser.balanceOwed || 0) * 100) / 100;
  const [form, setForm] = useState({ amount: owed.toFixed(2), date: localToday(), sourceAccountId: '', memo: '', loanDueDate: '' });
  const [history, setHistory] = useState<Payout[]>([]);
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const key = useRef('');
  const source = accounts.find(account => account.id === form.sourceAccountId);
  useEffect(() => { fetch(`/api/v3/records/fundraiserPayouts?limit=100&search=${encodeURIComponent(fundraiser.id)}`).then(response => response.json()).then(data => { if (data.success) setHistory((data.items || []).filter((item: Payout) => item.fundraiserId === fundraiser.id).sort((a: Payout, b: Payout) => b.date.localeCompare(a.date))); }).catch(() => undefined); }, [fundraiser.id]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter an amount above zero.'); return; }
    if (amount - owed > 0.005) { setError(`We owe only ${money(owed)}.`); return; }
    if (!form.sourceAccountId) { setError('Choose the account the money is paid from.'); return; }
    if (isLoanAccount(source) && !form.loanDueDate) { setError('This money comes from a loan account. Choose the date it has to be paid back.'); return; }
    setSaving(true); setError(''); key.current = key.current || crypto.randomUUID();
    try {
      const response = await fetch('/api/v3/fundraiser-payouts', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key.current }, body: JSON.stringify({ requestId: key.current, fundraiserId: fundraiser.id, amount, date: form.date, sourceAccountId: form.sourceAccountId, memo: form.memo.trim(), ...(isLoanAccount(source) ? { loanDueDate: form.loanDueDate } : {}) }) });
      const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || 'Unable to save the payment.');
      onPaid(amount);
    } catch (reason: any) { key.current = ''; setError(reason.message || 'Unable to save the payment.'); }
    finally { setSaving(false); }
  };
  return <div className="modal-overlay" onClick={onClose}><form className="modal" onClick={event => event.stopPropagation()} onSubmit={save} style={{ maxWidth: 580, width: '94%' }}>
    <div className="modal-header"><div><h2 style={{ margin: 0 }}>Pay {fundraiser.name}</h2><div style={{ color: 'var(--text-muted)', fontSize: 13 }}>We owe him <strong style={{ color: 'var(--red)' }}>{money(owed)}</strong></div></div><button type="button" className="modal-close" onClick={onClose}><X size={20} /></button></div>
    <div className="modal-body">{error && <div style={{ color: 'var(--red)', fontWeight: 700, marginBottom: 14 }}>{error}</div>}<div className="form-grid-2">
      <label className="form-group" style={{ margin: 0 }}><span>Amount *</span><input type="number" min="0.01" step="0.01" value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} /></label>
      <label className="form-group" style={{ margin: 0 }}><span>Date *</span><input type="date" value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} /></label>
      <label className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}><span>Paid from *</span><select value={form.sourceAccountId} onChange={event => setForm({ ...form, sourceAccountId: event.target.value })}><option value="">Choose an account</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>)}</select></label>
      <div style={{ gridColumn: '1 / -1' }}><LoanDueDateField account={source} value={form.loanDueDate} onChange={value => setForm({ ...form, loanDueDate: value })} /></div>
      <label className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}><span>Memo</span><input value={form.memo} onChange={event => setForm({ ...form, memo: event.target.value })} placeholder="Optional, for example check number" /></label>
    </div>
    {history.length > 0 && <div style={{ marginTop: 16 }}><div style={{ fontWeight: 800, color: 'var(--navy)', marginBottom: 6 }}>Earlier payments</div>{history.slice(0, 8).map(item => <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: '1px solid var(--border)' }}><span>{item.date}{item.memo ? ` · ${item.memo}` : ''}</span><strong>{money(item.amount)}</strong></div>)}</div>}
    </div>
    <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Payment'}</button></div>
  </form></div>;
};
