'use client';

import type { GameState, ShotEvents } from './ninja-pool-hall/types';

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

async function apiDownload(path: string, options: RequestInit = {}): Promise<Blob> {
  const tenantId = getActiveTenantId();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  if (tenantId) headers['X-Tenant-Id'] = tenantId;
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Download failed' }));
    throw { status: res.status, ...data };
  }
  return res.blob();
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
  directoryOrganizationId: string | null;
  directorySiteId: string | null;
  configurationItemId: string | null;
  title: string;
  description: string | null;
  priority: TechDeckTicketPriority;
  status: TechDeckTicketStatus;
  responseDeadline: string | null;
  resolutionDeadline: string | null;
  respondedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  version: number;
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
  directoryOrganizationId?: string | null;
  directorySiteId?: string | null;
  configurationItemId?: string | null;
}

export interface TechDeckTicketUpdateInput {
  title?: string;
  description?: string | null;
  priority?: TechDeckTicketPriority;
  assignedToUserId?: string | null;
  responseDeadline?: string | null;
  resolutionDeadline?: string | null;
  directoryOrganizationId?: string | null;
  directorySiteId?: string | null;
  configurationItemId?: string | null;
}

export type TechDeckAssetType = 'endpoint' | 'server' | 'workstation' | 'network' | 'network_device' | 'firewall' | 'switch' | 'access_point' | 'printer' | 'mobile' | 'application' | 'domain' | 'dns_record' | 'dhcp_scope' | 'vlan' | 'subnet' | 'ip_address' | 'public_ip' | 'isp' | 'circuit' | 'vendor' | 'license' | 'certificate' | 'warranty' | 'port_mapping' | 'configuration_item' | 'credential_reference' | 'other';
export type TechDeckAssetHealth = 'unknown' | 'healthy' | 'warning' | 'critical' | 'offline';
export type TechDeckAssetStatus = 'active' | 'inactive' | 'planned' | 'retired';
export type TechDeckRunbookPlatform = 'powershell' | 'bash' | 'network' | 'generic';
export type TechDeckRunbookRisk = 'low' | 'medium' | 'high';
export type TechDeckRunbookStatus = 'draft' | 'approved' | 'retired';

export interface TechDeckAsset {
  id: string;
  tenantId: string;
  name: string;
  type: TechDeckAssetType;
  status: TechDeckAssetStatus;
  directoryOrganizationId: string | null;
  directorySiteId: string | null;
  hostname: string | null;
  ipAddress: string | null;
  operatingSystem: string | null;
  vendor: string | null;
  product: string | null;
  model: string | null;
  serialNumber: string | null;
  macAddress: string | null;
  externalVaultReference: string | null;
  vlanNumber: number | null;
  cidr: string | null;
  gateway: string | null;
  dhcpStart: string | null;
  dhcpEnd: string | null;
  dnsServers: string[];
  health: TechDeckAssetHealth;
  lastSeenAt: string | null;
  expirationDate: string | null;
  renewalDate: string | null;
  warrantyEndDate: string | null;
  details: Record<string, string | number | boolean | null>;
  tags: string[];
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
  description: string | null;
  directoryOrganizationId: string | null;
  directorySiteId: string | null;
  version: number;
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

export interface NinjaPoolPreferences {
  aimGuide: boolean;
  tableSpeed: number;
  sound: boolean;
  vibration: boolean;
  callShotOn8: boolean;
  threeFoulRule: boolean;
}

export interface NinjaPoolProfile {
  id: string | null;
  displayName: string;
  preferences: NinjaPoolPreferences;
  version: number;
  persisted: boolean;
  updatedAt: string | null;
}

export interface NinjaPoolProfileResponse {
  profile: NinjaPoolProfile;
  progression: {
    matchesCompleted: number;
    wins: number;
    losses: number;
    localMatches: number;
    evidence: 'client_reported_server_rules';
    competitiveRanking: false;
  };
}

export type NinjaPoolMatchMode = 'bot' | 'local';
export type NinjaPoolMatchStatus = 'active' | 'completed' | 'abandoned';

export interface NinjaPoolMatch {
  id: string;
  mode: NinjaPoolMatchMode;
  status: NinjaPoolMatchStatus;
  opponentName: string;
  rulesSettings: NinjaPoolPreferences;
  logicalState: GameState;
  winnerSeat: 0 | 1 | null;
  result: 'win' | 'loss' | 'draw' | 'player_1' | 'player_2' | null;
  finishReason: string | null;
  shotCount: number;
  evidence: 'client_reported_server_rules';
  rulesVersion: 1;
  version: number;
  startedAt: string;
  completedAt: string | null;
  abandonedAt: string | null;
  updatedAt: string;
  recovered?: boolean;
}

export interface NinjaPoolShotInput {
  expectedVersion: number;
  clientShotId: string;
  shooterSeat: 0 | 1;
  calledPocket?: number;
  eightPocket?: number;
  events: ShotEvents;
}

export interface NinjaPoolMatchActionResponse {
  match: NinjaPoolMatch;
  outcome: {
    foul?: boolean;
    turnContinues?: boolean;
    potNotes?: string[];
    currentPlayer: 0 | 1;
    groupsAssigned?: boolean;
    groups?: Array<'solids' | 'stripes' | null>;
    pendingChoice: GameState['pendingChoice'];
    gameOver?: GameState['gameOver'];
    evidence: string;
  };
  idempotent: boolean;
}

export interface BrandForgeBrand {
  id: string;
  name: string;
  description: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  headingFont: string | null;
  bodyFont: string | null;
  voiceTone: string | null;
  guidelines: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface BrandForgePersona {
  id: string;
  name: string;
  ageRange: string | null;
  location: string | null;
  interests: string | null;
  painPoints: string | null;
  goals: string | null;
  channels: string[];
  description: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface BrandForgeCampaign {
  id: string;
  brandId: string | null;
  personaId: string | null;
  name: string;
  objective: string | null;
  targetAudience: string | null;
  coreMessage: string | null;
  offer: string | null;
  status: 'draft' | 'planning' | 'producing' | 'review' | 'scheduled' | 'active' | 'completed' | 'archived';
  channels: string[];
  startAt: string | null;
  endAt: string | null;
  budgetCents: number | null;
  notes: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface BrandForgeCopyAsset {
  id: string;
  brandId: string | null;
  campaignId: string | null;
  title: string;
  content: string;
  copyType: string;
  channel: string | null;
  tone: string | null;
  status: 'draft' | 'review' | 'approved' | 'published' | 'archived';
  generationId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface BrandForgeCalendarItem {
  id: string;
  brandId: string | null;
  campaignId: string | null;
  copyAssetId: string | null;
  title: string;
  description: string | null;
  itemType: string;
  channel: string | null;
  scheduledAt: string;
  status: 'idea' | 'draft' | 'review' | 'scheduled' | 'published' | 'cancelled';
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface BrandForgeGeneration {
  id: string;
  brandId: string | null;
  campaignId: string | null;
  generationType: 'copy' | 'strategy' | 'campaign_ideas';
  idempotencyKey: string;
  inputSummary: Record<string, unknown>;
  output: Record<string, unknown>;
  provider: string;
  model: string;
  providerVersion: string;
  tokenCount: number;
  durationMs: number;
  createdAt: string;
}

export interface SnapProofCase {
  id: string;
  reference: string;
  title: string;
  description: string | null;
  caseType: string;
  sourceContext: Record<string, unknown>;
  status: 'draft' | 'collecting' | 'in_review' | 'approved' | 'rejected' | 'archived';
  retentionUntil: string | null;
  legalHold: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  evidenceCount?: number;
}

export interface SnapProofEvidence {
  id: string;
  caseId: string;
  title: string;
  evidenceType: 'photo' | 'document' | 'screenshot' | 'log' | 'note';
  description: string | null;
  capturedAt: string;
  sourceType: string;
  sourceReference: string | null;
  status: 'captured' | 'in_review' | 'verified' | 'rejected' | 'archived';
  attachmentId: string | null;
  attachmentSha256: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  caseReference?: string;
  caseTitle?: string;
}

export interface SnapProofReport {
  id: string;
  caseId: string;
  title: string;
  status: 'draft' | 'in_review' | 'approved' | 'rejected' | 'archived';
  content: Record<string, unknown>;
  contentHash: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  caseReference?: string;
  caseTitle?: string;
}

export type NativeWorkflowModuleSlug = 'torqueshed' | 'snapproofos';

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

export interface FaultlineChallengeSummary {
  id: string;
  slug: string;
  title: string;
  category: string;
  difficulty: string;
  scope: 'personal' | 'tenant';
  status: 'draft' | 'published' | 'retired';
  ownerUserId: string;
  currentVersionNumber: number;
  publishedVersionNumber: number | null;
  version: number;
  attemptCount?: number;
  passCount?: number;
  bestScore?: number | null;
  bestPercentage?: number | null;
  bestTier?: string | null;
}

export interface FaultlineChallengeContent {
  schemaVersion: 1;
  description: string;
  briefing: string;
  symptoms: Array<{ id: string; description: string; severity: string }>;
  rootCauseOptions: Array<{ id: string; title: string }>;
  evidence: Array<{ id: string; title: string; category: string; importance: string; description?: string }>;
  hints: Array<{ level: number; label: string; scorePenalty: number; text?: string }>;
  commands: Array<{ command: string; aliases: string[]; description: string }>;
  events: Array<{ id: string; timestamp: string; source: string; level: string; message: string }>;
  tickets: Array<{ id: string; author: string; role: string; timestamp: string }>;
  availableTools: string[];
}

export interface FaultlineSessionBundle {
  session: {
    id: string;
    challengeId: string;
    challengeTitle?: string;
    challengeSlug?: string;
    challengeVersionNumber: number;
    assignmentId?: string | null;
    mode: 'standard' | 'daily' | 'preview' | 'assignment' | 'chaos';
    state: 'active' | 'completed' | 'abandoned';
    unlockedEvidence: string[];
    hintsUsed: number[];
    actionCount: number;
    riskyActionCount: number;
    score?: number | null;
    scorePercentage?: number | null;
    tier?: string | null;
    passed?: boolean | null;
    version: number;
    startedAt: string;
    completedAt?: string | null;
  };
  challenge: FaultlineChallengeContent;
  evidence: FaultlineChallengeContent['evidence'];
  actions: Array<{
    id: string;
    sequenceNumber: number;
    kind: string;
    targetKey: string;
    output: string;
    evidenceUnlocked: string[];
    risky: boolean;
    hintPenalty: number;
    createdAt: string;
  }>;
  submission?: Record<string, any> | null;
  debrief?: Record<string, any>;
}

export interface FaultlineAssignment {
  id: string;
  challengeId: string;
  challengeTitle: string;
  challengeSlug: string;
  assigneeUserId: string;
  assigneeName?: string | null;
  assigneeEmail?: string | null;
  title?: string | null;
  instructions?: string | null;
  dueAt?: string | null;
  status: 'assigned' | 'in_progress' | 'completed' | 'canceled';
  version: number;
}

export interface TradeFlowKitLineItem { description: string; quantity: number; unitPriceCents: number }
export interface TradeFlowKitCustomer {
  id: string; name: string; phone: string | null; email: string | null;
  address: string | null; notes: string | null; organizationId?: string | null;
  primaryContactId?: string | null; version: number;
}
export interface TradeFlowKitCustomerImportRow {
  name: string; phone?: string; email?: string; address?: string; notes?: string;
}
export interface TradeFlowKitCustomerImportResult {
  imported: number;
  skipped: number;
  errors: Array<{ row: number; code: string; field?: string }>;
  skippedRows: Array<{ row: number; reason: 'duplicate_name' | 'duplicate_email' | 'duplicate_phone' | 'duplicate_source' }>;
  customers: Array<{ id: string }>;
}
export interface TradeFlowKitJob {
  id: string; customerId: string; number: number | null; title: string;
  description: string | null; internalNotes?: string | null; status: string; priority: string;
  version: number; workflowStageId?: string | null; scheduledStart?: string | null;
  scheduledEnd?: string | null; updatedAt?: string;
}
export interface TradeFlowKitTask {
  id: string; jobId: string; title: string; description: string | null;
  status: 'todo' | 'in_progress' | 'blocked' | 'completed' | 'canceled';
  priority: 'low' | 'normal' | 'high' | 'urgent'; assignedToUserId: string | null;
  dueAt: string | null; sortOrder: number; workflowStageId?: string | null; completedAt: string | null; version: number;
  jobTitle?: string; customerId?: string; customerName?: string; stageName?: string | null; stageColor?: string | null;
}
export interface TradeFlowKitWorkflowStage {
  id: string; workflowId: string; name: string; color: string; position: number;
  mappedStatus: string | null; version: number;
}
export interface TradeFlowKitWorkflow {
  id: string; name: string; description: string; entityType: 'job' | 'task';
  isDefault: boolean; version: number; stages: TradeFlowKitWorkflowStage[];
}
export interface TradeFlowKitTaskList {
  items: TradeFlowKitTask[];
  pagination: { total: number; limit: number; offset: number; returned: number };
}
export interface TradeFlowKitActivity {
  id: string; action: string; entityType: string; entityId: string | null;
  metadata: Record<string, unknown> | null; userId: string; createdAt: string;
}

export interface TorqueShedVehicle {
  id: string; ownerUserId: string; nickname: string | null; year: number; make: string; model: string;
  trim: string | null; engine: string | null; transmission: string | null; drivetrain: string | null;
  currentMileage: number | null; ownershipStatus: string; visibility: 'private' | 'tenant' | 'public_build';
  vinMasked: string | null; notes: string | null; version: number; updatedAt: string;
}
export interface TorqueShedDiagnostic {
  id: string; vehicleId: string; title: string; customerConcern: string; symptoms: string | null;
  conditions: Record<string, unknown>; confirmedCause: string | null; repairPerformed: string | null;
  verification: string | null; resolution: string | null; status: string; visibility: 'private' | 'tenant';
  version: number; updatedAt: string; year?: number; make?: string; model?: string; nickname?: string | null;
}
export interface TorqueShedDashboard {
  metrics: { vehicles: number; serviceRecords: number; builds: number; diagnostics: number; reminders: number; serviceCostMinor: string | number };
  generatedAt: string;
}

export interface TorqueShedMarketplaceListing {
  id: string; sellerUserId: string; categorySlug?: string; categoryName?: string;
  listingType: 'sell' | 'wanted' | 'trade'; status: 'draft' | 'published' | 'sold' | 'expired' | 'archived' | 'removed';
  condition: 'new' | 'excellent' | 'working' | 'parts'; title: string; description: string;
  priceMinor: number | null; currency: string; negotiable: boolean; locality: string | null; region: string | null;
  favorited?: boolean; favoriteCount?: number; sellerDisplayName?: string | null; version: number; expiresAt?: string | null;
}

export interface TorqueShedCommunityPost {
  id: string; authorUserId: string; topicSlug?: string; topicName?: string; authorDisplayName?: string | null;
  title: string; body: string; status: 'draft' | 'published' | 'hidden' | 'removed' | 'archived';
  visibility: 'public' | 'followers' | 'private'; commentCount?: number; reactionCount?: number;
  viewerReaction?: 'like' | 'helpful' | 'insightful' | null; version: number; createdAt: string; updatedAt: string;
}

export interface TorqueShedCommunityComment {
  id: string; postId: string; parentId: string | null; authorUserId: string; authorDisplayName?: string | null;
  body: string; status: string; reactionCount?: number; viewerReaction?: string | null; version: number; createdAt: string;
}

export interface TorqueAssistResult {
  status: 'follow_up_required' | 'plan_ready';
  summary: string;
  facts: Array<{ source: 'observed' | 'user_entered'; statement: string }>;
  assumptions: string[];
  hypotheses: Array<{
    rank: number;
    description: string;
    confidence: 'low' | 'medium';
    supportingEvidence: string[];
    contradictingEvidence: string[];
  }>;
  safetyWarnings: Array<{ category: string; warning: string; escalation: string }>;
  recommendedTests: Array<{
    priority: number;
    title: string;
    rationale: string;
    procedure: string;
    stopConditions: string[];
  }>;
  followUpQuestions: string[];
  disclaimer: string;
}
export interface TorqueAssistResponse {
  assistRequestId: string;
  diagnosticSessionId: string;
  status: string;
  result: TorqueAssistResult;
  estimatedUnits: number;
  actualUnits: number;
  provider: string;
  model: string;
  providerVersion: string;
  latencyMs: number;
  replayed: boolean;
}
export interface TorqueAssistStatus {
  provider: { name: string; state: 'configured' | 'test' | 'disabled' };
  payments: { name: string; state: 'configured' | 'test' | 'disabled' };
  balance: number;
  packages: Array<{
    key: string;
    name: string;
    units: number;
    amountMinor: number;
    currency: string;
  }>;
  limits: { userPerMinute: number; tenantPerMinute: number; maximumContextCharacters: number };
  ledgerAuthoritative: true;
}

export interface PulseDeskServiceTicket {
  id: string;
  humanId: string;
  number: number;
  summary: string;
  description: string;
  locationLabel: string | null;
  status: PulseDeskRequestStatus;
  priority: PulseDeskRequestPriority;
  category: PulseDeskRequestCategory;
  ticketTypeKey: string;
  directoryOrganizationId: string | null;
  directorySiteId: string | null;
  requesterContactId: string | null;
  departmentId: string | null;
  assetId: string | null;
  queueId: string | null;
  teamId: string | null;
  assignedToUserId: string | null;
  slaPolicyId: string | null;
  responseDueAt: string | null;
  resolutionDueAt: string | null;
  firstRespondedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  archivedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  sla: { state: 'due' | 'at_risk' | 'overdue' | 'met'; responseOverdue: boolean; resolutionOverdue: boolean };
}

export interface PulseDeskServiceTicketDetail {
  ticket: PulseDeskServiceTicket;
  messages: Array<{ id: string; visibility: 'requester' | 'internal'; body: string; authorUserId: string; createdAt: string }>;
  events: Array<{ id: string; eventType: string; visibility: 'requester' | 'internal'; metadata: Record<string, unknown>; createdAt: string }>;
  timeEntries: Array<{ id: string; minutes: number; workType: string; description: string | null; userId: string; createdAt: string }>;
  assignments: Array<{ id: string; assignedToUserId: string | null; queueId: string | null; teamId: string | null; assignedAt: string; endedAt: string | null }>;
  slaEvents: Array<{ id: string; eventType: string; occurredAt: string; targetAt: string | null }>;
  vendorEngagements: Array<Record<string, unknown>>;
  tags: Array<{ id: string; name: string; color: string | null }>;
  capabilities: { canViewInternal: boolean; canManage: boolean };
}

export interface PulseDeskServiceConfiguration {
  queues: Array<{ id: string; name: string; description: string | null; active: boolean; version: number }>;
  teams: Array<{ id: string; queueId: string | null; name: string; active: boolean; version: number }>;
  options: Array<{ id: string; kind: string; key: string; name: string; active: boolean; version: number }>;
  slaPolicies: Array<{ id: string; name: string; responseMinutes: number; resolutionMinutes: number; atRiskPercent: number; defaultPolicy: boolean; active: boolean; version: number }>;
  departments: PulseDeskDepartment[];
  defaults: { statuses: string[]; priorities: string[]; categories: string[]; types: string[] };
}

export interface PulseDeskServiceDashboard {
  metrics: { tickets: number; openTickets: number; atRisk: number; overdue: number; operationalAssets: number; pendingSupplyRequests: number; openFacilityRequests: number; timeMinutes: number };
  byStatus: Record<string, number>;
  generatedAt: string;
}

export interface TechDeckConfigurationRelationship {
  id: string; sourceAssetId: string; targetAssetId: string; relationshipType: string; notes: string | null; createdAt: string;
}
export interface TechDeckDocument {
  id: string; title: string; slug: string; pageType: string; summary: string | null; content: string;
  status: 'draft' | 'in_review' | 'approved' | 'published' | 'archived'; minimumRole: 'member' | 'admin' | 'owner';
  tags: string[]; version: number; updatedAt: string; directoryOrganizationId: string | null; directorySiteId: string | null;
}
export interface TechDeckEvidence {
  id: string; title: string; evidenceType: string; summary: string | null; configurationItemId: string | null; documentId: string | null; ticketId: string | null; observedAt: string | null; createdAt: string;
}
export interface TechDeckReport {
  id: string; name: string; reportType: string; sha256: string; snapshot: Record<string, unknown>; createdAt: string;
}
export interface TechDeckTimeEntry {
  id: string; ticketId: string | null; configurationItemId: string | null; workedAt: string; minutes: number; billable: boolean; notes: string | null;
}
export interface TechDeckWorkspaceResponse {
  configurationItems: TechDeckAsset[];
  relationships: TechDeckConfigurationRelationship[];
  folders: Array<{ id: string; name: string; parentId: string | null }>;
  documents: TechDeckDocument[];
  evidence: TechDeckEvidence[];
  reports: TechDeckReport[];
  timeEntries: TechDeckTimeEntry[];
  comments: Array<{ id: string; ticketId: string; body: string; createdAt: string }>;
  alerts: TechDeckAsset[];
  lifecycleDue: TechDeckAsset[];
  incomplete: TechDeckAsset[];
  execution: { enabled: false; reason: string };
}
export interface TradeFlowKitPayment { id: string; invoiceId: string; amountCents: number; method: string; status: string; paidAt: string; }
export interface TradeFlowKitSettings {
  tenantId: string; jobPrefix: string; quotePrefix: string; invoicePrefix: string;
  defaultTaxRateBps: number; defaultHourlyRateCents: number; paymentTermsDays: number;
  currency: string; timezone: string; version: number;
}
export interface TradeFlowKitOperationsResponse {
  jobs: TradeFlowKitJob[]; tasks: TradeFlowKitTask[]; payments: TradeFlowKitPayment[];
  settings: TradeFlowKitSettings | null;
  metrics: { leads: number; jobs: number; tasks: number; completed_tasks: number; invoiced_cents: string; collected_cents: string; outstanding_cents: string };
  pagination: { limit: number; offset: number; returned: number };
}
export interface TradeFlowKitQuote {
  id: string; number: number | null; customerId: string; jobId: string | null; status: string; lineItems: TradeFlowKitLineItem[];
  subtotalCents: number; taxRateBps: number; taxCents: number; discountCents: number; totalCents: number;
  notes: string | null; expiresAt: string | null; version: number;
}
export interface TradeFlowKitInvoice extends TradeFlowKitQuote {
  sourceQuoteId: string | null; dueDate: string | null; paidAt: string | null;
  paidCents: number; balanceCents: number; paymentMethod: string | null; paymentReference: string | null;
}
export interface TradeFlowKitRevenueResponse {
  customers: TradeFlowKitCustomer[]; jobs: TradeFlowKitJob[];
  quotes: TradeFlowKitQuote[]; invoices: TradeFlowKitInvoice[];
}
export interface TradeFlowKitSearchResponse {
  query: string;
  leads: Array<{ id: string; name: string; status: string; serviceType: string | null }>;
  customers: Array<{ id: string; name: string; email: string | null; phone: string | null }>;
  jobs: Array<{ id: string; title: string; status: string; number: number | null; customerName: string }>;
  tasks: Array<{ id: string; title: string; status: string; priority: string; jobId: string; jobTitle: string }>;
  organizations: Array<{ id: string; name: string; type: string; status: string }>;
  contacts: Array<{ id: string; firstName: string; lastName: string; email: string | null; phone: string | null }>;
  quotes: Array<{ id: string; number: number | null; status: string; totalCents: number; customerName: string }>;
  invoices: Array<{ id: string; number: number | null; status: string; totalCents: number; balanceCents: number; customerName: string }>;
  total: number;
}
export interface TradeFlowKitTrashResponse {
  customers: Array<Pick<TradeFlowKitCustomer, 'id' | 'name' | 'email' | 'phone' | 'version'> & { deletedAt: string }>;
  jobs: Array<Pick<TradeFlowKitJob, 'id' | 'customerId' | 'number' | 'title' | 'status' | 'version'> & { deletedAt: string }>;
  invoices: Array<Pick<TradeFlowKitInvoice, 'id' | 'customerId' | 'jobId' | 'number' | 'status' | 'totalCents' | 'balanceCents' | 'version'> & { deletedAt: string }>;
  hasMore: { customers: boolean; jobs: boolean; invoices: boolean };
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
    getProfile: (): Promise<NinjaPoolProfileResponse> =>
      apiFetch('/modules/ninja-pool-hall/profile') as Promise<NinjaPoolProfileResponse>,
    saveProfile: (
      input: { expectedVersion: number; displayName: string; preferences: NinjaPoolPreferences },
    ): Promise<NinjaPoolProfile> => apiFetch('/modules/ninja-pool-hall/profile', {
      method: 'PUT',
      body: JSON.stringify(input),
    }) as Promise<NinjaPoolProfile>,
    listMatches: (limit = 20): Promise<{ matches: NinjaPoolMatch[] }> =>
      apiFetch(`/modules/ninja-pool-hall/matches?limit=${encodeURIComponent(String(limit))}`) as Promise<{ matches: NinjaPoolMatch[] }>,
    getMatch: (id: string): Promise<{ match: NinjaPoolMatch; events: Array<Record<string, unknown>> }> =>
      apiFetch(`/modules/ninja-pool-hall/matches/${encodeURIComponent(id)}`) as Promise<any>,
    startMatch: (input: {
      mode: NinjaPoolMatchMode;
      opponentName: string;
      clientStartId: string;
    }): Promise<NinjaPoolMatch> => apiFetch('/modules/ninja-pool-hall/matches', {
      method: 'POST',
      body: JSON.stringify(input),
    }) as Promise<NinjaPoolMatch>,
    saveMatchShot: (id: string, input: NinjaPoolShotInput): Promise<NinjaPoolMatchActionResponse> =>
      apiFetch(`/modules/ninja-pool-hall/matches/${encodeURIComponent(id)}/shots`, {
        method: 'POST',
        body: JSON.stringify(input),
      }) as Promise<NinjaPoolMatchActionResponse>,
    resolveMatchChoice: (
      id: string,
      input: { expectedVersion: number; clientActionId: string; action: 'accept' | 'rerack' },
    ): Promise<NinjaPoolMatchActionResponse> =>
      apiFetch(`/modules/ninja-pool-hall/matches/${encodeURIComponent(id)}/choices`, {
        method: 'POST',
        body: JSON.stringify(input),
      }) as Promise<NinjaPoolMatchActionResponse>,
    abandonMatch: (id: string, expectedVersion: number): Promise<NinjaPoolMatch> =>
      apiFetch(`/modules/ninja-pool-hall/matches/${encodeURIComponent(id)}/abandon`, {
        method: 'POST',
        body: JSON.stringify({ expectedVersion }),
      }) as Promise<NinjaPoolMatch>,
  },
  brandforgeos: {
    dashboard: (): Promise<Record<string, any>> =>
      apiFetch('/modules/brandforgeos/dashboard') as Promise<Record<string, any>>,
    workspace: (): Promise<Record<string, any>> =>
      apiFetch('/modules/brandforgeos/workspace') as Promise<Record<string, any>>,
    saveWorkspace: (input: Record<string, unknown>): Promise<Record<string, any>> =>
      apiFetch('/modules/brandforgeos/workspace', { method: 'PUT', body: JSON.stringify(input) }) as Promise<Record<string, any>>,
    listBrands: (): Promise<{ brands: BrandForgeBrand[] }> =>
      apiFetch('/modules/brandforgeos/brands') as Promise<{ brands: BrandForgeBrand[] }>,
    createBrand: (input: Record<string, unknown>): Promise<BrandForgeBrand> =>
      apiFetch('/modules/brandforgeos/brands', { method: 'POST', body: JSON.stringify(input) }) as Promise<BrandForgeBrand>,
    updateBrand: (id: string, input: Record<string, unknown>): Promise<BrandForgeBrand> =>
      apiFetch(`/modules/brandforgeos/brands/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }) as Promise<BrandForgeBrand>,
    deleteBrand: (id: string): Promise<{ ok: true }> =>
      apiFetch(`/modules/brandforgeos/brands/${encodeURIComponent(id)}`, { method: 'DELETE' }) as Promise<{ ok: true }>,
    listPersonas: (): Promise<{ personas: BrandForgePersona[] }> =>
      apiFetch('/modules/brandforgeos/personas') as Promise<{ personas: BrandForgePersona[] }>,
    createPersona: (input: Record<string, unknown>): Promise<BrandForgePersona> =>
      apiFetch('/modules/brandforgeos/personas', { method: 'POST', body: JSON.stringify(input) }) as Promise<BrandForgePersona>,
    updatePersona: (id: string, input: Record<string, unknown>): Promise<BrandForgePersona> =>
      apiFetch(`/modules/brandforgeos/personas/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }) as Promise<BrandForgePersona>,
    deletePersona: (id: string): Promise<{ ok: true }> =>
      apiFetch(`/modules/brandforgeos/personas/${encodeURIComponent(id)}`, { method: 'DELETE' }) as Promise<{ ok: true }>,
    listCampaigns: (): Promise<{ campaigns: BrandForgeCampaign[] }> =>
      apiFetch('/modules/brandforgeos/campaigns') as Promise<{ campaigns: BrandForgeCampaign[] }>,
    createCampaign: (input: Record<string, unknown>): Promise<BrandForgeCampaign> =>
      apiFetch('/modules/brandforgeos/campaigns', { method: 'POST', body: JSON.stringify(input) }) as Promise<BrandForgeCampaign>,
    updateCampaign: (id: string, input: Record<string, unknown>): Promise<BrandForgeCampaign> =>
      apiFetch(`/modules/brandforgeos/campaigns/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }) as Promise<BrandForgeCampaign>,
    deleteCampaign: (id: string): Promise<{ ok: true }> =>
      apiFetch(`/modules/brandforgeos/campaigns/${encodeURIComponent(id)}`, { method: 'DELETE' }) as Promise<{ ok: true }>,
    addMetric: (id: string, input: Record<string, unknown>): Promise<Record<string, any>> =>
      apiFetch(`/modules/brandforgeos/campaigns/${encodeURIComponent(id)}/metrics`, { method: 'POST', body: JSON.stringify(input) }) as Promise<Record<string, any>>,
    listCopyAssets: (): Promise<{ copyAssets: BrandForgeCopyAsset[] }> =>
      apiFetch('/modules/brandforgeos/copy-assets') as Promise<{ copyAssets: BrandForgeCopyAsset[] }>,
    createCopyAsset: (input: Record<string, unknown>): Promise<BrandForgeCopyAsset> =>
      apiFetch('/modules/brandforgeos/copy-assets', { method: 'POST', body: JSON.stringify(input) }) as Promise<BrandForgeCopyAsset>,
    updateCopyAsset: (id: string, input: Record<string, unknown>): Promise<BrandForgeCopyAsset> =>
      apiFetch(`/modules/brandforgeos/copy-assets/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }) as Promise<BrandForgeCopyAsset>,
    deleteCopyAsset: (id: string): Promise<{ ok: true }> =>
      apiFetch(`/modules/brandforgeos/copy-assets/${encodeURIComponent(id)}`, { method: 'DELETE' }) as Promise<{ ok: true }>,
    listCalendar: (): Promise<{ calendarItems: BrandForgeCalendarItem[] }> =>
      apiFetch('/modules/brandforgeos/calendar-items') as Promise<{ calendarItems: BrandForgeCalendarItem[] }>,
    createCalendar: (input: Record<string, unknown>): Promise<BrandForgeCalendarItem> =>
      apiFetch('/modules/brandforgeos/calendar-items', { method: 'POST', body: JSON.stringify(input) }) as Promise<BrandForgeCalendarItem>,
    updateCalendar: (id: string, input: Record<string, unknown>): Promise<BrandForgeCalendarItem> =>
      apiFetch(`/modules/brandforgeos/calendar-items/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }) as Promise<BrandForgeCalendarItem>,
    deleteCalendar: (id: string): Promise<{ ok: true }> =>
      apiFetch(`/modules/brandforgeos/calendar-items/${encodeURIComponent(id)}`, { method: 'DELETE' }) as Promise<{ ok: true }>,
    listGenerations: (): Promise<{ generations: BrandForgeGeneration[]; provider: { name: string; configured: boolean } }> =>
      apiFetch('/modules/brandforgeos/generations') as Promise<any>,
    generate: (input: Record<string, unknown>): Promise<{ generation: BrandForgeGeneration }> =>
      apiFetch('/modules/brandforgeos/generations', { method: 'POST', body: JSON.stringify(input) }) as Promise<{ generation: BrandForgeGeneration }>,
  },
  snapproofos: {
    dashboard: (): Promise<{ counts: Record<string, number> }> =>
      apiFetch('/modules/snapproofos/dashboard') as Promise<any>,
    listCases: (query = ''): Promise<{ items: SnapProofCase[]; total: number }> =>
      apiFetch(`/modules/snapproofos/cases${query ? `?${query}` : ''}`) as Promise<any>,
    getCase: (id: string): Promise<{
      case: SnapProofCase;
      evidence: SnapProofEvidence[];
      findings: Array<Record<string, any>>;
      comments: Array<Record<string, any>>;
      reports: SnapProofReport[];
      attachments: Array<Record<string, any>>;
    }> => apiFetch(`/modules/snapproofos/cases/${encodeURIComponent(id)}`) as Promise<any>,
    createCase: (input: Record<string, unknown>): Promise<SnapProofCase> =>
      apiFetch('/modules/snapproofos/cases', { method: 'POST', body: JSON.stringify(input) }) as Promise<any>,
    updateCase: (id: string, input: Record<string, unknown>): Promise<SnapProofCase> =>
      apiFetch(`/modules/snapproofos/cases/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }) as Promise<any>,
    submitCase: (id: string): Promise<SnapProofCase> =>
      apiFetch(`/modules/snapproofos/cases/${encodeURIComponent(id)}/submit`, { method: 'POST', body: '{}' }) as Promise<any>,
    decideCase: (id: string, input: Record<string, unknown>): Promise<SnapProofCase> =>
      apiFetch(`/modules/snapproofos/cases/${encodeURIComponent(id)}/decision`, { method: 'POST', body: JSON.stringify(input) }) as Promise<any>,
    archiveCase: (id: string): Promise<SnapProofCase> =>
      apiFetch(`/modules/snapproofos/cases/${encodeURIComponent(id)}/archive`, { method: 'POST', body: '{}' }) as Promise<any>,
    setRetention: (id: string, input: Record<string, unknown>): Promise<SnapProofCase> =>
      apiFetch(`/modules/snapproofos/cases/${encodeURIComponent(id)}/retention`, { method: 'PATCH', body: JSON.stringify(input) }) as Promise<any>,
    listEvidence: (query = ''): Promise<{ items: SnapProofEvidence[]; total: number }> =>
      apiFetch(`/modules/snapproofos/evidence${query ? `?${query}` : ''}`) as Promise<any>,
    createEvidence: (caseId: string, input: Record<string, unknown>): Promise<SnapProofEvidence> =>
      apiFetch(`/modules/snapproofos/cases/${encodeURIComponent(caseId)}/evidence`, { method: 'POST', body: JSON.stringify(input) }) as Promise<any>,
    submitEvidence: (id: string): Promise<SnapProofEvidence> =>
      apiFetch(`/modules/snapproofos/evidence/${encodeURIComponent(id)}/submit`, { method: 'POST', body: '{}' }) as Promise<any>,
    decideEvidence: (id: string, input: Record<string, unknown>): Promise<SnapProofEvidence> =>
      apiFetch(`/modules/snapproofos/evidence/${encodeURIComponent(id)}/decision`, { method: 'POST', body: JSON.stringify(input) }) as Promise<any>,
    verifyIntegrity: (id: string): Promise<Record<string, any>> =>
      apiFetch(`/modules/snapproofos/evidence/${encodeURIComponent(id)}/integrity`, { method: 'POST', body: '{}' }) as Promise<any>,
    downloadEvidence: (id: string): Promise<Blob> =>
      apiDownload(`/modules/snapproofos/evidence/${encodeURIComponent(id)}/download`),
    createFinding: (caseId: string, input: Record<string, unknown>): Promise<Record<string, any>> =>
      apiFetch(`/modules/snapproofos/cases/${encodeURIComponent(caseId)}/findings`, { method: 'POST', body: JSON.stringify(input) }) as Promise<any>,
    createComment: (caseId: string, input: Record<string, unknown>): Promise<Record<string, any>> =>
      apiFetch(`/modules/snapproofos/cases/${encodeURIComponent(caseId)}/comments`, { method: 'POST', body: JSON.stringify(input) }) as Promise<any>,
    custody: (caseId: string): Promise<{ events: Array<Record<string, any>> }> =>
      apiFetch(`/modules/snapproofos/cases/${encodeURIComponent(caseId)}/custody`) as Promise<any>,
    listReports: (query = ''): Promise<{ items: SnapProofReport[]; total: number }> =>
      apiFetch(`/modules/snapproofos/reports${query ? `?${query}` : ''}`) as Promise<any>,
    createReport: (caseId: string, title: string): Promise<SnapProofReport> =>
      apiFetch(`/modules/snapproofos/cases/${encodeURIComponent(caseId)}/reports`, { method: 'POST', body: JSON.stringify({ title }) }) as Promise<any>,
    submitReport: (id: string): Promise<SnapProofReport> =>
      apiFetch(`/modules/snapproofos/reports/${encodeURIComponent(id)}/submit`, { method: 'POST', body: '{}' }) as Promise<any>,
    decideReport: (id: string, input: Record<string, unknown>): Promise<SnapProofReport> =>
      apiFetch(`/modules/snapproofos/reports/${encodeURIComponent(id)}/decision`, { method: 'POST', body: JSON.stringify(input) }) as Promise<any>,
    downloadReport: (id: string, format: 'json' | 'csv'): Promise<Blob> =>
      apiDownload(`/modules/snapproofos/reports/${encodeURIComponent(id)}/export?format=${format}`),
  },
  faultlinelab: {
    policy: (): Promise<Record<string, any>> =>
      apiFetch('/modules/faultlinelab/policy') as Promise<Record<string, any>>,
    listChallenges: (includeDrafts = false): Promise<{ challenges: FaultlineChallengeSummary[]; total: number }> =>
      apiFetch(`/modules/faultlinelab/challenges${includeDrafts ? '?includeDrafts=true' : ''}`) as Promise<any>,
    getChallenge: (id: string): Promise<{ challenge: FaultlineChallengeSummary; content: FaultlineChallengeContent; contentHash: string }> =>
      apiFetch(`/modules/faultlinelab/challenges/${encodeURIComponent(id)}`) as Promise<any>,
    getAuthoringChallenge: (id: string): Promise<{ challenge: FaultlineChallengeSummary; content: Record<string, any>; versions: Array<Record<string, any>> }> =>
      apiFetch(`/modules/faultlinelab/authoring/challenges/${encodeURIComponent(id)}`) as Promise<any>,
    createChallenge: (input: Record<string, unknown>): Promise<Record<string, any>> =>
      apiFetch('/modules/faultlinelab/authoring/challenges', { method: 'POST', body: JSON.stringify(input) }) as Promise<any>,
    updateChallenge: (id: string, input: Record<string, unknown>): Promise<Record<string, any>> =>
      apiFetch(`/modules/faultlinelab/authoring/challenges/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }) as Promise<any>,
    publishChallenge: (id: string, expectedVersion: number, versionNumber?: number): Promise<Record<string, any>> =>
      apiFetch(`/modules/faultlinelab/authoring/challenges/${encodeURIComponent(id)}/publish`, { method: 'POST', body: JSON.stringify({ expectedVersion, versionNumber }) }) as Promise<any>,
    retireChallenge: (id: string, expectedVersion: number): Promise<Record<string, any>> =>
      apiFetch(`/modules/faultlinelab/authoring/challenges/${encodeURIComponent(id)}/retire`, { method: 'POST', body: JSON.stringify({ expectedVersion }) }) as Promise<any>,
    exportChallenge: (id: string): Promise<Record<string, any>> =>
      apiFetch(`/modules/faultlinelab/authoring/challenges/${encodeURIComponent(id)}/export`) as Promise<any>,
    daily: (): Promise<Record<string, any>> => apiFetch('/modules/faultlinelab/daily') as Promise<any>,
    listSessions: (): Promise<{ sessions: FaultlineSessionBundle['session'][]; total: number }> =>
      apiFetch('/modules/faultlinelab/sessions') as Promise<any>,
    getSession: (id: string): Promise<FaultlineSessionBundle> =>
      apiFetch(`/modules/faultlinelab/sessions/${encodeURIComponent(id)}`) as Promise<FaultlineSessionBundle>,
    startSession: (input: Record<string, unknown>): Promise<FaultlineSessionBundle> =>
      apiFetch('/modules/faultlinelab/sessions', { method: 'POST', body: JSON.stringify(input) }) as Promise<FaultlineSessionBundle>,
    addAction: (id: string, input: Record<string, unknown>): Promise<FaultlineSessionBundle> =>
      apiFetch(`/modules/faultlinelab/sessions/${encodeURIComponent(id)}/actions`, { method: 'POST', body: JSON.stringify(input) }) as Promise<FaultlineSessionBundle>,
    submit: (id: string, input: Record<string, unknown>): Promise<FaultlineSessionBundle> =>
      apiFetch(`/modules/faultlinelab/sessions/${encodeURIComponent(id)}/submit`, { method: 'POST', body: JSON.stringify(input) }) as Promise<FaultlineSessionBundle>,
    abandon: (id: string, expectedVersion: number): Promise<Record<string, any>> =>
      apiFetch(`/modules/faultlinelab/sessions/${encodeURIComponent(id)}/abandon`, { method: 'POST', body: JSON.stringify({ expectedVersion }) }) as Promise<any>,
    progress: (): Promise<Record<string, any>> => apiFetch('/modules/faultlinelab/progress') as Promise<any>,
    listAssignments: (): Promise<{ assignments: FaultlineAssignment[]; total: number }> =>
      apiFetch('/modules/faultlinelab/assignments') as Promise<any>,
    listMembers: (): Promise<{ members: Array<{ id: string; name: string; email: string; role: string }>; total: number }> =>
      apiFetch('/modules/faultlinelab/members') as Promise<any>,
    createAssignment: (input: Record<string, unknown>): Promise<{ assignment: FaultlineAssignment }> =>
      apiFetch('/modules/faultlinelab/assignments', { method: 'POST', body: JSON.stringify(input) }) as Promise<any>,
    cancelAssignment: (id: string, expectedVersion: number): Promise<{ assignment: FaultlineAssignment }> =>
      apiFetch(`/modules/faultlinelab/assignments/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ expectedVersion, status: 'canceled' }) }) as Promise<any>,
    analytics: (): Promise<Record<string, any>> => apiFetch('/modules/faultlinelab/analytics') as Promise<any>,
    listSessionAttachments: (id: string): Promise<{ attachments: Array<Record<string, any>> }> =>
      apiFetch(`/modules/faultlinelab/sessions/${encodeURIComponent(id)}/attachments`) as Promise<any>,
    uploadSessionAttachment: (id: string, input: Record<string, unknown>): Promise<Record<string, any>> =>
      apiFetch(`/modules/faultlinelab/sessions/${encodeURIComponent(id)}/attachments`, { method: 'POST', body: JSON.stringify(input) }) as Promise<any>,
    downloadAttempts: (): Promise<Blob> => apiDownload('/modules/faultlinelab/exports/attempts.csv'),
  },
  torqueshed: {
    dashboard: (): Promise<TorqueShedDashboard> => apiFetch('/modules/torqueshed/dashboard') as Promise<TorqueShedDashboard>,
    listVehicles: (query = ''): Promise<{ vehicles: TorqueShedVehicle[]; pagination: { total: number } }> => apiFetch(`/modules/torqueshed/vehicles${query ? `?${query}` : ''}`) as Promise<any>,
    getVehicle: (id: string): Promise<Record<string, any>> => apiFetch(`/modules/torqueshed/vehicles/${encodeURIComponent(id)}`) as Promise<any>,
    createVehicle: (input: Record<string, unknown>): Promise<TorqueShedVehicle> => apiFetch('/modules/torqueshed/vehicles', { method: 'POST', body: JSON.stringify(input) }) as Promise<TorqueShedVehicle>,
    updateVehicle: (id: string, input: Record<string, unknown>): Promise<TorqueShedVehicle> => apiFetch(`/modules/torqueshed/vehicles/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }) as Promise<TorqueShedVehicle>,
    addMileage: (id: string, input: Record<string, unknown>, key: string): Promise<Record<string, any>> => apiFetch(`/modules/torqueshed/vehicles/${encodeURIComponent(id)}/mileage-events`, { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(input) }) as Promise<any>,
    addServiceRecord: (id: string, input: Record<string, unknown>, key: string): Promise<Record<string, any>> => apiFetch(`/modules/torqueshed/vehicles/${encodeURIComponent(id)}/service-records`, { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(input) }) as Promise<any>,
    listBuilds: (): Promise<{ builds: Array<Record<string, any>> }> => apiFetch('/modules/torqueshed/builds?limit=100') as Promise<any>,
    getBuild: (id: string): Promise<Record<string, any>> => apiFetch(`/modules/torqueshed/builds/${encodeURIComponent(id)}`) as Promise<any>,
    createBuild: (input: Record<string, unknown>): Promise<Record<string, any>> => apiFetch('/modules/torqueshed/builds', { method: 'POST', body: JSON.stringify(input) }) as Promise<any>,
    addBuildStage: (id: string, input: Record<string, unknown>): Promise<Record<string, any>> => apiFetch(`/modules/torqueshed/builds/${encodeURIComponent(id)}/stages`, { method: 'POST', body: JSON.stringify(input) }) as Promise<any>,
    addBuildTask: (id: string, input: Record<string, unknown>): Promise<Record<string, any>> => apiFetch(`/modules/torqueshed/builds/${encodeURIComponent(id)}/tasks`, { method: 'POST', body: JSON.stringify(input) }) as Promise<any>,
    listReminders: (): Promise<{ reminders: Array<Record<string, any>> }> => apiFetch('/modules/torqueshed/reminders') as Promise<any>,
    createReminder: (vehicleId: string, input: Record<string, unknown>): Promise<Record<string, any>> => apiFetch(`/modules/torqueshed/vehicles/${encodeURIComponent(vehicleId)}/reminders`, { method: 'POST', body: JSON.stringify(input) }) as Promise<any>,
    listDiagnostics: (query = ''): Promise<{ diagnostics: TorqueShedDiagnostic[]; pagination: { total: number } }> => apiFetch(`/modules/torqueshed/diagnostics${query ? `?${query}` : ''}`) as Promise<any>,
    getDiagnostic: (id: string): Promise<Record<string, any>> => apiFetch(`/modules/torqueshed/diagnostics/${encodeURIComponent(id)}`) as Promise<any>,
    createDiagnostic: (input: Record<string, unknown>): Promise<TorqueShedDiagnostic> => apiFetch('/modules/torqueshed/diagnostics', { method: 'POST', body: JSON.stringify(input) }) as Promise<TorqueShedDiagnostic>,
    updateDiagnostic: (id: string, input: Record<string, unknown>): Promise<TorqueShedDiagnostic> => apiFetch(`/modules/torqueshed/diagnostics/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }) as Promise<TorqueShedDiagnostic>,
    addTroubleCode: (id: string, input: Record<string, unknown>): Promise<Record<string, any>> => apiFetch(`/modules/torqueshed/diagnostics/${encodeURIComponent(id)}/trouble-codes`, { method: 'POST', body: JSON.stringify(input) }) as Promise<any>,
    addDiagnosticEntry: (id: string, input: Record<string, unknown>, key: string): Promise<Record<string, any>> => apiFetch(`/modules/torqueshed/diagnostics/${encodeURIComponent(id)}/entries`, { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(input) }) as Promise<any>,
    listTemplates: (): Promise<{ templates: Array<Record<string, any>> }> => apiFetch('/modules/torqueshed/diagnostic-templates') as Promise<any>,
    createTemplate: (input: Record<string, unknown>): Promise<Record<string, any>> => apiFetch('/modules/torqueshed/diagnostic-templates', { method: 'POST', body: JSON.stringify(input) }) as Promise<any>,
    listVendors: (): Promise<{ vendors: Array<Record<string, any>> }> => apiFetch('/modules/torqueshed/vendors') as Promise<any>,
    createVendor: (input: Record<string, unknown>): Promise<Record<string, any>> => apiFetch('/modules/torqueshed/vendors', { method: 'POST', body: JSON.stringify(input) }) as Promise<any>,
    uploadAttachment: (objectType: 'vehicles' | 'builds' | 'diagnostics', id: string, input: Record<string, unknown>): Promise<Record<string, any>> => apiFetch(`/modules/torqueshed/${objectType}/${encodeURIComponent(id)}/attachments`, { method: 'POST', body: JSON.stringify(input) }) as Promise<any>,
    getSocialPolicy: (): Promise<Record<string, any>> => apiFetch('/modules/torqueshed/social/policy') as Promise<any>,
    listMarketplaceCategories: (): Promise<{ categories: Array<{ id: string; slug: string; name: string }> }> => apiFetch('/modules/torqueshed/marketplace/categories') as Promise<any>,
    listMarketplace: (query = ''): Promise<{ listings: TorqueShedMarketplaceListing[]; pagination: { limit: number; offset: number } }> => apiFetch(`/modules/torqueshed/marketplace/listings${query ? `?${query}` : ''}`) as Promise<any>,
    getMarketplaceListing: (id: string): Promise<{ listing: TorqueShedMarketplaceListing; media: Array<Record<string, any>>; transactionPolicy: string }> => apiFetch(`/modules/torqueshed/marketplace/listings/${encodeURIComponent(id)}`) as Promise<any>,
    createMarketplaceListing: (input: Record<string, unknown>): Promise<TorqueShedMarketplaceListing> => apiFetch('/modules/torqueshed/marketplace/listings', { method: 'POST', body: JSON.stringify(input) }) as Promise<any>,
    updateMarketplaceListing: (id: string, input: Record<string, unknown>): Promise<TorqueShedMarketplaceListing> => apiFetch(`/modules/torqueshed/marketplace/listings/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) }) as Promise<any>,
    publishMarketplaceListing: (id: string, expectedVersion: number): Promise<TorqueShedMarketplaceListing> => apiFetch(`/modules/torqueshed/marketplace/listings/${encodeURIComponent(id)}/publish`, { method: 'POST', body: JSON.stringify({ expectedVersion }) }) as Promise<any>,
    renewMarketplaceListing: (id: string, expectedVersion: number): Promise<TorqueShedMarketplaceListing> => apiFetch(`/modules/torqueshed/marketplace/listings/${encodeURIComponent(id)}/renew`, { method: 'POST', body: JSON.stringify({ expectedVersion }) }) as Promise<any>,
    setMarketplaceListingStatus: (id: string, status: 'sold' | 'archived', expectedVersion: number): Promise<TorqueShedMarketplaceListing> => apiFetch(`/modules/torqueshed/marketplace/listings/${encodeURIComponent(id)}/status`, { method: 'POST', body: JSON.stringify({ status, expectedVersion }) }) as Promise<any>,
    setMarketplaceFavorite: (id: string, favorited: boolean): Promise<{ favorited: boolean }> => apiFetch(`/modules/torqueshed/marketplace/listings/${encodeURIComponent(id)}/favorite`, { method: favorited ? 'PUT' : 'DELETE' }) as Promise<any>,
    contactMarketplaceSeller: (id: string, body: string): Promise<Record<string, any>> => apiFetch(`/modules/torqueshed/marketplace/listings/${encodeURIComponent(id)}/contact`, { method: 'POST', body: JSON.stringify({ body }) }) as Promise<any>,
    reportMarketplaceListing: (id: string, input: Record<string, unknown>): Promise<Record<string, any>> => apiFetch(`/modules/torqueshed/marketplace/listings/${encodeURIComponent(id)}/report`, { method: 'POST', body: JSON.stringify(input) }) as Promise<any>,
    listMarketplaceConversations: (): Promise<{ conversations: Array<Record<string, any>> }> => apiFetch('/modules/torqueshed/marketplace/conversations') as Promise<any>,
    getMarketplaceConversation: (id: string): Promise<{ conversation: Record<string, any>; messages: Array<Record<string, any>> }> => apiFetch(`/modules/torqueshed/marketplace/conversations/${encodeURIComponent(id)}/messages`) as Promise<any>,
    sendMarketplaceMessage: (id: string, body: string): Promise<Record<string, any>> => apiFetch(`/modules/torqueshed/marketplace/conversations/${encodeURIComponent(id)}/messages`, { method: 'POST', body: JSON.stringify({ body }) }) as Promise<any>,
    listCommunityTopics: (): Promise<{ topics: Array<{ id: string; slug: string; name: string }> }> => apiFetch('/modules/torqueshed/community/topics') as Promise<any>,
    getCommunityProfile: (): Promise<{ viewerUserId: string; profile: Record<string, any> | null; preferences: Record<string, any> }> => apiFetch('/modules/torqueshed/community/profile/me') as Promise<any>,
    saveCommunityProfile: (input: Record<string, unknown>): Promise<Record<string, any>> => apiFetch('/modules/torqueshed/community/profile/me', { method: 'PUT', body: JSON.stringify(input) }) as Promise<any>,
    saveCommunityPreferences: (input: Record<string, unknown>): Promise<Record<string, any>> => apiFetch('/modules/torqueshed/community/preferences', { method: 'PUT', body: JSON.stringify(input) }) as Promise<any>,
    setCommunityFollow: (userId: string, following: boolean): Promise<Record<string, any>> => apiFetch(`/modules/torqueshed/community/follows/${encodeURIComponent(userId)}`, { method: following ? 'PUT' : 'DELETE' }) as Promise<any>,
    setCommunityBlock: (userId: string, blocked: boolean): Promise<Record<string, any>> => apiFetch(`/modules/torqueshed/community/blocks/${encodeURIComponent(userId)}`, { method: blocked ? 'PUT' : 'DELETE' }) as Promise<any>,
    listCommunityPosts: (query = ''): Promise<{ posts: TorqueShedCommunityPost[]; pagination: { limit: number; offset: number } }> => apiFetch(`/modules/torqueshed/community/posts${query ? `?${query}` : ''}`) as Promise<any>,
    getCommunityPost: (id: string): Promise<{ post: TorqueShedCommunityPost; comments: TorqueShedCommunityComment[]; tags: Array<Record<string, any>>; media: Array<Record<string, any>> }> => apiFetch(`/modules/torqueshed/community/posts/${encodeURIComponent(id)}`) as Promise<any>,
    createCommunityPost: (input: Record<string, unknown>): Promise<TorqueShedCommunityPost> => apiFetch('/modules/torqueshed/community/posts', { method: 'POST', body: JSON.stringify(input) }) as Promise<any>,
    updateCommunityPost: (id: string, input: Record<string, unknown>): Promise<TorqueShedCommunityPost> => apiFetch(`/modules/torqueshed/community/posts/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) }) as Promise<any>,
    publishCommunityPost: (id: string, expectedVersion: number): Promise<TorqueShedCommunityPost> => apiFetch(`/modules/torqueshed/community/posts/${encodeURIComponent(id)}/publish`, { method: 'POST', body: JSON.stringify({ expectedVersion }) }) as Promise<any>,
    archiveCommunityPost: (id: string, expectedVersion: number): Promise<{ archived: boolean }> => apiFetch(`/modules/torqueshed/community/posts/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ expectedVersion }) }) as Promise<any>,
    addCommunityComment: (id: string, input: Record<string, unknown>): Promise<TorqueShedCommunityComment> => apiFetch(`/modules/torqueshed/community/posts/${encodeURIComponent(id)}/comments`, { method: 'POST', body: JSON.stringify(input) }) as Promise<any>,
    updateCommunityComment: (id: string, input: Record<string, unknown>): Promise<TorqueShedCommunityComment> => apiFetch(`/modules/torqueshed/community/comments/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) }) as Promise<any>,
    archiveCommunityComment: (id: string, expectedVersion: number): Promise<{ archived: boolean }> => apiFetch(`/modules/torqueshed/community/comments/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ expectedVersion }) }) as Promise<any>,
    setCommunityPostReaction: (id: string, reaction: 'like' | 'helpful' | 'insightful'): Promise<{ reaction: string }> => apiFetch(`/modules/torqueshed/community/posts/${encodeURIComponent(id)}/reaction`, { method: 'PUT', body: JSON.stringify({ reaction }) }) as Promise<any>,
    clearCommunityPostReaction: (id: string): Promise<{ reaction: null }> => apiFetch(`/modules/torqueshed/community/posts/${encodeURIComponent(id)}/reaction`, { method: 'DELETE' }) as Promise<any>,
    setCommunityCommentReaction: (id: string, reaction: 'like' | 'helpful' | 'insightful'): Promise<{ reaction: string }> => apiFetch(`/modules/torqueshed/community/comments/${encodeURIComponent(id)}/reaction`, { method: 'PUT', body: JSON.stringify({ reaction }) }) as Promise<any>,
    reportCommunityComment: (id: string, input: Record<string, unknown>): Promise<Record<string, any>> => apiFetch(`/modules/torqueshed/community/comments/${encodeURIComponent(id)}/report`, { method: 'POST', body: JSON.stringify(input) }) as Promise<any>,
    reportCommunityPost: (id: string, input: Record<string, unknown>): Promise<Record<string, any>> => apiFetch(`/modules/torqueshed/community/posts/${encodeURIComponent(id)}/report`, { method: 'POST', body: JSON.stringify(input) }) as Promise<any>,
    uploadSocialMedia: (objectType: 'marketplace_listing' | 'community_post', id: string, input: Record<string, unknown>): Promise<Record<string, any>> => apiFetch(`/modules/torqueshed/social/media/${objectType}/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify(input) }) as Promise<any>,
    listModerationReports: (status = 'open'): Promise<{ reports: Array<Record<string, any>> }> => apiFetch(`/modules/torqueshed/moderation/reports?status=${encodeURIComponent(status)}`) as Promise<any>,
    moderateSocialReport: (id: string, input: Record<string, unknown>): Promise<Record<string, any>> => apiFetch(`/modules/torqueshed/moderation/reports/${encodeURIComponent(id)}/action`, { method: 'POST', body: JSON.stringify(input) }) as Promise<any>,
    getTorqueAssistStatus: (): Promise<TorqueAssistStatus> =>
      apiFetch('/modules/torqueshed/torque-assist/status') as Promise<TorqueAssistStatus>,
    getTorqueAssistContext: (diagnosticSessionId: string): Promise<Record<string, any>> =>
      apiFetch(
        `/modules/torqueshed/diagnostics/${encodeURIComponent(diagnosticSessionId)}/torque-assist/context`,
      ) as Promise<any>,
    getTorqueAssistHistory: (
      diagnosticSessionId: string,
    ): Promise<{ requests: Array<Record<string, any>> }> =>
      apiFetch(
        `/modules/torqueshed/diagnostics/${encodeURIComponent(diagnosticSessionId)}/torque-assist`,
      ) as Promise<any>,
    getTokenLedger: (): Promise<{
      balance: number;
      entries: Array<Record<string, any>>;
      purchases: Array<Record<string, any>>;
    }> => apiFetch('/modules/torqueshed/token-ledger?limit=25') as Promise<any>,
    purchaseTorqueTokens: (
      input: { diagnosticSessionId: string; packageKey: string },
      idempotencyKey: string,
    ): Promise<{ purchase: Record<string, any>; replayed: boolean }> =>
      apiFetch('/modules/torqueshed/token-purchases/checkout', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(input),
      }) as Promise<any>,
    runTorqueAssist: (
      input: {
        diagnosticSessionId: string;
        followUpAnswers?: Array<{ question: string; answer: string }>;
      },
      idempotencyKey: string,
    ): Promise<TorqueAssistResponse> =>
      apiFetch('/modules/torqueshed/torque-assist', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(input),
      }) as Promise<TorqueAssistResponse>,
  },
  pulsedesk: {
    getServiceDeskDashboard: (): Promise<PulseDeskServiceDashboard> =>
      apiFetch('/modules/pulsedesk/dashboard') as Promise<PulseDeskServiceDashboard>,
    listServiceTickets: (query = ''): Promise<{ tickets: PulseDeskServiceTicket[]; pagination: { limit: number; offset: number; total: number } }> =>
      apiFetch(`/modules/pulsedesk/tickets${query ? `?${query}` : ''}`) as Promise<any>,
    getServiceTicket: (id: string): Promise<PulseDeskServiceTicketDetail> =>
      apiFetch(`/modules/pulsedesk/tickets/${encodeURIComponent(id)}`) as Promise<PulseDeskServiceTicketDetail>,
    createServiceTicket: (input: Record<string, unknown>): Promise<PulseDeskServiceTicket> =>
      apiFetch('/modules/pulsedesk/tickets', { method: 'POST', body: JSON.stringify(input) }) as Promise<PulseDeskServiceTicket>,
    updateServiceTicket: (id: string, input: Record<string, unknown>): Promise<PulseDeskServiceTicket> =>
      apiFetch(`/modules/pulsedesk/tickets/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }) as Promise<PulseDeskServiceTicket>,
    addTicketReply: (id: string, body: string, idempotencyKey: string): Promise<unknown> =>
      apiFetch(`/modules/pulsedesk/tickets/${encodeURIComponent(id)}/replies`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ body, phiAcknowledged: true }) }),
    addTicketInternalNote: (id: string, body: string, idempotencyKey: string): Promise<unknown> =>
      apiFetch(`/modules/pulsedesk/tickets/${encodeURIComponent(id)}/internal-notes`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ body, phiAcknowledged: true }) }),
    addTicketTime: (id: string, input: { minutes: number; workType: string; description?: string }, idempotencyKey: string): Promise<unknown> =>
      apiFetch(`/modules/pulsedesk/tickets/${encodeURIComponent(id)}/time-entries`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ ...input, phiAcknowledged: true }) }),
    assignServiceTicket: (id: string, input: Record<string, unknown>): Promise<unknown> =>
      apiFetch(`/modules/pulsedesk/tickets/${encodeURIComponent(id)}/assignments`, { method: 'POST', body: JSON.stringify(input) }),
    transitionServiceTicket: (id: string, action: string, expectedVersion: number): Promise<PulseDeskServiceTicket> =>
      apiFetch(`/modules/pulsedesk/tickets/${encodeURIComponent(id)}/actions/${encodeURIComponent(action)}`, { method: 'POST', body: JSON.stringify({ expectedVersion }) }) as Promise<PulseDeskServiceTicket>,
    evaluateServiceTicketSla: (id: string): Promise<unknown> =>
      apiFetch(`/modules/pulsedesk/tickets/${encodeURIComponent(id)}/sla/evaluate`, { method: 'POST', body: JSON.stringify({}) }),
    addVendorEngagement: (id: string, input: Record<string, unknown>): Promise<unknown> =>
      apiFetch(`/modules/pulsedesk/tickets/${encodeURIComponent(id)}/vendor-engagements`, { method: 'POST', body: JSON.stringify(input) }),
    uploadTicketAttachment: (id: string, input: { originalName: string; declaredMimeType?: string; contentBase64: string; visibility: 'requester' | 'internal' }): Promise<unknown> =>
      apiFetch(`/modules/pulsedesk/tickets/${encodeURIComponent(id)}/attachments`, { method: 'POST', body: JSON.stringify({ ...input, phiAcknowledged: true }) }),
    listTicketAttachments: (id: string, visibility: 'requester' | 'internal'): Promise<Array<Record<string, unknown>>> =>
      apiFetch(`/modules/pulsedesk/tickets/${encodeURIComponent(id)}/attachments?visibility=${visibility}`) as Promise<any>,
    bulkServiceTickets: (input: Record<string, unknown>): Promise<unknown> =>
      apiFetch('/modules/pulsedesk/tickets/bulk', { method: 'POST', body: JSON.stringify(input) }),
    getServiceConfiguration: (): Promise<PulseDeskServiceConfiguration> =>
      apiFetch('/modules/pulsedesk/configuration') as Promise<PulseDeskServiceConfiguration>,
    createServiceQueue: (input: { name: string; description?: string }): Promise<unknown> =>
      apiFetch('/modules/pulsedesk/queues', { method: 'POST', body: JSON.stringify(input) }),
    createSlaPolicy: (input: Record<string, unknown>): Promise<unknown> =>
      apiFetch('/modules/pulsedesk/sla-policies', { method: 'POST', body: JSON.stringify(input) }),
    listServiceAssets: (): Promise<{ assets: Array<Record<string, any>> }> =>
      apiFetch('/modules/pulsedesk/assets?limit=100') as Promise<any>,
    listServiceClients: (type?: DirectoryOrganization['type']): Promise<{ organizations: DirectoryOrganization[]; pagination: DirectoryPagination }> =>
      apiFetch(`/modules/pulsedesk/clients?limit=100${type ? `&type=${encodeURIComponent(type)}` : ''}`) as Promise<any>,
    listServiceFacilities: (): Promise<{ sites: DirectorySite[]; pagination: DirectoryPagination }> =>
      apiFetch('/modules/pulsedesk/facilities?limit=100') as Promise<any>,
    listServiceContacts: (): Promise<{ contacts: DirectoryContact[]; pagination: DirectoryPagination }> =>
      apiFetch('/modules/pulsedesk/contacts?limit=100') as Promise<any>,
    createServiceAsset: (input: Record<string, unknown>): Promise<unknown> =>
      apiFetch('/modules/pulsedesk/assets', { method: 'POST', body: JSON.stringify({ ...input, phiAcknowledged: true }) }),
    listSupplyRequests: (): Promise<{ supplyRequests: Array<Record<string, any>> }> =>
      apiFetch('/modules/pulsedesk/supply-requests') as Promise<any>,
    createSupplyRequest: (input: Record<string, unknown>): Promise<unknown> =>
      apiFetch('/modules/pulsedesk/supply-requests', { method: 'POST', body: JSON.stringify({ ...input, phiAcknowledged: true }) }),
    listFacilityRequests: (): Promise<{ facilityRequests: Array<Record<string, any>> }> =>
      apiFetch('/modules/pulsedesk/facility-requests') as Promise<any>,
    createFacilityRequest: (input: Record<string, unknown>): Promise<unknown> =>
      apiFetch('/modules/pulsedesk/facility-requests', { method: 'POST', body: JSON.stringify({ ...input, phiAcknowledged: true }) }),
    listKnowledge: (): Promise<{ articles: Array<Record<string, any>> }> =>
      apiFetch('/modules/pulsedesk/knowledge') as Promise<any>,
    createKnowledge: (input: Record<string, unknown>): Promise<unknown> =>
      apiFetch('/modules/pulsedesk/knowledge', { method: 'POST', body: JSON.stringify({ ...input, phiAcknowledged: true }) }),
    listSavedViews: (): Promise<{ savedViews: Array<Record<string, any>> }> =>
      apiFetch('/modules/pulsedesk/saved-views') as Promise<any>,
    createSavedView: (input: Record<string, unknown>): Promise<unknown> =>
      apiFetch('/modules/pulsedesk/saved-views', { method: 'POST', body: JSON.stringify(input) }),
    getNotificationPreferences: (): Promise<Record<string, any>> =>
      apiFetch('/modules/pulsedesk/notification-preferences') as Promise<any>,
    saveNotificationPreferences: (input: Record<string, unknown>): Promise<Record<string, any>> =>
      apiFetch('/modules/pulsedesk/notification-preferences', { method: 'PUT', body: JSON.stringify(input) }) as Promise<any>,
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
      input: { expectedVersion: number; name?: string; active?: boolean; description?: string | null; directoryOrganizationId?: string | null; directorySiteId?: string | null },
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
    getWorkspace: (): Promise<TechDeckWorkspaceResponse> =>
      apiFetch('/modules/techdeck/workspace') as Promise<TechDeckWorkspaceResponse>,
    createConfigurationItem: (input: Partial<TechDeckAsset> & { name: string; type: TechDeckAssetType }): Promise<TechDeckAsset> =>
      apiFetch('/modules/techdeck/configuration-items', { method: 'POST', body: JSON.stringify(input) }) as Promise<TechDeckAsset>,
    updateConfigurationItem: (id: string, input: Record<string, unknown> & { expectedVersion: number }): Promise<TechDeckAsset> =>
      apiFetch(`/modules/techdeck/configuration-items/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }) as Promise<TechDeckAsset>,
    createRelationship: (input: { sourceAssetId: string; targetAssetId: string; relationshipType: string; notes?: string }): Promise<TechDeckConfigurationRelationship> =>
      apiFetch('/modules/techdeck/relationships', { method: 'POST', body: JSON.stringify(input) }) as Promise<TechDeckConfigurationRelationship>,
    createDocument: (input: { title: string; pageType: string; content: string; summary?: string; directoryOrganizationId?: string }): Promise<TechDeckDocument> =>
      apiFetch('/modules/techdeck/documents', { method: 'POST', body: JSON.stringify(input) }) as Promise<TechDeckDocument>,
    transitionDocument: (id: string, expectedVersion: number, transition: 'review' | 'approve' | 'publish'): Promise<TechDeckDocument> =>
      apiFetch(`/modules/techdeck/documents/${encodeURIComponent(id)}/${transition}`, { method: 'POST', body: JSON.stringify({ expectedVersion }) }) as Promise<TechDeckDocument>,
    createEvidence: (input: { title: string; evidenceType: string; summary?: string; configurationItemId?: string }): Promise<TechDeckEvidence> =>
      apiFetch('/modules/techdeck/evidence', { method: 'POST', body: JSON.stringify(input) }) as Promise<TechDeckEvidence>,
    generateReport: (name: string, reportType: string): Promise<TechDeckReport> =>
      apiFetch('/modules/techdeck/reports', { method: 'POST', body: JSON.stringify({ name, reportType }) }) as Promise<TechDeckReport>,
    addTime: (input: { workedAt: string; minutes: number; billable?: boolean; ticketId?: string; configurationItemId?: string; notes?: string }): Promise<TechDeckTimeEntry> =>
      apiFetch('/modules/techdeck/time', { method: 'POST', body: JSON.stringify(input) }) as Promise<TechDeckTimeEntry>,
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
    search: (query: string): Promise<TradeFlowKitSearchResponse> =>
      apiFetch(`/modules/tradeflowkit/search?q=${encodeURIComponent(query)}`) as Promise<TradeFlowKitSearchResponse>,
    trash: (): Promise<TradeFlowKitTrashResponse> =>
      apiFetch('/modules/tradeflowkit/trash') as Promise<TradeFlowKitTrashResponse>,
    restoreCustomer: (id: string, expectedVersion: number): Promise<{ ok: true; customer: { id: string; version: number } }> =>
      apiFetch(`/modules/tradeflowkit/trash/customers/${encodeURIComponent(id)}/restore`, { method: 'POST', body: JSON.stringify({ expectedVersion }) }) as Promise<{ ok: true; customer: { id: string; version: number } }>,
    restoreJob: (id: string, expectedVersion: number): Promise<{ ok: true; job: { id: string; version: number } }> =>
      apiFetch(`/modules/tradeflowkit/trash/jobs/${encodeURIComponent(id)}/restore`, { method: 'POST', body: JSON.stringify({ expectedVersion }) }) as Promise<{ ok: true; job: { id: string; version: number } }>,
    restoreInvoice: (id: string, expectedVersion: number): Promise<{ ok: true; invoice: { id: string; version: number } }> =>
      apiFetch(`/modules/tradeflowkit/trash/invoices/${encodeURIComponent(id)}/restore`, { method: 'POST', body: JSON.stringify({ expectedVersion }) }) as Promise<{ ok: true; invoice: { id: string; version: number } }>,
    createCustomer: (input: TradeFlowKitCustomerImportRow): Promise<TradeFlowKitCustomer> =>
      apiFetch('/modules/tradeflowkit/customers', { method: 'POST', body: JSON.stringify(input) }) as Promise<TradeFlowKitCustomer>,
    updateCustomer: (id: string, input: TradeFlowKitCustomerImportRow & { expectedVersion: number }): Promise<TradeFlowKitCustomer> =>
      apiFetch(`/modules/tradeflowkit/customers/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }) as Promise<TradeFlowKitCustomer>,
    archiveCustomer: (id: string, expectedVersion: number): Promise<{ ok: true; customer: TradeFlowKitCustomer }> =>
      apiFetch(`/modules/tradeflowkit/customers/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ expectedVersion }) }) as Promise<{ ok: true; customer: TradeFlowKitCustomer }>,
    importCustomers: (customers: TradeFlowKitCustomerImportRow[], idempotencyKey: string): Promise<TradeFlowKitCustomerImportResult> =>
      apiFetch('/modules/tradeflowkit/customers/import', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ customers }),
      }) as Promise<TradeFlowKitCustomerImportResult>,
    createJob: (input: { customerId: string; title: string; priority?: string }): Promise<TradeFlowKitJob> =>
      apiFetch('/modules/tradeflowkit/jobs', { method: 'POST', body: JSON.stringify(input) }) as Promise<TradeFlowKitJob>,
    createQuote: (input: {
      customerId: string; jobId?: string; lineItems: TradeFlowKitLineItem[]; taxRateBps?: number;
      discountCents?: number; notes?: string; expiresAt?: string;
    }): Promise<TradeFlowKitQuote> =>
      apiFetch('/modules/tradeflowkit/quotes', { method: 'POST', body: JSON.stringify(input) }) as Promise<TradeFlowKitQuote>,
    updateQuote: (id: string, input: {
      expectedVersion: number; customerId: string; jobId?: string; lineItems: TradeFlowKitLineItem[];
      taxRateBps?: number; discountCents?: number; notes?: string; expiresAt?: string;
    }): Promise<TradeFlowKitQuote> =>
      apiFetch(`/modules/tradeflowkit/quotes/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }) as Promise<TradeFlowKitQuote>,
    archiveQuote: (id: string, expectedVersion: number): Promise<{ ok: true; quote: TradeFlowKitQuote }> =>
      apiFetch(`/modules/tradeflowkit/quotes/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ expectedVersion }) }) as Promise<{ ok: true; quote: TradeFlowKitQuote }>,
    quoteToJob: (id: string, expectedVersion: number, title?: string): Promise<TradeFlowKitJob> =>
      apiFetch(`/modules/tradeflowkit/quotes/${encodeURIComponent(id)}/job`, { method: 'POST', body: JSON.stringify({ expectedVersion, title }) }) as Promise<TradeFlowKitJob>,
    transitionQuote: (id: string, expectedVersion: number, status: string): Promise<TradeFlowKitQuote> =>
      apiFetch(`/modules/tradeflowkit/quotes/${encodeURIComponent(id)}/transition`, { method: 'POST', body: JSON.stringify({ expectedVersion, status }) }) as Promise<TradeFlowKitQuote>,
    invoiceQuote: (id: string, expectedVersion: number): Promise<TradeFlowKitInvoice> =>
      apiFetch(`/modules/tradeflowkit/quotes/${encodeURIComponent(id)}/invoice`, { method: 'POST', body: JSON.stringify({ expectedVersion }) }) as Promise<TradeFlowKitInvoice>,
    createInvoice: (input: {
      customerId: string; jobId?: string; lineItems: TradeFlowKitLineItem[]; taxRateBps?: number;
      discountCents?: number; notes?: string; dueDate?: string;
    }): Promise<TradeFlowKitInvoice> =>
      apiFetch('/modules/tradeflowkit/invoices', { method: 'POST', body: JSON.stringify(input) }) as Promise<TradeFlowKitInvoice>,
    updateInvoice: (id: string, input: {
      expectedVersion: number; customerId: string; jobId?: string; lineItems: TradeFlowKitLineItem[];
      taxRateBps?: number; discountCents?: number; notes?: string; dueDate?: string;
    }): Promise<TradeFlowKitInvoice> =>
      apiFetch(`/modules/tradeflowkit/invoices/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }) as Promise<TradeFlowKitInvoice>,
    archiveInvoice: (id: string, expectedVersion: number): Promise<{ ok: true; invoice: TradeFlowKitInvoice }> =>
      apiFetch(`/modules/tradeflowkit/invoices/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ expectedVersion }) }) as Promise<{ ok: true; invoice: TradeFlowKitInvoice }>,
    transitionInvoice: (id: string, expectedVersion: number, status: string): Promise<TradeFlowKitInvoice> =>
      apiFetch(`/modules/tradeflowkit/invoices/${encodeURIComponent(id)}/transition`, { method: 'POST', body: JSON.stringify({ expectedVersion, status }) }) as Promise<TradeFlowKitInvoice>,
    payInvoice: (id: string, expectedVersion: number, paymentMethod: string, paymentReference?: string): Promise<TradeFlowKitInvoice> =>
      apiFetch(`/modules/tradeflowkit/invoices/${encodeURIComponent(id)}/pay`, { method: 'POST', body: JSON.stringify({ expectedVersion, paymentMethod, paymentReference }) }) as Promise<TradeFlowKitInvoice>,
    operations: (filters?: { status?: string; search?: string; limit?: number; offset?: number }): Promise<TradeFlowKitOperationsResponse> => {
      const query = new URLSearchParams();
      if (filters?.status) query.set('status', filters.status);
      if (filters?.search) query.set('search', filters.search);
      if (filters?.limit) query.set('limit', String(filters.limit));
      if (filters?.offset) query.set('offset', String(filters.offset));
      const suffix = query.size ? `?${query.toString()}` : '';
      return apiFetch(`/modules/tradeflowkit/operations${suffix}`) as Promise<TradeFlowKitOperationsResponse>;
    },
    job: (id: string) => apiFetch(`/modules/tradeflowkit/jobs/${encodeURIComponent(id)}`),
    updateJob: (id: string, input: Record<string, unknown>): Promise<TradeFlowKitJob> =>
      apiFetch(`/modules/tradeflowkit/jobs/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }) as Promise<TradeFlowKitJob>,
    archiveJob: (id: string, expectedVersion: number): Promise<{ ok: true; job: TradeFlowKitJob }> =>
      apiFetch(`/modules/tradeflowkit/jobs/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ expectedVersion }) }) as Promise<{ ok: true; job: TradeFlowKitJob }>,
    createTask: (jobId: string, input: { title: string; description?: string; priority?: string; dueAt?: string; sortOrder?: number; workflowStageId?: string }): Promise<TradeFlowKitTask> =>
      apiFetch(`/modules/tradeflowkit/jobs/${encodeURIComponent(jobId)}/tasks`, { method: 'POST', body: JSON.stringify(input) }) as Promise<TradeFlowKitTask>,
    updateTask: (id: string, input: Record<string, unknown>): Promise<TradeFlowKitTask> =>
      apiFetch(`/modules/tradeflowkit/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }) as Promise<TradeFlowKitTask>,
    addTaskDependency: (id: string, dependsOnTaskId: string) =>
      apiFetch(`/modules/tradeflowkit/tasks/${encodeURIComponent(id)}/dependencies`, { method: 'POST', body: JSON.stringify({ dependsOnTaskId }) }),
    workflows: (entityType?: 'job' | 'task'): Promise<TradeFlowKitWorkflow[]> =>
      apiFetch(`/modules/tradeflowkit/workflows${entityType ? `?entityType=${entityType}` : ''}`) as Promise<TradeFlowKitWorkflow[]>,
    createWorkflow: (input: {
      name: string; description?: string; entityType: 'job' | 'task'; isDefault?: boolean;
      stages: Array<{ name: string; color?: string; position?: number; mappedStatus?: string | null }>;
    }): Promise<TradeFlowKitWorkflow> =>
      apiFetch('/modules/tradeflowkit/workflows', { method: 'POST', body: JSON.stringify(input) }) as Promise<TradeFlowKitWorkflow>,
    updateWorkflow: (id: string, input: { expectedVersion: number; name?: string; description?: string; isDefault?: boolean }): Promise<TradeFlowKitWorkflow> =>
      apiFetch(`/modules/tradeflowkit/workflows/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }) as Promise<TradeFlowKitWorkflow>,
    addWorkflowStage: (workflowId: string, input: {
      expectedWorkflowVersion: number; name: string; color?: string; position?: number; mappedStatus?: string | null;
    }): Promise<TradeFlowKitWorkflowStage & { workflowVersion: number }> =>
      apiFetch(`/modules/tradeflowkit/workflows/${encodeURIComponent(workflowId)}/stages`, { method: 'POST', body: JSON.stringify(input) }) as Promise<TradeFlowKitWorkflowStage & { workflowVersion: number }>,
    updateWorkflowStage: (id: string, input: {
      expectedVersion: number; name?: string; color?: string; position?: number; mappedStatus?: string | null;
    }): Promise<TradeFlowKitWorkflowStage> =>
      apiFetch(`/modules/tradeflowkit/workflow-stages/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }) as Promise<TradeFlowKitWorkflowStage>,
    archiveWorkflow: (id: string, expectedVersion: number): Promise<{ ok: true }> =>
      apiFetch(`/modules/tradeflowkit/workflows/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ expectedVersion }) }) as Promise<{ ok: true }>,
    tasks: (filters?: { scope?: 'mine' | 'team'; status?: string; search?: string; jobId?: string; limit?: number; offset?: number }): Promise<TradeFlowKitTaskList> => {
      const query = new URLSearchParams();
      if (filters?.scope) query.set('scope', filters.scope);
      if (filters?.status) query.set('status', filters.status);
      if (filters?.search) query.set('search', filters.search);
      if (filters?.jobId) query.set('jobId', filters.jobId);
      if (filters?.limit) query.set('limit', String(filters.limit));
      if (filters?.offset) query.set('offset', String(filters.offset));
      const suffix = query.size ? `?${query.toString()}` : '';
      return apiFetch(`/modules/tradeflowkit/tasks${suffix}`) as Promise<TradeFlowKitTaskList>;
    },
    task: (id: string) => apiFetch(`/modules/tradeflowkit/tasks/${encodeURIComponent(id)}`),
    archiveTask: (id: string, expectedVersion: number): Promise<{ ok: true }> =>
      apiFetch(`/modules/tradeflowkit/tasks/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ expectedVersion }) }) as Promise<{ ok: true }>,
    activity: (filters?: { entityType?: string; entityId?: string; limit?: number; offset?: number }): Promise<{ items: TradeFlowKitActivity[] }> => {
      const query = new URLSearchParams();
      if (filters?.entityType) query.set('entityType', filters.entityType);
      if (filters?.entityId) query.set('entityId', filters.entityId);
      if (filters?.limit) query.set('limit', String(filters.limit));
      if (filters?.offset) query.set('offset', String(filters.offset));
      const suffix = query.size ? `?${query.toString()}` : '';
      return apiFetch(`/modules/tradeflowkit/activity${suffix}`) as Promise<{ items: TradeFlowKitActivity[] }>;
    },
    transitionJobWorkflow: (id: string, workflowStageId: string, expectedVersion: number): Promise<TradeFlowKitJob> =>
      apiFetch(`/modules/tradeflowkit/jobs/${encodeURIComponent(id)}/workflow-transition`, {
        method: 'POST', body: JSON.stringify({ workflowStageId, expectedVersion }),
      }) as Promise<TradeFlowKitJob>,
    convertLead: (id: string) => apiFetch(`/modules/tradeflowkit/leads/${encodeURIComponent(id)}/convert`, {
      method: 'POST', headers: { 'Idempotency-Key': `lead-convert:${id}` }, body: '{}',
    }),
    recordPayment: (id: string, input: { expectedVersion: number; amountCents: number; method: string; reference?: string }, key: string) =>
      apiFetch(`/modules/tradeflowkit/invoices/${encodeURIComponent(id)}/payments`, { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(input) }),
    settings: (): Promise<TradeFlowKitSettings> => apiFetch('/modules/tradeflowkit/settings') as Promise<TradeFlowKitSettings>,
    updateSettings: (input: Partial<TradeFlowKitSettings> & { expectedVersion: number }): Promise<TradeFlowKitSettings> =>
      apiFetch('/modules/tradeflowkit/settings', { method: 'PATCH', body: JSON.stringify(input) }) as Promise<TradeFlowKitSettings>,
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
    workspace: () => apiFetch('/modules/callcommand-ai/workspace'),
    get: (id: string) => apiFetch(`/modules/callcommand-ai/calls/${id}`),
    createChannel: (input: Record<string, unknown>) =>
      apiFetch('/modules/callcommand-ai/channels', { method: 'POST', body: JSON.stringify(input) }),
    createProfile: (input: Record<string, unknown>) =>
      apiFetch('/modules/callcommand-ai/profiles', { method: 'POST', body: JSON.stringify(input) }),
    createTransferTarget: (input: Record<string, unknown>) =>
      apiFetch('/modules/callcommand-ai/transfer-targets', { method: 'POST', body: JSON.stringify(input) }),
    grantConsent: (input: Record<string, unknown>) =>
      apiFetch('/modules/callcommand-ai/consents', { method: 'POST', body: JSON.stringify(input) }),
    suppress: (input: Record<string, unknown>) =>
      apiFetch('/modules/callcommand-ai/suppressions', { method: 'POST', body: JSON.stringify(input) }),
    place: (input: Record<string, unknown>) =>
      apiFetch('/modules/callcommand-ai/calls', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    draftFollowup: (id: string, input: Record<string, unknown>) =>
      apiFetch(`/modules/callcommand-ai/calls/${encodeURIComponent(id)}/followups`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    setDisposition: (id: string, input: Record<string, unknown>) =>
      apiFetch(`/modules/callcommand-ai/calls/${encodeURIComponent(id)}/disposition`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    telephonyStatus: () => apiFetch('/modules/callcommand-ai/telephony/status'),
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
    workspace: () => apiFetch('/modules/studyforge-ai/workspace'),
    createSubject: (input: { name: string; courseCode?: string | null; description?: string | null }) =>
      apiFetch('/modules/studyforge-ai/subjects', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    createSource: (input: { subjectId?: string | null; title: string; sourceType: 'note'; body: string }) =>
      apiFetch('/modules/studyforge-ai/sources', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    uploadSource: (input: {
      subjectId?: string | null;
      title: string;
      originalName: string;
      mimeType: string;
      contentBase64: string;
      idempotencyKey: string;
    }) => {
      const { idempotencyKey, ...body } = input;
      return apiFetch('/modules/studyforge-ai/sources/document', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(body),
      });
    },
    generate: (input: {
      sourceId: string;
      subjectId?: string | null;
      type: 'deck' | 'quiz' | 'study_plan';
      title: string;
      targetDate?: string | null;
      idempotencyKey: string;
    }) => apiFetch('/modules/studyforge-ai/generations', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
    setStatus: (entity: 'decks' | 'quizzes' | 'plans', id: string, status: string, expectedVersion: number) =>
      apiFetch(`/modules/studyforge-ai/${entity}/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, expectedVersion }),
      }),
    updateCard: (id: string, input: { question?: string; answer?: string; sourceExcerpt?: string | null; expectedVersion: number }) =>
      apiFetch(`/modules/studyforge-ai/cards/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    updateQuestion: (id: string, input: {
      question?: string;
      choices?: string[];
      correctIndex?: number;
      explanation?: string;
      sourceExcerpt?: string | null;
      expectedVersion: number;
    }) => apiFetch(`/modules/studyforge-ai/questions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
    submitAttempt: (quizId: string, answers: Array<{ questionId: string; selectedIndex: number }>) =>
      apiFetch(`/modules/studyforge-ai/quizzes/${encodeURIComponent(quizId)}/attempts`, {
        method: 'POST',
        body: JSON.stringify({ answers }),
      }),
    reviewCard: (cardId: string, rating: 'again' | 'hard' | 'good' | 'easy', expectedVersion?: number) =>
      apiFetch(`/modules/studyforge-ai/cards/${encodeURIComponent(cardId)}/reviews`, {
        method: 'POST',
        body: JSON.stringify({ rating, ...(expectedVersion ? { expectedVersion } : {}) }),
      }),
    completeSession: (id: string, completed: boolean, expectedVersion: number) =>
      apiFetch(`/modules/studyforge-ai/plan-sessions/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ completed, expectedVersion }),
      }),
    updatePlanSession: (id: string, input: {
      title?: string;
      focus?: string;
      scheduledFor?: string | null;
      estimatedMinutes?: number;
      expectedVersion: number;
    }) => apiFetch(`/modules/studyforge-ai/plan-sessions/${encodeURIComponent(id)}/content`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  },
  ninjamation: {
    workspace: () => apiFetch('/modules/ninjamation/workspace'),
    detail: (id: string) =>
      apiFetch(`/modules/ninjamation/scripts/${encodeURIComponent(id)}`),
    create: (input: {
      name: string;
      description?: string;
      language: 'powershell' | 'python' | 'batch' | 'bash';
      category?: string;
      riskTier?: 'low' | 'medium' | 'high';
      content: string;
    }) =>
      apiFetch('/modules/ninjamation/scripts', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    update: (id: string, input: Record<string, unknown>) =>
      apiFetch(`/modules/ninjamation/scripts/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    submitReview: (id: string, expectedVersion: number, note?: string) =>
      apiFetch(`/modules/ninjamation/scripts/${encodeURIComponent(id)}/review`, {
        method: 'POST',
        body: JSON.stringify({ expectedVersion, note }),
      }),
    approve: (id: string, expectedVersion: number, note?: string) =>
      apiFetch(`/modules/ninjamation/scripts/${encodeURIComponent(id)}/approve`, {
        method: 'POST',
        body: JSON.stringify({ expectedVersion, note }),
      }),
    reject: (id: string, expectedVersion: number, note?: string) =>
      apiFetch(`/modules/ninjamation/scripts/${encodeURIComponent(id)}/reject`, {
        method: 'POST',
        body: JSON.stringify({ expectedVersion, note }),
      }),
    retire: (id: string, expectedVersion: number, note?: string) =>
      apiFetch(`/modules/ninjamation/scripts/${encodeURIComponent(id)}/retire`, {
        method: 'POST',
        body: JSON.stringify({ expectedVersion, note }),
      }),
    generate: (input: {
      idempotencyKey: string;
      prompt: string;
      name?: string;
      description?: string;
      language: 'powershell' | 'python' | 'batch' | 'bash';
      category?: string;
      riskTier?: 'low' | 'medium' | 'high';
    }) =>
      apiFetch('/modules/ninjamation/generations', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    download: (id: string) =>
      apiDownload(`/modules/ninjamation/scripts/${encodeURIComponent(id)}/downloads`, {
        method: 'POST',
      }),
  },
  outcall: {
    workspace: () => apiFetch('/modules/outcall/workspace'),
    acceptSafety: () => apiFetch('/modules/outcall/onboarding/accept-safety', {
      method: 'POST',
      body: JSON.stringify({ accepted: true }),
    }),
    verifyPhone: (phone: string, verificationCode: string) =>
      apiFetch('/modules/outcall/phone-verification', {
        method: 'POST',
        body: JSON.stringify({ phone, verificationCode }),
      }),
    createProfile: (input: { name: string; message: string }) =>
      apiFetch('/modules/outcall/profiles', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    createTrigger: (input: { phrase: string; neutralReply: string; delaySeconds: number }) =>
      apiFetch('/modules/outcall/triggers', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    schedule: (input: { profileId: string; runAt?: string; idempotencyKey: string }) =>
      apiFetch('/modules/outcall/calls', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    cancel: (id: string) =>
      apiFetch(`/modules/outcall/calls/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
  },
  launchkit: {
    templates: () => apiFetch('/modules/ninja-launch-kit/templates'),
    workspace: () => apiFetch('/modules/ninja-launch-kit/workspace'),
    detail: (id: string) => apiFetch(`/modules/ninja-launch-kit/launches/${encodeURIComponent(id)}`),
    create: (input: Record<string, unknown>) =>
      apiFetch('/modules/ninja-launch-kit/launches', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    update: (id: string, input: Record<string, unknown>) =>
      apiFetch(`/modules/ninja-launch-kit/launches/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    createTask: (id: string, input: Record<string, unknown>) =>
      apiFetch(`/modules/ninja-launch-kit/launches/${encodeURIComponent(id)}/tasks`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    updatePhase: (id: string, input: Record<string, unknown>) =>
      apiFetch(`/modules/ninja-launch-kit/phases/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    updateMilestone: (id: string, input: Record<string, unknown>) =>
      apiFetch(`/modules/ninja-launch-kit/milestones/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    updateTask: (id: string, input: Record<string, unknown>) =>
      apiFetch(`/modules/ninja-launch-kit/tasks/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    updateArtifact: (id: string, input: Record<string, unknown>) =>
      apiFetch(`/modules/ninja-launch-kit/artifacts/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    generate: (id: string, idempotencyKey: string) =>
      apiFetch(`/modules/ninja-launch-kit/launches/${encodeURIComponent(id)}/generations`, {
        method: 'POST',
        body: JSON.stringify({ idempotencyKey }),
      }),
    export: (id: string, format: 'json' | 'markdown' | 'csv') =>
      apiFetch(`/modules/ninja-launch-kit/launches/${encodeURIComponent(id)}/exports`, {
        method: 'POST',
        body: JSON.stringify({ format }),
      }),
    addAsset: (id: string, input: { originalName: string; mimeType: string; contentBase64: string }) =>
      apiFetch(`/modules/ninja-launch-kit/launches/${encodeURIComponent(id)}/assets`, {
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
