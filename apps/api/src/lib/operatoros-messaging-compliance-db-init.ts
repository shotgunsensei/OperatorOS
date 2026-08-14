import { sql } from 'drizzle-orm';
import { db } from '../db.js';

/** Additive, idempotent platform-level SMS consent and revocation evidence. */
export async function ensureOperatorOsMessagingComplianceTables(): Promise<void> {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS operatoros_sms_consent_records (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      phone_e164 VARCHAR(16) NOT NULL,
      phone_fingerprint CHAR(64) NOT NULL,
      status TEXT NOT NULL,
      program VARCHAR(120) NOT NULL,
      consent_category TEXT NOT NULL,
      consented_at TIMESTAMPTZ,
      source_url VARCHAR(500),
      disclosure_version VARCHAR(80),
      disclosure_language VARCHAR(12),
      disclosure_text TEXT,
      privacy_policy_version VARCHAR(40),
      terms_version VARCHAR(40),
      opt_in_mechanism VARCHAR(80),
      client_ip_hash CHAR(64),
      user_agent_summary VARCHAR(500),
      revoked_at TIMESTAMPTZ,
      revocation_mechanism VARCHAR(80),
      last_keyword VARCHAR(24),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT operatoros_sms_status_check CHECK (status IN ('opted_in','revoked')),
      CONSTRAINT operatoros_sms_category_check CHECK (consent_category = 'service'),
      CONSTRAINT operatoros_sms_phone_check CHECK (phone_e164 ~ '^\\+[1-9][0-9]{7,14}$'),
      CONSTRAINT operatoros_sms_phone_fingerprint_check CHECK (phone_fingerprint ~ '^[0-9a-f]{64}$'),
      CONSTRAINT operatoros_sms_client_hash_check CHECK (client_ip_hash IS NULL OR client_ip_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT uq_operatoros_sms_program_phone UNIQUE (program, phone_e164)
    );
    CREATE INDEX IF NOT EXISTS idx_operatoros_sms_consent_fingerprint
      ON operatoros_sms_consent_records(program, phone_fingerprint, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_operatoros_sms_consent_status
      ON operatoros_sms_consent_records(program, status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS operatoros_sms_consent_events (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      consent_record_id VARCHAR(36) REFERENCES operatoros_sms_consent_records(id),
      event_type TEXT NOT NULL,
      event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      phone_fingerprint CHAR(64) NOT NULL,
      program VARCHAR(120) NOT NULL,
      consent_category TEXT NOT NULL DEFAULT 'service',
      source_url VARCHAR(500),
      mechanism VARCHAR(80) NOT NULL,
      keyword VARCHAR(24),
      disclosure_version VARCHAR(80),
      disclosure_language VARCHAR(12),
      disclosure_text TEXT,
      privacy_policy_version VARCHAR(40),
      terms_version VARCHAR(40),
      client_ip_hash CHAR(64),
      user_agent_summary VARCHAR(500),
      provider VARCHAR(40),
      provider_event_id VARCHAR(120),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT operatoros_sms_event_type_check CHECK (event_type IN ('opt_in','opt_back_in','revoked','help')),
      CONSTRAINT operatoros_sms_event_fingerprint_check CHECK (phone_fingerprint ~ '^[0-9a-f]{64}$'),
      CONSTRAINT operatoros_sms_event_client_hash_check CHECK (client_ip_hash IS NULL OR client_ip_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT operatoros_sms_event_category_check CHECK (consent_category = 'service')
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_operatoros_sms_provider_event
      ON operatoros_sms_consent_events(provider, provider_event_id)
      WHERE provider IS NOT NULL AND provider_event_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_operatoros_sms_events_record
      ON operatoros_sms_consent_events(consent_record_id, event_at DESC);
    CREATE INDEX IF NOT EXISTS idx_operatoros_sms_events_fingerprint
      ON operatoros_sms_consent_events(program, phone_fingerprint, event_at DESC);

    CREATE TABLE IF NOT EXISTS operatoros_sms_consent_rate_limits (
      bucket_hash CHAR(64) NOT NULL,
      window_start TIMESTAMPTZ NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 1,
      expires_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (bucket_hash, window_start),
      CONSTRAINT operatoros_sms_rate_hash_check CHECK (bucket_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT operatoros_sms_rate_count_check CHECK (request_count > 0)
    );
    CREATE INDEX IF NOT EXISTS idx_operatoros_sms_rate_expiry
      ON operatoros_sms_consent_rate_limits(expires_at);
  `));
}
