import { db } from '../db.js';

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
