import React, { useState } from 'react';
import { useStore } from '../store';
import { HeartHandshake, Percent, DollarSign, X, Plus } from 'lucide-react';

export const Fundraisers: React.FC = () => {
  const { fundraisers, addFundraiser, payOutFundraiser, transactions } = useStore();
  const [showAdd, setShowAdd] = useState(false);
  const [showPayOut, setShowPayOut] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', percentage: '' });

  const handleAdd = () => {
    if (!form.name || !form.percentage) return;
    addFundraiser({ name: form.name, email: form.email, phone: form.phone, percentage: parseFloat(form.percentage) });
    setForm({ name: '', email: '', phone: '', percentage: '' });
    setShowAdd(false);
  };

  const getFundraiserTotals = (id: string) => {
    const txs = transactions.filter(t => t.fundraiserId === id && t.type === 'approved');
    return txs.reduce((sum, t) => sum + t.amount, 0);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: '1.5rem', color: 'var(--navy)' }}>
          Fundraisers
        </h2>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <Plus size={16} /> Add Fundraiser
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
        {fundraisers.map(f => {
          const totalRaised = getFundraiserTotals(f.id);
          return (
            <div key={f.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div className="member-avatar" style={{ width: '52px', height: '52px', fontSize: '1.1rem' }}>
                    {f.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>{f.name}</div>
                    {f.email && <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{f.email}</div>}
                    {f.phone && <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{f.phone}</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--yellow-bg)', padding: '6px 12px', borderRadius: '999px', border: '1px solid rgba(217,119,6,0.2)' }}>
                  <Percent size={14} style={{ color: 'var(--yellow)' }} />
                  <span style={{ color: 'var(--yellow)', fontWeight: 800 }}>{f.percentage}%</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                <div style={{ background: 'var(--bg-input)', borderRadius: '10px', padding: '14px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Total Raised</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--green)', fontFamily: 'Outfit, sans-serif' }}>${totalRaised.toLocaleString()}</div>
                </div>
                <div style={{ background: f.balanceOwed > 0 ? 'var(--yellow-bg)' : 'var(--bg-input)', borderRadius: '10px', padding: '14px', border: f.balanceOwed > 0 ? '1px solid rgba(217,119,6,0.2)' : '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Owed to Them</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: f.balanceOwed > 0 ? 'var(--yellow)' : 'var(--text-muted)', fontFamily: 'Outfit, sans-serif' }}>${f.balanceOwed.toLocaleString()}</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                {f.balanceOwed > 0 ? (
                  <button className="btn btn-primary" style={{ flex: 1, background: 'linear-gradient(135deg, var(--gold-light), var(--gold))' }} onClick={() => setShowPayOut(f.id)}>
                    <DollarSign size={16} /> Pay Out ${f.balanceOwed.toLocaleString()}
                  </button>
                ) : (
                  <button className="btn btn-secondary" style={{ flex: 1 }} disabled>✅ Fully Paid</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Fundraiser Modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ margin: 0 }}>Add Fundraiser</h2>
              <button className="modal-close" onClick={() => setShowAdd(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gap: '16px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Full Name *</label>
                  <input type="text" placeholder="e.g. Moshe Weiss" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Commission % *</label>
                  <input type="number" placeholder="e.g. 10" min="0" max="100" value={form.percentage} onChange={e => setForm(f => ({ ...f, percentage: e.target.value }))} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Email</label>
                    <input type="email" placeholder="email@example.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Phone</label>
                    <input type="tel" placeholder="416-555-0100" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdd} disabled={!form.name || !form.percentage}>+ Add Fundraiser</button>
            </div>
          </div>
        </div>
      )}

      {/* Pay Out Confirmation Modal */}
      {showPayOut && (
        <div className="modal-overlay" onClick={() => setShowPayOut(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ margin: 0 }}>Confirm Pay Out</h2>
              <button className="modal-close" onClick={() => setShowPayOut(null)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center', padding: '40px' }}>
              <div style={{ fontSize: '3rem', marginBottom: '16px' }}>💸</div>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>You are about to pay out</p>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--navy)', fontFamily: 'Outfit, sans-serif', marginBottom: '4px' }}>
                ${fundraisers.find(f => f.id === showPayOut)?.balanceOwed.toLocaleString()}
              </div>
              <p style={{ color: 'var(--text-muted)', margin: 0 }}>to {fundraisers.find(f => f.id === showPayOut)?.name}</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowPayOut(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ background: 'linear-gradient(135deg, var(--gold-light), var(--gold))' }} onClick={() => { payOutFundraiser(showPayOut); setShowPayOut(null); }}>
                ✅ Confirm Pay Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
