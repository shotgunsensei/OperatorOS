import { sql } from 'drizzle-orm';
import { db } from '../db.js';

/**
 * Release v59: verified-email, user-bound evaluation access for the three
 * Main Modules. This is deliberately separate from subscriptions and tenant
 * module grants, so expiry never mutates customer data or Stripe authority.
 */
export async function ensureCoreSuiteTrialTables(): Promise<void> {
  await db.execute(sql.raw(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash CHAR(64) NOT NULL UNIQUE,
      email_fingerprint CHAR(64) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      requested_ip VARCHAR(64),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT email_verification_token_hash_check CHECK (token_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT email_verification_email_fingerprint_check CHECK (email_fingerprint ~ '^[0-9a-f]{64}$'),
      CONSTRAINT email_verification_token_expiry_check CHECK (expires_at > created_at)
    );
    ALTER TABLE email_verification_tokens
      ADD COLUMN IF NOT EXISTS email_fingerprint CHAR(64);
    UPDATE email_verification_tokens
      SET email_fingerprint = repeat('0', 64),
          used_at = COALESCE(used_at, NOW())
      WHERE email_fingerprint IS NULL;
    ALTER TABLE email_verification_tokens
      ALTER COLUMN email_fingerprint SET NOT NULL;
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'email_verification_email_fingerprint_check'
      ) THEN
        ALTER TABLE email_verification_tokens
          ADD CONSTRAINT email_verification_email_fingerprint_check
          CHECK (email_fingerprint ~ '^[0-9a-f]{64}$');
      END IF;
    END
    $$;
    CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_active
      ON email_verification_tokens(user_id, expires_at DESC)
      WHERE used_at IS NULL;

    CREATE TABLE IF NOT EXISTS account_trials (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      subject_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      trial_tenant_id VARCHAR(36) REFERENCES tenants(id) ON DELETE SET NULL,
      identity_fingerprint CHAR(64) NOT NULL,
      identity_key_version INTEGER NOT NULL DEFAULT 1,
      offer_code VARCHAR(80) NOT NULL,
      policy_version INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active',
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ends_at TIMESTAMPTZ NOT NULL,
      converted_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      revoked_reason VARCHAR(240),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT account_trials_identity_fingerprint_check CHECK (identity_fingerprint ~ '^[0-9a-f]{64}$'),
      CONSTRAINT account_trials_identity_key_version_check CHECK (identity_key_version > 0),
      CONSTRAINT account_trials_policy_version_check CHECK (policy_version > 0),
      CONSTRAINT account_trials_status_check CHECK (status IN ('active','revoked')),
      CONSTRAINT account_trials_window_check CHECK (ends_at > started_at),
      CONSTRAINT account_trials_revocation_check CHECK (
        (status = 'active' AND revoked_at IS NULL)
        OR (status = 'revoked' AND revoked_at IS NOT NULL)
      )
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_account_trials_identity_offer
      ON account_trials(identity_fingerprint, offer_code);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_account_trials_user_offer
      ON account_trials(subject_user_id, offer_code)
      WHERE subject_user_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_account_trials_subject_status
      ON account_trials(subject_user_id, status, ends_at DESC);
    CREATE INDEX IF NOT EXISTS idx_account_trials_tenant_status
      ON account_trials(trial_tenant_id, status, ends_at DESC);
  `));
}
