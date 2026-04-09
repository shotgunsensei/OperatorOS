'use client';

import { useEffect, useState } from 'react';
import { saasApi, billingApi } from '@/lib/auth';
import { colors } from '../SaasLayout';
import UpgradeModal from '../UpgradeModal';
import { useToast } from '../Toast';

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [usage, setUsage] = useState<any>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState('');
  const { toast } = useToast();

  const loadData = async () => {
    try {
      const [wsData, usageData] = await Promise.all([
        saasApi.getWorkspaces(),
        billingApi.getUsage(),
      ]);
      setWorkspaces(wsData.workspaces);
      setUsage(usageData.usage);
    } catch { toast('Failed to load workspaces', 'error'); } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const isAtLimit = usage?.workspaces && usage.workspaces.used >= usage.workspaces.limit && usage.workspaces.limit < 999;

  const handleCreateClick = () => {
    if (isAtLimit) {
      setUpgradeMessage(`You've reached your workspace limit (${usage.workspaces.limit}). Upgrade to create more.`);
      setShowUpgrade(true);
      return;
    }
    setShowCreate(true);
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true); setError('');
    try {
      await saasApi.createWorkspace(name.trim(), description.trim());
      toast('Workspace created');
      await loadData();
      setShowCreate(false); setName(''); setDescription('');
    } catch (err: any) {
      if (err.upgrade) {
        setUpgradeMessage(err.error);
        setShowUpgrade(true);
      } else {
        setError(err.error || 'Failed to create workspace');
      }
    } finally { setCreating(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this workspace and all associated data?')) return;
    try {
      await saasApi.deleteWorkspace(id);
      toast('Workspace deleted');
      await loadData();
    } catch { toast('Failed to delete workspace', 'error'); }
  };

  return (
    <div style={{ padding: 'clamp(16px, 3vw, 40px)', maxWidth: 1200 }} data-testid="workspaces-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: 0 }}>Workspaces</h1>
          <p style={{ fontSize: 14, color: colors.textMuted, margin: '4px 0 0' }}>
            Manage your team workspaces
            {usage?.workspaces && (
              <span style={{ marginLeft: 8, fontSize: 12, color: isAtLimit ? colors.accentYellow : colors.textDim }}>
                ({usage.workspaces.used}/{usage.workspaces.limit >= 999 ? '\u221e' : usage.workspaces.limit} used)
              </span>
            )}
          </p>
        </div>
        <button data-testid="button-create-workspace" onClick={handleCreateClick}
          style={{
            padding: '8px 16px', borderRadius: 8, border: 'none',
            background: isAtLimit ? colors.bgHover : colors.accent,
            color: isAtLimit ? colors.textMuted : '#fff',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
          {isAtLimit && <span style={{ fontSize: 12 }}>{'\ud83d\udd12'}</span>}
          New workspace
        </button>
      </div>

      {error && <div style={{ padding: '10px 14px', marginBottom: 16, borderRadius: 8, background: 'rgba(248,81,73,0.1)', border: `1px solid ${colors.accentRed}`, color: colors.accentRed, fontSize: 13 }}>{error}</div>}

      {isAtLimit && (
        <div data-testid="limit-banner-workspaces" style={{
          padding: '12px 16px', marginBottom: 20, borderRadius: 8,
          background: 'rgba(210,153,34,0.08)', border: `1px solid ${colors.accentYellow}33`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <span style={{ fontSize: 13, color: colors.accentYellow, fontWeight: 600 }}>Workspace limit reached</span>
            <span style={{ fontSize: 12, color: colors.textMuted, marginLeft: 8 }}>
              You're using {usage.workspaces.used} of {usage.workspaces.limit} workspaces.
            </span>
          </div>
          <button onClick={() => { setUpgradeMessage(''); setShowUpgrade(true); }}
            style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg, #58a6ff, #bc8cff)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Upgrade
          </button>
        </div>
      )}

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
          <div style={{
            width: 64, height: 64, borderRadius: 16, margin: '0 auto 20px',
            background: 'linear-gradient(135deg, rgba(88,166,255,0.15), rgba(188,140,255,0.15))',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
          }}>{'\u2b21'}</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: 8 }}>Welcome to OperatorOS</div>
          <div style={{ fontSize: 14, color: colors.textMuted, marginBottom: 20, maxWidth: 360, margin: '0 auto 20px' }}>
            Workspaces are where you organize projects and collaborate with your team. Create one to get started.
          </div>
          <button data-testid="button-empty-create-workspace" onClick={() => setShowCreate(true)}
            style={{
              padding: '10px 24px', borderRadius: 8, border: 'none',
              background: 'linear-gradient(135deg, #58a6ff, #bc8cff)', color: '#fff',
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}>
            Create your first workspace
          </button>
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
                  <div style={{ fontSize: 11, color: colors.textDim }}>{ws.slug} \u00b7 created {new Date(ws.createdAt).toLocaleDateString()}</div>
                </div>
                <button onClick={() => handleDelete(ws.id)}
                  style={{ background: 'none', border: 'none', color: colors.textDim, cursor: 'pointer', fontSize: 16 }}
                  onMouseEnter={e => (e.currentTarget.style.color = colors.accentRed)} onMouseLeave={e => (e.currentTarget.style.color = colors.textDim)}>x</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <UpgradeModal
        isOpen={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        onUpgraded={() => loadData()}
        message={upgradeMessage}
        resource="workspaces"
      />
    </div>
  );
}
