'use client';

import { useEffect, useState } from 'react';
import { saasApi, billingApi } from '@/lib/auth';
import { colors } from '../SaasLayout';
import UpgradeModal from '../UpgradeModal';

interface ProjectsPageProps {
  onNavigateToTasks: (projectId: string, projectName: string) => void;
}

export default function ProjectsPage({ onNavigateToTasks }: ProjectsPageProps) {
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [selectedWs, setSelectedWs] = useState<string>('');
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newColor, setNewColor] = useState('#3b82f6');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [usage, setUsage] = useState<any>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState('');

  const loadUsage = async () => {
    try {
      const usageData = await billingApi.getUsage();
      setUsage(usageData.usage);
    } catch {}
  };

  useEffect(() => {
    Promise.all([
      saasApi.getWorkspaces().then(d => {
        setWorkspaces(d.workspaces);
        if (d.workspaces.length > 0) setSelectedWs(d.workspaces[0].id);
      }),
      loadUsage(),
    ]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedWs) return;
    setLoading(true);
    saasApi.getProjects(selectedWs).then(d => setProjects(d.projects)).finally(() => setLoading(false));
  }, [selectedWs]);

  const isAtLimit = usage?.projects && usage.projects.used >= usage.projects.limit && usage.projects.limit < 9999;

  const handleCreateClick = () => {
    if (isAtLimit) {
      setUpgradeMessage(`You've reached your project limit (${usage.projects.limit}). Upgrade to create more.`);
      setShowUpgrade(true);
      return;
    }
    setShowCreate(true);
  };

  const handleCreate = async () => {
    if (!newName.trim() || !selectedWs) return;
    setCreating(true);
    setError('');
    try {
      await saasApi.createProject(selectedWs, newName.trim(), newDesc.trim(), newColor);
      const d = await saasApi.getProjects(selectedWs);
      setProjects(d.projects);
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      await loadUsage();
    } catch (err: any) {
      if (err.upgrade) {
        setUpgradeMessage(err.error);
        setShowUpgrade(true);
      } else {
        setError(err.error || 'Failed to create project');
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this project and all its tasks?')) return;
    await saasApi.deleteProject(id);
    setProjects(projects.filter(p => p.id !== id));
    await loadUsage();
  };

  const projectColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1200 }} data-testid="projects-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: 0 }}>Projects</h1>
          <p style={{ fontSize: 14, color: colors.textMuted, margin: '4px 0 0' }}>
            Organize your work into projects
            {usage?.projects && (
              <span style={{ marginLeft: 8, fontSize: 12, color: isAtLimit ? colors.accentYellow : colors.textDim }}>
                ({usage.projects.used}/{usage.projects.limit >= 9999 ? '\u221e' : usage.projects.limit} used)
              </span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {workspaces.length > 1 && (
            <select
              value={selectedWs}
              onChange={e => setSelectedWs(e.target.value)}
              style={{
                padding: '8px 12px', borderRadius: 8, border: `1px solid ${colors.border}`,
                background: colors.bgSecondary, color: colors.text, fontSize: 13, outline: 'none',
              }}
            >
              {workspaces.map(ws => (
                <option key={ws.id} value={ws.id}>{ws.name}</option>
              ))}
            </select>
          )}
          <button
            data-testid="button-create-project"
            onClick={handleCreateClick}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: isAtLimit ? colors.bgHover : colors.accent,
              color: isAtLimit ? colors.textMuted : '#fff',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {isAtLimit && <span style={{ fontSize: 12 }}>{'\ud83d\udd12'}</span>}
            New project
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          padding: '10px 14px', marginBottom: 16, borderRadius: 8,
          background: 'rgba(248,81,73,0.1)', border: `1px solid ${colors.accentRed}`,
          color: colors.accentRed, fontSize: 13,
        }}>{error}</div>
      )}

      {isAtLimit && (
        <div data-testid="limit-banner-projects" style={{
          padding: '12px 16px', marginBottom: 20, borderRadius: 8,
          background: 'rgba(210,153,34,0.08)', border: `1px solid ${colors.accentYellow}33`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <span style={{ fontSize: 13, color: colors.accentYellow, fontWeight: 600 }}>Project limit reached</span>
            <span style={{ fontSize: 12, color: colors.textMuted, marginLeft: 8 }}>
              You're using {usage.projects.used} of {usage.projects.limit} projects.
            </span>
          </div>
          <button onClick={() => { setUpgradeMessage(''); setShowUpgrade(true); }}
            style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg, #58a6ff, #bc8cff)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Upgrade
          </button>
        </div>
      )}

      {showCreate && (
        <div style={{
          background: colors.bgSecondary, border: `1px solid ${colors.border}`,
          borderRadius: 12, padding: 24, marginBottom: 24,
        }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <input data-testid="input-project-name" value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="Project name" style={{
                flex: 1, padding: '10px 14px', borderRadius: 8, border: `1px solid ${colors.border}`,
                background: colors.bg, color: colors.text, fontSize: 14, outline: 'none',
              }} />
          </div>
          <input data-testid="input-project-desc" value={newDesc} onChange={e => setNewDesc(e.target.value)}
            placeholder="Description (optional)" style={{
              width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${colors.border}`,
              background: colors.bg, color: colors.text, fontSize: 14, outline: 'none', marginBottom: 12, boxSizing: 'border-box',
            }} />
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {projectColors.map(c => (
              <button key={c} onClick={() => setNewColor(c)}
                style={{
                  width: 24, height: 24, borderRadius: '50%', border: newColor === c ? '2px solid #fff' : '2px solid transparent',
                  background: c, cursor: 'pointer',
                }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowCreate(false)}
              style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${colors.border}`, background: 'transparent', color: colors.text, cursor: 'pointer', fontSize: 13 }}>
              Cancel
            </button>
            <button data-testid="button-submit-project" onClick={handleCreate} disabled={creating}
              style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: colors.accent, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {workspaces.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 60, background: colors.bgSecondary,
          border: `1px solid ${colors.border}`, borderRadius: 12,
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>{'\u2b21'}</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 8 }}>No workspaces yet</div>
          <div style={{ fontSize: 13, color: colors.textMuted }}>Create a workspace first to start adding projects</div>
        </div>
      ) : loading ? (
        <div style={{ padding: 40, color: colors.textMuted }}>Loading projects...</div>
      ) : projects.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 60, background: colors.bgSecondary,
          border: `1px solid ${colors.border}`, borderRadius: 12,
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>{'\u25e7'}</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 8 }}>No projects yet</div>
          <div style={{ fontSize: 13, color: colors.textMuted }}>Create your first project to get started</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {projects.map(p => (
            <div key={p.id} data-testid={`card-project-${p.id}`}
              style={{
                background: colors.bgSecondary, border: `1px solid ${colors.border}`,
                borderRadius: 12, padding: 20, cursor: 'pointer', transition: 'border-color 0.15s',
                borderLeft: `4px solid ${p.color || '#3b82f6'}`,
              }}
              onClick={() => onNavigateToTasks(p.id, p.name)}
              onMouseEnter={e => (e.currentTarget.style.borderColor = colors.accent)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = colors.border)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 4 }}>{p.name}</div>
                  {p.description && <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 8 }}>{p.description}</div>}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: 11,
                      background: p.status === 'active' ? 'rgba(63,185,80,0.15)' : 'rgba(139,148,158,0.15)',
                      color: p.status === 'active' ? colors.accentGreen : colors.textMuted,
                    }}>{p.status}</span>
                    <span style={{ fontSize: 11, color: colors.textDim }}>{new Date(p.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <button
                  data-testid={`button-delete-project-${p.id}`}
                  onClick={e => { e.stopPropagation(); handleDelete(p.id); }}
                  style={{
                    background: 'none', border: 'none', color: colors.textDim, cursor: 'pointer',
                    fontSize: 16, padding: 4,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = colors.accentRed)}
                  onMouseLeave={e => (e.currentTarget.style.color = colors.textDim)}
                >x</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <UpgradeModal
        isOpen={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        onUpgraded={() => { loadUsage(); }}
        message={upgradeMessage}
        resource="projects"
      />
    </div>
  );
}
