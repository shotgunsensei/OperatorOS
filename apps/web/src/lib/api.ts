function getApiBase(): string {
  if (typeof window !== 'undefined') {
    return '/api';
  }
  return (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001') + '/v1';
}

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const base = getApiBase();
  const url = `${base}${path}`;
  const headers: Record<string, string> = {};
  if (opts?.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, {
    ...opts,
    headers: { ...headers, ...(opts?.headers as Record<string, string>) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface Workspace {
  id: string;
  gitUrl: string;
  gitRef: string;
  profileId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  runner?: {
    workspaceId: string;
    containerId?: string;
    phase: string;
    ready: boolean;
    startedAt?: string;
    mode: string;
  } | null;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  truncated: boolean;
}

export interface TreeEntry {
  path: string;
  type: 'file' | 'dir';
}

export interface FileContent {
  path: string;
  content: string;
}

export interface PatchResult {
  success: boolean;
  changedFiles: string[];
  gitStatus: string;
  error?: string;
}

export const api = {
  listWorkspaces: () => request<{ workspaces: Workspace[]; total: number }>('/workspaces'),

  getWorkspace: (id: string) => request<Workspace>(`/workspaces/${id}`),

  createWorkspace: (data: { gitUrl: string; gitRef?: string; profileId?: string }) =>
    request<Workspace>('/workspaces', { method: 'POST', body: JSON.stringify(data) }),

  startWorkspace: (id: string) =>
    request<{ success: boolean; message: string }>(`/workspaces/${id}/start`, { method: 'POST' }),

  stopWorkspace: (id: string) =>
    request<{ success: boolean; message: string }>(`/workspaces/${id}/stop`, { method: 'POST' }),

  exec: (id: string, cmd: string, timeoutSec?: number) =>
    request<ExecResult>(`/workspaces/${id}/exec`, {
      method: 'POST',
      body: JSON.stringify({ cmd, timeoutSec }),
    }),

  getTree: (id: string, path?: string, depth?: number) => {
    const params = new URLSearchParams();
    if (path) params.set('path', path);
    if (depth) params.set('depth', String(depth));
    return request<{ entries: TreeEntry[] }>(`/workspaces/${id}/tree?${params}`);
  },

  readFile: (id: string, path: string) =>
    request<FileContent>(`/workspaces/${id}/read-file`, {
      method: 'POST',
      body: JSON.stringify({ path }),
    }),

  applyPatch: (id: string, diff: string) =>
    request<PatchResult>(`/workspaces/${id}/apply-patch`, {
      method: 'POST',
      body: JSON.stringify({ diff }),
    }),

  gitStatus: (id: string) =>
    request<{ exitCode: number; status: string }>(`/workspaces/${id}/git-status`, { method: 'POST' }),

  verify: (id: string) =>
    request<{ checks: Array<{ name: string; label: string; passed: boolean; exitCode: number; stdout: string; stderr: string; durationMs: number }>; allPassed: boolean }>(
      `/workspaces/${id}/verify`,
      { method: 'POST' },
    ),
};

export function wsStreamUrl(workspaceId: string): string {
  if (typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws/runner/stream/${workspaceId}`;
  }
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
  return `${apiUrl.replace(/^http/, 'ws')}/v1/runner/stream/${workspaceId}`;
}
