import React, { useEffect, useState } from 'react';
import { CheckCircle2, Clock, X, XCircle } from 'lucide-react';
import { CloudPaymentDetailsModal } from './CloudPaymentDetailsModal';

type Details = {
  pledge: Record<string, any>;
  payments: Record<string, any>[];
  schedules: Record<string, any>[];
  summary: { amount: number; paid: number; scheduled: number; balance: number; paymentCount: number; scheduleCount: number };
};

const money = (value: number) => Number(value || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const CloudPledgeDetailsModal: React.FC<{ pledgeId: string; onClose: () => void }> = ({ pledgeId, onClose }) => {
  const [details, setDetails] = useState<Details | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/v3/pledges/${encodeURIComponent(pledgeId)}/details`, { signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load pledge details.');
        setDetails(data);
      })
      .catch((reason: any) => { if (reason.name !== 'AbortError') setError(reason.message || 'Unable to load pledge details.'); });
    return () => controller.abort();
  }, [pledgeId]);

  const status = (type: string) => {
    if (type === 'approved') return <><CheckCircle2 size={16} color="var(--green)" /> Approved</>;
    if (type === 'pending') return <><Clock size={16} color="var(--yellow)" /> Pending</>;
    if (type === 'declined') return <><XCircle size={16} color="var(--red)" /> Declined</>;
    return type;
  };

  return <>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={event => event.stopPropagation()} style={{ maxWidth: 900, width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <div><h2 style={{ margin: 0, color: 'var(--navy)' }}>Pledge Details</h2>{details && <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>Donor: <strong style={{ color: 'var(--navy)' }}>{details.pledge.donorName}</strong></div>}</div>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body">
          {error && <div style={{ color: 'var(--red)', fontWeight: 700 }}>{error}</div>}
          {!details && !error && <div style={{ padding: 40, textAlign: 'center' }}>Loading pledge details from the cloud...</div>}
          {details && <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
              {[
                ['Total Pledge', details.summary.amount, 'var(--gold)'],
                ['Total Paid', details.summary.paid, 'var(--green)'],
                ['Scheduled', details.summary.scheduled, 'var(--blue)'],
                ['Open Balance', details.summary.balance, details.summary.balance > 0 ? 'var(--red)' : 'var(--green)']
              ].map(([label, value, color]) => <div className="card" key={String(label)} style={{ padding: 16, background: 'var(--bg-input)', border: 'none' }}><div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</div><div style={{ fontSize: 22, fontWeight: 800, color: String(color) }}>${money(Number(value))}</div></div>)}
            </div>
            <div style={{ background: 'var(--bg-input)', padding: 16, borderRadius: 12, marginBottom: 24 }}><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}><div><span style={{ color: 'var(--text-muted)' }}>Date:</span> <strong>{details.pledge.date}</strong></div><div><span style={{ color: 'var(--text-muted)' }}>Category:</span> <strong>{details.pledge.category || '—'}</strong></div><div><span style={{ color: 'var(--text-muted)' }}>Sponsor:</span> <strong>{details.pledge.sponsor || '—'}</strong></div><div><span style={{ color: 'var(--text-muted)' }}>Currency:</span> <strong>{details.pledge.currency}</strong></div><div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--text-muted)' }}>Notes:</span> <strong>{details.pledge.notes || '—'}</strong></div></div></div>
            <h3 style={{ color: 'var(--navy)' }}>Payments Linked to this Pledge ({details.summary.paymentCount})</h3>
            <div className="table-container"><table><thead><tr><th>Date</th><th>Method</th><th>Status</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead><tbody>{details.payments.map(payment => <tr key={payment.id} onClick={() => setSelectedPayment(payment)} style={{ cursor: 'pointer' }}><td>{payment.date}</td><td style={{ textTransform: 'capitalize' }}>{String(payment.method || '').replaceAll('_', ' ')}</td><td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textTransform: 'capitalize' }}>{status(payment.type)}</span></td><td style={{ textAlign: 'right', fontWeight: 700 }}>{payment.currency} ${money(payment.amount)}</td></tr>)}{details.payments.length === 0 && <tr><td colSpan={4} style={{ padding: 30, textAlign: 'center' }}>No payments found for this pledge.</td></tr>}</tbody></table></div>
            {details.schedules.length > 0 && <><h3 style={{ color: 'var(--navy)', marginTop: 22 }}>Recurring Schedules ({details.summary.scheduleCount})</h3><div className="table-container"><table><thead><tr><th>Next Date</th><th>Frequency</th><th>Status</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead><tbody>{details.schedules.map(schedule => <tr key={schedule.id}><td>{schedule.nextDate}</td><td style={{ textTransform: 'capitalize' }}>{schedule.frequency}</td><td>{schedule.active ? 'Active' : 'Paused'}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{schedule.currency} ${money(schedule.amount)}</td></tr>)}</tbody></table></div></>}
            <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 14 }}>Lists are limited to the latest 50 records to keep the popup responsive.</div>
          </>}
        </div>
      </div>
    </div>
    {selectedPayment && <CloudPaymentDetailsModal payment={{ ...selectedPayment, donorName: details?.pledge.donorName }} onClose={() => setSelectedPayment(null)} />}
  </>;
};
