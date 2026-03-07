function getApiBase(): string {
  if (typeof window !== 'undefined') {
    const mobileApiUrl = (window as any).__CAPACITOR_API_URL__;
    if (mobileApiUrl) return mobileApiUrl + '/v1';
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

export interface WorkspaceProcess {
  id: string;
  workspaceId: string;
  name: string;
  command: string;
  status: string;
  providerProcessId?: string | null;
  serviceId?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  exitCode?: number | null;
  durationMs?: number | null;
  logPath?: string | null;
}

export interface WorkspaceService {
  id: string;
  workspaceId: string;
  name: string;
  type: string;
  command: string;
  status: string;
  port?: number | null;
  protocol: string;
  healthPath?: string | null;
  processId?: string | null;
  startedAt?: string | null;
  stoppedAt?: string | null;
}

export interface AutomationRule {
  id: string;
  workspaceId: string;
  name: string;
  triggerType: string;
  triggerJson?: Record<string, unknown>;
  actionType: string;
  actionJson?: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SystemEvent {
  id: string;
  workspaceId?: string | null;
  source: string;
  type: string;
  severity: string;
  payload?: Record<string, unknown>;
  ts: string;
}

export interface SystemNotification {
  id: string;
  workspaceId?: string | null;
  title: string;
  message: string;
  level: string;
  read: boolean;
  createdAt: string;
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
  readFile: (id: string, filePath: string) =>
    request<FileContent>(`/workspaces/${id}/read-file`, {
      method: 'POST',
      body: JSON.stringify({ path: filePath }),
    }),
  applyPatch: (id: string, diff: string) =>
    request<PatchResult>(`/workspaces/${id}/apply-patch`, {
      method: 'POST',
      body: JSON.stringify({ diff }),
    }),
  gitStatus: (id: string) =>
    request<{ status: string }>(`/workspaces/${id}/git-status`, { method: 'POST' }),
  verify: (id: string) =>
    request<{ results: Array<{ name: string; passed: boolean; output: string }> }>(`/workspaces/${id}/verify`, { method: 'POST' }),
};

export const processApi = {
  list: (workspaceId: string) =>
    request<{ processes: WorkspaceProcess[]; total: number }>(`/workspaces/${workspaceId}/processes`),
  start: (workspaceId: string, data: { name?: string; command: string; background?: boolean; timeoutSec?: number }) =>
    request<WorkspaceProcess>(`/workspaces/${workspaceId}/processes`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  stop: (workspaceId: string, processId: string) =>
    request<{ ok: boolean }>(`/workspaces/${workspaceId}/processes/${processId}/stop`, { method: 'POST' }),
  logs: (workspaceId: string, processId: string) =>
    request<{ logs: string; process: WorkspaceProcess }>(`/workspaces/${workspaceId}/processes/${processId}/logs`),
};

export const serviceApi = {
  list: (workspaceId: string) =>
    request<{ services: WorkspaceService[]; total: number }>(`/workspaces/${workspaceId}/services`),
  start: (workspaceId: string, data: { name?: string; command?: string; port?: number; type?: string; healthPath?: string }) =>
    request<{ service: WorkspaceService; process: WorkspaceProcess }>(`/workspaces/${workspaceId}/services/start`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  stop: (workspaceId: string, serviceId: string) =>
    request<{ ok: boolean }>(`/workspaces/${workspaceId}/services/${serviceId}/stop`, { method: 'POST' }),
  status: (workspaceId: string, serviceId: string) =>
    request<{ service: WorkspaceService }>(`/workspaces/${workspaceId}/services/${serviceId}/status`),
};

export const automationApi = {
  list: (workspaceId: string) =>
    request<{ automations: AutomationRule[]; total: number }>(`/workspaces/${workspaceId}/automations`),
  create: (workspaceId: string, data: { name: string; triggerType: string; actionType: string; triggerJson?: Record<string, unknown>; actionJson?: Record<string, unknown> }) =>
    request<AutomationRule>(`/workspaces/${workspaceId}/automations`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  toggle: (workspaceId: string, ruleId: string, enabled: boolean) =>
    request<{ ok: boolean; enabled: boolean }>(`/workspaces/${workspaceId}/automations/${ruleId}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }),
};

export const systemApi = {
  status: () => request<{ ok: boolean; counts: { workspaces: number; activeProcesses: number; activeServices: number; unreadNotifications: number }; ts: string }>('/system/status'),
  events: (workspaceId?: string, limit?: number) => {
    const params = new URLSearchParams();
    if (workspaceId) params.set('workspaceId', workspaceId);
    if (limit) params.set('limit', String(limit));
    return request<{ events: SystemEvent[]; total: number }>(`/system/events?${params.toString()}`);
  },
  notifications: (workspaceId?: string, limit?: number) => {
    const params = new URLSearchParams();
    if (workspaceId) params.set('workspaceId', workspaceId);
    if (limit) params.set('limit', String(limit));
    return request<{ notifications: SystemNotification[]; total: number }>(`/system/notifications?${params.toString()}`);
  },
  markNotificationRead: (id: string) => request<{ ok: boolean }>(`/system/notifications/${id}/read`, { method: 'POST' }),
};

export interface AgentTask {
  taskId: string;
  id: string;
  workspaceId: string;
  title: string;
  goal?: string;
  status: string;
  resultSummary?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface AgentEventData {
  type: string;
  payload: Record<string, unknown>;
  ts?: string;
}

export const agentApi = {
  createTask: (workspaceId: string, goal: string) =>
    request<AgentTask>('/tasks', {
      method: 'POST',
      body: JSON.stringify({ workspaceId, goal }),
    }),
  runTask: (taskId: string) => request<{ status: string; taskId: string }>(`/tasks/${taskId}/run`, { method: 'POST' }),
  getTask: (taskId: string) => request<AgentTask>(`/tasks/${taskId}`),
  getTaskEvents: (taskId: string) => request<{ events: AgentEventData[]; total: number }>(`/tasks/${taskId}/events`),
  listTasks: (workspaceId: string) => request<{ tasks: AgentTask[]; total: number }>(`/tasks?workspaceId=${workspaceId}`),
  streamEvents: (taskId: string): EventSource => {
    const base = getApiBase();
    return new EventSource(`${base}/tasks/${taskId}/events/stream`);
  },
};

export function wsStreamUrl(workspaceId: string): string {
  if (typeof window !== 'undefined') {
    const mobileApiUrl = (window as any).__CAPACITOR_API_URL__;
    if (mobileApiUrl) return `${mobileApiUrl.replace(/^http/, 'ws')}/v1/runner/stream/${workspaceId}`;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws/runner/stream/${workspaceId}`;
  }
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
  return `${apiUrl.replace(/^http/, 'ws')}/v1/runner/stream/${workspaceId}`;
}
