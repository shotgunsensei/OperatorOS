import { sql } from 'drizzle-orm';
import { db } from '../db.js';

/** Additive Phase 11E schema. Composite tenant foreign keys prevent
 * cross-tenant relationship corruption below the route layer. */
export async function ensureCallCommandTables(): Promise<void> {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS callcommand_channels (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      name VARCHAR(120) NOT NULL,
      phone_e164 VARCHAR(16) NOT NULL,
      timezone VARCHAR(80) NOT NULL,
      consent_script TEXT NOT NULL,
      recording_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_callcommand_channel_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT uq_callcommand_channel_phone UNIQUE (tenant_id,phone_e164),
      CONSTRAINT callcommand_channel_status_check CHECK (status IN ('active','paused','archived')),
      CONSTRAINT callcommand_channel_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_callcommand_channel_tenant
      ON callcommand_channels(tenant_id,status,updated_at DESC) WHERE deleted_at IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_callcommand_channel_phone_global
      ON callcommand_channels(phone_e164)
      WHERE deleted_at IS NULL AND status <> 'archived';

    CREATE TABLE IF NOT EXISTS callcommand_profiles (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      name VARCHAR(120) NOT NULL,
      mode VARCHAR(30) NOT NULL,
      greeting TEXT NOT NULL,
      intake_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_callcommand_profile_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT callcommand_profile_mode_check CHECK (mode IN ('receptionist','intake','dispatcher')),
      CONSTRAINT callcommand_profile_status_check CHECK (status IN ('active','paused','archived')),
      CONSTRAINT callcommand_profile_fields_check CHECK (jsonb_typeof(intake_fields)='array' AND jsonb_array_length(intake_fields) <= 12),
      CONSTRAINT callcommand_profile_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_callcommand_profile_tenant
      ON callcommand_profiles(tenant_id,status,updated_at DESC) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS callcommand_transfer_targets (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      label VARCHAR(120) NOT NULL,
      kind VARCHAR(20) NOT NULL,
      phone_e164 VARCHAR(16),
      verified_at TIMESTAMP,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_callcommand_target_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT callcommand_target_kind_check CHECK (kind IN ('external','voicemail')),
      CONSTRAINT callcommand_target_phone_check CHECK ((kind='external' AND phone_e164 IS NOT NULL) OR (kind='voicemail' AND phone_e164 IS NULL)),
      CONSTRAINT callcommand_target_status_check CHECK (status IN ('active','paused','archived'))
    );
    CREATE INDEX IF NOT EXISTS idx_callcommand_target_tenant
      ON callcommand_transfer_targets(tenant_id,status,updated_at DESC) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS callcommand_consents (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      recorded_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      phone_fingerprint CHAR(64) NOT NULL,
      phone_masked VARCHAR(24) NOT NULL,
      phone_e164 VARCHAR(16) NOT NULL,
      subject_name VARCHAR(160),
      purpose VARCHAR(40) NOT NULL,
      source VARCHAR(160) NOT NULL,
      evidence TEXT NOT NULL,
      granted_at TIMESTAMP NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMP,
      revoked_at TIMESTAMP,
      revoke_reason TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_callcommand_consent_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT callcommand_consent_purpose_check CHECK (purpose IN ('service_callback','appointment','support')),
      CONSTRAINT callcommand_consent_dates_check CHECK (expires_at IS NULL OR expires_at > granted_at)
    );
    CREATE INDEX IF NOT EXISTS idx_callcommand_consent_lookup
      ON callcommand_consents(tenant_id,phone_fingerprint,purpose,granted_at DESC);

    CREATE TABLE IF NOT EXISTS callcommand_suppressions (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      recorded_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      phone_fingerprint CHAR(64) NOT NULL,
      phone_masked VARCHAR(24) NOT NULL,
      phone_e164 VARCHAR(16) NOT NULL,
      reason TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      released_at TIMESTAMP,
      CONSTRAINT uq_callcommand_suppression_tenant_id UNIQUE (tenant_id,id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_callcommand_suppression_active
      ON callcommand_suppressions(tenant_id,phone_fingerprint) WHERE active=TRUE;

    CREATE TABLE IF NOT EXISTS callcommand_calls (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      channel_id VARCHAR(36) NOT NULL,
      profile_id VARCHAR(36) NOT NULL,
      consent_id VARCHAR(36),
      phone_fingerprint CHAR(64) NOT NULL,
      phone_masked VARCHAR(24) NOT NULL,
      phone_e164 VARCHAR(16) NOT NULL,
      subject_name VARCHAR(160),
      direction VARCHAR(16) NOT NULL DEFAULT 'outbound',
      purpose VARCHAR(40) NOT NULL,
      provider VARCHAR(30) NOT NULL,
      provider_call_sid VARCHAR(80),
      status VARCHAR(24) NOT NULL DEFAULT 'queued',
      idempotency_key VARCHAR(160) NOT NULL,
      transcript TEXT,
      summary TEXT,
      disposition VARCHAR(40),
      disposition_note TEXT,
      recording_sid VARCHAR(80),
      recording_status VARCHAR(24) NOT NULL DEFAULT 'disabled',
      error_code VARCHAR(80),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMP,
      CONSTRAINT uq_callcommand_call_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT uq_callcommand_call_idempotency UNIQUE (tenant_id,idempotency_key),
      CONSTRAINT callcommand_call_channel_fk FOREIGN KEY (tenant_id,channel_id) REFERENCES callcommand_channels(tenant_id,id),
      CONSTRAINT callcommand_call_profile_fk FOREIGN KEY (tenant_id,profile_id) REFERENCES callcommand_profiles(tenant_id,id),
      CONSTRAINT callcommand_call_consent_fk FOREIGN KEY (tenant_id,consent_id) REFERENCES callcommand_consents(tenant_id,id),
      CONSTRAINT callcommand_call_direction_check CHECK (direction IN ('inbound','outbound')),
      CONSTRAINT callcommand_call_status_check CHECK (status IN ('queued','ringing','in_progress','completed','failed','canceled','blocked')),
      CONSTRAINT callcommand_call_disposition_check CHECK (disposition IS NULL OR disposition IN ('resolved','follow_up_required','transferred','no_action','unreachable')),
      CONSTRAINT callcommand_call_disposition_note_check CHECK (disposition_note IS NULL OR char_length(disposition_note) <= 500),
      CONSTRAINT callcommand_recording_status_check CHECK (recording_status IN ('disabled','pending','ready','failed','deleted'))
    );
    CREATE INDEX IF NOT EXISTS idx_callcommand_call_tenant_created
      ON callcommand_calls(tenant_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_callcommand_call_provider_sid
      ON callcommand_calls(provider,provider_call_sid) WHERE provider_call_sid IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_callcommand_call_provider_sid
      ON callcommand_calls(provider,provider_call_sid) WHERE provider_call_sid IS NOT NULL;

    CREATE TABLE IF NOT EXISTS callcommand_events (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      call_id VARCHAR(36) NOT NULL,
      event_type VARCHAR(80) NOT NULL,
      safe_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_callcommand_event_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT callcommand_event_call_fk FOREIGN KEY (tenant_id,call_id) REFERENCES callcommand_calls(tenant_id,id)
    );
    CREATE INDEX IF NOT EXISTS idx_callcommand_event_call
      ON callcommand_events(tenant_id,call_id,created_at,id);

    CREATE TABLE IF NOT EXISTS callcommand_followups (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      call_id VARCHAR(36) NOT NULL,
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      channel VARCHAR(20) NOT NULL,
      body TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      sent_at TIMESTAMP,
      CONSTRAINT uq_callcommand_followup_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT callcommand_followup_call_fk FOREIGN KEY (tenant_id,call_id) REFERENCES callcommand_calls(tenant_id,id),
      CONSTRAINT callcommand_followup_channel_check CHECK (channel IN ('sms','email','task')),
      CONSTRAINT callcommand_followup_status_check CHECK (status IN ('draft','queued','sent','failed','canceled'))
    );
    CREATE INDEX IF NOT EXISTS idx_callcommand_followup_call
      ON callcommand_followups(tenant_id,call_id,created_at DESC);

    ALTER TABLE callcommand_calls ALTER COLUMN consent_id DROP NOT NULL;
    ALTER TABLE callcommand_calls ADD COLUMN IF NOT EXISTS disposition VARCHAR(40);
    ALTER TABLE callcommand_calls ADD COLUMN IF NOT EXISTS disposition_note TEXT;
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid='callcommand_calls'::regclass
          AND conname='callcommand_call_disposition_check'
      ) THEN
        ALTER TABLE callcommand_calls
          ADD CONSTRAINT callcommand_call_disposition_check
          CHECK (disposition IS NULL OR disposition IN ('resolved','follow_up_required','transferred','no_action','unreachable'));
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid='callcommand_calls'::regclass
          AND conname='callcommand_call_disposition_note_check'
      ) THEN
        ALTER TABLE callcommand_calls
          ADD CONSTRAINT callcommand_call_disposition_note_check
          CHECK (disposition_note IS NULL OR char_length(disposition_note) <= 500);
      END IF;
    END $$;
  `));
}
