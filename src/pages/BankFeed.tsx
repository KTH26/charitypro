import React, { useState } from 'react';
import { useStore } from '../store';
import { Building, Send, Check } from 'lucide-react';
import { useT } from '../i18n';

// Dummy live bank feed data
const mockLiveFeed = [
  { id: 'lf1', date: '2025-06-24', description: 'STRIPE TRANSFER', amount: 4500.00, status: 'unmatched', sourceAccountId: 'ba1' },
  { id: 'lf2', date: '2025-06-23', description: 'CHECK DEPOSIT INTERAC', amount: 250.00, status: 'unmatched', sourceAccountId: 'ba1' },
  { id: 'lf3', date: '2025-06-23', description: 'UNKNOWN WIRE REF 4829', amount: 15000.00, status: 'unmatched', sourceAccountId: 'ba2' },
  { id: 'lf4', date: '2025-06-22', description: 'SHELL GAS STATION', amount: -145.20, status: 'unmatched', sourceAccountId: 'ba1' },
];

export const BankFeed: React.FC = () => {
  const { accounts, isRtl } = useStore();
  const T = useT(isRtl);
  const [selectedBank, setSelectedBank] = useState(accounts[0]?.id || '');
  const [feed, setFeed] = useState(mockLiveFeed);

  const activeFeed = feed.filter(f => f.sourceAccountId === selectedBank);

  const handleSendReview = (id: string) => {
    setFeed(feed.map(f => f.id === id ? { ...f, status: 'review' } : f));
    alert('Transaction sent to "Needs Review" tab for the other user.');
  };

  const handleMatch = (id: string) => {
    setFeed(feed.map(f => f.id === id ? { ...f, status: 'matched' } : f));
  };

  return (
    <div style={{ display: 'grid', gap: '24px' }}>
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontFamily: 'Outfit, sans-serif', fontWeight: 700, color: 'var(--navy)' }}>
              Live Bank Feed
            </h2>
          </div>
          <select className="filter-select" value={selectedBank} onChange={e => setSelectedBank(e.target.value)} style={{ minWidth: '250px' }}>
            {accounts.filter(a => a.type === 'asset').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Bank Description</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {activeFeed.map(t => (
                <tr key={t.id} style={{ opacity: t.status === 'matched' ? 0.6 : 1 }}>
                  <td>{t.date}</td>
                  <td style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.9rem' }}>{t.description}</td>
                  <td style={{ fontWeight: 700, color: t.amount > 0 ? 'var(--green)' : 'var(--navy)' }}>
                    ${t.amount.toFixed(2)}
                  </td>
                  <td>
                    {t.status === 'unmatched' && <span className="badge badge-warning">Unmatched</span>}
                    {t.status === 'matched' && <span className="badge badge-success">Matched</span>}
                    {t.status === 'review' && <span className="badge badge-info">Sent for Review</span>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {t.status === 'unmatched' && (
                        <>
                          <button className="btn btn-secondary btn-sm" onClick={() => handleMatch(t.id)} title="Match to existing transaction">
                            <Check size={14} /> Match
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleSendReview(t.id)} title="Send for Review">
                            <Send size={14} style={{ color: 'var(--gold)' }} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {activeFeed.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>No pending bank feed items.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
