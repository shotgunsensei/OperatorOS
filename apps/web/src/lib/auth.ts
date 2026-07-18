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
  const tenantId = getActiveTenantId();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
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

  logoutAll: () => apiFetch('/auth/logout-all', { method: 'POST' }),

  refresh: () => apiFetch('/auth/refresh', { method: 'POST' }),

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
  getCatalog: () => apiFetch('/billing/catalog'),
  getStack: () => apiFetch('/billing/stack'),
  getMode: () => apiFetch('/billing/mode'),
  checkDowngrade: (planSlug: string) =>
    apiFetch('/billing/check-downgrade', { method: 'POST', body: JSON.stringify({ planSlug }) }),
  subscribe: (planSlug: string, interval: 'month' | 'year' = 'month') =>
    apiFetch('/billing/subscribe', { method: 'POST', body: JSON.stringify({ planSlug, interval }) }),
  createCheckoutSession: (planSlug: string, interval: 'month' | 'year' = 'month') =>
    apiFetch('/billing/create-checkout-session', { method: 'POST', body: JSON.stringify({ planSlug, interval }) }),
  createStackCheckout: (selection: {
    coreProduct: string;
    freeCompanionModule: string;
    additionalModules: string[];
    additionalSeats: number;
  }) => apiFetch('/billing/stack/checkout', { method: 'POST', body: JSON.stringify(selection) }),
  changeFreeCompanion: (moduleKey: string) =>
    apiFetch('/billing/stack/free-companion', { method: 'POST', body: JSON.stringify({ moduleKey }) }),
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

export type TechDeckTicketPriority = 'critical' | 'high' | 'medium' | 'low';
export type TechDeckTicketStatus = 'open' | 'in_progress' | 'waiting_on_client' | 'resolved' | 'closed';

export interface TechDeckTicket {
  id: string;
  tenantId: string;
  number: number;
  createdByUserId: string;
  assignedToUserId: string | null;
  title: string;
  description: string | null;
  priority: TechDeckTicketPriority;
  status: TechDeckTicketStatus;
  responseDeadline: string | null;
  resolutionDeadline: string | null;
  respondedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TechDeckTicketListResponse {
  tickets: TechDeckTicket[];
}

export interface TechDeckTicketCreateInput {
  title: string;
  description?: string | null;
  priority?: TechDeckTicketPriority;
  assignedToUserId?: string | null;
  responseDeadline?: string | null;
  resolutionDeadline?: string | null;
}

export interface TechDeckTicketUpdateInput {
  title?: string;
  description?: string | null;
  priority?: TechDeckTicketPriority;
  assignedToUserId?: string | null;
  responseDeadline?: string | null;
  resolutionDeadline?: string | null;
}

export type TechDeckAssetType = 'endpoint' | 'server' | 'network' | 'printer' | 'mobile' | 'other';
export type TechDeckAssetHealth = 'unknown' | 'healthy' | 'warning' | 'critical' | 'offline';
export type TechDeckRunbookPlatform = 'powershell' | 'bash' | 'network' | 'generic';
export type TechDeckRunbookRisk = 'low' | 'medium' | 'high';
export type TechDeckRunbookStatus = 'draft' | 'approved' | 'retired';

export interface TechDeckAsset {
  id: string;
  tenantId: string;
  name: string;
  type: TechDeckAssetType;
  hostname: string | null;
  ipAddress: string | null;
  operatingSystem: string | null;
  health: TechDeckAssetHealth;
  lastSeenAt: string | null;
  notes: string | null;
  version: number;
  updatedAt: string;
}

export interface TechDeckRunbook {
  id: string;
  tenantId: string;
  name: string;
  platform: TechDeckRunbookPlatform;
  purpose: string;
  scriptText: string;
  riskLevel: TechDeckRunbookRisk;
  status: TechDeckRunbookStatus;
  approvedByUserId: string | null;
  approvedAt: string | null;
  version: number;
  updatedAt: string;
}

export interface TechDeckHealthAlert {
  id: string;
  assetId: string;
  assetName: string;
  severity: 'warning' | 'critical' | 'offline';
  message: string;
  observedAt: string;
}

export interface TechDeckOpsResponse {
  assets: TechDeckAsset[];
  runbooks: TechDeckRunbook[];
  alerts: TechDeckHealthAlert[];
  executionEnabled: false;
}

export type PulseDeskRequestPriority = 'critical' | 'high' | 'normal' | 'low';
export type PulseDeskRequestStatus =
  | 'new'
  | 'triage'
  | 'assigned'
  | 'waiting_department'
  | 'waiting_vendor'
  | 'in_progress'
  | 'escalated'
  | 'resolved'
  | 'closed';
export type PulseDeskRequestCategory =
  | 'it_infrastructure'
  | 'medical_equipment'
  | 'supplies_inventory'
  | 'facilities_building'
  | 'housekeeping_environmental'
  | 'safety_compliance'
  | 'vendor_external'
  | 'administrative'
  | 'hr_staff'
  | 'other';
export type PulseDeskEscalationReasonCode =
  | 'patient_care_risk'
  | 'safety_risk'
  | 'department_nonresponse'
  | 'sla_breach'
  | 'resource_blocked'
  | 'other';

export interface PulseDeskDepartment {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PulseDeskRequest {
  id: string;
  requestNumber: string;
  summary: string;
  category: PulseDeskRequestCategory;
  priority: PulseDeskRequestPriority;
  status: PulseDeskRequestStatus;
  departmentId: string | null;
  assignedToUserId: string | null;
  locationLabel: string | null;
  isPatientImpacting: boolean;
  dueAt: string | null;
  version: number;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  departmentName?: string | null;
  assignedToName?: string | null;
}

export interface PulseDeskRequestEvent {
  id: string;
  type: string;
  actorUserId?: string | null;
  fromStatus?: PulseDeskRequestStatus | null;
  toStatus?: PulseDeskRequestStatus | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface PulseDeskDepartmentsResponse {
  departments: PulseDeskDepartment[];
  capabilities: PulseDeskCapabilities;
}

export interface PulseDeskRequestsResponse {
  requests: PulseDeskRequest[];
  capabilities: PulseDeskCapabilities;
}

export interface PulseDeskRequestDetailResponse {
  request: PulseDeskRequest;
  events: PulseDeskRequestEvent[];
  capabilities: PulseDeskCapabilities;
}

export interface PulseDeskCapabilities {
  canManageWorkflow: boolean;
}

export interface PulseDeskAssignee {
  id: string;
  name: string;
}

export interface PulseDeskAssigneesResponse {
  assignees: PulseDeskAssignee[];
  capabilities: PulseDeskCapabilities;
}

export interface PulseDeskRequestFilters {
  status?: PulseDeskRequestStatus;
  priority?: PulseDeskRequestPriority;
  category?: PulseDeskRequestCategory;
  departmentId?: string;
  assignedToUserId?: string;
  isPatientImpacting?: boolean;
  search?: string;
  limit?: number;
}

export interface PulseDeskRequestCreateInput {
  summary: string;
  category: PulseDeskRequestCategory;
  priority: PulseDeskRequestPriority;
  departmentId?: string | null;
  locationLabel?: string | null;
  isPatientImpacting: boolean;
  phiAcknowledged: true;
}

export interface PulseDeskRequestUpdateInput {
  expectedVersion: number;
  summary?: string;
  category?: PulseDeskRequestCategory;
  priority?: PulseDeskRequestPriority;
  departmentId?: string | null;
  assignedToUserId?: string | null;
  locationLabel?: string | null;
  isPatientImpacting?: boolean;
  phiAcknowledged?: true;
}

export type NinjaPoolPracticeStatus = 'active' | 'completed' | 'abandoned';

export interface NinjaPoolPracticeSession {
  id: string;
  status: NinjaPoolPracticeStatus;
  shots: number;
  objectBallsPocketed: number;
  scratches: number;
  version: number;
  startedAt: string;
  completedAt: string | null;
  updatedAt: string;
}

export interface NinjaPoolPracticeSessionsResponse {
  sessions: NinjaPoolPracticeSession[];
}

export interface NinjaPoolPracticeProgressInput {
  expectedVersion: number;
  shots: number;
  objectBallsPocketed: number;
  scratches: number;
}

export type NativeWorkflowModuleSlug = 'torqueshed' | 'faultlinelab' | 'brandforgeos' | 'snapproofos';

export interface ModuleWorkflowItem {
  id: string;
  tenantId: string;
  createdByUserId: string;
  moduleSlug: NativeWorkflowModuleSlug;
  itemType: string;
  title: string;
  status: string;
  summary: string | null;
  data: Record<string, string | number | boolean | null>;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ModuleWorkflowListResponse {
  items: ModuleWorkflowItem[];
  itemType: string;
  statuses: string[];
}

export interface TradeFlowKitLineItem { description: string; quantity: number; unitPriceCents: number }
export interface TradeFlowKitCustomer { id: string; name: string; phone: string | null; email: string | null; version: number }
export interface TradeFlowKitJob { id: string; customerId: string; title: string; status: string; priority: string; version: number }
export interface TradeFlowKitQuote {
  id: string; customerId: string; jobId: string | null; status: string; lineItems: TradeFlowKitLineItem[];
  subtotalCents: number; taxRateBps: number; taxCents: number; discountCents: number; totalCents: number; version: number;
}
export interface TradeFlowKitInvoice extends TradeFlowKitQuote {
  sourceQuoteId: string | null; dueDate: string | null; paidAt: string | null;
  paymentMethod: string | null; paymentReference: string | null;
}
export interface TradeFlowKitRevenueResponse {
  customers: TradeFlowKitCustomer[]; jobs: TradeFlowKitJob[];
  quotes: TradeFlowKitQuote[]; invoices: TradeFlowKitInvoice[];
}

export type DirectoryModuleSlug = 'tradeflowkit' | 'techdeck' | 'pulsedesk';
export interface DirectoryPagination { total: number; limit: number; offset: number; hasMore: boolean }
export interface DirectoryOrganization {
  id: string; tenantId: string; name: string; type: 'customer' | 'client' | 'vendor' | 'partner' | 'facility' | 'other';
  status: 'active' | 'inactive'; website: string | null; notes: string | null; version: number; archivedAt: string | null;
}
export interface DirectoryContact {
  id: string; tenantId: string; firstName: string; lastName: string; email: string | null; phone: string | null;
  title: string | null; status: 'active' | 'inactive'; version: number; archivedAt: string | null;
}
export interface DirectoryAddress {
  id: string; label: string | null; line1: string; line2: string | null; city: string; region: string;
  postalCode: string; countryCode: string; version: number;
}
export interface DirectorySite {
  id: string; tenantId: string; organizationId: string; name: string; type: string; status: 'active' | 'inactive';
  timezone: string | null; notes: string | null; version: number; address: DirectoryAddress | null; organization: DirectoryOrganization;
}
export interface DirectoryOrganizationDetail {
  organization: DirectoryOrganization;
  contacts: Array<DirectoryContact & { association: { id: string; role: string | null; isPrimary: boolean } }>;
  sites: DirectorySite[];
  relationships: Array<{ id: string; fromOrganizationId: string; toOrganizationId: string; type: string; notes: string | null; version: number }>;
  profile: Record<string, unknown> | null;
}

const directoryPath = (slug: DirectoryModuleSlug, path: string) => `/modules/${slug}/directory${path}`;
export const directoryApi = {
  organizations: {
    list: (slug: DirectoryModuleSlug, search = ''): Promise<{ organizations: DirectoryOrganization[]; pagination: DirectoryPagination }> =>
      apiFetch(directoryPath(slug, `/organizations?limit=50&sort=name${search ? `&search=${encodeURIComponent(search)}` : ''}`)) as Promise<any>,
    get: (slug: DirectoryModuleSlug, id: string): Promise<DirectoryOrganizationDetail> =>
      apiFetch(directoryPath(slug, `/organizations/${encodeURIComponent(id)}`)) as Promise<DirectoryOrganizationDetail>,
    create: (slug: DirectoryModuleSlug, input: { name: string; type: DirectoryOrganization['type']; website?: string; notes?: string }): Promise<DirectoryOrganization> =>
      apiFetch(directoryPath(slug, '/organizations'), { method: 'POST', body: JSON.stringify(input) }) as Promise<DirectoryOrganization>,
    update: (slug: DirectoryModuleSlug, id: string, input: { expectedVersion: number; name?: string; type?: DirectoryOrganization['type']; website?: string | null; notes?: string | null; status?: DirectoryOrganization['status'] }): Promise<DirectoryOrganization> =>
      apiFetch(directoryPath(slug, `/organizations/${encodeURIComponent(id)}`), { method: 'PATCH', body: JSON.stringify(input) }) as Promise<DirectoryOrganization>,
    archive: (slug: DirectoryModuleSlug, id: string, expectedVersion: number): Promise<DirectoryOrganization> =>
      apiFetch(directoryPath(slug, `/organizations/${encodeURIComponent(id)}`), { method: 'DELETE', body: JSON.stringify({ expectedVersion }) }) as Promise<DirectoryOrganization>,
    associateContact: (slug: DirectoryModuleSlug, id: string, contactId: string, role?: string): Promise<unknown> =>
      apiFetch(directoryPath(slug, `/organizations/${encodeURIComponent(id)}/contacts`), { method: 'POST', body: JSON.stringify({ contactId, role, isPrimary: false }) }),
    removeContact: (slug: DirectoryModuleSlug, id: string, contactId: string): Promise<{ ok: true }> =>
      apiFetch(directoryPath(slug, `/organizations/${encodeURIComponent(id)}/contacts/${encodeURIComponent(contactId)}`), { method: 'DELETE' }) as Promise<{ ok: true }>,
    profile: (slug: DirectoryModuleSlug, id: string, input: Record<string, unknown>): Promise<Record<string, unknown>> =>
      apiFetch(directoryPath(slug, `/organizations/${encodeURIComponent(id)}/profile`), { method: 'PUT', body: JSON.stringify(input) }) as Promise<Record<string, unknown>>,
  },
  contacts: {
    list: (slug: DirectoryModuleSlug, search = ''): Promise<{ contacts: DirectoryContact[]; pagination: DirectoryPagination }> =>
      apiFetch(directoryPath(slug, `/contacts?limit=50${search ? `&search=${encodeURIComponent(search)}` : ''}`)) as Promise<any>,
    create: (slug: DirectoryModuleSlug, input: { firstName: string; lastName?: string; email?: string; phone?: string; title?: string }): Promise<DirectoryContact> =>
      apiFetch(directoryPath(slug, '/contacts'), { method: 'POST', body: JSON.stringify(input) }) as Promise<DirectoryContact>,
    update: (slug: DirectoryModuleSlug, id: string, input: { expectedVersion: number; firstName?: string; lastName?: string; email?: string | null; phone?: string | null; title?: string | null }): Promise<DirectoryContact> =>
      apiFetch(directoryPath(slug, `/contacts/${encodeURIComponent(id)}`), { method: 'PATCH', body: JSON.stringify(input) }) as Promise<DirectoryContact>,
    archive: (slug: DirectoryModuleSlug, id: string, expectedVersion: number): Promise<DirectoryContact> =>
      apiFetch(directoryPath(slug, `/contacts/${encodeURIComponent(id)}`), { method: 'DELETE', body: JSON.stringify({ expectedVersion }) }) as Promise<DirectoryContact>,
  },
  sites: {
    list: (slug: DirectoryModuleSlug, search = ''): Promise<{ sites: DirectorySite[]; pagination: DirectoryPagination }> =>
      apiFetch(directoryPath(slug, `/sites?limit=50${search ? `&search=${encodeURIComponent(search)}` : ''}`)) as Promise<any>,
    create: (slug: DirectoryModuleSlug, input: Record<string, unknown>): Promise<DirectorySite> =>
      apiFetch(directoryPath(slug, '/sites'), { method: 'POST', body: JSON.stringify(input) }) as Promise<DirectorySite>,
    update: (slug: DirectoryModuleSlug, id: string, input: Record<string, unknown>): Promise<DirectorySite> =>
      apiFetch(directoryPath(slug, `/sites/${encodeURIComponent(id)}`), { method: 'PATCH', body: JSON.stringify(input) }) as Promise<DirectorySite>,
    archive: (slug: DirectoryModuleSlug, id: string, expectedVersion: number): Promise<DirectorySite> =>
      apiFetch(directoryPath(slug, `/sites/${encodeURIComponent(id)}`), { method: 'DELETE', body: JSON.stringify({ expectedVersion }) }) as Promise<DirectorySite>,
    associateContact: (slug: DirectoryModuleSlug, id: string, contactId: string, role?: string): Promise<unknown> =>
      apiFetch(directoryPath(slug, `/sites/${encodeURIComponent(id)}/contacts`), { method: 'POST', body: JSON.stringify({ contactId, role, isPrimary: false }) }),
  },
  relationships: {
    create: (slug: DirectoryModuleSlug, input: { fromOrganizationId: string; toOrganizationId: string; type: string; notes?: string }): Promise<unknown> =>
      apiFetch(directoryPath(slug, '/relationships'), { method: 'POST', body: JSON.stringify(input) }),
  },
};

// Task #72 — backend persistence for the polished module shells.
// Each helper hits `/v1/modules/{slug}/...`, whose route group is gated by
// `requireTenantMember` plus `requireTenantModuleAccess(slug)`, and stamps the
// active tenant from the X-Tenant-Id header that `apiFetch` already sets.
export const moduleShellApi = {
  workflows: {
    list: (slug: NativeWorkflowModuleSlug, status?: string): Promise<ModuleWorkflowListResponse> =>
      apiFetch(`/modules/${slug}/work-items${status ? `?status=${encodeURIComponent(status)}` : ''}`) as Promise<ModuleWorkflowListResponse>,
    create: (
      slug: NativeWorkflowModuleSlug,
      input: { title: string; summary?: string | null; data?: Record<string, string | number | boolean | null> },
    ): Promise<ModuleWorkflowItem> => apiFetch(`/modules/${slug}/work-items`, {
      method: 'POST',
      body: JSON.stringify(input),
    }) as Promise<ModuleWorkflowItem>,
    update: (
      slug: NativeWorkflowModuleSlug,
      id: string,
      input: { expectedVersion: number; title?: string; summary?: string | null; status?: string; data?: Record<string, string | number | boolean | null> },
    ): Promise<ModuleWorkflowItem> => apiFetch(`/modules/${slug}/work-items/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }) as Promise<ModuleWorkflowItem>,
    delete: (slug: NativeWorkflowModuleSlug, id: string): Promise<{ ok: true }> =>
      apiFetch(`/modules/${slug}/work-items/${encodeURIComponent(id)}`, { method: 'DELETE' }) as Promise<{ ok: true }>,
  },
  ninjaPoolHall: {
    listPracticeSessions: (limit = 8): Promise<NinjaPoolPracticeSessionsResponse> =>
      apiFetch(`/modules/ninja-pool-hall/practice-sessions?limit=${encodeURIComponent(String(limit))}`) as Promise<NinjaPoolPracticeSessionsResponse>,
    startPracticeSession: (): Promise<NinjaPoolPracticeSession> =>
      apiFetch('/modules/ninja-pool-hall/practice-sessions', {
        method: 'POST',
        body: JSON.stringify({}),
      }) as Promise<NinjaPoolPracticeSession>,
    savePracticeShot: (
      id: string,
      input: NinjaPoolPracticeProgressInput,
    ): Promise<NinjaPoolPracticeSession> =>
      apiFetch(`/modules/ninja-pool-hall/practice-sessions/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }) as Promise<NinjaPoolPracticeSession>,
    abandonPracticeSession: (
      id: string,
      expectedVersion: number,
    ): Promise<NinjaPoolPracticeSession> =>
      apiFetch(`/modules/ninja-pool-hall/practice-sessions/${encodeURIComponent(id)}/abandon`, {
        method: 'POST',
        body: JSON.stringify({ expectedVersion }),
      }) as Promise<NinjaPoolPracticeSession>,
  },
  pulsedesk: {
    listDepartments: (includeInactive = true): Promise<PulseDeskDepartmentsResponse> => {
      const query = includeInactive ? '?includeInactive=true' : '';
      return apiFetch(`/modules/pulsedesk/departments${query}`) as Promise<PulseDeskDepartmentsResponse>;
    },
    createDepartment: (name: string): Promise<PulseDeskDepartment> =>
      apiFetch('/modules/pulsedesk/departments', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }) as Promise<PulseDeskDepartment>,
    updateDepartment: (
      id: string,
      input: { name?: string; active?: boolean },
    ): Promise<PulseDeskDepartment> =>
      apiFetch(`/modules/pulsedesk/departments/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }) as Promise<PulseDeskDepartment>,
    listAssignees: (): Promise<PulseDeskAssigneesResponse> =>
      apiFetch('/modules/pulsedesk/assignees') as Promise<PulseDeskAssigneesResponse>,
    listRequests: (filters?: PulseDeskRequestFilters): Promise<PulseDeskRequestsResponse> => {
      const query = new URLSearchParams();
      if (filters?.status) query.set('status', filters.status);
      if (filters?.priority) query.set('priority', filters.priority);
      if (filters?.category) query.set('category', filters.category);
      if (filters?.departmentId) query.set('departmentId', filters.departmentId);
      if (filters?.assignedToUserId) query.set('assignedToUserId', filters.assignedToUserId);
      if (filters?.isPatientImpacting !== undefined) {
        query.set('isPatientImpacting', String(filters.isPatientImpacting));
      }
      if (filters?.search) query.set('search', filters.search);
      if (filters?.limit) query.set('limit', String(filters.limit));
      const suffix = query.size > 0 ? `?${query.toString()}` : '';
      return apiFetch(`/modules/pulsedesk/requests${suffix}`) as Promise<PulseDeskRequestsResponse>;
    },
    createRequest: (input: PulseDeskRequestCreateInput): Promise<PulseDeskRequest> =>
      apiFetch('/modules/pulsedesk/requests', {
        method: 'POST',
        body: JSON.stringify(input),
      }) as Promise<PulseDeskRequest>,
    getRequest: (id: string): Promise<PulseDeskRequestDetailResponse> =>
      apiFetch(`/modules/pulsedesk/requests/${encodeURIComponent(id)}`) as Promise<PulseDeskRequestDetailResponse>,
    updateRequest: (id: string, input: PulseDeskRequestUpdateInput): Promise<PulseDeskRequest> =>
      apiFetch(`/modules/pulsedesk/requests/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }) as Promise<PulseDeskRequest>,
    transitionRequest: (
      id: string,
      input: {
        expectedVersion: number;
        toStatus: PulseDeskRequestStatus;
        reasonCode?: PulseDeskEscalationReasonCode;
      },
    ): Promise<PulseDeskRequest> =>
      apiFetch(`/modules/pulsedesk/requests/${encodeURIComponent(id)}/transitions`, {
        method: 'POST',
        body: JSON.stringify(input),
      }) as Promise<PulseDeskRequest>,
  },
  techdeck: {
    getOps: (): Promise<TechDeckOpsResponse> =>
      apiFetch('/modules/techdeck/ops') as Promise<TechDeckOpsResponse>,
    createAsset: (input: {
      name: string;
      type?: TechDeckAssetType;
      hostname?: string;
      ipAddress?: string;
      operatingSystem?: string;
      health?: TechDeckAssetHealth;
      notes?: string;
    }): Promise<TechDeckAsset> => apiFetch('/modules/techdeck/assets', {
      method: 'POST', body: JSON.stringify(input),
    }) as Promise<TechDeckAsset>,
    updateAsset: (
      id: string,
      input: { expectedVersion: number; health?: TechDeckAssetHealth; lastSeenAt?: string | null; notes?: string | null },
    ): Promise<TechDeckAsset> => apiFetch(`/modules/techdeck/assets/${encodeURIComponent(id)}`, {
      method: 'PATCH', body: JSON.stringify(input),
    }) as Promise<TechDeckAsset>,
    createRunbook: (input: {
      name: string;
      platform: TechDeckRunbookPlatform;
      purpose: string;
      scriptText: string;
      riskLevel?: TechDeckRunbookRisk;
    }): Promise<TechDeckRunbook> => apiFetch('/modules/techdeck/runbooks', {
      method: 'POST', body: JSON.stringify(input),
    }) as Promise<TechDeckRunbook>,
    approveRunbook: (id: string, expectedVersion: number): Promise<TechDeckRunbook> =>
      apiFetch(`/modules/techdeck/runbooks/${encodeURIComponent(id)}/approve`, {
        method: 'POST', body: JSON.stringify({ expectedVersion }),
      }) as Promise<TechDeckRunbook>,
    retireRunbook: (id: string, expectedVersion: number): Promise<TechDeckRunbook> =>
      apiFetch(`/modules/techdeck/runbooks/${encodeURIComponent(id)}/retire`, {
        method: 'POST', body: JSON.stringify({ expectedVersion }),
      }) as Promise<TechDeckRunbook>,
    list: (filters?: {
      status?: TechDeckTicketStatus;
      priority?: TechDeckTicketPriority;
      assignment?: 'mine' | 'unassigned';
      search?: string;
    }): Promise<TechDeckTicketListResponse> => {
      const query = new URLSearchParams();
      if (filters?.status) query.set('status', filters.status);
      if (filters?.priority) query.set('priority', filters.priority);
      if (filters?.assignment) query.set('assignment', filters.assignment);
      if (filters?.search) query.set('search', filters.search);
      const suffix = query.size > 0 ? `?${query.toString()}` : '';
      return apiFetch(`/modules/techdeck/tickets${suffix}`) as Promise<TechDeckTicketListResponse>;
    },
    get: (id: string): Promise<TechDeckTicket> =>
      apiFetch(`/modules/techdeck/tickets/${encodeURIComponent(id)}`) as Promise<TechDeckTicket>,
    create: (input: TechDeckTicketCreateInput): Promise<TechDeckTicket> =>
      apiFetch('/modules/techdeck/tickets', {
        method: 'POST',
        body: JSON.stringify(input),
      }) as Promise<TechDeckTicket>,
    update: (id: string, input: TechDeckTicketUpdateInput): Promise<TechDeckTicket> =>
      apiFetch(`/modules/techdeck/tickets/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }) as Promise<TechDeckTicket>,
    updateStatus: (id: string, status: TechDeckTicketStatus): Promise<TechDeckTicket> =>
      apiFetch(`/modules/techdeck/tickets/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }) as Promise<TechDeckTicket>,
    delete: (id: string): Promise<{ ok: true }> =>
      apiFetch(`/modules/techdeck/tickets/${encodeURIComponent(id)}`, { method: 'DELETE' }) as Promise<{ ok: true }>,
  },
  tradeflowkit: {
    revenue: (): Promise<TradeFlowKitRevenueResponse> =>
      apiFetch('/modules/tradeflowkit/revenue') as Promise<TradeFlowKitRevenueResponse>,
    createCustomer: (input: { name: string; phone?: string; email?: string }): Promise<TradeFlowKitCustomer> =>
      apiFetch('/modules/tradeflowkit/customers', { method: 'POST', body: JSON.stringify(input) }) as Promise<TradeFlowKitCustomer>,
    createJob: (input: { customerId: string; title: string; priority?: string }): Promise<TradeFlowKitJob> =>
      apiFetch('/modules/tradeflowkit/jobs', { method: 'POST', body: JSON.stringify(input) }) as Promise<TradeFlowKitJob>,
    createQuote: (input: { customerId: string; jobId?: string; lineItems: TradeFlowKitLineItem[]; taxRateBps?: number; discountCents?: number }): Promise<TradeFlowKitQuote> =>
      apiFetch('/modules/tradeflowkit/quotes', { method: 'POST', body: JSON.stringify(input) }) as Promise<TradeFlowKitQuote>,
    transitionQuote: (id: string, expectedVersion: number, status: string): Promise<TradeFlowKitQuote> =>
      apiFetch(`/modules/tradeflowkit/quotes/${encodeURIComponent(id)}/transition`, { method: 'POST', body: JSON.stringify({ expectedVersion, status }) }) as Promise<TradeFlowKitQuote>,
    invoiceQuote: (id: string, expectedVersion: number): Promise<TradeFlowKitInvoice> =>
      apiFetch(`/modules/tradeflowkit/quotes/${encodeURIComponent(id)}/invoice`, { method: 'POST', body: JSON.stringify({ expectedVersion }) }) as Promise<TradeFlowKitInvoice>,
    transitionInvoice: (id: string, expectedVersion: number, status: string): Promise<TradeFlowKitInvoice> =>
      apiFetch(`/modules/tradeflowkit/invoices/${encodeURIComponent(id)}/transition`, { method: 'POST', body: JSON.stringify({ expectedVersion, status }) }) as Promise<TradeFlowKitInvoice>,
    payInvoice: (id: string, expectedVersion: number, paymentMethod: string, paymentReference?: string): Promise<TradeFlowKitInvoice> =>
      apiFetch(`/modules/tradeflowkit/invoices/${encodeURIComponent(id)}/pay`, { method: 'POST', body: JSON.stringify({ expectedVersion, paymentMethod, paymentReference }) }) as Promise<TradeFlowKitInvoice>,
    list: (filters?: { status?: string; search?: string }) => {
      const query = new URLSearchParams();
      if (filters?.status) query.set('status', filters.status);
      if (filters?.search) query.set('search', filters.search);
      const suffix = query.size > 0 ? `?${query.toString()}` : '';
      return apiFetch(`/modules/tradeflowkit/leads${suffix}`);
    },
    get: (id: string) => apiFetch(`/modules/tradeflowkit/leads/${encodeURIComponent(id)}`),
    create: (input: {
      name: string;
      phone?: string;
      email?: string;
      serviceType?: string;
      description?: string;
      urgency?: 'normal' | 'urgent' | 'emergency';
      estimatedValueCents?: number | null;
      nextFollowUpAt?: string | null;
    }) => apiFetch('/modules/tradeflowkit/leads', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
    update: (id: string, input: Record<string, unknown>) =>
      apiFetch(`/modules/tradeflowkit/leads/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    delete: (id: string) =>
      apiFetch(`/modules/tradeflowkit/leads/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },
  callcommand: {
    list: () => apiFetch('/modules/callcommand-ai/calls'),
    get: (id: string) => apiFetch(`/modules/callcommand-ai/calls/${id}`),
    place: (input: { phone: string; name: string; persona: string }) =>
      apiFetch('/modules/callcommand-ai/calls', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    telephonyStatus: () => apiFetch('/modules/callcommand-ai/telephony/status'),
    telephonyConnect: () =>
      apiFetch('/modules/callcommand-ai/telephony/connect', { method: 'POST' }),
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

export interface ModuleComponentRef {
  slug: string;
  name: string;
  ord: number;
}

export interface ModulesListResponse {
  modules: Array<{
    module: {
      slug: string;
      name: string;
      description: string | null;
      status: string;
      component?: ModuleComponentRef | null;
    };
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
