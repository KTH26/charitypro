import React, { useEffect } from 'react';
import { useStore } from '../store';
import { useSearchParams } from 'react-router-dom';
import { toWords } from 'number-to-words';

export const PrintCheckLayout: React.FC = () => {
  const { bills, accounts, editBill } = useStore();
  const [searchParams] = useSearchParams();
  const startCheckNum = parseInt(searchParams.get('start') || '1001');

  const queuedChecks = bills.filter(b => b.printStatus === 'queued');

  useEffect(() => {
    // Only automatically print once
    if (queuedChecks.length > 0) {
      setTimeout(() => {
        window.print();
        // After printing, prompt to mark as printed
        setTimeout(() => {
          if (window.confirm('Did the checks print successfully? Click OK to mark them as printed.')) {
            let currentNum = startCheckNum;
            queuedChecks.forEach(check => {
              editBill(check.id, { printStatus: 'printed', checkNumber: String(currentNum) });
              currentNum++;
            });
            window.close();
          }
        }, 1000);
      }, 500);
    }
  }, [queuedChecks.length, startCheckNum, editBill]);

  if (queuedChecks.length === 0) {
    return <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'Arial' }}>No checks queued for printing. You can close this window.</div>;
  }

  return (
    <div className="print-only-container">
      <style>{`
        @page { size: letter; margin: 0; }
        @media print {
          body { -webkit-print-color-adjust: exact; margin: 0; padding: 0; background: white; }
          .print-only-container { width: 8.5in; }
          .check-page { width: 8.5in; height: 11in; page-break-after: always; position: relative; box-sizing: border-box; font-family: Arial, sans-serif; }
          .check-part { height: 3.5in; width: 100%; position: relative; border-bottom: 1px dashed transparent; box-sizing: border-box; padding: 0.25in; }
          .micr-line { font-family: 'MICR Encoding', monospace; font-size: 24pt; position: absolute; bottom: 0.2in; left: 0.5in; width: 7.5in; }
        }
        
        @media screen {
          body { background: #525659; display: flex; justify-content: center; padding: 20px; }
          .check-page { width: 8.5in; height: 11in; background: white; box-shadow: 0 0 10px rgba(0,0,0,0.5); margin-bottom: 20px; position: relative; font-family: Arial, sans-serif; box-sizing: border-box; }
          .check-part { height: 3.5in; width: 100%; position: relative; border-bottom: 1px dashed #ccc; box-sizing: border-box; padding: 0.25in; }
          .micr-line { font-family: 'MICR Encoding', monospace; font-size: 24pt; position: absolute; bottom: 0.2in; left: 0.5in; width: 7.5in; }
        }
      `}</style>

      {queuedChecks.map((check, index) => {
        const checkNum = startCheckNum + index;
        const bankAccount = accounts.find(a => a.id === check.sourceAccountId) || accounts[0];
        
        const routingNo = bankAccount?.routingNumber || '000000000';
        const accountNo = bankAccount?.accountNumber || '0000000000';

        const amountCents = Math.round((check.amount % 1) * 100).toString().padStart(2, '0');
        const amountDollars = Math.floor(check.amount);
        const amountWords = `${toWords(amountDollars).replace(/[^a-zA-Z -]/g, '').toUpperCase()} AND ${amountCents}/100`;

        // MICR mapping: C = On-Us, A = Transit, D = Amount
        const micrString = `C${checkNum}C A${routingNo}A ${accountNo}C`;

        return (
          <div className="check-page" key={check.id}>
            {/* Top Check (3.5 inches) */}
            <div className="check-part">
              <div style={{ position: 'absolute', top: '0.4in', left: '0.4in', fontSize: '10pt', width: '2in' }}>
                <div style={{ fontWeight: 'bold' }}>CharityPro Demo</div>
                <div>123 Main Street</div>
                <div>Montreal, QC H2V 1Z1</div>
              </div>
              
              <div style={{ position: 'absolute', top: '0.4in', right: '0.4in', textAlign: 'right', fontSize: '12pt' }}>
                <div>No. {checkNum}</div>
              </div>

              <div style={{ position: 'absolute', top: '1.2in', right: '1in', fontSize: '11pt' }}>
                {check.dueDate}
              </div>

              <div style={{ position: 'absolute', top: '1.6in', left: '0.8in', fontSize: '11pt' }}>
                {check.vendor}
              </div>

              <div style={{ position: 'absolute', top: '1.6in', right: '0.4in', fontSize: '12pt', fontWeight: 'bold' }}>
                ${check.amount.toFixed(2)}
              </div>

              <div style={{ position: 'absolute', top: '2.0in', left: '0.4in', fontSize: '11pt', width: '6.5in', borderBottom: '1px solid black', paddingBottom: '2px' }}>
                {amountWords}
              </div>

              <div style={{ position: 'absolute', bottom: '0.8in', left: '0.4in', fontSize: '10pt' }}>
                Memo: {check.memo || check.category}
              </div>
              
              <div style={{ position: 'absolute', bottom: '0.8in', right: '0.4in', borderBottom: '1px solid black', width: '2.5in' }}></div>

              <div className="micr-line">
                {micrString}
              </div>
            </div>

            {/* Voucher 1 (Middle - 3.5 inches) */}
            <div className="check-part">
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #000', paddingBottom: '4px', marginBottom: '8px' }}>
                <span style={{ fontWeight: 'bold' }}>Vendor: {check.vendor}</span>
                <span>Date: {check.dueDate}</span>
                <span>Check No. {checkNum}</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10pt' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #ccc' }}>
                    <th style={{ textAlign: 'left', padding: '4px 0' }}>Date</th>
                    <th style={{ textAlign: 'left', padding: '4px 0' }}>Account / Memo</th>
                    <th style={{ textAlign: 'right', padding: '4px 0' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: '4px 0' }}>{check.dueDate}</td>
                    <td style={{ padding: '4px 0' }}>{check.category} {check.memo ? `- ${check.memo}` : ''}</td>
                    <td style={{ textAlign: 'right', padding: '4px 0' }}>${check.amount.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
              <div style={{ position: 'absolute', bottom: '0.25in', right: '0.25in', fontWeight: 'bold' }}>
                Total: ${check.amount.toFixed(2)}
              </div>
            </div>

            {/* Voucher 2 (Bottom - 4 inches) */}
            <div className="check-part" style={{ height: '4in', borderBottom: 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #000', paddingBottom: '4px', marginBottom: '8px' }}>
                <span style={{ fontWeight: 'bold' }}>Vendor: {check.vendor}</span>
                <span>Date: {check.dueDate}</span>
                <span>Check No. {checkNum}</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10pt' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #ccc' }}>
                    <th style={{ textAlign: 'left', padding: '4px 0' }}>Date</th>
                    <th style={{ textAlign: 'left', padding: '4px 0' }}>Account / Memo</th>
                    <th style={{ textAlign: 'right', padding: '4px 0' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: '4px 0' }}>{check.dueDate}</td>
                    <td style={{ padding: '4px 0' }}>{check.category} {check.memo ? `- ${check.memo}` : ''}</td>
                    <td style={{ textAlign: 'right', padding: '4px 0' }}>${check.amount.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
              <div style={{ position: 'absolute', bottom: '0.25in', right: '0.25in', fontWeight: 'bold' }}>
                Total: ${check.amount.toFixed(2)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
