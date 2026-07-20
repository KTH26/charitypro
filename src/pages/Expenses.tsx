import React, { useState } from 'react';
import { useStore } from '../store';
import { Calendar, Plus, X, AlertTriangle, Edit2, ArrowRight, Printer } from 'lucide-react';
import type { Bill } from '../store';
import { useLocation, Link } from 'react-router-dom';
import { useT } from '../i18n';
import { BILL_CATEGORIES } from '../utils/categories';
import { AddAccountModal } from '../components/AddAccountModal';
import { VendorModal } from '../components/VendorModal';
import { TransactionModal } from '../components/TransactionModal';
import { CategoryBillsModal } from '../components/CategoryBillsModal';

import Papa from 'papaparse';
import { uid } from '../store';

export const Expenses: React.FC = () => {
  const { bills, addBill, editBill, bulkEditBills, deleteBills, markBillPaid, accounts, addAccount, exchangeRate, isRtl, projects, addRecurringExpense, uploadedExpenseQueue, setExpenseQueue, removeExpenseFromQueue, vendors, employees, transferBetweenAccounts, addVendor } = useStore();
  const T = useT(isRtl);
  const [showAdd, setShowAdd] = useState(false);
  const [confirmPay, setConfirmPay] = useState<string | null>(null);
  const [paySourceId, setPaySourceId] = useState<string>('');
  const [payOffsetId, setPayOffsetId] = useState<string>('');
  const [transactionModal, setTransactionModal] = useState<{ mode: 'add' | 'edit' | 'match', initialData?: any } | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<string | null>(null);
  const [selectedCategoryModal, setSelectedCategoryModal] = useState<string | null>(null);
  
  const expenseAccounts = accounts.filter(a => a.type === 'expense');
  const defaultCategory = expenseAccounts.find(a => !a.parentId)?.id || '';

  const [form, setForm] = useState({ vendor: '', amount: '', dueDate: '', category: defaultCategory, status: 'pending' as 'pending' | 'urgent', currency: 'CAD' as 'CAD'|'USD', exchangeRate: exchangeRate?.toString() || '1.35', projectId: '', creditAccountId: '', isRecurring: false, recurringFrequency: 'monthly' as 'weekly'|'monthly'|'yearly', taxable: false });
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [payImmediately, setPayImmediately] = useState(false);
  const [addSourceId, setAddSourceId] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'bills' | 'categories' | 'queue'>('bills');
  const [inlineState, setInlineState] = useState<Record<string, {
    type: 'expense' | 'transfer' | 'payroll';
    categoryId: string;
    entityId: string;
    sourceAccountId: string;
    taxable: boolean;
    newVendorFund: string;
    payrollT4a: boolean;
  }>>({});
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [filterAccount, setFilterAccount] = useState<string>('All');
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
      if (b) setTransactionModal({ mode: 'edit', initialData: b });
    }
  }, [location.search, bills]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as any[];
        const detectedRows: any[] = [];
        
        let dateCol = '', descCol = '', amtCol = '';
        if (rows.length > 0) {
          const keys = Object.keys(rows[0]);
          dateCol = keys.find(k => k.toLowerCase().includes('date')) || keys[0];
          descCol = keys.find(k => k.toLowerCase().includes('desc') || k.toLowerCase().includes('name') || k.toLowerCase().includes('payee')) || keys[1];
          amtCol = keys.find(k => k.toLowerCase().includes('amount') || k.toLowerCase().includes('total')) || keys[2];
        }

        rows.forEach((row) => {
          let date = row[dateCol];
          let desc = row[descCol];
          let amtStr = row[amtCol];
          if (!date || !amtStr) return;
          
          let parsedDate = new Date(date);
          if (isNaN(parsedDate.getTime())) parsedDate = new Date();
          
          let amt = parseFloat(amtStr.replace(/[^0-9.-]+/g, ''));
          if (isNaN(amt)) amt = 0;
          
          detectedRows.push({
            id: uid(),
            date: parsedDate.toISOString().split('T')[0],
            description: desc || 'Imported Expense',
            amount: Math.abs(amt), // Expenses are positive in the queue
            taxable: false
          });
        });

        if (detectedRows.length > 0) {
          setExpenseQueue([...uploadedExpenseQueue, ...detectedRows]);
          setActiveTab('queue');
          alert(`Successfully imported ${detectedRows.length} expenses into the queue.`);
        }
      }
    });
    e.target.value = '';
  };

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
    
    const billId = addBill({ vendor: form.vendor, amount: parseFloat(form.amount), currency: form.currency, exchangeRate: form.currency === 'USD' ? parseFloat(form.exchangeRate) || undefined : undefined, dueDate: form.dueDate, status: payImmediately ? 'paid' : form.status, category: form.category, projectId: form.projectId || undefined, creditAccountId: form.creditAccountId || undefined, taxable: form.taxable });
    
    if (payImmediately && addSourceId) {
      markBillPaid(billId, addSourceId);
    }
    setForm({ vendor: '', amount: '', dueDate: '', category: defaultCategory, status: 'pending', currency: 'CAD', exchangeRate: exchangeRate?.toString() || '1.35', projectId: '', creditAccountId: '', isRecurring: false, recurringFrequency: 'monthly', taxable: false });
    setPayImmediately(false);
    setAddSourceId('');
    setShowAdd(false);
  };
  const handleTransactionModalSave = (result: any) => {
    const { type, data } = result;
    
    if (type === 'expense') {
      const billData = {
        vendor: data.vendor,
        amount: data.amount,
        dueDate: data.dueDate,
        status: data.status,
        category: data.category,
        currency: data.currency,
        exchangeRate: parseFloat(data.exchangeRate) || 1.35,
        projectId: data.projectId,
        creditAccountId: data.creditAccountId,
        isRecurring: data.isRecurring,
        recurringFrequency: data.recurringFrequency,
        taxable: data.taxable,
        isPayrollExpense: data.isPayrollExpense,
        employeeId: data.isPayrollExpense ? data.employeeId : undefined,
        t4aEligible: data.isPayrollExpense ? data.t4aEligible : undefined,
      };

      if (transactionModal?.mode === 'edit' && transactionModal.initialData?.id) {
        editBill(transactionModal.initialData.id, billData);
      } else {
        const billId = addBill(billData);
        if (data.payImmediately && data.sourceAccountId) {
          markBillPaid(billId, data.sourceAccountId);
        }
      }
    } else if (type === 'transfer') {
      transferBetweenAccounts({
        fromAccountId: data.sourceAccountId,
        toAccountId: data.transferAccountId,
        amount: data.amount,
        date: data.dueDate,
        notes: 'Transfer'
      });
    }

    if (transactionModal?.mode === 'match' && transactionModal.initialData?.id) {
      removeExpenseFromQueue(transactionModal.initialData.id);
    }
    
    setTransactionModal(null);
  };

  const handleInlineSave = (t: any) => {
    const state = inlineState[t.id];
    if (!state) return;

    if (!state.sourceAccountId) {
      return alert('Please select a Paid From account.');
    }
    if (!state.categoryId) {
      return alert('Please select a Category.');
    }

    if (state.type === 'expense') {
      let finalVendorName = state.entityId!;
      if (!vendors.find(v => v.name === finalVendorName)) {
        addVendor({
          name: finalVendorName,
          fund: state.newVendorFund || 'General'
        });
      }
      
      const billId = addBill({
        vendor: finalVendorName,
        amount: Math.abs(t.amount),
        dueDate: t.date,
        status: 'pending',
        category: state.categoryId || 'Uncategorized Expense',
        taxable: state.taxable
      });
      markBillPaid(billId, state.sourceAccountId);
      removeExpenseFromQueue(t.id);
      
    } else if (state.type === 'transfer') {
      const isOutbound = t.amount > 0; // It's an expense sheet, so amounts are positive
      transferBetweenAccounts({
        fromAccountId: isOutbound ? state.sourceAccountId : state.entityId!,
        toAccountId: isOutbound ? state.entityId! : state.sourceAccountId,
        amount: Math.abs(t.amount),
        date: t.date,
        notes: `Imported Transfer: ${t.description}`,
        bankTransactionId: t.id
      });
      removeExpenseFromQueue(t.id);
      
    } else if (state.type === 'payroll') {
      const employee = employees.find(e => e.id === state.entityId);
      const payrollBillId = addBill({
        vendor: `Payroll: ${employee?.name || 'Unknown'}`,
        employeeId: state.entityId!,
        amount: Math.abs(t.amount),
        dueDate: t.date,
        status: 'pending',
        category: state.categoryId || 'Payroll Expense',
        t4aEligible: state.payrollT4a,
        taxable: state.taxable
      });
      markBillPaid(payrollBillId, state.sourceAccountId);
      removeExpenseFromQueue(t.id);
    }
    
    // Clear inline state
    setInlineState(prev => {
      const next = { ...prev };
      delete next[t.id];
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.length === bills.length && bills.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(bills.map(b => b.id));
    }
  };

  const handleBulkSetAccount = (accountId: string) => {
    if (!accountId) return;
    if (window.confirm(`Are you sure you want to change the 'Paid From' account for ${selectedIds.length} bills?`)) {
      bulkEditBills(selectedIds, { sourceAccountId: accountId });
      setSelectedIds([]);
    }
  };

  const handleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const isBillInCategory = (b: Bill, targetCatId: string) => {
    if (b.category === targetCatId) return true;
    let currentId = b.category;
    while (currentId) {
      const parent = expenseAccounts.find(a => a.id === currentId)?.parentId;
      if (parent === targetCatId) return true;
      currentId = parent || '';
    }
    return false;
  };

  const nonPayrollBills = bills.filter(b => {
    if ((b.isPayroll || b.vendor.startsWith('Payroll: ')) && !b.isPayrollExpense) return false;
    if (filterCategory !== 'All' && !isBillInCategory(b, filterCategory)) return false;
    if (filterAccount !== 'All' && b.sourceAccountId !== filterAccount) return false;
    return true;
  });
  const activeBills = nonPayrollBills.filter(b => b.status !== 'paid');
  const paidBills = nonPayrollBills.filter(b => b.status === 'paid');
  const urgentBills = nonPayrollBills.filter(b => b.status === 'urgent');

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
            <tr onClick={() => setSelectedCategoryModal(a.id)} style={{ cursor: 'pointer' }} className="hover-bg-input">
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
        <button className={`btn ${activeTab === 'queue' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setActiveTab('queue')}>
          Uploaded Queue {uploadedExpenseQueue.length > 0 && <span style={{ background: 'var(--red)', color: 'white', padding: '2px 6px', borderRadius: '10px', fontSize: '0.75rem', marginLeft: '6px' }}>{uploadedExpenseQueue.length}</span>}
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
            <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFileUpload} />
            Upload Expense Sheet
          </label>
        </div>
      </div>

      {activeTab === 'bills' ? (
        <div>
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
                <>
                  <select 
                    className="input input-sm" 
                    onChange={e => { handleBulkSetAccount(e.target.value); e.target.value = ''; }}
                    style={{ width: '180px', border: '1px solid var(--navy)', color: 'var(--navy)', fontWeight: 600 }}
                  >
                    <option value="">Bulk Set Paid From...</option>
                    {accounts.filter(a => a.type === 'asset' || a.type === 'liability').map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                  <button className="btn btn-sm" style={{ background: 'var(--red)', color: 'white', border: 'none' }} onClick={() => {
                    if (window.confirm(`Are you sure you want to permanently delete ${selectedIds.length} bills?`)) {
                      deleteBills(selectedIds);
                      setSelectedIds([]);
                    }
                  }}>Delete Selected ({selectedIds.length})</button>
                </>
              )}
              <select 
                  className="input input-sm" 
                  value={filterCategory} 
                  onChange={e => setFilterCategory(e.target.value)}
                  style={{ width: '180px' }}
                >
                  <option value="All">All Categories</option>
                  {expenseAccounts.filter(a => !a.parentId).map(a => (
                    <React.Fragment key={a.id}>
                      <option value={a.id}>{a.name}</option>
                      {expenseAccounts.filter(child => child.parentId === a.id).map(child => (
                        <option key={child.id} value={child.id}>&nbsp;&nbsp;↳ {child.name}</option>
                      ))}
                    </React.Fragment>
                  ))}
                </select>
                <select 
                  className="input input-sm" 
                  value={filterAccount} 
                  onChange={e => setFilterAccount(e.target.value)}
                  style={{ width: '180px' }}
                >
                  <option value="All">All Paid From</option>
                  {accounts.filter(a => a.type === 'asset' || a.type === 'liability').map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <button className="btn btn-primary btn-sm" onClick={() => setTransactionModal({mode: 'add'})}>
                  <Plus size={14} /> {T('add_bill')}
                </button>
            </div>
          </div>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th><input type="checkbox" checked={selectedIds.length === nonPayrollBills.length && nonPayrollBills.length > 0} onChange={handleSelectAll} /></th>
                  <th>Date Due</th>
                  <th>Vendor</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Paid Date</th>
                  <th>Paid From</th>
                  <th>Amount</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {nonPayrollBills.sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime()).map(bill => {
                  const sourceAcc = accounts.find(a => a.id === bill.sourceAccountId);
                  return (
                    <tr key={bill.id} style={{ background: bill.status === 'urgent' ? 'var(--red-bg)' : 'transparent' }}>
                      <td><input type="checkbox" checked={selectedIds.includes(bill.id)} onChange={() => handleSelect(bill.id)} /></td>
                      <td style={{ color: bill.status === 'urgent' ? 'var(--red)' : 'var(--text-secondary)' }}>{bill.dueDate}</td>
                      <td style={{ fontWeight: 700, color: 'var(--navy)', cursor: 'pointer' }} onClick={() => setSelectedVendor(bill.vendor)} className="hover-underline">{bill.vendor}</td>
                      <td>{getCategoryName(bill.category)}</td>
                      <td>
                        <span className={`badge badge-${bill.status === 'paid' ? 'green' : bill.status === 'urgent' ? 'red' : 'gold'}`}>{bill.status}</span>
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>{bill.paidDate || '—'}</td>
                      <td style={{ fontSize: '0.85rem' }}>{sourceAcc ? sourceAcc.name : '—'}</td>
                      <td style={{ fontWeight: 800, color: 'var(--navy)' }}>${bill.amount.toLocaleString('en-CA', { minimumFractionDigits: 2 })}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => setTransactionModal({mode: 'edit', initialData: bill})}><Edit2 size={14} /></button>
                          <Link to={`/print-check?billId=${bill.id}`} className="btn btn-secondary btn-sm" style={{ padding: '6px' }} title="Print Check">
                            <Printer size={16} />
                          </Link>
                          {bill.status !== 'paid' && (
                            <button className="btn btn-secondary btn-sm" onClick={() => { 
                              setConfirmPay(bill.id); 
                              setPaySourceId(''); 
                              setPayOffsetId(expenseAccounts.find(a => a.id === bill.category) ? bill.category : ''); 
                            }}>Pay</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {nonPayrollBills.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>No bills found.</div>
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

      {activeTab === 'queue' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontFamily: 'Outfit, sans-serif', fontWeight: 700, color: 'var(--navy)' }}>
              Uploaded Expenses Queue
            </h2>
          </div>
          {uploadedExpenseQueue.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Queue is empty. Upload an expense sheet (CSV) to get started.
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Amount</th>

                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {uploadedExpenseQueue.map(t => {
                    return (
                      <tr key={t.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{new Date(t.date).toLocaleDateString()}</td>
                        <td style={{ maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={t.description}>{t.description}</td>
                        <td style={{ fontWeight: 700 }}>${t.amount.toLocaleString()}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button className="btn btn-primary btn-sm" onClick={() => setTransactionModal({mode: 'match', initialData: { id: t.id, amount: Math.abs(t.amount), dueDate: t.date, vendor: t.description }})}>Match</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => removeExpenseFromQueue(t.id)} title="Remove"><X size={14}/></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
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



      {selectedVendor && <VendorModal vendorName={selectedVendor} onClose={() => setSelectedVendor(null)} />}
      {selectedCategoryModal && <CategoryBillsModal categoryId={selectedCategoryModal} onClose={() => setSelectedCategoryModal(null)} />}
      {showAddCategory && <AddAccountModal onClose={() => setShowAddCategory(false)} hideTypeSelection defaultType="expense" modalTitle="Add Expense Category" />}
      {transactionModal && (
        <TransactionModal
          mode={transactionModal.mode}
          initialData={transactionModal.initialData}
          onClose={() => setTransactionModal(null)}
          onSave={handleTransactionModalSave}
        />
      )}
    </div>
  );
};
