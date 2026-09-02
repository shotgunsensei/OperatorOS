import { sql } from 'drizzle-orm';
import { db } from '../db.js';

/** Release v57 additive CallCommand commercial/runtime authority. */
export async function ensureCallCommandCommercialTables(): Promise<void> {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS callcommand_tenant_runtime_settings (
      tenant_id VARCHAR(36) PRIMARY KEY REFERENCES tenants(id),
      overflow_policy VARCHAR(24) NOT NULL DEFAULT 'refuse',
      overflow_forward_target_id VARCHAR(36),
      default_lease_seconds INTEGER NOT NULL DEFAULT 900,
      maximum_lease_seconds INTEGER NOT NULL DEFAULT 14400,
      realtime_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      realtime_health_status VARCHAR(24) NOT NULL DEFAULT 'unknown',
      realtime_last_connected_at TIMESTAMPTZ,
      realtime_last_error_code VARCHAR(120),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT callcommand_runtime_overflow_check CHECK (overflow_policy IN ('refuse','voicemail','forward','queue')),
      CONSTRAINT callcommand_runtime_lease_check CHECK (
        default_lease_seconds BETWEEN 30 AND 14400
        AND maximum_lease_seconds BETWEEN default_lease_seconds AND 86400
      ),
      CONSTRAINT callcommand_runtime_realtime_health_check
        CHECK (realtime_health_status IN ('unknown','healthy','degraded','unavailable')),
      CONSTRAINT callcommand_runtime_version_check CHECK (version >= 1),
      CONSTRAINT callcommand_runtime_forward_target_fk FOREIGN KEY (tenant_id,overflow_forward_target_id)
        REFERENCES callcommand_transfer_targets(tenant_id,id)
    );
    ALTER TABLE callcommand_tenant_runtime_settings
      ADD COLUMN IF NOT EXISTS realtime_health_status VARCHAR(24) NOT NULL DEFAULT 'unknown',
      ADD COLUMN IF NOT EXISTS realtime_last_connected_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS realtime_last_error_code VARCHAR(120);
    ALTER TABLE callcommand_tenant_runtime_settings
      DROP CONSTRAINT IF EXISTS callcommand_runtime_realtime_health_check;
    ALTER TABLE callcommand_tenant_runtime_settings
      ADD CONSTRAINT callcommand_runtime_realtime_health_check
        CHECK (realtime_health_status IN ('unknown','healthy','degraded','unavailable'));

    CREATE TABLE IF NOT EXISTS callcommand_telephony_accounts (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      provider VARCHAR(32) NOT NULL DEFAULT 'twilio',
      account_mode VARCHAR(24) NOT NULL DEFAULT 'platform',
      provider_account_sid VARCHAR(120),
      secret_reference_id VARCHAR(36),
      status VARCHAR(24) NOT NULL DEFAULT 'pending',
      health_status VARCHAR(24) NOT NULL DEFAULT 'unknown',
      health_reason_code VARCHAR(120),
      last_health_at TIMESTAMPTZ,
      verified_at TIMESTAMPTZ,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      archived_at TIMESTAMPTZ,
      CONSTRAINT uq_callcommand_telephony_account_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT callcommand_telephony_provider_check CHECK (provider IN ('twilio')),
      CONSTRAINT callcommand_telephony_mode_check CHECK (account_mode IN ('platform','byon')),
      CONSTRAINT callcommand_telephony_status_check CHECK (status IN ('pending','active','degraded','disabled','revoked')),
      CONSTRAINT callcommand_telephony_health_check CHECK (health_status IN ('unknown','healthy','degraded','unavailable')),
      CONSTRAINT callcommand_telephony_secret_fk FOREIGN KEY (tenant_id,secret_reference_id)
        REFERENCES shared_secret_references(tenant_id,id),
      CONSTRAINT callcommand_telephony_version_check CHECK (version >= 1)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_callcommand_telephony_provider_account
      ON callcommand_telephony_accounts(provider,provider_account_sid)
      WHERE provider_account_sid IS NOT NULL AND archived_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_callcommand_telephony_account_health
      ON callcommand_telephony_accounts(tenant_id,status,health_status,updated_at DESC) WHERE archived_at IS NULL;

    ALTER TABLE callcommand_channels
      ADD COLUMN IF NOT EXISTS telephony_account_id VARCHAR(36),
      ADD COLUMN IF NOT EXISTS acquisition_mode VARCHAR(32) NOT NULL DEFAULT 'manual',
      ADD COLUMN IF NOT EXISTS connection_type VARCHAR(24),
      ADD COLUMN IF NOT EXISTS provider_number_sid VARCHAR(120),
      ADD COLUMN IF NOT EXISTS provider_number_status VARCHAR(24) NOT NULL DEFAULT 'unconfigured',
      ADD COLUMN IF NOT EXISTS routing_mode VARCHAR(24) NOT NULL DEFAULT 'general',
      ADD COLUMN IF NOT EXISTS provisioning_status VARCHAR(24) NOT NULL DEFAULT 'manual',
      ADD COLUMN IF NOT EXISTS health_status VARCHAR(24) NOT NULL DEFAULT 'unknown',
      ADD COLUMN IF NOT EXISTS health_reason_code VARCHAR(120),
      ADD COLUMN IF NOT EXISTS health_checked_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS provider_verified_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS provider_config_version INTEGER NOT NULL DEFAULT 1;
    UPDATE callcommand_channels SET connection_type=CASE health_reason_code
      WHEN 'BYON_FORWARDING_SETUP_REQUIRED' THEN 'forwarding'
      WHEN 'BYON_TWILIO_TRANSFER_SETUP_REQUIRED' THEN 'twilio_transfer'
      WHEN 'BYON_SIP_SETUP_REQUIRED' THEN 'sip'
      WHEN 'BYON_PORT_SETUP_REQUIRED' THEN 'port'
      ELSE connection_type END
      WHERE connection_type IS NULL AND acquisition_mode='byon';
    ALTER TABLE callcommand_channels DROP CONSTRAINT IF EXISTS callcommand_channel_telephony_account_fk;
    ALTER TABLE callcommand_channels ADD CONSTRAINT callcommand_channel_telephony_account_fk
      FOREIGN KEY (tenant_id,telephony_account_id) REFERENCES callcommand_telephony_accounts(tenant_id,id);
    ALTER TABLE callcommand_channels DROP CONSTRAINT IF EXISTS callcommand_channel_acquisition_check;
    ALTER TABLE callcommand_channels ADD CONSTRAINT callcommand_channel_acquisition_check
      CHECK (acquisition_mode IN ('manual','platform_provisioned','byon'));
    ALTER TABLE callcommand_channels DROP CONSTRAINT IF EXISTS callcommand_channel_connection_type_check;
    ALTER TABLE callcommand_channels ADD CONSTRAINT callcommand_channel_connection_type_check
      CHECK (connection_type IS NULL OR connection_type IN ('forwarding','twilio_transfer','sip','port'));
    ALTER TABLE callcommand_channels DROP CONSTRAINT IF EXISTS callcommand_channel_provider_number_status_check;
    ALTER TABLE callcommand_channels ADD CONSTRAINT callcommand_channel_provider_number_status_check
      CHECK (provider_number_status IN ('unconfigured','pending','active','failed','released'));
    ALTER TABLE callcommand_channels DROP CONSTRAINT IF EXISTS callcommand_channel_routing_mode_check;
    ALTER TABLE callcommand_channels ADD CONSTRAINT callcommand_channel_routing_mode_check CHECK (routing_mode IN ('general','msp','legacy'));
    ALTER TABLE callcommand_channels DROP CONSTRAINT IF EXISTS callcommand_channel_provisioning_status_check;
    ALTER TABLE callcommand_channels ADD CONSTRAINT callcommand_channel_provisioning_status_check
      CHECK (provisioning_status IN ('manual','pending','provisioning','configured','failed','releasing','released'));
    ALTER TABLE callcommand_channels DROP CONSTRAINT IF EXISTS callcommand_channel_health_status_check;
    ALTER TABLE callcommand_channels ADD CONSTRAINT callcommand_channel_health_status_check
      CHECK (health_status IN ('unknown','healthy','degraded','unavailable'));
    CREATE UNIQUE INDEX IF NOT EXISTS uq_callcommand_channel_provider_number_sid
      ON callcommand_channels(provider_number_sid) WHERE provider_number_sid IS NOT NULL AND deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_callcommand_channel_provider_health
      ON callcommand_channels(tenant_id,telephony_account_id,health_status,updated_at DESC) WHERE deleted_at IS NULL;

    ALTER TABLE callcommand_profiles
      ADD COLUMN IF NOT EXISTS business_name VARCHAR(160) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS department_name VARCHAR(120),
      ADD COLUMN IF NOT EXISTS voice_id VARCHAR(120),
      ADD COLUMN IF NOT EXISTS personality VARCHAR(80) NOT NULL DEFAULT 'professional',
      ADD COLUMN IF NOT EXISTS agent_purpose TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS business_description TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS faqs JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS business_hours_config JSONB NOT NULL DEFAULT '{"always":true}'::jsonb,
      ADD COLUMN IF NOT EXISTS holiday_schedule JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS primary_language VARCHAR(32) NOT NULL DEFAULT 'en-US',
      ADD COLUMN IF NOT EXISTS additional_languages JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS fallback_behavior VARCHAR(32) NOT NULL DEFAULT 'voicemail',
      ADD COLUMN IF NOT EXISTS voicemail_greeting TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS after_hours_instructions TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS data_permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS recording_policy VARCHAR(32) NOT NULL DEFAULT 'consent_required',
      ADD COLUMN IF NOT EXISTS transcription_policy VARCHAR(32) NOT NULL DEFAULT 'consent_required',
      ADD COLUMN IF NOT EXISTS retention_days INTEGER NOT NULL DEFAULT 30,
      ADD COLUMN IF NOT EXISTS advanced_prompt TEXT NOT NULL DEFAULT '';
    ALTER TABLE callcommand_profiles DROP CONSTRAINT IF EXISTS callcommand_profile_business_config_check;
    ALTER TABLE callcommand_profiles ADD CONSTRAINT callcommand_profile_business_config_check CHECK (
      jsonb_typeof(faqs)='array' AND jsonb_array_length(faqs) <= 100
      AND jsonb_typeof(business_hours_config)='object'
      AND jsonb_typeof(holiday_schedule)='array' AND jsonb_array_length(holiday_schedule) <= 100
      AND jsonb_typeof(additional_languages)='array' AND jsonb_array_length(additional_languages) <= 20
      AND jsonb_typeof(data_permissions)='object'
    );
    ALTER TABLE callcommand_profiles DROP CONSTRAINT IF EXISTS callcommand_profile_fallback_check;
    ALTER TABLE callcommand_profiles ADD CONSTRAINT callcommand_profile_fallback_check
      CHECK (fallback_behavior IN ('voicemail','transfer','callback','end_call'));
    ALTER TABLE callcommand_profiles DROP CONSTRAINT IF EXISTS callcommand_profile_recording_policy_check;
    ALTER TABLE callcommand_profiles ADD CONSTRAINT callcommand_profile_recording_policy_check
      CHECK (recording_policy IN ('disabled','consent_required','jurisdiction_policy'));
    ALTER TABLE callcommand_profiles DROP CONSTRAINT IF EXISTS callcommand_profile_transcription_policy_check;
    ALTER TABLE callcommand_profiles ADD CONSTRAINT callcommand_profile_transcription_policy_check
      CHECK (transcription_policy IN ('disabled','consent_required','recording_only'));
    ALTER TABLE callcommand_profiles DROP CONSTRAINT IF EXISTS callcommand_profile_retention_check;
    ALTER TABLE callcommand_profiles ADD CONSTRAINT callcommand_profile_retention_check CHECK (retention_days BETWEEN 1 AND 3650);

    ALTER TABLE callcommand_calls
      ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS answered_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS billable_seconds INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS provider_sequence BIGINT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS provider_outcome VARCHAR(32),
      ADD COLUMN IF NOT EXISTS provider_currency CHAR(3) NOT NULL DEFAULT 'USD',
      ADD COLUMN IF NOT EXISTS telephony_cost_minor BIGINT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS ai_cost_minor BIGINT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_cost_minor BIGINT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS ai_input_tokens BIGINT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS ai_output_tokens BIGINT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS ai_audio_input_seconds INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS ai_audio_output_seconds INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS terminal_event_id VARCHAR(160),
      ADD COLUMN IF NOT EXISTS terminal_reconciled_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS capacity_lease_id VARCHAR(36),
      ADD COLUMN IF NOT EXISTS openai_realtime_call_id VARCHAR(160),
      ADD COLUMN IF NOT EXISTS realtime_status VARCHAR(24) NOT NULL DEFAULT 'disabled',
      ADD COLUMN IF NOT EXISTS realtime_connected_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS realtime_last_event_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS realtime_error_code VARCHAR(120),
      ADD COLUMN IF NOT EXISTS realtime_usage_json JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE callcommand_calls DROP CONSTRAINT IF EXISTS callcommand_call_commercial_usage_check;
    ALTER TABLE callcommand_calls ADD CONSTRAINT callcommand_call_commercial_usage_check CHECK (
      billable_seconds >= 0 AND provider_sequence >= 0
      AND telephony_cost_minor >= 0 AND ai_cost_minor >= 0 AND total_cost_minor >= 0
      AND total_cost_minor = telephony_cost_minor + ai_cost_minor
      AND ai_input_tokens >= 0 AND ai_output_tokens >= 0
      AND ai_audio_input_seconds >= 0 AND ai_audio_output_seconds >= 0
      AND provider_currency ~ '^[A-Z]{3}$'
      AND (ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at)
      AND (answered_at IS NULL OR started_at IS NULL OR answered_at >= started_at)
      AND (ended_at IS NULL OR answered_at IS NULL OR ended_at >= answered_at)
    );
    ALTER TABLE callcommand_calls DROP CONSTRAINT IF EXISTS callcommand_call_provider_outcome_check;
    ALTER TABLE callcommand_calls ADD CONSTRAINT callcommand_call_provider_outcome_check CHECK (
      provider_outcome IS NULL OR provider_outcome IN ('completed','failed','busy','no_answer','canceled','refused','voicemail','transferred')
    );
    ALTER TABLE callcommand_calls DROP CONSTRAINT IF EXISTS callcommand_call_realtime_status_check;
    ALTER TABLE callcommand_calls ADD CONSTRAINT callcommand_call_realtime_status_check CHECK (
      realtime_status IN ('disabled','pending','connecting','connected','completed','failed')
    );
    ALTER TABLE callcommand_calls DROP CONSTRAINT IF EXISTS callcommand_call_realtime_usage_check;
    ALTER TABLE callcommand_calls ADD CONSTRAINT callcommand_call_realtime_usage_check
      CHECK (jsonb_typeof(realtime_usage_json)='object');
    CREATE UNIQUE INDEX IF NOT EXISTS uq_callcommand_call_openai_realtime
      ON callcommand_calls(tenant_id,openai_realtime_call_id)
      WHERE openai_realtime_call_id IS NOT NULL;

    WITH ranked AS (
      SELECT id,ROW_NUMBER() OVER (PARTITION BY tenant_id,call_id ORDER BY started_at,id) AS position
      FROM callcommand_live_sessions WHERE ended_at IS NULL
    )
    UPDATE callcommand_live_sessions AS session
    SET state='failed',ended_at=NOW(),updated_at=NOW(),sequence=sequence+1
    FROM ranked WHERE ranked.id=session.id AND ranked.position > 1;
    WITH ranked AS (
      SELECT id,ROW_NUMBER() OVER (PARTITION BY tenant_id,provider_call_sid ORDER BY started_at,id) AS position
      FROM callcommand_live_sessions WHERE ended_at IS NULL AND provider_call_sid IS NOT NULL
    )
    UPDATE callcommand_live_sessions AS session
    SET state='failed',ended_at=NOW(),updated_at=NOW(),sequence=sequence+1
    FROM ranked WHERE ranked.id=session.id AND ranked.position > 1;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_callcommand_live_session_active_call
      ON callcommand_live_sessions(tenant_id,call_id) WHERE ended_at IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_callcommand_live_session_active_provider
      ON callcommand_live_sessions(tenant_id,provider_call_sid) WHERE ended_at IS NULL AND provider_call_sid IS NOT NULL;

    CREATE TABLE IF NOT EXISTS callcommand_number_orders (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      telephony_account_id VARCHAR(36) NOT NULL,
      requested_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      channel_id VARCHAR(36),
      idempotency_key VARCHAR(200) NOT NULL,
      acquisition_mode VARCHAR(32) NOT NULL,
      country_code CHAR(2) NOT NULL DEFAULT 'US',
      area_code VARCHAR(8),
      requested_capabilities JSONB NOT NULL DEFAULT '["voice"]'::jsonb,
      provider_order_sid VARCHAR(120),
      provider_number_sid VARCHAR(120),
      phone_e164 VARCHAR(16),
      phone_masked VARCHAR(24),
      status VARCHAR(24) NOT NULL DEFAULT 'pending',
      error_code VARCHAR(120),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      failed_at TIMESTAMPTZ,
      CONSTRAINT uq_callcommand_number_order_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT uq_callcommand_number_order_key UNIQUE (tenant_id,idempotency_key),
      CONSTRAINT callcommand_number_order_account_fk FOREIGN KEY (tenant_id,telephony_account_id)
        REFERENCES callcommand_telephony_accounts(tenant_id,id),
      CONSTRAINT callcommand_number_order_channel_fk FOREIGN KEY (tenant_id,channel_id)
        REFERENCES callcommand_channels(tenant_id,id),
      CONSTRAINT callcommand_number_order_acquisition_check CHECK (acquisition_mode IN ('platform_provisioned','byon')),
      CONSTRAINT callcommand_number_order_status_check
        CHECK (status IN ('pending','searching','purchasing','configuring','completed','failed','canceled','released')),
      CONSTRAINT callcommand_number_order_country_check CHECK (country_code ~ '^[A-Z]{2}$'),
      CONSTRAINT callcommand_number_order_capabilities_check
        CHECK (jsonb_typeof(requested_capabilities)='array' AND jsonb_array_length(requested_capabilities) BETWEEN 1 AND 8)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_callcommand_number_order_provider
      ON callcommand_number_orders(provider_order_sid) WHERE provider_order_sid IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_callcommand_number_order_status
      ON callcommand_number_orders(tenant_id,status,created_at DESC);

    CREATE TABLE IF NOT EXISTS callcommand_capacity_entitlements (
      tenant_id VARCHAR(36) PRIMARY KEY REFERENCES tenants(id),
      base_lanes INTEGER NOT NULL DEFAULT 1,
      additional_lanes INTEGER NOT NULL DEFAULT 0,
      pending_additional_lanes INTEGER NOT NULL DEFAULT 0,
      effective_lanes INTEGER GENERATED ALWAYS AS (base_lanes + additional_lanes) STORED,
      billing_status VARCHAR(24) NOT NULL DEFAULT 'inactive',
      stripe_customer_id VARCHAR(160),
      stripe_subscription_id VARCHAR(160),
      stripe_subscription_item_id VARCHAR(160),
      stripe_price_id VARCHAR(160),
      price_lookup_key VARCHAR(160),
      current_period_start TIMESTAMPTZ,
      current_period_end TIMESTAMPTZ,
      last_stripe_event_created BIGINT NOT NULL DEFAULT 0,
      last_billing_event_id VARCHAR(160),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT callcommand_capacity_base_check CHECK (base_lanes BETWEEN 0 AND 100),
      CONSTRAINT callcommand_capacity_additional_check CHECK (additional_lanes BETWEEN 0 AND 100),
      CONSTRAINT callcommand_capacity_pending_check CHECK (pending_additional_lanes BETWEEN 0 AND 100),
      CONSTRAINT callcommand_capacity_effective_check CHECK (effective_lanes BETWEEN 0 AND 200),
      CONSTRAINT callcommand_capacity_billing_status_check
        CHECK (billing_status IN ('inactive','pending','active','past_due','canceled','failed')),
      CONSTRAINT callcommand_capacity_period_check
        CHECK (current_period_end IS NULL OR current_period_start IS NULL OR current_period_end >= current_period_start),
      CONSTRAINT callcommand_capacity_stripe_event_check CHECK (last_stripe_event_created >= 0),
      CONSTRAINT callcommand_capacity_version_check CHECK (version >= 1)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_callcommand_capacity_subscription
      ON callcommand_capacity_entitlements(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_callcommand_capacity_subscription_item
      ON callcommand_capacity_entitlements(stripe_subscription_item_id) WHERE stripe_subscription_item_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS callcommand_lane_leases (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      call_id VARCHAR(36) NOT NULL,
      lane_number INTEGER NOT NULL,
      provider_call_sid VARCHAR(120),
      idempotency_key VARCHAR(200) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      renewed_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ NOT NULL,
      released_at TIMESTAMPTZ,
      expired_at TIMESTAMPTZ,
      release_reason VARCHAR(120),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_callcommand_lane_lease_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT uq_callcommand_lane_lease_call UNIQUE (tenant_id,call_id),
      CONSTRAINT uq_callcommand_lane_lease_key UNIQUE (tenant_id,idempotency_key),
      CONSTRAINT callcommand_lane_lease_call_fk FOREIGN KEY (tenant_id,call_id)
        REFERENCES callcommand_calls(tenant_id,id) ON DELETE CASCADE,
      CONSTRAINT callcommand_lane_number_check CHECK (lane_number BETWEEN 1 AND 200),
      CONSTRAINT callcommand_lane_status_check CHECK (status IN ('active','released','expired')),
      CONSTRAINT callcommand_lane_time_check CHECK (expires_at > acquired_at),
      CONSTRAINT callcommand_lane_terminal_check CHECK (
        (status='active' AND released_at IS NULL AND expired_at IS NULL)
        OR (status='released' AND released_at IS NOT NULL AND expired_at IS NULL)
        OR (status='expired' AND expired_at IS NOT NULL AND released_at IS NULL)
      )
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_callcommand_lane_active_number
      ON callcommand_lane_leases(tenant_id,lane_number) WHERE status='active';
    CREATE UNIQUE INDEX IF NOT EXISTS uq_callcommand_lane_active_provider
      ON callcommand_lane_leases(tenant_id,provider_call_sid) WHERE status='active' AND provider_call_sid IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_callcommand_lane_reaper
      ON callcommand_lane_leases(status,expires_at) WHERE status='active';

    ALTER TABLE callcommand_calls DROP CONSTRAINT IF EXISTS callcommand_call_capacity_lease_fk;
    ALTER TABLE callcommand_calls ADD CONSTRAINT callcommand_call_capacity_lease_fk
      FOREIGN KEY (tenant_id,capacity_lease_id) REFERENCES callcommand_lane_leases(tenant_id,id)
      DEFERRABLE INITIALLY DEFERRED;

    -- Provider-specific Realtime receipt labels are intentionally descriptive
    -- and exceed the original Phase 35 token-source width. This is a widening,
    -- non-destructive compatibility change.
    ALTER TABLE callcommand_ingestion_events ALTER COLUMN source TYPE VARCHAR(48);
    ALTER TABLE callcommand_ingestion_events
      ADD COLUMN IF NOT EXISTS processing_owner VARCHAR(120),
      ADD COLUMN IF NOT EXISTS processing_lease_expires_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE callcommand_ingestion_events DROP CONSTRAINT IF EXISTS callcommand_ingestion_attempts_check;
    ALTER TABLE callcommand_ingestion_events ADD CONSTRAINT callcommand_ingestion_attempts_check CHECK (attempts >= 0);
    CREATE INDEX IF NOT EXISTS idx_callcommand_ingestion_recovery
      ON callcommand_ingestion_events(source,status,processing_lease_expires_at)
      WHERE status IN ('processing','accepting','provider_confirmed','sideband_connecting');

    CREATE TABLE IF NOT EXISTS callcommand_usage_events (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      call_id VARCHAR(36) NOT NULL,
      event_type VARCHAR(80) NOT NULL,
      idempotency_key VARCHAR(200) NOT NULL,
      quantity BIGINT NOT NULL DEFAULT 1,
      unit VARCHAR(40) NOT NULL,
      currency CHAR(3) NOT NULL DEFAULT 'USD',
      provider_cost_minor BIGINT NOT NULL DEFAULT 0,
      ai_cost_minor BIGINT NOT NULL DEFAULT 0,
      total_cost_minor BIGINT NOT NULL DEFAULT 0,
      usage_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      provider_event_id VARCHAR(160),
      occurred_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_callcommand_usage_event_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT uq_callcommand_usage_event_key UNIQUE (tenant_id,idempotency_key),
      CONSTRAINT callcommand_usage_event_call_fk FOREIGN KEY (tenant_id,call_id)
        REFERENCES callcommand_calls(tenant_id,id) ON DELETE CASCADE,
      CONSTRAINT callcommand_usage_quantity_check CHECK (quantity >= 0),
      CONSTRAINT callcommand_usage_cost_check CHECK (
        provider_cost_minor >= 0 AND ai_cost_minor >= 0 AND total_cost_minor = provider_cost_minor + ai_cost_minor
      ),
      CONSTRAINT callcommand_usage_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
      CONSTRAINT callcommand_usage_json_check CHECK (jsonb_typeof(usage_json)='object')
    );
    CREATE INDEX IF NOT EXISTS idx_callcommand_usage_period
      ON callcommand_usage_events(tenant_id,occurred_at DESC,id DESC);
    CREATE INDEX IF NOT EXISTS idx_callcommand_usage_call
      ON callcommand_usage_events(tenant_id,call_id,occurred_at,id);
    CREATE OR REPLACE FUNCTION callcommand_reject_usage_mutation()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP='DELETE' AND current_setting('operatoros.allow_callcommand_usage_delete',true)='on' THEN RETURN OLD; END IF;
      RAISE EXCEPTION 'CallCommand usage events are append-only; write a correcting event' USING ERRCODE='55000';
    END $$;
    DROP TRIGGER IF EXISTS callcommand_usage_events_append_only ON callcommand_usage_events;
    CREATE TRIGGER callcommand_usage_events_append_only BEFORE UPDATE OR DELETE ON callcommand_usage_events
      FOR EACH ROW EXECUTE FUNCTION callcommand_reject_usage_mutation();

    CREATE TABLE IF NOT EXISTS callcommand_agent_knowledge (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      profile_id VARCHAR(36) NOT NULL,
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      updated_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      knowledge_type VARCHAR(24) NOT NULL DEFAULT 'custom',
      title VARCHAR(200) NOT NULL,
      content TEXT NOT NULL,
      source_label VARCHAR(200),
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      priority INTEGER NOT NULL DEFAULT 100,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ,
      CONSTRAINT uq_callcommand_agent_knowledge_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT callcommand_agent_knowledge_profile_fk FOREIGN KEY (tenant_id,profile_id)
        REFERENCES callcommand_profiles(tenant_id,id) ON DELETE CASCADE,
      CONSTRAINT callcommand_agent_knowledge_type_check CHECK (knowledge_type IN ('faq','policy','service','hours','custom')),
      CONSTRAINT callcommand_agent_knowledge_content_check CHECK (char_length(content) BETWEEN 1 AND 12000),
      CONSTRAINT callcommand_agent_knowledge_priority_check CHECK (priority BETWEEN 1 AND 1000),
      CONSTRAINT callcommand_agent_knowledge_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_callcommand_agent_knowledge_active
      ON callcommand_agent_knowledge(tenant_id,profile_id,priority,id) WHERE enabled=TRUE AND deleted_at IS NULL;

    ALTER TABLE callcommand_automation_rules
      ADD COLUMN IF NOT EXISTS managed_key VARCHAR(200);
    ALTER TABLE callcommand_automation_rules DROP CONSTRAINT IF EXISTS callcommand_rule_managed_key_check;
    ALTER TABLE callcommand_automation_rules ADD CONSTRAINT callcommand_rule_managed_key_check
      CHECK (managed_key IS NULL OR managed_key ~ '^[a-z0-9][a-z0-9:_-]{0,199}$');
    CREATE UNIQUE INDEX IF NOT EXISTS uq_callcommand_rule_managed_key
      ON callcommand_automation_rules(tenant_id,managed_key)
      WHERE managed_key IS NOT NULL AND deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS callcommand_transfer_verifications (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      transfer_target_id VARCHAR(36) NOT NULL,
      initiated_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      provider VARCHAR(32) NOT NULL DEFAULT 'twilio_verify',
      verification_channel VARCHAR(16) NOT NULL DEFAULT 'sms',
      destination_fingerprint CHAR(64) NOT NULL,
      destination_last4 CHAR(4) NOT NULL,
      provider_reference VARCHAR(160),
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      approved_at TIMESTAMPTZ,
      failed_at TIMESTAMPTZ,
      canceled_at TIMESTAMPTZ,
      CONSTRAINT uq_callcommand_transfer_verification_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT callcommand_transfer_verification_target_fk FOREIGN KEY (tenant_id,transfer_target_id)
        REFERENCES callcommand_transfer_targets(tenant_id,id) ON DELETE CASCADE,
      CONSTRAINT callcommand_transfer_verification_provider_check CHECK (provider IN ('twilio_verify')),
      CONSTRAINT callcommand_transfer_verification_channel_check CHECK (verification_channel IN ('sms','voice')),
      CONSTRAINT callcommand_transfer_verification_status_check CHECK (status IN ('pending','approved','failed','expired','canceled')),
      CONSTRAINT callcommand_transfer_verification_fingerprint_check CHECK (destination_fingerprint ~ '^[0-9a-f]{64}$'),
      CONSTRAINT callcommand_transfer_verification_last4_check CHECK (destination_last4 ~ '^[0-9]{4}$'),
      CONSTRAINT callcommand_transfer_verification_attempt_check CHECK (attempt_count BETWEEN 0 AND 10),
      CONSTRAINT callcommand_transfer_verification_time_check CHECK (expires_at > created_at),
      CONSTRAINT callcommand_transfer_verification_terminal_check CHECK (
        (status='pending' AND approved_at IS NULL AND failed_at IS NULL AND canceled_at IS NULL)
        OR (status='approved' AND approved_at IS NOT NULL)
        OR (status IN ('failed','expired') AND failed_at IS NOT NULL)
        OR (status='canceled' AND canceled_at IS NOT NULL)
      )
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_callcommand_transfer_verification_pending
      ON callcommand_transfer_verifications(tenant_id,transfer_target_id) WHERE status='pending';
    CREATE INDEX IF NOT EXISTS idx_callcommand_transfer_verification_expiry
      ON callcommand_transfer_verifications(status,expires_at) WHERE status='pending';

    ALTER TABLE callcommand_action_runs
      ADD COLUMN IF NOT EXISTS reservation_status VARCHAR(20) NOT NULL DEFAULT 'unclaimed',
      ADD COLUMN IF NOT EXISTS reserved_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS lease_token_hash CHAR(64),
      ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE callcommand_action_runs DROP CONSTRAINT IF EXISTS callcommand_action_reservation_status_check;
    ALTER TABLE callcommand_action_runs ADD CONSTRAINT callcommand_action_reservation_status_check
      CHECK (reservation_status IN ('unclaimed','claimed','completed','failed'));
    ALTER TABLE callcommand_action_runs DROP CONSTRAINT IF EXISTS callcommand_action_lease_hash_check;
    ALTER TABLE callcommand_action_runs ADD CONSTRAINT callcommand_action_lease_hash_check
      CHECK (lease_token_hash IS NULL OR lease_token_hash ~ '^[0-9a-f]{64}$');
    DO $callcommand_action_tenant_key$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname='uq_callcommand_action_tenant_id'
          AND conrelid='public.callcommand_action_runs'::regclass
          AND contype='u'
      ) THEN
        IF to_regclass('public.uq_callcommand_action_tenant_id') IS NOT NULL THEN
          ALTER TABLE public.callcommand_action_runs
            ADD CONSTRAINT uq_callcommand_action_tenant_id
            UNIQUE USING INDEX uq_callcommand_action_tenant_id;
        ELSE
          ALTER TABLE public.callcommand_action_runs
            ADD CONSTRAINT uq_callcommand_action_tenant_id UNIQUE (tenant_id,id);
        END IF;
      END IF;
    END
    $callcommand_action_tenant_key$;
    CREATE INDEX IF NOT EXISTS idx_callcommand_action_claim
      ON callcommand_action_runs(tenant_id,reservation_status,next_attempt_at,created_at)
      WHERE reservation_status IN ('unclaimed','failed');

    ALTER TABLE callcommand_tickets ADD COLUMN IF NOT EXISTS action_run_id VARCHAR(36);
    ALTER TABLE callcommand_leads ADD COLUMN IF NOT EXISTS action_run_id VARCHAR(36);
    ALTER TABLE callcommand_tasks ADD COLUMN IF NOT EXISTS action_run_id VARCHAR(36);
    ALTER TABLE callcommand_tickets DROP CONSTRAINT IF EXISTS callcommand_ticket_action_run_fk;
    ALTER TABLE callcommand_tickets ADD CONSTRAINT callcommand_ticket_action_run_fk
      FOREIGN KEY (tenant_id,action_run_id) REFERENCES callcommand_action_runs(tenant_id,id);
    ALTER TABLE callcommand_leads DROP CONSTRAINT IF EXISTS callcommand_lead_action_run_fk;
    ALTER TABLE callcommand_leads ADD CONSTRAINT callcommand_lead_action_run_fk
      FOREIGN KEY (tenant_id,action_run_id) REFERENCES callcommand_action_runs(tenant_id,id);
    ALTER TABLE callcommand_tasks DROP CONSTRAINT IF EXISTS callcommand_task_action_run_fk;
    ALTER TABLE callcommand_tasks ADD CONSTRAINT callcommand_task_action_run_fk
      FOREIGN KEY (tenant_id,action_run_id) REFERENCES callcommand_action_runs(tenant_id,id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_callcommand_ticket_action_run
      ON callcommand_tickets(tenant_id,action_run_id) WHERE action_run_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_callcommand_lead_action_run
      ON callcommand_leads(tenant_id,action_run_id) WHERE action_run_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_callcommand_task_action_run
      ON callcommand_tasks(tenant_id,action_run_id) WHERE action_run_id IS NOT NULL;
  `));
}
