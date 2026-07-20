import React, { useState } from 'react';
import { useStore } from '../store';
import {
  BarChart3, TrendingUp, Users, AlertCircle, FileText,
  ChevronDown, ChevronRight, Download, Folder
} from 'lucide-react';

type ReportTab = 'monthly' | 'open_pledges' | 'by_fundraiser' | 'by_category' | 'by_donor' | 'by_project' | 'tax_summary';

export const Reports: React.FC = () => {
  const { transactions, donors, fundraisers, recurringPayments, bills, projects } = useStore();
  const [tab, setTab] = useState<ReportTab>('monthly');
  const [expandedDonor, setExpandedDonor] = useState<string | null>(null);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

  // ── Monthly Actual Income (approved only) ──────────────────────
  const monthlyData = (() => {
    const months: Record<string, number> = {};
    transactions.filter(t => t.type === 'approved').forEach(t => {
      const key = t.date.slice(0, 7); // YYYY-MM
      months[key] = (months[key] || 0) + t.amount;
    });
    return Object.entries(months).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);
  })();
  const maxMonthly = Math.max(...monthlyData.map(([, v]) => v), 1);

  // ── Open Pledges (not pending/recording — need manual follow-up) ──
  const openPledges = donors.filter(d => d.balanceOwed > 0).map(d => {
    const hasPending = transactions.some(t => t.donorId === d.id && t.type === 'pending');
    return { donor: d, hasCoverage: hasPending };
  }).filter(x => !x.hasCoverage);

  // ── By Fundraiser ──────────────────────────────────────────────
  const byFundraiser = fundraisers.map(f => {
    const txs = transactions.filter(t => t.fundraiserId === f.id && t.type === 'approved');
    const totalRaised = txs.reduce((s, t) => s + t.amount, 0);
    const commission = totalRaised * (f.percentage / 100);
    return { ...f, totalRaised, commission };
  }).sort((a, b) => b.totalRaised - a.totalRaised);

  // ── By Category ───────────────────────────────────────────────
  const byCategory = (() => {
    const cats: Record<string, number> = {};
    transactions.filter(t => t.type === 'approved' && t.category).forEach(t => {
      cats[t.category!] = (cats[t.category!] || 0) + t.amount;
    });
    return Object.entries(cats).sort((a, b) => b[1] - a[1]);
  })();
  const maxCat = Math.max(...byCategory.map(([, v]) => v), 1);

  // ── By Donor ──────────────────────────────────────────────────
  const byDonor = donors.map(d => {
    const approved = transactions.filter(t => t.donorId === d.id && t.type === 'approved');
    const years = [...new Set(approved.map(t => t.date.slice(0, 4)))].sort((a, b) => b.localeCompare(a));
    return { donor: d, approved, years };
  }).filter(x => x.approved.length > 0).sort((a, b) => b.donor.totalGiven - a.donor.totalGiven);

  // ── By Project ────────────────────────────────────────────────
  const byProject = projects.map(p => {
    const incomeTxs = transactions.filter(t => t.projectId === p.id && t.type === 'approved');
    const costBills = bills.filter(b => b.projectId === p.id);
    const income = incomeTxs.reduce((s, t) => s + t.amount, 0);
    const cost = costBills.reduce((s, b) => s + b.amount, 0);
    return { project: p, income, cost, net: income - cost, incomeTxs, costBills };
  }).filter(p => p.income > 0 || p.cost > 0).sort((a, b) => b.cost - a.cost);

  // ── Tax Summary (Taxable Expenses) ──────────────────────────────
  const taxSummaryByYear = (() => {
    const years: Record<string, number> = {};
    bills.filter(b => b.taxable).forEach(b => {
      const year = b.dueDate.slice(0, 4);
      years[year] = (years[year] || 0) + b.amount;
    });
    return Object.entries(years).sort((a, b) => b[0].localeCompare(a[0]));
  })();

  const TABS: [ReportTab, string, React.ReactNode][] = [
    ['monthly', 'Monthly Income', <TrendingUp size={16} />],
    ['open_pledges', 'Open Pledges', <AlertCircle size={16} />],
    ['by_fundraiser', 'By Fundraiser', <Users size={16} />],
    ['by_category', 'By Category', <BarChart3 size={16} />],
    ['by_donor', 'Donor History', <FileText size={16} />],
    ['by_project', 'Project Costs', <Folder size={16} />],
    ['tax_summary', 'Tax Summary', <FileText size={16} />],
  ];

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '28px', flexWrap: 'wrap' }}>
        {TABS.map(([key, label, icon]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 18px', borderRadius: '999px', cursor: 'pointer',
            fontFamily: 'inherit', fontWeight: 700, fontSize: '0.9rem', transition: 'all 0.2s',
            background: tab === key ? 'linear-gradient(135deg, var(--navy-light), var(--navy))' : 'var(--bg-card)',
            color: tab === key ? '#fff' : 'var(--text-secondary)',
            boxShadow: tab === key ? '0 4px 16px rgba(37,99,235,0.3)' : 'var(--shadow-sm)',
            border: tab === key ? '2px solid transparent' : '1px solid var(--border)',
            outline: 'none',
          }}>{icon}{label}</button>
        ))}
      </div>

      {/* ── Monthly Income ── */}
      {tab === 'monthly' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div>
              <h2 style={{ margin: '0 0 4px', fontFamily: 'Outfit, sans-serif', color: 'var(--navy)' }}>Monthly Actual Income</h2>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>Approved payments only — excludes pending and recording</p>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {monthlyData.map(([month, total], i) => {
              const prev = monthlyData[i + 1]?.[1] || 0;
              const change = prev > 0 ? ((total - prev) / prev * 100).toFixed(1) : null;
              return (
                <div key={month} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 120px 80px', gap: '16px', alignItems: 'center' }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    {new Date(month + '-01').toLocaleDateString('en-CA', { month: 'short', year: 'numeric' })}
                  </div>
                  <div style={{ background: 'var(--bg-input)', borderRadius: '999px', height: '10px', overflow: 'hidden' }}>
                    <div style={{ width: `${(total / maxMonthly * 100).toFixed(1)}%`, height: '100%', background: 'linear-gradient(90deg, var(--navy-light), var(--navy))', borderRadius: '999px', transition: 'width 0.6s' }} />
                  </div>
                  <div style={{ fontWeight: 800, color: 'var(--navy)', fontFamily: 'Outfit, sans-serif', textAlign: 'right' }}>
                    ${total.toLocaleString()}
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '0.8rem', fontWeight: 700, color: change && parseFloat(change) > 0 ? 'var(--green)' : 'var(--red)' }}>
                    {change ? `${parseFloat(change) > 0 ? '▲' : '▼'} ${Math.abs(parseFloat(change))}%` : '—'}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '2px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontFamily: 'Outfit, sans-serif', fontWeight: 800, color: 'var(--navy)', fontSize: '1.1rem' }}>
            <span>Total (All Time)</span>
            <span>${transactions.filter(t => t.type === 'approved').reduce((s, t) => s + t.amount, 0).toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* ── Open Pledges ── */}
      {tab === 'open_pledges' && (
        <div className="card">
          <div style={{ marginBottom: '20px' }}>
            <h2 style={{ margin: '0 0 4px', fontFamily: 'Outfit, sans-serif', color: 'var(--navy)' }}>Open Pledges — Action Required</h2>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>Donors with a balance NOT covered by pending or recurring — requires personal follow-up</p>
          </div>
          {openPledges.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px', color: 'var(--green)', fontSize: '1.1rem' }}>
              ✅ All outstanding balances are covered by pending/recording payments!
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead><tr><th>Donor</th><th>Phone</th><th>Open Balance</th><th>Action</th></tr></thead>
                <tbody>
                  {openPledges.map(({ donor }) => (
                    <tr key={donor.id}>
                      <td>
                        <div className="member-info">
                          <div className="member-avatar" style={{ width: '36px', height: '36px', fontSize: '0.85rem' }}>
                            {donor.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </div>
                          <div className="member-name">{donor.name}</div>
                        </div>
                      </td>
                      <td>{donor.phone}</td>
                      <td><span style={{ fontWeight: 800, color: 'var(--red)', fontFamily: 'Outfit, sans-serif', fontSize: '1.05rem' }}>${donor.balanceOwed.toLocaleString()}</span></td>
                      <td>
                        <span className="badge" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>📞 Follow Up</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ marginTop: '20px', padding: '16px', background: 'var(--red-bg)', borderRadius: '12px', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, color: 'var(--red)' }}>Total Open Balance</span>
            <span style={{ fontWeight: 800, color: 'var(--red)', fontFamily: 'Outfit, sans-serif' }}>
              ${openPledges.reduce((s, { donor }) => s + donor.balanceOwed, 0).toLocaleString()}
            </span>
          </div>
        </div>
      )}

      {/* ── By Fundraiser ── */}
      {tab === 'by_fundraiser' && (
        <div className="card">
          <h2 style={{ margin: '0 0 20px', fontFamily: 'Outfit, sans-serif', color: 'var(--navy)' }}>Performance by Fundraiser</h2>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Fundraiser</th>
                  <th>Commission %</th>
                  <th>Total Raised</th>
                  <th>Commission Earned</th>
                  <th>Currently Owed</th>
                </tr>
              </thead>
              <tbody>
                {byFundraiser.map(f => (
                  <tr key={f.id}>
                    <td>
                      <div className="member-info">
                        <div className="member-avatar" style={{ width: '36px', height: '36px', fontSize: '0.85rem' }}>
                          {f.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div className="member-name">{f.name}</div>
                          <div className="member-email">{f.email}</div>
                        </div>
                      </div>
                    </td>
                    <td><span className="badge badge-gold">{f.percentage}%</span></td>
                    <td style={{ fontWeight: 700, color: 'var(--green)' }}>${f.totalRaised.toLocaleString()}</td>
                    <td style={{ fontWeight: 700, color: 'var(--navy)' }}>${f.commission.toLocaleString()}</td>
                    <td style={{ fontWeight: 800, color: f.balanceOwed > 0 ? 'var(--yellow)' : 'var(--green)' }}>
                      {f.balanceOwed > 0 ? `$${f.balanceOwed.toLocaleString()}` : '✅ Paid'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── By Category ── */}
      {tab === 'by_category' && (
        <div className="card">
          <h2 style={{ margin: '0 0 20px', fontFamily: 'Outfit, sans-serif', color: 'var(--navy)' }}>Income by Donation Category</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {byCategory.map(([cat, total]) => (
              <div key={cat} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 120px', gap: '16px', alignItems: 'center' }}>
                <div style={{ fontWeight: 700, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{cat}</div>
                <div style={{ background: 'var(--bg-input)', borderRadius: '999px', height: '12px', overflow: 'hidden' }}>
                  <div style={{ width: `${(total / maxCat * 100).toFixed(1)}%`, height: '100%', background: 'linear-gradient(90deg, var(--gold-light), var(--gold))', borderRadius: '999px' }} />
                </div>
                <div style={{ fontWeight: 800, color: 'var(--navy)', fontFamily: 'Outfit, sans-serif', textAlign: 'right' }}>
                  ${total.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '2px solid var(--navy)', display: 'flex', justifyContent: 'space-between', fontFamily: 'Outfit, sans-serif', fontWeight: 800, color: 'var(--navy)' }}>
            <span>Grand Total</span>
            <span>${byCategory.reduce((s, [, v]) => s + v, 0).toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* ── Donor History ── */}
      {tab === 'by_donor' && (
        <div className="card">
          <h2 style={{ margin: '0 0 20px', fontFamily: 'Outfit, sans-serif', color: 'var(--navy)' }}>Full Donor History</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {byDonor.map(({ donor, approved, years }) => (
              <div key={donor.id} style={{ border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', cursor: 'pointer', background: expandedDonor === donor.id ? 'var(--navy-bg)' : 'var(--bg-card)' }}
                  onClick={() => setExpandedDonor(expandedDonor === donor.id ? null : donor.id)}
                >
                  <div className="member-info">
                    <div className="member-avatar" style={{ width: '40px', height: '40px', fontSize: '0.9rem' }}>
                      {donor.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <div className="member-name">{donor.name}</div>
                      <div className="member-email">{donor.phone}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, color: 'var(--green)', fontFamily: 'Outfit, sans-serif' }}>${donor.totalGiven.toLocaleString()}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Given</div>
                    </div>
                    {expandedDonor === donor.id ? <ChevronDown size={18} style={{ color: 'var(--navy-light)' }} /> : <ChevronRight size={18} style={{ color: 'var(--text-muted)' }} />}
                  </div>
                </div>
                {expandedDonor === donor.id && (
                  <div style={{ padding: '0 20px 20px', background: 'var(--bg-input)' }}>
                    {years.map(year => {
                      const yearTxs = approved.filter(t => t.date.startsWith(year));
                      const yearTotal = yearTxs.reduce((s, t) => s + t.amount, 0);
                      return (
                        <div key={year} style={{ marginTop: '16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <div style={{ fontWeight: 800, color: 'var(--navy)', fontSize: '1rem' }}>📅 {year}</div>
                            <div style={{ fontWeight: 800, color: 'var(--green)', fontFamily: 'Outfit, sans-serif' }}>${yearTotal.toLocaleString()}</div>
                          </div>
                          <table style={{ margin: 0 }}>
                            <thead>
                              <tr>
                                <th style={{ padding: '8px 12px', fontSize: '0.75rem' }}>Date</th>
                                <th style={{ padding: '8px 12px', fontSize: '0.75rem' }}>Amount</th>
                                <th style={{ padding: '8px 12px', fontSize: '0.75rem' }}>Method</th>
                                <th style={{ padding: '8px 12px', fontSize: '0.75rem' }}>Category</th>
                              </tr>
                            </thead>
                            <tbody>
                              {yearTxs.map(t => (
                                <tr key={t.id}>
                                  <td style={{ padding: '8px 12px', fontSize: '0.85rem' }}>{t.date}</td>
                                  <td style={{ padding: '8px 12px', fontWeight: 700 }}>${t.amount.toLocaleString()} {t.currency}</td>
                                  <td style={{ padding: '8px 12px', fontSize: '0.85rem', textTransform: 'capitalize' }}>{t.method.replace('_', ' ')}</td>
                                  <td style={{ padding: '8px 12px', fontSize: '0.85rem' }}>{t.category || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── By Project ── */}
      {tab === 'by_project' && (
        <div className="card">
          <h2 style={{ margin: '0 0 20px', fontFamily: 'Outfit, sans-serif', color: 'var(--navy)' }}>Project Costs & Income</h2>
          {byProject.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              No expenses or income tracked to projects yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {byProject.map(p => (
                <div key={p.project.id} style={{ border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
                  <div
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', cursor: 'pointer', background: expandedProject === p.project.id ? 'var(--navy-bg)' : 'var(--bg-card)' }}
                    onClick={() => setExpandedProject(expandedProject === p.project.id ? null : p.project.id)}
                  >
                    <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--navy)' }}>{p.project.name}</div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, color: 'var(--red)', fontSize: '0.9rem' }}>Costs: ${p.cost.toLocaleString('en-CA', { minimumFractionDigits: 2 })}</div>
                        <div style={{ fontWeight: 700, color: 'var(--green)', fontSize: '0.9rem' }}>Income: ${p.income.toLocaleString('en-CA', { minimumFractionDigits: 2 })}</div>
                      </div>
                      <div style={{ textAlign: 'right', width: '120px' }}>
                        <div style={{ fontWeight: 800, color: p.net >= 0 ? 'var(--green)' : 'var(--red)', fontFamily: 'Outfit, sans-serif' }}>
                          {p.net >= 0 ? '+' : '-'}${Math.abs(p.net).toLocaleString('en-CA', { minimumFractionDigits: 2 })}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Net Balance</div>
                      </div>
                      {expandedProject === p.project.id ? <ChevronDown size={18} style={{ color: 'var(--navy-light)' }} /> : <ChevronRight size={18} style={{ color: 'var(--text-muted)' }} />}
                    </div>
                  </div>

                  {expandedProject === p.project.id && (
                    <div style={{ padding: '0 20px 20px', background: 'var(--bg-input)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '16px' }}>
                        
                        {/* Costs Table */}
                        <div>
                          <div style={{ fontWeight: 800, color: 'var(--red)', marginBottom: '8px' }}>Expenses (Costs)</div>
                          {p.costBills.length === 0 ? (
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No expenses linked.</div>
                          ) : (
                            <table style={{ margin: 0, fontSize: '0.85rem' }}>
                              <thead><tr><th>Date</th><th>Vendor</th><th>Amount</th></tr></thead>
                              <tbody>
                                {p.costBills.sort((a, b) => b.dueDate.localeCompare(a.dueDate)).map(b => (
                                  <tr key={b.id}>
                                    <td style={{ padding: '6px 8px' }}>{b.dueDate}</td>
                                    <td style={{ padding: '6px 8px' }}>{b.vendor}</td>
                                    <td style={{ padding: '6px 8px', fontWeight: 700, color: 'var(--red)' }}>${b.amount.toLocaleString()}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>

                        {/* Income Table */}
                        <div>
                          <div style={{ fontWeight: 800, color: 'var(--green)', marginBottom: '8px' }}>Donations (Income)</div>
                          {p.incomeTxs.length === 0 ? (
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No donations linked.</div>
                          ) : (
                            <table style={{ margin: 0, fontSize: '0.85rem' }}>
                              <thead><tr><th>Date</th><th>Method</th><th>Amount</th></tr></thead>
                              <tbody>
                                {p.incomeTxs.sort((a, b) => b.date.localeCompare(a.date)).map(t => (
                                  <tr key={t.id}>
                                    <td style={{ padding: '6px 8px' }}>{t.date}</td>
                                    <td style={{ padding: '6px 8px', textTransform: 'capitalize' }}>{t.method.replace('_', ' ')}</td>
                                    <td style={{ padding: '6px 8px', fontWeight: 700, color: 'var(--green)' }}>${t.amount.toLocaleString()}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>

                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tax Summary ── */}
      {tab === 'tax_summary' && (
        <div className="card">
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ margin: '0 0 4px', fontFamily: 'Outfit, sans-serif', color: 'var(--navy)' }}>Tax Summary</h2>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>Summary of total taxable expenses per year.</p>
          </div>
          
          {taxSummaryByYear.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              No taxable expenses found.
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Year</th>
                    <th>Total Taxable Amount</th>
                    <th>Estimated GST (5%)</th>
                    <th>Estimated QST (9.975%)</th>
                  </tr>
                </thead>
                <tbody>
                  {taxSummaryByYear.map(([year, total]) => (
                    <tr key={year}>
                      <td style={{ fontWeight: 700 }}>{year}</td>
                      <td>${total.toLocaleString('en-CA', { minimumFractionDigits: 2 })}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>${(total * 0.05).toLocaleString('en-CA', { minimumFractionDigits: 2 })}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>${(total * 0.09975).toLocaleString('en-CA', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
