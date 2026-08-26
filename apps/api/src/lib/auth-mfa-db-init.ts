import { sql } from 'drizzle-orm';
import { db } from '../db.js';

/**
 * Release v56: account-level TOTP belongs to OperatorOS, never to a child app.
 * Secrets are AES-256-GCM encrypted and recovery codes are one-way hashes.
 */
export async function ensureAuthMfaTables(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS auth_mfa_totp (
      user_id VARCHAR(36) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      ciphertext BYTEA NOT NULL,
      iv BYTEA NOT NULL,
      auth_tag BYTEA NOT NULL,
      key_version TEXT NOT NULL,
      enabled_at TIMESTAMP,
      pending_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT auth_mfa_totp_ciphertext_check CHECK (octet_length(ciphertext) > 0),
      CONSTRAINT auth_mfa_totp_iv_check CHECK (octet_length(iv) = 12),
      CONSTRAINT auth_mfa_totp_auth_tag_check CHECK (octet_length(auth_tag) = 16)
    );

    CREATE TABLE IF NOT EXISTS auth_mfa_recovery_codes (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL,
      used_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT auth_mfa_recovery_code_hash_check CHECK (length(code_hash) >= 40)
    );
    CREATE INDEX IF NOT EXISTS idx_auth_mfa_recovery_active
      ON auth_mfa_recovery_codes(user_id, created_at DESC)
      WHERE used_at IS NULL;

    CREATE TABLE IF NOT EXISTS auth_mfa_login_challenges (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash CHAR(64) NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      used_at TIMESTAMP,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT auth_mfa_challenge_attempts_check CHECK (failed_attempts BETWEEN 0 AND 5)
    );
    CREATE INDEX IF NOT EXISTS idx_auth_mfa_challenge_user_active
      ON auth_mfa_login_challenges(user_id, expires_at DESC)
      WHERE used_at IS NULL;
  `);
}
