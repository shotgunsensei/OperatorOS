import { sql } from 'drizzle-orm';
import { db } from '../db.js';

/**
 * Additive, idempotent Phase 12A schema. Composite tenant foreign keys prevent
 * a script version, review, download, or generation from crossing tenants.
 * Script bodies are authored and reviewed here but are never executed by the
 * OperatorOS runtime.
 */
export async function ensureNinjamationTables(): Promise<void> {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS ninjamation_scripts (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      approved_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      name VARCHAR(180) NOT NULL,
      description TEXT,
      language VARCHAR(20) NOT NULL,
      category VARCHAR(80) NOT NULL DEFAULT 'General',
      source VARCHAR(24) NOT NULL DEFAULT 'manual',
      risk_tier VARCHAR(12) NOT NULL DEFAULT 'medium',
      status VARCHAR(16) NOT NULL DEFAULT 'draft',
      current_version_number INTEGER NOT NULL DEFAULT 1,
      version INTEGER NOT NULL DEFAULT 1,
      approved_at TIMESTAMP,
      retired_at TIMESTAMP,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_ninjamation_script_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT ninjamation_script_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 180),
      CONSTRAINT ninjamation_script_language_check CHECK (language IN ('powershell','python','batch','bash')),
      CONSTRAINT ninjamation_script_source_check CHECK (source IN ('manual','ai_generated','catalog_import')),
      CONSTRAINT ninjamation_script_risk_check CHECK (risk_tier IN ('low','medium','high')),
      CONSTRAINT ninjamation_script_status_check CHECK (status IN ('draft','review','approved','retired')),
      CONSTRAINT ninjamation_script_version_check CHECK (version >= 1 AND current_version_number >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_ninjamation_script_tenant_updated
      ON ninjamation_scripts(tenant_id,updated_at DESC) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_ninjamation_script_tenant_status
      ON ninjamation_scripts(tenant_id,status,language) WHERE deleted_at IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_ninjamation_script_active_name
      ON ninjamation_scripts(tenant_id,lower(name)) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS ninjamation_script_versions (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      script_id VARCHAR(36) NOT NULL,
      version_number INTEGER NOT NULL,
      content TEXT NOT NULL,
      content_sha256 CHAR(64) NOT NULL,
      static_analysis JSONB NOT NULL,
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_ninjamation_version_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT uq_ninjamation_script_version UNIQUE (tenant_id,script_id,version_number),
      CONSTRAINT ninjamation_version_script_fk FOREIGN KEY (tenant_id,script_id)
        REFERENCES ninjamation_scripts(tenant_id,id),
      CONSTRAINT ninjamation_version_number_check CHECK (version_number >= 1),
      CONSTRAINT ninjamation_version_content_check CHECK (char_length(content) BETWEEN 1 AND 100000),
      CONSTRAINT ninjamation_version_hash_check CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
      CONSTRAINT ninjamation_version_analysis_check CHECK (
        jsonb_typeof(static_analysis)='object' AND static_analysis ? 'analyzerVersion'
      )
    );
    CREATE INDEX IF NOT EXISTS idx_ninjamation_version_script
      ON ninjamation_script_versions(tenant_id,script_id,version_number DESC);

    CREATE TABLE IF NOT EXISTS ninjamation_reviews (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      script_id VARCHAR(36) NOT NULL,
      script_version_id VARCHAR(36) NOT NULL,
      reviewer_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      decision VARCHAR(16) NOT NULL,
      note TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT ninjamation_review_script_fk FOREIGN KEY (tenant_id,script_id)
        REFERENCES ninjamation_scripts(tenant_id,id),
      CONSTRAINT ninjamation_review_version_fk FOREIGN KEY (tenant_id,script_version_id)
        REFERENCES ninjamation_script_versions(tenant_id,id),
      CONSTRAINT ninjamation_review_decision_check CHECK (decision IN ('submitted','approved','rejected','retired'))
    );
    CREATE INDEX IF NOT EXISTS idx_ninjamation_review_script
      ON ninjamation_reviews(tenant_id,script_id,created_at DESC);

    CREATE TABLE IF NOT EXISTS ninjamation_downloads (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      script_id VARCHAR(36) NOT NULL,
      script_version_id VARCHAR(36) NOT NULL,
      downloaded_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      file_name VARCHAR(140) NOT NULL,
      content_sha256 CHAR(64) NOT NULL,
      request_id VARCHAR(128),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT ninjamation_download_script_fk FOREIGN KEY (tenant_id,script_id)
        REFERENCES ninjamation_scripts(tenant_id,id),
      CONSTRAINT ninjamation_download_version_fk FOREIGN KEY (tenant_id,script_version_id)
        REFERENCES ninjamation_script_versions(tenant_id,id),
      CONSTRAINT ninjamation_download_hash_check CHECK (content_sha256 ~ '^[0-9a-f]{64}$')
    );
    CREATE INDEX IF NOT EXISTS idx_ninjamation_download_tenant
      ON ninjamation_downloads(tenant_id,created_at DESC);

    CREATE TABLE IF NOT EXISTS ninjamation_generations (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      script_id VARCHAR(36),
      user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      idempotency_key VARCHAR(120) NOT NULL,
      prompt_sha256 CHAR(64) NOT NULL,
      language VARCHAR(20) NOT NULL,
      provider VARCHAR(80) NOT NULL,
      model VARCHAR(120) NOT NULL,
      provider_version VARCHAR(80),
      token_count INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_ninjamation_generation_key UNIQUE (tenant_id,user_id,idempotency_key),
      CONSTRAINT ninjamation_generation_script_fk FOREIGN KEY (tenant_id,script_id)
        REFERENCES ninjamation_scripts(tenant_id,id),
      CONSTRAINT ninjamation_generation_language_check CHECK (language IN ('powershell','python','batch','bash')),
      CONSTRAINT ninjamation_generation_hash_check CHECK (prompt_sha256 ~ '^[0-9a-f]{64}$'),
      CONSTRAINT ninjamation_generation_usage_check CHECK (token_count >= 0 AND duration_ms >= 0)
    );
    CREATE INDEX IF NOT EXISTS idx_ninjamation_generation_tenant
      ON ninjamation_generations(tenant_id,created_at DESC);
  `));
}
