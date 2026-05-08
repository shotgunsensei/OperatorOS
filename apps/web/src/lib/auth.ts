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
  getMode: () => apiFetch('/billing/mode'),
  checkDowngrade: (planSlug: string) =>
    apiFetch('/billing/check-downgrade', { method: 'POST', body: JSON.stringify({ planSlug }) }),
  subscribe: (planSlug: string) =>
    apiFetch('/billing/subscribe', { method: 'POST', body: JSON.stringify({ planSlug }) }),
  createCheckoutSession: (planSlug: string) =>
    apiFetch('/billing/create-checkout-session', { method: 'POST', body: JSON.stringify({ planSlug }) }),
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
  retryBillingEvent: (id: string) =>
    apiFetch(`/admin/billing/events/${id}/retry`, { method: 'POST' }),

  getModules: () => apiFetch('/admin/modules'),
  upsertModule: (data: {
    slug: string; name: string; description?: string; iconUrl?: string;
    category?: string; baseUrl?: string; status?: string; planMin?: string;
    requiresOrg?: boolean; ord?: number;
  }) => apiFetch('/admin/modules', { method: 'POST', body: JSON.stringify(data) }),
  setModulePlanMapping: (slug: string, planSlugs: string[]) =>
    apiFetch(`/admin/modules/${slug}/plan-mapping`, { method: 'POST', body: JSON.stringify({ planSlugs }) }),

  getUserModuleOverrides: (userId: string) =>
    apiFetch(`/admin/users/${userId}/module-overrides`),
  setUserModuleOverride: (userId: string, data: { moduleSlug: string; grant: boolean; reason?: string; expiresAt?: string }) =>
    apiFetch(`/admin/users/${userId}/module-overrides`, { method: 'POST', body: JSON.stringify(data) }),
  removeUserModuleOverride: (userId: string, overrideId: string) =>
    apiFetch(`/admin/users/${userId}/module-overrides/${overrideId}`, { method: 'DELETE' }),

  setModuleAddonPrice: (slug: string, addonPriceCents: number) =>
    apiFetch(`/admin/modules/${slug}/addon-price`, {
      method: 'PUT',
      body: JSON.stringify({ addonPriceCents }),
    }),
  getModuleStripePrice: (slug: string) =>
    apiFetch(`/admin/modules/${slug}/stripe-price`),

  getModuleMembers: (slug: string) =>
    apiFetch(`/admin/modules/${slug}/members`),
  resyncUserBilling: (userId: string) =>
    apiFetch(`/admin/billing/resync/${userId}`, { method: 'POST' }),
};

export const meApi = {
  // Flat per-user list of modules accessible across all tenants the user
  // is a member of, collapsed by slug to the best access level. Used by
  // the My Apps launchpad.
  modules: () => apiFetch('/me/modules'),
  tenants: () => apiFetch('/me/tenants'),
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
  acceptInvite: (token: string) =>
    apiFetch(`/invites/${token}/accept`, { method: 'POST' }),

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
};

export const modulesApi = {
  list: () => apiFetch('/modules'),
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
