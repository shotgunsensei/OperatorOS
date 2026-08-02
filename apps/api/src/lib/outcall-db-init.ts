import { sql } from 'drizzle-orm';
import { db } from '../db.js';

export async function ensureOutCallTables(): Promise<void> {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS outcall_phone_owners (
      phone_fingerprint CHAR(64) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      phone_ciphertext TEXT NOT NULL,
      phone_masked VARCHAR(24) NOT NULL,
      verified_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_outcall_phone_owner_user
      ON outcall_phone_owners(user_id,updated_at DESC);

    CREATE TABLE IF NOT EXISTS outcall_settings (
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      phone_ciphertext TEXT,
      phone_fingerprint CHAR(64) REFERENCES outcall_phone_owners(phone_fingerprint),
      phone_masked VARCHAR(24),
      phone_verified_at TIMESTAMP,
      timezone VARCHAR(80) NOT NULL DEFAULT 'UTC',
      privacy_mode BOOLEAN NOT NULL DEFAULT TRUE,
      disclaimer_accepted_at TIMESTAMP,
      onboarding_step INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id,user_id),
      CONSTRAINT outcall_settings_step_check CHECK (onboarding_step BETWEEN 0 AND 10)
    );
    DROP INDEX IF EXISTS uq_outcall_verified_phone;
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid='outcall_settings'::regclass
          AND conname='outcall_settings_phone_owner_fk'
      ) THEN
        ALTER TABLE outcall_settings ADD CONSTRAINT outcall_settings_phone_owner_fk
          FOREIGN KEY (phone_fingerprint) REFERENCES outcall_phone_owners(phone_fingerprint);
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS outcall_profiles (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(120) NOT NULL,
      message TEXT NOT NULL,
      voice VARCHAR(40) NOT NULL DEFAULT 'alice',
      language VARCHAR(16) NOT NULL DEFAULT 'en-US',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_outcall_profile_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT outcall_profile_message_check CHECK (char_length(message) BETWEEN 1 AND 800)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_outcall_profile_name
      ON outcall_profiles(tenant_id,user_id,lower(name)) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS outcall_triggers (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      phrase_ciphertext TEXT NOT NULL,
      phrase_digest CHAR(64) NOT NULL,
      neutral_reply VARCHAR(80) NOT NULL,
      delay_seconds INTEGER NOT NULL DEFAULT 0,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      last_used_at TIMESTAMP,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_outcall_trigger_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT outcall_trigger_delay_check CHECK (delay_seconds BETWEEN 0 AND 86400)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_outcall_trigger_phrase
      ON outcall_triggers(tenant_id,user_id,phrase_digest) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS outcall_call_requests (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      profile_id VARCHAR(36) NOT NULL,
      destination_fingerprint CHAR(64) NOT NULL,
      destination_masked VARCHAR(24) NOT NULL,
      source VARCHAR(20) NOT NULL DEFAULT 'web',
      status VARCHAR(24) NOT NULL DEFAULT 'scheduled',
      provider VARCHAR(20) NOT NULL DEFAULT 'disabled',
      provider_call_sid VARCHAR(80),
      idempotency_key VARCHAR(120) NOT NULL,
      scheduled_at TIMESTAMP NOT NULL,
      started_at TIMESTAMP,
      completed_at TIMESTAMP,
      canceled_at TIMESTAMP,
      failure_code VARCHAR(80),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_outcall_request_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT uq_outcall_request_idempotency UNIQUE (tenant_id,user_id,idempotency_key),
      CONSTRAINT outcall_request_profile_fk FOREIGN KEY (tenant_id,profile_id)
        REFERENCES outcall_profiles(tenant_id,id),
      CONSTRAINT outcall_request_status_check CHECK (status IN ('scheduled','processing','completed','failed','canceled')),
      CONSTRAINT outcall_request_source_check CHECK (source IN ('web','sms','test'))
    );
    CREATE INDEX IF NOT EXISTS idx_outcall_request_due
      ON outcall_call_requests(status,scheduled_at) WHERE status='scheduled';

    CREATE TABLE IF NOT EXISTS outcall_events (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      call_request_id VARCHAR(36) NOT NULL,
      event_type VARCHAR(80) NOT NULL,
      safe_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      provider_event_id VARCHAR(100),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT outcall_event_request_fk FOREIGN KEY (tenant_id,call_request_id)
        REFERENCES outcall_call_requests(tenant_id,id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_outcall_provider_event
      ON outcall_events(provider_event_id) WHERE provider_event_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_outcall_event_request
      ON outcall_events(tenant_id,call_request_id,created_at);
  `));
}

export async function ensureOutCallProductTables(): Promise<void> {
  await db.execute(sql.raw(`
    ALTER TABLE outcall_triggers
      ADD COLUMN IF NOT EXISTS profile_id VARCHAR(36);

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid='outcall_triggers'::regclass
          AND conname='outcall_trigger_profile_fk'
      ) THEN
        ALTER TABLE outcall_triggers ADD CONSTRAINT outcall_trigger_profile_fk
          FOREIGN KEY (tenant_id,profile_id) REFERENCES outcall_profiles(tenant_id,id);
      END IF;
    END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_outcall_provider_call_sid
      ON outcall_call_requests(provider_call_sid)
      WHERE provider_call_sid IS NOT NULL;

    CREATE TABLE IF NOT EXISTS outcall_rate_limits (
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      scope_digest CHAR(64) NOT NULL,
      window_started_at TIMESTAMP NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 1,
      expires_at TIMESTAMP NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id,user_id,scope_digest,window_started_at),
      CONSTRAINT outcall_rate_limit_count_check CHECK (request_count BETWEEN 1 AND 10000)
    );
    CREATE INDEX IF NOT EXISTS idx_outcall_rate_limits_expiry
      ON outcall_rate_limits(expires_at);
  `));
}
