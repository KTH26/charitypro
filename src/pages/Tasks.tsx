import React, { useState } from 'react';
import { useStore } from '../store';
import { Plus, X, Phone, Mail, Users, CreditCard, CheckSquare, AlertCircle, Trash2 } from 'lucide-react';

const TASK_TYPES = [
  { value: 'call', label: 'Phone Call', icon: <Phone size={14} /> },
  { value: 'email', label: 'Email', icon: <Mail size={14} /> },
  { value: 'meeting', label: 'Meeting', icon: <Users size={14} /> },
  { value: 'payment', label: 'Payment', icon: <CreditCard size={14} /> },
  { value: 'other', label: 'Other', icon: <CheckSquare size={14} /> },
];

const PRIORITY_COLORS: Record<string, string> = {
  high: 'var(--red)',
  medium: 'var(--yellow)',
  low: 'var(--green)',
};

export const Tasks: React.FC = () => {
  const { tasks, donors, addTask, completeTask, deleteTask } = useStore();
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('pending');
  const [form, setForm] = useState({
    donorId: '', title: '', notes: '', dueDate: '', priority: 'medium' as 'low' | 'medium' | 'high', type: 'call' as any
  });

  const filteredTasks = tasks.filter(t => {
    if (filter === 'pending') return !t.completed;
    if (filter === 'completed') return t.completed;
    return true;
  }).sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const p = { high: 0, medium: 1, low: 2 };
    return p[a.priority] - p[b.priority];
  });

  const handleAdd = () => {
    if (!form.title || !form.dueDate) return;
    addTask({
      donorId: form.donorId || undefined,
      title: form.title,
      notes: form.notes,
      dueDate: form.dueDate,
      priority: form.priority,
      type: form.type,
      completed: false,
    });
    setForm({ donorId: '', title: '', notes: '', dueDate: '', priority: 'medium', type: 'call' });
    setShowAdd(false);
  };

  const pendingCount = tasks.filter(t => !t.completed).length;
  const highCount = tasks.filter(t => !t.completed && t.priority === 'high').length;

  return (
    <div>
      {/* Summary banner */}
      {highCount > 0 && (
        <div style={{ background: 'var(--red-bg)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '14px', padding: '14px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <AlertCircle size={20} style={{ color: 'var(--red)', flexShrink: 0 }} />
          <span style={{ fontWeight: 700, color: 'var(--red)' }}>{highCount} high-priority task{highCount > 1 ? 's' : ''} require immediate attention</span>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          {([['all', `All (${tasks.length})`], ['pending', `Pending (${pendingCount})`], ['completed', 'Completed']] as [string, string][]).map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key as any)} style={{
              padding: '8px 16px', borderRadius: '999px', cursor: 'pointer',
              fontFamily: 'inherit', fontWeight: 700, fontSize: '0.85rem',
              background: filter === key ? 'var(--navy)' : 'var(--bg-card)',
              color: filter === key ? '#fff' : 'var(--text-secondary)',
              border: filter === key ? '2px solid transparent' : '1px solid var(--border)',
            }}>{label}</button>
          ))}
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <Plus size={16} /> Add Task
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {filteredTasks.map(task => {
          const linkedDonor = task.donorId ? donors.find(d => d.id === task.donorId) : null;
          const taskType = TASK_TYPES.find(t => t.value === task.type);
          const isOverdue = !task.completed && new Date(task.dueDate) < new Date();
          return (
            <div key={task.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: '16px', padding: '16px 20px',
              background: task.completed ? 'var(--bg-input)' : 'var(--bg-card)',
              borderRadius: '14px', border: `1px solid ${isOverdue ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
              opacity: task.completed ? 0.6 : 1, transition: 'all 0.2s',
              boxShadow: task.completed ? 'none' : 'var(--shadow-sm)',
            }}>
              {/* Checkbox */}
              <button onClick={() => !task.completed && completeTask(task.id)} style={{
                width: '24px', height: '24px', borderRadius: '50%', border: `2px solid ${task.completed ? 'var(--green)' : PRIORITY_COLORS[task.priority]}`,
                background: task.completed ? 'var(--green)' : 'transparent', cursor: task.completed ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px',
                transition: 'all 0.2s', color: '#fff', fontSize: '0.8rem'
              }}>
                {task.completed ? '✓' : ''}
              </button>

              {/* Content */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 700, fontSize: '1rem', color: task.completed ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: task.completed ? 'line-through' : 'none' }}>
                    {task.title}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 700, color: PRIORITY_COLORS[task.priority], background: `${PRIORITY_COLORS[task.priority]}15`, padding: '2px 8px', borderRadius: '999px' }}>
                    {task.priority.toUpperCase()}
                  </span>
                  {taskType && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--bg-input)', padding: '2px 8px', borderRadius: '999px' }}>
                      {taskType.icon} {taskType.label}
                    </span>
                  )}
                </div>
                {task.notes && <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>{task.notes}</div>}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.8rem' }}>
                  {linkedDonor && (
                    <span style={{ color: 'var(--navy-light)', fontWeight: 600 }}>👤 {linkedDonor.name}</span>
                  )}
                  <span style={{ color: isOverdue ? 'var(--red)' : 'var(--text-muted)', fontWeight: isOverdue ? 700 : 400 }}>
                    {isOverdue ? '⚠️ Overdue: ' : '📅 Due: '}{task.dueDate}
                  </span>
                </div>
              </div>

              {/* Delete */}
              <button onClick={() => deleteTask(task.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', borderRadius: '6px', transition: 'color 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--red)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
                <Trash2 size={16} />
              </button>
            </div>
          );
        })}
        {filteredTasks.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
            {filter === 'completed' ? '✅ No completed tasks yet.' : '🎉 All tasks are done!'}
          </div>
        )}
      </div>

      {/* Add Modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ margin: 0 }}>Add New Task</h2>
              <button className="modal-close" onClick={() => setShowAdd(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gap: '16px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Task Title *</label>
                  <input type="text" placeholder="e.g. Call Avraham Schwartz about pledge" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Linked Donor (optional)</label>
                    <select value={form.donorId} onChange={e => setForm(f => ({ ...f, donorId: e.target.value }))}>
                      <option value="">— No donor —</option>
                      {donors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Due Date *</label>
                    <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>Type</label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {TASK_TYPES.map(t => (
                      <button key={t.value} onClick={() => setForm(f => ({ ...f, type: t.value }))} style={{
                        padding: '8px 14px', border: `2px solid ${form.type === t.value ? 'var(--navy-light)' : 'var(--border)'}`,
                        borderRadius: '999px', background: form.type === t.value ? 'var(--navy-bg)' : 'var(--bg-input)',
                        color: form.type === t.value ? 'var(--navy-light)' : 'var(--text-muted)', fontWeight: 700,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontFamily: 'inherit'
                      }}>{t.icon} {t.label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>Priority</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {(['low', 'medium', 'high'] as const).map(p => (
                      <button key={p} onClick={() => setForm(f => ({ ...f, priority: p }))} style={{
                        padding: '8px 16px', border: `2px solid ${form.priority === p ? PRIORITY_COLORS[p] : 'var(--border)'}`,
                        borderRadius: '999px', background: form.priority === p ? `${PRIORITY_COLORS[p]}15` : 'var(--bg-input)',
                        color: form.priority === p ? PRIORITY_COLORS[p] : 'var(--text-muted)', fontWeight: 800,
                        cursor: 'pointer', textTransform: 'capitalize', fontFamily: 'inherit'
                      }}>{p}</button>
                    ))}
                  </div>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Notes (optional)</label>
                  <textarea rows={2} placeholder="Additional details…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdd} disabled={!form.title || !form.dueDate}>+ Add Task</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
