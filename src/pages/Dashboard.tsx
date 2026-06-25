import React, { useState } from 'react';
import { useStore, type Transaction } from '../store';
import { TrendingUp, Users, AlertCircle, Calendar, DollarSign, CheckSquare, ArrowUpRight, ArrowDownRight, Edit2, X } from 'lucide-react';
import { useT } from '../i18n';

export const Dashboard: React.FC = () => {
  const { isRtl, transactions, donors, accounts, tasks, bills, editTransaction, solaApiKey, setSolaApiKey } = useStore();
  const T = useT(isRtl);
  const [editTx, setEditTx] = useState<Transaction | null>(null);

  const totalIncomeYTD = transactions.filter(t => t.type === 'approved').reduce((s, t) => s + t.amount, 0);
  const pendingTotal = transactions.filter(t => t.type === 'pending').reduce((s, t) => s + t.amount, 0);
  const totalDonors = donors.length;
  const openTasks = tasks.filter(t => !t.completed).length;
  const urgentBills = bills.filter(b => b.status === 'urgent').length;
  const cadBalance = accounts.filter(a => a.type === 'asset' && a.currency === 'CAD').reduce((s, a) => s + a.balance, 0);
  const usdBalance = accounts.filter(a => a.type === 'asset' && a.currency === 'USD').reduce((s, a) => s + a.balance, 0);

  const stats = [
    { label: T('total_income_ytd'), value: `$${totalIncomeYTD.toLocaleString()}`, sub: '+15% from last year', icon: <TrendingUp size={22} />, color: 'var(--green)', bg: 'var(--green-bg)' },
    { label: T('total_donors'), value: String(totalDonors), sub: '+42 new this month', icon: <Users size={22} />, color: 'var(--navy-light)', bg: 'var(--blue-bg)' },
    { label: T('pending_pledges'), value: `$${pendingTotal.toLocaleString()}`, sub: 'Awaiting collection', icon: <AlertCircle size={22} />, color: 'var(--yellow)', bg: 'var(--yellow-bg)' },
    { label: T('open_tasks'), value: String(openTasks), sub: urgentBills > 0 ? `${urgentBills} ${T('urgent_bills_pl')}` : 'All bills on track', icon: <CheckSquare size={22} />, color: urgentBills > 0 ? 'var(--red)' : 'var(--green)', bg: urgentBills > 0 ? 'var(--red-bg)' : 'var(--green-bg)' },
  ];

  // Recent 6 transactions
  const recentTx = transactions.slice(0, 6);

  // Monthly comparison
  const thisMonth = new Date().toISOString().slice(0, 7);
  const lastMonth = new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().slice(0, 7);
  const thisMonthTotal = transactions.filter(t => t.type === 'approved' && t.date.startsWith(thisMonth)).reduce((s, t) => s + t.amount, 0);
  const lastMonthTotal = transactions.filter(t => t.type === 'approved' && t.date.startsWith(lastMonth)).reduce((s, t) => s + t.amount, 0);
  const monthTrend = lastMonthTotal > 0 ? ((thisMonthTotal - lastMonthTotal) / lastMonthTotal * 100).toFixed(1) : null;

  const statusColors: Record<string, string> = {
    approved: 'var(--green)', pending: 'var(--yellow)', recording: 'var(--blue)', declined: 'var(--red)'
  };
  const statusBg: Record<string, string> = {
    approved: 'var(--green-bg)', pending: 'var(--yellow-bg)', recording: 'var(--blue-bg)', declined: 'var(--red-bg)'
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Stat Cards Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
        {stats.map(stat => (
          <div key={stat.label} className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px', cursor: 'default' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>{stat.label}</div>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: stat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: stat.color }}>
                {stat.icon}
              </div>
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--navy)', fontFamily: 'Outfit, sans-serif', lineHeight: 1 }}>{stat.value}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* Middle row: Recent Transactions + Bank Accounts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '20px' }}>

        {/* Recent Transactions */}
        <div className="card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', color: 'var(--navy)' }}>{T('recent_transactions')}</h3>
            {monthTrend && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', fontWeight: 700, color: parseFloat(monthTrend) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {parseFloat(monthTrend) >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                {Math.abs(parseFloat(monthTrend))}% vs last month
              </div>
            )}
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Donor</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recentTx.map(tx => {
                  const donor = donors.find(d => d.id === tx.donorId);
                  return (
                    <tr key={tx.id}>
                      <td style={{ fontWeight: 600 }}>
                        {donor ? <a href={`/donors?donorId=${donor.id}`} style={{ color: 'var(--navy-light)', textDecoration: 'none' }}>{donor.name}</a> : '—'}
                      </td>
                      <td style={{ fontWeight: 700 }}>${tx.amount.toLocaleString()} {tx.currency}</td>
                      <td style={{ fontSize: '0.85rem', textTransform: 'capitalize', color: 'var(--text-muted)' }}>{tx.method.replace('_', ' ')}</td>
                      <td>
                        <span style={{ padding: '4px 10px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 800, background: statusBg[tx.type], color: statusColors[tx.type] }}>
                          {tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{tx.date}</td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditTx(tx)}><Edit2 size={14} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bank Accounts + Alerts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Bank Balances */}
          <div className="card" style={{ padding: '24px' }}>
            <h3 style={{ margin: '0 0 16px', fontFamily: 'Outfit, sans-serif', color: 'var(--navy)' }}>{T('bank_accounts')}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {accounts.filter(a => a.type === 'asset').map(acc => (
                <div key={acc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--bg-input)', borderRadius: '10px' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{acc.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{acc.currency} Account</div>
                  </div>
                  <div style={{ fontWeight: 800, fontFamily: 'Outfit, sans-serif', color: 'var(--navy)', fontSize: '1.05rem' }}>
                    {acc.currency === 'USD' ? 'USD ' : 'CAD '}${acc.balance.toLocaleString()}
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px 0', borderTop: '2px solid var(--navy)', fontWeight: 800, color: 'var(--navy)', fontFamily: 'Outfit, sans-serif' }}>
                <span>{T('cad_total')}</span><span>${cadBalance.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Alerts */}
          {(urgentBills > 0 || openTasks > 0) && (
            <div className="card" style={{ padding: '20px', background: 'var(--red-bg)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <AlertCircle size={20} style={{ color: 'var(--red)' }} />
                <span style={{ fontWeight: 800, color: 'var(--red)' }}>Action Required</span>
              </div>
              {urgentBills > 0 && <p style={{ margin: '0 0 6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>⚠️ {urgentBills} urgent bill{urgentBills > 1 ? 's' : ''} overdue</p>}
              {openTasks > 0 && <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>📋 {openTasks} task{openTasks > 1 ? 's' : ''} pending</p>}
            </div>
          )}
        </div>
      </div>

      {/* Bottom row: Upcoming tasks */}
      <div className="card" style={{ padding: '24px' }}>
        <h3 style={{ margin: '0 0 16px', fontFamily: 'Outfit, sans-serif', color: 'var(--navy)' }}>{T('upcoming_tasks')}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          {tasks.filter(t => !t.completed).slice(0, 3).map(task => {
            const donor = task.donorId ? donors.find(d => d.id === task.donorId) : null;
            const priorityColor: Record<string, string> = { high: 'var(--red)', medium: 'var(--yellow)', low: 'var(--green)' };
            return (
              <div key={task.id} style={{ padding: '16px', background: 'var(--bg-input)', borderRadius: '12px', border: `1px solid ${priorityColor[task.priority]}30` }}>
                <div style={{ fontWeight: 700, marginBottom: '4px' }}>{task.title}</div>
                {donor && <div style={{ fontSize: '0.8rem', color: 'var(--navy-light)', marginBottom: '4px' }}>👤 {donor.name}</div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Due: {task.dueDate}</div>
                  <span style={{ fontSize: '0.7rem', fontWeight: 800, color: priorityColor[task.priority], background: `${priorityColor[task.priority]}15`, padding: '2px 8px', borderRadius: '999px', textTransform: 'uppercase' }}>{task.priority}</span>
                </div>
              </div>
            );
          })}
          {tasks.filter(t => !t.completed).length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--green)', padding: '20px' }}>{T('all_tasks_done')}</div>
          )}
        </div>
      </div>

      {/* Settings Row */}
      <div className="card" style={{ padding: '24px' }}>
        <h3 style={{ margin: '0 0 16px', fontFamily: 'Outfit, sans-serif', color: 'var(--navy)' }}>System Settings & Integrations</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {/* Sola Payments API Key */}
          <div style={{ background: 'var(--bg-input)', padding: '16px', borderRadius: '12px' }}>
            <h4 style={{ margin: '0 0 8px', color: 'var(--navy)' }}>Sola Payments API</h4>
            <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Enter your Sola Reporting API key to enable live synchronization.</p>
            <input 
              type="password" 
              placeholder="e.g. sk_live_..." 
              value={solaApiKey} 
              onChange={e => setSolaApiKey(e.target.value)} 
              style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', fontFamily: 'monospace' }}
            />
          </div>
        </div>
      </div>

      {/* Edit Transaction Modal */}
      {editTx && (
        <div className="modal-overlay" onClick={() => setEditTx(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ margin: 0 }}>Edit Transaction</h2>
              <button className="modal-close" onClick={() => setEditTx(null)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gap: '16px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Amount</label>
                  <input type="number" value={editTx.amount} onChange={e => setEditTx({ ...editTx, amount: parseFloat(e.target.value) || 0 })} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Status</label>
                    <select value={editTx.type} onChange={e => setEditTx({ ...editTx, type: e.target.value as any })}>
                      <option value="approved">Approved</option>
                      <option value="pending">Pending</option>
                      <option value="recording">Recording / Pledge</option>
                      <option value="declined">Declined</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Method</label>
                      <select value={editTx.method} onChange={e => setEditTx({ ...editTx, method: e.target.value as any })}>
                        <option value="credit_card">Credit Card</option>
                        <option value="check">Check</option>
                        <option value="cash">Cash</option>
                        <option value="e_transfer">E-Transfer</option>
                        <option value="vouchers">Vouchers</option>
                        <option value="eizer">Eizer</option>
                        <option value="bnei_leivy">Bnei Leivy</option>
                        <option value="other">Other</option>
                      </select>
                  </div>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Date</label>
                  <input type="date" value={editTx.date} onChange={e => setEditTx({ ...editTx, date: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditTx(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => { editTransaction(editTx.id, editTx); setEditTx(null); }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
