'use client';

import { useState, useEffect, useCallback } from 'react';
import { api, processApi, serviceApi } from '@/lib/api';
import type { Workspace } from '@/lib/api';

interface Props {
  workspaceId: string | null;
  onSelect: (id: string) => void;
}

export default function WorkspacePanel({ workspaceId, onSelect }: Props) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [stats, setStats] = useState<{ processes: number; services: number }>({ processes: 0, services: 0 });
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
      const [workspaceData, processes, services] = await Promise.all([
        api.getWorkspace(id),
        processApi.list(id).catch(() => ({ processes: [] } as any)),
        serviceApi.list(id).catch(() => ({ services: [] } as any)),
      ]);
      setWorkspace(workspaceData);
      setStats({ processes: processes.processes?.length ?? 0, services: services.services?.length ?? 0 });
    } catch {}
  }, []);

  useEffect(() => {
    loadList();
    const interval = setInterval(loadList, 10000);
    return () => clearInterval(interval);
  }, [loadList]);

  useEffect(() => {
    if (!workspaceId) return;
    loadWorkspace(workspaceId);
    const interval = setInterval(() => loadWorkspace(workspaceId), 5000);
    return () => clearInterval(interval);
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
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #21262d', fontSize: 12, color: '#8b949e', fontWeight: 700 }}>
        Workspaces / System Shell
      </div>

      <div style={{ padding: 12, borderBottom: '1px solid #21262d' }}>
        <input data-testid="input-git-url" value={gitUrl} onChange={(e) => setGitUrl(e.target.value)} placeholder="Git URL (https://...)" style={{ width: '100%', background: '#161b22', border: '1px solid #30363d', color: '#c9d1d9', borderRadius: 6, padding: '8px 10px', fontSize: 12, marginBottom: 8, boxSizing: 'border-box' }} />
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input data-testid="input-git-ref" value={gitRef} onChange={(e) => setGitRef(e.target.value)} placeholder="Ref" style={{ flex: 1, background: '#161b22', border: '1px solid #30363d', color: '#c9d1d9', borderRadius: 6, padding: '8px 10px', fontSize: 12, boxSizing: 'border-box' }} />
          <select data-testid="select-profile" value={profileId} onChange={(e) => setProfileId(e.target.value)} style={{ flex: 1, background: '#161b22', border: '1px solid #30363d', color: '#c9d1d9', borderRadius: 6, padding: '8px 10px', fontSize: 12 }}>
            <option value="node20">Node.js 20</option>
            <option value="python311">Python 3.11</option>
            <option value="go122">Go 1.22</option>
            <option value="dotnet8">.NET 8</option>
            <option value="java21">Java 21</option>
          </select>
        </div>
        <button data-testid="button-create-workspace" disabled={creating} onClick={handleCreate} style={{ width: '100%', background: '#238636', border: 'none', color: '#fff', borderRadius: 6, padding: '9px 12px', cursor: 'pointer', fontWeight: 700 }}>
          {creating ? 'Creating...' : 'Create workspace'}
        </button>
        {error && <div style={{ color: '#f85149', fontSize: 11, marginTop: 8 }}>{error}</div>}
      </div>

      <div style={{ padding: 12, borderBottom: '1px solid #21262d' }}>
        {workspace ? (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Selected workspace</div>
            <div style={{ fontSize: 11, marginBottom: 4, color: '#c9d1d9' }}>{workspace.gitUrl}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              <span style={{ background: '#161b22', color: statusColor[workspace.status] || '#8b949e', border: '1px solid #30363d', borderRadius: 999, padding: '2px 8px', fontSize: 10 }}>{workspace.status}</span>
              <span style={{ background: '#161b22', color: '#8b949e', border: '1px solid #30363d', borderRadius: 999, padding: '2px 8px', fontSize: 10 }}>{workspace.profileId}</span>
              <span data-testid="text-process-count" style={{ background: '#161b22', color: '#8b949e', border: '1px solid #30363d', borderRadius: 999, padding: '2px 8px', fontSize: 10 }}>{stats.processes} proc</span>
              <span data-testid="text-service-count" style={{ background: '#161b22', color: '#8b949e', border: '1px solid #30363d', borderRadius: 999, padding: '2px 8px', fontSize: 10 }}>{stats.services} svc</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button data-testid="button-start-workspace" disabled={actionLoading === 'start'} onClick={handleStart} style={{ flex: 1, background: '#1f6feb', border: 'none', color: '#fff', borderRadius: 6, padding: '8px 10px', cursor: 'pointer' }}>{actionLoading === 'start' ? 'Starting...' : 'Start'}</button>
              <button data-testid="button-stop-workspace" disabled={actionLoading === 'stop'} onClick={handleStop} style={{ flex: 1, background: '#30363d', border: 'none', color: '#fff', borderRadius: 6, padding: '8px 10px', cursor: 'pointer' }}>{actionLoading === 'stop' ? 'Stopping...' : 'Stop'}</button>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12, color: '#8b949e' }}>Select a workspace to reveal system controls.</div>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {workspaces.map((ws) => (
          <button key={ws.id} data-testid={`button-workspace-${ws.id}`} onClick={() => onSelect(ws.id)} style={{ width: '100%', textAlign: 'left', padding: 12, background: workspaceId === ws.id ? '#161b22' : 'transparent', border: 'none', borderBottom: '1px solid #161b22', cursor: 'pointer', color: '#c9d1d9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <strong style={{ fontSize: 12 }}>{ws.gitUrl.split('/').pop() || ws.id.slice(0, 8)}</strong>
              <span style={{ fontSize: 10, color: statusColor[ws.status] || '#8b949e' }}>{ws.status}</span>
            </div>
            <div style={{ fontSize: 10, color: '#8b949e', marginTop: 4 }}>{ws.gitRef} · {ws.profileId}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
