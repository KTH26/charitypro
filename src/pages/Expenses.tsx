import React, { useState } from 'react';
import { useStore } from '../store';
import { Calendar, Plus, X, AlertTriangle, Edit2, ArrowRight, Printer } from 'lucide-react';
import type { Bill } from '../store';
import { useLocation, Link } from 'react-router-dom';
import { useT } from '../i18n';
import { BILL_CATEGORIES } from '../utils/categories';
import { AddAccountModal } from '../components/AddAccountModal';
import { VendorModal } from '../components/VendorModal';

export const Expenses: React.FC = () => {
  const { bills, addBill, editBill, deleteBills, markBillPaid, accounts, addAccount, exchangeRate, isRtl, projects, addRecurringExpense } = useStore();
  const T = useT(isRtl);
  const [showAdd, setShowAdd] = useState(false);
  const [confirmPay, setConfirmPay] = useState<string | null>(null);
  const [paySourceId, setPaySourceId] = useState<string>('');
  const [payOffsetId, setPayOffsetId] = useState<string>('');
  const [editBillData, setEditBillData] = useState<Bill | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<string | null>(null);
  
  const expenseAccounts = accounts.filter(a => a.type === 'expense');
  const defaultCategory = expenseAccounts.find(a => !a.parentId)?.id || '';

  const [form, setForm] = useState({ vendor: '', amount: '', dueDate: '', category: defaultCategory, status: 'pending' as 'pending' | 'urgent', currency: 'CAD' as 'CAD'|'USD', exchangeRate: exchangeRate?.toString() || '1.35', projectId: '', creditAccountId: '', isRecurring: false, recurringFrequency: 'monthly' as 'weekly'|'monthly'|'yearly' });
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [payImmediately, setPayImmediately] = useState(false);
  const [addSourceId, setAddSourceId] = useState('');
  const [addOffsetId, setAddOffsetId] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'bills' | 'categories'>('bills');
  const location = useLocation();

  React.useEffect(() => {
    // Migration: ensure all legacy BILL_CATEGORIES exist as expense accounts
    const existingNames = new Set(expenseAccounts.map(a => a.name));
    let added = false;
    BILL_CATEGORIES.forEach(cat => {
      if (!existingNames.has(cat)) {
        addAccount({ name: cat, type: 'expense', currency: 'CAD', balance: 0, subType: 'general' });
        added = true;
      }
    });
    // Set default category if not set
    if (!form.category && added) {
       const firstRoot = accounts.find(a => a.type === 'expense' && !a.parentId);
       if (firstRoot) setForm(f => ({ ...f, category: firstRoot.id }));
    }
  }, [accounts.length]);

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

    if (form.isRecurring) {
      addRecurringExpense({
        vendor: form.vendor,
        amount: parseFloat(form.amount),
        currency: form.currency,
        category: form.category,
        projectId: form.projectId || undefined,
        creditAccountId: form.creditAccountId || undefined,
        frequency: form.recurringFrequency,
        nextDate: form.dueDate,
        active: true
      });
      // also create the first bill immediately
    }
    
    const billId = addBill({ vendor: form.vendor, amount: parseFloat(form.amount), currency: form.currency, exchangeRate: form.currency === 'USD' ? parseFloat(form.exchangeRate) || undefined : undefined, dueDate: form.dueDate, status: payImmediately ? 'paid' : form.status, category: form.category, projectId: form.projectId || undefined, creditAccountId: form.creditAccountId || undefined });
    
    if (payImmediately && addSourceId && addOffsetId) {
      markBillPaid(billId, addSourceId, addOffsetId);
    }
    setForm({ vendor: '', amount: '', dueDate: '', category: defaultCategory, status: 'pending', currency: 'CAD', exchangeRate: exchangeRate?.toString() || '1.35', projectId: '', creditAccountId: '', isRecurring: false, recurringFrequency: 'monthly' });
    setPayImmediately(false);
    setAddSourceId('');
    setAddOffsetId('');
    setShowAdd(false);
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(bills.map(b => b.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const activeBills = bills.filter(b => b.status !== 'paid');
  const paidBills = bills.filter(b => b.status === 'paid');
  const urgentBills = bills.filter(b => b.status === 'urgent');

  const totalDue = activeBills.reduce((sum, b) => sum + b.amount, 0);

  // Helper to render nested account options
  const renderAccountOptions = (parentId?: string, depth = 0) => {
    return expenseAccounts
      .filter(a => a.parentId === parentId)
      .map(a => (
        <React.Fragment key={a.id}>
          <option value={a.id}>
            {'\u00A0'.repeat(depth * 4)}
            {depth > 0 ? '↳ ' : ''}
            {a.name}
          </option>
          {renderAccountOptions(a.id, depth + 1)}
        </React.Fragment>
      ));
  };

  // Helper to calculate YTD for an account (including all children)
  const calculateYTD = (accountId: string): number => {
    const children = expenseAccounts.filter(a => a.parentId === accountId);
    let total = bills.filter(b => b.category === accountId).reduce((s, b) => s + b.amount, 0);
    for (const child of children) {
      total += calculateYTD(child.id);
    }
    return total;
  };

  const getCategoryName = (catIdOrName: string) => {
    const acc = expenseAccounts.find(a => a.id === catIdOrName || a.name === catIdOrName);
    return acc ? acc.name : catIdOrName;
  };

  const totalYTD = expenseAccounts.filter(a => !a.parentId).reduce((s, a) => s + calculateYTD(a.id), 0) || 1; // avoid division by zero

  const renderExpenseRows = (parentId?: string, depth = 0) => {
    return expenseAccounts
      .filter(a => a.parentId === parentId)
      .map(a => {
        const ytd = calculateYTD(a.id);
        const hasChildren = expenseAccounts.some(child => child.parentId === a.id);
        if (ytd === 0 && depth > 0 && !hasChildren) return null; // hide empty subcategories

        return (
          <React.Fragment key={a.id}>
            <tr>
              <td style={{ fontSize: '0.9rem', paddingLeft: `${depth * 20 + 16}px` }}>
                {depth > 0 ? '↳ ' : ''}
                <span style={{ fontWeight: depth === 0 ? 600 : 400 }}>{a.name}</span>
              </td>
              <td style={{ fontWeight: 700 }}>${ytd.toLocaleString()}</td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ flex: 1, height: '6px', background: 'var(--border)', borderRadius: '999px', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, (ytd / totalYTD * 100)).toFixed(0)}%`, height: '100%', background: 'linear-gradient(90deg, var(--navy-light), var(--navy))', borderRadius: '999px' }} />
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', minWidth: '30px' }}>{((ytd / totalYTD) * 100).toFixed(0)}%</span>
                </div>
              </td>
            </tr>
            {renderExpenseRows(a.id, depth + 1)}
          </React.Fragment>
        );
      });
  };

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

      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '2px solid var(--border)', paddingBottom: '12px' }}>
        <button className={`btn ${activeTab === 'bills' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setActiveTab('bills')}>Bills & Expenses</button>
        <button className={`btn ${activeTab === 'categories' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setActiveTab('categories')}>Expense Categories</button>
      </div>

      {activeTab === 'bills' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Bills */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <input type="checkbox" checked={selectedIds.length === bills.length && bills.length > 0} onChange={handleSelectAll} title="Select All" />
              <div>
                <h2 style={{ margin: '0 0 4px', fontSize: '1.15rem', fontFamily: 'Outfit, sans-serif', fontWeight: 700, color: 'var(--navy)' }}>
                  {T('upcoming_bills')}
                </h2>
                <div style={{ color: 'var(--red)', fontWeight: 700, fontSize: '0.95rem' }}>
                  {T('total_due')}: ${totalDue.toLocaleString('en-CA', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {selectedIds.length > 0 && (
                <button className="btn btn-sm" style={{ background: 'var(--red)', color: 'white', border: 'none' }} onClick={() => {
                  if (window.confirm(`Are you sure you want to permanently delete ${selectedIds.length} bills?`)) {
                    deleteBills(selectedIds);
                    setSelectedIds([]);
                  }
                }}>Delete Selected ({selectedIds.length})</button>
              )}
              <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
                <Plus size={14} /> {T('add_bill')}
              </button>
            </div>
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
                  <input type="checkbox" checked={selectedIds.includes(bill.id)} onChange={() => handleSelect(bill.id)} />
                  <Calendar size={18} style={{ color: bill.status === 'urgent' ? 'var(--red)' : 'var(--navy-muted)', flexShrink: 0 }} />
                  <div>
                    <div 
                      style={{ fontWeight: 700, cursor: 'pointer', color: 'var(--navy)' }}
                      onClick={() => setSelectedVendor(bill.vendor)}
                      className="hover-underline"
                    >{bill.vendor}</div>
                    <div style={{ fontSize: '0.8rem', color: bill.status === 'urgent' ? 'var(--red)' : 'var(--text-muted)' }}>
                      Due: {bill.dueDate} · {getCategoryName(bill.category)}
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
                  <button className="btn btn-secondary btn-sm" onClick={() => { 
                    setConfirmPay(bill.id); 
                    setPaySourceId(''); 
                    setPayOffsetId(expenseAccounts.find(a => a.id === bill.category) ? bill.category : ''); 
                  }}>Pay</button>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <input type="checkbox" checked={selectedIds.includes(bill.id)} onChange={() => handleSelect(bill.id)} />
                    <div 
                      style={{ fontWeight: 600, cursor: 'pointer', color: 'var(--navy)' }}
                      onClick={() => setSelectedVendor(bill.vendor)}
                      className="hover-underline"
                    >{bill.vendor}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700 }}>${bill.amount.toFixed(2)}</span>
                    <span className="badge badge-green">Paid</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

          </div>
        </div>
      ) : (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontFamily: 'Outfit, sans-serif', fontWeight: 700, color: 'var(--navy)' }}>
              {T('expense_categories')}
            </h2>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddCategory(true)}><Plus size={14}/> Add Category</button>
          </div>
          <div className="table-container" style={{ marginBottom: '20px' }}>
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>YTD Spent</th>
                  <th>% of Total</th>
                </tr>
              </thead>
              <tbody>
                {renderExpenseRows(undefined, 0)}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, padding: '12px 0', borderTop: '2px solid var(--navy)', color: 'var(--navy)', fontFamily: 'Outfit, sans-serif' }}>
            <span>Total YTD</span>
            <span>${totalYTD.toLocaleString()}</span>
          </div>
        </div>
      )}

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
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value as 'CAD'|'USD' }))} style={{ width: '80px', flexShrink: 0 }}>
                        <option value="CAD">CAD</option>
                        <option value="USD">USD</option>
                      </select>
                      <input type="number" placeholder="0.00" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} style={{ flex: 1 }} />
                    </div>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Due Date *</label>
                    <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
                  </div>
                </div>
                {form.currency === 'USD' && (
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Exchange Rate (USD to CAD)</label>
                    <input type="number" placeholder="e.g. 1.35" value={form.exchangeRate} onChange={e => setForm(f => ({ ...f, exchangeRate: e.target.value }))} />
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Category</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={{ flex: 1 }}>
                        {renderAccountOptions(undefined, 0)}
                      </select>
                      <button className="btn btn-secondary btn-sm" onClick={() => setShowAddCategory(true)} title="Add Category"><Plus size={16}/></button>
                    </div>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Priority</label>
                    <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as any }))} disabled={payImmediately}>
                      <option value="pending">Normal</option>
                      <option value="urgent">Urgent / Overdue</option>
                    </select>
                  </div>
                </div>
                
                <div style={{ background: 'var(--bg-input)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0, fontWeight: 700 }}>
                    <input type="checkbox" checked={payImmediately} onChange={e => setPayImmediately(e.target.checked)} style={{ width: 16, height: 16 }} />
                    Mark as Paid Immediately
                  </label>
                  
                  {payImmediately && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label style={{ fontSize: '0.85rem' }}>Paid From (Asset) *</label>
                        <select value={addSourceId} onChange={e => setAddSourceId(e.target.value)}>
                          <option value="">— Select Account —</option>
                          {accounts.filter(a => a.type === 'asset' || a.type === 'liability').map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label style={{ fontSize: '0.85rem' }}>Allocated To (Expense) *</label>
                        <select value={addOffsetId} onChange={e => setAddOffsetId(e.target.value)}>
                          <option value="">— Select Account —</option>
                          {accounts.filter(a => a.type === 'expense').map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Project Tag (Optional)</label>
                    <select value={form.projectId} onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))}>
                      <option value="">— No Project —</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Credit to Account (Optional)</label>
                    <select value={form.creditAccountId} onChange={e => setForm(f => ({ ...f, creditAccountId: e.target.value }))}>
                      <option value="">— No Credit —</option>
                      {accounts.filter(a => a.type === 'liability' || a.type === 'asset').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ background: 'var(--bg-input)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0, fontWeight: 700 }}>
                    <input type="checkbox" checked={form.isRecurring} onChange={e => setForm(f => ({ ...f, isRecurring: e.target.checked }))} style={{ width: 16, height: 16 }} />
                    Make this a recurring expense
                  </label>
                  {form.isRecurring && (
                    <div className="form-group" style={{ margin: '12px 0 0 0' }}>
                      <label style={{ fontSize: '0.85rem' }}>Frequency</label>
                      <select value={form.recurringFrequency} onChange={e => setForm(f => ({ ...f, recurringFrequency: e.target.value as any }))}>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdd} disabled={!form.vendor || !form.amount || !form.dueDate || !form.category || (payImmediately && (!addSourceId || !addOffsetId))}>+ Add Bill</button>
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
                      {renderAccountOptions(undefined, 0)}
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Project Tag</label>
                    <select value={editBillData.projectId || ''} onChange={e => setEditBillData({ ...editBillData, projectId: e.target.value })}>
                      <option value="">— No Project —</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Credit Account</label>
                    <select value={editBillData.creditAccountId || ''} onChange={e => setEditBillData({ ...editBillData, creditAccountId: e.target.value })}>
                      <option value="">— No Credit —</option>
                      {accounts.filter(a => a.type === 'liability' || a.type === 'asset').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
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

      {selectedVendor && <VendorModal vendorName={selectedVendor} onClose={() => setSelectedVendor(null)} />}
      {showAddCategory && <AddAccountModal onClose={() => setShowAddCategory(false)} />}
    </div>
  );
};
