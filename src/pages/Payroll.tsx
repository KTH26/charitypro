import React, { useState } from 'react';
import { useStore } from '../store';
import { Users, User, FileText, Download, Plus, Check } from 'lucide-react';

export const Payroll: React.FC = () => {
  const { employees, fundraisers, t4aSlips, addEmployee, payPayrollEntity, addT4A } = useStore();
  const [activeTab, setActiveTab] = useState<'employees' | 'fundraisers' | 't4a'>('employees');

  const [showAddEmp, setShowAddEmp] = useState(false);
  const [empForm, setEmpForm] = useState({ name: '', role: '', email: '' });

  const [showPay, setShowPay] = useState(false);
  const [payTarget, setPayTarget] = useState<{ id: string, type: 'employee' | 'fundraiser', name: string, balance: number } | null>(null);
  const [payAmount, setPayAmount] = useState('');

  const [showT4A, setShowT4A] = useState(false);
  const [t4aTarget, setT4ATarget] = useState<{ id: string, type: 'employee' | 'fundraiser', name: string } | null>(null);
  const [t4aYear, setT4AYear] = useState(new Date().getFullYear());
  const [t4aBox48, setT4ABox48] = useState('');

  const handleAddEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    addEmployee(empForm);
    setShowAddEmp(false);
    setEmpForm({ name: '', role: '', email: '' });
  };

  const handlePay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payTarget || !payAmount) return;
    payPayrollEntity(payTarget.id, payTarget.type, parseFloat(payAmount));
    setShowPay(false);
    setPayTarget(null);
    setPayAmount('');
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
                      <tr key={e.id}>
                        <td style={{ fontWeight: 600 }}>{e.name}</td>
                        <td>{e.role}</td>
                        <td>{e.email || '-'}</td>
                        <td style={{ fontWeight: 700, color: 'var(--red)' }}>${e.balanceOwed.toFixed(2)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => { setPayTarget({ id: e.id, type: 'employee', name: e.name, balance: e.balanceOwed }); setShowPay(true); }}>Record Payment</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => { setT4ATarget({ id: e.id, type: 'employee', name: e.name }); setShowT4A(true); }}>Generate T4A</button>
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
                      <tr key={f.id}>
                        <td style={{ fontWeight: 600 }}>{f.name}</td>
                        <td>{f.percentage}%</td>
                        <td style={{ color: 'var(--navy)', fontWeight: 600 }}>${(f.internalAccountBalance || 0).toFixed(2)}</td>
                        <td style={{ fontWeight: 700, color: 'var(--red)' }}>${f.balanceOwed.toFixed(2)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => { setPayTarget({ id: f.id, type: 'fundraiser', name: f.name, balance: f.balanceOwed }); setShowPay(true); }}>Record Payment</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => { setT4ATarget({ id: f.id, type: 'fundraiser', name: f.name }); setShowT4A(true); }}>Generate T4A</button>
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
                <label>Amount Paid ($)</label>
                <input type="number" step="0.01" required value={payAmount} onChange={e => setPayAmount(e.target.value)} max={payTarget.balance > 0 ? payTarget.balance : undefined} />
              </div>
              <div className="modal-footer" style={{ marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowPay(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Record Payment</button>
              </div>
            </form>
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

    </div>
  );
};
