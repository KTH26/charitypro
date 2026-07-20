import React, { useEffect, useState } from 'react';
import { Shield, Search, ArrowRight, Activity, Calendar, User, Database, Diff } from 'lucide-react';

type AuditLog = {
  audit_id: number;
  record_id: string;
  record_type: string;
  action: string;
  old_revision: number | null;
  new_revision: number | null;
  old_data: string | null;
  new_data: string | null;
  changed_by_user_id: string;
  changed_by_email: string;
  changed_at: number;
  mutation_id: string;
  reason: string | null;
};

export const AuditHistory: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filters
  const [recordType, setRecordType] = useState('all');
  const [action, setAction] = useState('all');
  const [searchUser, setSearchUser] = useState('');
  const [searchId, setSearchId] = useState('');

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      // Temporarily fetching without full auth token for local dev, 
      // but in prod this would carry the Cloudflare Access cookie/token
      const res = await fetch('/api/sync2/hardened/audit?limit=200');
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
           setError('Forbidden: You do not have permission to view the audit log.');
        } else {
           setError('Failed to load audit history.');
        }
        return;
      }
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs);
      }
    } catch (e) {
      setError('Network error loading audit logs.');
    } finally {
      setLoading(false);
    }
  };

  const getDiff = (oldJson: string | null, newJson: string | null) => {
    try {
      const oldObj = oldJson && oldJson !== '{}' ? JSON.parse(oldJson) : {};
      const newObj = newJson && newJson !== '{}' ? JSON.parse(newJson) : {};
      
      const allKeys = Array.from(new Set([...Object.keys(oldObj), ...Object.keys(newObj)]));
      const changes: { field: string, old: any, new: any }[] = [];
      
      for (const key of allKeys) {
        if (JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key])) {
          changes.push({ field: key, old: oldObj[key], new: newObj[key] });
        }
      }
      return changes;
    } catch (e) {
      return null; // Failed to parse
    }
  };

  const filteredLogs = logs.filter(log => {
    if (recordType !== 'all' && log.record_type !== recordType) return false;
    if (action !== 'all' && log.action !== action) return false;
    if (searchUser && !log.changed_by_email.toLowerCase().includes(searchUser.toLowerCase())) return false;
    if (searchId && !log.record_id.toLowerCase().includes(searchId.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1><Shield size={24} style={{ display: 'inline', marginRight: '10px', verticalAlign: 'bottom' }} /> Audit History</h1>
          <p className="text-muted">Immutable ledger of all financial and system changes</p>
        </div>
      </div>
      
      {error && (
         <div style={{ padding: '20px', background: 'var(--bg-card)', borderLeft: '4px solid red', marginBottom: '20px' }}>
           <h3 style={{ color: 'red' }}>Access Denied</h3>
           <p>{error}</p>
         </div>
      )}
      
      {!error && (
        <>
          <div className="card" style={{ marginBottom: '20px', display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label className="form-label"><Database size={14} /> Record Type</label>
              <select className="form-input" value={recordType} onChange={e => setRecordType(e.target.value)}>
                <option value="all">All Types</option>
                <option value="transactions">Transactions</option>
                <option value="donors">Donors</option>
                <option value="bills">Bills</option>
                <option value="vendors">Vendors</option>
                <option value="payroll">Payroll</option>
              </select>
            </div>
            
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label className="form-label"><Activity size={14} /> Action</label>
              <select className="form-input" value={action} onChange={e => setAction(e.target.value)}>
                <option value="all">All Actions</option>
                <option value="insert">Insert (Created)</option>
                <option value="update">Update (Modified)</option>
                <option value="delete">Delete (Tombstoned)</option>
              </select>
            </div>
            
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label className="form-label"><User size={14} /> User Email</label>
              <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
                <input 
                  type="text" 
                  className="form-input" 
                  style={{ paddingLeft: '35px' }} 
                  placeholder="Filter by user..." 
                  value={searchUser} 
                  onChange={e => setSearchUser(e.target.value)} 
                />
              </div>
            </div>
            
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label className="form-label">Record ID</label>
              <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
                <input 
                  type="text" 
                  className="form-input" 
                  style={{ paddingLeft: '35px' }} 
                  placeholder="Filter by record ID..." 
                  value={searchId} 
                  onChange={e => setSearchId(e.target.value)} 
                />
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading audit records...</div>
            ) : filteredLogs.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No audit records found.</div>
            ) : (
              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '12px 15px', textAlign: 'left' }}>Time</th>
                    <th style={{ padding: '12px 15px', textAlign: 'left' }}>User</th>
                    <th style={{ padding: '12px 15px', textAlign: 'left' }}>Action</th>
                    <th style={{ padding: '12px 15px', textAlign: 'left' }}>Record</th>
                    <th style={{ padding: '12px 15px', textAlign: 'left' }}>Changes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map(log => {
                    const diff = getDiff(log.old_data, log.new_data);
                    
                    return (
                      <tr key={log.audit_id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px 15px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                           <div style={{ fontWeight: 500 }}>{new Date(log.changed_at).toLocaleDateString()}</div>
                           <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{new Date(log.changed_at).toLocaleTimeString()}</div>
                        </td>
                        <td style={{ padding: '12px 15px', verticalAlign: 'top' }}>
                           <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--navy)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}>
                                {log.changed_by_email.substring(0,2).toUpperCase()}
                              </div>
                              <span style={{ fontSize: '0.9rem' }}>{log.changed_by_email}</span>
                           </div>
                        </td>
                        <td style={{ padding: '12px 15px', verticalAlign: 'top' }}>
                           <span className={`badge ${log.action === 'insert' ? 'badge-success' : log.action === 'delete' ? 'badge-danger' : 'badge-warning'}`}>
                             {log.action.toUpperCase()}
                           </span>
                           <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                             v{log.old_revision || 0} <ArrowRight size={10} style={{ display: 'inline', margin: '0 2px' }} /> v{log.new_revision}
                           </div>
                        </td>
                        <td style={{ padding: '12px 15px', verticalAlign: 'top' }}>
                           <div style={{ fontWeight: 500 }}>{log.record_type}</div>
                           <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{log.record_id}</div>
                        </td>
                        <td style={{ padding: '12px 15px', verticalAlign: 'top', maxWidth: '300px' }}>
                           {diff ? (
                             <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                               {diff.map(change => (
                                 <div key={change.field} style={{ fontSize: '0.85rem', background: 'var(--bg-app)', padding: '4px 8px', borderRadius: '4px' }}>
                                    <strong>{change.field}:</strong> 
                                    {log.action === 'insert' ? (
                                      <span style={{ color: 'green', marginLeft: '6px' }}>{JSON.stringify(change.new)}</span>
                                    ) : log.action === 'delete' ? (
                                      <span style={{ color: 'red', marginLeft: '6px', textDecoration: 'line-through' }}>{JSON.stringify(change.old)}</span>
                                    ) : (
                                      <>
                                        <span style={{ color: 'red', textDecoration: 'line-through', margin: '0 6px' }}>{JSON.stringify(change.old)}</span>
                                        <ArrowRight size={10} style={{ display: 'inline', color: 'var(--text-muted)' }} />
                                        <span style={{ color: 'green', marginLeft: '6px' }}>{JSON.stringify(change.new)}</span>
                                      </>
                                    )}
                                 </div>
                               ))}
                             </div>
                           ) : (
                             <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Raw payload</span>
                           )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
};
