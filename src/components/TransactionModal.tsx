import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useStore, type Bill, uid } from '../store';
import { AddAccountModal } from './AddAccountModal';

export interface TransactionModalProps {
  mode: 'add' | 'edit' | 'match';
  initialData?: Partial<Bill> & { 
    id?: string;
    sourceAccountId?: string;
    isTransfer?: boolean;
    transferAccountId?: string;
  };
  onClose: () => void;
  onSave: (data: any) => void;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({ mode, initialData, onClose, onSave }) => {
  const { accounts, projects, vendors, employees, addVendor, bills, addAccount } = useStore();
  const unpaidBills = bills.filter(b => b.status === 'pending');
  
  const defaultCategory = accounts.filter(a => a.type === 'expense').find(a => !a.parentId)?.id || '';

  const [formType, setFormType] = useState<'expense' | 'transfer' | 'existing_bill'>(initialData?.isTransfer ? 'transfer' : 'expense');
  const [selectedBillId, setSelectedBillId] = useState('');
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);

  const [form, setForm] = useState({
    isPayrollExpense: !!initialData?.employeeId,
    vendor: initialData?.vendor || '',
    amount: initialData?.amount?.toString() || '',
    dueDate: initialData?.dueDate || new Date().toISOString().split('T')[0],
    category: initialData?.category || defaultCategory,
    status: initialData?.status || ('pending' as 'pending' | 'urgent'),
    currency: initialData?.currency || ('CAD' as 'CAD' | 'USD'),
    exchangeRate: initialData?.exchangeRate?.toString() || '1.35',
    projectId: initialData?.projectId || '',
    creditAccountId: initialData?.creditAccountId || '',
    isRecurring: false,
    recurringFrequency: 'monthly' as 'weekly' | 'monthly' | 'yearly',
    taxable: initialData?.taxable || false,
    payImmediately: mode === 'match' || initialData?.status === 'paid',
    sourceAccountId: initialData?.sourceAccountId || '',
    employeeId: initialData?.employeeId || '',
    t4aEligible: initialData?.t4aEligible || false,
    transferAccountId: initialData?.transferAccountId || '',
  });

  const expenseAccounts = accounts.filter(a => a.type === 'expense');

  const renderAccountOptions = (parentId?: string, depth = 0) => {
    return expenseAccounts
      .filter(a => a.parentId === parentId)
      .map(a => (
        <React.Fragment key={a.id}>
          <option value={a.id}>
            {' '.repeat(depth * 4)}
            {depth > 0 ? '↍ ' : ''}
            {a.name}
          </option>
          {renderAccountOptions(a.id, depth + 1)}
        </React.Fragment>
      ));
  };

  const handleSave = () => {
    if (formType === 'existing_bill') {
      if (!selectedBillId) return alert('Please select a bill.');
      onSave({ type: 'existing_bill', data: { billId: selectedBillId } });
      return;
    }

    if (!form.amount) return alert('Amount is required.');
    
    if (formType === 'expense') {
      if (!form.vendor) return alert('Vendor is required.');
      if (!form.category) return alert('Category is required.');
      if (form.payImmediately && !form.sourceAccountId) return alert('Please select a Paid From account.');
      
      let finalVendor = form.vendor;
      if (finalVendor === 'ADD_NEW_VENDOR') {
        const newName = prompt('Enter new vendor name:');
        if (!newName) return;
        finalVendor = newName;
        addVendor({ name: newName, fund: 'General' });
      } else if (!vendors.find(v => v.name === finalVendor)) {
        addVendor({ name: finalVendor, fund: 'General' });
      }
      
      if (form.isPayrollExpense && !form.employeeId) return alert('Employee is required for payroll expense.');

      onSave({
        type: 'expense',
        data: { ...form, vendor: finalVendor, amount: parseFloat(form.amount) }
      });
      
    } else if (formType === 'transfer') {
      if (!form.transferAccountId) return alert('Transfer account is required.');
      if (form.payImmediately && !form.sourceAccountId) return alert('Source account is required.');
      
      onSave({
        type: 'transfer',
        data: { ...form, amount: parseFloat(form.amount) }
      });
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h2 style={{ margin: 0 }}>
            {mode === 'match' ? 'Match Transaction' : mode === 'edit' ? 'Edit Bill' : 'Add New Bill'}
          </h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body">
          
          {(mode === 'match' || mode === 'add') && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', background: 'var(--bg-input)', padding: '4px', borderRadius: '8px' }}>
              <button 
                style={{ flex: 1, padding: '8px', borderRadius: '6px', border: 'none', background: formType === 'expense' ? 'white' : 'transparent', fontWeight: formType === 'expense' ? 700 : 400, boxShadow: formType === 'expense' ? 'var(--shadow-sm)' : 'none', cursor: 'pointer' }}
                onClick={() => setFormType('expense')}
              >Expense</button>
              {mode === 'match' && (
                <button 
                  style={{ flex: 1, padding: '8px', borderRadius: '6px', border: 'none', background: formType === 'existing_bill' ? 'white' : 'transparent', fontWeight: formType === 'existing_bill' ? 700 : 400, boxShadow: formType === 'existing_bill' ? 'var(--shadow-sm)' : 'none', cursor: 'pointer' }}
                  onClick={() => setFormType('existing_bill')}
                >Existing Bill</button>
              )}
              <button 
                style={{ flex: 1, padding: '8px', borderRadius: '6px', border: 'none', background: formType === 'transfer' ? 'white' : 'transparent', fontWeight: formType === 'transfer' ? 700 : 400, boxShadow: formType === 'transfer' ? 'var(--shadow-sm)' : 'none', cursor: 'pointer' }}
                onClick={() => setFormType('transfer')}
              >Transfer</button>
            </div>
          )}

          <div style={{ display: 'grid', gap: '16px' }}>
            { formType === 'expense' && (
              <>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Vendor / Payee *</label>
                  <input type="text" list="vendor-list" placeholder="e.g. Fuel Supplier" value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} />
                  <datalist id="vendor-list">
                    {vendors.map(v => <option key={v.id} value={v.name} />)}
                    <option value="ADD_NEW_VENDOR">+ Add New Vendor</option>
                  </datalist>
                </div>
                <div style={{ background: 'var(--bg-input)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0, fontWeight: 700 }}>
                    <input type="checkbox" checked={form.isPayrollExpense} onChange={e => {
                      const isChecked = e.target.checked;
                      setForm(f => ({ ...f, isPayrollExpense: isChecked }));
                    }} style={{ width: 16, height: 16 }} />
                    This expense is also a payroll payment
                  </label>
                  
                  {form.isPayrollExpense && (
                    <div className="form-group" style={{ margin: '12px 0 0 0' }}>
                      <label>Employee *</label>
                      <select value={form.employeeId} onChange={e => {
                        const empId = e.target.value;
                        setForm(f => ({ ...f, employeeId: empId }));
                      }}>
                        <option value="">— Select Employee —</option>
                        {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              </>
            )}
            { formType === 'existing_bill' && (
              <div className="form-group" style={{ margin: 0 }}>
                <label>Select Unpaid Expense / Bill *</label>
                <select value={selectedBillId} onChange={e => setSelectedBillId(e.target.value)}>
                  <option value="">— Select Bill —</option>
                  {unpaidBills.map(b => <option key={b.id} value={b.id}>{b.dueDate} | {b.vendor} | ${b.amount.toFixed(2)}</option>)}
                </select>
              </div>
            )}
            { formType === 'transfer' && (
              <div className="form-group" style={{ margin: 0 }}>
                <label>Transfer To / From *</label>
                <select value={form.transferAccountId} onChange={e => setForm(f => ({ ...f, transferAccountId: e.target.value }))}>
                  <option value="">— Select Account —</option>
                  {accounts.filter(a => a.type === 'asset' || a.type === 'liability').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Amount *</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select disabled={mode === 'match'} value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value as 'CAD'|'USD' }))} style={{ width: '80px', flexShrink: 0 }}>
                    <option value="CAD">CAD</option>
                    <option value="USD">USD</option>
                  </select>
                  <input type="number" placeholder="0.00" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} style={{ flex: 1 }} />
                </div>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Date / Due Date *</label>
                <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
              </div>
            </div>

            {form.currency === 'USD' && (
              <div className="form-group" style={{ margin: 0 }}>
                <label>Exchange Rate (USD to CAD)</label>
                <input type="number" placeholder="e.g. 1.35" value={form.exchangeRate} onChange={e => setForm(f => ({ ...f, exchangeRate: e.target.value }))} />
              </div>
            )}

            {formType !== 'transfer' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Category</label>
                  <select value={form.category} onChange={e => {
                    if (e.target.value === 'ADD_NEW_CATEGORY') {
                      setShowAddCategoryModal(true);
                      setForm(f => ({ ...f, category: '' })); // reset to empty so the 'ADD' option doesn't stay stuck
                    } else {
                      setForm(f => ({ ...f, category: e.target.value }));
                    }
                  }}>
                    <option value="">— Category —</option>
                    <option value="ADD_NEW_CATEGORY" style={{ fontWeight: 'bold', color: 'var(--navy)' }}>+ Add New Category</option>
                    {renderAccountOptions(undefined, 0)}
                  </select>
                </div>
                {mode !== 'match' && (
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Priority</label>
                    <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as any }))} disabled={form.payImmediately}>
                      <option value="pending">Normal</option>
                      <option value="urgent">Urgent / Overdue</option>
                    </select>
                  </div>
                )}
              </div>
            )}

            {formType !== 'transfer' && (
              <div style={{ background: 'var(--bg-input)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0, fontWeight: 700 }}>
                  <input type="checkbox" checked={form.taxable} onChange={e => setForm(f => ({ ...f, taxable: e.target.checked }))} style={{ width: 16, height: 16 }} />
                  Taxable (GST/QST applied)
                </label>
                {formType === 'expense' && form.isPayrollExpense && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: '12px 0 0 0', fontWeight: 700 }}>
                    <input type="checkbox" checked={form.t4aEligible} onChange={e => setForm(f => ({ ...f, t4aEligible: e.target.checked }))} style={{ width: 16, height: 16 }} />
                    Include in T4A (Box 48 Eligible)
                  </label>
                )}
              </div>
            )}

            <div style={{ background: 'var(--bg-input)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              {mode !== 'match' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0, fontWeight: 700 }}>
                  <input type="checkbox" checked={form.payImmediately} onChange={e => setForm(f => ({ ...f, payImmediately: e.target.checked }))} style={{ width: 16, height: 16 }} />
                  Mark as Paid Immediately
                </label>
              )}
              {mode === 'match' && (
                <div style={{ fontWeight: 700, marginBottom: '8px', color: 'var(--navy)' }}>Source / Bank Account</div>
              )}
              {form.payImmediately && (
                <div style={{ marginTop: mode === 'match' ? '0' : '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.85rem' }}>Paid From (Asset) *</label>
                    <select value={form.sourceAccountId} onChange={e => setForm(f => ({ ...f, sourceAccountId: e.target.value }))}>
                      <option value="">— Select Account —</option>
                      {accounts.filter(a => a.type === 'asset' || a.type === 'liability').map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {formType !== 'transfer' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Project Tag (Optional)</label>
                  <select value={form.projectId} onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))}>
                    <option value="">— No Project —</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Credit Account (Optional)</label>
                  <select value={form.creditAccountId} onChange={e => setForm(f => ({ ...f, creditAccountId: e.target.value }))}>
                    <option value="">— No Credit —</option>
                    {accounts.filter(a => a.type === 'liability' || a.type === 'asset').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>
            )}

            {mode === 'add' && formType === 'expense' && (
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
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button 
            className="btn btn-primary" 
            onClick={handleSave} 
            disabled={
              formType === 'existing_bill' ? !selectedBillId :
              (!form.amount || !form.dueDate || (formType !== 'transfer' && !form.category) || (formType === 'expense' && !form.vendor) || (formType === 'expense' && form.isPayrollExpense && !form.employeeId) || (formType === 'transfer' && !form.transferAccountId) || (form.payImmediately && !form.sourceAccountId))
            }
          >
            {mode === 'match' ? 'Save & Match' : mode === 'edit' ? 'Save Changes' : '+ Add Bill'}
          </button>
        </div>
      </div>

      {showAddCategoryModal && (
        <AddAccountModal 
          onClose={() => setShowAddCategoryModal(false)}
          hideTypeSelection
          defaultType="expense"
          modalTitle="Add Subcategory"
          onAdded={(newId) => {
            setForm(f => ({ ...f, category: newId }));
          }}
        />
      )}
    </div>
  );
};
