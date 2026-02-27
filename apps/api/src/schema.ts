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

export type WorkspaceRow = typeof workspaces.$inferSelect;
export type InsertWorkspace = typeof workspaces.$inferInsert;
export type RunnerRow = typeof runners.$inferSelect;
export type InsertRunner = typeof runners.$inferInsert;
export type TaskRow = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;
export type TaskEventRow = typeof taskEvents.$inferSelect;
export type ToolTraceRow = typeof toolTraces.$inferSelect;
