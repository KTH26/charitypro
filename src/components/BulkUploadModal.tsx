import React, { useState } from 'react';
import { X, UploadCloud, FileType, CheckCircle } from 'lucide-react';

interface Props {
  onClose: () => void;
}

export const BulkUploadModal: React.FC<Props> = ({ onClose }) => {
  const [dataType, setDataType] = useState<'donors' | 'transactions' | 'expenses'>('donors');
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [success, setSuccess] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleUpload = () => {
    if (!file) return;
    // Mock processing delay
    setTimeout(() => {
      setSuccess(true);
      setTimeout(onClose, 2000);
    }, 1500);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ margin: 0 }}>Bulk Upload</h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        
        {success ? (
          <div className="modal-body" style={{ textAlign: 'center', padding: '60px 40px' }}>
            <CheckCircle size={64} style={{ color: 'var(--green)', margin: '0 auto 20px' }} />
            <h3 style={{ color: 'var(--green)', margin: '0 0 8px' }}>Upload Successful!</h3>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>Your {dataType} data has been imported.</p>
          </div>
        ) : (
          <>
            <div className="modal-body">
              <div className="form-group" style={{ marginBottom: '24px' }}>
                <label>What are you uploading?</label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  {(['donors', 'transactions', 'expenses'] as const).map(type => (
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
