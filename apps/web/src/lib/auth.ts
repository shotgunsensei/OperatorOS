'use client';

const API_BASE = '/api';

const ACTIVE_TENANT_KEY = 'activeTenantId';

export function getActiveTenantId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACTIVE_TENANT_KEY);
}

export function setActiveTenantId(tenantId: string | null) {
  if (typeof window === 'undefined') return;
  if (tenantId) localStorage.setItem(ACTIVE_TENANT_KEY, tenantId);
  else localStorage.removeItem(ACTIVE_TENANT_KEY);
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const tenantId = getActiveTenantId();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (tenantId && !headers['X-Tenant-Id']) headers['X-Tenant-Id'] = tenantId;

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
  getMode: () => apiFetch('/billing/mode'),
  checkDowngrade: (planSlug: string) =>
    apiFetch('/billing/check-downgrade', { method: 'POST', body: JSON.stringify({ planSlug }) }),
  subscribe: (planSlug: string, interval: 'month' | 'year' = 'month') =>
    apiFetch('/billing/subscribe', { method: 'POST', body: JSON.stringify({ planSlug, interval }) }),
  createCheckoutSession: (planSlug: string, interval: 'month' | 'year' = 'month') =>
    apiFetch('/billing/create-checkout-session', { method: 'POST', body: JSON.stringify({ planSlug, interval }) }),
  createPortalSession: () =>
    apiFetch('/billing/create-portal-session', { method: 'POST' }),
  cancel: () => apiFetch('/billing/cancel', { method: 'POST' }),
  reactivate: () => apiFetch('/billing/reactivate', { method: 'POST' }),
  getHistory: () => apiFetch('/billing/history'),
};

export const aiApi = {
  getTools: () => apiFetch('/ai/tools'),
  getUsage: () => apiFetch('/ai/usage'),
  getHistory: (limit?: number) => apiFetch(`/ai/history${limit ? `?limit=${limit}` : ''}`),
  execute: (toolType: string, input: string, templateId?: string) =>
    apiFetch('/ai/execute', { method: 'POST', body: JSON.stringify({ toolType, input, templateId }) }),
  checkAccess: (toolType: string) =>
    apiFetch('/ai/check-access', { method: 'POST', body: JSON.stringify({ toolType }) }),
  getTemplates: () => apiFetch('/ai/templates'),
  createTemplate: (data: { name: string; description?: string; toolType: string; promptText: string }) =>
    apiFetch('/ai/templates', { method: 'POST', body: JSON.stringify(data) }),
  updateTemplate: (id: string, data: { name?: string; description?: string; promptText?: string }) =>
    apiFetch(`/ai/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTemplate: (id: string) => apiFetch(`/ai/templates/${id}`, { method: 'DELETE' }),
};

export const moduleApi = {
  // Task #66: tenant-scoped entitlement check. Hits GET /v1/modules/:slug
  // which is gated by `requireTenantMember` and returns
  // `getModuleForUser(user.id, ctx.tenantId, slug)` — i.e. it evaluates
  // the entitlement *for the active tenant only*, never the union of
  // every tenant the user belongs to. /apps/[slug] uses this so a user
  // who has access in tenant A cannot open the shell while their active
  // tenant is B.
  get: (slug: string) => apiFetch(`/modules/${slug}`),
};

export const meApi = {
  // Flat per-user list of modules accessible across all tenants the user
  // is a member of, collapsed by slug to the best access level. Used by
  // the My Apps launchpad.
  modules: () => apiFetch('/me/modules'),
  tenants: () => apiFetch('/me/tenants'),
  // Super-admin only — list every tenant in the platform.
  allTenants: () => apiFetch('/tenants'),
};

export const tenantApi = {
  // Member listing + role/remove mutations.
  listUsers: (tenantId: string) => apiFetch(`/tenants/${tenantId}/users`),
  updateUser: (tenantId: string, userId: string, role: 'owner' | 'admin' | 'member') =>
    apiFetch(`/tenants/${tenantId}/users/${userId}`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  removeUser: (tenantId: string, userId: string) =>
    apiFetch(`/tenants/${tenantId}/users/${userId}`, { method: 'DELETE' }),

  // Invites lifecycle.
  listInvites: (tenantId: string) => apiFetch(`/tenants/${tenantId}/invites`),
  createInvite: (tenantId: string, email: string, role: 'owner' | 'admin' | 'member') =>
    apiFetch(`/tenants/${tenantId}/invites`, { method: 'POST', body: JSON.stringify({ email, role }) }),
  revokeInvite: (tenantId: string, inviteId: string) =>
    apiFetch(`/tenants/${tenantId}/invites/${inviteId}`, { method: 'DELETE' }),
  resendInvite: (tenantId: string, inviteId: string) =>
    apiFetch(`/tenants/${tenantId}/invites/${inviteId}/resend`, { method: 'POST' }),
  // Task #66: copy-link fallback. Returns { acceptUrl, expiresAt } so
  // the UI can clipboard-paste the invite URL without resending the
  // email. Owner/admin only on the server.
  getInviteLink: (tenantId: string, inviteId: string) =>
    apiFetch(`/tenants/${tenantId}/invites/${inviteId}/link`),
  acceptInvite: (token: string) =>
    apiFetch(`/invites/${token}/accept`, { method: 'POST' }),
  // Public read used by the invite landing page to fetch the invitee's
  // email (for pre-fill) and tenant name without requiring auth.
  peekInvite: (token: string) =>
    apiFetch(`/invites/${token}/peek`),

  // Per-user, per-module access grants (owner/admin only).
  getUserModuleAccess: (tenantId: string, userId: string) =>
    apiFetch(`/tenants/${tenantId}/users/${userId}/module-access`),
  setUserModuleAccess: (
    tenantId: string,
    userId: string,
    moduleSlug: string,
    accessLevel: 'none' | 'user' | 'manager',
  ) => apiFetch(`/tenants/${tenantId}/users/${userId}/module-access`, {
    method: 'POST', body: JSON.stringify({ moduleSlug, accessLevel }),
  }),

  // Tenant module catalog (read-only listing for the active tenant).
  listModules: (tenantId: string) => apiFetch(`/tenants/${tenantId}/modules`),

  // Tenant activity feed — recent audit events, usage trend, billing summary.
  getActivity: (tenantId: string) => apiFetch(`/tenants/${tenantId}/activity`),

  // Tenant rename (owner only).
  rename: (tenantId: string, name: string) =>
    apiFetch(`/tenants/${tenantId}`, { method: 'PATCH', body: JSON.stringify({ name }) }),

  // Switch the caller's active tenant (writes users.current_tenant_id).
  switch: (tenantId: string) =>
    apiFetch(`/tenants/${tenantId}/switch`, { method: 'POST' }),
};

// Task #72 — backend persistence for the polished module shells.
// Each helper hits `/v1/modules/{slug}/...` which is gated by
// `requireTenantMember` and stamps the active tenant from the
// X-Tenant-Id header that `apiFetch` already sets.
export const moduleShellApi = {
  callcommand: {
    list: () => apiFetch('/modules/callcommand-ai/calls'),
    get: (id: string) => apiFetch(`/modules/callcommand-ai/calls/${id}`),
    place: (input: { phone: string; name: string; persona: string }) =>
      apiFetch('/modules/callcommand-ai/calls', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  },
  studyforge: {
    list: () => apiFetch('/modules/studyforge-ai/sessions'),
    create: (source: string) =>
      apiFetch('/modules/studyforge-ai/sessions', {
        method: 'POST',
        body: JSON.stringify({ source }),
      }),
    delete: (id: string) =>
      apiFetch(`/modules/studyforge-ai/sessions/${id}`, { method: 'DELETE' }),
  },
  ninjamation: {
    list: () => apiFetch('/modules/ninjamation/automations'),
    activate: (input: {
      templateId: string;
      name: string;
      trigger: string;
      action: string;
      modules: string[];
    }) =>
      apiFetch('/modules/ninjamation/automations', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    deactivate: (id: string) =>
      apiFetch(`/modules/ninjamation/automations/${id}`, { method: 'DELETE' }),
  },
  launchkit: {
    list: () => apiFetch('/modules/ninja-launch-kit/scaffolds'),
    scaffold: (input: {
      stackId: string;
      stackName: string;
      files: string[];
      name?: string;
    }) =>
      apiFetch('/modules/ninja-launch-kit/scaffolds', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  },
};

export interface ModulesListResponse {
  modules: Array<{
    module: { slug: string; name: string; description: string | null; status: string };
    unlocked: boolean;
    cta: string;
    planMin?: string;
    status?: string;
  }>;
}

export const modulesApi = {
  list: (): Promise<ModulesListResponse> => apiFetch('/modules') as Promise<ModulesListResponse>,
  get: (slug: string) => apiFetch(`/modules/${slug}`),
  debug: (slug: string, userId?: string) =>
    apiFetch(`/modules/debug/${slug}${userId ? `?user_id=${userId}` : ''}`),
  handoff: (slug: string) =>
    apiFetch(`/modules/${slug}/handoff`, { method: 'POST' }),
  subscribeAddon: (moduleSlug: string) =>
    apiFetch('/billing/addons/subscribe', { method: 'POST', body: JSON.stringify({ moduleSlug }) }),
  cancelAddon: (moduleSlug: string) =>
    apiFetch('/billing/addons/cancel', { method: 'POST', body: JSON.stringify({ moduleSlug }) }),
};
