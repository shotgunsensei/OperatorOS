import { db } from '../db.js';

/**
 * Additive, idempotent PulseDesk healthcare-operations service-desk release.
 *
 * Shared Directory owns organizations, contacts, sites, and vendors. Shared
 * services own files and notifications. No patient, clinical, auth, billing,
 * credential, or provider-authority table is created here. Rollback follows
 * the root restore-to-new-database contract.
 */
export async function ensurePulseDeskTables(): Promise<void> {
  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_directory_contacts_tenant_id ON directory_contacts(tenant_id, id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_directory_sites_tenant_org_id ON directory_sites(tenant_id, organization_id, id);

    ALTER TABLE pulsedesk_departments ADD COLUMN IF NOT EXISTS directory_organization_id VARCHAR(36) REFERENCES directory_organizations(id) ON DELETE SET NULL;
    ALTER TABLE pulsedesk_departments ADD COLUMN IF NOT EXISTS directory_site_id VARCHAR(36) REFERENCES directory_sites(id) ON DELETE SET NULL;
    ALTER TABLE pulsedesk_departments ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE pulsedesk_departments ADD COLUMN IF NOT EXISTS updated_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE pulsedesk_departments ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE pulsedesk_departments ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_pulsedesk_departments_tenant_id ON pulsedesk_departments(tenant_id, id);
    CREATE INDEX IF NOT EXISTS idx_pulsedesk_departments_tenant_site ON pulsedesk_departments(tenant_id, directory_site_id);
    DO $$ BEGIN
      ALTER TABLE pulsedesk_departments ADD CONSTRAINT pulsedesk_departments_org_tenant_fk
        FOREIGN KEY (tenant_id, directory_organization_id) REFERENCES directory_organizations(tenant_id, id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE pulsedesk_departments ADD CONSTRAINT pulsedesk_departments_site_tenant_fk
        FOREIGN KEY (tenant_id, directory_site_id) REFERENCES directory_sites(tenant_id, id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE pulsedesk_departments ADD CONSTRAINT pulsedesk_departments_site_org_fk
        FOREIGN KEY (tenant_id, directory_organization_id, directory_site_id) REFERENCES directory_sites(tenant_id, organization_id, id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE pulsedesk_departments ADD CONSTRAINT pulsedesk_departments_site_org_check
        CHECK (directory_site_id IS NULL OR directory_organization_id IS NOT NULL);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE pulsedesk_departments ADD CONSTRAINT pulsedesk_departments_version_check CHECK (version >= 1);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS pulsedesk_queues (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL, description TEXT, active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(), archived_at TIMESTAMP,
      CONSTRAINT uq_pulsedesk_queues_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT pulsedesk_queues_name_check CHECK (char_length(name) BETWEEN 2 AND 100),
      CONSTRAINT pulsedesk_queues_description_check CHECK (description IS NULL OR char_length(description) <= 500),
      CONSTRAINT pulsedesk_queues_version_check CHECK (version >= 1)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_pulsedesk_queues_tenant_name ON pulsedesk_queues(tenant_id, lower(name)) WHERE archived_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_pulsedesk_queues_tenant_active ON pulsedesk_queues(tenant_id, active, archived_at);

    CREATE TABLE IF NOT EXISTS pulsedesk_teams (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id), queue_id VARCHAR(36),
      name TEXT NOT NULL, description TEXT, active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(), archived_at TIMESTAMP,
      CONSTRAINT uq_pulsedesk_teams_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT pulsedesk_teams_queue_fk FOREIGN KEY (tenant_id, queue_id) REFERENCES pulsedesk_queues(tenant_id, id),
      CONSTRAINT pulsedesk_teams_name_check CHECK (char_length(name) BETWEEN 2 AND 100),
      CONSTRAINT pulsedesk_teams_description_check CHECK (description IS NULL OR char_length(description) <= 500),
      CONSTRAINT pulsedesk_teams_version_check CHECK (version >= 1)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_pulsedesk_teams_tenant_name ON pulsedesk_teams(tenant_id, lower(name)) WHERE archived_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_pulsedesk_teams_tenant_queue ON pulsedesk_teams(tenant_id, queue_id, active);

    CREATE TABLE IF NOT EXISTS pulsedesk_team_members (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      team_id VARCHAR(36) NOT NULL, user_id VARCHAR(36) NOT NULL REFERENCES users(id), lead BOOLEAN NOT NULL DEFAULT FALSE,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT pulsedesk_team_members_team_fk FOREIGN KEY (tenant_id, team_id) REFERENCES pulsedesk_teams(tenant_id, id) ON DELETE CASCADE,
      CONSTRAINT uq_pulsedesk_team_members UNIQUE (tenant_id, team_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_pulsedesk_team_members_user ON pulsedesk_team_members(tenant_id, user_id);

    CREATE TABLE IF NOT EXISTS pulsedesk_ticket_options (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      kind TEXT NOT NULL, key VARCHAR(80) NOT NULL, name TEXT NOT NULL, color VARCHAR(7), sort_order INTEGER NOT NULL DEFAULT 0,
      response_minutes INTEGER, resolution_minutes INTEGER, closed_state BOOLEAN NOT NULL DEFAULT FALSE, active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(), archived_at TIMESTAMP,
      CONSTRAINT uq_pulsedesk_ticket_options_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT pulsedesk_ticket_options_kind_check CHECK (kind IN ('status','priority','type','category')),
      CONSTRAINT pulsedesk_ticket_options_key_check CHECK (key ~ '^[a-z][a-z0-9_]{1,79}$'),
      CONSTRAINT pulsedesk_ticket_options_name_check CHECK (char_length(name) BETWEEN 1 AND 100),
      CONSTRAINT pulsedesk_ticket_options_color_check CHECK (color IS NULL OR color ~ '^#[0-9a-fA-F]{6}$'),
      CONSTRAINT pulsedesk_ticket_options_response_check CHECK (response_minutes IS NULL OR response_minutes BETWEEN 1 AND 525600),
      CONSTRAINT pulsedesk_ticket_options_resolution_check CHECK (resolution_minutes IS NULL OR resolution_minutes BETWEEN 1 AND 525600),
      CONSTRAINT pulsedesk_ticket_options_version_check CHECK (version >= 1)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_pulsedesk_ticket_options_tenant_kind_key ON pulsedesk_ticket_options(tenant_id, kind, key) WHERE archived_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_pulsedesk_ticket_options_tenant_kind ON pulsedesk_ticket_options(tenant_id, kind, active, sort_order);

    CREATE TABLE IF NOT EXISTS pulsedesk_sla_policies (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL, description TEXT, response_minutes INTEGER NOT NULL DEFAULT 240, resolution_minutes INTEGER NOT NULL DEFAULT 1440,
      at_risk_percent INTEGER NOT NULL DEFAULT 80, default_policy BOOLEAN NOT NULL DEFAULT FALSE, active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(), archived_at TIMESTAMP,
      CONSTRAINT uq_pulsedesk_sla_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT pulsedesk_sla_name_check CHECK (char_length(name) BETWEEN 2 AND 120),
      CONSTRAINT pulsedesk_sla_response_check CHECK (response_minutes BETWEEN 1 AND 525600),
      CONSTRAINT pulsedesk_sla_resolution_check CHECK (resolution_minutes BETWEEN response_minutes AND 525600),
      CONSTRAINT pulsedesk_sla_risk_check CHECK (at_risk_percent BETWEEN 1 AND 99),
      CONSTRAINT pulsedesk_sla_version_check CHECK (version >= 1)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_pulsedesk_sla_tenant_name ON pulsedesk_sla_policies(tenant_id, lower(name)) WHERE archived_at IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_pulsedesk_sla_tenant_default ON pulsedesk_sla_policies(tenant_id) WHERE default_policy = TRUE AND archived_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_pulsedesk_sla_tenant_active ON pulsedesk_sla_policies(tenant_id, active);

    CREATE TABLE IF NOT EXISTS pulsedesk_assets (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      directory_organization_id VARCHAR(36), directory_site_id VARCHAR(36), department_id VARCHAR(36),
      asset_tag VARCHAR(100) NOT NULL, name TEXT NOT NULL, equipment_type VARCHAR(100) NOT NULL DEFAULT 'operational_equipment',
      manufacturer TEXT, model TEXT, serial_number TEXT, location_label TEXT, status TEXT NOT NULL DEFAULT 'active', maintenance_due_at TIMESTAMP,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(), archived_at TIMESTAMP,
      CONSTRAINT uq_pulsedesk_assets_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT pulsedesk_assets_org_fk FOREIGN KEY (tenant_id, directory_organization_id) REFERENCES directory_organizations(tenant_id, id),
      CONSTRAINT pulsedesk_assets_site_fk FOREIGN KEY (tenant_id, directory_site_id) REFERENCES directory_sites(tenant_id, id),
      CONSTRAINT pulsedesk_assets_site_org_fk FOREIGN KEY (tenant_id, directory_organization_id, directory_site_id) REFERENCES directory_sites(tenant_id, organization_id, id),
      CONSTRAINT pulsedesk_assets_department_fk FOREIGN KEY (tenant_id, department_id) REFERENCES pulsedesk_departments(tenant_id, id),
      CONSTRAINT pulsedesk_assets_site_org_check CHECK (directory_site_id IS NULL OR directory_organization_id IS NOT NULL),
      CONSTRAINT pulsedesk_assets_tag_check CHECK (char_length(asset_tag) BETWEEN 1 AND 100),
      CONSTRAINT pulsedesk_assets_name_check CHECK (char_length(name) BETWEEN 2 AND 200),
      CONSTRAINT pulsedesk_assets_type_check CHECK (equipment_type ~ '^[a-z][a-z0-9_]{1,99}$'),
      CONSTRAINT pulsedesk_assets_status_check CHECK (status IN ('active','maintenance','out_of_service','retired')),
      CONSTRAINT pulsedesk_assets_version_check CHECK (version >= 1)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_pulsedesk_assets_tenant_tag ON pulsedesk_assets(tenant_id, lower(asset_tag)) WHERE archived_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_pulsedesk_assets_tenant_site ON pulsedesk_assets(tenant_id, directory_site_id, status);
    CREATE INDEX IF NOT EXISTS idx_pulsedesk_assets_tenant_department ON pulsedesk_assets(tenant_id, department_id);

    ALTER TABLE pulsedesk_requests ADD COLUMN IF NOT EXISTS directory_organization_id VARCHAR(36) REFERENCES directory_organizations(id) ON DELETE SET NULL;
    ALTER TABLE pulsedesk_requests ADD COLUMN IF NOT EXISTS directory_site_id VARCHAR(36) REFERENCES directory_sites(id) ON DELETE SET NULL;
    ALTER TABLE pulsedesk_requests ADD COLUMN IF NOT EXISTS requester_contact_id VARCHAR(36) REFERENCES directory_contacts(id) ON DELETE SET NULL;
    ALTER TABLE pulsedesk_requests ADD COLUMN IF NOT EXISTS queue_id VARCHAR(36);
    ALTER TABLE pulsedesk_requests ADD COLUMN IF NOT EXISTS team_id VARCHAR(36);
    ALTER TABLE pulsedesk_requests ADD COLUMN IF NOT EXISTS asset_id VARCHAR(36);
    ALTER TABLE pulsedesk_requests ADD COLUMN IF NOT EXISTS sla_policy_id VARCHAR(36);
    ALTER TABLE pulsedesk_requests ADD COLUMN IF NOT EXISTS ticket_type_key VARCHAR(80) NOT NULL DEFAULT 'service_request';
    ALTER TABLE pulsedesk_requests ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
    ALTER TABLE pulsedesk_requests ADD COLUMN IF NOT EXISTS response_due_at TIMESTAMP;
    ALTER TABLE pulsedesk_requests ADD COLUMN IF NOT EXISTS resolution_due_at TIMESTAMP;
    ALTER TABLE pulsedesk_requests ADD COLUMN IF NOT EXISTS first_responded_at TIMESTAMP;
    ALTER TABLE pulsedesk_requests ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP;
    ALTER TABLE pulsedesk_requests ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP;
    ALTER TABLE pulsedesk_requests ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMP;
    ALTER TABLE pulsedesk_requests ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;
    ALTER TABLE pulsedesk_requests ADD COLUMN IF NOT EXISTS updated_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_pulsedesk_requests_tenant_id ON pulsedesk_requests(tenant_id, id);
    CREATE INDEX IF NOT EXISTS idx_pulsedesk_requests_tenant_org_site ON pulsedesk_requests(tenant_id, directory_organization_id, directory_site_id);
    CREATE INDEX IF NOT EXISTS idx_pulsedesk_requests_tenant_queue ON pulsedesk_requests(tenant_id, queue_id, status);
    CREATE INDEX IF NOT EXISTS idx_pulsedesk_requests_tenant_sla ON pulsedesk_requests(tenant_id, resolution_due_at, status);
    DO $$ BEGIN
      ALTER TABLE pulsedesk_requests ADD CONSTRAINT pulsedesk_requests_org_fk
        FOREIGN KEY (tenant_id, directory_organization_id) REFERENCES directory_organizations(tenant_id, id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE pulsedesk_requests ADD CONSTRAINT pulsedesk_requests_site_fk
        FOREIGN KEY (tenant_id, directory_site_id) REFERENCES directory_sites(tenant_id, id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE pulsedesk_requests ADD CONSTRAINT pulsedesk_requests_site_org_fk
        FOREIGN KEY (tenant_id, directory_organization_id, directory_site_id) REFERENCES directory_sites(tenant_id, organization_id, id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE pulsedesk_requests ADD CONSTRAINT pulsedesk_requests_contact_fk
        FOREIGN KEY (tenant_id, requester_contact_id) REFERENCES directory_contacts(tenant_id, id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE pulsedesk_requests ADD CONSTRAINT pulsedesk_requests_queue_fk
        FOREIGN KEY (tenant_id, queue_id) REFERENCES pulsedesk_queues(tenant_id, id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE pulsedesk_requests ADD CONSTRAINT pulsedesk_requests_team_fk
        FOREIGN KEY (tenant_id, team_id) REFERENCES pulsedesk_teams(tenant_id, id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE pulsedesk_requests ADD CONSTRAINT pulsedesk_requests_asset_fk
        FOREIGN KEY (tenant_id, asset_id) REFERENCES pulsedesk_assets(tenant_id, id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE pulsedesk_requests ADD CONSTRAINT pulsedesk_requests_sla_fk
        FOREIGN KEY (tenant_id, sla_policy_id) REFERENCES pulsedesk_sla_policies(tenant_id, id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE pulsedesk_requests ADD CONSTRAINT pulsedesk_requests_site_org_check
        CHECK (directory_site_id IS NULL OR directory_organization_id IS NOT NULL);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE pulsedesk_requests ADD CONSTRAINT pulsedesk_requests_description_check CHECK (char_length(description) <= 10000);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE pulsedesk_requests ADD CONSTRAINT pulsedesk_requests_ticket_type_check CHECK (ticket_type_key ~ '^[a-z][a-z0-9_]{1,79}$');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    ALTER TABLE pulsedesk_request_events ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'requester';
    ALTER TABLE pulsedesk_request_events DROP CONSTRAINT IF EXISTS pulsedesk_request_events_type_check;
    DO $$ BEGIN
      ALTER TABLE pulsedesk_request_events ADD CONSTRAINT pulsedesk_request_events_type_check CHECK (event_type IN (
        'created','updated','department_changed','assignee_changed','priority_changed','status_changed','escalated',
        'assignment_changed','requester_reply_added','internal_note_added','time_logged','sla_changed','vendor_updated',
        'attachment_added','reopened','archived'
      ));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE pulsedesk_request_events ADD CONSTRAINT pulsedesk_request_events_visibility_check CHECK (visibility IN ('requester','internal'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS pulsedesk_ticket_messages (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id), ticket_id VARCHAR(36) NOT NULL,
      author_user_id VARCHAR(36) NOT NULL REFERENCES users(id), visibility TEXT NOT NULL, body TEXT NOT NULL, idempotency_key VARCHAR(160) NOT NULL,
      version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(), deleted_at TIMESTAMP,
      CONSTRAINT pulsedesk_ticket_messages_ticket_fk FOREIGN KEY (tenant_id, ticket_id) REFERENCES pulsedesk_requests(tenant_id, id),
      CONSTRAINT pulsedesk_ticket_messages_visibility_check CHECK (visibility IN ('requester','internal')),
      CONSTRAINT pulsedesk_ticket_messages_body_check CHECK (char_length(body) BETWEEN 1 AND 10000),
      CONSTRAINT pulsedesk_ticket_messages_key_check CHECK (char_length(idempotency_key) BETWEEN 8 AND 160),
      CONSTRAINT pulsedesk_ticket_messages_version_check CHECK (version >= 1),
      CONSTRAINT uq_pulsedesk_ticket_messages_idempotency UNIQUE (tenant_id, ticket_id, idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS idx_pulsedesk_ticket_messages_ticket ON pulsedesk_ticket_messages(tenant_id, ticket_id, created_at);

    CREATE TABLE IF NOT EXISTS pulsedesk_ticket_assignments (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id), ticket_id VARCHAR(36) NOT NULL,
      assigned_to_user_id VARCHAR(36) REFERENCES users(id), queue_id VARCHAR(36), team_id VARCHAR(36), assigned_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      assigned_at TIMESTAMP NOT NULL DEFAULT NOW(), ended_at TIMESTAMP,
      CONSTRAINT pulsedesk_ticket_assignments_ticket_fk FOREIGN KEY (tenant_id, ticket_id) REFERENCES pulsedesk_requests(tenant_id, id),
      CONSTRAINT pulsedesk_ticket_assignments_queue_fk FOREIGN KEY (tenant_id, queue_id) REFERENCES pulsedesk_queues(tenant_id, id),
      CONSTRAINT pulsedesk_ticket_assignments_team_fk FOREIGN KEY (tenant_id, team_id) REFERENCES pulsedesk_teams(tenant_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_pulsedesk_assignments_ticket ON pulsedesk_ticket_assignments(tenant_id, ticket_id, assigned_at);
    CREATE INDEX IF NOT EXISTS idx_pulsedesk_assignments_user ON pulsedesk_ticket_assignments(tenant_id, assigned_to_user_id, ended_at);

    CREATE TABLE IF NOT EXISTS pulsedesk_time_entries (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id), ticket_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL REFERENCES users(id), minutes INTEGER NOT NULL, work_type TEXT NOT NULL DEFAULT 'onsite', description TEXT,
      idempotency_key VARCHAR(160) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT pulsedesk_time_ticket_fk FOREIGN KEY (tenant_id, ticket_id) REFERENCES pulsedesk_requests(tenant_id, id),
      CONSTRAINT pulsedesk_time_minutes_check CHECK (minutes BETWEEN 1 AND 1440),
      CONSTRAINT pulsedesk_time_work_type_check CHECK (work_type IN ('remote','onsite','vendor','administrative')),
      CONSTRAINT pulsedesk_time_description_check CHECK (description IS NULL OR char_length(description) <= 2000),
      CONSTRAINT pulsedesk_time_key_check CHECK (char_length(idempotency_key) BETWEEN 8 AND 160),
      CONSTRAINT uq_pulsedesk_time_idempotency UNIQUE (tenant_id, ticket_id, idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS idx_pulsedesk_time_ticket ON pulsedesk_time_entries(tenant_id, ticket_id, created_at);

    CREATE TABLE IF NOT EXISTS pulsedesk_sla_events (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id), ticket_id VARCHAR(36) NOT NULL,
      sla_policy_id VARCHAR(36), event_type TEXT NOT NULL, target_at TIMESTAMP, occurred_at TIMESTAMP NOT NULL DEFAULT NOW(), metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      CONSTRAINT pulsedesk_sla_events_ticket_fk FOREIGN KEY (tenant_id, ticket_id) REFERENCES pulsedesk_requests(tenant_id, id),
      CONSTRAINT pulsedesk_sla_events_policy_fk FOREIGN KEY (tenant_id, sla_policy_id) REFERENCES pulsedesk_sla_policies(tenant_id, id),
      CONSTRAINT pulsedesk_sla_events_type_check CHECK (event_type IN ('applied','first_response','at_risk','overdue','resolved','reopened')),
      CONSTRAINT pulsedesk_sla_events_metadata_check CHECK (jsonb_typeof(metadata) = 'object')
    );
    CREATE INDEX IF NOT EXISTS idx_pulsedesk_sla_events_ticket ON pulsedesk_sla_events(tenant_id, ticket_id, occurred_at);

    CREATE TABLE IF NOT EXISTS pulsedesk_vendor_engagements (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id), ticket_id VARCHAR(36) NOT NULL,
      vendor_organization_id VARCHAR(36) NOT NULL, status TEXT NOT NULL DEFAULT 'requested', reference_code VARCHAR(120), expected_at TIMESTAMP,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_pulsedesk_vendor_engagement_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT pulsedesk_vendor_ticket_fk FOREIGN KEY (tenant_id, ticket_id) REFERENCES pulsedesk_requests(tenant_id, id),
      CONSTRAINT pulsedesk_vendor_org_fk FOREIGN KEY (tenant_id, vendor_organization_id) REFERENCES directory_organizations(tenant_id, id),
      CONSTRAINT pulsedesk_vendor_status_check CHECK (status IN ('requested','acknowledged','scheduled','waiting','completed','cancelled')),
      CONSTRAINT pulsedesk_vendor_reference_check CHECK (reference_code IS NULL OR char_length(reference_code) <= 120),
      CONSTRAINT pulsedesk_vendor_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_pulsedesk_vendor_ticket ON pulsedesk_vendor_engagements(tenant_id, ticket_id);
    CREATE INDEX IF NOT EXISTS idx_pulsedesk_vendor_org ON pulsedesk_vendor_engagements(tenant_id, vendor_organization_id, status);

    CREATE TABLE IF NOT EXISTS pulsedesk_supply_requests (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id), ticket_id VARCHAR(36), department_id VARCHAR(36),
      item_name TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 1, urgency TEXT NOT NULL DEFAULT 'normal', status TEXT NOT NULL DEFAULT 'requested',
      requested_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(), archived_at TIMESTAMP,
      CONSTRAINT uq_pulsedesk_supply_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT pulsedesk_supply_ticket_fk FOREIGN KEY (tenant_id, ticket_id) REFERENCES pulsedesk_requests(tenant_id, id),
      CONSTRAINT pulsedesk_supply_department_fk FOREIGN KEY (tenant_id, department_id) REFERENCES pulsedesk_departments(tenant_id, id),
      CONSTRAINT pulsedesk_supply_name_check CHECK (char_length(item_name) BETWEEN 2 AND 200),
      CONSTRAINT pulsedesk_supply_quantity_check CHECK (quantity BETWEEN 1 AND 100000),
      CONSTRAINT pulsedesk_supply_urgency_check CHECK (urgency IN ('critical','high','normal','low')),
      CONSTRAINT pulsedesk_supply_status_check CHECK (status IN ('requested','approved','ordered','received','cancelled')),
      CONSTRAINT pulsedesk_supply_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_pulsedesk_supply_tenant_status ON pulsedesk_supply_requests(tenant_id, status, created_at);

    CREATE TABLE IF NOT EXISTS pulsedesk_facility_requests (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id), ticket_id VARCHAR(36),
      directory_site_id VARCHAR(36), department_id VARCHAR(36), request_type VARCHAR(80) NOT NULL DEFAULT 'maintenance', title TEXT NOT NULL,
      location_label TEXT, priority TEXT NOT NULL DEFAULT 'normal', status TEXT NOT NULL DEFAULT 'new',
      requested_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), assigned_to_user_id VARCHAR(36) REFERENCES users(id),
      updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(), archived_at TIMESTAMP,
      CONSTRAINT uq_pulsedesk_facility_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT pulsedesk_facility_ticket_fk FOREIGN KEY (tenant_id, ticket_id) REFERENCES pulsedesk_requests(tenant_id, id),
      CONSTRAINT pulsedesk_facility_site_fk FOREIGN KEY (tenant_id, directory_site_id) REFERENCES directory_sites(tenant_id, id),
      CONSTRAINT pulsedesk_facility_department_fk FOREIGN KEY (tenant_id, department_id) REFERENCES pulsedesk_departments(tenant_id, id),
      CONSTRAINT pulsedesk_facility_type_check CHECK (request_type ~ '^[a-z][a-z0-9_]{1,79}$'),
      CONSTRAINT pulsedesk_facility_title_check CHECK (char_length(title) BETWEEN 2 AND 200),
      CONSTRAINT pulsedesk_facility_location_check CHECK (location_label IS NULL OR char_length(location_label) <= 120),
      CONSTRAINT pulsedesk_facility_priority_check CHECK (priority IN ('critical','high','normal','low')),
      CONSTRAINT pulsedesk_facility_status_check CHECK (status IN ('new','assigned','in_progress','resolved','closed','cancelled')),
      CONSTRAINT pulsedesk_facility_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_pulsedesk_facility_tenant_status ON pulsedesk_facility_requests(tenant_id, status, created_at);

    CREATE TABLE IF NOT EXISTS pulsedesk_tags (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id), name TEXT NOT NULL, color VARCHAR(7),
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_pulsedesk_tags_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT pulsedesk_tags_name_check CHECK (char_length(name) BETWEEN 1 AND 80),
      CONSTRAINT pulsedesk_tags_color_check CHECK (color IS NULL OR color ~ '^#[0-9a-fA-F]{6}$')
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_pulsedesk_tags_tenant_name ON pulsedesk_tags(tenant_id, lower(name));

    CREATE TABLE IF NOT EXISTS pulsedesk_ticket_tags (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id), ticket_id VARCHAR(36) NOT NULL,
      tag_id VARCHAR(36) NOT NULL, created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT pulsedesk_ticket_tags_ticket_fk FOREIGN KEY (tenant_id, ticket_id) REFERENCES pulsedesk_requests(tenant_id, id),
      CONSTRAINT pulsedesk_ticket_tags_tag_fk FOREIGN KEY (tenant_id, tag_id) REFERENCES pulsedesk_tags(tenant_id, id) ON DELETE CASCADE,
      CONSTRAINT uq_pulsedesk_ticket_tags UNIQUE (tenant_id, ticket_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS pulsedesk_saved_views (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id), user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      name TEXT NOT NULL, filters JSONB NOT NULL DEFAULT '{}'::jsonb, sort JSONB NOT NULL DEFAULT '{"field":"updatedAt","direction":"desc"}'::jsonb,
      shared BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT pulsedesk_saved_views_name_check CHECK (char_length(name) BETWEEN 1 AND 100),
      CONSTRAINT pulsedesk_saved_views_filters_check CHECK (jsonb_typeof(filters) = 'object'),
      CONSTRAINT pulsedesk_saved_views_sort_check CHECK (jsonb_typeof(sort) = 'object'),
      CONSTRAINT uq_pulsedesk_saved_views_user_name UNIQUE (tenant_id, user_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_pulsedesk_saved_views_tenant_shared ON pulsedesk_saved_views(tenant_id, shared);

    CREATE TABLE IF NOT EXISTS pulsedesk_knowledge_articles (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id), slug VARCHAR(120) NOT NULL,
      title TEXT NOT NULL, summary TEXT, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', visibility TEXT NOT NULL DEFAULT 'internal',
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1, published_at TIMESTAMP, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(), archived_at TIMESTAMP,
      CONSTRAINT uq_pulsedesk_knowledge_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT pulsedesk_knowledge_slug_check CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,119}$'),
      CONSTRAINT pulsedesk_knowledge_title_check CHECK (char_length(title) BETWEEN 2 AND 200),
      CONSTRAINT pulsedesk_knowledge_summary_check CHECK (summary IS NULL OR char_length(summary) <= 500),
      CONSTRAINT pulsedesk_knowledge_body_check CHECK (char_length(body) BETWEEN 1 AND 20000),
      CONSTRAINT pulsedesk_knowledge_status_check CHECK (status IN ('draft','published','archived')),
      CONSTRAINT pulsedesk_knowledge_visibility_check CHECK (visibility IN ('requester','internal')),
      CONSTRAINT pulsedesk_knowledge_version_check CHECK (version >= 1)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_pulsedesk_knowledge_tenant_slug ON pulsedesk_knowledge_articles(tenant_id, slug) WHERE archived_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_pulsedesk_knowledge_tenant_status ON pulsedesk_knowledge_articles(tenant_id, status, visibility);

    CREATE TABLE IF NOT EXISTS pulsedesk_notification_preferences (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id), user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE, email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      event_preferences JSONB NOT NULL DEFAULT '{}'::jsonb, version INTEGER NOT NULL DEFAULT 1, updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT pulsedesk_notification_preferences_events_check CHECK (jsonb_typeof(event_preferences) = 'object'),
      CONSTRAINT pulsedesk_notification_preferences_version_check CHECK (version >= 1),
      CONSTRAINT uq_pulsedesk_notification_preferences_user UNIQUE (tenant_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS pulsedesk_migration_refs (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      source_type VARCHAR(80) NOT NULL, source_id VARCHAR(160) NOT NULL, target_type VARCHAR(80) NOT NULL, target_id VARCHAR(36) NOT NULL,
      source_hash VARCHAR(64) NOT NULL, imported_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT pulsedesk_migration_hash_check CHECK (source_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT uq_pulsedesk_migration_source UNIQUE (tenant_id, source_type, source_id)
    );
  `);
}
