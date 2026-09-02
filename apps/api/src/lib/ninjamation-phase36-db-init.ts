import { sql } from 'drizzle-orm';
import { db } from '../db.js';

/**
 * Additive Phase 36 product schema. Script source remains inert data: these
 * tables contain catalog provenance, review evidence, downloads, and usage;
 * they do not provide a command-execution surface.
 */
export async function ensureNinjamationPhase36Tables(): Promise<void> {
  await db.execute(sql.raw(`
    ALTER TABLE ninjamation_scripts
      ADD COLUMN IF NOT EXISTS owner_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS source_display_name VARCHAR(180),
      ADD COLUMN IF NOT EXISTS file_name VARCHAR(180),
      ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS source_repository VARCHAR(180),
      ADD COLUMN IF NOT EXISTS source_branch VARCHAR(120),
      ADD COLUMN IF NOT EXISTS source_path VARCHAR(800),
      ADD COLUMN IF NOT EXISTS source_commit CHAR(40),
      ADD COLUMN IF NOT EXISTS source_blob_sha VARCHAR(64),
      ADD COLUMN IF NOT EXISTS source_content_sha256 CHAR(64),
      ADD COLUMN IF NOT EXISTS source_license VARCHAR(80),
      ADD COLUMN IF NOT EXISTS sync_state VARCHAR(16) NOT NULL DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS deprecated_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS deprecation_reason VARCHAR(240);

    UPDATE ninjamation_scripts
      SET owner_user_id = created_by_user_id
      WHERE owner_user_id IS NULL AND created_by_user_id IS NOT NULL;

    ALTER TABLE ninjamation_scripts DROP CONSTRAINT IF EXISTS ninjamation_script_language_check;
    ALTER TABLE ninjamation_scripts
      ADD CONSTRAINT ninjamation_script_language_check CHECK (language IN (
        'powershell','python','batch','bash','vbscript','javascript','typescript',
        'autohotkey','registry','xml','json','yaml','other'
      ));
    ALTER TABLE ninjamation_scripts DROP CONSTRAINT IF EXISTS ninjamation_script_tags_check;
    ALTER TABLE ninjamation_scripts
      ADD CONSTRAINT ninjamation_script_tags_check CHECK (jsonb_typeof(tags)='array');
    ALTER TABLE ninjamation_scripts DROP CONSTRAINT IF EXISTS ninjamation_script_sync_state_check;
    ALTER TABLE ninjamation_scripts
      ADD CONSTRAINT ninjamation_script_sync_state_check CHECK (sync_state IN ('active','deprecated'));
    ALTER TABLE ninjamation_scripts DROP CONSTRAINT IF EXISTS ninjamation_script_source_commit_check;
    ALTER TABLE ninjamation_scripts
      ADD CONSTRAINT ninjamation_script_source_commit_check CHECK (
        source_commit IS NULL OR source_commit ~ '^[0-9a-f]{40}$'
      );
    ALTER TABLE ninjamation_scripts DROP CONSTRAINT IF EXISTS ninjamation_script_source_content_hash_check;
    ALTER TABLE ninjamation_scripts
      ADD CONSTRAINT ninjamation_script_source_content_hash_check CHECK (
        source_content_sha256 IS NULL OR source_content_sha256 ~ '^[0-9a-f]{64}$'
      );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_ninjamation_catalog_source_path
      ON ninjamation_scripts(tenant_id,source_repository,source_path)
      WHERE source='catalog_import' AND source_repository IS NOT NULL
        AND source_path IS NOT NULL AND deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_ninjamation_catalog_filter
      ON ninjamation_scripts(tenant_id,sync_state,language,category,updated_at DESC)
      WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_ninjamation_owner
      ON ninjamation_scripts(tenant_id,owner_user_id,updated_at DESC)
      WHERE deleted_at IS NULL;

    ALTER TABLE ninjamation_script_versions
      ADD COLUMN IF NOT EXISTS provenance_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS source_commit CHAR(40),
      ADD COLUMN IF NOT EXISTS source_blob_sha VARCHAR(64),
      ADD COLUMN IF NOT EXISTS safety_status VARCHAR(24) NOT NULL DEFAULT 'review_required';
    ALTER TABLE ninjamation_script_versions DROP CONSTRAINT IF EXISTS ninjamation_version_provenance_check;
    ALTER TABLE ninjamation_script_versions
      ADD CONSTRAINT ninjamation_version_provenance_check CHECK (jsonb_typeof(provenance_json)='object');
    ALTER TABLE ninjamation_script_versions DROP CONSTRAINT IF EXISTS ninjamation_version_safety_status_check;
    ALTER TABLE ninjamation_script_versions
      ADD CONSTRAINT ninjamation_version_safety_status_check CHECK (
        safety_status IN ('review_required','critical_findings','admin_reviewed')
      );

    ALTER TABLE ninjamation_generations
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'completed',
      ADD COLUMN IF NOT EXISTS fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS output_sha256 CHAR(64),
      ADD COLUMN IF NOT EXISTS validation_version VARCHAR(40) NOT NULL DEFAULT 'ninjamation-v1',
      ADD COLUMN IF NOT EXISTS safety_summary JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE ninjamation_generations DROP CONSTRAINT IF EXISTS ninjamation_generation_status_check;
    ALTER TABLE ninjamation_generations
      ADD CONSTRAINT ninjamation_generation_status_check CHECK (status IN ('completed','failed','rejected'));
    ALTER TABLE ninjamation_generations DROP CONSTRAINT IF EXISTS ninjamation_generation_safety_check;
    ALTER TABLE ninjamation_generations
      ADD CONSTRAINT ninjamation_generation_safety_check CHECK (jsonb_typeof(safety_summary)='object');

    CREATE TABLE IF NOT EXISTS ninjamation_favorites (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      script_id VARCHAR(36) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_ninjamation_favorite UNIQUE (tenant_id,user_id,script_id),
      CONSTRAINT ninjamation_favorite_script_fk FOREIGN KEY (tenant_id,script_id)
        REFERENCES ninjamation_scripts(tenant_id,id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_ninjamation_favorites_user
      ON ninjamation_favorites(tenant_id,user_id,created_at DESC);

    CREATE TABLE IF NOT EXISTS ninjamation_sync_runs (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      requested_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      idempotency_key VARCHAR(120) NOT NULL,
      repository VARCHAR(180) NOT NULL,
      branch VARCHAR(120) NOT NULL,
      requested_commit CHAR(40),
      resolved_commit CHAR(40),
      mode VARCHAR(16) NOT NULL DEFAULT 'incremental',
      deletion_policy VARCHAR(16) NOT NULL DEFAULT 'deprecate',
      status VARCHAR(20) NOT NULL DEFAULT 'queued',
      shared_job_id VARCHAR(36),
      snapshot_sha256 CHAR(64),
      discovered_count INTEGER NOT NULL DEFAULT 0,
      created_count INTEGER NOT NULL DEFAULT 0,
      updated_count INTEGER NOT NULL DEFAULT 0,
      unchanged_count INTEGER NOT NULL DEFAULT 0,
      restored_count INTEGER NOT NULL DEFAULT 0,
      deprecated_count INTEGER NOT NULL DEFAULT 0,
      rejected_count INTEGER NOT NULL DEFAULT 0,
      error_code VARCHAR(80),
      error_summary VARCHAR(500),
      started_at TIMESTAMP,
      completed_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_ninjamation_sync_tenant_id UNIQUE (id,tenant_id),
      CONSTRAINT uq_ninjamation_sync_idempotency UNIQUE (tenant_id,idempotency_key),
      CONSTRAINT ninjamation_sync_mode_check CHECK (mode IN ('initial','incremental','retry')),
      CONSTRAINT ninjamation_sync_policy_check CHECK (deletion_policy='deprecate'),
      CONSTRAINT ninjamation_sync_status_check CHECK (status IN ('queued','running','completed','failed','cancelled')),
      CONSTRAINT ninjamation_sync_counts_check CHECK (
        discovered_count >= 0 AND created_count >= 0 AND updated_count >= 0 AND
        unchanged_count >= 0 AND restored_count >= 0 AND deprecated_count >= 0 AND rejected_count >= 0
      )
    );
    CREATE INDEX IF NOT EXISTS idx_ninjamation_sync_runs_tenant
      ON ninjamation_sync_runs(tenant_id,created_at DESC);

    CREATE TABLE IF NOT EXISTS ninjamation_sync_items (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      sync_run_id VARCHAR(36) NOT NULL,
      script_id VARCHAR(36),
      source_path VARCHAR(800) NOT NULL,
      action VARCHAR(20) NOT NULL,
      source_blob_sha VARCHAR(64),
      content_sha256 CHAR(64),
      reason_code VARCHAR(80),
      safe_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_ninjamation_sync_item UNIQUE (tenant_id,sync_run_id,source_path),
      CONSTRAINT ninjamation_sync_item_run_fk FOREIGN KEY (tenant_id,sync_run_id)
        REFERENCES ninjamation_sync_runs(tenant_id,id) ON DELETE CASCADE,
      CONSTRAINT ninjamation_sync_item_script_fk FOREIGN KEY (tenant_id,script_id)
        REFERENCES ninjamation_scripts(tenant_id,id) ON DELETE SET NULL,
      CONSTRAINT ninjamation_sync_item_action_check CHECK (
        action IN ('created','updated','unchanged','restored','deprecated','rejected')
      ),
      CONSTRAINT ninjamation_sync_item_metadata_check CHECK (jsonb_typeof(safe_metadata)='object')
    );
    CREATE INDEX IF NOT EXISTS idx_ninjamation_sync_items_run
      ON ninjamation_sync_items(tenant_id,sync_run_id,action,source_path);

    CREATE TABLE IF NOT EXISTS ninjamation_usage_counters (
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      period_start DATE NOT NULL,
      generation_count INTEGER NOT NULL DEFAULT 0,
      download_count INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id,user_id,period_start),
      CONSTRAINT ninjamation_usage_nonnegative CHECK (generation_count >= 0 AND download_count >= 0)
    );
  `));
}
