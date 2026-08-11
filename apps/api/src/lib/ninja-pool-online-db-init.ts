import { db } from '../db.js';

/** Additive, idempotent Phase 30 room authority and append-only multiplayer trace. */
export async function ensureNinjaPoolOnlineTables(): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS ninja_pool_online_rooms (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      code VARCHAR(4) NOT NULL,
      host_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      guest_user_id VARCHAR(36) REFERENCES users(id),
      status VARCHAR(20) NOT NULL DEFAULT 'waiting',
      rules_settings JSONB NOT NULL,
      authoritative_state JSONB NOT NULL,
      state_hash VARCHAR(8) NOT NULL,
      pending_shot JSONB,
      sequence_number INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 1,
      client_room_id VARCHAR(160) NOT NULL,
      host_left_at TIMESTAMP,
      guest_left_at TIMESTAMP,
      expires_at TIMESTAMP NOT NULL,
      last_activity_at TIMESTAMP NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_ninja_pool_online_room_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_ninja_pool_online_room_code UNIQUE (code),
      CONSTRAINT uq_ninja_pool_online_room_client UNIQUE (tenant_id, host_user_id, client_room_id),
      CONSTRAINT ninja_pool_online_room_code_check CHECK (code ~ '^[A-HJ-NP-Z2-9]{4}$'),
      CONSTRAINT ninja_pool_online_room_status_check CHECK (status IN ('waiting','active','completed','abandoned','expired')),
      CONSTRAINT ninja_pool_online_room_players_check CHECK (guest_user_id IS NULL OR guest_user_id <> host_user_id),
      CONSTRAINT ninja_pool_online_room_json_check CHECK (
        jsonb_typeof(rules_settings) = 'object'
        AND jsonb_typeof(authoritative_state) = 'object'
        AND (pending_shot IS NULL OR jsonb_typeof(pending_shot) = 'object')
      ),
      CONSTRAINT ninja_pool_online_room_state_check CHECK (
        state_hash ~ '^[a-f0-9]{8}$'
        AND sequence_number BETWEEN 0 AND 2000
        AND version BETWEEN 1 AND 2001
      ),
      CONSTRAINT ninja_pool_online_room_lifecycle_check CHECK (
        (status IN ('waiting','active') AND completed_at IS NULL)
        OR (status IN ('completed','abandoned','expired') AND completed_at IS NOT NULL)
      )
    );
    CREATE INDEX IF NOT EXISTS idx_ninja_pool_online_room_host
      ON ninja_pool_online_rooms(tenant_id, host_user_id, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ninja_pool_online_room_guest
      ON ninja_pool_online_rooms(tenant_id, guest_user_id, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ninja_pool_online_room_expiry
      ON ninja_pool_online_rooms(status, expires_at);

    CREATE TABLE IF NOT EXISTS ninja_pool_online_events (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      room_id VARCHAR(36) NOT NULL,
      actor_user_id VARCHAR(36) REFERENCES users(id),
      sequence_number INTEGER NOT NULL,
      client_action_id VARCHAR(160),
      event_kind VARCHAR(20) NOT NULL,
      input JSONB NOT NULL,
      outcome JSONB NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT ninja_pool_online_event_room_fk FOREIGN KEY (tenant_id, room_id)
        REFERENCES ninja_pool_online_rooms(tenant_id, id),
      CONSTRAINT uq_ninja_pool_online_event_sequence UNIQUE (tenant_id, room_id, sequence_number),
      CONSTRAINT ninja_pool_online_event_kind_check CHECK (event_kind IN ('create','join','intent','shot','choice','leave','resync','expire')),
      CONSTRAINT ninja_pool_online_event_sequence_check CHECK (sequence_number BETWEEN 1 AND 2000),
      CONSTRAINT ninja_pool_online_event_json_check CHECK (jsonb_typeof(input) = 'object' AND jsonb_typeof(outcome) = 'object')
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_ninja_pool_online_event_client
      ON ninja_pool_online_events(tenant_id, room_id, client_action_id)
      WHERE client_action_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_ninja_pool_online_event_room
      ON ninja_pool_online_events(tenant_id, room_id, sequence_number);
    CREATE INDEX IF NOT EXISTS idx_ninja_pool_online_event_rate
      ON ninja_pool_online_events(tenant_id, actor_user_id, created_at);

    CREATE TABLE IF NOT EXISTS ninja_pool_online_rate_limits (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      action VARCHAR(20) NOT NULL,
      window_started_at TIMESTAMP NOT NULL DEFAULT NOW(),
      count INTEGER NOT NULL DEFAULT 1,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_ninja_pool_online_rate UNIQUE (tenant_id, user_id, action),
      CONSTRAINT ninja_pool_online_rate_action_check CHECK (action IN ('host','join','shot')),
      CONSTRAINT ninja_pool_online_rate_count_check CHECK (count BETWEEN 1 AND 10000)
    );
    CREATE INDEX IF NOT EXISTS idx_ninja_pool_online_rate_updated
      ON ninja_pool_online_rate_limits(updated_at);
  `);
}
