import { sql } from 'drizzle-orm';
import { db } from '../db.js';

export async function ensureAuthSecurityControls() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS auth_request_limits (
      key_hash VARCHAR(64) PRIMARY KEY,
      request_count INTEGER NOT NULL CHECK (request_count > 0),
      resets_at TIMESTAMPTZ NOT NULL,
      CONSTRAINT auth_request_limit_hash_check CHECK (length(key_hash)=64)
    );
    CREATE INDEX IF NOT EXISTS idx_auth_request_limits_expiry ON auth_request_limits(resets_at);
    CREATE TABLE IF NOT EXISTS auth_pending_email_changes (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      old_email TEXT NOT NULL, new_email TEXT NOT NULL,
      token_hash VARCHAR(64) NOT NULL UNIQUE,
      user_token_version INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      CONSTRAINT auth_email_change_hash_check CHECK(length(token_hash)=64),
      CONSTRAINT auth_email_change_addresses_check CHECK(old_email<>new_email)
    );
    CREATE INDEX IF NOT EXISTS idx_auth_email_changes_user ON auth_pending_email_changes(user_id,created_at DESC);
    CREATE TABLE IF NOT EXISTS auth_browser_sessions (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash VARCHAR(64) NOT NULL UNIQUE,
      token_version INTEGER NOT NULL,
      session_type TEXT NOT NULL CHECK(session_type IN ('platform','module')),
      module_slug TEXT,
      device_label VARCHAR(80) NOT NULL,
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      CONSTRAINT auth_browser_session_hash_check CHECK(length(token_hash)=64)
    );
    CREATE INDEX IF NOT EXISTS idx_auth_browser_sessions_user ON auth_browser_sessions(user_id,last_seen_at DESC);
    CREATE INDEX IF NOT EXISTS idx_auth_browser_sessions_expiry ON auth_browser_sessions(expires_at);
  `);
}
