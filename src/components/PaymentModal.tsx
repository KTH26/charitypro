import React, { useState } from 'react';
import { X, CreditCard, DollarSign, CheckSquare, Smartphone, Calendar, User, Tag, FileText } from 'lucide-react';
import { useStore } from '../store';

interface Props {
  donorId: string;
  onClose: () => void;
}

const CATEGORIES = ['General', 'Building Fund', 'Ambulance Operations', 'Campaign', 'Events', 'Other'];
const FREQUENCIES = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly (Every 3 Months)' },
  { value: 'yearly', label: 'Yearly' },
];

type TabType = 'one_time' | 'recurring' | 'pledge';

export const PaymentModal: React.FC<Props> = ({ donorId, onClose }) => {
  const { donors, fundraisers, addTransaction, addRecurring, currency, exchangeRate } = useStore();
  const donor = donors.find(d => d.id === donorId);
  const [tab, setTab] = useState<TabType>('one_time');
  const [success, setSuccess] = useState(false);

  // One-time / pledge form state
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'credit_card' | 'check' | 'cash' | 'e_transfer'>('credit_card');
  const [txCurrency, setTxCurrency] = useState<'CAD' | 'USD'>(currency);
  const [category, setCategory] = useState('General');
  const [fundraiserId, setFundraiserId] = useState('');
  const [notes, setNotes] = useState('');
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Removed manual rate state


  // Recurring form state
  const [recAmount, setRecAmount] = useState('');
  const [recFrequency, setRecFrequency] = useState<'weekly' | 'monthly' | 'quarterly' | 'yearly'>('monthly');
  const [recStartDate, setRecStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [recMethod, setRecMethod] = useState<'credit_card' | 'check' | 'cash' | 'e_transfer'>('credit_card');
  const [recCurrency, setRecCurrency] = useState<'CAD' | 'USD'>(currency);

  if (!donor) return null;

  const getAmountCAD = (amt: string) => {
    if (!amt || isNaN(+amt)) return 0;
    const num = parseFloat(amt);
    if (txCurrency === 'CAD') return num;
    return num * exchangeRate; // If rate is 1.35 (USD -> CAD), then USD -> CAD is * 1.35
  };

  const handleOneTime = () => {
    if (!amount || isNaN(+amount)) return;
    addTransaction({
      donorId,
      amount: parseFloat(amount),
      amountCAD: getAmountCAD(amount),
      date: txDate,
      type: method === 'check' ? 'pending' : 'approved',
      method,
      currency: txCurrency,
      fundraiserId: fundraiserId || undefined,
      category,
      notes,
    });
    setSuccess(true);
    setTimeout(onClose, 1800);
  };

  const handlePledge = () => {
    if (!amount || isNaN(+amount)) return;
    addTransaction({
      donorId,
      amount: parseFloat(amount),
      amountCAD: getAmountCAD(amount),
      date: txDate,
      type: 'recording',
      method,
      currency: txCurrency,
      fundraiserId: fundraiserId || undefined,
      category,
      notes,
    });
    setSuccess(true);
    setTimeout(onClose, 1800);
  };

  const handleRecurring = () => {
    if (!recAmount || isNaN(+recAmount)) return;
    addRecurring({
      donorId,
      amount: parseFloat(recAmount),
      frequency: recFrequency,
      nextDate: recStartDate,
      method: recMethod,
      currency: recCurrency,
      active: true,
    });
    setSuccess(true);
    setTimeout(onClose, 1800);
  };

  const methodIcon = { credit_card: <CreditCard size={16} />, check: <CheckSquare size={16} />, cash: <DollarSign size={16} />, e_transfer: <Smartphone size={16} /> };
  const methodLabel = { credit_card: 'Credit Card', check: 'Check', cash: 'Cash', e_transfer: 'E-Transfer' };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 style={{ margin: 0 }}>New Payment</h2>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User size={14} /> {donor.name}
              {donor.balanceOwed > 0 && (
                <span className="badge" style={{ background: 'var(--red-bg)', color: 'var(--red)', marginLeft: '8px' }}>
                  Balance Owed: ${donor.balanceOwed.toLocaleString()}
                </span>
              )}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        {success ? (
          <div className="modal-body" style={{ textAlign: 'center', padding: '60px 40px' }}>
            <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'var(--green-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: '2.5rem' }}>✅</div>
            <h3 style={{ color: 'var(--green)', margin: '0 0 8px' }}>Success!</h3>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>Payment recorded successfully.</p>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 40px' }}>
              {([['one_time', 'One-Time Payment'], ['recurring', 'Setup Recurring'], ['pledge', 'Record Pledge']] as [TabType, string][]).map(([key, label]) => (
                <button key={key} onClick={() => setTab(key)} style={{
                  padding: '16px 20px', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 700,
                  fontSize: '0.95rem', color: tab === key ? 'var(--navy-light)' : 'var(--text-muted)',
                  borderBottom: tab === key ? '3px solid var(--navy-light)' : '3px solid transparent',
                  transition: 'all 0.2s', fontFamily: 'inherit'
                }}>{label}</button>
              ))}
            </div>

            <div className="modal-body">
              {(tab === 'one_time' || tab === 'pledge') && (
                <div style={{ display: 'grid', gap: '20px' }}>
                  {/* Amount + Currency */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'end' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-group label">Amount</label>
                      <input type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)}
                        style={{ fontSize: '1.5rem', fontWeight: 700, textAlign: 'center' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {(['CAD', 'USD'] as const).map(c => (
                        <button key={c} onClick={() => setTxCurrency(c)} style={{
                          padding: '14px 16px', border: `2px solid ${txCurrency === c ? 'var(--navy-light)' : 'var(--border)'}`,
                          borderRadius: '12px', background: txCurrency === c ? 'var(--navy-bg)' : 'var(--bg-input)',
                          color: txCurrency === c ? 'var(--navy-light)' : 'var(--text-muted)', fontWeight: 800,
                          cursor: 'pointer', transition: 'all 0.2s'
                        }}>{c}</button>
                      ))}
                    </div>
                  </div>

                  {txCurrency === 'USD' && (
                    <div style={{ background: 'var(--yellow-bg)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '16px', borderRadius: '12px' }}>
                      <div style={{ fontWeight: 700, color: 'var(--yellow)', marginBottom: '4px' }}>USD Exchange Rate</div>
                      <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                        Using System Rate: 1 USD = {exchangeRate} CAD
                      </div>
                      <div style={{ marginTop: '8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        Equivalent: <strong style={{ color: 'var(--navy)' }}>${getAmountCAD(amount).toFixed(2)} CAD</strong> added to donor balance.
                      </div>
                    </div>
                  )}

                  {/* Method */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Payment Method</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px' }}>
                      {(['credit_card', 'check', 'cash', 'e_transfer'] as const).map(m => (
                        <button key={m} onClick={() => setMethod(m)} style={{
                          padding: '12px 8px', border: `2px solid ${method === m ? 'var(--navy-light)' : 'var(--border)'}`,
                          borderRadius: '12px', background: method === m ? 'var(--navy-bg)' : 'var(--bg-input)',
                          color: method === m ? 'var(--navy-light)' : 'var(--text-muted)', fontWeight: 700,
                          cursor: 'pointer', transition: 'all 0.2s', display: 'flex', flexDirection: 'column',
                          alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontFamily: 'inherit'
                        }}>
                          {methodIcon[m]}
                          {methodLabel[m]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Date + Category */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label><Calendar size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />Date</label>
                      <input type="date" value={txDate} onChange={e => setTxDate(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label><Tag size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />Category</label>
                      <select value={category} onChange={e => setCategory(e.target.value)}>
                        {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Fundraiser */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Referred by Fundraiser (optional)</label>
                    <select value={fundraiserId} onChange={e => setFundraiserId(e.target.value)}>
                      <option value="">— None —</option>
                      {fundraisers.map(f => <option key={f.id} value={f.id}>{f.name} ({f.percentage}%)</option>)}
                    </select>
                  </div>

                  {/* Notes */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label><FileText size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />Notes (optional)</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="e.g. Check #1042, spoke to donor on June 24..." />
                  </div>
                </div>
              )}

              {tab === 'recurring' && (
                <div style={{ display: 'grid', gap: '20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'end' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Amount per Payment</label>
                      <input type="number" placeholder="0.00" value={recAmount} onChange={e => setRecAmount(e.target.value)}
                        style={{ fontSize: '1.5rem', fontWeight: 700, textAlign: 'center' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {(['CAD', 'USD'] as const).map(c => (
                        <button key={c} onClick={() => setRecCurrency(c)} style={{
                          padding: '14px 16px', border: `2px solid ${recCurrency === c ? 'var(--navy-light)' : 'var(--border)'}`,
                          borderRadius: '12px', background: recCurrency === c ? 'var(--navy-bg)' : 'var(--bg-input)',
                          color: recCurrency === c ? 'var(--navy-light)' : 'var(--text-muted)', fontWeight: 800,
                          cursor: 'pointer', transition: 'all 0.2s'
                        }}>{c}</button>
                      ))}
                    </div>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Frequency</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      {FREQUENCIES.map(f => (
                        <button key={f.value} onClick={() => setRecFrequency(f.value as any)} style={{
                          padding: '14px', border: `2px solid ${recFrequency === f.value ? 'var(--navy-light)' : 'var(--border)'}`,
                          borderRadius: '12px', background: recFrequency === f.value ? 'var(--navy-bg)' : 'var(--bg-input)',
                          color: recFrequency === f.value ? 'var(--navy-light)' : 'var(--text-muted)', fontWeight: 700,
                          cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'inherit', fontSize: '0.9rem'
                        }}>{f.label}</button>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Start Date</label>
                      <input type="date" value={recStartDate} onChange={e => setRecStartDate(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Payment Method</label>
                      <select value={recMethod} onChange={e => setRecMethod(e.target.value as any)}>
                        <option value="credit_card">Credit Card</option>
                        <option value="check">Check</option>
                        <option value="cash">Cash</option>
                        <option value="e_transfer">E-Transfer</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ background: 'var(--navy-bg)', padding: '16px', borderRadius: '12px', border: '1px solid var(--blue-bg)' }}>
                    <div style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: '4px' }}>📅 Summary</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                      Donor will be charged <strong>${recAmount || '0'} {recCurrency}</strong> every <strong>{recFrequency}</strong> starting <strong>{recStartDate}</strong>.
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              {tab === 'one_time' && <button className="btn btn-primary" onClick={handleOneTime} disabled={!amount}>✅ Process Payment</button>}
              {tab === 'pledge' && <button className="btn btn-primary" onClick={handlePledge} disabled={!amount} style={{ background: 'linear-gradient(135deg, var(--gold-light), var(--gold))' }}>📋 Record Pledge</button>}
              {tab === 'recurring' && <button className="btn btn-primary" onClick={handleRecurring} disabled={!recAmount}>🔁 Activate Recurring</button>}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
