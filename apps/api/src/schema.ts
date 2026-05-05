import { pgTable, text, varchar, timestamp, integer, boolean, jsonb, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const workspaces = pgTable('workspaces', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
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
]);

export const runners = pgTable('runners', {
  workspaceId: varchar('workspace_id', { length: 36 }).primaryKey().references(() => workspaces.id),
  mode: text('mode', { enum: ['k8s', 'docker'] }).notNull().default('docker'),
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
  status: text('status', { enum: ['active', 'suspended', 'deleted', 'pending'] }).notNull().default('active'),
  avatarUrl: text('avatar_url'),
  planId: varchar('plan_id', { length: 36 }),
  failedLoginCount: integer('failed_login_count').notNull().default(0),
  lockedUntil: timestamp('locked_until'),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  lastLoginAt: timestamp('last_login_at'),
}, (t) => [
  index('idx_users_email').on(t.email),
  index('idx_users_status').on(t.status),
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
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('idx_subscriptions_user').on(t.userId),
  index('idx_subscriptions_status').on(t.status),
]);

export const saasWorkspaces = pgTable('saas_workspaces', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar('owner_id', { length: 36 }).notNull().references(() => users.id),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('idx_saas_workspaces_owner').on(t.ownerId),
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
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('idx_saas_projects_workspace').on(t.workspaceId),
  index('idx_saas_projects_user').on(t.userId),
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
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('idx_saas_tasks_project').on(t.projectId),
  index('idx_saas_tasks_user').on(t.userId),
  index('idx_saas_tasks_status').on(t.status),
]);

export const notes = pgTable('notes', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  workspaceId: varchar('workspace_id', { length: 36 }).references(() => saasWorkspaces.id),
  projectId: varchar('project_id', { length: 36 }).references(() => saasProjects.id),
  title: text('title').notNull(),
  content: text('content').default(''),
  isPinned: boolean('is_pinned').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('idx_notes_user').on(t.userId),
  index('idx_notes_workspace').on(t.workspaceId),
]);

export const activityFeed = pgTable('activity_feed', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  workspaceId: varchar('workspace_id', { length: 36 }).references(() => saasWorkspaces.id),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: varchar('entity_id', { length: 36 }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_activity_feed_user').on(t.userId),
  index('idx_activity_feed_workspace_created').on(t.workspaceId, t.createdAt),
]);

export const usageTracking = pgTable('usage_tracking', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  actionType: text('action_type').notNull(),
  count: integer('count').notNull().default(1),
  periodStart: timestamp('period_start').notNull(),
  periodEnd: timestamp('period_end').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_usage_tracking_user_period').on(t.userId, t.periodStart),
]);

export const adminAuditLogs = pgTable('admin_audit_logs', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar('admin_id', { length: 36 }).notNull().references(() => users.id),
  action: text('action').notNull(),
  targetUserId: varchar('target_user_id', { length: 36 }),
  details: jsonb('details').$type<Record<string, unknown>>(),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_admin_audit_logs_admin').on(t.adminId),
  index('idx_admin_audit_logs_created').on(t.createdAt),
]);

export const billingEvents = pgTable('billing_events', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
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
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_billing_events_user').on(t.userId),
  index('idx_billing_events_processed').on(t.processedAt),
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
  baseUrl: text('base_url').notNull().default(''),
  status: text('status').notNull().default('coming_soon'),
  planMin: text('plan_min').notNull().default('elite'),
  requiresOrg: boolean('requires_org').notNull().default(false),
  ord: integer('ord').notNull().default(0),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('idx_modules_slug').on(t.slug),
  index('idx_modules_status').on(t.status),
]);

export const planModules = pgTable('plan_modules', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  planId: varchar('plan_id', { length: 36 }).notNull().references(() => subscriptionPlans.id),
  moduleId: varchar('module_id', { length: 36 }).notNull().references(() => modules.id),
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
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('idx_addon_subs_user').on(t.userId),
  index('idx_addon_subs_module').on(t.moduleId),
  index('idx_addon_subs_status').on(t.status),
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
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('idx_overrides_user').on(t.userId),
  index('idx_overrides_module').on(t.moduleId),
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
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_sso_tokens_expires').on(t.expiresAt),
  index('idx_sso_tokens_user').on(t.userId),
]);

export type ModuleRow = typeof modules.$inferSelect;
export type PlanModuleRow = typeof planModules.$inferSelect;
export type AddonSubscriptionRow = typeof addonSubscriptions.$inferSelect;
export type EntitlementOverrideRow = typeof entitlementOverrides.$inferSelect;
export type SsoHandoffTokenRow = typeof ssoHandoffTokens.$inferSelect;

export const aiPromptTemplates = pgTable('ai_prompt_templates', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  name: text('name').notNull(),
  description: text('description'),
  toolType: text('tool_type').notNull(),
  promptText: text('prompt_text').notNull(),
  isShared: boolean('is_shared').notNull().default(false),
  usageCount: integer('usage_count').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('idx_ai_templates_user').on(t.userId),
  index('idx_ai_templates_tool').on(t.toolType),
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
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_ai_actions_user').on(t.userId),
  index('idx_ai_actions_created').on(t.createdAt),
  index('idx_ai_actions_tool').on(t.toolType),
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
