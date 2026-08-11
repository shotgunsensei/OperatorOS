import { sql } from 'drizzle-orm';
import { db } from '../db.js';

/** Additive Phase 29 persistence. Only hashes of native credentials and device IDs are stored. */
export async function ensureTorqueShedNativeTables(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE torqueshed_build_journal_entries
      ADD COLUMN IF NOT EXISTS client_mutation_id varchar(200);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_torqueshed_journal_client_mutation
      ON torqueshed_build_journal_entries(tenant_id, build_id, client_mutation_id);
    ALTER TABLE shared_attachments
      ADD COLUMN IF NOT EXISTS client_mutation_id varchar(200);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_shared_attachment_client_mutation
      ON shared_attachments(tenant_id, module_id, object_type, object_id, client_mutation_id);

    CREATE TABLE IF NOT EXISTS torqueshed_native_authorization_codes (
      id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tenant_id varchar(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      module_id varchar(36) NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
      code_hash char(64) NOT NULL UNIQUE,
      state_hash char(64) NOT NULL,
      nonce_hash char(64) NOT NULL,
      code_challenge varchar(128) NOT NULL,
      device_id_hash char(64) NOT NULL,
      redirect_uri text NOT NULL,
      device_name varchar(120) NOT NULL,
      expires_at timestamptz NOT NULL,
      consumed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT torqueshed_native_code_redirect CHECK (redirect_uri = 'torqueshed://sso'),
      CONSTRAINT torqueshed_native_code_challenge CHECK (code_challenge ~ '^[A-Za-z0-9_-]{43}$')
    );
    CREATE INDEX IF NOT EXISTS idx_torqueshed_native_codes_expiry
      ON torqueshed_native_authorization_codes(expires_at) WHERE consumed_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_torqueshed_native_codes_tenant_user
      ON torqueshed_native_authorization_codes(tenant_id, user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS torqueshed_native_sessions (
      id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tenant_id varchar(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      module_id varchar(36) NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
      access_token_hash char(64) NOT NULL UNIQUE,
      refresh_token_hash char(64) NOT NULL UNIQUE,
      device_id_hash char(64) NOT NULL,
      device_name varchar(120) NOT NULL,
      token_version integer NOT NULL,
      access_expires_at timestamptz NOT NULL,
      refresh_expires_at timestamptz NOT NULL,
      last_used_at timestamptz NOT NULL DEFAULT now(),
      revoked_at timestamptz,
      revoked_reason varchar(80),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_torqueshed_native_sessions_active
      ON torqueshed_native_sessions(user_id, tenant_id, refresh_expires_at)
      WHERE revoked_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_torqueshed_native_sessions_device
      ON torqueshed_native_sessions(device_id_hash, user_id) WHERE revoked_at IS NULL;
  `);
}
