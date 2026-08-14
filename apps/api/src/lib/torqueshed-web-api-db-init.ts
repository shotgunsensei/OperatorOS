import { db } from '../db.js';

/** Additive Phase 28 storage for the restored TorqueShed web/API product. */
export async function ensureTorqueShedWebApiTables(): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS torqueshed_build_journal_entries (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id), build_id VARCHAR(36) NOT NULL,
      author_user_id VARCHAR(36) NOT NULL REFERENCES users(id), stage_id VARCHAR(36),
      entry_type VARCHAR(30) NOT NULL DEFAULT 'entry', title VARCHAR(180) NOT NULL, body TEXT,
      mileage INTEGER, cost_minor INTEGER, labor_minutes INTEGER,
      visibility VARCHAR(20) NOT NULL DEFAULT 'private', occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), archived_at TIMESTAMPTZ,
      CONSTRAINT torqueshed_journal_build_fk FOREIGN KEY (tenant_id, build_id) REFERENCES torqueshed_builds(tenant_id, id),
      CONSTRAINT torqueshed_journal_stage_fk FOREIGN KEY (tenant_id, build_id, stage_id) REFERENCES torqueshed_build_stages(tenant_id, build_id, id),
      CONSTRAINT uq_torqueshed_journal_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT torqueshed_journal_type_check CHECK (entry_type IN ('entry','milestone','stage_update','part_update','cost_update')),
      CONSTRAINT torqueshed_journal_visibility_check CHECK (visibility IN ('private','tenant','public')),
      CONSTRAINT torqueshed_journal_numbers_check CHECK ((mileage IS NULL OR mileage BETWEEN 0 AND 10000000) AND COALESCE(cost_minor,0) >= 0 AND COALESCE(labor_minutes,0) >= 0),
      CONSTRAINT torqueshed_journal_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_torqueshed_journal_build ON torqueshed_build_journal_entries(tenant_id, build_id, occurred_at DESC, archived_at);

    CREATE TABLE IF NOT EXISTS torqueshed_build_parts (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id), build_id VARCHAR(36) NOT NULL, stage_id VARCHAR(36),
      name VARCHAR(180) NOT NULL, manufacturer VARCHAR(120), part_number VARCHAR(120), category VARCHAR(80),
      status VARCHAR(20) NOT NULL DEFAULT 'planned', quantity INTEGER NOT NULL DEFAULT 1,
      unit_cost_minor INTEGER, currency CHAR(3) NOT NULL DEFAULT 'USD', installed_at TIMESTAMPTZ, notes TEXT,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), archived_at TIMESTAMPTZ,
      CONSTRAINT torqueshed_build_part_build_fk FOREIGN KEY (tenant_id, build_id) REFERENCES torqueshed_builds(tenant_id, id),
      CONSTRAINT torqueshed_build_part_stage_fk FOREIGN KEY (tenant_id, build_id, stage_id) REFERENCES torqueshed_build_stages(tenant_id, build_id, id),
      CONSTRAINT uq_torqueshed_build_parts_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT torqueshed_build_part_status_check CHECK (status IN ('planned','ordered','installed','removed')),
      CONSTRAINT torqueshed_build_part_numbers_check CHECK (quantity BETWEEN 1 AND 100000 AND (unit_cost_minor IS NULL OR unit_cost_minor >= 0)),
      CONSTRAINT torqueshed_build_part_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_torqueshed_build_parts_build ON torqueshed_build_parts(tenant_id, build_id, status, archived_at);

    CREATE TABLE IF NOT EXISTS torqueshed_live_bays (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      owner_user_id VARCHAR(36) NOT NULL REFERENCES users(id), vehicle_id VARCHAR(36), build_id VARCHAR(36), diagnostic_session_id VARCHAR(36),
      title VARCHAR(180) NOT NULL, visibility VARCHAR(20) NOT NULL DEFAULT 'private', status VARCHAR(20) NOT NULL DEFAULT 'active',
      last_sequence INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), closed_at TIMESTAMPTZ,
      CONSTRAINT torqueshed_live_bay_vehicle_fk FOREIGN KEY (tenant_id, vehicle_id) REFERENCES torqueshed_vehicles(tenant_id, id),
      CONSTRAINT torqueshed_live_bay_build_fk FOREIGN KEY (tenant_id, build_id) REFERENCES torqueshed_builds(tenant_id, id),
      CONSTRAINT torqueshed_live_bay_diagnostic_fk FOREIGN KEY (tenant_id, diagnostic_session_id) REFERENCES torqueshed_diagnostic_sessions(tenant_id, id),
      CONSTRAINT uq_torqueshed_live_bays_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT torqueshed_live_bay_visibility_check CHECK (visibility IN ('private','tenant')),
      CONSTRAINT torqueshed_live_bay_status_check CHECK (status IN ('active','closed')),
      CONSTRAINT torqueshed_live_bay_sequence_check CHECK (last_sequence >= 0)
    );
    CREATE INDEX IF NOT EXISTS idx_torqueshed_live_bays_tenant ON torqueshed_live_bays(tenant_id, status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS torqueshed_live_bay_members (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      bay_id VARCHAR(36) NOT NULL, user_id VARCHAR(36) NOT NULL REFERENCES users(id), role VARCHAR(20) NOT NULL DEFAULT 'collaborator',
      last_seen_sequence INTEGER NOT NULL DEFAULT 0, joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), left_at TIMESTAMPTZ,
      CONSTRAINT torqueshed_live_bay_member_bay_fk FOREIGN KEY (tenant_id, bay_id) REFERENCES torqueshed_live_bays(tenant_id, id),
      CONSTRAINT uq_torqueshed_live_bay_member UNIQUE (tenant_id, bay_id, user_id),
      CONSTRAINT uq_torqueshed_live_bay_members_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT torqueshed_live_bay_member_role_check CHECK (role IN ('owner','collaborator','viewer')),
      CONSTRAINT torqueshed_live_bay_member_sequence_check CHECK (last_seen_sequence >= 0)
    );

    CREATE TABLE IF NOT EXISTS torqueshed_live_bay_messages (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      bay_id VARCHAR(36) NOT NULL, sequence INTEGER NOT NULL, sender_user_id VARCHAR(36) REFERENCES users(id),
      client_message_id VARCHAR(120) NOT NULL, kind VARCHAR(20) NOT NULL DEFAULT 'message', body TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      edited_at TIMESTAMPTZ, archived_at TIMESTAMPTZ,
      CONSTRAINT torqueshed_live_bay_message_bay_fk FOREIGN KEY (tenant_id, bay_id) REFERENCES torqueshed_live_bays(tenant_id, id),
      CONSTRAINT uq_torqueshed_live_bay_message_sequence UNIQUE (tenant_id, bay_id, sequence),
      CONSTRAINT uq_torqueshed_live_bay_message_client UNIQUE (tenant_id, bay_id, sender_user_id, client_message_id),
      CONSTRAINT uq_torqueshed_live_bay_messages_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT torqueshed_live_bay_message_kind_check CHECK (kind IN ('message','evidence','system')),
      CONSTRAINT torqueshed_live_bay_message_body_check CHECK (length(body) BETWEEN 1 AND 5000),
      CONSTRAINT torqueshed_live_bay_message_metadata_check CHECK (jsonb_typeof(metadata) = 'object')
    );
    CREATE INDEX IF NOT EXISTS idx_torqueshed_live_bay_messages_cursor ON torqueshed_live_bay_messages(tenant_id, bay_id, sequence);

    CREATE TABLE IF NOT EXISTS torqueshed_live_bay_rate_windows (
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id), user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      window_started_at TIMESTAMPTZ NOT NULL, message_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (tenant_id, user_id, window_started_at),
      CONSTRAINT torqueshed_live_bay_rate_count_check CHECK (message_count BETWEEN 0 AND 10000)
    );

    CREATE TABLE IF NOT EXISTS torqueshed_share_links (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      token_hash CHAR(64) NOT NULL UNIQUE, resource_type VARCHAR(40) NOT NULL, resource_id VARCHAR(36) NOT NULL,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), allow_download BOOLEAN NOT NULL DEFAULT FALSE,
      expires_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ, access_count INTEGER NOT NULL DEFAULT 0,
      last_accessed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_torqueshed_share_links_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT torqueshed_share_resource_check CHECK (resource_type IN ('build','diagnostic_report','vehicle_history','community_post','marketplace_listing')),
      CONSTRAINT torqueshed_share_access_check CHECK (access_count >= 0)
    );
    CREATE INDEX IF NOT EXISTS idx_torqueshed_share_resource ON torqueshed_share_links(tenant_id, resource_type, resource_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS torqueshed_user_settings (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id), units VARCHAR(10) NOT NULL DEFAULT 'imperial',
      reduced_motion BOOLEAN NOT NULL DEFAULT FALSE, default_garage_visibility VARCHAR(20) NOT NULL DEFAULT 'private',
      profile_discoverable BOOLEAN NOT NULL DEFAULT TRUE, community_notifications BOOLEAN NOT NULL DEFAULT TRUE,
      marketplace_notifications BOOLEAN NOT NULL DEFAULT TRUE, garage_notifications BOOLEAN NOT NULL DEFAULT TRUE,
      version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_torqueshed_user_settings UNIQUE (tenant_id, user_id),
      CONSTRAINT uq_torqueshed_user_settings_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT torqueshed_user_units_check CHECK (units IN ('imperial','metric')),
      CONSTRAINT torqueshed_user_visibility_check CHECK (default_garage_visibility IN ('private','tenant','public_build'))
    );
  `);
}
