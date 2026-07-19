import { sql } from 'drizzle-orm';
import { db } from '../db.js';

/** Additive, idempotent Phase 3 shared-service schema. */
export async function ensureSharedServiceTables(): Promise<void> {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS shared_attachments (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      module_id VARCHAR(36) NOT NULL REFERENCES modules(id),
      object_type VARCHAR(80) NOT NULL,
      object_id VARCHAR(128) NOT NULL,
      original_name TEXT NOT NULL,
      storage_adapter TEXT NOT NULL DEFAULT 'postgres',
      storage_key TEXT NOT NULL UNIQUE,
      size_bytes BIGINT NOT NULL,
      declared_mime_type TEXT,
      detected_mime_type TEXT NOT NULL,
      sha256 CHAR(64) NOT NULL,
      scan_status TEXT NOT NULL DEFAULT 'pending',
      retention_until TIMESTAMP,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      deleted_by_user_id VARCHAR(36) REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMP,
      blob_purged_at TIMESTAMP,
      CONSTRAINT shared_attachment_object_type_check CHECK (length(object_type) BETWEEN 1 AND 80),
      CONSTRAINT shared_attachment_object_id_check CHECK (length(object_id) BETWEEN 1 AND 128),
      CONSTRAINT shared_attachment_size_check CHECK (size_bytes > 0 AND size_bytes <= 26214400),
      CONSTRAINT shared_attachment_sha256_check CHECK (sha256 ~ '^[0-9a-f]{64}$'),
      CONSTRAINT shared_attachment_scan_check CHECK (scan_status IN ('pending','clean','unavailable','infected','error')),
      CONSTRAINT shared_attachment_adapter_check CHECK (storage_adapter IN ('postgres')),
      CONSTRAINT uq_shared_attachment_tenant_id UNIQUE (tenant_id, id)
    );
    ALTER TABLE shared_attachments
      ADD COLUMN IF NOT EXISTS blob_purged_at TIMESTAMP;
    CREATE INDEX IF NOT EXISTS idx_shared_attachments_object
      ON shared_attachments(tenant_id, module_id, object_type, object_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_shared_attachments_retention
      ON shared_attachments(retention_until) WHERE deleted_at IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_shared_attachments_retention_purge
      ON shared_attachments(retention_until, id)
      WHERE deleted_at IS NOT NULL AND blob_purged_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_shared_attachments_scan
      ON shared_attachments(scan_status, created_at) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS shared_attachment_blobs (
      attachment_id VARCHAR(36) PRIMARY KEY,
      tenant_id VARCHAR(36) NOT NULL,
      content BYTEA NOT NULL,
      content_length BIGINT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT shared_attachment_blob_fk FOREIGN KEY (tenant_id, attachment_id)
        REFERENCES shared_attachments(tenant_id, id),
      CONSTRAINT shared_attachment_blob_size_check CHECK (content_length > 0 AND content_length <= 26214400)
    );
    CREATE INDEX IF NOT EXISTS idx_shared_attachment_blobs_tenant
      ON shared_attachment_blobs(tenant_id, attachment_id);

    CREATE TABLE IF NOT EXISTS shared_notification_templates (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      module_id VARCHAR(36) NOT NULL REFERENCES modules(id),
      template_key VARCHAR(120) NOT NULL,
      channel TEXT NOT NULL,
      name TEXT NOT NULL,
      subject_template TEXT,
      body_template TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      archived_at TIMESTAMP,
      CONSTRAINT shared_notification_template_channel_check CHECK (channel IN ('email','sms','in_app')),
      CONSTRAINT uq_shared_notification_template_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_shared_notification_templates_active
      ON shared_notification_templates(tenant_id, module_id, template_key, channel)
      WHERE archived_at IS NULL;

    CREATE TABLE IF NOT EXISTS shared_outbox_messages (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      module_id VARCHAR(36) NOT NULL REFERENCES modules(id),
      requested_by_user_id VARCHAR(36) REFERENCES users(id),
      recipient_user_id VARCHAR(36) REFERENCES users(id),
      channel TEXT NOT NULL,
      destination TEXT,
      template_key VARCHAR(120),
      subject TEXT,
      body TEXT NOT NULL,
      context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'pending',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      available_at TIMESTAMP NOT NULL DEFAULT NOW(),
      lease_owner VARCHAR(120),
      lease_expires_at TIMESTAMP,
      provider_name TEXT,
      provider_message_id TEXT,
      idempotency_key VARCHAR(200) NOT NULL,
      correlation_id VARCHAR(120),
      last_error_code VARCHAR(120),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      delivered_at TIMESTAMP,
      CONSTRAINT shared_outbox_channel_check CHECK (channel IN ('email','sms','in_app')),
      CONSTRAINT shared_outbox_status_check CHECK (status IN ('pending','processing','retry','delivered','disabled','dead_letter','cancelled')),
      CONSTRAINT shared_outbox_attempts_check CHECK (attempt_count >= 0 AND max_attempts BETWEEN 1 AND 20),
      CONSTRAINT shared_outbox_destination_check CHECK (
        (channel = 'in_app' AND recipient_user_id IS NOT NULL) OR
        (channel IN ('email','sms') AND destination IS NOT NULL)
      ),
      CONSTRAINT uq_shared_outbox_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_shared_outbox_idempotency UNIQUE (tenant_id, module_id, idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS idx_shared_outbox_claim
      ON shared_outbox_messages(status, available_at, lease_expires_at);
    CREATE INDEX IF NOT EXISTS idx_shared_outbox_tenant_created
      ON shared_outbox_messages(tenant_id, module_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS shared_notifications (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      module_id VARCHAR(36) NOT NULL REFERENCES modules(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      outbox_id VARCHAR(36),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'info',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      read_at TIMESTAMP,
      CONSTRAINT shared_notification_level_check CHECK (level IN ('info','success','warning','error')),
      CONSTRAINT shared_notification_outbox_fk FOREIGN KEY (tenant_id, outbox_id)
        REFERENCES shared_outbox_messages(tenant_id, id),
      CONSTRAINT uq_shared_notification_outbox UNIQUE (outbox_id),
      CONSTRAINT uq_shared_notification_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_shared_notifications_user_created
      ON shared_notifications(tenant_id, module_id, user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_shared_notifications_unread
      ON shared_notifications(tenant_id, user_id, created_at DESC) WHERE read_at IS NULL;

    CREATE TABLE IF NOT EXISTS shared_jobs (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      module_id VARCHAR(36) NOT NULL REFERENCES modules(id),
      requested_by_user_id VARCHAR(36) REFERENCES users(id),
      handler_key VARCHAR(160) NOT NULL,
      payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'pending',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      run_at TIMESTAMP NOT NULL DEFAULT NOW(),
      lease_owner VARCHAR(120),
      lease_expires_at TIMESTAMP,
      idempotency_key VARCHAR(200) NOT NULL,
      correlation_id VARCHAR(120),
      last_error_code VARCHAR(120),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMP,
      CONSTRAINT shared_job_status_check CHECK (status IN ('pending','processing','retry','completed','dead_letter','cancelled')),
      CONSTRAINT shared_job_attempts_check CHECK (attempt_count >= 0 AND max_attempts BETWEEN 1 AND 20),
      CONSTRAINT uq_shared_job_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_shared_job_idempotency UNIQUE (tenant_id, module_id, handler_key, idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS idx_shared_jobs_claim
      ON shared_jobs(status, run_at, lease_expires_at);
    CREATE INDEX IF NOT EXISTS idx_shared_jobs_tenant_created
      ON shared_jobs(tenant_id, module_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS shared_webhook_receipts (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      module_id VARCHAR(36) NOT NULL REFERENCES modules(id),
      provider VARCHAR(80) NOT NULL,
      provider_event_id VARCHAR(200) NOT NULL,
      event_type VARCHAR(160) NOT NULL,
      handler_key VARCHAR(160) NOT NULL,
      payload_sha256 CHAR(64) NOT NULL,
      safe_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      signature_verified BOOLEAN NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      next_attempt_at TIMESTAMP NOT NULL DEFAULT NOW(),
      lease_owner VARCHAR(120),
      lease_expires_at TIMESTAMP,
      correlation_id VARCHAR(120),
      last_error_code VARCHAR(120),
      received_at TIMESTAMP NOT NULL DEFAULT NOW(),
      processed_at TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT shared_webhook_hash_check CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
      CONSTRAINT shared_webhook_signature_check CHECK (signature_verified IS TRUE),
      CONSTRAINT shared_webhook_status_check CHECK (status IN ('pending','processing','retry','processed','dead_letter')),
      CONSTRAINT shared_webhook_attempts_check CHECK (attempt_count >= 0 AND max_attempts BETWEEN 1 AND 20),
      CONSTRAINT uq_shared_webhook_provider_event UNIQUE (provider, provider_event_id),
      CONSTRAINT uq_shared_webhook_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_shared_webhooks_claim
      ON shared_webhook_receipts(status, next_attempt_at, lease_expires_at);
    CREATE INDEX IF NOT EXISTS idx_shared_webhooks_tenant_received
      ON shared_webhook_receipts(tenant_id, module_id, received_at DESC);

    CREATE TABLE IF NOT EXISTS shared_usage_events (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      module_id VARCHAR(36) NOT NULL REFERENCES modules(id),
      user_id VARCHAR(36) REFERENCES users(id),
      operation VARCHAR(160) NOT NULL,
      units BIGINT NOT NULL,
      unit_kind VARCHAR(80) NOT NULL,
      idempotency_key VARCHAR(200) NOT NULL,
      external_reference VARCHAR(200),
      metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      occurred_at TIMESTAMP NOT NULL DEFAULT NOW(),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT shared_usage_units_check CHECK (units > 0),
      CONSTRAINT uq_shared_usage_idempotency UNIQUE (tenant_id, module_id, operation, idempotency_key),
      CONSTRAINT uq_shared_usage_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_shared_usage_tenant_operation
      ON shared_usage_events(tenant_id, module_id, operation, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_shared_usage_user
      ON shared_usage_events(tenant_id, user_id, occurred_at DESC);

    CREATE TABLE IF NOT EXISTS shared_activity_events (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      module_id VARCHAR(36) NOT NULL REFERENCES modules(id),
      actor_user_id VARCHAR(36) REFERENCES users(id),
      object_type VARCHAR(80) NOT NULL,
      object_id VARCHAR(128) NOT NULL,
      event_type VARCHAR(160) NOT NULL,
      summary TEXT NOT NULL,
      metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      correlation_id VARCHAR(120),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT shared_activity_object_type_check CHECK (length(object_type) BETWEEN 1 AND 80),
      CONSTRAINT shared_activity_object_id_check CHECK (length(object_id) BETWEEN 1 AND 128),
      CONSTRAINT shared_activity_summary_check CHECK (length(summary) BETWEEN 1 AND 500),
      CONSTRAINT uq_shared_activity_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_shared_activity_object
      ON shared_activity_events(tenant_id, module_id, object_type, object_id, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_shared_activity_tenant
      ON shared_activity_events(tenant_id, module_id, created_at DESC, id DESC);

    CREATE TABLE IF NOT EXISTS shared_idempotency_keys (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      module_id VARCHAR(36) NOT NULL REFERENCES modules(id),
      scope VARCHAR(160) NOT NULL,
      idempotency_key VARCHAR(200) NOT NULL,
      request_sha256 CHAR(64) NOT NULL,
      status TEXT NOT NULL DEFAULT 'processing',
      response_status INTEGER,
      response_json JSONB,
      locked_until TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMP,
      CONSTRAINT shared_idempotency_hash_check CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
      CONSTRAINT shared_idempotency_status_check CHECK (status IN ('processing','completed','failed')),
      CONSTRAINT shared_idempotency_response_check CHECK (response_status IS NULL OR response_status BETWEEN 100 AND 599),
      CONSTRAINT uq_shared_idempotency_key UNIQUE (tenant_id, module_id, scope, idempotency_key),
      CONSTRAINT uq_shared_idempotency_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_shared_idempotency_expiry
      ON shared_idempotency_keys(status, locked_until);
  `));
}
