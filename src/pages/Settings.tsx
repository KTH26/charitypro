import React from 'react';
import { useStore } from '../store';
import { Globe, DollarSign, Layout, Receipt } from 'lucide-react';

export const Settings: React.FC = () => {
  const { isRtl, toggleRtl, currency, setCurrency } = useStore();

  return (
    <div className="grid grid-cols-2">
      <div className="card">
        <h2 className="header-title mb-6" style={{ fontSize: '1.25rem' }}>System Preferences</h2>
        
        <div className="form-group mb-6">
          <label className="form-label flex items-center gap-2">
            <Layout size={18} /> Interface Layout
          </label>
          <div className="flex gap-4">
            <button 
              className={`btn ${!isRtl ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { if (isRtl) toggleRtl(); }}
              style={{ flex: 1 }}
            >
              English (LTR)
            </button>
            <button 
              className={`btn ${isRtl ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { if (!isRtl) toggleRtl(); }}
              style={{ flex: 1 }}
            >
              Yiddish / Hebrew (RTL)
            </button>
          </div>
        </div>

        <div className="form-group mb-6">
          <label className="form-label flex items-center gap-2">
            <Globe size={18} /> Default Currency
          </label>
          <div className="flex gap-4">
            <button 
              className={`btn ${currency === 'CAD' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setCurrency('CAD')}
              style={{ flex: 1 }}
            >
              CAD ($)
            </button>
            <button 
              className={`btn ${currency === 'USD' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setCurrency('USD')}
              style={{ flex: 1 }}
            >
              USD ($)
            </button>
          </div>
        </div>

        <div className="form-group mb-6">
          <label className="form-label flex items-center gap-2">
            <DollarSign size={18} /> Current Exchange Rate (CAD to USD)
          </label>
          <div className="flex gap-4">
            <input type="text" className="form-input flex-1" defaultValue="0.74" />
            <button className="btn btn-secondary">Sync Internet Rate</button>
          </div>
        </div>

      </div>

      <div className="card">
        <h2 className="header-title mb-6" style={{ fontSize: '1.25rem' }}>Receipts & Legal</h2>
        
        <div className="form-group mb-4">
          <label className="form-label flex items-center gap-2">
            <Receipt size={18} /> Canadian Legal Charity Receipt Template
          </label>
          <div className="p-4" style={{ backgroundColor: 'var(--surface-lighter)', borderRadius: '8px', minHeight: '150px' }}>
            {/* Template preview placeholder */}
            <div style={{ textAlign: 'center', border: '1px dashed var(--border-color)', padding: '40px', borderRadius: '4px' }}>
              <Receipt size={40} className="text-secondary mb-2" style={{ margin: '0 auto' }} />
              <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Click to edit PDF template design</p>
            </div>
          </div>
          <button className="btn btn-secondary mt-4">Upload New Design</button>
        </div>
      </div>
    </div>
  );
};
