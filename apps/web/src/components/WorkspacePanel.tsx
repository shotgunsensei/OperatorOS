'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import type { Workspace } from '@/lib/api';

interface Props {
  workspaceId: string | null;
  onSelect: (id: string) => void;
}

export default function WorkspacePanel({ workspaceId, onSelect }: Props) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');
  const [gitUrl, setGitUrl] = useState('');
  const [gitRef, setGitRef] = useState('main');
  const [profileId, setProfileId] = useState('node20');

  const loadList = useCallback(async () => {
    try {
      const data = await api.listWorkspaces();
      setWorkspaces(data.workspaces);
    } catch {}
  }, []);

  const loadWorkspace = useCallback(async (id: string) => {
    try {
      const data = await api.getWorkspace(id);
      setWorkspace(data);
    } catch {}
  }, []);

  useEffect(() => {
    loadList();
    const interval = setInterval(loadList, 10000);
    return () => clearInterval(interval);
  }, [loadList]);

  useEffect(() => {
    if (workspaceId) {
      loadWorkspace(workspaceId);
      const interval = setInterval(() => loadWorkspace(workspaceId), 5000);
      return () => clearInterval(interval);
    }
  }, [workspaceId, loadWorkspace]);

  const handleCreate = async () => {
    if (!gitUrl.trim()) return;
    setCreating(true);
    setError('');
    try {
      const ws = await api.createWorkspace({ gitUrl, gitRef: gitRef || undefined, profileId: profileId || undefined });
      setGitUrl('');
      setGitRef('main');
      onSelect(ws.id);
      await loadList();
    } catch (err: any) {
      setError(err.message);
    }
    setCreating(false);
  };

  const handleStart = async () => {
    if (!workspaceId) return;
    setActionLoading('start');
    try {
      await api.startWorkspace(workspaceId);
      await loadWorkspace(workspaceId);
      await loadList();
    } catch (err: any) {
      setError(err.message);
    }
    setActionLoading('');
  };

  const handleStop = async () => {
    if (!workspaceId) return;
    setActionLoading('stop');
    try {
      await api.stopWorkspace(workspaceId);
      await loadWorkspace(workspaceId);
      await loadList();
    } catch (err: any) {
      setError(err.message);
    }
    setActionLoading('');
  };

  const statusColor: Record<string, string> = {
    running: '#3fb950',
    pending: '#d29922',
    stopped: '#8b949e',
    error: '#f85149',
    provisioning: '#58a6ff',
  };

  return (
    <div data-testid="workspace-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0d1117', overflow: 'auto' }}>
      <div style={{ padding: '6px 12px', borderBottom: '1px solid #21262d', fontSize: 12, color: '#8b949e', fontWeight: 600 }}>
        Workspaces
      </div>

      <div style={{ padding: 12, borderBottom: '1px solid #21262d' }}>
        <input
          data-testid="input-git-url"
          value={gitUrl}
          onChange={(e) => setGitUrl(e.target.value)}
          placeholder="Git URL (https://...)"
          style={{ width: '100%', background: '#161b22', border: '1px solid #30363d', color: '#c9d1d9', borderRadius: 4, padding: '6px 8px', fontSize: 12, marginBottom: 6, boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
          <input
            data-testid="input-git-ref"
            value={gitRef}
            onChange={(e) => setGitRef(e.target.value)}
            placeholder="Ref"
            style={{ flex: 1, background: '#161b22', border: '1px solid #30363d', color: '#c9d1d9', borderRadius: 4, padding: '6px 8px', fontSize: 12, boxSizing: 'border-box' }}
          />
          <select
            data-testid="select-profile"
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
            style={{ flex: 1, background: '#161b22', border: '1px solid #30363d', color: '#c9d1d9', borderRadius: 4, padding: '6px 8px', fontSize: 12 }}
          >
            <option value="node20">Node.js 20</option>
            <option value="python311">Python 3.11</option>
            <option value="go122">Go 1.22</option>
            <option value="dotnet8">.NET 8</option>
            <option value="java21">Java 21</option>
          </select>
        </div>
        <button
          data-testid="button-create-workspace"
          onClick={handleCreate}
          disabled={creating || !gitUrl.trim()}
          style={{ width: '100%', background: creating ? '#21262d' : '#238636', border: 'none', color: '#fff', padding: '6px', borderRadius: 4, cursor: creating ? 'default' : 'pointer', fontSize: 12, fontWeight: 600 }}
        >
          {creating ? 'Creating...' : '+ Create Workspace'}
        </button>
        {error && <div style={{ marginTop: 6, color: '#f85149', fontSize: 11 }}>{error}</div>}
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {workspaces.map((ws) => (
          <div
            key={ws.id}
            data-testid={`workspace-item-${ws.id}`}
            onClick={() => onSelect(ws.id)}
            style={{
              padding: '8px 12px',
              borderBottom: '1px solid #161b22',
              cursor: 'pointer',
              background: ws.id === workspaceId ? '#161b22' : 'transparent',
            }}
            onMouseEnter={(e) => { if (ws.id !== workspaceId) (e.currentTarget as HTMLDivElement).style.background = '#161b22'; }}
            onMouseLeave={(e) => { if (ws.id !== workspaceId) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
          >
            <div style={{ fontSize: 12, color: '#c9d1d9', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ws.gitUrl.replace('https://github.com/', '')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#8b949e' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor[ws.status] ?? '#484f58' }} />
              <span>{ws.status}</span>
              <span style={{ color: '#484f58' }}>·</span>
              <span>{ws.profileId}</span>
              <span style={{ color: '#484f58' }}>·</span>
              <span>{ws.gitRef}</span>
            </div>
          </div>
        ))}
        {workspaces.length === 0 && (
          <div style={{ padding: 16, color: '#484f58', fontSize: 12, textAlign: 'center' }}>
            No workspaces yet
          </div>
        )}
      </div>

      {workspace && workspaceId && (
        <div style={{ padding: 12, borderTop: '1px solid #21262d' }}>
          <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 6 }}>
            <strong style={{ color: '#c9d1d9' }}>ID:</strong> {workspaceId.slice(0, 8)}...
          </div>
          <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 6 }}>
            <strong style={{ color: '#c9d1d9' }}>Status:</strong>{' '}
            <span style={{ color: statusColor[workspace.status] }}>{workspace.status}</span>
          </div>
          {workspace.runner && (
            <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 6 }}>
              <strong style={{ color: '#c9d1d9' }}>Runner:</strong> {workspace.runner.phase} ({workspace.runner.mode})
            </div>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              data-testid="button-start-workspace"
              onClick={handleStart}
              disabled={!!actionLoading || workspace.status === 'running'}
              style={{
                flex: 1,
                background: workspace.status === 'running' ? '#21262d' : '#238636',
                border: 'none',
                color: '#fff',
                padding: '6px',
                borderRadius: 4,
                cursor: actionLoading || workspace.status === 'running' ? 'default' : 'pointer',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {actionLoading === 'start' ? 'Starting...' : 'Start'}
            </button>
            <button
              data-testid="button-stop-workspace"
              onClick={handleStop}
              disabled={!!actionLoading || workspace.status === 'stopped'}
              style={{
                flex: 1,
                background: workspace.status === 'stopped' ? '#21262d' : '#da3633',
                border: 'none',
                color: '#fff',
                padding: '6px',
                borderRadius: 4,
                cursor: actionLoading || workspace.status === 'stopped' ? 'default' : 'pointer',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {actionLoading === 'stop' ? 'Stopping...' : 'Stop'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
