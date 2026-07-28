import { pgTable, text, varchar, timestamp, integer, boolean, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const workspaces = pgTable('workspaces', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id', { length: 36 }),
  gitUrl: text('git_url').notNull(),
  gitRef: text('git_ref').notNull().default('main'),
  profileId: text('profile_id').notNull().default('node20'),
  status: text('status', {
    enum: ['pending', 'provisioning', 'running', 'stopped', 'error'],
  }).notNull().default('pending'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('idx_workspaces_status').on(t.status),
  index('idx_workspaces_user').on(t.userId),
]);

export const runners = pgTable('runners', {
  workspaceId: varchar('workspace_id', { length: 36 }).primaryKey().references(() => workspaces.id),
  mode: text('mode', { enum: ['k8s', 'docker', 'local'] }).notNull().default('docker'),
  podName: text('pod_name'),
  namespace: text('namespace'),
  pvcName: text('pvc_name'),
  containerId: text('container_id'),
  status: text('status', {
    enum: ['pending', 'creating', 'running', 'stopped', 'error'],
  }).notNull().default('pending'),
  startedAt: timestamp('started_at'),
  stoppedAt: timestamp('stopped_at'),
});

export const tasks = pgTable('tasks', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar('workspace_id', { length: 36 }).notNull().references(() => workspaces.id),
  title: text('title').notNull(),
  goal: text('goal'),
  status: text('status', {
    enum: ['pending', 'running', 'succeeded', 'failed'],
  }).notNull().default('pending'),
  requiredChecks: jsonb('required_checks').$type<string[]>(),
  checkResults: jsonb('check_results').$type<Record<string, { passed: boolean; output: string }>>(),
  resultSummary: text('result_summary'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  startedAt: timestamp('started_at'),
  finishedAt: timestamp('finished_at'),
}, (t) => [
  index('idx_tasks_workspace').on(t.workspaceId),
]);

export const taskEvents = pgTable('task_events', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar('task_id', { length: 36 }).notNull().references(() => tasks.id),
  ts: timestamp('ts').defaultNow().notNull(),
  type: text('type').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>(),
}, (t) => [
  index('idx_task_events_task_ts').on(t.taskId, t.ts),
]);

export const toolTraces = pgTable('tool_traces', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar('task_id', { length: 36 }).notNull().references(() => tasks.id),
  ts: timestamp('ts').defaultNow().notNull(),
  toolName: text('tool_name').notNull(),
  input: jsonb('input').$type<Record<string, unknown>>(),
  output: jsonb('output').$type<Record<string, unknown>>(),
  success: boolean('success'),
  durationMs: integer('duration_ms'),
}, (t) => [
  index('idx_tool_traces_task_ts').on(t.taskId, t.ts),
]);

export const workspacePorts = pgTable('workspace_ports', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar('workspace_id', { length: 36 }).notNull().references(() => workspaces.id),
  port: integer('port').notNull(),
  protocol: text('protocol').notNull().default('http'),
  isPrimary: boolean('is_primary').notNull().default(false),
  healthPath: text('health_path'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const workspaceProcesses = pgTable('workspace_processes', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar('workspace_id', { length: 36 }).notNull().references(() => workspaces.id),
  name: text('name').notNull(),
  command: text('command').notNull(),
  status: text('status').notNull().default('running'),
  providerProcessId: text('provider_process_id'),
  serviceId: varchar('service_id', { length: 36 }),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  finishedAt: timestamp('finished_at'),
  exitCode: integer('exit_code'),
  durationMs: integer('duration_ms'),
  logPath: text('log_path'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('idx_workspace_processes_workspace_started').on(t.workspaceId, t.startedAt),
]);

export const workspaceServices = pgTable('workspace_services', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar('workspace_id', { length: 36 }).notNull().references(() => workspaces.id),
  name: text('name').notNull(),
  type: text('type').notNull().default('custom'),
  command: text('command').notNull(),
  status: text('status').notNull().default('stopped'),
  port: integer('port'),
  protocol: text('protocol').notNull().default('http'),
  healthPath: text('health_path'),
  processId: varchar('process_id', { length: 36 }),
  startedAt: timestamp('started_at'),
  stoppedAt: timestamp('stopped_at'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('idx_workspace_services_workspace_updated').on(t.workspaceId, t.updatedAt),
]);

export const automationRules = pgTable('automation_rules', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar('workspace_id', { length: 36 }).notNull().references(() => workspaces.id),
  name: text('name').notNull(),
  triggerType: text('trigger_type').notNull(),
  triggerJson: jsonb('trigger_json').$type<Record<string, unknown>>(),
  actionType: text('action_type').notNull(),
  actionJson: jsonb('action_json').$type<Record<string, unknown>>(),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('idx_automation_rules_workspace_updated').on(t.workspaceId, t.updatedAt),
]);

export const systemEvents = pgTable('system_events', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar('workspace_id', { length: 36 }).references(() => workspaces.id),
  taskId: varchar('task_id', { length: 36 }),
  source: text('source').notNull(),
  type: text('type').notNull(),
  severity: text('severity').notNull().default('info'),
  payload: jsonb('payload').$type<Record<string, unknown>>(),
  ts: timestamp('ts').defaultNow().notNull(),
}, (t) => [
  index('idx_system_events_workspace_ts').on(t.workspaceId, t.ts),
]);

export const systemNotifications = pgTable('system_notifications', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar('workspace_id', { length: 36 }).references(() => workspaces.id),
  title: text('title').notNull(),
  message: text('message').notNull(),
  level: text('level').notNull().default('info'),
  read: boolean('read').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_system_notifications_workspace_created').on(t.workspaceId, t.createdAt),
]);

export const workspaceSnapshots = pgTable('workspace_snapshots', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar('workspace_id', { length: 36 }).notNull().references(() => workspaces.id),
  label: text('label').notNull(),
  gitRef: text('git_ref'),
  metadataJson: jsonb('metadata_json').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_workspace_snapshots_workspace_created').on(t.workspaceId, t.createdAt),
]);

export const publishRuns = pgTable('publish_runs', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar('workspace_id', { length: 36 }).notNull().references(() => workspaces.id),
  status: text('status', {
    enum: ['analyzing', 'planned', 'artifacts_generated', 'proof_running', 'proof_done', 'failed'],
  }).notNull().default('analyzing'),
  detectedJson: jsonb('detected_json'),
  planJson: jsonb('plan_json'),
  proofJson: jsonb('proof_json'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('idx_publish_runs_workspace').on(t.workspaceId),
]);

export const users = pgTable('users', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: text('role', { enum: ['user', 'admin'] }).notNull().default('user'),
  // Gate 1: platform-scoped authority. Distinct from `role` (legacy) and from
  // `tenant_users.role` (tenant-scoped). Only `super_admin` may reach
  // platform-only routes (e.g. GET /v1/tenants).
  platformRole: text('platform_role', { enum: ['super_admin', 'user'] }).notNull().default('user'),
  // The tenant the user is currently acting in. Resolver precedence is
  // `:tenantId` path param > `X-Tenant-Id` header > this column.
  currentTenantId: varchar('current_tenant_id', { length: 36 }),
  status: text('status', { enum: ['active', 'suspended', 'deleted', 'pending'] }).notNull().default('active'),
  avatarUrl: text('avatar_url'),
  planId: varchar('plan_id', { length: 36 }),
  failedLoginCount: integer('failed_login_count').notNull().default(0),
  lockedUntil: timestamp('locked_until'),
  tokenVersion: integer('token_version').notNull().default(0),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  lastLoginAt: timestamp('last_login_at'),
}, (t) => [
  index('idx_users_email').on(t.email),
  index('idx_users_status').on(t.status),
  index('idx_users_platform_role').on(t.platformRole),
]);

export const subscriptionPlans = pgTable('subscription_plans', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
  price: integer('price').notNull().default(0),
  interval: text('interval', { enum: ['month', 'year'] }).notNull().default('month'),
  maxWorkspaces: integer('max_workspaces').notNull().default(1),
  maxProjects: integer('max_projects').notNull().default(3),
  maxTasks: integer('max_tasks').notNull().default(50),
  maxTeamMembers: integer('max_team_members').notNull().default(0),
  maxAiActionsPerMonth: integer('max_ai_actions_per_month').notNull().default(10),
  hasExports: boolean('has_exports').notNull().default(false),
  hasAutomation: boolean('has_automation').notNull().default(false),
  hasTemplates: boolean('has_templates').notNull().default(false),
  hasAdvancedAnalytics: boolean('has_advanced_analytics').notNull().default(false),
  stripePriceId: text('stripe_price_id'),
  stripeProductId: text('stripe_product_id'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const subscriptions = pgTable('subscriptions', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  planId: varchar('plan_id', { length: 36 }).notNull().references(() => subscriptionPlans.id),
  status: text('status', {
    enum: ['active', 'trialing', 'past_due', 'canceled', 'expired'],
  }).notNull().default('active'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  stripeCustomerId: text('stripe_customer_id'),
  currentPeriodStart: timestamp('current_period_start').defaultNow().notNull(),
  currentPeriodEnd: timestamp('current_period_end'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  trialEnd: timestamp('trial_end'),
  organizationId: varchar('organization_id', { length: 36 }),
  scopeType: text('scope_type').notNull().default('user'),
  // Gate 1: nullable tenant link, back-filled to the owning user's
  // personal tenant. New writes should always set this.
  tenantId: varchar('tenant_id', { length: 36 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('idx_subscriptions_user').on(t.userId),
  index('idx_subscriptions_status').on(t.status),
  index('idx_subscriptions_tenant').on(t.tenantId),
]);

export const saasWorkspaces = pgTable('saas_workspaces', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar('owner_id', { length: 36 }).notNull().references(() => users.id),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),
  // Gate 2: nullable tenant scope, back-filled to owner's personal tenant.
  // New writes always set this; reads scope by tenantId.
  tenantId: varchar('tenant_id', { length: 36 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('idx_saas_workspaces_owner').on(t.ownerId),
  index('idx_saas_workspaces_tenant').on(t.tenantId),
]);

export const workspaceMemberships = pgTable('workspace_memberships', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar('workspace_id', { length: 36 }).notNull().references(() => saasWorkspaces.id),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  role: text('role', { enum: ['owner', 'admin', 'member'] }).notNull().default('member'),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
}, (t) => [
  index('idx_workspace_memberships_workspace').on(t.workspaceId),
  index('idx_workspace_memberships_user').on(t.userId),
]);

export const saasProjects = pgTable('saas_projects', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar('workspace_id', { length: 36 }).notNull().references(() => saasWorkspaces.id),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status', { enum: ['active', 'archived', 'completed'] }).notNull().default('active'),
  color: text('color').default('#3b82f6'),
  // Gate 2: nullable tenant scope, mirrors parent workspace.
  tenantId: varchar('tenant_id', { length: 36 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('idx_saas_projects_workspace').on(t.workspaceId),
  index('idx_saas_projects_user').on(t.userId),
  index('idx_saas_projects_tenant').on(t.tenantId),
]);

export const saasTasks = pgTable('saas_tasks', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar('project_id', { length: 36 }).notNull().references(() => saasProjects.id),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status', { enum: ['todo', 'in_progress', 'done', 'canceled'] }).notNull().default('todo'),
  priority: text('priority', { enum: ['low', 'medium', 'high', 'urgent'] }).notNull().default('medium'),
  dueDate: timestamp('due_date'),
  assigneeId: varchar('assignee_id', { length: 36 }),
  // Gate 2: nullable tenant scope, mirrors parent project.
  tenantId: varchar('tenant_id', { length: 36 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('idx_saas_tasks_project').on(t.projectId),
  index('idx_saas_tasks_user').on(t.userId),
  index('idx_saas_tasks_status').on(t.status),
  index('idx_saas_tasks_tenant').on(t.tenantId),
]);

export const notes = pgTable('notes', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  workspaceId: varchar('workspace_id', { length: 36 }).references(() => saasWorkspaces.id),
  projectId: varchar('project_id', { length: 36 }).references(() => saasProjects.id),
  title: text('title').notNull(),
  content: text('content').default(''),
  isPinned: boolean('is_pinned').notNull().default(false),
  // Gate 2: nullable tenant scope, back-filled to author's personal tenant.
  tenantId: varchar('tenant_id', { length: 36 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('idx_notes_user').on(t.userId),
  index('idx_notes_workspace').on(t.workspaceId),
  index('idx_notes_tenant').on(t.tenantId),
]);

export const activityFeed = pgTable('activity_feed', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  workspaceId: varchar('workspace_id', { length: 36 }).references(() => saasWorkspaces.id),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: varchar('entity_id', { length: 36 }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  // Gate 2: nullable tenant scope, back-filled to actor's personal tenant.
  tenantId: varchar('tenant_id', { length: 36 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_activity_feed_user').on(t.userId),
  index('idx_activity_feed_workspace_created').on(t.workspaceId, t.createdAt),
  index('idx_activity_feed_tenant').on(t.tenantId),
]);

export const usageTracking = pgTable('usage_tracking', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  actionType: text('action_type').notNull(),
  count: integer('count').notNull().default(1),
  periodStart: timestamp('period_start').notNull(),
  periodEnd: timestamp('period_end').notNull(),
  // Gate 2: nullable tenant scope; usage is now metered per (user, tenant).
  tenantId: varchar('tenant_id', { length: 36 }),
  // Task #31: nullable per-module dimension. Set for actionType='module_usage'
  // events emitted by the SSO handoff path so admins can see real per-module
  // usage. Stays NULL for legacy 'ai_action' rows (which are not module-scoped).
  moduleId: varchar('module_id', { length: 36 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_usage_tracking_user_period').on(t.userId, t.periodStart),
  index('idx_usage_tracking_tenant_period').on(t.tenantId, t.periodStart),
  index('idx_usage_tracking_tenant_module_period').on(t.tenantId, t.moduleId, t.periodStart),
]);

export const adminAuditLogs = pgTable('admin_audit_logs', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar('admin_id', { length: 36 }).notNull().references(() => users.id),
  action: text('action').notNull(),
  targetUserId: varchar('target_user_id', { length: 36 }),
  details: jsonb('details').$type<Record<string, unknown>>(),
  ipAddress: text('ip_address'),
  // Gate 1: nullable tenant scope for the action (back-filled to admin's personal tenant).
  tenantId: varchar('tenant_id', { length: 36 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_admin_audit_logs_admin').on(t.adminId),
  index('idx_admin_audit_logs_created').on(t.createdAt),
  index('idx_admin_audit_logs_tenant_created').on(t.tenantId, t.createdAt.desc()),
]);

export const billingEvents = pgTable('billing_events', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  // Nullable: webhook claim rows are written before user resolution so
  // even unattributed events get an idempotency record + raw payload for
  // admin DLQ replay. Side-effect inserts continue to set this.
  userId: varchar('user_id', { length: 36 }).references(() => users.id),
  subscriptionId: varchar('subscription_id', { length: 36 }),
  eventType: text('event_type').notNull(),
  stripeEventId: text('stripe_event_id'),
  amount: integer('amount'),
  currency: text('currency').default('usd'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  payloadHash: text('payload_hash'),
  retryCount: integer('retry_count').notNull().default(0),
  processedAt: timestamp('processed_at'),
  errorMessage: text('error_message'),
  // Gate 1: nullable tenant link, back-filled to the user's personal tenant.
  tenantId: varchar('tenant_id', { length: 36 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_billing_events_user').on(t.userId),
  index('idx_billing_events_processed').on(t.processedAt),
  index('idx_billing_events_tenant').on(t.tenantId),
]);

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_password_reset_tokens_token').on(t.token),
]);

export const adminNotes = pgTable('admin_notes', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar('admin_id', { length: 36 }).notNull().references(() => users.id),
  targetUserId: varchar('target_user_id', { length: 36 }).notNull().references(() => users.id),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('idx_admin_notes_target').on(t.targetUserId),
  index('idx_admin_notes_created').on(t.createdAt),
]);

export type AdminNoteRow = typeof adminNotes.$inferSelect;

// ===========================================================================
// Shotgun OS Hub — modules, entitlements, and SSO
// ===========================================================================

export const modules = pgTable('modules', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').default(''),
  iconUrl: text('icon_url'),
  category: text('category').default('app'),
  // Task #114: nullable FK-style reference to platform_components.id. The
  // grouping source of truth is the SDK catalog; this column is back-filled
  // by the module seeder (only when null) and may be admin-overridden.
  // Kept nullable for safe rollout — never required for module behavior.
  componentId: varchar('component_id', { length: 36 }),
  baseUrl: text('base_url').notNull().default(''),
  status: text('status').notNull().default('coming_soon'),
  planMin: text('plan_min').notNull().default('elite'),
  requiresOrg: boolean('requires_org').notNull().default(false),
  ord: integer('ord').notNull().default(0),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  // Task #108: optional receiver-registered URL we POST signed
  // entitlement-change snapshots to. Nullable means "no live push, do
  // on-demand introspect instead".
  entitlementWebhookUrl: text('entitlement_webhook_url'),
  // Task #109: per-module push-adapter selection.
  //   pushShape       — 'canonical_snapshot' (default) | 'tradeflowkit_v1'
  //   pushAuthMode    — 'hmac_signature' (default) | 'bearer_token'
  //   pushBearerEnvVar — env-var NAME holding the bearer token when
  //                      pushAuthMode='bearer_token'. Null for HMAC.
  // The adapter is a transport/presentation layer only — it does not
  // alter the resolver snapshot. See entitlement-adapters/ for details.
  pushShape: text('push_shape').notNull().default('canonical_snapshot'),
  pushAuthMode: text('push_auth_mode').notNull().default('hmac_signature'),
  pushBearerEnvVar: text('push_bearer_env_var'),
  // Gate 2: soft-delete. Module rows are never hard-deleted; archived rows
  // are excluded from default catalogs but kept for audit + entitlement
  // history.
  archivedAt: timestamp('archived_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('idx_modules_slug').on(t.slug),
  index('idx_modules_status').on(t.status),
  index('idx_modules_archived').on(t.archivedAt),
  // Task #114: lookups by platform component (grouping queries).
  index('idx_modules_component').on(t.componentId),
]);

// Task #114: platform components — the top-level grouping layer above
// modules (Command Center, Operations Deck, Diagnostic Lab, Growth Forge).
// Seeded from the SDK PLATFORM_COMPONENTS catalog. Purely additive: no
// entitlement, billing, SSO, or launch behavior reads this table yet.
export const platformComponents = pgTable('platform_components', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').default(''),
  audience: text('audience').default(''),
  ord: integer('ord').notNull().default(0),
  iconUrl: text('icon_url'),
  status: text('status').notNull().default('active'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('idx_platform_components_slug').on(t.slug),
  index('idx_platform_components_ord').on(t.ord),
]);

export const planModules = pgTable('plan_modules', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  planId: varchar('plan_id', { length: 36 }).notNull().references(() => subscriptionPlans.id),
  moduleId: varchar('module_id', { length: 36 }).notNull().references(() => modules.id),
  // Task #108: per-(plan, module) feature flag defaults. Tenants can
  // override individual keys via `tenant_modules.metadata.features`.
  featureFlagsJson: jsonb('feature_flags_json').$type<Record<string, boolean | number | string>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_plan_modules_plan').on(t.planId),
  index('idx_plan_modules_module').on(t.moduleId),
]);

export const addonSubscriptions = pgTable('addon_subscriptions', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  organizationId: varchar('organization_id', { length: 36 }),
  scopeType: text('scope_type').notNull().default('user'),
  moduleId: varchar('module_id', { length: 36 }).notNull().references(() => modules.id),
  status: text('status').notNull().default('active'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  stripeCustomerId: text('stripe_customer_id'),
  stripePriceId: text('stripe_price_id'),
  amount: integer('amount').notNull().default(0),
  currentPeriodStart: timestamp('current_period_start').defaultNow().notNull(),
  currentPeriodEnd: timestamp('current_period_end'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  // Gate 1: nullable tenant scope (back-filled to the buyer's personal tenant).
  tenantId: varchar('tenant_id', { length: 36 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('idx_addon_subs_user').on(t.userId),
  index('idx_addon_subs_module').on(t.moduleId),
  index('idx_addon_subs_status').on(t.status),
  index('idx_addon_subs_tenant').on(t.tenantId),
]);

export const entitlementOverrides = pgTable('entitlement_overrides', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  organizationId: varchar('organization_id', { length: 36 }),
  moduleId: varchar('module_id', { length: 36 }).notNull().references(() => modules.id),
  grant: boolean('grant').notNull().default(true),
  reason: text('reason'),
  createdByAdminId: varchar('created_by_admin_id', { length: 36 }).notNull().references(() => users.id),
  expiresAt: timestamp('expires_at'),
  // Gate 1: nullable tenant scope (back-filled to the user's personal tenant).
  tenantId: varchar('tenant_id', { length: 36 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('idx_overrides_user').on(t.userId),
  index('idx_overrides_module').on(t.moduleId),
  index('idx_overrides_tenant').on(t.tenantId),
]);

export const ssoHandoffTokens = pgTable('sso_handoff_tokens', {
  jti: varchar('jti', { length: 64 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  moduleSlug: text('module_slug').notNull(),
  aud: text('aud').notNull(),
  env: text('env').notNull(),
  issuedIp: text('issued_ip'),
  consumedIp: text('consumed_ip'),
  issuedUserAgent: text('issued_user_agent'),
  consumedByUserAgent: text('consumed_by_user_agent'),
  issuedAt: timestamp('issued_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  consumedAt: timestamp('consumed_at'),
  // Gate 2: tenant scope captured at issue-time; consume-time re-checks
  // hasModuleAccess(userId, tenantId, moduleSlug) against the SAME tenant.
  tenantId: varchar('tenant_id', { length: 36 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_sso_tokens_expires').on(t.expiresAt),
  index('idx_sso_tokens_user').on(t.userId),
  index('idx_sso_tokens_tenant').on(t.tenantId),
]);

export const revokedSessionTokens = pgTable('revoked_session_tokens', {
  tokenHash: varchar('token_hash', { length: 64 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  sessionType: text('session_type').notNull(),
  tenantId: varchar('tenant_id', { length: 36 }),
  moduleId: text('module_id'),
  expiresAt: timestamp('expires_at').notNull(),
  revokedAt: timestamp('revoked_at').defaultNow().notNull(),
  reason: text('reason').notNull().default('local_logout'),
}, (t) => [
  index('idx_revoked_sessions_user').on(t.userId),
  index('idx_revoked_sessions_expires').on(t.expiresAt),
]);

export type ModuleRow = typeof modules.$inferSelect;
export type PlanModuleRow = typeof planModules.$inferSelect;
export type AddonSubscriptionRow = typeof addonSubscriptions.$inferSelect;
export type EntitlementOverrideRow = typeof entitlementOverrides.$inferSelect;
export type SsoHandoffTokenRow = typeof ssoHandoffTokens.$inferSelect;
export type RevokedSessionTokenRow = typeof revokedSessionTokens.$inferSelect;

export const aiPromptTemplates = pgTable('ai_prompt_templates', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  name: text('name').notNull(),
  description: text('description'),
  toolType: text('tool_type').notNull(),
  promptText: text('prompt_text').notNull(),
  isShared: boolean('is_shared').notNull().default(false),
  usageCount: integer('usage_count').notNull().default(0),
  // Gate 2: nullable tenant scope; templates are private to a tenant.
  tenantId: varchar('tenant_id', { length: 36 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('idx_ai_templates_user').on(t.userId),
  index('idx_ai_templates_tool').on(t.toolType),
  index('idx_ai_templates_tenant').on(t.tenantId),
]);

export const aiActionsLog = pgTable('ai_actions_log', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  toolType: text('tool_type').notNull(),
  input: jsonb('input'),
  output: jsonb('output'),
  tokenCount: integer('token_count').notNull().default(0),
  durationMs: integer('duration_ms').notNull().default(0),
  status: text('status', { enum: ['success', 'error', 'rate_limited'] }).notNull().default('success'),
  // Gate 2: nullable tenant scope; AI history scoped per tenant.
  tenantId: varchar('tenant_id', { length: 36 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_ai_actions_user').on(t.userId),
  index('idx_ai_actions_created').on(t.createdAt),
  index('idx_ai_actions_tool').on(t.toolType),
  index('idx_ai_actions_tenant').on(t.tenantId),
]);

export type PublishRunRow = typeof publishRuns.$inferSelect;
export type WorkspaceProcessRow = typeof workspaceProcesses.$inferSelect;
export type WorkspaceServiceRow = typeof workspaceServices.$inferSelect;
export type AutomationRuleRow = typeof automationRules.$inferSelect;
export type SystemEventRow = typeof systemEvents.$inferSelect;
export type SystemNotificationRow = typeof systemNotifications.$inferSelect;
export type WorkspaceSnapshotRow = typeof workspaceSnapshots.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type SubscriptionPlanRow = typeof subscriptionPlans.$inferSelect;
export type SubscriptionRow = typeof subscriptions.$inferSelect;
export type SaasWorkspaceRow = typeof saasWorkspaces.$inferSelect;
export type SaasProjectRow = typeof saasProjects.$inferSelect;
export type SaasTaskRow = typeof saasTasks.$inferSelect;
export type NoteRow = typeof notes.$inferSelect;
export type ActivityFeedRow = typeof activityFeed.$inferSelect;
export type AiPromptTemplateRow = typeof aiPromptTemplates.$inferSelect;
export type AiActionsLogRow = typeof aiActionsLog.$inferSelect;

// ===========================================================================
// Gate 1 — Tenant foundation, RBAC & multi-tenant data model
// ===========================================================================
//
// A `tenant` is the unit of ownership for paid plans, modules, members, and
// (in later gates) data. Every user has at least one tenant — their auto-
// provisioned `personal` tenant — and may belong to additional `company`
// tenants. The user's "active" tenant is resolved per-request: path
// `:tenantId` > header `X-Tenant-Id` > `users.current_tenant_id`.

export const tenants = pgTable('tenants', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  // Globally unique. Personal tenants use `personal-<userId>`; company
  // tenants use a human-friendly slug.
  slug: text('slug').notNull().unique(),
  type: text('type', { enum: ['personal', 'company'] }).notNull().default('personal'),
  ownerUserId: varchar('owner_user_id', { length: 36 }).notNull().references(() => users.id),
  // Gate 2: lifecycle status. Suspend prevents login + module launch for
  // tenant members; archive is soft-delete (removes from default lists).
  status: text('status', { enum: ['active', 'suspended', 'archived'] }).notNull().default('active'),
  suspendedAt: timestamp('suspended_at'),
  archivedAt: timestamp('archived_at'),
  seatLimit: integer('seat_limit').notNull().default(0),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('idx_tenants_owner').on(t.ownerUserId),
  index('idx_tenants_type').on(t.type),
  index('idx_tenants_status').on(t.status),
]);

export const tenantEntitlements = pgTable('tenant_entitlements', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  entitlementKey: text('entitlement_key').notNull(),
  entitlementType: text('entitlement_type', {
    enum: ['core_product', 'included_app', 'companion_module', 'seat_pack', 'system'],
  }).notNull(),
  source: text('source', {
    enum: ['stripe', 'included_with_core', 'selected_free_companion', 'manual', 'admin'],
  }).notNull(),
  active: boolean('active').notNull().default(true),
  stripeSubscriptionId: text('stripe_subscription_id'),
  stripePriceId: text('stripe_price_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('idx_tenant_entitlements_tenant').on(t.tenantId),
  index('idx_tenant_entitlements_key').on(t.entitlementKey),
  index('idx_tenant_entitlements_subscription').on(t.stripeSubscriptionId),
]);

export const tenantUsers = pgTable('tenant_users', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  // Tenant-scoped role (distinct from `users.platform_role`).
  // owner > admin > member > viewer. Startup DDL canonicalizes older public
  // aliases before authorization reads them.
  role: text('role', {
    enum: ['owner', 'admin', 'member', 'viewer'],
  }).notNull().default('member'),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
}, (t) => [
  index('idx_tenant_users_tenant').on(t.tenantId),
  index('idx_tenant_users_user').on(t.userId),
]);

// `tenant_modules`: which modules are turned ON for a tenant (and how).
//   status:
//     enabled   — included by plan / always-on for this tenant
//     trial     — limited-time enabled
//     purchased — bought via add-on
//     beta      — opted into beta
//     disabled  — temporarily off (preserves grants)
//     archived  — permanently off (grants ignored)
//   source: provenance of the enablement.
//   allowAllMembers: if true, every tenant member is implicitly a 'user' on
//     this module (no per-user grant needed). Otherwise grants live in
//     `tenant_user_module_access`.
export const tenantModules = pgTable('tenant_modules', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  moduleId: varchar('module_id', { length: 36 }).notNull().references(() => modules.id),
  status: text('status', { enum: ['enabled', 'trial', 'purchased', 'beta', 'disabled', 'archived'] }).notNull().default('enabled'),
  source: text('source', { enum: ['included', 'addon', 'trial', 'admin'] }).notNull().default('included'),
  allowAllMembers: boolean('allow_all_members').notNull().default(false),
  // Task #108: per-tenant overrides for the module. Currently used for
  // `metadata.features` (a feature-flag map that overlays the plan-side
  // defaults from `plan_modules.feature_flags_json`).
  metadata: jsonb('metadata').$type<{ features?: Record<string, boolean | number | string> } & Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('idx_tenant_modules_tenant').on(t.tenantId),
  index('idx_tenant_modules_module').on(t.moduleId),
]);

// Per-user, per-module grant inside a tenant.
//   none    — explicit denial (overrides allowAllMembers)
//   viewer  — can read module data but cannot mutate it
//   user    — can use and mutate the module
//   manager — can use AND grant access to other tenant members
export const tenantUserModuleAccess = pgTable('tenant_user_module_access', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  moduleId: varchar('module_id', { length: 36 }).notNull().references(() => modules.id),
  accessLevel: text('access_level', {
    enum: ['none', 'user', 'manager', 'module_user', 'module_admin', 'viewer'],
  }).notNull().default('none'),
  grantedByUserId: varchar('granted_by_user_id', { length: 36 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('idx_tuma_tenant_user').on(t.tenantId, t.userId),
  index('idx_tuma_module').on(t.moduleId),
]);

export const tenantInvites = pgTable('tenant_invites', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  email: text('email').notNull(),
  role: text('role', {
    enum: ['owner', 'admin', 'member', 'viewer'],
  }).notNull().default('member'),
  token: text('token').notNull().unique(),
  invitedByUserId: varchar('invited_by_user_id', { length: 36 }).notNull().references(() => users.id),
  acceptedAt: timestamp('accepted_at'),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_tenant_invites_tenant').on(t.tenantId),
  index('idx_tenant_invites_email').on(t.email),
]);

export type TenantRow = typeof tenants.$inferSelect;
export type TenantUserRow = typeof tenantUsers.$inferSelect;
export type TenantEntitlementRow = typeof tenantEntitlements.$inferSelect;
export type TenantModuleRow = typeof tenantModules.$inferSelect;
export type TenantUserModuleAccessRow = typeof tenantUserModuleAccess.$inferSelect;
export type TenantInviteRow = typeof tenantInvites.$inferSelect;

// ===========================================================================
// Phase 2 — OperatorOS-owned shared Business Directory
// ===========================================================================

export const directoryOrganizations = pgTable('directory_organizations', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  name: text('name').notNull(),
  normalizedName: text('normalized_name').notNull(),
  type: text('type', {
    enum: ['customer', 'client', 'vendor', 'partner', 'facility', 'other'],
  }).notNull().default('client'),
  status: text('status', { enum: ['active', 'inactive'] }).notNull().default('active'),
  website: text('website'),
  notes: text('notes'),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).notNull().references(() => users.id),
  updatedByUserId: varchar('updated_by_user_id', { length: 36 }).notNull().references(() => users.id),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  archivedAt: timestamp('archived_at'),
}, (t) => [
  index('idx_directory_orgs_tenant_name').on(t.tenantId, t.normalizedName),
  index('idx_directory_orgs_tenant_type').on(t.tenantId, t.type),
  index('idx_directory_orgs_tenant_status').on(t.tenantId, t.status, t.archivedAt),
  uniqueIndex('uq_directory_orgs_tenant_active_name').on(t.tenantId, t.normalizedName)
    .where(sql`${t.archivedAt} IS NULL`),
]);

export const directoryContacts = pgTable('directory_contacts', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull().default(''),
  normalizedName: text('normalized_name').notNull(),
  email: text('email'),
  normalizedEmail: text('normalized_email'),
  phone: text('phone'),
  title: text('title'),
  status: text('status', { enum: ['active', 'inactive'] }).notNull().default('active'),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).notNull().references(() => users.id),
  updatedByUserId: varchar('updated_by_user_id', { length: 36 }).notNull().references(() => users.id),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  archivedAt: timestamp('archived_at'),
}, (t) => [
  index('idx_directory_contacts_tenant_name').on(t.tenantId, t.normalizedName),
  index('idx_directory_contacts_tenant_status').on(t.tenantId, t.status, t.archivedAt),
  uniqueIndex('uq_directory_contacts_tenant_active_email').on(t.tenantId, t.normalizedEmail)
    .where(sql`${t.normalizedEmail} IS NOT NULL AND ${t.archivedAt} IS NULL`),
]);

export const directoryAddresses = pgTable('directory_addresses', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  label: text('label'),
  line1: text('line1').notNull(),
  line2: text('line2'),
  city: text('city').notNull(),
  region: text('region').notNull(),
  postalCode: text('postal_code').notNull(),
  countryCode: varchar('country_code', { length: 2 }).notNull().default('US'),
  normalizedKey: text('normalized_key').notNull(),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).notNull().references(() => users.id),
  updatedByUserId: varchar('updated_by_user_id', { length: 36 }).notNull().references(() => users.id),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  archivedAt: timestamp('archived_at'),
}, (t) => [
  index('idx_directory_addresses_tenant_postal').on(t.tenantId, t.postalCode),
  uniqueIndex('uq_directory_addresses_tenant_active_key').on(t.tenantId, t.normalizedKey)
    .where(sql`${t.archivedAt} IS NULL`),
]);

export const directorySites = pgTable('directory_sites', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  organizationId: varchar('organization_id', { length: 36 }).notNull().references(() => directoryOrganizations.id),
  addressId: varchar('address_id', { length: 36 }).references(() => directoryAddresses.id),
  name: text('name').notNull(),
  normalizedName: text('normalized_name').notNull(),
  type: text('type', { enum: ['headquarters', 'office', 'facility', 'service', 'remote', 'other'] }).notNull().default('office'),
  status: text('status', { enum: ['active', 'inactive'] }).notNull().default('active'),
  timezone: text('timezone'),
  notes: text('notes'),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).notNull().references(() => users.id),
  updatedByUserId: varchar('updated_by_user_id', { length: 36 }).notNull().references(() => users.id),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  archivedAt: timestamp('archived_at'),
}, (t) => [
  index('idx_directory_sites_tenant_org').on(t.tenantId, t.organizationId),
  index('idx_directory_sites_tenant_status').on(t.tenantId, t.status, t.archivedAt),
  uniqueIndex('uq_directory_sites_tenant_org_active_name').on(t.tenantId, t.organizationId, t.normalizedName)
    .where(sql`${t.archivedAt} IS NULL`),
]);

export const directoryOrganizationContacts = pgTable('directory_organization_contacts', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  organizationId: varchar('organization_id', { length: 36 }).notNull().references(() => directoryOrganizations.id),
  contactId: varchar('contact_id', { length: 36 }).notNull().references(() => directoryContacts.id),
  role: text('role'),
  isPrimary: boolean('is_primary').notNull().default(false),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('uq_directory_org_contacts').on(t.tenantId, t.organizationId, t.contactId),
  index('idx_directory_org_contacts_contact').on(t.tenantId, t.contactId),
]);

export const directorySiteContacts = pgTable('directory_site_contacts', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  siteId: varchar('site_id', { length: 36 }).notNull().references(() => directorySites.id),
  contactId: varchar('contact_id', { length: 36 }).notNull().references(() => directoryContacts.id),
  role: text('role'),
  isPrimary: boolean('is_primary').notNull().default(false),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('uq_directory_site_contacts').on(t.tenantId, t.siteId, t.contactId),
  index('idx_directory_site_contacts_contact').on(t.tenantId, t.contactId),
]);

export const directoryRelationships = pgTable('directory_relationships', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  fromOrganizationId: varchar('from_organization_id', { length: 36 }).notNull().references(() => directoryOrganizations.id),
  toOrganizationId: varchar('to_organization_id', { length: 36 }).notNull().references(() => directoryOrganizations.id),
  type: text('type').notNull(),
  notes: text('notes'),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).notNull().references(() => users.id),
  updatedByUserId: varchar('updated_by_user_id', { length: 36 }).notNull().references(() => users.id),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  archivedAt: timestamp('archived_at'),
}, (t) => [
  index('idx_directory_relationships_from').on(t.tenantId, t.fromOrganizationId),
  index('idx_directory_relationships_to').on(t.tenantId, t.toOrganizationId),
  uniqueIndex('uq_directory_relationships_active').on(t.tenantId, t.fromOrganizationId, t.toOrganizationId, t.type)
    .where(sql`${t.archivedAt} IS NULL`),
]);

export const directoryTags = pgTable('directory_tags', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  name: text('name').notNull(),
  normalizedName: text('normalized_name').notNull(),
  color: text('color'),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  archivedAt: timestamp('archived_at'),
}, (t) => [
  uniqueIndex('uq_directory_tags_tenant_active_name').on(t.tenantId, t.normalizedName)
    .where(sql`${t.archivedAt} IS NULL`),
]);

export const directoryTagAssignments = pgTable('directory_tag_assignments', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  tagId: varchar('tag_id', { length: 36 }).notNull().references(() => directoryTags.id),
  entityType: text('entity_type', { enum: ['organization', 'contact', 'site'] }).notNull(),
  organizationId: varchar('organization_id', { length: 36 }).references(() => directoryOrganizations.id),
  contactId: varchar('contact_id', { length: 36 }).references(() => directoryContacts.id),
  siteId: varchar('site_id', { length: 36 }).references(() => directorySites.id),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_directory_tag_assignments_entity').on(t.tenantId, t.entityType),
  uniqueIndex('uq_directory_tag_assignments_org').on(t.tenantId, t.tagId, t.organizationId),
  uniqueIndex('uq_directory_tag_assignments_contact').on(t.tenantId, t.tagId, t.contactId),
  uniqueIndex('uq_directory_tag_assignments_site').on(t.tenantId, t.tagId, t.siteId),
]);

export const tradeflowkitCustomerProfiles = pgTable('tradeflowkit_customer_profiles', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  organizationId: varchar('organization_id', { length: 36 }).notNull().references(() => directoryOrganizations.id),
  customerStatus: text('customer_status').notNull().default('active'),
  paymentTermsDays: integer('payment_terms_days'),
  notes: text('notes'),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).notNull().references(() => users.id),
  updatedByUserId: varchar('updated_by_user_id', { length: 36 }).notNull().references(() => users.id),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [uniqueIndex('uq_tfk_customer_profiles_tenant_org').on(t.tenantId, t.organizationId)]);

export const techdeckManagedClientProfiles = pgTable('techdeck_managed_client_profiles', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  organizationId: varchar('organization_id', { length: 36 }).notNull().references(() => directoryOrganizations.id),
  serviceTier: text('service_tier'),
  accountCode: text('account_code'),
  notes: text('notes'),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).notNull().references(() => users.id),
  updatedByUserId: varchar('updated_by_user_id', { length: 36 }).notNull().references(() => users.id),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [uniqueIndex('uq_techdeck_client_profiles_tenant_org').on(t.tenantId, t.organizationId)]);

export const pulsedeskServiceClientProfiles = pgTable('pulsedesk_service_client_profiles', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  organizationId: varchar('organization_id', { length: 36 }).notNull().references(() => directoryOrganizations.id),
  facilityCategory: text('facility_category'),
  phiRestricted: boolean('phi_restricted').notNull().default(true),
  notes: text('notes'),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).notNull().references(() => users.id),
  updatedByUserId: varchar('updated_by_user_id', { length: 36 }).notNull().references(() => users.id),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [uniqueIndex('uq_pulsedesk_client_profiles_tenant_org').on(t.tenantId, t.organizationId)]);

export type DirectoryOrganizationRow = typeof directoryOrganizations.$inferSelect;
export type DirectoryContactRow = typeof directoryContacts.$inferSelect;
export type DirectoryAddressRow = typeof directoryAddresses.$inferSelect;
export type DirectorySiteRow = typeof directorySites.$inferSelect;

// ===========================================================================
// Task #72 — module shell persistence tables
//
// The four polished module first-screens (CallCommand AI, StudyForge AI,
// Ninjamation, Ninja Launch Kit) used to keep all user activity in
// component state. These tables persist that activity per-tenant so it
// survives a refresh and shows up in the activity feed where appropriate.
// All four tables are tenant-scoped and read/written exclusively through
// the `requireTenantMember` pre-handler, mirroring the saas-routes pattern.
// ===========================================================================

export const moduleCallLogs = pgTable('module_call_logs', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  phone: text('phone').notNull(),
  callerName: text('caller_name').notNull(),
  persona: text('persona').notNull(),
  status: text('status', { enum: ['queued', 'ringing', 'completed', 'failed'] }).notNull().default('queued'),
  summary: text('summary'),
  // Telephony-provider linkage (Task #75). `provider` is `twilio` or `stub`
  // depending on whether real telephony is configured; `providerSid` is the
  // Twilio Call SID we use to correlate status/recording webhooks.
  provider: text('provider'),
  providerSid: text('provider_sid'),
  transcript: text('transcript'),
  // Task #94 — explicit lifecycle for transcript fetch so the shell can
  // tell "still waiting" apart from "Twilio gave up". `pending` is the
  // default the moment a Twilio call kicks off; `ready` is set when a
  // transcript is stored; `unavailable` is the fallback branch in
  // `finalizeTranscript`. Stub provider rows stay at the default and
  // are ignored by the badge UI.
  transcriptStatus: text('transcript_status', { enum: ['pending', 'ready', 'unavailable'] }).notNull().default('pending'),
  recordingUrl: text('recording_url'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('idx_module_call_logs_tenant_created').on(t.tenantId, t.createdAt),
  index('idx_module_call_logs_provider_sid').on(t.providerSid),
]);

export const moduleStudySessions = pgTable('module_study_sessions', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  source: text('source').notNull(),
  cards: jsonb('cards').$type<Array<{ id: string; question: string; answer: string }>>().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_module_study_sessions_user_created').on(t.userId, t.createdAt),
  index('idx_module_study_sessions_tenant').on(t.tenantId),
]);

export const moduleAutomations = pgTable('module_automations', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  templateId: text('template_id').notNull(),
  name: text('name').notNull(),
  trigger: text('trigger').notNull(),
  action: text('action').notNull(),
  modules: jsonb('modules').$type<string[]>().notNull(),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_module_automations_tenant').on(t.tenantId),
]);

export const moduleScaffolds = pgTable('module_scaffolds', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  slug: text('slug').notNull(),
  stackId: text('stack_id').notNull(),
  stackName: text('stack_name').notNull(),
  files: jsonb('files').$type<string[]>().notNull(),
  status: text('status', { enum: ['queued', 'ready', 'failed'] }).notNull().default('queued'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_module_scaffolds_tenant_created').on(t.tenantId, t.createdAt),
]);

/** Tenant-owned workflow records for remaining generic TorqueShed and
 * SnapProofOS slices. Dedicated product tables replace migrated module rows. */
export const moduleWorkflowItems = pgTable('module_workflow_items', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).notNull().references(() => users.id),
  moduleSlug: text('module_slug').notNull(),
  itemType: text('item_type').notNull(),
  title: text('title').notNull(),
  status: text('status').notNull(),
  summary: text('summary'),
  data: jsonb('data').$type<Record<string, string | number | boolean | null>>().notNull().default({}),
  version: integer('version').notNull().default(1),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('idx_module_workflow_tenant_module_created').on(t.tenantId, t.moduleSlug, t.createdAt),
  index('idx_module_workflow_tenant_status').on(t.tenantId, t.moduleSlug, t.status),
]);

/**
 * First shared-runtime TechDeck workflow.
 *
 * The imported standalone app carries a much broader MSP data model. This
 * table deliberately owns only technician queue state and references the
 * central OperatorOS tenant/user records for authority and assignment.
 */
export const techdeckTicketSequences = pgTable('techdeck_ticket_sequences', {
  tenantId: varchar('tenant_id', { length: 36 }).primaryKey().references(() => tenants.id),
  lastNumber: integer('last_number').notNull().default(0),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const techdeckTickets = pgTable('techdeck_tickets', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  number: integer('number').notNull(),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).notNull().references(() => users.id),
  assignedToUserId: varchar('assigned_to_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  directoryOrganizationId: varchar('directory_organization_id', { length: 36 }).references(() => directoryOrganizations.id, { onDelete: 'set null' }),
  directorySiteId: varchar('directory_site_id', { length: 36 }).references(() => directorySites.id, { onDelete: 'set null' }),
  configurationItemId: varchar('configuration_item_id', { length: 36 }),
  title: text('title').notNull(),
  description: text('description'),
  priority: text('priority', { enum: ['critical', 'high', 'medium', 'low'] }).notNull().default('medium'),
  status: text('status', { enum: ['open', 'in_progress', 'waiting_on_client', 'resolved', 'closed'] }).notNull().default('open'),
  responseDeadline: timestamp('response_deadline'),
  resolutionDeadline: timestamp('resolution_deadline'),
  respondedAt: timestamp('responded_at'),
  resolvedAt: timestamp('resolved_at'),
  closedAt: timestamp('closed_at'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => [
  index('idx_techdeck_tickets_tenant_created').on(t.tenantId, t.createdAt),
  index('idx_techdeck_tickets_tenant_status').on(t.tenantId, t.status),
  index('idx_techdeck_tickets_tenant_priority').on(t.tenantId, t.priority),
  index('idx_techdeck_tickets_assigned').on(t.tenantId, t.assignedToUserId),
  index('idx_techdeck_tickets_directory').on(t.tenantId, t.directoryOrganizationId, t.directorySiteId),
  index('idx_techdeck_tickets_deadline').on(t.tenantId, t.resolutionDeadline),
  uniqueIndex('idx_techdeck_tickets_number').on(t.tenantId, t.number),
]);

export const techdeckAssets = pgTable('techdeck_assets', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  directoryOrganizationId: varchar('directory_organization_id', { length: 36 }).references(() => directoryOrganizations.id, { onDelete: 'set null' }),
  directorySiteId: varchar('directory_site_id', { length: 36 }).references(() => directorySites.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  type: text('type').notNull().default('endpoint'),
  status: text('status').notNull().default('active'),
  hostname: text('hostname'),
  ipAddress: text('ip_address'),
  operatingSystem: text('operating_system'),
  vendor: text('vendor'),
  product: text('product'),
  model: text('model'),
  serialNumber: text('serial_number'),
  macAddress: text('mac_address'),
  externalVaultReference: text('external_vault_reference'),
  vlanNumber: integer('vlan_number'),
  cidr: text('cidr'),
  gateway: text('gateway'),
  dhcpStart: text('dhcp_start'),
  dhcpEnd: text('dhcp_end'),
  dnsServers: jsonb('dns_servers').$type<string[]>().notNull().default([]),
  health: text('health').notNull().default('unknown'),
  lastSeenAt: timestamp('last_seen_at'),
  expirationDate: timestamp('expiration_date'),
  renewalDate: timestamp('renewal_date'),
  warrantyEndDate: timestamp('warranty_end_date'),
  details: jsonb('details').$type<Record<string, string | number | boolean | null>>().notNull().default({}),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  notes: text('notes'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => [
  index('idx_techdeck_assets_tenant_health').on(t.tenantId, t.health),
  index('idx_techdeck_assets_tenant_type').on(t.tenantId, t.type),
  index('idx_techdeck_assets_directory').on(t.tenantId, t.directoryOrganizationId, t.directorySiteId),
  index('idx_techdeck_assets_lifecycle').on(t.tenantId, t.expirationDate, t.renewalDate, t.warrantyEndDate),
  index('idx_techdeck_assets_tenant_created').on(t.tenantId, t.createdAt),
]);

export const techdeckRunbooks = pgTable('techdeck_runbooks', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  approvedByUserId: varchar('approved_by_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  platform: text('platform').notNull(),
  purpose: text('purpose').notNull(),
  scriptText: text('script_text').notNull(),
  riskLevel: text('risk_level').notNull().default('medium'),
  status: text('status').notNull().default('draft'),
  approvedAt: timestamp('approved_at'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => [
  index('idx_techdeck_runbooks_tenant_status').on(t.tenantId, t.status),
  index('idx_techdeck_runbooks_tenant_created').on(t.tenantId, t.createdAt),
]);

export const techdeckConfigurationRelationships = pgTable('techdeck_configuration_relationships', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  sourceAssetId: varchar('source_asset_id', { length: 36 }).notNull().references(() => techdeckAssets.id, { onDelete: 'cascade' }),
  targetAssetId: varchar('target_asset_id', { length: 36 }).notNull().references(() => techdeckAssets.id, { onDelete: 'cascade' }),
  relationshipType: text('relationship_type').notNull().default('depends_on'),
  notes: text('notes'),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => [
  index('idx_techdeck_relationships_tenant_source').on(t.tenantId, t.sourceAssetId),
  index('idx_techdeck_relationships_tenant_target').on(t.tenantId, t.targetAssetId),
  uniqueIndex('uq_techdeck_relationship_active').on(t.tenantId, t.sourceAssetId, t.targetAssetId, t.relationshipType),
]);

export const techdeckDocumentFolders = pgTable('techdeck_document_folders', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  directoryOrganizationId: varchar('directory_organization_id', { length: 36 }).references(() => directoryOrganizations.id, { onDelete: 'set null' }),
  parentId: varchar('parent_id', { length: 36 }),
  name: text('name').notNull(),
  version: integer('version').notNull().default(1),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  archivedAt: timestamp('archived_at'),
}, (t) => [
  index('idx_techdeck_folders_tenant_parent').on(t.tenantId, t.parentId),
  uniqueIndex('uq_techdeck_folder_name').on(t.tenantId, t.parentId, t.name),
]);

export const techdeckDocuments = pgTable('techdeck_documents', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  directoryOrganizationId: varchar('directory_organization_id', { length: 36 }).references(() => directoryOrganizations.id, { onDelete: 'set null' }),
  directorySiteId: varchar('directory_site_id', { length: 36 }).references(() => directorySites.id, { onDelete: 'set null' }),
  folderId: varchar('folder_id', { length: 36 }).references(() => techdeckDocumentFolders.id, { onDelete: 'set null' }),
  pageType: text('page_type').notNull().default('documentation'),
  title: text('title').notNull(),
  slug: text('slug').notNull(),
  summary: text('summary'),
  content: text('content').notNull().default(''),
  status: text('status').notNull().default('draft'),
  minimumRole: text('minimum_role').notNull().default('member'),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  version: integer('version').notNull().default(1),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  updatedByUserId: varchar('updated_by_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  reviewedByUserId: varchar('reviewed_by_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  approvedByUserId: varchar('approved_by_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  publishedByUserId: varchar('published_by_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at'),
  approvedAt: timestamp('approved_at'),
  publishedAt: timestamp('published_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  archivedAt: timestamp('archived_at'),
}, (t) => [
  index('idx_techdeck_documents_tenant_status').on(t.tenantId, t.status),
  index('idx_techdeck_documents_directory').on(t.tenantId, t.directoryOrganizationId, t.directorySiteId),
  uniqueIndex('uq_techdeck_document_slug').on(t.tenantId, t.slug),
]);

export const techdeckDocumentRevisions = pgTable('techdeck_document_revisions', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  documentId: varchar('document_id', { length: 36 }).notNull().references(() => techdeckDocuments.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  title: text('title').notNull(),
  summary: text('summary'),
  content: text('content').notNull(),
  status: text('status').notNull(),
  minimumRole: text('minimum_role').notNull(),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  changeNote: text('change_note'),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_techdeck_revisions_document').on(t.tenantId, t.documentId, t.version),
  uniqueIndex('uq_techdeck_revision_version').on(t.documentId, t.version),
]);

export const techdeckDocumentLinks = pgTable('techdeck_document_links', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  sourceDocumentId: varchar('source_document_id', { length: 36 }).notNull().references(() => techdeckDocuments.id, { onDelete: 'cascade' }),
  targetDocumentId: varchar('target_document_id', { length: 36 }).notNull().references(() => techdeckDocuments.id, { onDelete: 'cascade' }),
  label: text('label'),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_techdeck_document_links_target').on(t.tenantId, t.targetDocumentId),
  uniqueIndex('uq_techdeck_document_link').on(t.tenantId, t.sourceDocumentId, t.targetDocumentId),
]);

export const techdeckEvidence = pgTable('techdeck_evidence', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  directoryOrganizationId: varchar('directory_organization_id', { length: 36 }).references(() => directoryOrganizations.id, { onDelete: 'set null' }),
  directorySiteId: varchar('directory_site_id', { length: 36 }).references(() => directorySites.id, { onDelete: 'set null' }),
  configurationItemId: varchar('configuration_item_id', { length: 36 }).references(() => techdeckAssets.id, { onDelete: 'set null' }),
  documentId: varchar('document_id', { length: 36 }).references(() => techdeckDocuments.id, { onDelete: 'set null' }),
  ticketId: varchar('ticket_id', { length: 36 }).references(() => techdeckTickets.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  evidenceType: text('evidence_type').notNull().default('observation'),
  summary: text('summary'),
  sourceReference: text('source_reference'),
  observedAt: timestamp('observed_at'),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  version: integer('version').notNull().default(1),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  archivedAt: timestamp('archived_at'),
}, (t) => [
  index('idx_techdeck_evidence_tenant_created').on(t.tenantId, t.createdAt),
  index('idx_techdeck_evidence_configuration').on(t.tenantId, t.configurationItemId),
]);

export const techdeckReports = pgTable('techdeck_reports', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  name: text('name').notNull(),
  reportType: text('report_type').notNull(),
  filters: jsonb('filters').$type<Record<string, string | number | boolean | null>>().notNull().default({}),
  snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull().default({}),
  sha256: varchar('sha256', { length: 64 }).notNull(),
  version: integer('version').notNull().default(1),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  archivedAt: timestamp('archived_at'),
}, (t) => [index('idx_techdeck_reports_tenant_created').on(t.tenantId, t.createdAt)]);

export const techdeckTimeEntries = pgTable('techdeck_time_entries', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  ticketId: varchar('ticket_id', { length: 36 }).references(() => techdeckTickets.id, { onDelete: 'set null' }),
  directoryOrganizationId: varchar('directory_organization_id', { length: 36 }).references(() => directoryOrganizations.id, { onDelete: 'set null' }),
  directorySiteId: varchar('directory_site_id', { length: 36 }).references(() => directorySites.id, { onDelete: 'set null' }),
  configurationItemId: varchar('configuration_item_id', { length: 36 }).references(() => techdeckAssets.id, { onDelete: 'set null' }),
  workedAt: timestamp('worked_at').notNull(),
  minutes: integer('minutes').notNull(),
  billable: boolean('billable').notNull().default(false),
  notes: text('notes'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => [index('idx_techdeck_time_tenant_worked').on(t.tenantId, t.workedAt)]);

export const techdeckTicketComments = pgTable('techdeck_ticket_comments', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  ticketId: varchar('ticket_id', { length: 36 }).notNull().references(() => techdeckTickets.id, { onDelete: 'cascade' }),
  authorUserId: varchar('author_user_id', { length: 36 }).notNull().references(() => users.id),
  body: text('body').notNull(),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => [index('idx_techdeck_comments_ticket').on(t.tenantId, t.ticketId, t.createdAt)]);

export const techdeckMigrationRefs = pgTable('techdeck_migration_refs', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  sourceType: varchar('source_type', { length: 80 }).notNull(),
  sourceId: varchar('source_id', { length: 160 }).notNull(),
  targetType: varchar('target_type', { length: 80 }).notNull(),
  targetId: varchar('target_id', { length: 36 }).notNull(),
  sourceHash: varchar('source_hash', { length: 64 }).notNull(),
  importedAt: timestamp('imported_at').defaultNow().notNull(),
}, (t) => [uniqueIndex('uq_techdeck_migration_source').on(t.tenantId, t.sourceType, t.sourceId)]);

/**
 * First shared-runtime PulseDesk workflow.
 *
 * This deliberately stores only PHI-minimized operational intake, department
 * routing, assignment, status, SLA, and structured history. OperatorOS owns
 * identity, tenant membership, module entitlement, and billing authority.
 */
export const pulsedeskDepartments = pgTable('pulsedesk_departments', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  directoryOrganizationId: varchar('directory_organization_id', { length: 36 }).references(() => directoryOrganizations.id, { onDelete: 'set null' }),
  directorySiteId: varchar('directory_site_id', { length: 36 }).references(() => directorySites.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  description: text('description'),
  active: boolean('active').notNull().default(true),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).notNull().references(() => users.id),
  updatedByUserId: varchar('updated_by_user_id', { length: 36 }).references(() => users.id),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  archivedAt: timestamp('archived_at'),
}, (t) => [
  index('idx_pulsedesk_departments_tenant_active').on(t.tenantId, t.active),
  index('idx_pulsedesk_departments_tenant_site').on(t.tenantId, t.directorySiteId),
  uniqueIndex('idx_pulsedesk_departments_tenant_name_ci').on(
    t.tenantId,
    sql`lower(${t.name})`,
  ),
]);

export const pulsedeskRequestSequences = pgTable('pulsedesk_request_sequences', {
  tenantId: varchar('tenant_id', { length: 36 }).primaryKey().references(() => tenants.id),
  lastNumber: integer('last_number').notNull().default(0),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const pulsedeskRequests = pgTable('pulsedesk_requests', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  number: integer('number').notNull(),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).notNull().references(() => users.id),
  assignedToUserId: varchar('assigned_to_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  departmentId: varchar('department_id', { length: 36 }).references(() => pulsedeskDepartments.id, { onDelete: 'set null' }),
  directoryOrganizationId: varchar('directory_organization_id', { length: 36 }).references(() => directoryOrganizations.id, { onDelete: 'set null' }),
  directorySiteId: varchar('directory_site_id', { length: 36 }).references(() => directorySites.id, { onDelete: 'set null' }),
  requesterContactId: varchar('requester_contact_id', { length: 36 }).references(() => directoryContacts.id, { onDelete: 'set null' }),
  queueId: varchar('queue_id', { length: 36 }),
  teamId: varchar('team_id', { length: 36 }),
  assetId: varchar('asset_id', { length: 36 }),
  slaPolicyId: varchar('sla_policy_id', { length: 36 }),
  ticketTypeKey: varchar('ticket_type_key', { length: 80 }).notNull().default('service_request'),
  summary: text('summary').notNull(),
  description: text('description').notNull().default(''),
  locationLabel: text('location_label'),
  category: text('category', {
    enum: [
      'it_infrastructure',
      'medical_equipment',
      'supplies_inventory',
      'facilities_building',
      'housekeeping_environmental',
      'safety_compliance',
      'vendor_external',
      'administrative',
      'hr_staff',
      'other',
    ],
  }).notNull(),
  priority: text('priority', {
    enum: ['critical', 'high', 'normal', 'low'],
  }).notNull().default('normal'),
  status: text('status', {
    enum: [
      'new',
      'triage',
      'assigned',
      'waiting_department',
      'waiting_vendor',
      'in_progress',
      'escalated',
      'resolved',
      'closed',
    ],
  }).notNull().default('new'),
  isPatientImpacting: boolean('is_patient_impacting').notNull().default(false),
  dueAt: timestamp('due_at'),
  responseDueAt: timestamp('response_due_at'),
  resolutionDueAt: timestamp('resolution_due_at'),
  firstRespondedAt: timestamp('first_responded_at'),
  resolvedAt: timestamp('resolved_at'),
  closedAt: timestamp('closed_at'),
  reopenedAt: timestamp('reopened_at'),
  archivedAt: timestamp('archived_at'),
  updatedByUserId: varchar('updated_by_user_id', { length: 36 }).references(() => users.id),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('idx_pulsedesk_requests_tenant_created').on(t.tenantId, t.createdAt),
  index('idx_pulsedesk_requests_tenant_status').on(t.tenantId, t.status),
  index('idx_pulsedesk_requests_tenant_priority').on(t.tenantId, t.priority),
  index('idx_pulsedesk_requests_tenant_department').on(t.tenantId, t.departmentId),
  index('idx_pulsedesk_requests_tenant_assignee').on(t.tenantId, t.assignedToUserId),
  index('idx_pulsedesk_requests_tenant_due').on(t.tenantId, t.dueAt),
  index('idx_pulsedesk_requests_tenant_org_site').on(t.tenantId, t.directoryOrganizationId, t.directorySiteId),
  index('idx_pulsedesk_requests_tenant_queue').on(t.tenantId, t.queueId, t.status),
  index('idx_pulsedesk_requests_tenant_sla').on(t.tenantId, t.resolutionDueAt, t.status),
  uniqueIndex('idx_pulsedesk_requests_number').on(t.tenantId, t.number),
]);

export const pulsedeskRequestEvents = pgTable('pulsedesk_request_events', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  // Event history is immutable. Keep the default restrictive FK behavior so
  // an accidental direct request delete cannot silently erase its audit trail.
  requestId: varchar('request_id', { length: 36 }).notNull().references(
    () => pulsedeskRequests.id,
    { onDelete: 'restrict' },
  ),
  actorUserId: varchar('actor_user_id', { length: 36 }).notNull().references(() => users.id),
  eventType: text('event_type', {
    enum: [
      'created',
      'updated',
      'department_changed',
      'assignee_changed',
      'priority_changed',
      'status_changed',
      'escalated',
      'assignment_changed',
      'requester_reply_added',
      'internal_note_added',
      'time_logged',
      'sla_changed',
      'vendor_updated',
      'attachment_added',
      'reopened',
      'archived',
    ],
  }).notNull(),
  visibility: text('visibility', { enum: ['requester', 'internal'] }).notNull().default('requester'),
  fromStatus: text('from_status'),
  toStatus: text('to_status'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_pulsedesk_request_events_tenant_request_created').on(t.tenantId, t.requestId, t.createdAt),
]);

/**
 * PulseDesk healthcare-operations service desk extensions.
 *
 * Shared Directory rows remain the only organization/contact/site/vendor
 * authority. These tables contain only tenant-scoped workflow state and never
 * patient, clinical, identity, subscription, or credential authority.
 */
export const pulsedeskQueues = pgTable('pulsedesk_queues', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  name: text('name').notNull(),
  description: text('description'),
  active: boolean('active').notNull().default(true),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).notNull().references(() => users.id),
  updatedByUserId: varchar('updated_by_user_id', { length: 36 }).notNull().references(() => users.id),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  archivedAt: timestamp('archived_at'),
}, (t) => [
  uniqueIndex('uq_pulsedesk_queues_tenant_name').on(t.tenantId, t.name).where(sql`${t.archivedAt} IS NULL`),
  index('idx_pulsedesk_queues_tenant_active').on(t.tenantId, t.active, t.archivedAt),
]);

export const pulsedeskTeams = pgTable('pulsedesk_teams', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  queueId: varchar('queue_id', { length: 36 }).references(() => pulsedeskQueues.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  description: text('description'),
  active: boolean('active').notNull().default(true),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).notNull().references(() => users.id),
  updatedByUserId: varchar('updated_by_user_id', { length: 36 }).notNull().references(() => users.id),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  archivedAt: timestamp('archived_at'),
}, (t) => [
  uniqueIndex('uq_pulsedesk_teams_tenant_name').on(t.tenantId, t.name).where(sql`${t.archivedAt} IS NULL`),
  index('idx_pulsedesk_teams_tenant_queue').on(t.tenantId, t.queueId, t.active),
]);

export const pulsedeskTeamMembers = pgTable('pulsedesk_team_members', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  teamId: varchar('team_id', { length: 36 }).notNull().references(() => pulsedeskTeams.id, { onDelete: 'cascade' }),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  lead: boolean('lead').notNull().default(false),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('uq_pulsedesk_team_members').on(t.tenantId, t.teamId, t.userId),
  index('idx_pulsedesk_team_members_user').on(t.tenantId, t.userId),
]);

export const pulsedeskTicketOptions = pgTable('pulsedesk_ticket_options', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  kind: text('kind', { enum: ['status', 'priority', 'type', 'category'] }).notNull(),
  key: varchar('key', { length: 80 }).notNull(),
  name: text('name').notNull(),
  color: varchar('color', { length: 7 }),
  sortOrder: integer('sort_order').notNull().default(0),
  responseMinutes: integer('response_minutes'),
  resolutionMinutes: integer('resolution_minutes'),
  closedState: boolean('closed_state').notNull().default(false),
  active: boolean('active').notNull().default(true),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).notNull().references(() => users.id),
  updatedByUserId: varchar('updated_by_user_id', { length: 36 }).notNull().references(() => users.id),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  archivedAt: timestamp('archived_at'),
}, (t) => [
  uniqueIndex('uq_pulsedesk_ticket_options_tenant_kind_key').on(t.tenantId, t.kind, t.key).where(sql`${t.archivedAt} IS NULL`),
  index('idx_pulsedesk_ticket_options_tenant_kind').on(t.tenantId, t.kind, t.active, t.sortOrder),
]);

export const pulsedeskSlaPolicies = pgTable('pulsedesk_sla_policies', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  name: text('name').notNull(),
  description: text('description'),
  responseMinutes: integer('response_minutes').notNull().default(240),
  resolutionMinutes: integer('resolution_minutes').notNull().default(1440),
  atRiskPercent: integer('at_risk_percent').notNull().default(80),
  defaultPolicy: boolean('default_policy').notNull().default(false),
  active: boolean('active').notNull().default(true),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).notNull().references(() => users.id),
  updatedByUserId: varchar('updated_by_user_id', { length: 36 }).notNull().references(() => users.id),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  archivedAt: timestamp('archived_at'),
}, (t) => [
  uniqueIndex('uq_pulsedesk_sla_tenant_name').on(t.tenantId, t.name).where(sql`${t.archivedAt} IS NULL`),
  uniqueIndex('uq_pulsedesk_sla_tenant_default').on(t.tenantId).where(sql`${t.defaultPolicy} = TRUE AND ${t.archivedAt} IS NULL`),
  index('idx_pulsedesk_sla_tenant_active').on(t.tenantId, t.active),
]);

export const pulsedeskAssets = pgTable('pulsedesk_assets', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  directoryOrganizationId: varchar('directory_organization_id', { length: 36 }).references(() => directoryOrganizations.id, { onDelete: 'set null' }),
  directorySiteId: varchar('directory_site_id', { length: 36 }).references(() => directorySites.id, { onDelete: 'set null' }),
  departmentId: varchar('department_id', { length: 36 }).references(() => pulsedeskDepartments.id, { onDelete: 'set null' }),
  assetTag: varchar('asset_tag', { length: 100 }).notNull(),
  name: text('name').notNull(),
  equipmentType: varchar('equipment_type', { length: 100 }).notNull().default('operational_equipment'),
  manufacturer: text('manufacturer'),
  model: text('model'),
  serialNumber: text('serial_number'),
  locationLabel: text('location_label'),
  status: text('status', { enum: ['active', 'maintenance', 'out_of_service', 'retired'] }).notNull().default('active'),
  maintenanceDueAt: timestamp('maintenance_due_at'),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).notNull().references(() => users.id),
  updatedByUserId: varchar('updated_by_user_id', { length: 36 }).notNull().references(() => users.id),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  archivedAt: timestamp('archived_at'),
}, (t) => [
  uniqueIndex('uq_pulsedesk_assets_tenant_tag').on(t.tenantId, t.assetTag).where(sql`${t.archivedAt} IS NULL`),
  index('idx_pulsedesk_assets_tenant_site').on(t.tenantId, t.directorySiteId, t.status),
  index('idx_pulsedesk_assets_tenant_department').on(t.tenantId, t.departmentId),
]);

export const pulsedeskTicketMessages = pgTable('pulsedesk_ticket_messages', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  ticketId: varchar('ticket_id', { length: 36 }).notNull().references(() => pulsedeskRequests.id, { onDelete: 'restrict' }),
  authorUserId: varchar('author_user_id', { length: 36 }).notNull().references(() => users.id),
  visibility: text('visibility', { enum: ['requester', 'internal'] }).notNull(),
  body: text('body').notNull(),
  idempotencyKey: varchar('idempotency_key', { length: 160 }).notNull(),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => [
  uniqueIndex('uq_pulsedesk_ticket_messages_idempotency').on(t.tenantId, t.ticketId, t.idempotencyKey),
  index('idx_pulsedesk_ticket_messages_ticket').on(t.tenantId, t.ticketId, t.createdAt),
]);

export const pulsedeskTicketAssignments = pgTable('pulsedesk_ticket_assignments', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  ticketId: varchar('ticket_id', { length: 36 }).notNull().references(() => pulsedeskRequests.id, { onDelete: 'restrict' }),
  assignedToUserId: varchar('assigned_to_user_id', { length: 36 }).references(() => users.id),
  queueId: varchar('queue_id', { length: 36 }).references(() => pulsedeskQueues.id, { onDelete: 'set null' }),
  teamId: varchar('team_id', { length: 36 }).references(() => pulsedeskTeams.id, { onDelete: 'set null' }),
  assignedByUserId: varchar('assigned_by_user_id', { length: 36 }).notNull().references(() => users.id),
  assignedAt: timestamp('assigned_at').defaultNow().notNull(),
  endedAt: timestamp('ended_at'),
}, (t) => [
  index('idx_pulsedesk_assignments_ticket').on(t.tenantId, t.ticketId, t.assignedAt),
  index('idx_pulsedesk_assignments_user').on(t.tenantId, t.assignedToUserId, t.endedAt),
]);

export const pulsedeskTimeEntries = pgTable('pulsedesk_time_entries', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  ticketId: varchar('ticket_id', { length: 36 }).notNull().references(() => pulsedeskRequests.id, { onDelete: 'restrict' }),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  minutes: integer('minutes').notNull(),
  workType: text('work_type', { enum: ['remote', 'onsite', 'vendor', 'administrative'] }).notNull().default('onsite'),
  description: text('description'),
  idempotencyKey: varchar('idempotency_key', { length: 160 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('uq_pulsedesk_time_idempotency').on(t.tenantId, t.ticketId, t.idempotencyKey),
  index('idx_pulsedesk_time_ticket').on(t.tenantId, t.ticketId, t.createdAt),
]);

export const pulsedeskSlaEvents = pgTable('pulsedesk_sla_events', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  ticketId: varchar('ticket_id', { length: 36 }).notNull().references(() => pulsedeskRequests.id, { onDelete: 'restrict' }),
  slaPolicyId: varchar('sla_policy_id', { length: 36 }).references(() => pulsedeskSlaPolicies.id, { onDelete: 'set null' }),
  eventType: text('event_type', { enum: ['applied', 'first_response', 'at_risk', 'overdue', 'resolved', 'reopened'] }).notNull(),
  targetAt: timestamp('target_at'),
  occurredAt: timestamp('occurred_at').defaultNow().notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
}, (t) => [index('idx_pulsedesk_sla_events_ticket').on(t.tenantId, t.ticketId, t.occurredAt)]);

export const pulsedeskVendorEngagements = pgTable('pulsedesk_vendor_engagements', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  ticketId: varchar('ticket_id', { length: 36 }).notNull().references(() => pulsedeskRequests.id, { onDelete: 'restrict' }),
  vendorOrganizationId: varchar('vendor_organization_id', { length: 36 }).notNull().references(() => directoryOrganizations.id, { onDelete: 'restrict' }),
  status: text('status', { enum: ['requested', 'acknowledged', 'scheduled', 'waiting', 'completed', 'cancelled'] }).notNull().default('requested'),
  referenceCode: varchar('reference_code', { length: 120 }),
  expectedAt: timestamp('expected_at'),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).notNull().references(() => users.id),
  updatedByUserId: varchar('updated_by_user_id', { length: 36 }).notNull().references(() => users.id),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('idx_pulsedesk_vendor_ticket').on(t.tenantId, t.ticketId),
  index('idx_pulsedesk_vendor_org').on(t.tenantId, t.vendorOrganizationId, t.status),
]);

export const pulsedeskSupplyRequests = pgTable('pulsedesk_supply_requests', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  ticketId: varchar('ticket_id', { length: 36 }).references(() => pulsedeskRequests.id, { onDelete: 'set null' }),
  departmentId: varchar('department_id', { length: 36 }).references(() => pulsedeskDepartments.id, { onDelete: 'set null' }),
  itemName: text('item_name').notNull(),
  quantity: integer('quantity').notNull().default(1),
  urgency: text('urgency', { enum: ['critical', 'high', 'normal', 'low'] }).notNull().default('normal'),
  status: text('status', { enum: ['requested', 'approved', 'ordered', 'received', 'cancelled'] }).notNull().default('requested'),
  requestedByUserId: varchar('requested_by_user_id', { length: 36 }).notNull().references(() => users.id),
  updatedByUserId: varchar('updated_by_user_id', { length: 36 }).notNull().references(() => users.id),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  archivedAt: timestamp('archived_at'),
}, (t) => [index('idx_pulsedesk_supply_tenant_status').on(t.tenantId, t.status, t.createdAt)]);

export const pulsedeskFacilityRequests = pgTable('pulsedesk_facility_requests', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  ticketId: varchar('ticket_id', { length: 36 }).references(() => pulsedeskRequests.id, { onDelete: 'set null' }),
  directorySiteId: varchar('directory_site_id', { length: 36 }).references(() => directorySites.id, { onDelete: 'set null' }),
  departmentId: varchar('department_id', { length: 36 }).references(() => pulsedeskDepartments.id, { onDelete: 'set null' }),
  requestType: varchar('request_type', { length: 80 }).notNull().default('maintenance'),
  title: text('title').notNull(),
  locationLabel: text('location_label'),
  priority: text('priority', { enum: ['critical', 'high', 'normal', 'low'] }).notNull().default('normal'),
  status: text('status', { enum: ['new', 'assigned', 'in_progress', 'resolved', 'closed', 'cancelled'] }).notNull().default('new'),
  requestedByUserId: varchar('requested_by_user_id', { length: 36 }).notNull().references(() => users.id),
  assignedToUserId: varchar('assigned_to_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  updatedByUserId: varchar('updated_by_user_id', { length: 36 }).notNull().references(() => users.id),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  archivedAt: timestamp('archived_at'),
}, (t) => [index('idx_pulsedesk_facility_tenant_status').on(t.tenantId, t.status, t.createdAt)]);

export const pulsedeskTags = pgTable('pulsedesk_tags', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  name: text('name').notNull(),
  color: varchar('color', { length: 7 }),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [uniqueIndex('uq_pulsedesk_tags_tenant_name').on(t.tenantId, t.name)]);

export const pulsedeskTicketTags = pgTable('pulsedesk_ticket_tags', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  ticketId: varchar('ticket_id', { length: 36 }).notNull().references(() => pulsedeskRequests.id, { onDelete: 'restrict' }),
  tagId: varchar('tag_id', { length: 36 }).notNull().references(() => pulsedeskTags.id, { onDelete: 'cascade' }),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [uniqueIndex('uq_pulsedesk_ticket_tags').on(t.tenantId, t.ticketId, t.tagId)]);

export const pulsedeskSavedViews = pgTable('pulsedesk_saved_views', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  name: text('name').notNull(),
  filters: jsonb('filters').$type<Record<string, string | boolean | number | null>>().notNull().default(sql`'{}'::jsonb`),
  sort: jsonb('sort').$type<{ field: string; direction: 'asc' | 'desc' }>().notNull().default(sql`'{"field":"updatedAt","direction":"desc"}'::jsonb`),
  shared: boolean('shared').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('uq_pulsedesk_saved_views_user_name').on(t.tenantId, t.userId, t.name),
  index('idx_pulsedesk_saved_views_tenant_shared').on(t.tenantId, t.shared),
]);

export const pulsedeskKnowledgeArticles = pgTable('pulsedesk_knowledge_articles', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  slug: varchar('slug', { length: 120 }).notNull(),
  title: text('title').notNull(),
  summary: text('summary'),
  body: text('body').notNull(),
  status: text('status', { enum: ['draft', 'published', 'archived'] }).notNull().default('draft'),
  visibility: text('visibility', { enum: ['requester', 'internal'] }).notNull().default('internal'),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).notNull().references(() => users.id),
  updatedByUserId: varchar('updated_by_user_id', { length: 36 }).notNull().references(() => users.id),
  version: integer('version').notNull().default(1),
  publishedAt: timestamp('published_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  archivedAt: timestamp('archived_at'),
}, (t) => [
  uniqueIndex('uq_pulsedesk_knowledge_tenant_slug').on(t.tenantId, t.slug).where(sql`${t.archivedAt} IS NULL`),
  index('idx_pulsedesk_knowledge_tenant_status').on(t.tenantId, t.status, t.visibility),
]);

export const pulsedeskNotificationPreferences = pgTable('pulsedesk_notification_preferences', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  inAppEnabled: boolean('in_app_enabled').notNull().default(true),
  emailEnabled: boolean('email_enabled').notNull().default(false),
  eventPreferences: jsonb('event_preferences').$type<Record<string, boolean>>().notNull().default(sql`'{}'::jsonb`),
  version: integer('version').notNull().default(1),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [uniqueIndex('uq_pulsedesk_notification_preferences_user').on(t.tenantId, t.userId)]);

export const pulsedeskMigrationRefs = pgTable('pulsedesk_migration_refs', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  sourceType: varchar('source_type', { length: 80 }).notNull(),
  sourceId: varchar('source_id', { length: 160 }).notNull(),
  targetType: varchar('target_type', { length: 80 }).notNull(),
  targetId: varchar('target_id', { length: 36 }).notNull(),
  sourceHash: varchar('source_hash', { length: 64 }).notNull(),
  importedAt: timestamp('imported_at').defaultNow().notNull(),
}, (t) => [uniqueIndex('uq_pulsedesk_migration_source').on(t.tenantId, t.sourceType, t.sourceId)]);

/**
 * First shared-runtime Ninja Pool Hall workflow.
 *
 * Physics and ball state remain local to the browser. This table stores only
 * bounded personal practice-rack summaries; it is not an authoritative
 * multiplayer or competitive leaderboard record.
 */
export const ninjaPoolPracticeSessions = pgTable('ninja_pool_practice_sessions', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  status: text('status', {
    enum: ['active', 'completed', 'abandoned'],
  }).notNull().default('active'),
  shots: integer('shots').notNull().default(0),
  objectBallsPocketed: integer('object_balls_pocketed').notNull().default(0),
  scratches: integer('scratches').notNull().default(0),
  version: integer('version').notNull().default(1),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('idx_ninja_pool_practice_tenant_user_started').on(t.tenantId, t.userId, t.startedAt.desc()),
  index('idx_ninja_pool_practice_tenant_status').on(t.tenantId, t.status),
  uniqueIndex('idx_ninja_pool_practice_one_active')
    .on(t.tenantId, t.userId)
    .where(sql`${t.status} = 'active'`),
]);

export type NinjaPoolStoredPreferences = {
  aimGuide: boolean;
  tableSpeed: number;
  sound: boolean;
  vibration: boolean;
  callShotOn8: boolean;
  threeFoulRule: boolean;
};

export type NinjaPoolStoredLogicalState = {
  balls: Array<{ id: number; pos: { x: number; y: number }; vel: { x: number; y: number }; inPocket: boolean }>;
  currentPlayer: 0 | 1;
  players: [{ name: string; group: 'solids' | 'stripes' | null }, { name: string; group: 'solids' | 'stripes' | null }];
  ballInHand: boolean;
  ballInHandBehindHeadString?: boolean;
  groupsAssigned: boolean;
  gameOver: { winner: 0 | 1 | null; reason: string } | null;
  shotCount: number;
  consecutiveFouls?: [number, number];
  pendingChoice?: { type: '8OnBreak' | 'FailedBreak'; chooser: 0 | 1 } | null;
};

/** OperatorOS-owned Ninja Pool identity/preferences; never a second login. */
export const ninjaPoolPlayerProfiles = pgTable('ninja_pool_player_profiles', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  displayName: varchar('display_name', { length: 40 }).notNull(),
  preferences: jsonb('preferences').$type<NinjaPoolStoredPreferences>().notNull(),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('uq_ninja_pool_profile_tenant_user').on(t.tenantId, t.userId),
  uniqueIndex('uq_ninja_pool_profile_tenant_id').on(t.tenantId, t.id),
]);

/**
 * Structured bot/hot-seat matches. Continuous physics is not stored; this
 * server-owned projection contains only the deterministic logical rule state.
 */
export const ninjaPoolMatchSessions = pgTable('ninja_pool_match_sessions', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  mode: text('mode', { enum: ['bot', 'local'] }).notNull(),
  status: text('status', { enum: ['active', 'completed', 'abandoned'] }).notNull().default('active'),
  opponentName: varchar('opponent_name', { length: 40 }).notNull(),
  rulesSettings: jsonb('rules_settings').$type<NinjaPoolStoredPreferences>().notNull(),
  logicalState: jsonb('logical_state').$type<NinjaPoolStoredLogicalState>().notNull(),
  winnerSeat: integer('winner_seat'),
  result: text('result', { enum: ['win', 'loss', 'draw', 'player_1', 'player_2'] }),
  finishReason: varchar('finish_reason', { length: 240 }),
  shotCount: integer('shot_count').notNull().default(0),
  clientStartId: varchar('client_start_id', { length: 160 }).notNull(),
  evidence: text('evidence').notNull().default('client_reported_server_rules'),
  rulesVersion: integer('rules_version').notNull().default(1),
  version: integer('version').notNull().default(1),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
  abandonedAt: timestamp('abandoned_at'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('uq_ninja_pool_match_tenant_id').on(t.tenantId, t.id),
  uniqueIndex('uq_ninja_pool_match_start').on(t.tenantId, t.userId, t.clientStartId),
  uniqueIndex('uq_ninja_pool_one_active_match')
    .on(t.tenantId, t.userId)
    .where(sql`${t.status} = 'active'`),
  index('idx_ninja_pool_matches_user_history').on(t.tenantId, t.userId, t.startedAt.desc()),
]);

/** Append-only idempotent shot/choice facts and derived rule outcomes. */
export const ninjaPoolMatchEvents = pgTable('ninja_pool_match_events', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  matchId: varchar('match_id', { length: 36 }).notNull(),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  sequenceNumber: integer('sequence_number').notNull(),
  clientActionId: varchar('client_action_id', { length: 160 }).notNull(),
  eventKind: text('event_kind', { enum: ['shot', 'choice'] }).notNull(),
  input: jsonb('input').$type<Record<string, unknown>>().notNull(),
  outcome: jsonb('outcome').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('uq_ninja_pool_event_sequence').on(t.tenantId, t.matchId, t.sequenceNumber),
  uniqueIndex('uq_ninja_pool_event_client').on(t.tenantId, t.matchId, t.clientActionId),
  index('idx_ninja_pool_events_match').on(t.tenantId, t.matchId, t.sequenceNumber),
]);

export type BrandForgeWorkspaceProfile = {
  industry?: string;
  businessType?: string;
  products?: string;
  idealCustomer?: string;
  geographicMarket?: string;
  competitors?: string;
  goals: string[];
  channels: string[];
};

/** BrandForgeOS module settings; never OperatorOS tenant or billing authority. */
export const brandforgeWorkspaceSettings = pgTable('brandforge_workspace_settings', {
  tenantId: varchar('tenant_id', { length: 36 }).primaryKey().references(() => tenants.id),
  updatedByUserId: varchar('updated_by_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  completed: boolean('completed').notNull().default(false),
  profile: jsonb('profile').$type<BrandForgeWorkspaceProfile>().notNull().default({ goals: [], channels: [] }),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const brandforgeBrands = pgTable('brandforge_brands', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 120 }).notNull(),
  description: text('description'),
  primaryColor: varchar('primary_color', { length: 7 }),
  secondaryColor: varchar('secondary_color', { length: 7 }),
  accentColor: varchar('accent_color', { length: 7 }),
  headingFont: varchar('heading_font', { length: 80 }),
  bodyFont: varchar('body_font', { length: 80 }),
  voiceTone: text('voice_tone'),
  guidelines: text('guidelines'),
  version: integer('version').notNull().default(1),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('uq_brandforge_brand_tenant_id').on(t.tenantId, t.id),
  uniqueIndex('uq_brandforge_brand_name_active').on(t.tenantId, t.name)
    .where(sql`${t.deletedAt} IS NULL`),
  index('idx_brandforge_brands_tenant_updated').on(t.tenantId, t.updatedAt),
]);

export const brandforgePersonas = pgTable('brandforge_personas', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 120 }).notNull(),
  ageRange: varchar('age_range', { length: 80 }),
  location: varchar('location', { length: 160 }),
  interests: text('interests'),
  painPoints: text('pain_points'),
  goals: text('goals'),
  channels: jsonb('channels').$type<string[]>().notNull().default([]),
  description: text('description'),
  version: integer('version').notNull().default(1),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('uq_brandforge_persona_tenant_id').on(t.tenantId, t.id),
  uniqueIndex('uq_brandforge_persona_name_active').on(t.tenantId, t.name)
    .where(sql`${t.deletedAt} IS NULL`),
  index('idx_brandforge_personas_tenant_updated').on(t.tenantId, t.updatedAt),
]);

export const brandforgeCampaigns = pgTable('brandforge_campaigns', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  brandId: varchar('brand_id', { length: 36 }),
  personaId: varchar('persona_id', { length: 36 }),
  name: varchar('name', { length: 160 }).notNull(),
  objective: text('objective'),
  targetAudience: text('target_audience'),
  coreMessage: text('core_message'),
  offer: text('offer'),
  status: text('status', {
    enum: ['draft', 'planning', 'producing', 'review', 'scheduled', 'active', 'completed', 'archived'],
  }).notNull().default('draft'),
  channels: jsonb('channels').$type<string[]>().notNull().default([]),
  startAt: timestamp('start_at'),
  endAt: timestamp('end_at'),
  budgetCents: integer('budget_cents'),
  notes: text('notes'),
  version: integer('version').notNull().default(1),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('uq_brandforge_campaign_tenant_id').on(t.tenantId, t.id),
  index('idx_brandforge_campaigns_tenant_status').on(t.tenantId, t.status, t.updatedAt),
  index('idx_brandforge_campaigns_tenant_brand').on(t.tenantId, t.brandId),
  index('idx_brandforge_campaigns_tenant_persona').on(t.tenantId, t.personaId),
]);

export const brandforgeCopyAssets = pgTable('brandforge_copy_assets', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  brandId: varchar('brand_id', { length: 36 }),
  campaignId: varchar('campaign_id', { length: 36 }),
  title: varchar('title', { length: 200 }).notNull(),
  content: text('content').notNull(),
  copyType: varchar('copy_type', { length: 60 }).notNull(),
  channel: varchar('channel', { length: 60 }),
  tone: varchar('tone', { length: 120 }),
  status: text('status', {
    enum: ['draft', 'review', 'approved', 'published', 'archived'],
  }).notNull().default('draft'),
  generationId: varchar('generation_id', { length: 36 }),
  version: integer('version').notNull().default(1),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('uq_brandforge_copy_tenant_id').on(t.tenantId, t.id),
  index('idx_brandforge_copy_tenant_status').on(t.tenantId, t.status, t.updatedAt),
  index('idx_brandforge_copy_tenant_campaign').on(t.tenantId, t.campaignId),
]);

export const brandforgeCalendarItems = pgTable('brandforge_calendar_items', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  brandId: varchar('brand_id', { length: 36 }),
  campaignId: varchar('campaign_id', { length: 36 }),
  copyAssetId: varchar('copy_asset_id', { length: 36 }),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description'),
  itemType: varchar('item_type', { length: 60 }).notNull(),
  channel: varchar('channel', { length: 60 }),
  scheduledAt: timestamp('scheduled_at').notNull(),
  status: text('status', {
    enum: ['idea', 'draft', 'review', 'scheduled', 'published', 'cancelled'],
  }).notNull().default('idea'),
  version: integer('version').notNull().default(1),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('uq_brandforge_calendar_tenant_id').on(t.tenantId, t.id),
  index('idx_brandforge_calendar_tenant_date').on(t.tenantId, t.scheduledAt),
  index('idx_brandforge_calendar_tenant_status').on(t.tenantId, t.status),
]);

export const brandforgeCampaignMetrics = pgTable('brandforge_campaign_metrics', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  campaignId: varchar('campaign_id', { length: 36 }).notNull(),
  recordedByUserId: varchar('recorded_by_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  metricDate: timestamp('metric_date').notNull(),
  channel: varchar('channel', { length: 60 }),
  impressions: integer('impressions').notNull().default(0),
  clicks: integer('clicks').notNull().default(0),
  conversions: integer('conversions').notNull().default(0),
  spendCents: integer('spend_cents').notNull().default(0),
  revenueCents: integer('revenue_cents').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_brandforge_metrics_tenant_campaign_date').on(t.tenantId, t.campaignId, t.metricDate),
  index('idx_brandforge_metrics_tenant_date').on(t.tenantId, t.metricDate),
]);

/** Immutable provider result and idempotency record; provider secrets are never stored. */
export const brandforgeGenerations = pgTable('brandforge_generations', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  userId: varchar('user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  brandId: varchar('brand_id', { length: 36 }),
  campaignId: varchar('campaign_id', { length: 36 }),
  generationType: text('generation_type', { enum: ['copy', 'strategy', 'campaign_ideas'] }).notNull(),
  idempotencyKey: varchar('idempotency_key', { length: 160 }).notNull(),
  inputHash: varchar('input_hash', { length: 64 }).notNull(),
  inputSummary: jsonb('input_summary').$type<Record<string, unknown>>().notNull(),
  output: jsonb('output').$type<Record<string, unknown>>().notNull(),
  provider: varchar('provider', { length: 40 }).notNull(),
  model: varchar('model', { length: 120 }).notNull(),
  providerVersion: varchar('provider_version', { length: 80 }).notNull(),
  tokenCount: integer('token_count').notNull().default(0),
  durationMs: integer('duration_ms').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('uq_brandforge_generation_idempotency').on(t.tenantId, t.userId, t.idempotencyKey),
  uniqueIndex('uq_brandforge_generation_tenant_id').on(t.tenantId, t.id),
  index('idx_brandforge_generation_tenant_created').on(t.tenantId, t.createdAt),
]);

/**
 * OperatorOS-owned TradeFlowKit lead pipeline. Identity, subscription, and
 * entitlement authority remain outside the module while conversion links a
 * lead to shared-directory/customer/job records inside one tenant.
 */
export const tradeflowkitLeads = pgTable('tradeflowkit_leads', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).notNull().references(() => users.id),
  source: text('source').notNull().default('manual'),
  status: text('status', {
    enum: ['new', 'contacted', 'qualified', 'follow_up', 'converted', 'lost'],
  }).notNull().default('new'),
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email'),
  serviceType: text('service_type'),
  description: text('description'),
  address: text('address'),
  urgency: text('urgency', {
    enum: ['normal', 'urgent', 'emergency'],
  }).notNull().default('normal'),
  estimatedValueCents: integer('estimated_value_cents'),
  preferredContact: text('preferred_contact'),
  consentToSms: boolean('consent_to_sms').notNull().default(false),
  assignedToUserId: varchar('assigned_to_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  directoryOrganizationId: varchar('directory_organization_id', { length: 36 }).references(() => directoryOrganizations.id, { onDelete: 'set null' }),
  customerId: varchar('customer_id', { length: 36 }),
  jobId: varchar('job_id', { length: 36 }),
  convertedAt: timestamp('converted_at'),
  lostReason: text('lost_reason'),
  nextFollowUpAt: timestamp('next_follow_up_at'),
  lastContactedAt: timestamp('last_contacted_at'),
  sourceId: text('source_id'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => [
  index('idx_tradeflowkit_leads_tenant_created').on(t.tenantId, t.createdAt),
  index('idx_tradeflowkit_leads_tenant_status').on(t.tenantId, t.status),
  index('idx_tradeflowkit_leads_tenant_followup').on(t.tenantId, t.nextFollowUpAt),
]);

export type TradeFlowKitLineItem = {
  description: string;
  quantity: number;
  unitPriceCents: number;
};

export const tradeflowkitCustomers = pgTable('tradeflowkit_customers', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  organizationId: varchar('organization_id', { length: 36 }).references(() => directoryOrganizations.id, { onDelete: 'restrict' }),
  primaryContactId: varchar('primary_contact_id', { length: 36 }).references(() => directoryContacts.id, { onDelete: 'set null' }),
  primarySiteId: varchar('primary_site_id', { length: 36 }).references(() => directorySites.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email'),
  address: text('address'),
  notes: text('notes'),
  portalTokenHash: varchar('portal_token_hash', { length: 64 }),
  sourceId: text('source_id'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => [
  index('idx_tfk_customers_tenant_created').on(t.tenantId, t.createdAt),
  index('idx_tfk_customers_tenant_org').on(t.tenantId, t.organizationId),
  uniqueIndex('uq_tfk_customers_tenant_source').on(t.tenantId, t.sourceId)
    .where(sql`${t.sourceId} IS NOT NULL`),
]);

export const tradeflowkitWorkflows = pgTable('tradeflowkit_workflows', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  name: text('name').notNull(),
  normalizedName: text('normalized_name').notNull(),
  description: text('description').notNull().default(''),
  entityType: text('entity_type', { enum: ['job', 'task'] }).notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).notNull().references(() => users.id),
  updatedByUserId: varchar('updated_by_user_id', { length: 36 }).notNull().references(() => users.id),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  archivedAt: timestamp('archived_at'),
}, (t) => [
  uniqueIndex('uq_tfk_workflows_active_name').on(t.tenantId, t.entityType, t.normalizedName)
    .where(sql`${t.archivedAt} IS NULL`),
  uniqueIndex('uq_tfk_workflows_default').on(t.tenantId, t.entityType)
    .where(sql`${t.isDefault} = true AND ${t.archivedAt} IS NULL`),
  index('idx_tfk_workflows_tenant_entity').on(t.tenantId, t.entityType, t.archivedAt),
]);

export const tradeflowkitWorkflowStages = pgTable('tradeflowkit_workflow_stages', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  workflowId: varchar('workflow_id', { length: 36 }).notNull().references(() => tradeflowkitWorkflows.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  normalizedName: text('normalized_name').notNull(),
  color: varchar('color', { length: 7 }).notNull().default('#2563eb'),
  position: integer('position').notNull().default(0),
  mappedStatus: text('mapped_status'),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).notNull().references(() => users.id),
  updatedByUserId: varchar('updated_by_user_id', { length: 36 }).notNull().references(() => users.id),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  archivedAt: timestamp('archived_at'),
}, (t) => [
  uniqueIndex('uq_tfk_workflow_stages_active_name').on(t.tenantId, t.workflowId, t.normalizedName)
    .where(sql`${t.archivedAt} IS NULL`),
  uniqueIndex('uq_tfk_workflow_stages_active_position').on(t.tenantId, t.workflowId, t.position)
    .where(sql`${t.archivedAt} IS NULL`),
  index('idx_tfk_workflow_stages_tenant_workflow').on(t.tenantId, t.workflowId, t.position),
]);

export const tradeflowkitJobs = pgTable('tradeflowkit_jobs', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  customerId: varchar('customer_id', { length: 36 }).notNull().references(() => tradeflowkitCustomers.id),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  number: integer('number'),
  siteId: varchar('site_id', { length: 36 }).references(() => directorySites.id, { onDelete: 'set null' }),
  assignedToUserId: varchar('assigned_to_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  workflowStageId: varchar('workflow_stage_id', { length: 36 }).references(() => tradeflowkitWorkflowStages.id),
  title: text('title').notNull(),
  description: text('description'),
  internalNotes: text('internal_notes'),
  status: text('status').notNull().default('lead'),
  priority: text('priority').notNull().default('normal'),
  scheduledStart: timestamp('scheduled_start'),
  scheduledEnd: timestamp('scheduled_end'),
  completedAt: timestamp('completed_at'),
  sourceId: text('source_id'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => [
  index('idx_tfk_jobs_tenant_status').on(t.tenantId, t.status),
  index('idx_tfk_jobs_tenant_customer').on(t.tenantId, t.customerId),
  index('idx_tfk_jobs_tenant_assignee').on(t.tenantId, t.assignedToUserId),
  index('idx_tfk_jobs_tenant_stage').on(t.tenantId, t.workflowStageId),
  uniqueIndex('uq_tfk_jobs_tenant_number').on(t.tenantId, t.number)
    .where(sql`${t.number} IS NOT NULL`),
  uniqueIndex('uq_tfk_jobs_tenant_source').on(t.tenantId, t.sourceId)
    .where(sql`${t.sourceId} IS NOT NULL`),
]);

export const tradeflowkitTasks = pgTable('tradeflowkit_tasks', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  jobId: varchar('job_id', { length: 36 }).notNull().references(() => tradeflowkitJobs.id, { onDelete: 'cascade' }),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).notNull().references(() => users.id),
  assignedToUserId: varchar('assigned_to_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('todo'),
  priority: text('priority').notNull().default('normal'),
  dueAt: timestamp('due_at'),
  sortOrder: integer('sort_order').notNull().default(0),
  workflowStageId: varchar('workflow_stage_id', { length: 36 }).references(() => tradeflowkitWorkflowStages.id),
  completedAt: timestamp('completed_at'),
  sourceId: text('source_id'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => [
  index('idx_tfk_tasks_tenant_job').on(t.tenantId, t.jobId, t.sortOrder),
  index('idx_tfk_tasks_tenant_assignee').on(t.tenantId, t.assignedToUserId, t.status),
  index('idx_tfk_tasks_tenant_due').on(t.tenantId, t.dueAt),
  index('idx_tfk_tasks_tenant_stage').on(t.tenantId, t.workflowStageId, t.status),
  uniqueIndex('uq_tfk_tasks_tenant_source').on(t.tenantId, t.sourceId)
    .where(sql`${t.sourceId} IS NOT NULL`),
]);

export const tradeflowkitTaskDependencies = pgTable('tradeflowkit_task_dependencies', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  taskId: varchar('task_id', { length: 36 }).notNull().references(() => tradeflowkitTasks.id, { onDelete: 'cascade' }),
  dependsOnTaskId: varchar('depends_on_task_id', { length: 36 }).notNull().references(() => tradeflowkitTasks.id, { onDelete: 'cascade' }),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('uq_tfk_task_dependency').on(t.tenantId, t.taskId, t.dependsOnTaskId),
  index('idx_tfk_task_dependency_parent').on(t.tenantId, t.dependsOnTaskId),
]);

export const tradeflowkitQuotes = pgTable('tradeflowkit_quotes', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  customerId: varchar('customer_id', { length: 36 }).notNull().references(() => tradeflowkitCustomers.id),
  jobId: varchar('job_id', { length: 36 }).references(() => tradeflowkitJobs.id),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  number: integer('number'),
  status: text('status').notNull().default('draft'),
  lineItems: jsonb('line_items').$type<TradeFlowKitLineItem[]>().notNull(),
  subtotalCents: integer('subtotal_cents').notNull(),
  taxRateBps: integer('tax_rate_bps').notNull().default(0),
  taxCents: integer('tax_cents').notNull().default(0),
  discountCents: integer('discount_cents').notNull().default(0),
  totalCents: integer('total_cents').notNull(),
  notes: text('notes'),
  expiresAt: timestamp('expires_at'),
  sentAt: timestamp('sent_at'),
  acceptedAt: timestamp('accepted_at'),
  declinedAt: timestamp('declined_at'),
  expiredAt: timestamp('expired_at'),
  publicTokenHash: varchar('public_token_hash', { length: 64 }),
  sourceId: text('source_id'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => [
  index('idx_tfk_quotes_tenant_status').on(t.tenantId, t.status),
  index('idx_tfk_quotes_tenant_customer').on(t.tenantId, t.customerId),
  uniqueIndex('uq_tfk_quotes_tenant_number').on(t.tenantId, t.number)
    .where(sql`${t.number} IS NOT NULL`),
  uniqueIndex('uq_tfk_quotes_tenant_source').on(t.tenantId, t.sourceId)
    .where(sql`${t.sourceId} IS NOT NULL`),
]);

export const tradeflowkitQuoteItems = pgTable('tradeflowkit_quote_items', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  quoteId: varchar('quote_id', { length: 36 }).notNull().references(() => tradeflowkitQuotes.id, { onDelete: 'cascade' }),
  lineNumber: integer('line_number').notNull(),
  description: text('description').notNull(),
  quantityMilli: integer('quantity_milli').notNull(),
  unitPriceCents: integer('unit_price_cents').notNull(),
  lineTotalCents: integer('line_total_cents').notNull(),
  sourceId: text('source_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('uq_tfk_quote_item_line').on(t.tenantId, t.quoteId, t.lineNumber),
  index('idx_tfk_quote_items_quote').on(t.tenantId, t.quoteId),
]);

export const tradeflowkitInvoices = pgTable('tradeflowkit_invoices', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  customerId: varchar('customer_id', { length: 36 }).notNull().references(() => tradeflowkitCustomers.id),
  jobId: varchar('job_id', { length: 36 }).references(() => tradeflowkitJobs.id),
  sourceQuoteId: varchar('source_quote_id', { length: 36 }).references(() => tradeflowkitQuotes.id),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  number: integer('number'),
  status: text('status').notNull().default('draft'),
  lineItems: jsonb('line_items').$type<TradeFlowKitLineItem[]>().notNull(),
  subtotalCents: integer('subtotal_cents').notNull(),
  taxRateBps: integer('tax_rate_bps').notNull().default(0),
  taxCents: integer('tax_cents').notNull().default(0),
  discountCents: integer('discount_cents').notNull().default(0),
  totalCents: integer('total_cents').notNull(),
  paidCents: integer('paid_cents').notNull().default(0),
  balanceCents: integer('balance_cents').notNull().default(0),
  notes: text('notes'),
  dueDate: timestamp('due_date'),
  sentAt: timestamp('sent_at'),
  paidAt: timestamp('paid_at'),
  paymentMethod: text('payment_method'),
  paymentReference: text('payment_reference'),
  paymentNotes: text('payment_notes'),
  publicTokenHash: varchar('public_token_hash', { length: 64 }),
  sourceId: text('source_id'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => [
  index('idx_tfk_invoices_tenant_status').on(t.tenantId, t.status),
  index('idx_tfk_invoices_tenant_customer').on(t.tenantId, t.customerId),
  uniqueIndex('uq_tfk_invoices_tenant_number').on(t.tenantId, t.number)
    .where(sql`${t.number} IS NOT NULL`),
  uniqueIndex('uq_tfk_invoices_tenant_source').on(t.tenantId, t.sourceId)
    .where(sql`${t.sourceId} IS NOT NULL`),
  uniqueIndex('uniq_tfk_invoice_source_quote').on(t.tenantId, t.sourceQuoteId)
    .where(sql`${t.sourceQuoteId} IS NOT NULL AND ${t.deletedAt} IS NULL`),
]);

export const tradeflowkitInvoiceItems = pgTable('tradeflowkit_invoice_items', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  invoiceId: varchar('invoice_id', { length: 36 }).notNull().references(() => tradeflowkitInvoices.id, { onDelete: 'cascade' }),
  lineNumber: integer('line_number').notNull(),
  description: text('description').notNull(),
  quantityMilli: integer('quantity_milli').notNull(),
  unitPriceCents: integer('unit_price_cents').notNull(),
  lineTotalCents: integer('line_total_cents').notNull(),
  sourceId: text('source_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('uq_tfk_invoice_item_line').on(t.tenantId, t.invoiceId, t.lineNumber),
  index('idx_tfk_invoice_items_invoice').on(t.tenantId, t.invoiceId),
]);

export const tradeflowkitPayments = pgTable('tradeflowkit_payments', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  invoiceId: varchar('invoice_id', { length: 36 }).notNull().references(() => tradeflowkitInvoices.id, { onDelete: 'restrict' }),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  amountCents: integer('amount_cents').notNull(),
  method: text('method').notNull(),
  status: text('status').notNull().default('succeeded'),
  provider: text('provider'),
  providerReference: text('provider_reference'),
  reference: text('reference'),
  notes: text('notes'),
  idempotencyKey: varchar('idempotency_key', { length: 200 }).notNull(),
  paidAt: timestamp('paid_at').defaultNow().notNull(),
  voidedAt: timestamp('voided_at'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('idx_tfk_payments_tenant_invoice').on(t.tenantId, t.invoiceId, t.paidAt),
  uniqueIndex('uq_tfk_payments_idempotency').on(t.tenantId, t.idempotencyKey),
  uniqueIndex('uq_tfk_payments_provider_ref').on(t.tenantId, t.provider, t.providerReference)
    .where(sql`${t.provider} IS NOT NULL AND ${t.providerReference} IS NOT NULL`),
]);

export const tradeflowkitComments = pgTable('tradeflowkit_comments', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  entityType: text('entity_type').notNull(),
  entityId: varchar('entity_id', { length: 36 }).notNull(),
  body: text('body').notNull(),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).notNull().references(() => users.id),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (t) => [index('idx_tfk_comments_entity').on(t.tenantId, t.entityType, t.entityId, t.createdAt)]);

export const tradeflowkitTags = pgTable('tradeflowkit_tags', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  name: text('name').notNull(),
  normalizedName: text('normalized_name').notNull(),
  color: text('color'),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  archivedAt: timestamp('archived_at'),
}, (t) => [uniqueIndex('uq_tfk_tags_active_name').on(t.tenantId, t.normalizedName)
  .where(sql`${t.archivedAt} IS NULL`)]);

export const tradeflowkitTagAssignments = pgTable('tradeflowkit_tag_assignments', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  tagId: varchar('tag_id', { length: 36 }).notNull().references(() => tradeflowkitTags.id, { onDelete: 'cascade' }),
  entityType: text('entity_type').notNull(),
  entityId: varchar('entity_id', { length: 36 }).notNull(),
  createdByUserId: varchar('created_by_user_id', { length: 36 }).notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('uq_tfk_tag_assignment').on(t.tenantId, t.tagId, t.entityType, t.entityId),
  index('idx_tfk_tag_assignments_entity').on(t.tenantId, t.entityType, t.entityId),
]);

export const tradeflowkitSettings = pgTable('tradeflowkit_settings', {
  tenantId: varchar('tenant_id', { length: 36 }).primaryKey().references(() => tenants.id),
  jobPrefix: varchar('job_prefix', { length: 12 }).notNull().default('JOB'),
  quotePrefix: varchar('quote_prefix', { length: 12 }).notNull().default('QTE'),
  invoicePrefix: varchar('invoice_prefix', { length: 12 }).notNull().default('INV'),
  defaultTaxRateBps: integer('default_tax_rate_bps').notNull().default(0),
  defaultHourlyRateCents: integer('default_hourly_rate_cents').notNull().default(0),
  paymentTermsDays: integer('payment_terms_days').notNull().default(30),
  currency: varchar('currency', { length: 3 }).notNull().default('USD'),
  timezone: text('timezone').notNull().default('UTC'),
  updatedByUserId: varchar('updated_by_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const tradeflowkitSequences = pgTable('tradeflowkit_sequences', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  kind: text('kind').notNull(),
  lastNumber: integer('last_number').notNull().default(0),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [uniqueIndex('uq_tfk_sequence_kind').on(t.tenantId, t.kind)]);

export const tradeflowkitMigrationRefs = pgTable('tradeflowkit_migration_refs', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar('tenant_id', { length: 36 }).notNull().references(() => tenants.id),
  sourceTable: text('source_table').notNull(),
  sourceId: text('source_id').notNull(),
  targetTable: text('target_table').notNull(),
  targetId: varchar('target_id', { length: 36 }).notNull(),
  sourceFingerprint: varchar('source_fingerprint', { length: 64 }).notNull(),
  importedAt: timestamp('imported_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('uq_tfk_migration_source').on(t.tenantId, t.sourceTable, t.sourceId),
  index('idx_tfk_migration_target').on(t.tenantId, t.targetTable, t.targetId),
]);

export type ModuleCallLogRow = typeof moduleCallLogs.$inferSelect;
export type ModuleStudySessionRow = typeof moduleStudySessions.$inferSelect;
export type ModuleAutomationRow = typeof moduleAutomations.$inferSelect;
export type ModuleScaffoldRow = typeof moduleScaffolds.$inferSelect;
export type TechDeckTicketRow = typeof techdeckTickets.$inferSelect;
export type TechDeckAssetRow = typeof techdeckAssets.$inferSelect;
export type TechDeckRunbookRow = typeof techdeckRunbooks.$inferSelect;
export type PulseDeskDepartmentRow = typeof pulsedeskDepartments.$inferSelect;
export type PulseDeskRequestRow = typeof pulsedeskRequests.$inferSelect;
export type PulseDeskRequestEventRow = typeof pulsedeskRequestEvents.$inferSelect;
export type NinjaPoolPracticeSessionRow = typeof ninjaPoolPracticeSessions.$inferSelect;
export type TradeFlowKitLeadRow = typeof tradeflowkitLeads.$inferSelect;
export type TradeFlowKitCustomerRow = typeof tradeflowkitCustomers.$inferSelect;
export type TradeFlowKitJobRow = typeof tradeflowkitJobs.$inferSelect;
export type TradeFlowKitTaskRow = typeof tradeflowkitTasks.$inferSelect;
export type TradeFlowKitQuoteRow = typeof tradeflowkitQuotes.$inferSelect;
export type TradeFlowKitInvoiceRow = typeof tradeflowkitInvoices.$inferSelect;
export type TradeFlowKitPaymentRow = typeof tradeflowkitPayments.$inferSelect;
