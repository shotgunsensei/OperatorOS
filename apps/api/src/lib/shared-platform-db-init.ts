import { sql } from 'drizzle-orm';
import { db } from '../db.js';

/** Additive, idempotent Phase 22 shared-platform control-plane schema. */
export async function ensureSharedPlatformTables(): Promise<void> {
  await db.execute(sql.raw(`
    ALTER TABLE shared_outbox_messages DROP CONSTRAINT IF EXISTS shared_outbox_status_check;
    ALTER TABLE shared_outbox_messages ADD CONSTRAINT shared_outbox_status_check
      CHECK (status IN ('pending','processing','retry','delivered','recorded','disabled','dead_letter','cancelled'));

    CREATE TABLE IF NOT EXISTS shared_secret_references (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      module_id VARCHAR(36) REFERENCES modules(id),
      purpose VARCHAR(120) NOT NULL,
      ciphertext BYTEA NOT NULL,
      iv BYTEA NOT NULL,
      auth_tag BYTEA NOT NULL,
      key_version VARCHAR(40) NOT NULL,
      fingerprint CHAR(64) NOT NULL,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      rotated_from_id VARCHAR(36) REFERENCES shared_secret_references(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMPTZ,
      CONSTRAINT shared_secret_purpose_check CHECK (length(purpose) BETWEEN 1 AND 120),
      CONSTRAINT shared_secret_fingerprint_check CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
      CONSTRAINT uq_shared_secret_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_shared_secret_scope
      ON shared_secret_references(tenant_id, module_id, purpose, created_at DESC);

    CREATE TABLE IF NOT EXISTS shared_provider_configs (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      module_id VARCHAR(36) REFERENCES modules(id),
      scope_key VARCHAR(80) NOT NULL,
      provider_key VARCHAR(120) NOT NULL,
      provider_kind TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'disabled',
      public_config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      secret_reference_id VARCHAR(36),
      callback_ready BOOLEAN NOT NULL DEFAULT FALSE,
      health_state TEXT NOT NULL DEFAULT 'blocked',
      health_reason_code VARCHAR(120),
      last_health_at TIMESTAMPTZ,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT shared_provider_kind_check CHECK (provider_kind IN ('email','sms','ai','storage','oauth','webhook')),
      CONSTRAINT shared_provider_mode_check CHECK (mode IN ('disabled','test','live')),
      CONSTRAINT shared_provider_health_check CHECK (health_state IN ('ready','degraded','blocked')),
      CONSTRAINT shared_provider_scope_check CHECK (scope_key = 'tenant' OR scope_key ~ '^module:[0-9a-f-]{36}$'),
      CONSTRAINT shared_provider_secret_fk FOREIGN KEY (tenant_id, secret_reference_id)
        REFERENCES shared_secret_references(tenant_id, id),
      CONSTRAINT uq_shared_provider_scope UNIQUE (tenant_id, scope_key, provider_key),
      CONSTRAINT uq_shared_provider_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_shared_provider_tenant
      ON shared_provider_configs(tenant_id, provider_kind, updated_at DESC);

    CREATE TABLE IF NOT EXISTS shared_notification_suppressions (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      channel TEXT NOT NULL,
      destination_fingerprint CHAR(64) NOT NULL,
      reason_code VARCHAR(120) NOT NULL,
      source VARCHAR(120) NOT NULL,
      created_by_user_id VARCHAR(36) REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      lifted_at TIMESTAMPTZ,
      CONSTRAINT shared_suppression_channel_check CHECK (channel IN ('email','sms')),
      CONSTRAINT shared_suppression_hash_check CHECK (destination_fingerprint ~ '^[0-9a-f]{64}$'),
      CONSTRAINT uq_shared_suppression_active UNIQUE NULLS NOT DISTINCT (tenant_id, channel, destination_fingerprint, lifted_at),
      CONSTRAINT uq_shared_suppression_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_shared_suppressions_active
      ON shared_notification_suppressions(tenant_id, channel) WHERE lifted_at IS NULL;

    CREATE TABLE IF NOT EXISTS shared_delivery_attempts (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      module_id VARCHAR(36) NOT NULL REFERENCES modules(id),
      delivery_kind TEXT NOT NULL,
      delivery_id VARCHAR(36) NOT NULL,
      attempt_number INTEGER NOT NULL,
      adapter_name VARCHAR(120) NOT NULL,
      external_delivery BOOLEAN NOT NULL DEFAULT FALSE,
      result_state TEXT NOT NULL,
      response_status INTEGER,
      safe_error_code VARCHAR(120),
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      CONSTRAINT shared_delivery_kind_check CHECK (delivery_kind IN ('notification','webhook')),
      CONSTRAINT shared_delivery_attempt_check CHECK (attempt_number > 0),
      CONSTRAINT shared_delivery_response_check CHECK (response_status IS NULL OR response_status BETWEEN 100 AND 599),
      CONSTRAINT uq_shared_delivery_attempt UNIQUE (tenant_id, delivery_kind, delivery_id, attempt_number)
    );
    CREATE INDEX IF NOT EXISTS idx_shared_delivery_attempts_tenant
      ON shared_delivery_attempts(tenant_id, module_id, started_at DESC);

    CREATE TABLE IF NOT EXISTS shared_webhook_endpoints (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      module_id VARCHAR(36) NOT NULL REFERENCES modules(id),
      name VARCHAR(120) NOT NULL,
      endpoint_url TEXT NOT NULL,
      secret_reference_id VARCHAR(36) NOT NULL,
      event_types_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      archived_at TIMESTAMPTZ,
      CONSTRAINT shared_webhook_endpoint_secret_fk FOREIGN KEY (tenant_id, secret_reference_id)
        REFERENCES shared_secret_references(tenant_id, id),
      CONSTRAINT uq_shared_webhook_endpoint_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_shared_webhook_endpoints_scope
      ON shared_webhook_endpoints(tenant_id, module_id, created_at DESC) WHERE archived_at IS NULL;

    CREATE TABLE IF NOT EXISTS shared_webhook_deliveries (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      module_id VARCHAR(36) NOT NULL REFERENCES modules(id),
      endpoint_id VARCHAR(36) NOT NULL,
      event_type VARCHAR(160) NOT NULL,
      payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      payload_sha256 CHAR(64) NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      lease_owner VARCHAR(120),
      lease_expires_at TIMESTAMPTZ,
      idempotency_key VARCHAR(200) NOT NULL,
      correlation_id VARCHAR(120),
      last_response_status INTEGER,
      last_error_code VARCHAR(120),
      delivered_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT shared_webhook_delivery_endpoint_fk FOREIGN KEY (tenant_id, endpoint_id)
        REFERENCES shared_webhook_endpoints(tenant_id, id),
      CONSTRAINT shared_webhook_delivery_hash_check CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
      CONSTRAINT shared_webhook_delivery_status_check CHECK (status IN ('pending','processing','retry','delivered','recorded','disabled','dead_letter','cancelled')),
      CONSTRAINT shared_webhook_delivery_attempts_check CHECK (attempt_count >= 0 AND max_attempts BETWEEN 1 AND 20),
      CONSTRAINT uq_shared_webhook_delivery UNIQUE (tenant_id, module_id, endpoint_id, idempotency_key),
      CONSTRAINT uq_shared_webhook_delivery_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_shared_webhook_delivery_claim
      ON shared_webhook_deliveries(status, available_at, lease_expires_at);

    CREATE TABLE IF NOT EXISTS shared_schedules (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      module_id VARCHAR(36) NOT NULL REFERENCES modules(id),
      name VARCHAR(120) NOT NULL,
      handler_key VARCHAR(160) NOT NULL,
      payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      interval_seconds INTEGER NOT NULL,
      next_run_at TIMESTAMPTZ NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      last_enqueued_at TIMESTAMPTZ,
      last_error_code VARCHAR(120),
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT shared_schedule_interval_check CHECK (interval_seconds BETWEEN 60 AND 2592000),
      CONSTRAINT uq_shared_schedule_name UNIQUE (tenant_id, module_id, name),
      CONSTRAINT uq_shared_schedule_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_shared_schedules_due
      ON shared_schedules(enabled, next_run_at);

    CREATE TABLE IF NOT EXISTS shared_exports (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      module_id VARCHAR(36) NOT NULL REFERENCES modules(id),
      requested_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      export_type VARCHAR(120) NOT NULL,
      format TEXT NOT NULL,
      filters_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'pending',
      job_id VARCHAR(36),
      result_attachment_id VARCHAR(36),
      idempotency_key VARCHAR(200) NOT NULL,
      last_error_code VARCHAR(120),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      CONSTRAINT shared_export_format_check CHECK (format IN ('json','csv')),
      CONSTRAINT shared_export_status_check CHECK (status IN ('pending','processing','retry','completed','dead_letter','cancelled')),
      CONSTRAINT shared_export_job_fk FOREIGN KEY (tenant_id, job_id) REFERENCES shared_jobs(tenant_id, id),
      CONSTRAINT shared_export_attachment_fk FOREIGN KEY (tenant_id, result_attachment_id) REFERENCES shared_attachments(tenant_id, id),
      CONSTRAINT uq_shared_export_idempotency UNIQUE (tenant_id, module_id, export_type, idempotency_key),
      CONSTRAINT uq_shared_export_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_shared_exports_tenant
      ON shared_exports(tenant_id, module_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS shared_service_identities (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      module_id VARCHAR(36) REFERENCES modules(id),
      name VARCHAR(120) NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMPTZ,
      CONSTRAINT shared_identity_status_check CHECK (status IN ('active','revoked')),
      CONSTRAINT uq_shared_identity_name UNIQUE (tenant_id, name),
      CONSTRAINT uq_shared_identity_tenant_id UNIQUE (tenant_id, id)
    );

    CREATE TABLE IF NOT EXISTS shared_api_tokens (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      service_identity_id VARCHAR(36) NOT NULL,
      name VARCHAR(120) NOT NULL,
      token_prefix VARCHAR(20) NOT NULL,
      token_hash CHAR(64) NOT NULL,
      scopes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      last_used_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      CONSTRAINT shared_api_token_identity_fk FOREIGN KEY (tenant_id, service_identity_id)
        REFERENCES shared_service_identities(tenant_id, id),
      CONSTRAINT shared_api_token_hash_check CHECK (token_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT uq_shared_api_token_hash UNIQUE (token_hash),
      CONSTRAINT uq_shared_api_token_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_shared_api_tokens_identity
      ON shared_api_tokens(tenant_id, service_identity_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS shared_feature_flags (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      module_id VARCHAR(36) REFERENCES modules(id),
      scope_key VARCHAR(80) NOT NULL,
      flag_key VARCHAR(160) NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      source VARCHAR(80) NOT NULL DEFAULT 'tenant_admin',
      updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT shared_flag_scope_check CHECK (scope_key = 'tenant' OR scope_key ~ '^module:[0-9a-f-]{36}$'),
      CONSTRAINT uq_shared_flag UNIQUE (tenant_id, scope_key, flag_key),
      CONSTRAINT uq_shared_flag_tenant_id UNIQUE (tenant_id, id)
    );

    CREATE TABLE IF NOT EXISTS shared_search_documents (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      module_id VARCHAR(36) NOT NULL REFERENCES modules(id),
      object_type VARCHAR(80) NOT NULL,
      object_id VARCHAR(128) NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      deep_link TEXT NOT NULL,
      search_text TEXT NOT NULL,
      provenance_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ,
      CONSTRAINT shared_search_deep_link_check CHECK (deep_link LIKE '/%'),
      CONSTRAINT uq_shared_search_object UNIQUE (tenant_id, module_id, object_type, object_id),
      CONSTRAINT uq_shared_search_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_shared_search_tenant
      ON shared_search_documents(tenant_id, updated_at DESC) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS shared_legacy_references (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      module_id VARCHAR(36) NOT NULL REFERENCES modules(id),
      source_system VARCHAR(120) NOT NULL,
      source_type VARCHAR(80) NOT NULL,
      source_id VARCHAR(200) NOT NULL,
      target_type VARCHAR(80) NOT NULL,
      target_id VARCHAR(200) NOT NULL,
      provenance_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_shared_legacy_source UNIQUE (tenant_id, module_id, source_system, source_type, source_id),
      CONSTRAINT uq_shared_legacy_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_shared_legacy_target
      ON shared_legacy_references(tenant_id, module_id, target_type, target_id);

    CREATE TABLE IF NOT EXISTS shared_download_grants (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      module_id VARCHAR(36) NOT NULL REFERENCES modules(id),
      attachment_id VARCHAR(36) NOT NULL,
      token_hash CHAR(64) NOT NULL,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      expires_at TIMESTAMPTZ NOT NULL,
      max_uses INTEGER NOT NULL DEFAULT 1,
      use_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMPTZ,
      CONSTRAINT shared_download_attachment_fk FOREIGN KEY (tenant_id, attachment_id)
        REFERENCES shared_attachments(tenant_id, id),
      CONSTRAINT shared_download_hash_check CHECK (token_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT shared_download_use_check CHECK (max_uses BETWEEN 1 AND 20 AND use_count BETWEEN 0 AND max_uses),
      CONSTRAINT uq_shared_download_hash UNIQUE (token_hash),
      CONSTRAINT uq_shared_download_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_shared_download_expiry ON shared_download_grants(expires_at);
  `));
}
