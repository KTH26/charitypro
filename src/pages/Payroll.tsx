import React, { useState } from 'react';
import { useStore } from '../store';
import { Users, User, FileText, Download, Plus, Check, Trash2, Edit2 } from 'lucide-react';

export const Payroll: React.FC = () => {
  const { employees, fundraisers, t4aSlips, addEmployee, payPayrollEntity, addT4A, accruePayroll, bills, accounts, addBill, markBillPaid, editEmployee, deleteEmployee } = useStore();
  const [activeTab, setActiveTab] = useState<'employees' | 'fundraisers' | 't4a' | 'schedules'>('employees');

  const { deleteBills, editBill, deleteRecurringPayroll, toggleRecurringPayroll, recurringPayroll } = useStore();

  const [showAddEmp, setShowAddEmp] = useState(false);
  const [empForm, setEmpForm] = useState({ name: '', role: '', email: '' });
  
  const [showEditEmp, setShowEditEmp] = useState<{ id: string, name: string, role: string, email: string } | null>(null);

  const [showPay, setShowPay] = useState(false);
  const [payTarget, setPayTarget] = useState<{ id: string, type: 'employee' | 'fundraiser', name: string, balance: number } | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [paySourceAccount, setPaySourceAccount] = useState('');

  const [showT4A, setShowT4A] = useState(false);
  const [t4aTarget, setT4ATarget] = useState<{ id: string, type: 'employee' | 'fundraiser', name: string } | null>(null);
  const [t4aYear, setT4AYear] = useState(new Date().getFullYear());
  const [t4aBox48, setT4ABox48] = useState('');

  const [showAccrue, setShowAccrue] = useState(false);
  const [accrueTarget, setAccrueTarget] = useState<{ id: string, type: 'employee' | 'fundraiser', name: string } | null>(null);
  const [accrueAmount, setAccrueAmount] = useState('');
  const [earningType, setEarningType] = useState('Salary');
  const [payT4aEligible, setPayT4aEligible] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState<'weekly' | 'biweekly' | 'monthly'>('monthly');
  const [recurringStartDate, setRecurringStartDate] = useState(new Date().toISOString().split('T')[0]);

  const [showLedger, setShowLedger] = useState<{ id: string, type: 'employee' | 'fundraiser', name: string } | null>(null);

  const handleAddEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    addEmployee(empForm);
    setShowAddEmp(false);
    setEmpForm({ name: '', role: '', email: '' });
  };

  const handleEditEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!showEditEmp) return;
    editEmployee(showEditEmp.id, { name: showEditEmp.name, role: showEditEmp.role, email: showEditEmp.email });
    setShowEditEmp(null);
  };

  const handlePay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payTarget || !payAmount || !paySourceAccount) return;
    
    const amount = parseFloat(payAmount);
    
    // Create a new "Paid" bill so it shows in the ledger
    const billId = addBill({
      vendor: `Payroll: ${payTarget.name}`,
      amount,
      dueDate: new Date().toISOString().split('T')[0],
      status: 'pending',
      category: 'Payroll Expense',
      t4aEligible: payT4aEligible
    });
    
    // Paying it will deduct from the bank AND reduce balanceOwed!
    markBillPaid(billId, paySourceAccount, 'Payroll Expense');

    setShowPay(false);
    setPayTarget(null);
    setPayAmount('');
    setPaySourceAccount('');
    setPayT4aEligible(false);
  };

  const handleAccrue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accrueTarget || !accrueAmount) return;
    
    if (isRecurring) {
      useStore.getState().addRecurringPayroll({
        entityId: accrueTarget.id,
        type: accrueTarget.type,
        amount: parseFloat(accrueAmount),
        earningType,
        t4aEligible: false,
        frequency: recurringFrequency,
        startDate: recurringStartDate,
        nextDate: recurringStartDate,
        active: true
      });
      useStore.getState().processRecurringPayroll();
    } else {
      accruePayroll(accrueTarget.id, accrueTarget.type, parseFloat(accrueAmount), earningType, false);
    }

    setShowAccrue(false);
    setAccrueTarget(null);
    setAccrueAmount('');
    setEarningType('Salary');
    setIsRecurring(false);
    setRecurringFrequency('monthly');
    setRecurringStartDate(new Date().toISOString().split('T')[0]);
  };

  const handleGenerateT4A = (e: React.FormEvent) => {
    e.preventDefault();
    if (!t4aTarget || !t4aBox48) return;
    addT4A({
      entityId: t4aTarget.id,
      entityType: t4aTarget.type,
      year: t4aYear,
      box48Amount: parseFloat(t4aBox48),
    });
    setShowT4A(false);
    setT4ATarget(null);
    setT4ABox48('');
    setActiveTab('t4a');
  };

  return (
    <div style={{ display: 'grid', gap: '24px' }}>
      <div className="card" style={{ padding: '0' }}>
        
        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-input)', borderTopLeftRadius: '12px', borderTopRightRadius: '12px', overflowX: 'auto' }}>
          <button
            onClick={() => setActiveTab('employees')}
            style={{
              padding: '16px 24px', background: activeTab === 'employees' ? 'var(--bg)' : 'transparent',
              border: 'none', borderBottom: activeTab === 'employees' ? '2px solid var(--navy)' : '2px solid transparent',
              color: activeTab === 'employees' ? 'var(--navy)' : 'var(--text-muted)', fontWeight: activeTab === 'employees' ? 700 : 500,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px'
            }}
          >
            <User size={16} /> Office Staff
          </button>
          <button
            onClick={() => setActiveTab('fundraisers')}
            style={{
              padding: '16px 24px', background: activeTab === 'fundraisers' ? 'var(--bg)' : 'transparent',
              border: 'none', borderBottom: activeTab === 'fundraisers' ? '2px solid var(--navy)' : '2px solid transparent',
              color: activeTab === 'fundraisers' ? 'var(--navy)' : 'var(--text-muted)', fontWeight: activeTab === 'fundraisers' ? 700 : 500,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px'
            }}
          >
            <Users size={16} /> Fundraisers / Contractors
          </button>
          <button
            onClick={() => setActiveTab('t4a')}
            style={{
              padding: '16px 24px', background: activeTab === 't4a' ? 'var(--bg)' : 'transparent',
              border: 'none', borderBottom: activeTab === 't4a' ? '2px solid var(--purple)' : '2px solid transparent',
              color: activeTab === 't4a' ? 'var(--purple)' : 'var(--text-muted)', fontWeight: activeTab === 't4a' ? 700 : 500,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px'
            }}
          >
            <FileText size={16} /> T4A Tax Slips
          </button>
          <button
            onClick={() => setActiveTab('schedules')}
            style={{
              padding: '16px 24px', background: activeTab === 'schedules' ? 'var(--bg)' : 'transparent',
              border: 'none', borderBottom: activeTab === 'schedules' ? '2px solid var(--green)' : '2px solid transparent',
              color: activeTab === 'schedules' ? 'var(--green)' : 'var(--text-muted)', fontWeight: activeTab === 'schedules' ? 700 : 500,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px'
            }}
          >
            <Check size={16} /> Recurring Schedules
          </button>
        </div>

        <div style={{ padding: '24px' }}>
          {activeTab === 'employees' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ margin: 0, color: 'var(--navy)' }}>Office Staff Payroll</h2>
                <button className="btn btn-primary" onClick={() => setShowAddEmp(true)}><Plus size={16}/> Add Employee</button>
              </div>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Email</th>
                      <th>Balance Owed</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map(e => (
                      <tr key={e.id} onClick={() => setShowLedger({ id: e.id, type: 'employee', name: e.name })} style={{ cursor: 'pointer', transition: 'background 0.2s' }} className="hover-bg-input">
                        <td style={{ fontWeight: 600 }}>{e.name}</td>
                        <td>{e.role}</td>
                        <td>{e.email || '-'}</td>
                        <td style={{ fontWeight: 700, color: 'var(--red)' }}>${e.balanceOwed.toFixed(2)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button className="btn btn-primary btn-sm" onClick={(ev) => { ev.stopPropagation(); setAccrueTarget({ id: e.id, type: 'employee', name: e.name }); setShowAccrue(true); }}>Add Earnings</button>
                            <button className="btn btn-secondary btn-sm" onClick={(ev) => { ev.stopPropagation(); setPayTarget({ id: e.id, type: 'employee', name: e.name, balance: e.balanceOwed }); setShowPay(true); }}>Record Payment</button>
                            <button className="btn btn-ghost btn-sm" onClick={(ev) => { 
                              ev.stopPropagation(); 
                              setT4ATarget({ id: e.id, type: 'employee', name: e.name }); 
                              const t4aSum = bills.filter(b => b.vendor === `Payroll: ${e.name}` && b.t4aEligible && b.dueDate.startsWith(t4aYear.toString())).reduce((s, b) => s + b.amount, 0);
                              setT4ABox48(t4aSum > 0 ? t4aSum.toString() : '');
                              setShowT4A(true); 
                            }}>Generate T4A</button>
                            <button className="btn btn-ghost btn-sm" onClick={(ev) => { ev.stopPropagation(); setShowEditEmp({ id: e.id, name: e.name, role: e.role, email: e.email || '' }); }} title="Edit Employee">
                              <Edit2 size={14} style={{ color: 'var(--navy)' }} />
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={(ev) => { 
                              ev.stopPropagation(); 
                              if (window.confirm(`Are you sure you want to delete ${e.name}? This will remove them from the payroll system.`)) {
                                deleteEmployee(e.id);
                              }
                            }} title="Delete Employee">
                              <Trash2 size={14} style={{ color: 'var(--red)' }} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {employees.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>No office staff added.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {activeTab === 'fundraisers' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ margin: 0, color: 'var(--navy)' }}>Fundraisers Ledger</h2>
              </div>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Commission %</th>
                      <th>Internal Balance (Accrued)</th>
                      <th>Balance Owed</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fundraisers.map(f => (
                      <tr key={f.id} onClick={() => setShowLedger({ id: f.id, type: 'fundraiser', name: f.name })} style={{ cursor: 'pointer', transition: 'background 0.2s' }} className="hover-bg-input">
                        <td style={{ fontWeight: 600 }}>{f.name}</td>
                        <td>{f.percentage}%</td>
                        <td style={{ color: 'var(--navy)', fontWeight: 600 }}>${(f.internalAccountBalance || 0).toFixed(2)}</td>
                        <td style={{ fontWeight: 700, color: 'var(--red)' }}>${f.balanceOwed.toFixed(2)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button className="btn btn-primary btn-sm" onClick={(ev) => { ev.stopPropagation(); setAccrueTarget({ id: f.id, type: 'fundraiser', name: f.name }); setShowAccrue(true); }}>Add Earnings</button>
                            <button className="btn btn-secondary btn-sm" onClick={(ev) => { ev.stopPropagation(); setPayTarget({ id: f.id, type: 'fundraiser', name: f.name, balance: f.balanceOwed }); setShowPay(true); }}>Record Payment</button>
                            <button className="btn btn-ghost btn-sm" onClick={(ev) => { 
                              ev.stopPropagation(); 
                              setT4ATarget({ id: f.id, type: 'fundraiser', name: f.name }); 
                              const t4aSum = bills.filter(b => b.vendor === `Payroll: ${f.name}` && b.t4aEligible && b.dueDate.startsWith(t4aYear.toString())).reduce((s, b) => s + b.amount, 0);
                              setT4ABox48(t4aSum > 0 ? t4aSum.toString() : '');
                              setShowT4A(true); 
                            }}>Generate T4A</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {activeTab === 't4a' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                  <h2 style={{ margin: 0, color: 'var(--navy)' }}>T4A Tax Slips</h2>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>Year-end export for your accountant. Box 48: Fees for Services.</div>
                </div>
                <button className="btn btn-secondary"><Download size={16} /> Export to Accountant</button>
              </div>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Tax Year</th>
                      <th>Entity Type</th>
                      <th>Recipient Name</th>
                      <th>Box 48 (Fee for Service)</th>
                      <th>Date Issued</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t4aSlips.map(t => {
                      const entityName = t.entityType === 'employee' 
                        ? employees.find(e => e.id === t.entityId)?.name 
                        : fundraisers.find(f => f.id === t.entityId)?.name;
                      
                      return (
                        <tr key={t.id}>
                          <td style={{ fontWeight: 600 }}>{t.year}</td>
                          <td style={{ textTransform: 'capitalize' }}>{t.entityType}</td>
                          <td style={{ fontWeight: 600 }}>{entityName || 'Unknown'}</td>
                          <td style={{ fontWeight: 700, color: 'var(--purple)' }}>${t.box48Amount.toFixed(2)}</td>
                          <td>{t.issuedDate}</td>
                        </tr>
                      );
                    })}
                    {t4aSlips.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>No T4A slips generated yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {activeTab === 'schedules' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ margin: 0, color: 'var(--navy)' }}>Recurring Payroll Schedules</h2>
              </div>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Entity</th>
                      <th>Type</th>
                      <th>Frequency</th>
                      <th>Start Date</th>
                      <th>Next Date</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                      <th style={{ textAlign: 'right' }}>Status</th>
                      <th style={{ textAlign: 'right', width: '100px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recurringPayroll.map(r => {
                      const entity = r.type === 'employee' ? employees.find(e => e.id === r.entityId) : fundraisers.find(f => f.id === r.entityId);
                      return (
                        <tr key={r.id}>
                          <td style={{ fontWeight: 600 }}>{entity?.name || 'Unknown'}</td>
                          <td style={{ textTransform: 'capitalize' }}>{r.type}</td>
                          <td style={{ textTransform: 'capitalize' }}>{r.frequency}</td>
                          <td>{r.startDate}</td>
                          <td>{r.nextDate}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>${r.amount.toFixed(2)}</td>
                          <td style={{ textAlign: 'right' }}>
                            <button onClick={() => toggleRecurringPayroll(r.id)} className={`badge ${r.active ? 'badge-green' : 'badge-yellow'}`} style={{ border: 'none', cursor: 'pointer' }}>
                              {r.active ? 'Active' : 'Paused'}
                            </button>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => deleteRecurringPayroll(r.id)} style={{ color: 'var(--red)' }}>
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {recurringPayroll.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>No recurring schedules found.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Add Employee Modal */}
      {showAddEmp && (
        <div className="modal-overlay" onClick={() => setShowAddEmp(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Office Staff</h2>
              <button className="modal-close" onClick={() => setShowAddEmp(false)}>✕</button>
            </div>
            <form onSubmit={handleAddEmployee} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group"><label>Name</label><input type="text" required value={empForm.name} onChange={e => setEmpForm({...empForm, name: e.target.value})} /></div>
              <div className="form-group"><label>Role / Title</label><input type="text" required value={empForm.role} onChange={e => setEmpForm({...empForm, role: e.target.value})} /></div>
              <div className="form-group"><label>Email (Optional)</label><input type="email" value={empForm.email} onChange={e => setEmpForm({...empForm, email: e.target.value})} /></div>
              <div className="modal-footer" style={{ marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddEmp(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Employee</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {showPay && payTarget && (
        <div className="modal-overlay" onClick={() => setShowPay(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Record Payment to {payTarget.name}</h2>
              <button className="modal-close" onClick={() => setShowPay(false)}>✕</button>
            </div>
            <form onSubmit={handlePay} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: 'var(--bg-input)', padding: '16px', borderRadius: '8px' }}>
                <div>Current Balance Owed: <strong>${payTarget.balance.toFixed(2)}</strong></div>
              </div>
              <div className="form-group">
                <label>Paid From Bank Account</label>
                <select value={paySourceAccount} required onChange={e => setPaySourceAccount(e.target.value)}>
                  <option value="">-- Select Bank Account --</option>
                  {accounts.filter(a => a.type === 'asset').map(a => (
                    <option key={a.id} value={a.id}>{a.name} (${a.balance.toFixed(2)})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Amount Paid ($)</label>
                <input type="number" step="0.01" required value={payAmount} onChange={e => setPayAmount(e.target.value)} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '8px' }}>
                <input type="checkbox" checked={payT4aEligible} onChange={e => setPayT4aEligible(e.target.checked)} style={{ width: 16, height: 16 }} />
                <span>Include this payment in T4A (Box 48 Eligible)</span>
              </label>
              <div className="modal-footer" style={{ marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowPay(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Record Payment</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Earnings Modal */}
      {showAccrue && accrueTarget && (
        <div className="modal-overlay" onClick={() => setShowAccrue(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Earnings for {accrueTarget.name}</h2>
              <button className="modal-close" onClick={() => setShowAccrue(false)}>✕</button>
            </div>
            <form onSubmit={handleAccrue} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: 'var(--blue-bg)', padding: '16px', borderRadius: '8px', border: '1px solid var(--blue)' }}>
                <div style={{ color: 'var(--navy)' }}>This will add to the balance owed to this {accrueTarget.type}.</div>
              </div>
              <div className="form-group">
                <label>Earning Type</label>
                <select value={earningType} onChange={e => setEarningType(e.target.value)}>
                  <option value="Salary">Salary / Base</option>
                  <option value="Hourly">Hourly</option>
                  <option value="Bonus">Bonus</option>
                  <option value="Tip">Tip</option>
                  <option value="Commission">Commission</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label>Earnings Amount ($)</label>
                <input type="number" step="0.01" required value={accrueAmount} onChange={e => setAccrueAmount(e.target.value)} />
              </div>

              <div style={{ background: 'var(--bg-input)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)', marginTop: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600 }}>
                  <input type="checkbox" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} style={{ width: 16, height: 16 }} />
                  Make this a recurring payroll entry
                </label>
                {isRecurring && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Frequency</label>
                      <select value={recurringFrequency} onChange={e => setRecurringFrequency(e.target.value as any)}>
                        <option value="weekly">Weekly</option>
                        <option value="biweekly">Bi-weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Start Date</label>
                      <input type="date" required value={recurringStartDate} onChange={e => setRecurringStartDate(e.target.value)} />
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-footer" style={{ marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAccrue(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Earnings</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Ledger Modal */}
      {showLedger && (
        <div className="modal-overlay" onClick={() => setShowLedger(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Ledger for {showLedger.name}</h2>
              <button className="modal-close" onClick={() => setShowLedger(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Type</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                      <th style={{ textAlign: 'right', width: '60px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bills.filter(b => b.vendor === `Payroll: ${showLedger.name}`).sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime()).map(b => (
                      <tr key={b.id}>
                        <td>{b.status === 'paid' && b.paidDate ? b.paidDate : b.dueDate}</td>
                        <td>{b.status === 'paid' ? 'Payment (Bank)' : 'Earnings Added'}</td>
                        <td>
                          <span className={`badge ${b.status === 'paid' ? 'badge-green' : 'badge-purple'}`}>
                            {b.status === 'paid' ? 'Payment' : 'Earnings'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: b.status === 'paid' ? 'var(--green)' : 'var(--navy)' }}>
                          {b.status === 'paid' ? '-' : '+'}${b.amount.toFixed(2)}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn btn-ghost btn-sm" onClick={(e) => { 
                            e.stopPropagation(); 
                            const val = window.prompt('Enter new amount for this transaction:', b.amount.toString());
                            if (val && !isNaN(parseFloat(val))) {
                              editBill(b.id, { amount: parseFloat(val) });
                            }
                          }} style={{ color: 'var(--navy)', padding: '4px', marginRight: '4px' }}>
                            <Edit2 size={14} />
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); if(confirm('Are you sure you want to delete this ledger entry?')) deleteBills([b.id]); }} style={{ color: 'var(--red)', padding: '4px' }}>
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {bills.filter(b => b.vendor === `Payroll: ${showLedger.name}`).length === 0 && (
                      <tr><td colSpan={4} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>No history available.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Generate T4A Modal */}
      {showT4A && t4aTarget && (
        <div className="modal-overlay" onClick={() => setShowT4A(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Generate T4A for {t4aTarget.name}</h2>
              <button className="modal-close" onClick={() => setShowT4A(false)}>✕</button>
            </div>
            <form onSubmit={handleGenerateT4A} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label>Tax Year</label>
                <input type="number" required value={t4aYear} onChange={e => setT4AYear(Number(e.target.value))} />
              </div>
              <div className="form-group">
                <label>Box 48 Amount (Fees for services)</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--text-muted)' }}>$</span>
                  <input type="number" step="0.01" required value={t4aBox48} onChange={e => setT4ABox48(e.target.value)} style={{ paddingLeft: '24px' }} />
                </div>
              </div>
              <div className="modal-footer" style={{ marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowT4A(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Generate T4A</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Employee Modal */}
      {showEditEmp && (
        <div className="modal-overlay" onClick={() => setShowEditEmp(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Employee</h2>
              <button className="modal-close" onClick={() => setShowEditEmp(null)}>✕</button>
            </div>
            <form onSubmit={handleEditEmployee} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label>Name</label>
                <input type="text" required value={showEditEmp.name} onChange={e => setShowEditEmp({...showEditEmp, name: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Role</label>
                <input type="text" required value={showEditEmp.role} onChange={e => setShowEditEmp({...showEditEmp, role: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={showEditEmp.email} onChange={e => setShowEditEmp({...showEditEmp, email: e.target.value})} />
              </div>
              <div className="modal-footer" style={{ marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditEmp(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
