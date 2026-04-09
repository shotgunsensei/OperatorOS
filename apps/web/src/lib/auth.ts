'use client';

const API_BASE = '/api';

async function apiFetch(path: string, options: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

export const authApi = {
  register: (email: string, password: string, name: string) =>
    apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, name }) }),

  login: (email: string, password: string) =>
    apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  logout: () => apiFetch('/auth/logout', { method: 'POST' }),

  me: () => apiFetch('/auth/me'),

  forgotPassword: (email: string) =>
    apiFetch('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),

  resetPassword: (token: string, newPassword: string) =>
    apiFetch('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, newPassword }) }),

  updateProfile: (data: { name?: string; avatarUrl?: string }) =>
    apiFetch('/auth/profile', { method: 'PUT', body: JSON.stringify(data) }),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiFetch('/auth/change-password', { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) }),

  changeEmail: (newEmail: string, password: string) =>
    apiFetch('/auth/change-email', { method: 'PUT', body: JSON.stringify({ newEmail, password }) }),

  requestDeletion: (password: string) =>
    apiFetch('/auth/request-deletion', { method: 'POST', body: JSON.stringify({ password }) }),
};

export const saasApi = {
  dashboard: () => apiFetch('/saas/dashboard'),
  plans: () => apiFetch('/saas/plans'),

  getWorkspaces: () => apiFetch('/saas/workspaces'),
  createWorkspace: (name: string, description?: string) =>
    apiFetch('/saas/workspaces', { method: 'POST', body: JSON.stringify({ name, description }) }),
  getWorkspace: (id: string) => apiFetch(`/saas/workspaces/${id}`),
  deleteWorkspace: (id: string) => apiFetch(`/saas/workspaces/${id}`, { method: 'DELETE' }),

  getProjects: (wsId: string) => apiFetch(`/saas/workspaces/${wsId}/projects`),
  createProject: (wsId: string, name: string, description?: string, color?: string) =>
    apiFetch(`/saas/workspaces/${wsId}/projects`, { method: 'POST', body: JSON.stringify({ name, description, color }) }),
  updateProject: (id: string, data: any) =>
    apiFetch(`/saas/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProject: (id: string) => apiFetch(`/saas/projects/${id}`, { method: 'DELETE' }),

  getTasks: (projectId: string) => apiFetch(`/saas/projects/${projectId}/tasks`),
  createTask: (projectId: string, data: any) =>
    apiFetch(`/saas/projects/${projectId}/tasks`, { method: 'POST', body: JSON.stringify(data) }),
  updateTask: (id: string, data: any) =>
    apiFetch(`/saas/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTask: (id: string) => apiFetch(`/saas/tasks/${id}`, { method: 'DELETE' }),

  getNotes: (params?: { workspaceId?: string; projectId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.workspaceId) qs.set('workspaceId', params.workspaceId);
    if (params?.projectId) qs.set('projectId', params.projectId);
    return apiFetch(`/saas/notes?${qs.toString()}`);
  },
  createNote: (data: any) =>
    apiFetch('/saas/notes', { method: 'POST', body: JSON.stringify(data) }),
  updateNote: (id: string, data: any) =>
    apiFetch(`/saas/notes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteNote: (id: string) => apiFetch(`/saas/notes/${id}`, { method: 'DELETE' }),

  getActivity: (params?: { workspaceId?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.workspaceId) qs.set('workspaceId', params.workspaceId);
    if (params?.limit) qs.set('limit', String(params.limit));
    return apiFetch(`/saas/activity?${qs.toString()}`);
  },
};

export const billingApi = {
  getSubscription: () => apiFetch('/billing/subscription'),
  getUsage: () => apiFetch('/billing/usage'),
  getPlans: () => apiFetch('/billing/plans'),
  checkDowngrade: (planSlug: string) =>
    apiFetch('/billing/check-downgrade', { method: 'POST', body: JSON.stringify({ planSlug }) }),
  subscribe: (planSlug: string) =>
    apiFetch('/billing/subscribe', { method: 'POST', body: JSON.stringify({ planSlug }) }),
  cancel: () => apiFetch('/billing/cancel', { method: 'POST' }),
  reactivate: () => apiFetch('/billing/reactivate', { method: 'POST' }),
  getHistory: () => apiFetch('/billing/history'),
};

export const adminApi = {
  getUsers: (params?: { search?: string; status?: string; plan?: string; role?: string; sort?: string; order?: string; page?: number }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.status) qs.set('status', params.status);
    if (params?.plan) qs.set('plan', params.plan);
    if (params?.role) qs.set('role', params.role);
    if (params?.sort) qs.set('sort', params.sort);
    if (params?.order) qs.set('order', params.order);
    if (params?.page) qs.set('page', String(params.page));
    return apiFetch(`/admin/users?${qs.toString()}`);
  },
  getUser: (id: string) => apiFetch(`/admin/users/${id}`),
  updateUserStatus: (id: string, status: string, reason?: string) =>
    apiFetch(`/admin/users/${id}/status`, { method: 'PUT', body: JSON.stringify({ status, reason }) }),
  updateUserRole: (id: string, role: string) =>
    apiFetch(`/admin/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) }),
  updateUserPlan: (id: string, planSlug: string) =>
    apiFetch(`/admin/users/${id}/plan`, { method: 'PUT', body: JSON.stringify({ planSlug }) }),
  updateSubscriptionStatus: (id: string, status: string, reason?: string) =>
    apiFetch(`/admin/users/${id}/subscription-status`, { method: 'PUT', body: JSON.stringify({ status, reason }) }),
  setTrial: (id: string, trialEndDate: string) =>
    apiFetch(`/admin/users/${id}/trial`, { method: 'PUT', body: JSON.stringify({ trialEndDate }) }),
  unlockUser: (id: string) =>
    apiFetch(`/admin/users/${id}/unlock`, { method: 'PUT' }),
  deleteUser: (id: string) => apiFetch(`/admin/users/${id}`, { method: 'DELETE' }),
  hardDeleteUser: (id: string) => apiFetch(`/admin/users/${id}/hard`, { method: 'DELETE' }),
  addNote: (userId: string, content: string) =>
    apiFetch(`/admin/users/${userId}/notes`, { method: 'POST', body: JSON.stringify({ content }) }),
  deleteNote: (noteId: string) =>
    apiFetch(`/admin/notes/${noteId}`, { method: 'DELETE' }),
  getMetrics: () => apiFetch('/admin/metrics'),
  getAuditLog: (params?: { page?: number; action?: string; userId?: string; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.action) qs.set('action', params.action);
    if (params?.userId) qs.set('userId', params.userId);
    if (params?.search) qs.set('search', params.search);
    return apiFetch(`/admin/audit-log?${qs.toString()}`);
  },
  getBillingEvents: (params?: { page?: number; userId?: string; eventType?: string }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.userId) qs.set('userId', params.userId);
    if (params?.eventType) qs.set('eventType', params.eventType);
    return apiFetch(`/admin/billing-events?${qs.toString()}`);
  },
};
