import React, { useEffect } from 'react';
import { useStore } from '../store';
import { useLocation, useNavigate } from 'react-router-dom';

export const PrintCheckLayout: React.FC = () => {
  const { bills } = useStore();
  const location = useLocation();
  const navigate = useNavigate();

  const params = new URLSearchParams(location.search);
  const billId = params.get('billId');
  const bill = bills.find(b => b.id === billId);

  useEffect(() => {
    if (bill) {
      // Trigger print dialog shortly after render
      setTimeout(() => {
        window.print();
      }, 500);
    }
  }, [bill]);

  if (!bill) {
    return <div style={{ padding: 20 }}>Bill not found. <button onClick={() => navigate(-1)}>Go Back</button></div>;
  }

  // Convert number to text (simple version for demo)
  const toText = (num: number) => {
    return `${Math.floor(num)} and ${Math.round((num % 1) * 100).toString().padStart(2, '0')}/100`;
  };

  const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });

  return (
    <div className="print-check-container">
      {/* 
        Standard check dimensions are usually 8.5" x 3.5" (business size) or 6" x 2.75" (personal).
        We'll use standard CSS inches for positioning.
        A physical printer requires user to adjust margins, but this provides the structure.
      */}
      <style>{`
        @media print {
          @page { margin: 0; size: letter; }
          body { margin: 0; background: white; }
          .no-print { display: none !important; }
          .sidebar, .topbar { display: none !important; }
          .main-content { padding: 0 !important; margin: 0 !important; }
        }
        .check-wrapper {
          position: relative;
          width: 8.5in;
          height: 3.5in;
          font-family: monospace;
          font-size: 12pt;
          color: black;
        }
        /* Top right date */
        .check-date { position: absolute; top: 0.5in; right: 1in; }
        /* Pay to the order of */
        .check-payee { position: absolute; top: 1.25in; left: 1in; width: 5in; }
        /* Numeric amount */
        .check-amount-num { position: absolute; top: 1.25in; right: 0.75in; }
        /* Written amount */
        .check-amount-text { position: absolute; top: 1.7in; left: 0.5in; width: 6.5in; }
        /* Memo */
        .check-memo { position: absolute; bottom: 0.5in; left: 0.75in; }
      `}</style>

      <div className="no-print" style={{ padding: '20px', background: '#f8f9fa', borderBottom: '1px solid #ddd', marginBottom: '40px' }}>
        <h3>Print Check Preview</h3>
        <p>Please load your blank check stock into the printer and click the button below if the dialog didn't open.</p>
        <button onClick={() => window.print()} style={{ padding: '10px 20px', background: 'var(--navy)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          Print Now
        </button>
        <button onClick={() => navigate(-1)} style={{ marginLeft: '10px', padding: '10px 20px', background: '#ddd', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          Go Back
        </button>
      </div>

      <div className="check-wrapper">
        <div className="check-date">{currentDate}</div>
        <div className="check-payee">{bill.vendor}</div>
        <div className="check-amount-num">{bill.amount.toFixed(2)}</div>
        <div className="check-amount-text">{toText(bill.amount)} DOLLARS</div>
        <div className="check-memo">{bill.category} (Bill {bill.id})</div>
      </div>
    </div>
  );
};
