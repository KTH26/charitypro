import React, { useState } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import { Printer, CheckCircle, Search, FileText } from 'lucide-react';
import { BILL_CATEGORIES } from '../utils/categories';

export const WriteChecks: React.FC = () => {
  const { isRtl, accounts, vendors, bills, addBill, markBillPaid, editBill, addVendor } = useStore();
  const T = useT(isRtl);
  
  const checkingAccounts = accounts.filter(a => a.type === 'asset' && a.subType === 'checking');
  
  const [selectedAccount, setSelectedAccount] = useState(checkingAccounts[0]?.id || '');
  const [form, setForm] = useState({
    vendor: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    category: BILL_CATEGORIES[0],
    memo: '',
    checkNumber: 'To Print',
    currency: 'CAD' as 'CAD' | 'USD',
  });
  
  const [printing, setPrinting] = useState(false);
  const [startCheckNum, setStartCheckNum] = useState('');

  const queuedChecks = bills.filter(b => b.printStatus === 'queued');

  const handleWriteCheck = () => {
    if (!form.vendor || !form.amount || !selectedAccount) return;
    
    const existingVendor = vendors.find(v => v.name.toLowerCase() === form.vendor.toLowerCase());
    if (!existingVendor) {
      addVendor({ name: form.vendor });
    }
    
    const billId = addBill({
      vendor: form.vendor,
      amount: parseFloat(form.amount),
      currency: form.currency,
      dueDate: form.date, // Check date acts as due date
      status: 'paid', // Immediately paid
      category: form.category,
      memo: form.memo,
      checkNumber: form.checkNumber,
      printStatus: form.checkNumber === 'To Print' ? 'queued' : 'printed'
    });
    
    const offsetAcc = accounts.find(a => a.name === form.category)?.id || accounts.find(a => a.type === 'expense')?.id || '';
    markBillPaid(billId, selectedAccount, offsetAcc);
    
    setForm(f => ({ ...f, vendor: '', amount: '', memo: '' }));
  };

  const handlePrint = () => {
    if (!startCheckNum) return alert('Please enter a starting check number.');
    let currentNum = parseInt(startCheckNum);
    
    // We would open a print layout with the queued checks here.
    // For now we'll just mark them as printed.
    
    const printWindow = window.open('/print-checks?start=' + currentNum, '_blank');
    if (printWindow) {
      printWindow.focus();
    }
  };

  return (
    <div style={{ display: 'grid', gap: '24px' }}>
      <div className="card" style={{ padding: '32px' }}>
        <h2 style={{ margin: '0 0 24px 0', fontFamily: 'Outfit, sans-serif', color: 'var(--navy)' }}>Write Checks</h2>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div className="form-group" style={{ margin: 0, width: '300px' }}>
            <label>Bank Account</label>
            <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}>
              {checkingAccounts.map(a => <option key={a.id} value={a.id}>{a.name} (${a.balance.toLocaleString()})</option>)}
            </select>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '4px' }}>Ending Balance</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--navy)' }}>
              ${checkingAccounts.find(a => a.id === selectedAccount)?.balance.toLocaleString() || '0.00'}
            </div>
          </div>
        </div>

        {/* Check Form Mockup */}
        <div style={{ border: '2px solid var(--border)', borderRadius: '12px', padding: '32px', background: 'var(--bg-surface)', position: 'relative' }}>
          <div style={{ position: 'absolute', top: '32px', right: '32px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontWeight: 600 }}>No.</span>
            <input type="text" value={form.checkNumber} onChange={e => setForm(f => ({ ...f, checkNumber: e.target.value }))} style={{ width: '100px' }} />
          </div>
          <div style={{ position: 'absolute', top: '32px', right: '200px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontWeight: 600 }}>Date</span>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          
          <div style={{ marginTop: '80px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontWeight: 600, width: '120px' }}>Pay to the Order of</span>
            <input type="text" list="vendor-list" value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} style={{ flex: 1, fontSize: '1.1rem' }} />
            <span style={{ fontWeight: 600, fontSize: '1.2rem' }}>$</span>
            <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} style={{ width: '150px', fontSize: '1.1rem' }} placeholder="0.00" />
          </div>

          <div style={{ marginTop: '40px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontWeight: 600, width: '120px' }}>Memo</span>
            <input type="text" value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} style={{ flex: 1 }} />
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={{ width: '250px' }}>
              {BILL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={handleWriteCheck} disabled={!form.vendor || !form.amount}>
            Save & Next
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h3 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', color: 'var(--navy)' }}>Checks to Print ({queuedChecks.length})</h3>
          <div style={{ display: 'flex', gap: '12px' }}>
            <input type="number" placeholder="Starting Check No." value={startCheckNum} onChange={e => setStartCheckNum(e.target.value)} style={{ width: '160px' }} />
            <button className="btn btn-primary" onClick={handlePrint} disabled={queuedChecks.length === 0}>
              <Printer size={16} /> Print Checks
            </button>
          </div>
        </div>
        
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Payee</th>
              <th>Category</th>
              <th>Memo</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {queuedChecks.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>No checks in queue.</td></tr>}
            {queuedChecks.map(c => (
              <tr key={c.id}>
                <td>{c.dueDate}</td>
                <td style={{ fontWeight: 600 }}>{c.vendor}</td>
                <td>{c.category}</td>
                <td>{c.memo}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>${c.amount.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <datalist id="vendor-list">
        {vendors.map(v => <option key={v.id} value={v.name} />)}
      </datalist>
    </div>
  );
};
