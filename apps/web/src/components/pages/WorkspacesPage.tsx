'use client';

import { useEffect, useState } from 'react';
import { saasApi } from '@/lib/auth';
import { colors } from '../SaasLayout';

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const loadWorkspaces = async () => {
    try { const d = await saasApi.getWorkspaces(); setWorkspaces(d.workspaces); } catch {} finally { setLoading(false); }
  };

  useEffect(() => { loadWorkspaces(); }, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true); setError('');
    try {
      await saasApi.createWorkspace(name.trim(), description.trim());
      await loadWorkspaces();
      setShowCreate(false); setName(''); setDescription('');
    } catch (err: any) {
      setError(err.error || 'Failed to create workspace');
    } finally { setCreating(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this workspace and all associated data?')) return;
    await saasApi.deleteWorkspace(id);
    setWorkspaces(workspaces.filter(w => w.id !== id));
  };

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1200 }} data-testid="workspaces-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: 0 }}>Workspaces</h1>
          <p style={{ fontSize: 14, color: colors.textMuted, margin: '4px 0 0' }}>Manage your team workspaces</p>
        </div>
        <button data-testid="button-create-workspace" onClick={() => setShowCreate(true)}
          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: colors.accent, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          New workspace
        </button>
      </div>

      {error && <div style={{ padding: '10px 14px', marginBottom: 16, borderRadius: 8, background: 'rgba(248,81,73,0.1)', border: `1px solid ${colors.accentRed}`, color: colors.accentRed, fontSize: 13 }}>{error}</div>}

      {showCreate && (
        <div style={{ background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <input data-testid="input-workspace-name" value={name} onChange={e => setName(e.target.value)} placeholder="Workspace name"
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.bg, color: colors.text, fontSize: 14, outline: 'none', marginBottom: 12, boxSizing: 'border-box' }} />
          <input data-testid="input-workspace-desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)"
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.bg, color: colors.text, fontSize: 14, outline: 'none', marginBottom: 12, boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowCreate(false)} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${colors.border}`, background: 'transparent', color: colors.text, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            <button data-testid="button-submit-workspace" onClick={handleCreate} disabled={creating}
              style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: colors.accent, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {creating ? 'Creating...' : 'Create workspace'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, color: colors.textMuted }}>Loading workspaces...</div>
      ) : workspaces.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 12 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⬡</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 8 }}>No workspaces yet</div>
          <div style={{ fontSize: 13, color: colors.textMuted }}>Create your first workspace to start organizing</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {workspaces.map(ws => (
            <div key={ws.id} data-testid={`card-workspace-${ws.id}`}
              style={{ background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 4 }}>{ws.name}</div>
                  {ws.description && <div style={{ fontSize: 13, color: colors.textMuted, marginBottom: 8 }}>{ws.description}</div>}
                  <div style={{ fontSize: 11, color: colors.textDim }}>{ws.slug} · created {new Date(ws.createdAt).toLocaleDateString()}</div>
                </div>
                <button onClick={() => handleDelete(ws.id)}
                  style={{ background: 'none', border: 'none', color: colors.textDim, cursor: 'pointer', fontSize: 16 }}
                  onMouseEnter={e => (e.currentTarget.style.color = colors.accentRed)} onMouseLeave={e => (e.currentTarget.style.color = colors.textDim)}>×</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
