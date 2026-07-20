import React from 'react';
import { X, Calendar, MapPin, Phone, Mail } from 'lucide-react';
import { useStore } from '../store';
import { useT } from '../i18n';

interface Props {
  vendorName: string;
  onClose: () => void;
}

export const VendorModal: React.FC<Props> = ({ vendorName, onClose }) => {
  const { bills, vendors, isRtl } = useStore();
  const T = useT(isRtl);
  
  const vendor = vendors.find(v => v.name === vendorName);
  const vendorBills = bills.filter(b => b.vendor === vendorName);
  
  const totalPaid = vendorBills.filter(b => b.status === 'paid').reduce((s, b) => s + b.amount, 0);
  const totalOwed = vendorBills.filter(b => b.status !== 'paid').reduce((s, b) => s + b.amount, 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px', width: '90%' }}>
        <div className="modal-header">
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
            {vendorName}
          </h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        
        <div className="modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '24px' }}>
            {/* Sidebar info */}
            <div>
              <div className="card" style={{ padding: '20px' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: '1rem', color: 'var(--navy)' }}>Vendor Details</h3>
                
                {vendor ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.9rem' }}>
                    <div style={{ color: 'var(--text-secondary)' }}>
                      Vendor ID: {vendor.id}
                    </div>
                  </div>
                ) : (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    Unregistered Vendor
                  </div>
                )}
                
                <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Total Paid</span>
                    <span style={{ fontWeight: 700, color: 'var(--green)' }}>${totalPaid.toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Outstanding</span>
                    <span style={{ fontWeight: 700, color: 'var(--red)' }}>${totalOwed.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Bills List */}
            <div>
              <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', color: 'var(--navy)' }}>Transactions</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '500px', overflowY: 'auto', paddingRight: '8px' }}>
                {vendorBills.length > 0 ? vendorBills.map(bill => (
                  <div key={bill.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 16px', borderRadius: '12px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <Calendar size={18} style={{ color: bill.status === 'paid' ? 'var(--green)' : bill.status === 'urgent' ? 'var(--red)' : 'var(--navy-muted)' }} />
                      <div>
                        <div style={{ fontWeight: 600 }}>{bill.dueDate}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {bill.status.toUpperCase()}
                        </div>
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '1.1rem', color: bill.status === 'paid' ? 'var(--text)' : 'var(--red)' }}>
                      ${bill.amount.toFixed(2)}
                    </div>
                  </div>
                )) : (
                  <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    No transactions found for this vendor.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
