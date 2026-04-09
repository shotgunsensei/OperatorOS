'use client';

import { useEffect, useState } from 'react';
import { saasApi } from '@/lib/auth';
import { colors } from '../SaasLayout';

interface TasksPageProps {
  projectId?: string;
  projectName?: string;
  onBack?: () => void;
}

const statusColors: Record<string, string> = {
  todo: '#8b949e', in_progress: '#d29922', done: '#3fb950', canceled: '#484f58',
};
const priorityColors: Record<string, string> = {
  low: '#8b949e', medium: '#58a6ff', high: '#d29922', urgent: '#f85149',
};

export default function TasksPage({ projectId, projectName, onBack }: TasksPageProps) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  const loadTasks = async () => {
    if (!projectId) { setLoading(false); return; }
    setLoading(true);
    try {
      const d = await saasApi.getTasks(projectId);
      setTasks(d.tasks);
    } catch {} finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTasks(); }, [projectId]);

  const handleCreate = async () => {
    if (!title.trim() || !projectId) return;
    setCreating(true);
    setError('');
    try {
      await saasApi.createTask(projectId, { title: title.trim(), description: description.trim(), priority });
      await loadTasks();
      setShowCreate(false);
      setTitle('');
      setDescription('');
      setPriority('medium');
    } catch (err: any) {
      setError(err.error || 'Failed to create task');
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    await saasApi.updateTask(taskId, { status: newStatus });
    await loadTasks();
  };

  const handleDelete = async (taskId: string) => {
    await saasApi.deleteTask(taskId);
    setTasks(tasks.filter(t => t.id !== taskId));
  };

  const filtered = filter === 'all' ? tasks : tasks.filter(t => t.status === filter);

  if (!projectId) {
    return (
      <div style={{ padding: '32px 40px', maxWidth: 1200 }} data-testid="tasks-page">
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Tasks</h1>
        <div style={{
          textAlign: 'center', padding: 60, background: colors.bgSecondary,
          border: `1px solid ${colors.border}`, borderRadius: 12,
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>☑</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 8 }}>Select a project</div>
          <div style={{ fontSize: 13, color: colors.textMuted }}>Go to Projects and click on a project to see its tasks</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1200 }} data-testid="tasks-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          {onBack && (
            <button data-testid="button-back" onClick={onBack}
              style={{ background: 'none', border: 'none', color: colors.accent, cursor: 'pointer', fontSize: 13, marginBottom: 4, display: 'block' }}>
              ← Back to projects
            </button>
          )}
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: 0 }}>{projectName || 'Tasks'}</h1>
          <p style={{ fontSize: 14, color: colors.textMuted, margin: '4px 0 0' }}>{filtered.length} tasks</p>
        </div>
        <button data-testid="button-create-task" onClick={() => setShowCreate(true)}
          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: colors.accent, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          New task
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['all', 'todo', 'in_progress', 'done', 'canceled'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{
              padding: '6px 12px', borderRadius: 6, border: 'none', fontSize: 12,
              background: filter === f ? colors.bgHover : 'transparent',
              color: filter === f ? colors.accent : colors.textMuted, cursor: 'pointer',
            }}>
            {f === 'all' ? 'All' : f.replace('_', ' ')}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ padding: '10px 14px', marginBottom: 16, borderRadius: 8, background: 'rgba(248,81,73,0.1)', border: `1px solid ${colors.accentRed}`, color: colors.accentRed, fontSize: 13 }}>{error}</div>
      )}

      {showCreate && (
        <div style={{ background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <input data-testid="input-task-title" value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Task title" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.bg, color: colors.text, fontSize: 14, outline: 'none', marginBottom: 12, boxSizing: 'border-box' }} />
          <textarea data-testid="input-task-desc" value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Description (optional)" rows={3} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.bg, color: colors.text, fontSize: 14, outline: 'none', marginBottom: 12, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 13, color: colors.textMuted }}>Priority:</span>
            {['low', 'medium', 'high', 'urgent'].map(p => (
              <button key={p} onClick={() => setPriority(p)}
                style={{
                  padding: '4px 10px', borderRadius: 4, border: 'none', fontSize: 12,
                  background: priority === p ? priorityColors[p] : 'transparent',
                  color: priority === p ? '#fff' : colors.textMuted, cursor: 'pointer',
                }}>{p}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowCreate(false)}
              style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${colors.border}`, background: 'transparent', color: colors.text, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            <button data-testid="button-submit-task" onClick={handleCreate} disabled={creating}
              style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: colors.accent, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {creating ? 'Creating...' : 'Create task'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, color: colors.textMuted }}>Loading tasks...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 12 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>☑</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 8 }}>No tasks yet</div>
          <div style={{ fontSize: 13, color: colors.textMuted }}>Create your first task to start tracking work</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(t => (
            <div key={t.id} data-testid={`task-row-${t.id}`}
              style={{ background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 10, padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: t.status === 'done' ? colors.textMuted : '#fff', textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>{t.title}</span>
                  <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, background: `${priorityColors[t.priority]}22`, color: priorityColors[t.priority] }}>{t.priority}</span>
                </div>
                {t.description && <div style={{ fontSize: 12, color: colors.textMuted }}>{t.description}</div>}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select value={t.status} onChange={e => handleStatusChange(t.id, e.target.value)}
                  style={{ padding: '4px 8px', borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.bg, color: statusColors[t.status], fontSize: 12, outline: 'none' }}>
                  <option value="todo">To Do</option>
                  <option value="in_progress">In Progress</option>
                  <option value="done">Done</option>
                  <option value="canceled">Canceled</option>
                </select>
                <button onClick={() => handleDelete(t.id)}
                  style={{ background: 'none', border: 'none', color: colors.textDim, cursor: 'pointer', fontSize: 14 }}
                  onMouseEnter={e => (e.currentTarget.style.color = colors.accentRed)}
                  onMouseLeave={e => (e.currentTarget.style.color = colors.textDim)}>×</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
