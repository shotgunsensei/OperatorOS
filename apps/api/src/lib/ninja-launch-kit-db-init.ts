import { sql } from 'drizzle-orm';
import { db } from '../db.js';

/**
 * Additive, idempotent Phase 11D schema. Composite tenant foreign keys make
 * cross-tenant relationships invalid even if an application predicate is
 * accidentally omitted.
 */
export async function ensureNinjaLaunchKitTables(): Promise<void> {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS launchkit_launches (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      owner_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      template_slug VARCHAR(80),
      title VARCHAR(180) NOT NULL,
      product_type VARCHAR(80) NOT NULL,
      summary TEXT,
      audience TEXT,
      pain_point TEXT,
      positioning TEXT,
      offer TEXT,
      price_minor INTEGER,
      currency CHAR(3) NOT NULL DEFAULT 'USD',
      channels JSONB NOT NULL DEFAULT '[]'::jsonb,
      tone VARCHAR(160),
      primary_color VARCHAR(7),
      accent_color VARCHAR(7),
      target_date DATE,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_launchkit_launch_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT launchkit_title_check CHECK (char_length(btrim(title)) BETWEEN 1 AND 180),
      CONSTRAINT launchkit_product_type_check CHECK (char_length(btrim(product_type)) BETWEEN 1 AND 80),
      CONSTRAINT launchkit_price_check CHECK (price_minor IS NULL OR price_minor >= 0),
      CONSTRAINT launchkit_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
      CONSTRAINT launchkit_channels_check CHECK (jsonb_typeof(channels)='array' AND jsonb_array_length(channels) <= 12),
      CONSTRAINT launchkit_color_check CHECK (
        (primary_color IS NULL OR primary_color ~ '^#[0-9A-Fa-f]{6}$') AND
        (accent_color IS NULL OR accent_color ~ '^#[0-9A-Fa-f]{6}$')
      ),
      CONSTRAINT launchkit_status_check CHECK (status IN ('draft','planning','active','review','launched','archived')),
      CONSTRAINT launchkit_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_launchkit_launch_tenant_updated
      ON launchkit_launches(tenant_id,updated_at DESC) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_launchkit_launch_owner
      ON launchkit_launches(tenant_id,owner_user_id,status) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS launchkit_phases (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      launch_id VARCHAR(36) NOT NULL,
      position INTEGER NOT NULL,
      title VARCHAR(160) NOT NULL,
      description TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      start_date DATE,
      due_date DATE,
      completed_at TIMESTAMP,
      version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_launchkit_phase_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT uq_launchkit_phase_position UNIQUE (tenant_id,launch_id,position),
      CONSTRAINT launchkit_phase_launch_fk FOREIGN KEY (tenant_id,launch_id)
        REFERENCES launchkit_launches(tenant_id,id),
      CONSTRAINT launchkit_phase_position_check CHECK (position BETWEEN 0 AND 1000),
      CONSTRAINT launchkit_phase_status_check CHECK (status IN ('pending','active','blocked','complete')),
      CONSTRAINT launchkit_phase_dates_check CHECK (start_date IS NULL OR due_date IS NULL OR start_date <= due_date),
      CONSTRAINT launchkit_phase_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_launchkit_phase_launch
      ON launchkit_phases(tenant_id,launch_id,position) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS launchkit_milestones (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      launch_id VARCHAR(36) NOT NULL,
      phase_id VARCHAR(36),
      owner_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      position INTEGER NOT NULL,
      title VARCHAR(180) NOT NULL,
      description TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      due_date DATE,
      completed_at TIMESTAMP,
      required BOOLEAN NOT NULL DEFAULT TRUE,
      version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_launchkit_milestone_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT launchkit_milestone_launch_fk FOREIGN KEY (tenant_id,launch_id)
        REFERENCES launchkit_launches(tenant_id,id),
      CONSTRAINT launchkit_milestone_phase_fk FOREIGN KEY (tenant_id,phase_id)
        REFERENCES launchkit_phases(tenant_id,id),
      CONSTRAINT launchkit_milestone_status_check CHECK (status IN ('pending','in_progress','blocked','complete')),
      CONSTRAINT launchkit_milestone_position_check CHECK (position BETWEEN 0 AND 10000),
      CONSTRAINT launchkit_milestone_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_launchkit_milestone_launch
      ON launchkit_milestones(tenant_id,launch_id,position) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS launchkit_tasks (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      launch_id VARCHAR(36) NOT NULL,
      milestone_id VARCHAR(36),
      depends_on_task_id VARCHAR(36),
      owner_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      position INTEGER NOT NULL,
      title VARCHAR(220) NOT NULL,
      description TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      due_date DATE,
      completed_at TIMESTAMP,
      required BOOLEAN NOT NULL DEFAULT TRUE,
      version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_launchkit_task_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT launchkit_task_launch_fk FOREIGN KEY (tenant_id,launch_id)
        REFERENCES launchkit_launches(tenant_id,id),
      CONSTRAINT launchkit_task_milestone_fk FOREIGN KEY (tenant_id,milestone_id)
        REFERENCES launchkit_milestones(tenant_id,id),
      CONSTRAINT launchkit_task_dependency_fk FOREIGN KEY (tenant_id,depends_on_task_id)
        REFERENCES launchkit_tasks(tenant_id,id),
      CONSTRAINT launchkit_task_not_self CHECK (depends_on_task_id IS NULL OR depends_on_task_id <> id),
      CONSTRAINT launchkit_task_status_check CHECK (status IN ('pending','in_progress','blocked','complete')),
      CONSTRAINT launchkit_task_position_check CHECK (position BETWEEN 0 AND 100000),
      CONSTRAINT launchkit_task_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_launchkit_task_launch
      ON launchkit_tasks(tenant_id,launch_id,status,position) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_launchkit_task_owner
      ON launchkit_tasks(tenant_id,owner_user_id,due_date) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS launchkit_generations (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      launch_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      idempotency_key VARCHAR(160) NOT NULL,
      input_sha256 CHAR(64) NOT NULL,
      provider VARCHAR(80) NOT NULL,
      model VARCHAR(120) NOT NULL,
      provider_version VARCHAR(80) NOT NULL,
      token_count INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_launchkit_generation_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT uq_launchkit_generation_idempotency UNIQUE (tenant_id,idempotency_key),
      CONSTRAINT launchkit_generation_launch_fk FOREIGN KEY (tenant_id,launch_id)
        REFERENCES launchkit_launches(tenant_id,id),
      CONSTRAINT launchkit_generation_metrics_check CHECK (token_count >= 0 AND duration_ms >= 0)
    );
    CREATE INDEX IF NOT EXISTS idx_launchkit_generation_launch
      ON launchkit_generations(tenant_id,launch_id,created_at DESC);

    CREATE TABLE IF NOT EXISTS launchkit_artifacts (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      launch_id VARCHAR(36) NOT NULL,
      generation_id VARCHAR(36),
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      kind VARCHAR(40) NOT NULL,
      title VARCHAR(200) NOT NULL,
      body TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      required BOOLEAN NOT NULL DEFAULT TRUE,
      version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_launchkit_artifact_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT launchkit_artifact_launch_fk FOREIGN KEY (tenant_id,launch_id)
        REFERENCES launchkit_launches(tenant_id,id),
      CONSTRAINT launchkit_artifact_generation_fk FOREIGN KEY (tenant_id,generation_id)
        REFERENCES launchkit_generations(tenant_id,id),
      CONSTRAINT launchkit_artifact_kind_check CHECK (kind IN (
        'landing','ads','email_sms','social','faq','qr_flyer','visual_briefs','launch_checklist','positioning','report'
      )),
      CONSTRAINT launchkit_artifact_body_check CHECK (char_length(btrim(body)) BETWEEN 1 AND 100000),
      CONSTRAINT launchkit_artifact_status_check CHECK (status IN ('draft','review','approved','archived')),
      CONSTRAINT launchkit_artifact_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_launchkit_artifact_launch
      ON launchkit_artifacts(tenant_id,launch_id,status,updated_at DESC) WHERE deleted_at IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_launchkit_artifact_active_kind
      ON launchkit_artifacts(tenant_id,launch_id,kind) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS launchkit_exports (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      launch_id VARCHAR(36) NOT NULL,
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      format VARCHAR(20) NOT NULL,
      content_sha256 CHAR(64) NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_launchkit_export_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT launchkit_export_launch_fk FOREIGN KEY (tenant_id,launch_id)
        REFERENCES launchkit_launches(tenant_id,id),
      CONSTRAINT launchkit_export_format_check CHECK (format IN ('json','markdown','csv')),
      CONSTRAINT launchkit_export_size_check CHECK (size_bytes > 0)
    );
    CREATE INDEX IF NOT EXISTS idx_launchkit_export_launch
      ON launchkit_exports(tenant_id,launch_id,created_at DESC);
  `));
}
