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

export type PublishRunRow = typeof publishRuns.$inferSelect;
export type WorkspaceProcessRow = typeof workspaceProcesses.$inferSelect;
export type WorkspaceServiceRow = typeof workspaceServices.$inferSelect;
export type AutomationRuleRow = typeof automationRules.$inferSelect;
export type SystemEventRow = typeof systemEvents.$inferSelect;
export type SystemNotificationRow = typeof systemNotifications.$inferSelect;
export type WorkspaceSnapshotRow = typeof workspaceSnapshots.$inferSelect;
