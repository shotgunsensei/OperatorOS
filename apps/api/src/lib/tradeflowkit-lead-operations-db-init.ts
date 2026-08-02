import { sql } from 'drizzle-orm';
import { db } from '../db.js';

/**
 * Release v31: additive TradeFlowKit lead-operations state.
 *
 * Anonymous intake stays disabled. These tables support authenticated tenant
 * configuration, manually actioned follow-ups, and sanitized adapter events.
 * Rollback retains the data and follows the repository-wide restore-to-new-
 * database procedure.
 */
export async function ensureTradeFlowKitLeadOperationsTables(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS tradeflowkit_lead_settings (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      updated_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      follow_up_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      auto_respond BOOLEAN NOT NULL DEFAULT FALSE,
      dry_run BOOLEAN NOT NULL DEFAULT TRUE,
      email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      sms_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      trade_template VARCHAR(60) NOT NULL DEFAULT 'general_contractor',
      service_area TEXT,
      email_template TEXT NOT NULL DEFAULT 'Hi {name}, thanks for reaching out about {service}. We received your request and will follow up shortly.',
      sms_template TEXT NOT NULL DEFAULT 'Hi {name}, we received your request about {service}. Reply STOP to opt out.',
      followup_sequence JSONB NOT NULL DEFAULT '[]'::jsonb,
      lead_sources JSONB NOT NULL DEFAULT '["manual"]'::jsonb,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_tfk_lead_settings_tenant UNIQUE (tenant_id),
      CONSTRAINT uq_tfk_lead_settings_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT tfk_lead_settings_auto_respond_check CHECK (auto_respond = FALSE),
      CONSTRAINT tfk_lead_settings_template_check CHECK (char_length(trade_template) BETWEEN 1 AND 60),
      CONSTRAINT tfk_lead_settings_service_area_check CHECK (service_area IS NULL OR char_length(service_area) <= 500),
      CONSTRAINT tfk_lead_settings_email_check CHECK (char_length(email_template) BETWEEN 1 AND 4000),
      CONSTRAINT tfk_lead_settings_sms_check CHECK (char_length(sms_template) BETWEEN 1 AND 1000),
      CONSTRAINT tfk_lead_settings_sequence_check CHECK (jsonb_typeof(followup_sequence) = 'array' AND pg_column_size(followup_sequence) <= 8192),
      CONSTRAINT tfk_lead_settings_sources_check CHECK (jsonb_typeof(lead_sources) = 'array' AND pg_column_size(lead_sources) <= 4096),
      CONSTRAINT tfk_lead_settings_version_check CHECK (version >= 1)
    );

    CREATE TABLE IF NOT EXISTS tradeflowkit_lead_capture_forms (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      updated_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      name VARCHAR(120) NOT NULL DEFAULT 'Lead capture profile',
      source_label VARCHAR(80) NOT NULL DEFAULT 'website',
      default_service VARCHAR(160),
      success_message VARCHAR(500) NOT NULL DEFAULT 'Thanks. Your request has been received.',
      public_intake_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_tfk_lead_capture_tenant UNIQUE (tenant_id),
      CONSTRAINT uq_tfk_lead_capture_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT tfk_lead_capture_public_check CHECK (public_intake_enabled = FALSE),
      CONSTRAINT tfk_lead_capture_name_check CHECK (char_length(name) BETWEEN 1 AND 120),
      CONSTRAINT tfk_lead_capture_source_check CHECK (char_length(source_label) BETWEEN 1 AND 80),
      CONSTRAINT tfk_lead_capture_service_check CHECK (default_service IS NULL OR char_length(default_service) <= 160),
      CONSTRAINT tfk_lead_capture_message_check CHECK (char_length(success_message) BETWEEN 1 AND 500),
      CONSTRAINT tfk_lead_capture_version_check CHECK (version >= 1)
    );

    CREATE TABLE IF NOT EXISTS tradeflowkit_lead_followups (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      lead_id VARCHAR(36) NOT NULL,
      step_number INTEGER NOT NULL,
      channel TEXT NOT NULL,
      due_at TIMESTAMP NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      message_template TEXT NOT NULL,
      outbox_idempotency_key VARCHAR(160),
      last_attempt_at TIMESTAMP,
      completed_at TIMESTAMP,
      error_code VARCHAR(80),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_tfk_lead_followups_step UNIQUE (tenant_id, lead_id, step_number),
      CONSTRAINT uq_tfk_lead_followups_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT tfk_lead_followups_lead_fk FOREIGN KEY (tenant_id, lead_id)
        REFERENCES tradeflowkit_leads(tenant_id, id) ON DELETE CASCADE,
      CONSTRAINT tfk_lead_followups_step_check CHECK (step_number BETWEEN 1 AND 20),
      CONSTRAINT tfk_lead_followups_channel_check CHECK (channel IN ('email','sms')),
      CONSTRAINT tfk_lead_followups_status_check CHECK (status IN ('pending','queued','completed','canceled','skipped','failed')),
      CONSTRAINT tfk_lead_followups_template_check CHECK (char_length(message_template) BETWEEN 1 AND 4000),
      CONSTRAINT tfk_lead_followups_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_tfk_lead_followups_due
      ON tradeflowkit_lead_followups(tenant_id, status, due_at);
    CREATE INDEX IF NOT EXISTS idx_tfk_lead_followups_lead
      ON tradeflowkit_lead_followups(tenant_id, lead_id, step_number);

    CREATE TABLE IF NOT EXISTS tradeflowkit_lead_source_events (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      lead_id VARCHAR(36),
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      adapter_key VARCHAR(40) NOT NULL,
      event_type TEXT NOT NULL,
      status TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT tfk_lead_source_events_lead_fk FOREIGN KEY (tenant_id, lead_id)
        REFERENCES tradeflowkit_leads(tenant_id, id),
      CONSTRAINT tfk_lead_source_events_adapter_check CHECK (char_length(adapter_key) BETWEEN 1 AND 40),
      CONSTRAINT tfk_lead_source_events_type_check CHECK (event_type IN ('validation','configuration')),
      CONSTRAINT tfk_lead_source_events_status_check CHECK (status IN ('validated','configured','rejected')),
      CONSTRAINT tfk_lead_source_events_metadata_check CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 4096)
    );
    CREATE INDEX IF NOT EXISTS idx_tfk_lead_source_events_created
      ON tradeflowkit_lead_source_events(tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tfk_lead_source_events_adapter
      ON tradeflowkit_lead_source_events(tenant_id, adapter_key, created_at DESC);
  `);
}
