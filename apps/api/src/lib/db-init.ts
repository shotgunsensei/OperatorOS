import { db } from '../db.js';

/**
 * Create the control-plane tables that the additive extension DDL references.
 *
 * This lives outside the API entrypoint so an empty database can be prepared
 * by integration tests and administrative tooling without importing and
 * starting the Fastify server. Keep this step ahead of ensureExtendedTables().
 */
export async function ensureBaseTables() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      git_url TEXT NOT NULL,
      git_ref TEXT NOT NULL DEFAULT 'main',
      profile_id TEXT NOT NULL DEFAULT 'node20',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_workspaces_status ON workspaces(status);
    ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS user_id VARCHAR(36);
    CREATE INDEX IF NOT EXISTS idx_workspaces_user ON workspaces(user_id);

    CREATE TABLE IF NOT EXISTS runners (
      workspace_id VARCHAR(36) PRIMARY KEY REFERENCES workspaces(id),
      mode TEXT NOT NULL DEFAULT 'docker',
      pod_name TEXT,
      namespace TEXT,
      pvc_name TEXT,
      container_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      started_at TIMESTAMP,
      stopped_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id VARCHAR(36) NOT NULL REFERENCES workspaces(id),
      title TEXT NOT NULL,
      goal TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      required_checks JSONB,
      check_results JSONB,
      result_summary TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      started_at TIMESTAMP,
      finished_at TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id);

    CREATE TABLE IF NOT EXISTS task_events (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id VARCHAR(36) NOT NULL REFERENCES tasks(id),
      ts TIMESTAMP DEFAULT NOW() NOT NULL,
      type TEXT NOT NULL,
      payload JSONB
    );
    CREATE INDEX IF NOT EXISTS idx_task_events_task_ts ON task_events(task_id, ts);

    CREATE TABLE IF NOT EXISTS tool_traces (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id VARCHAR(36) NOT NULL REFERENCES tasks(id),
      ts TIMESTAMP DEFAULT NOW() NOT NULL,
      tool_name TEXT NOT NULL,
      input JSONB,
      output JSONB,
      success BOOLEAN,
      duration_ms INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_tool_traces_task_ts ON tool_traces(task_id, ts);

    CREATE TABLE IF NOT EXISTS workspace_ports (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id VARCHAR(36) NOT NULL REFERENCES workspaces(id),
      port INTEGER NOT NULL,
      protocol TEXT NOT NULL DEFAULT 'http',
      is_primary BOOLEAN NOT NULL DEFAULT false,
      health_path TEXT,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS publish_runs (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id VARCHAR(36) NOT NULL REFERENCES workspaces(id),
      status TEXT NOT NULL DEFAULT 'analyzing',
      detected_json JSONB,
      plan_json JSONB,
      proof_json JSONB,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_publish_runs_workspace ON publish_runs(workspace_id);
  `);
}

export async function ensureExtendedTables() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS workspace_processes (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id VARCHAR(36) NOT NULL REFERENCES workspaces(id),
      name TEXT NOT NULL,
      command TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      provider_process_id TEXT,
      service_id VARCHAR(36),
      started_at TIMESTAMP DEFAULT NOW() NOT NULL,
      finished_at TIMESTAMP,
      exit_code INTEGER,
      duration_ms INTEGER,
      log_path TEXT,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_workspace_processes_workspace_started ON workspace_processes(workspace_id, started_at DESC);

    CREATE TABLE IF NOT EXISTS workspace_services (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id VARCHAR(36) NOT NULL REFERENCES workspaces(id),
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'custom',
      command TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'stopped',
      port INTEGER,
      protocol TEXT NOT NULL DEFAULT 'http',
      health_path TEXT,
      process_id VARCHAR(36),
      started_at TIMESTAMP,
      stopped_at TIMESTAMP,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_workspace_services_workspace_updated ON workspace_services(workspace_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS automation_rules (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id VARCHAR(36) NOT NULL REFERENCES workspaces(id),
      name TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      trigger_json JSONB,
      action_type TEXT NOT NULL,
      action_json JSONB,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_automation_rules_workspace_updated ON automation_rules(workspace_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS system_events (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id VARCHAR(36) REFERENCES workspaces(id),
      task_id VARCHAR(36),
      source TEXT NOT NULL,
      type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      payload JSONB,
      ts TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_system_events_workspace_ts ON system_events(workspace_id, ts DESC);

    CREATE TABLE IF NOT EXISTS system_notifications (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id VARCHAR(36) REFERENCES workspaces(id),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'info',
      read BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_system_notifications_workspace_created ON system_notifications(workspace_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS workspace_snapshots (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id VARCHAR(36) NOT NULL REFERENCES workspaces(id),
      label TEXT NOT NULL,
      git_ref TEXT,
      metadata_json JSONB,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_workspace_snapshots_workspace_created ON workspace_snapshots(workspace_id, created_at DESC);
  `);
}
