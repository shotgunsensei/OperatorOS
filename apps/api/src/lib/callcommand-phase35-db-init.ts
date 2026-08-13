import { sql } from 'drizzle-orm';
import { db } from '../db.js';

/**
 * Phase 35 additive CallCommand product persistence.
 *
 * Existing Phase 11E tables remain the stable call/consent audit spine. These
 * additions restore source product domains while every relationship carries
 * tenant_id so PostgreSQL rejects cross-tenant joins below the route layer.
 */
export async function ensureCallCommandPhase35Tables(): Promise<void> {
  await db.execute(sql.raw(`
    ALTER TABLE callcommand_channels ADD COLUMN IF NOT EXISTS business_hours JSONB NOT NULL DEFAULT '{"always":true}'::jsonb;
    ALTER TABLE callcommand_channels ADD COLUMN IF NOT EXISTS live_behavior VARCHAR(40) NOT NULL DEFAULT 'ai_receptionist';
    ALTER TABLE callcommand_channels ADD COLUMN IF NOT EXISTS after_hours_behavior VARCHAR(32) NOT NULL DEFAULT 'voicemail';
    ALTER TABLE callcommand_channels ADD COLUMN IF NOT EXISTS forward_phone_e164 VARCHAR(16);
    ALTER TABLE callcommand_channels ADD COLUMN IF NOT EXISTS require_recording_consent BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE callcommand_channels ADD COLUMN IF NOT EXISTS provider_status VARCHAR(24) NOT NULL DEFAULT 'unavailable';
    ALTER TABLE callcommand_channels ADD COLUMN IF NOT EXISTS profile_id VARCHAR(36);
    ALTER TABLE callcommand_channels ADD COLUMN IF NOT EXISTS active_flow_id VARCHAR(36);
    ALTER TABLE callcommand_channels ADD COLUMN IF NOT EXISTS product_mode VARCHAR(32) NOT NULL DEFAULT 'general';
    ALTER TABLE callcommand_channels DROP CONSTRAINT IF EXISTS callcommand_channel_business_hours_check;
    ALTER TABLE callcommand_channels ADD CONSTRAINT callcommand_channel_business_hours_check CHECK (jsonb_typeof(business_hours)='object');
    ALTER TABLE callcommand_channels DROP CONSTRAINT IF EXISTS callcommand_channel_behavior_check;
    ALTER TABLE callcommand_channels ADD CONSTRAINT callcommand_channel_behavior_check CHECK (live_behavior IN ('record_only','forward_only','voicemail_only','ai_receptionist','ai_screen_then_transfer','ai_after_hours_intake'));
    ALTER TABLE callcommand_channels DROP CONSTRAINT IF EXISTS callcommand_channel_after_hours_check;
    ALTER TABLE callcommand_channels ADD CONSTRAINT callcommand_channel_after_hours_check CHECK (after_hours_behavior IN ('voicemail','forward','ai_intake','hangup'));

    ALTER TABLE callcommand_profiles ADD COLUMN IF NOT EXISTS script TEXT NOT NULL DEFAULT '';
    ALTER TABLE callcommand_profiles ADD COLUMN IF NOT EXISTS tone VARCHAR(32) NOT NULL DEFAULT 'professional';
    ALTER TABLE callcommand_profiles ADD COLUMN IF NOT EXISTS escalation_rules JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE callcommand_profiles ADD COLUMN IF NOT EXISTS product_mode VARCHAR(32) NOT NULL DEFAULT 'general';
    ALTER TABLE callcommand_profiles ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE callcommand_profiles DROP CONSTRAINT IF EXISTS callcommand_profile_escalation_check;
    ALTER TABLE callcommand_profiles ADD CONSTRAINT callcommand_profile_escalation_check CHECK (jsonb_typeof(escalation_rules)='array');

    ALTER TABLE callcommand_transfer_targets ADD COLUMN IF NOT EXISTS target_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE callcommand_transfer_targets ADD COLUMN IF NOT EXISTS queue_name VARCHAR(120);
    ALTER TABLE callcommand_transfer_targets ADD COLUMN IF NOT EXISTS business_hours JSONB NOT NULL DEFAULT '{"always":true}'::jsonb;
    ALTER TABLE callcommand_transfer_targets ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 100;
    ALTER TABLE callcommand_transfer_targets DROP CONSTRAINT IF EXISTS callcommand_target_kind_check;
    ALTER TABLE callcommand_transfer_targets DROP CONSTRAINT IF EXISTS callcommand_target_phone_check;
    ALTER TABLE callcommand_transfer_targets DROP CONSTRAINT IF EXISTS callcommand_target_shape_check;
    ALTER TABLE callcommand_transfer_targets ADD CONSTRAINT callcommand_target_kind_check CHECK (kind IN ('user','queue','external','voicemail'));
    ALTER TABLE callcommand_transfer_targets ADD CONSTRAINT callcommand_target_shape_check CHECK (
      (kind='external' AND phone_e164 IS NOT NULL) OR
      (kind='user' AND target_user_id IS NOT NULL) OR
      (kind='queue' AND queue_name IS NOT NULL) OR
      kind='voicemail'
    );

    ALTER TABLE callcommand_calls ADD COLUMN IF NOT EXISTS customer_name VARCHAR(160);
    ALTER TABLE callcommand_calls ADD COLUMN IF NOT EXISTS company_name VARCHAR(160);
    ALTER TABLE callcommand_calls ADD COLUMN IF NOT EXISTS call_type VARCHAR(32);
    ALTER TABLE callcommand_calls ADD COLUMN IF NOT EXISTS intent TEXT;
    ALTER TABLE callcommand_calls ADD COLUMN IF NOT EXISTS sentiment VARCHAR(24);
    ALTER TABLE callcommand_calls ADD COLUMN IF NOT EXISTS priority VARCHAR(16) NOT NULL DEFAULT 'medium';
    ALTER TABLE callcommand_calls ADD COLUMN IF NOT EXISTS key_points JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE callcommand_calls ADD COLUMN IF NOT EXISTS entities JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE callcommand_calls ADD COLUMN IF NOT EXISTS suggested_tags JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE callcommand_calls ADD COLUMN IF NOT EXISTS action_items JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE callcommand_calls ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;
    ALTER TABLE callcommand_calls ADD COLUMN IF NOT EXISTS recording_attachment_id VARCHAR(36);
    ALTER TABLE callcommand_calls ADD COLUMN IF NOT EXISTS analysis_provider VARCHAR(80);
    ALTER TABLE callcommand_calls ADD COLUMN IF NOT EXISTS analysis_model VARCHAR(160);
    ALTER TABLE callcommand_calls ADD COLUMN IF NOT EXISTS analysis_provenance JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE callcommand_calls ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMP;
    ALTER TABLE callcommand_calls ADD COLUMN IF NOT EXISTS flow_id VARCHAR(36);
    ALTER TABLE callcommand_calls ADD COLUMN IF NOT EXISTS flow_version INTEGER;
    ALTER TABLE callcommand_calls DROP CONSTRAINT IF EXISTS callcommand_call_priority_check;
    ALTER TABLE callcommand_calls ADD CONSTRAINT callcommand_call_priority_check CHECK (priority IN ('low','medium','high','urgent'));
    ALTER TABLE callcommand_calls DROP CONSTRAINT IF EXISTS callcommand_call_analysis_json_check;
    ALTER TABLE callcommand_calls ADD CONSTRAINT callcommand_call_analysis_json_check CHECK (
      jsonb_typeof(key_points)='array' AND jsonb_typeof(entities)='object' AND
      jsonb_typeof(suggested_tags)='array' AND jsonb_typeof(action_items)='array' AND
      jsonb_typeof(analysis_provenance)='object'
    );

    CREATE TABLE IF NOT EXISTS callcommand_flows (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      name VARCHAR(160) NOT NULL,
      description TEXT,
      product_mode VARCHAR(32) NOT NULL DEFAULT 'general',
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      active_version INTEGER NOT NULL DEFAULT 1,
      start_node_key VARCHAR(80),
      version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_callcommand_flow_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT callcommand_flow_status_check CHECK (status IN ('draft','active','paused','archived'))
    );
    CREATE INDEX IF NOT EXISTS idx_callcommand_flow_tenant ON callcommand_flows(tenant_id,status,updated_at DESC) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS callcommand_flow_versions (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      flow_id VARCHAR(36) NOT NULL,
      version INTEGER NOT NULL,
      graph_json JSONB NOT NULL,
      validation_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      published_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT callcommand_flow_version_fk FOREIGN KEY (tenant_id,flow_id) REFERENCES callcommand_flows(tenant_id,id) ON DELETE CASCADE,
      CONSTRAINT uq_callcommand_flow_version UNIQUE (tenant_id,flow_id,version),
      CONSTRAINT callcommand_flow_graph_check CHECK (jsonb_typeof(graph_json)='object' AND jsonb_typeof(validation_json)='object')
    );

    CREATE TABLE IF NOT EXISTS callcommand_flow_traces (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      call_id VARCHAR(36) NOT NULL,
      flow_id VARCHAR(36) NOT NULL,
      flow_version INTEGER NOT NULL,
      sequence INTEGER NOT NULL,
      node_key VARCHAR(80) NOT NULL,
      node_type VARCHAR(24) NOT NULL,
      outcome VARCHAR(40) NOT NULL,
      safe_input JSONB NOT NULL DEFAULT '{}'::jsonb,
      safe_output JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT callcommand_trace_call_fk FOREIGN KEY (tenant_id,call_id) REFERENCES callcommand_calls(tenant_id,id) ON DELETE CASCADE,
      CONSTRAINT callcommand_trace_flow_fk FOREIGN KEY (tenant_id,flow_id) REFERENCES callcommand_flows(tenant_id,id),
      CONSTRAINT uq_callcommand_trace_sequence UNIQUE (tenant_id,call_id,flow_id,flow_version,sequence)
    );

    CREATE TABLE IF NOT EXISTS callcommand_live_sessions (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      call_id VARCHAR(36) NOT NULL,
      channel_id VARCHAR(36) NOT NULL,
      provider_call_sid VARCHAR(80),
      state VARCHAR(24) NOT NULL DEFAULT 'ringing',
      caller_phone_masked VARCHAR(24) NOT NULL,
      collected_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      transcript_tail TEXT NOT NULL DEFAULT '',
      operator_note TEXT,
      urgent BOOLEAN NOT NULL DEFAULT FALSE,
      sequence INTEGER NOT NULL DEFAULT 1,
      started_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      ended_at TIMESTAMP,
      CONSTRAINT uq_callcommand_session_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT callcommand_session_call_fk FOREIGN KEY (tenant_id,call_id) REFERENCES callcommand_calls(tenant_id,id) ON DELETE CASCADE,
      CONSTRAINT callcommand_session_channel_fk FOREIGN KEY (tenant_id,channel_id) REFERENCES callcommand_channels(tenant_id,id),
      CONSTRAINT callcommand_session_state_check CHECK (state IN ('ringing','consent','intake','holding','transferring','connected','voicemail','completed','failed'))
    );
    CREATE INDEX IF NOT EXISTS idx_callcommand_session_live ON callcommand_live_sessions(tenant_id,state,updated_at DESC) WHERE ended_at IS NULL;

    CREATE TABLE IF NOT EXISTS callcommand_ingestion_tokens (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      label VARCHAR(120) NOT NULL,
      token_prefix VARCHAR(12) NOT NULL,
      token_hash CHAR(64) NOT NULL,
      source VARCHAR(24) NOT NULL,
      last_used_at TIMESTAMP,
      expires_at TIMESTAMP,
      revoked_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_callcommand_ingestion_token_hash UNIQUE (token_hash),
      CONSTRAINT callcommand_ingestion_source_check CHECK (source IN ('generic','email','twilio'))
    );

    CREATE TABLE IF NOT EXISTS callcommand_ingestion_events (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      source VARCHAR(24) NOT NULL,
      provider_event_id VARCHAR(200) NOT NULL,
      payload_sha256 CHAR(64) NOT NULL,
      call_id VARCHAR(36),
      status VARCHAR(24) NOT NULL DEFAULT 'received',
      error_code VARCHAR(80),
      received_at TIMESTAMP NOT NULL DEFAULT NOW(),
      processed_at TIMESTAMP,
      CONSTRAINT uq_callcommand_ingestion_replay UNIQUE (tenant_id,source,provider_event_id),
      CONSTRAINT callcommand_ingestion_call_fk FOREIGN KEY (tenant_id,call_id) REFERENCES callcommand_calls(tenant_id,id)
    );

    CREATE TABLE IF NOT EXISTS callcommand_upload_intents (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      call_id VARCHAR(36),
      file_name VARCHAR(240) NOT NULL,
      mime_type VARCHAR(120) NOT NULL,
      size_bytes INTEGER NOT NULL,
      content_sha256 CHAR(64),
      status VARCHAR(24) NOT NULL DEFAULT 'created',
      attachment_id VARCHAR(36),
      expires_at TIMESTAMP NOT NULL,
      consumed_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_callcommand_upload_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT callcommand_upload_call_fk FOREIGN KEY (tenant_id,call_id) REFERENCES callcommand_calls(tenant_id,id),
      CONSTRAINT callcommand_upload_status_check CHECK (status IN ('created','uploaded','scanning','ready','quarantined','expired')),
      CONSTRAINT callcommand_upload_size_check CHECK (size_bytes BETWEEN 1 AND 52428800)
    );

    CREATE TABLE IF NOT EXISTS callcommand_automation_rules (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      name VARCHAR(160) NOT NULL,
      priority INTEGER NOT NULL DEFAULT 100,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      conditions_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      actions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_callcommand_rule_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT callcommand_rule_json_check CHECK (jsonb_typeof(conditions_json)='object' AND jsonb_typeof(actions_json)='array')
    );

    CREATE TABLE IF NOT EXISTS callcommand_tickets (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      call_id VARCHAR(36), title VARCHAR(240) NOT NULL, description TEXT, status VARCHAR(24) NOT NULL DEFAULT 'open',
      priority VARCHAR(16) NOT NULL DEFAULT 'medium', assigned_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_callcommand_ticket_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT callcommand_ticket_call_fk FOREIGN KEY (tenant_id,call_id) REFERENCES callcommand_calls(tenant_id,id)
    );
    CREATE TABLE IF NOT EXISTS callcommand_leads (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      call_id VARCHAR(36), name VARCHAR(160), company VARCHAR(160), phone_masked VARCHAR(24), status VARCHAR(24) NOT NULL DEFAULT 'new',
      notes TEXT, assigned_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_callcommand_lead_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT callcommand_lead_call_fk FOREIGN KEY (tenant_id,call_id) REFERENCES callcommand_calls(tenant_id,id)
    );
    CREATE TABLE IF NOT EXISTS callcommand_tasks (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      call_id VARCHAR(36), title VARCHAR(240) NOT NULL, description TEXT, status VARCHAR(24) NOT NULL DEFAULT 'open',
      priority VARCHAR(16) NOT NULL DEFAULT 'medium', assigned_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      due_at TIMESTAMP, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_callcommand_task_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT callcommand_task_call_fk FOREIGN KEY (tenant_id,call_id) REFERENCES callcommand_calls(tenant_id,id)
    );

    CREATE TABLE IF NOT EXISTS callcommand_action_runs (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      call_id VARCHAR(36) NOT NULL, rule_id VARCHAR(36), action_type VARCHAR(32) NOT NULL, status VARCHAR(32) NOT NULL,
      idempotency_key VARCHAR(200) NOT NULL, provider VARCHAR(80), provider_reference VARCHAR(200),
      safe_result JSONB NOT NULL DEFAULT '{}'::jsonb, error_code VARCHAR(80), attempts INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), completed_at TIMESTAMP,
      CONSTRAINT callcommand_action_call_fk FOREIGN KEY (tenant_id,call_id) REFERENCES callcommand_calls(tenant_id,id) ON DELETE CASCADE,
      CONSTRAINT callcommand_action_rule_fk FOREIGN KEY (tenant_id,rule_id) REFERENCES callcommand_automation_rules(tenant_id,id),
      CONSTRAINT uq_callcommand_action_key UNIQUE (tenant_id,idempotency_key)
    );

    CREATE TABLE IF NOT EXISTS callcommand_transfer_logs (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      call_id VARCHAR(36) NOT NULL, session_id VARCHAR(36), target_id VARCHAR(36), requested_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      provider VARCHAR(32) NOT NULL DEFAULT 'twilio', status VARCHAR(32) NOT NULL, reason TEXT NOT NULL,
      provider_status INTEGER, created_at TIMESTAMP NOT NULL DEFAULT NOW(), completed_at TIMESTAMP,
      CONSTRAINT callcommand_transfer_call_fk FOREIGN KEY (tenant_id,call_id) REFERENCES callcommand_calls(tenant_id,id) ON DELETE CASCADE,
      CONSTRAINT callcommand_transfer_session_fk FOREIGN KEY (tenant_id,session_id) REFERENCES callcommand_live_sessions(tenant_id,id),
      CONSTRAINT callcommand_transfer_target_fk FOREIGN KEY (tenant_id,target_id) REFERENCES callcommand_transfer_targets(tenant_id,id)
    );

    CREATE TABLE IF NOT EXISTS callcommand_reports (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      call_id VARCHAR(36) NOT NULL, requested_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      format VARCHAR(8) NOT NULL DEFAULT 'pdf', content BYTEA NOT NULL, content_sha256 CHAR(64) NOT NULL,
      size_bytes INTEGER NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT callcommand_report_call_fk FOREIGN KEY (tenant_id,call_id) REFERENCES callcommand_calls(tenant_id,id) ON DELETE CASCADE,
      CONSTRAINT callcommand_report_format_check CHECK (format='pdf' AND size_bytes > 0)
    );

    CREATE TABLE IF NOT EXISTS callcommand_usage_counters (
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id), period_start DATE NOT NULL,
      inbound_minutes INTEGER NOT NULL DEFAULT 0, analyzed_calls INTEGER NOT NULL DEFAULT 0,
      automation_actions INTEGER NOT NULL DEFAULT 0, updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id,period_start)
    );

    ALTER TABLE callcommand_channels DROP CONSTRAINT IF EXISTS callcommand_channel_profile_fk;
    ALTER TABLE callcommand_channels ADD CONSTRAINT callcommand_channel_profile_fk FOREIGN KEY (tenant_id,profile_id) REFERENCES callcommand_profiles(tenant_id,id);
    ALTER TABLE callcommand_channels DROP CONSTRAINT IF EXISTS callcommand_channel_flow_fk;
    ALTER TABLE callcommand_channels ADD CONSTRAINT callcommand_channel_flow_fk FOREIGN KEY (tenant_id,active_flow_id) REFERENCES callcommand_flows(tenant_id,id);
  `));
}
