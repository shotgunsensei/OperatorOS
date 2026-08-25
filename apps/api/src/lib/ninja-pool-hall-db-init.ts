import { db } from '../db.js';

/**
 * Additive, idempotent Phase 10B Operator Pool Hall release (stable database namespace retained).
 *
 * Match events are application-append-only. Platform hard-delete remains an
 * explicit audited transaction, so no trigger prevents required account or
 * tenant erasure. Rollback uses the root restore-to-new-database contract.
 */
export async function ensureNinjaPoolHallTables(): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS ninja_pool_player_profiles (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      display_name VARCHAR(40) NOT NULL,
      preferences JSONB NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_ninja_pool_profile_tenant_user UNIQUE (tenant_id, user_id),
      CONSTRAINT uq_ninja_pool_profile_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT ninja_pool_profile_name_check CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 40),
      CONSTRAINT ninja_pool_profile_preferences_check CHECK (jsonb_typeof(preferences) = 'object'),
      CONSTRAINT ninja_pool_profile_version_check CHECK (version >= 1)
    );

    CREATE TABLE IF NOT EXISTS ninja_pool_match_sessions (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      mode VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      opponent_name VARCHAR(40) NOT NULL,
      rules_settings JSONB NOT NULL,
      logical_state JSONB NOT NULL,
      winner_seat INTEGER,
      result VARCHAR(20),
      finish_reason VARCHAR(240),
      shot_count INTEGER NOT NULL DEFAULT 0,
      client_start_id VARCHAR(160) NOT NULL,
      evidence VARCHAR(40) NOT NULL DEFAULT 'client_reported_server_rules',
      rules_version INTEGER NOT NULL DEFAULT 1,
      version INTEGER NOT NULL DEFAULT 1,
      started_at TIMESTAMP NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMP,
      abandoned_at TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_ninja_pool_match_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_ninja_pool_match_start UNIQUE (tenant_id, user_id, client_start_id),
      CONSTRAINT ninja_pool_match_mode_check CHECK (mode IN ('bot','local')),
      CONSTRAINT ninja_pool_match_status_check CHECK (status IN ('active','completed','abandoned')),
      CONSTRAINT ninja_pool_match_winner_check CHECK (winner_seat IS NULL OR winner_seat IN (0,1)),
      CONSTRAINT ninja_pool_match_result_check CHECK (result IS NULL OR result IN ('win','loss','draw','player_1','player_2')),
      CONSTRAINT ninja_pool_match_counts_check CHECK (shot_count BETWEEN 0 AND 500 AND version >= 1 AND rules_version = 1),
      CONSTRAINT ninja_pool_match_json_check CHECK (jsonb_typeof(rules_settings) = 'object' AND jsonb_typeof(logical_state) = 'object'),
      CONSTRAINT ninja_pool_match_evidence_check CHECK (evidence = 'client_reported_server_rules'),
      CONSTRAINT ninja_pool_match_lifecycle_check CHECK (
        (status='active' AND completed_at IS NULL AND abandoned_at IS NULL AND result IS NULL)
        OR (status='completed' AND completed_at IS NOT NULL AND abandoned_at IS NULL AND result IS NOT NULL)
        OR (status='abandoned' AND completed_at IS NULL AND abandoned_at IS NOT NULL AND result IS NULL)
      )
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_ninja_pool_one_active_match
      ON ninja_pool_match_sessions(tenant_id, user_id) WHERE status='active';
    CREATE INDEX IF NOT EXISTS idx_ninja_pool_matches_user_history
      ON ninja_pool_match_sessions(tenant_id, user_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ninja_pool_matches_tenant_mode
      ON ninja_pool_match_sessions(tenant_id, mode, status, started_at DESC);

    CREATE TABLE IF NOT EXISTS ninja_pool_match_events (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      match_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      sequence_number INTEGER NOT NULL,
      client_action_id VARCHAR(160) NOT NULL,
      event_kind VARCHAR(20) NOT NULL,
      input JSONB NOT NULL,
      outcome JSONB NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT ninja_pool_event_match_fk FOREIGN KEY (tenant_id, match_id)
        REFERENCES ninja_pool_match_sessions(tenant_id, id),
      CONSTRAINT uq_ninja_pool_event_sequence UNIQUE (tenant_id, match_id, sequence_number),
      CONSTRAINT uq_ninja_pool_event_client UNIQUE (tenant_id, match_id, client_action_id),
      CONSTRAINT ninja_pool_event_kind_check CHECK (event_kind IN ('shot','choice')),
      CONSTRAINT ninja_pool_event_sequence_check CHECK (sequence_number BETWEEN 1 AND 1000),
      CONSTRAINT ninja_pool_event_json_check CHECK (jsonb_typeof(input) = 'object' AND jsonb_typeof(outcome) = 'object')
    );
    CREATE INDEX IF NOT EXISTS idx_ninja_pool_events_match
      ON ninja_pool_match_events(tenant_id, match_id, sequence_number);
  `);
}
