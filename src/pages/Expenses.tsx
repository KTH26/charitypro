import React, { useState } from 'react';
import { useStore } from '../store';
import { Calendar, Plus, X, AlertTriangle, Edit2, ArrowRight, Printer } from 'lucide-react';
import type { Bill } from '../store';
import { useLocation, Link } from 'react-router-dom';
import { useT } from '../i18n';

const CATEGORIES = ['Ambulance Operations', 'Administration', 'Fundraising', 'Events', 'Equipment', 'Other'];

export const Expenses: React.FC = () => {
  const { isRtl, bills, addBill, markBillPaid, accounts, editBill } = useStore();
  const T = useT(isRtl);
  const [showAdd, setShowAdd] = useState(false);
  const [confirmPay, setConfirmPay] = useState<string | null>(null);
  const [paySourceId, setPaySourceId] = useState<string>('');
  const [payOffsetId, setPayOffsetId] = useState<string>('');
  const [editBillData, setEditBillData] = useState<Bill | null>(null);
  const [form, setForm] = useState({ vendor: '', amount: '', dueDate: '', category: 'Ambulance Operations', status: 'pending' as 'pending' | 'urgent' });
  const location = useLocation();

  React.useEffect(() => {
    const params = new URLSearchParams(location.search);
    const billIdParam = params.get('billId');
    if (billIdParam) {
      const b = bills.find(x => x.id === billIdParam);
      if (b) setEditBillData(b);
    }
  }, [location.search, bills]);

  const handleAdd = () => {
    if (!form.vendor || !form.amount || !form.dueDate) return;
    addBill({ vendor: form.vendor, amount: parseFloat(form.amount), dueDate: form.dueDate, status: form.status, category: form.category });
    setForm({ vendor: '', amount: '', dueDate: '', category: 'Ambulance Operations', status: 'pending' });
    setShowAdd(false);
  };

  const activeBills = bills.filter(b => b.status !== 'paid');
  const paidBills = bills.filter(b => b.status === 'paid');
  const urgentBills = bills.filter(b => b.status === 'urgent');

  const totalDue = activeBills.reduce((sum, b) => sum + b.amount, 0);

  // Expense category summaries (mock YTD)
  const expenseCategories = [
    { category: 'Ambulance Operations', subcategory: 'Fuel', ytd: 24500 },
    { category: 'Ambulance Operations', subcategory: 'Maintenance', ytd: 12300 },
    { category: 'Administration', subcategory: 'Rent', ytd: 14000 },
    { category: 'Fundraising', subcategory: 'Events', ytd: 5400 },
    { category: 'Equipment', subcategory: 'Supplies', ytd: 3200 },
  ];
  const totalYTD = expenseCategories.reduce((s, e) => s + e.ytd, 0);

  return (
    <div>
      {urgentBills.length > 0 && (
        <div style={{ background: 'var(--red-bg)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '14px', padding: '16px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <AlertTriangle size={20} style={{ color: 'var(--red)', flexShrink: 0 }} />
          <div>
            <span style={{ fontWeight: 700, color: 'var(--red)' }}>{urgentBills.length} urgent bill{urgentBills.length > 1 ? 's' : ''} overdue!</span>
            <span style={{ color: 'var(--text-secondary)', marginLeft: '8px', fontSize: '0.9rem' }}>
              {urgentBills.map(b => b.vendor).join(', ')}
            </span>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Bills */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h2 style={{ margin: '0 0 4px', fontSize: '1.15rem', fontFamily: 'Outfit, sans-serif', fontWeight: 700, color: 'var(--navy)' }}>
                {T('upcoming_bills')}
              </h2>
              <div style={{ color: 'var(--red)', fontWeight: 700, fontSize: '0.95rem' }}>
                {T('total_due')}: ${totalDue.toLocaleString('en-CA', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
              <Plus size={14} /> {T('add_bill')}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {activeBills.map(bill => (
              <div key={bill.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '14px 16px', borderRadius: '12px',
                background: bill.status === 'urgent' ? 'var(--red-bg)' : 'var(--bg-input)',
                border: bill.status === 'urgent' ? '1px solid rgba(239,68,68,0.2)' : '1px solid var(--border)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Calendar size={18} style={{ color: bill.status === 'urgent' ? 'var(--red)' : 'var(--navy-muted)', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 700 }}>{bill.vendor}</div>
                    <div style={{ fontSize: '0.8rem', color: bill.status === 'urgent' ? 'var(--red)' : 'var(--text-muted)' }}>
                      Due: {bill.dueDate} · {bill.category}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ fontWeight: 800, fontFamily: 'Outfit, sans-serif', color: bill.status === 'urgent' ? 'var(--red)' : 'var(--navy)' }}>
                    ${bill.amount.toFixed(2)}
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditBillData(bill)}><Edit2 size={14} /></button>
                  <Link to={`/print-check?billId=${bill.id}`} className="btn btn-secondary btn-sm" style={{ padding: '6px' }} title="Print Check">
                    <Printer size={16} />
                  </Link>
                  <button className="btn btn-secondary btn-sm" onClick={() => { setConfirmPay(bill.id); setPaySourceId(''); setPayOffsetId(''); }}>Pay</button>
                </div>
              </div>
            ))}
            {activeBills.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--green)', padding: '40px' }}>✅ No outstanding bills!</div>
            )}
          </div>

          {paidBills.length > 0 && (
            <div style={{ marginTop: '20px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>{T('recently_paid')}</div>
              {paidBills.map(bill => (
                <div key={bill.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-light)', opacity: 0.6 }}>
                  <div style={{ fontWeight: 600 }}>{bill.vendor}</div>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700 }}>${bill.amount.toFixed(2)}</span>
                    <span className="badge badge-green">Paid</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Expense Categories */}
        <div className="card">
          <h2 style={{ margin: '0 0 20px', fontSize: '1.15rem', fontFamily: 'Outfit, sans-serif', fontWeight: 700, color: 'var(--navy)' }}>
            {T('expense_categories')}
          </h2>
          <div className="table-container" style={{ marginBottom: '20px' }}>
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Sub-Category</th>
                  <th>YTD Spent</th>
                  <th>% of Total</th>
                </tr>
              </thead>
              <tbody>
                {expenseCategories.map(e => (
                  <tr key={e.subcategory}>
                    <td style={{ fontSize: '0.9rem' }}>{e.category}</td>
                    <td style={{ fontSize: '0.9rem' }}>{e.subcategory}</td>
                    <td style={{ fontWeight: 700 }}>${e.ytd.toLocaleString()}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, height: '6px', background: 'var(--border)', borderRadius: '999px', overflow: 'hidden' }}>
                          <div style={{ width: `${(e.ytd / totalYTD * 100).toFixed(0)}%`, height: '100%', background: 'linear-gradient(90deg, var(--navy-light), var(--navy))', borderRadius: '999px' }} />
                        </div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', minWidth: '30px' }}>{(e.ytd / totalYTD * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, padding: '12px 0', borderTop: '2px solid var(--navy)', color: 'var(--navy)', fontFamily: 'Outfit, sans-serif' }}>
            <span>Total YTD</span>
            <span>${totalYTD.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Add Bill Modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ margin: 0 }}>Add New Bill</h2>
              <button className="modal-close" onClick={() => setShowAdd(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gap: '16px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Vendor / Payee *</label>
                  <input type="text" placeholder="e.g. Fuel Supplier" value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Amount *</label>
                    <input type="number" placeholder="0.00" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Due Date *</label>
                    <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Category</label>
                    <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Priority</label>
                    <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as any }))}>
                      <option value="pending">Normal</option>
                      <option value="urgent">Urgent / Overdue</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdd} disabled={!form.vendor || !form.amount || !form.dueDate}>+ Add Bill</button>
            </div>
          </div>
        </div>
      )}

      {/* Pay Confirmation Modal */}
      {confirmPay && (
        <div className="modal-overlay" onClick={() => setConfirmPay(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ margin: 0 }}>{T('mark_paid')}</h2>
              <button className="modal-close" onClick={() => setConfirmPay(null)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center', padding: '40px' }}>
              <div style={{ fontSize: '3rem', marginBottom: '16px' }}>✅</div>
              <p style={{ color: 'var(--text-secondary)' }}>
                Mark <strong>{bills.find(b => b.id === confirmPay)?.vendor}</strong> (${bills.find(b => b.id === confirmPay)?.amount.toFixed(2)}) as paid?
              </p>
              <div className="form-group" style={{ marginTop: '20px', textAlign: 'left' }}>
                <label>Paid From (Source Account) *</label>
                <select value={paySourceId} onChange={e => setPaySourceId(e.target.value)}>
                  <option value="">— Select Asset/Liability Account —</option>
                  <optgroup label="Assets">
                    {accounts.filter(a => a.type === 'asset').map(a => <option key={a.id} value={a.id}>{a.name} (${a.balance.toLocaleString()})</option>)}
                  </optgroup>
                  <optgroup label="Liabilities">
                    {accounts.filter(a => a.type === 'liability').map(a => <option key={a.id} value={a.id}>{a.name} (${a.balance.toLocaleString()})</option>)}
                  </optgroup>
                </select>
              </div>
              <div className="form-group" style={{ marginTop: '12px', textAlign: 'left', marginBottom: 0 }}>
                <label>Allocated To (Offset Account) *</label>
                <select value={payOffsetId} onChange={e => setPayOffsetId(e.target.value)}>
                  <option value="">— Select Expense/Payroll Account —</option>
                  <optgroup label="Expenses">
                    {accounts.filter(a => a.type === 'expense' && a.subType !== 'payroll').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </optgroup>
                  <optgroup label="Payroll">
                    {accounts.filter(a => a.type === 'expense' && a.subType === 'payroll').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </optgroup>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setConfirmPay(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={!paySourceId || !payOffsetId} onClick={() => { markBillPaid(confirmPay, paySourceId, payOffsetId); setConfirmPay(null); }}>✅ Confirm Paid</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Bill Modal */}
      {editBillData && (
        <div className="modal-overlay" onClick={() => setEditBillData(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ margin: 0 }}>Edit Bill</h2>
              <button className="modal-close" onClick={() => setEditBillData(null)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gap: '16px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Vendor / Payee</label>
                  <input type="text" value={editBillData.vendor} onChange={e => setEditBillData({ ...editBillData, vendor: e.target.value })} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Amount</label>
                    <input type="number" value={editBillData.amount} onChange={e => setEditBillData({ ...editBillData, amount: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Due Date</label>
                    <input type="date" value={editBillData.dueDate} onChange={e => setEditBillData({ ...editBillData, dueDate: e.target.value })} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Category</label>
                    <select value={editBillData.category} onChange={e => setEditBillData({ ...editBillData, category: e.target.value })}>
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Priority</label>
                    <select value={editBillData.status} onChange={e => setEditBillData({ ...editBillData, status: e.target.value as any })}>
                      <option value="pending">Normal</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditBillData(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => { editBill(editBillData.id, editBillData); setEditBillData(null); }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
