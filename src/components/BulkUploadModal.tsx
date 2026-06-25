import React, { useState } from 'react';
import { X, UploadCloud, FileType, CheckCircle, Download, AlertTriangle, User, UserPlus } from 'lucide-react';
import Papa from 'papaparse';
import { useStore } from '../store';

interface Props {
  onClose: () => void;
}

export const BulkUploadModal: React.FC<Props> = ({ onClose }) => {
  const { donors, bulkAddTransactions, addDonor } = useStore();
  const [dataType, setDataType] = useState<'donors' | 'transactions' | 'expenses' | 'pledges'>('donors');
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  
  const [step, setStep] = useState<'upload' | 'review' | 'success'>('upload');
  const [fileEncoding, setFileEncoding] = useState<'utf-8' | 'windows-1255'>('utf-8');
  const [matchedRows, setMatchedRows] = useState<any[]>([]);
  const [unmatchedRows, setUnmatchedRows] = useState<any[]>([]);
  
  // resolution state maps row index in unmatchedRows to resolution object
  const [resolutions, setResolutions] = useState<Record<number, { action: 'match' | 'create' | 'skip', donorId?: string, newFirstName?: string, newLastName?: string }>>({});

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleUpload = () => {
    if (!file) return;

    if (dataType === 'pledges' || dataType === 'transactions') {
      Papa.parse(file, {
        header: true,
        encoding: fileEncoding,
        skipEmptyLines: true,
        complete: (results) => {
          const rows = results.data as any[];
          const matched: any[] = [];
          const unmatched: any[] = [];

          rows.forEach(row => {
            const donorIdValue = (row['Donor ID'] || '').trim();
            const donor = donors.find(d => d.displayId === donorIdValue || d.id === donorIdValue);
            
            if (donor) {
              matched.push({ row, donorId: donor.id });
            } else if (row['Amount']) {
              unmatched.push(row);
            }
          });

          setMatchedRows(matched);
          setUnmatchedRows(unmatched);

          if (unmatched.length > 0) {
            setStep('review');
            const initRes: Record<number, any> = {};
            unmatched.forEach((_, i) => initRes[i] = { action: 'match', donorId: '' });
            setResolutions(initRes);
          } else {
            finalizeImport(matched, []);
          }
        }
      });
      return;
    }

    // Mock processing delay for other types
    setTimeout(() => {
      setStep('success');
      setTimeout(onClose, 2000);
    }, 1500);
  };

  const finalizeImport = (matched: any[], unmatchedWithResolutions: { row: any, res: any }[]) => {
    const allToProcess = [...matched];

    // First process creations
    unmatchedWithResolutions.forEach(({ row, res }) => {
      if (res.action === 'skip') return;
      if (res.action === 'match' && res.donorId) {
        allToProcess.push({ row, donorId: res.donorId });
      } else if (res.action === 'create' && res.newFirstName && res.newLastName) {
        const newDonorObj = {
          firstName: res.newFirstName,
          lastName: res.newLastName,
          email: '',
          phone: '',
          address: '',
          notes: 'Auto-created during bulk pledge import'
        };
        const tempId = Math.random().toString();
        addDonor({ ...newDonorObj, id: tempId } as any);
        allToProcess.push({ row, tempNameMatch: `${res.newFirstName} ${res.newLastName}`.trim() });
      }
    });

    // Now process transactions
    setTimeout(() => {
      const currentDonors = useStore.getState().donors;
      const transactionsToAdd: any[] = [];
      
      allToProcess.forEach(item => {
        let finalDonorId = item.donorId;
        if (!finalDonorId && item.tempNameMatch) {
          const d = currentDonors.find(x => x.name === item.tempNameMatch);
          if (d) finalDonorId = d.id;
        }

        if (finalDonorId && item.row['Amount']) {
          const amount = parseFloat(item.row['Amount'].replace(/[^0-9.-]/g, ''));
          if (!isNaN(amount)) {
            let parsedDate = new Date().toISOString().split('T')[0];
            if (item.row['Date']) {
              const d = new Date(item.row['Date']);
              if (!isNaN(d.getTime())) {
                parsedDate = d.toISOString().split('T')[0];
              }
            }
            transactionsToAdd.push({
              donorId: finalDonorId,
              amount: amount,
              date: parsedDate,
              type: dataType === 'pledges' ? 'recording' : 'approved',
              method: (item.row['Method']?.toLowerCase() || 'check') as any,
              currency: (item.row['Currency']?.toUpperCase() || 'CAD') as any,
              category: item.row['Category'] || 'General',
              sponsor: item.row['Sponsor'] || '',
              notes: item.row['Notes'] || ''
            });
          }
        }
      });

      if (transactionsToAdd.length > 0) {
        bulkAddTransactions(transactionsToAdd);
      }

      setStep('success');
      setTimeout(onClose, 2000);
    }, 100);
  };

  const handleReviewSubmit = () => {
    const toProcess = unmatchedRows.map((row, i) => ({ row, res: resolutions[i] }));
    for (const item of toProcess) {
      if (item.res.action === 'match' && !item.res.donorId) {
        alert('Please select a donor for all matched rows, or skip them.');
        return;
      }
      if (item.res.action === 'create' && (!item.res.newFirstName || !item.res.newLastName)) {
        alert('Please provide First and Last Name for all new donors, or skip them.');
        return;
      }
    }
    finalizeImport(matchedRows, toProcess);
  };

  const downloadSample = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    if (dataType === 'pledges') {
      csvContent += "Donor ID,Amount,Date,Currency,Category,Sponsor,Method,Notes\n";
      csvContent += "D-1001,1000,2025-06-25,CAD,General,Moshe Cohen,credit_card,Annual pledge\n";
    } else if (dataType === 'donors') {
      csvContent += "First Name,Last Name,Email,Phone,Address,Notes\n";
      csvContent += "John,Doe,john@example.com,514-555-0100,123 Main St,Sample note\n";
    } else if (dataType === 'transactions') {
      csvContent += "Donor ID,Amount,Date,Method,Currency,Category\n";
      csvContent += "D-1001,100,2025-06-25,credit_card,CAD,General\n";
    } else if (dataType === 'expenses') {
      csvContent += "Vendor,Amount,Due Date,Category\n";
      csvContent += "Office Supplies Co,150,2025-07-01,Administration\n";
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `sample_${dataType}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal ${step === 'review' ? 'modal-lg' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ margin: 0 }}>{step === 'review' ? 'Review Unmatched Records' : 'Bulk Upload'}</h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        
        {step === 'success' ? (
          <div className="modal-body" style={{ textAlign: 'center', padding: '60px 40px' }}>
            <CheckCircle size={64} style={{ color: 'var(--green)', margin: '0 auto 20px' }} />
            <h3 style={{ color: 'var(--green)', margin: '0 0 8px' }}>Upload Successful!</h3>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>Your {dataType} data has been imported.</p>
          </div>
        ) : step === 'review' ? (
          <>
            <div className="modal-body">
              <div style={{ background: 'var(--yellow-bg)', color: 'var(--yellow)', padding: '16px', borderRadius: '12px', display: 'flex', gap: '12px', marginBottom: '24px' }}>
                <AlertTriangle size={24} />
                <div>
                  <div style={{ fontWeight: 700, marginBottom: '4px' }}>{unmatchedRows.length} rows could not be matched automatically.</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Please assign them to an existing donor, create a new donor, or skip them.</div>
                </div>
              </div>

              <div style={{ display: 'grid', gap: '16px', maxHeight: '50vh', overflowY: 'auto', paddingRight: '8px' }}>
                {unmatchedRows.map((row, i) => (
                  <div key={i} style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', background: 'var(--bg-card)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--navy)' }}>Row {i+1}: {row['Donor ID'] || '(Empty ID)'}</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Amount: ${row['Amount']} | Date: {row['Date'] || 'N/A'}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {(['match', 'create', 'skip'] as const).map(action => (
                          <button key={action} onClick={() => setResolutions({...resolutions, [i]: { ...resolutions[i], action }})} style={{
                            padding: '6px 12px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize',
                            background: resolutions[i]?.action === action ? 'var(--navy-light)' : 'var(--bg-input)',
                            color: resolutions[i]?.action === action ? '#fff' : 'var(--text-muted)',
                            border: 'none', transition: 'all 0.2s'
                          }}>{action}</button>
                        ))}
                      </div>
                    </div>

                    {resolutions[i]?.action === 'match' && (
                      <div className="form-group" style={{ margin: 0 }}>
                        <label><User size={14} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }}/> Select Donor</label>
                        <select value={resolutions[i]?.donorId || ''} onChange={e => setResolutions({...resolutions, [i]: {...resolutions[i], donorId: e.target.value}})}>
                          <option value="">-- Choose Existing --</option>
                          {donors.map(d => <option key={d.id} value={d.id}>{d.displayId} - {d.name}</option>)}
                        </select>
                      </div>
                    )}

                    {resolutions[i]?.action === 'create' && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label><UserPlus size={14} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }}/> First Name</label>
                          <input type="text" placeholder="First Name" value={resolutions[i]?.newFirstName || ''} onChange={e => setResolutions({...resolutions, [i]: {...resolutions[i], newFirstName: e.target.value}})}/>
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label>Last Name</label>
                          <input type="text" placeholder="Last Name" value={resolutions[i]?.newLastName || ''} onChange={e => setResolutions({...resolutions, [i]: {...resolutions[i], newLastName: e.target.value}})}/>
                        </div>
                      </div>
                    )}

                    {resolutions[i]?.action === 'skip' && (
                      <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        This row will be ignored during import.
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                <strong>{matchedRows.length}</strong> rows ready.
              </div>
              <div>
                <button className="btn btn-secondary" onClick={() => setStep('upload')} style={{ marginRight: '12px' }}>Back</button>
                <button className="btn btn-primary" onClick={handleReviewSubmit}>Finalize Import</button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="modal-body">
              <div className="form-group" style={{ marginBottom: '24px' }}>
                <label>What are you uploading?</label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  {(['donors', 'transactions', 'expenses', 'pledges'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => setDataType(type)}
                      style={{
                        flex: 1, padding: '12px', borderRadius: '12px', fontWeight: 700, textTransform: 'capitalize',
                        border: dataType === type ? '2px solid var(--navy-light)' : '2px solid var(--border)',
                        background: dataType === type ? 'var(--navy-bg)' : 'var(--bg-input)',
                        color: dataType === type ? 'var(--navy-light)' : 'var(--text-muted)',
                        cursor: 'pointer', transition: 'all 0.2s'
                      }}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div 
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                style={{
                  border: `2px dashed ${isDragging ? 'var(--navy-light)' : 'var(--border)'}`,
                  background: isDragging ? 'var(--navy-bg)' : 'var(--bg-input)',
                  borderRadius: '16px', padding: '40px', textAlign: 'center',
                  transition: 'all 0.2s', cursor: 'pointer'
                }}
              >
                {file ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                    <FileType size={48} style={{ color: 'var(--navy-light)' }} />
                    <div style={{ fontWeight: 700, color: 'var(--navy)' }}>{file.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{(file.size / 1024).toFixed(1)} KB</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                    <UploadCloud size={48} style={{ color: 'var(--text-muted)' }} />
                    <div style={{ fontWeight: 700, color: 'var(--navy)' }}>Drag & Drop your CSV file here</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>or click to browse</div>
                  </div>
                )}
              </div>

              <div style={{ marginTop: '20px', textAlign: 'center' }}>
                <label style={{ fontSize: '0.9rem', fontWeight: 600, marginRight: '8px', color: 'var(--navy)' }}>File Origin:</label>
                <select 
                  value={fileEncoding} 
                  onChange={e => setFileEncoding(e.target.value as any)}
                  style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '0.9rem', background: 'var(--bg-input)', cursor: 'pointer' }}
                >
                  <option value="utf-8">Standard CSV (UTF-8)</option>
                  <option value="windows-1255">Saved from old Excel (Hebrew/Yiddish)</option>
                </select>
              </div>

              <div style={{ marginTop: '16px', textAlign: 'center' }}>
                <button 
                  className="btn btn-secondary btn-sm" 
                  onClick={downloadSample}
                  style={{ color: 'var(--navy-light)', border: 'none', background: 'transparent', textDecoration: 'underline' }}
                >
                  <Download size={14} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} />
                  Download Sample CSV
                </button>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" disabled={!file} onClick={handleUpload}>
                <UploadCloud size={16} /> Process Upload
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
