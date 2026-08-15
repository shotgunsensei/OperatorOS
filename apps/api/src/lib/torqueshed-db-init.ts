import { db } from '../db.js';

/**
 * Additive, idempotent TorqueShed automotive-foundation release.
 *
 * OperatorOS remains authoritative for users, tenants, memberships, module
 * access, sessions, billing, files, notifications, and audit. VINs are not
 * retained verbatim: only a tenant-unique SHA-256 fingerprint and masked
 * suffix are stored. Rollback uses the root restore-to-new-database contract.
 */
export async function ensureTorqueShedTables(): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS torqueshed_vehicles (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      owner_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      nickname VARCHAR(100), year INTEGER NOT NULL, make VARCHAR(100) NOT NULL,
      model VARCHAR(100) NOT NULL, trim VARCHAR(100), engine VARCHAR(160),
      transmission VARCHAR(120), drivetrain VARCHAR(80), current_mileage INTEGER,
      ownership_status VARCHAR(30) NOT NULL DEFAULT 'owned',
      visibility VARCHAR(30) NOT NULL DEFAULT 'private',
      vin_sha256 VARCHAR(64), vin_last6 VARCHAR(6),
      notes TEXT, created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(), archived_at TIMESTAMP,
      CONSTRAINT uq_torqueshed_vehicles_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT torqueshed_vehicle_year_check CHECK (year BETWEEN 1886 AND 2200),
      CONSTRAINT torqueshed_vehicle_mileage_check CHECK (current_mileage IS NULL OR current_mileage BETWEEN 0 AND 10000000),
      CONSTRAINT torqueshed_vehicle_visibility_check CHECK (visibility IN ('private','tenant','public_build')),
      CONSTRAINT torqueshed_vehicle_ownership_check CHECK (ownership_status IN ('owned','leased','customer','former')),
      CONSTRAINT torqueshed_vehicle_vin_check CHECK ((vin_sha256 IS NULL AND vin_last6 IS NULL) OR (vin_sha256 ~ '^[0-9a-f]{64}$' AND vin_last6 ~ '^[A-HJ-NPR-Z0-9]{6}$')),
      CONSTRAINT torqueshed_vehicle_version_check CHECK (version >= 1)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_torqueshed_vehicles_tenant_vin ON torqueshed_vehicles(tenant_id, vin_sha256) WHERE vin_sha256 IS NOT NULL AND archived_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_torqueshed_vehicles_tenant_owner ON torqueshed_vehicles(tenant_id, owner_user_id, visibility, archived_at, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_torqueshed_vehicles_tenant_search ON torqueshed_vehicles(tenant_id, lower(make), lower(model), year);

    CREATE TABLE IF NOT EXISTS torqueshed_mileage_events (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      vehicle_id VARCHAR(36) NOT NULL, mileage INTEGER NOT NULL, occurred_at TIMESTAMP NOT NULL,
      source VARCHAR(30) NOT NULL DEFAULT 'manual', notes TEXT, idempotency_key VARCHAR(200),
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), created_at TIMESTAMP NOT NULL DEFAULT NOW(), archived_at TIMESTAMP,
      CONSTRAINT torqueshed_mileage_vehicle_fk FOREIGN KEY (tenant_id, vehicle_id) REFERENCES torqueshed_vehicles(tenant_id, id),
      CONSTRAINT torqueshed_mileage_value_check CHECK (mileage BETWEEN 0 AND 10000000),
      CONSTRAINT torqueshed_mileage_source_check CHECK (source IN ('manual','maintenance','repair','inspection','import')),
      CONSTRAINT uq_torqueshed_mileage_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_torqueshed_mileage_idempotency ON torqueshed_mileage_events(tenant_id, created_by_user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_torqueshed_mileage_vehicle ON torqueshed_mileage_events(tenant_id, vehicle_id, occurred_at DESC);

    CREATE TABLE IF NOT EXISTS torqueshed_vendors (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      owner_user_id VARCHAR(36) NOT NULL REFERENCES users(id), name VARCHAR(160) NOT NULL,
      website TEXT, phone VARCHAR(80), email VARCHAR(254), notes TEXT,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(), archived_at TIMESTAMP,
      CONSTRAINT uq_torqueshed_vendors_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT torqueshed_vendor_version_check CHECK (version >= 1)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_torqueshed_vendors_tenant_name ON torqueshed_vendors(tenant_id, lower(name)) WHERE archived_at IS NULL;

    CREATE TABLE IF NOT EXISTS torqueshed_service_records (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      vehicle_id VARCHAR(36) NOT NULL, vendor_id VARCHAR(36), kind VARCHAR(30) NOT NULL,
      title VARCHAR(180) NOT NULL, description TEXT, mileage INTEGER, occurred_at TIMESTAMP NOT NULL,
      labor_minutes INTEGER, labor_cost_minor INTEGER, parts_cost_minor INTEGER, other_cost_minor INTEGER,
      currency CHAR(3) NOT NULL DEFAULT 'USD', status VARCHAR(30) NOT NULL DEFAULT 'completed',
      idempotency_key VARCHAR(200), created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(), archived_at TIMESTAMP,
      CONSTRAINT torqueshed_service_vehicle_fk FOREIGN KEY (tenant_id, vehicle_id) REFERENCES torqueshed_vehicles(tenant_id, id),
      CONSTRAINT torqueshed_service_vendor_fk FOREIGN KEY (tenant_id, vendor_id) REFERENCES torqueshed_vendors(tenant_id, id),
      CONSTRAINT uq_torqueshed_service_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT torqueshed_service_kind_check CHECK (kind IN ('maintenance','repair','inspection','modification')),
      CONSTRAINT torqueshed_service_status_check CHECK (status IN ('planned','in_progress','completed','canceled')),
      CONSTRAINT torqueshed_service_cost_check CHECK (COALESCE(labor_cost_minor,0) >= 0 AND COALESCE(parts_cost_minor,0) >= 0 AND COALESCE(other_cost_minor,0) >= 0),
      CONSTRAINT torqueshed_service_mileage_check CHECK (mileage IS NULL OR mileage BETWEEN 0 AND 10000000),
      CONSTRAINT torqueshed_service_version_check CHECK (version >= 1)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_torqueshed_service_idempotency ON torqueshed_service_records(tenant_id, created_by_user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_torqueshed_service_vehicle ON torqueshed_service_records(tenant_id, vehicle_id, kind, occurred_at DESC, archived_at);

    CREATE TABLE IF NOT EXISTS torqueshed_service_parts (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      service_record_id VARCHAR(36) NOT NULL, vendor_id VARCHAR(36), name VARCHAR(180) NOT NULL,
      manufacturer VARCHAR(120), part_number VARCHAR(120), quantity INTEGER NOT NULL DEFAULT 1,
      unit_cost_minor INTEGER, currency CHAR(3) NOT NULL DEFAULT 'USD', notes TEXT,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), created_at TIMESTAMP NOT NULL DEFAULT NOW(), archived_at TIMESTAMP,
      CONSTRAINT torqueshed_part_service_fk FOREIGN KEY (tenant_id, service_record_id) REFERENCES torqueshed_service_records(tenant_id, id),
      CONSTRAINT torqueshed_part_vendor_fk FOREIGN KEY (tenant_id, vendor_id) REFERENCES torqueshed_vendors(tenant_id, id),
      CONSTRAINT torqueshed_part_quantity_check CHECK (quantity BETWEEN 1 AND 100000),
      CONSTRAINT torqueshed_part_cost_check CHECK (unit_cost_minor IS NULL OR unit_cost_minor >= 0),
      CONSTRAINT uq_torqueshed_service_parts_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_torqueshed_service_parts_record ON torqueshed_service_parts(tenant_id, service_record_id, archived_at);

    CREATE TABLE IF NOT EXISTS torqueshed_builds (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      owner_user_id VARCHAR(36) NOT NULL REFERENCES users(id), vehicle_id VARCHAR(36), title VARCHAR(180) NOT NULL,
      description TEXT, status VARCHAR(30) NOT NULL DEFAULT 'planning', visibility VARCHAR(30) NOT NULL DEFAULT 'private',
      budget_minor INTEGER, currency CHAR(3) NOT NULL DEFAULT 'USD', started_at TIMESTAMP, target_at TIMESTAMP, completed_at TIMESTAMP,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(), archived_at TIMESTAMP,
      CONSTRAINT torqueshed_build_vehicle_fk FOREIGN KEY (tenant_id, vehicle_id) REFERENCES torqueshed_vehicles(tenant_id, id),
      CONSTRAINT uq_torqueshed_builds_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT torqueshed_build_status_check CHECK (status IN ('planning','active','paused','completed','canceled')),
      CONSTRAINT torqueshed_build_visibility_check CHECK (visibility IN ('private','tenant','public_build')),
      CONSTRAINT torqueshed_build_budget_check CHECK (budget_minor IS NULL OR budget_minor >= 0),
      CONSTRAINT torqueshed_build_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_torqueshed_builds_tenant_owner ON torqueshed_builds(tenant_id, owner_user_id, visibility, status, archived_at);

    CREATE TABLE IF NOT EXISTS torqueshed_build_stages (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id), build_id VARCHAR(36) NOT NULL,
      title VARCHAR(180) NOT NULL, description TEXT, position INTEGER NOT NULL DEFAULT 0,
      status VARCHAR(30) NOT NULL DEFAULT 'open', created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(), archived_at TIMESTAMP,
      CONSTRAINT torqueshed_stage_build_fk FOREIGN KEY (tenant_id, build_id) REFERENCES torqueshed_builds(tenant_id, id),
      CONSTRAINT uq_torqueshed_build_stages_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_torqueshed_build_stages_tenant_build_id UNIQUE (tenant_id, build_id, id),
      CONSTRAINT torqueshed_stage_status_check CHECK (status IN ('open','in_progress','blocked','completed','canceled')),
      CONSTRAINT torqueshed_stage_position_check CHECK (position BETWEEN 0 AND 100000),
      CONSTRAINT torqueshed_stage_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_torqueshed_stages_build ON torqueshed_build_stages(tenant_id, build_id, position, archived_at);

    CREATE TABLE IF NOT EXISTS torqueshed_build_tasks (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      build_id VARCHAR(36) NOT NULL, stage_id VARCHAR(36), title VARCHAR(180) NOT NULL, notes TEXT,
      status VARCHAR(30) NOT NULL DEFAULT 'open', position INTEGER NOT NULL DEFAULT 0, due_at TIMESTAMP, completed_at TIMESTAMP,
      cost_minor INTEGER, currency CHAR(3) NOT NULL DEFAULT 'USD', created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(), archived_at TIMESTAMP,
      CONSTRAINT torqueshed_task_build_fk FOREIGN KEY (tenant_id, build_id) REFERENCES torqueshed_builds(tenant_id, id),
      CONSTRAINT torqueshed_task_stage_fk FOREIGN KEY (tenant_id, build_id, stage_id) REFERENCES torqueshed_build_stages(tenant_id, build_id, id),
      CONSTRAINT uq_torqueshed_build_tasks_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT torqueshed_task_status_check CHECK (status IN ('open','in_progress','blocked','completed','canceled')),
      CONSTRAINT torqueshed_task_cost_check CHECK (cost_minor IS NULL OR cost_minor >= 0),
      CONSTRAINT torqueshed_task_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_torqueshed_tasks_build ON torqueshed_build_tasks(tenant_id, build_id, stage_id, status, position, archived_at);

    CREATE TABLE IF NOT EXISTS torqueshed_service_reminders (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      vehicle_id VARCHAR(36) NOT NULL, title VARCHAR(180) NOT NULL, notes TEXT, due_at TIMESTAMP, due_mileage INTEGER,
      interval_days INTEGER, interval_miles INTEGER, status VARCHAR(30) NOT NULL DEFAULT 'open',
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(), archived_at TIMESTAMP,
      CONSTRAINT torqueshed_reminder_vehicle_fk FOREIGN KEY (tenant_id, vehicle_id) REFERENCES torqueshed_vehicles(tenant_id, id),
      CONSTRAINT uq_torqueshed_reminders_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT torqueshed_reminder_due_check CHECK (due_at IS NOT NULL OR due_mileage IS NOT NULL),
      CONSTRAINT torqueshed_reminder_status_check CHECK (status IN ('open','snoozed','completed','dismissed')),
      CONSTRAINT torqueshed_reminder_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_torqueshed_reminders_due ON torqueshed_service_reminders(tenant_id, status, due_at, due_mileage, archived_at);

    CREATE TABLE IF NOT EXISTS torqueshed_diagnostic_sessions (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      owner_user_id VARCHAR(36) NOT NULL REFERENCES users(id), vehicle_id VARCHAR(36) NOT NULL,
      title VARCHAR(180) NOT NULL, customer_concern TEXT NOT NULL, symptoms TEXT, conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
      confirmed_cause TEXT, repair_performed TEXT, verification TEXT, resolution TEXT,
      status VARCHAR(30) NOT NULL DEFAULT 'open', visibility VARCHAR(30) NOT NULL DEFAULT 'private',
      opened_at TIMESTAMP NOT NULL DEFAULT NOW(), resolved_at TIMESTAMP,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(), archived_at TIMESTAMP,
      CONSTRAINT torqueshed_diagnostic_vehicle_fk FOREIGN KEY (tenant_id, vehicle_id) REFERENCES torqueshed_vehicles(tenant_id, id),
      CONSTRAINT uq_torqueshed_diagnostics_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT torqueshed_diagnostic_status_check CHECK (status IN ('open','testing','repairing','verified','resolved','archived')),
      CONSTRAINT torqueshed_diagnostic_visibility_check CHECK (visibility IN ('private','tenant')),
      CONSTRAINT torqueshed_diagnostic_conditions_check CHECK (jsonb_typeof(conditions) = 'object'),
      CONSTRAINT torqueshed_diagnostic_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_torqueshed_diagnostics_vehicle ON torqueshed_diagnostic_sessions(tenant_id, vehicle_id, status, updated_at DESC, archived_at);
    CREATE INDEX IF NOT EXISTS idx_torqueshed_diagnostics_owner ON torqueshed_diagnostic_sessions(tenant_id, owner_user_id, visibility, status, archived_at);

    CREATE TABLE IF NOT EXISTS torqueshed_diagnostic_trouble_codes (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      diagnostic_session_id VARCHAR(36) NOT NULL, code VARCHAR(16) NOT NULL, description TEXT,
      code_status VARCHAR(30) NOT NULL DEFAULT 'active', freeze_frame JSONB NOT NULL DEFAULT '{}'::jsonb,
      observed_at TIMESTAMP NOT NULL DEFAULT NOW(), created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT NOW(), archived_at TIMESTAMP,
      CONSTRAINT torqueshed_code_session_fk FOREIGN KEY (tenant_id, diagnostic_session_id) REFERENCES torqueshed_diagnostic_sessions(tenant_id, id),
      CONSTRAINT uq_torqueshed_codes_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT torqueshed_code_status_check CHECK (code_status IN ('active','pending','history','cleared')),
      CONSTRAINT torqueshed_code_freeze_check CHECK (jsonb_typeof(freeze_frame) = 'object'),
      CONSTRAINT torqueshed_code_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_torqueshed_codes_session ON torqueshed_diagnostic_trouble_codes(tenant_id, diagnostic_session_id, observed_at, archived_at);

    CREATE TABLE IF NOT EXISTS torqueshed_diagnostic_entries (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      diagnostic_session_id VARCHAR(36) NOT NULL, kind VARCHAR(40) NOT NULL, title VARCHAR(180) NOT NULL,
      value_text TEXT, value_numeric NUMERIC, unit VARCHAR(40), reference_min NUMERIC, reference_max NUMERIC,
      outcome TEXT, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, observed_at TIMESTAMP NOT NULL DEFAULT NOW(),
      idempotency_key VARCHAR(200), created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(), archived_at TIMESTAMP,
      CONSTRAINT torqueshed_entry_session_fk FOREIGN KEY (tenant_id, diagnostic_session_id) REFERENCES torqueshed_diagnostic_sessions(tenant_id, id),
      CONSTRAINT uq_torqueshed_entries_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT torqueshed_entry_kind_check CHECK (kind IN ('symptom','condition','inspection','test','measurement','hypothesis','confirmed_cause','repair','verification','resolution')),
      CONSTRAINT torqueshed_entry_value_check CHECK (value_text IS NOT NULL OR value_numeric IS NOT NULL),
      CONSTRAINT torqueshed_entry_range_check CHECK (reference_min IS NULL OR reference_max IS NULL OR reference_min <= reference_max),
      CONSTRAINT torqueshed_entry_metadata_check CHECK (jsonb_typeof(metadata) = 'object'),
      CONSTRAINT torqueshed_entry_version_check CHECK (version >= 1)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_torqueshed_entries_idempotency ON torqueshed_diagnostic_entries(tenant_id, created_by_user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_torqueshed_entries_session ON torqueshed_diagnostic_entries(tenant_id, diagnostic_session_id, observed_at, archived_at);

    CREATE TABLE IF NOT EXISTS torqueshed_diagnostic_templates (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      owner_user_id VARCHAR(36) NOT NULL REFERENCES users(id), name VARCHAR(180) NOT NULL, description TEXT,
      concern_pattern TEXT, test_plan JSONB NOT NULL DEFAULT '[]'::jsonb, visibility VARCHAR(30) NOT NULL DEFAULT 'private',
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(), archived_at TIMESTAMP,
      CONSTRAINT uq_torqueshed_templates_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT torqueshed_template_plan_check CHECK (jsonb_typeof(test_plan) = 'array'),
      CONSTRAINT torqueshed_template_visibility_check CHECK (visibility IN ('private','tenant')),
      CONSTRAINT torqueshed_template_version_check CHECK (version >= 1)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_torqueshed_templates_tenant_name ON torqueshed_diagnostic_templates(tenant_id, owner_user_id, lower(name)) WHERE archived_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_torqueshed_templates_visibility ON torqueshed_diagnostic_templates(tenant_id, visibility, owner_user_id, archived_at);

    CREATE TABLE IF NOT EXISTS torqueshed_migration_refs (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      source_type VARCHAR(80) NOT NULL, source_id VARCHAR(180) NOT NULL, target_type VARCHAR(80) NOT NULL,
      target_id VARCHAR(36) NOT NULL, source_hash VARCHAR(64) NOT NULL, imported_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT torqueshed_migration_hash_check CHECK (source_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT uq_torqueshed_migration_source UNIQUE (tenant_id, source_type, source_id)
    );
    CREATE INDEX IF NOT EXISTS idx_torqueshed_migration_target ON torqueshed_migration_refs(tenant_id, target_type, target_id);

    CREATE TABLE IF NOT EXISTS operatoros_token_purchase_intents (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id), module_id VARCHAR(36) NOT NULL REFERENCES modules(id),
      package_key VARCHAR(80) NOT NULL, units BIGINT NOT NULL, amount_minor INTEGER NOT NULL,
      currency CHAR(3) NOT NULL DEFAULT 'USD', provider VARCHAR(40) NOT NULL,
      provider_mode VARCHAR(20) NOT NULL, provider_checkout_id VARCHAR(200), provider_checkout_url TEXT,
      status VARCHAR(30) NOT NULL DEFAULT 'payment_pending', idempotency_key VARCHAR(200) NOT NULL,
      failure_code VARCHAR(120), created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      credited_at TIMESTAMP, refunded_at TIMESTAMP,
      CONSTRAINT uq_operatoros_token_purchase_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_operatoros_token_purchase_idempotency UNIQUE (tenant_id, user_id, module_id, idempotency_key),
      CONSTRAINT operatoros_token_purchase_units_check CHECK (units > 0),
      CONSTRAINT operatoros_token_purchase_amount_check CHECK (amount_minor > 0),
      CONSTRAINT operatoros_token_purchase_mode_check CHECK (provider_mode IN ('test','live')),
      CONSTRAINT operatoros_token_purchase_status_check CHECK (status IN (
        'pending','creating_checkout','checkout_open','payment_pending','checkout_created','paid_pending_credit','credited',
        'cancelled','expired','failed','partially_refunded','refunded','disputed'
      ))
    );
    ALTER TABLE operatoros_token_purchase_intents
      ALTER COLUMN status SET DEFAULT 'payment_pending';
    ALTER TABLE operatoros_token_purchase_intents
      DROP CONSTRAINT IF EXISTS operatoros_token_purchase_status_check;
    ALTER TABLE operatoros_token_purchase_intents
      ADD CONSTRAINT operatoros_token_purchase_status_check CHECK (status IN (
        'pending','creating_checkout','checkout_open','payment_pending','checkout_created','paid_pending_credit','credited',
        'cancelled','expired','failed','partially_refunded','refunded','disputed'
      ));
    CREATE UNIQUE INDEX IF NOT EXISTS uq_operatoros_token_purchase_checkout
      ON operatoros_token_purchase_intents(provider, provider_mode, provider_checkout_id)
      WHERE provider_checkout_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_operatoros_token_purchase_scope
      ON operatoros_token_purchase_intents(tenant_id, module_id, user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS torqueshed_assist_requests (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id), diagnostic_session_id VARCHAR(36) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'processing', context_sha256 CHAR(64) NOT NULL,
      context_chars INTEGER NOT NULL, context_items INTEGER NOT NULL, estimated_units BIGINT NOT NULL,
      actual_units BIGINT, provider VARCHAR(80), provider_model VARCHAR(120), provider_version VARCHAR(80),
      response_json JSONB, request_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      error_code VARCHAR(120), latency_ms INTEGER, attempt_count INTEGER NOT NULL DEFAULT 0,
      idempotency_key VARCHAR(200) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(), completed_at TIMESTAMP,
      CONSTRAINT torqueshed_assist_session_fk FOREIGN KEY (tenant_id, diagnostic_session_id)
        REFERENCES torqueshed_diagnostic_sessions(tenant_id, id),
      CONSTRAINT uq_torqueshed_assist_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_torqueshed_assist_idempotency UNIQUE (tenant_id, user_id, idempotency_key),
      CONSTRAINT torqueshed_assist_status_check CHECK (status IN ('processing','follow_up','complete','provider_failed','insufficient_balance')),
      CONSTRAINT torqueshed_assist_context_hash_check CHECK (context_sha256 ~ '^[0-9a-f]{64}$'),
      CONSTRAINT torqueshed_assist_context_size_check CHECK (context_chars BETWEEN 1 AND 48000 AND context_items BETWEEN 1 AND 1000),
      CONSTRAINT torqueshed_assist_usage_check CHECK (estimated_units > 0 AND (actual_units IS NULL OR actual_units > 0)),
      CONSTRAINT torqueshed_assist_attempt_check CHECK (attempt_count BETWEEN 0 AND 2),
      CONSTRAINT torqueshed_assist_response_check CHECK (response_json IS NULL OR jsonb_typeof(response_json) = 'object')
    );
    CREATE INDEX IF NOT EXISTS idx_torqueshed_assist_session
      ON torqueshed_assist_requests(tenant_id, diagnostic_session_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_torqueshed_assist_user
      ON torqueshed_assist_requests(tenant_id, user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS torqueshed_token_ledger_entries (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id), module_id VARCHAR(36) NOT NULL REFERENCES modules(id),
      entry_kind VARCHAR(30) NOT NULL, operation_type VARCHAR(120) NOT NULL, units BIGINT NOT NULL,
      idempotency_key VARCHAR(200) NOT NULL, external_event_ref VARCHAR(240),
      purchase_intent_id VARCHAR(36), diagnostic_session_id VARCHAR(36), assist_request_id VARCHAR(36),
      reverses_entry_id VARCHAR(36), metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by_user_id VARCHAR(36) REFERENCES users(id), created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_torqueshed_token_ledger_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT torqueshed_token_ledger_purchase_fk FOREIGN KEY (tenant_id, purchase_intent_id)
        REFERENCES operatoros_token_purchase_intents(tenant_id, id),
      CONSTRAINT torqueshed_token_ledger_session_fk FOREIGN KEY (tenant_id, diagnostic_session_id)
        REFERENCES torqueshed_diagnostic_sessions(tenant_id, id),
      CONSTRAINT torqueshed_token_ledger_request_fk FOREIGN KEY (tenant_id, assist_request_id)
        REFERENCES torqueshed_assist_requests(tenant_id, id),
      CONSTRAINT torqueshed_token_ledger_reversal_fk FOREIGN KEY (tenant_id, reverses_entry_id)
        REFERENCES torqueshed_token_ledger_entries(tenant_id, id),
      CONSTRAINT uq_torqueshed_token_ledger_idempotency UNIQUE (tenant_id, module_id, entry_kind, idempotency_key),
      CONSTRAINT torqueshed_token_ledger_kind_check CHECK (entry_kind IN ('credit','debit','credit_reversal','debit_reversal','adjustment_credit','adjustment_debit')),
      CONSTRAINT torqueshed_token_ledger_units_check CHECK (units > 0),
      CONSTRAINT torqueshed_token_ledger_metadata_check CHECK (jsonb_typeof(metadata_json) = 'object'),
      CONSTRAINT torqueshed_token_ledger_reference_check CHECK (
        (entry_kind = 'credit' AND purchase_intent_id IS NOT NULL AND assist_request_id IS NULL) OR
        (entry_kind = 'debit' AND diagnostic_session_id IS NOT NULL AND assist_request_id IS NOT NULL AND purchase_intent_id IS NULL) OR
        (entry_kind IN ('credit_reversal','debit_reversal') AND reverses_entry_id IS NOT NULL) OR
        entry_kind IN ('adjustment_credit','adjustment_debit')
      )
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_torqueshed_token_ledger_external_event
      ON torqueshed_token_ledger_entries(external_event_ref) WHERE external_event_ref IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_torqueshed_token_ledger_purchase_credit
      ON torqueshed_token_ledger_entries(tenant_id, purchase_intent_id) WHERE entry_kind = 'credit';
    CREATE UNIQUE INDEX IF NOT EXISTS uq_torqueshed_token_ledger_debit_request
      ON torqueshed_token_ledger_entries(tenant_id, assist_request_id) WHERE entry_kind = 'debit';
    CREATE INDEX IF NOT EXISTS idx_torqueshed_token_ledger_balance
      ON torqueshed_token_ledger_entries(tenant_id, module_id, user_id, created_at, id);
    CREATE INDEX IF NOT EXISTS idx_torqueshed_token_ledger_purchase
      ON torqueshed_token_ledger_entries(tenant_id, purchase_intent_id, created_at);

    CREATE TABLE IF NOT EXISTS torqueshed_assist_rate_windows (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      scope VARCHAR(20) NOT NULL, subject_id VARCHAR(36) NOT NULL, window_started_at TIMESTAMP NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 1, updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_torqueshed_assist_rate_window UNIQUE (tenant_id, scope, subject_id, window_started_at),
      CONSTRAINT torqueshed_assist_rate_scope_check CHECK (scope IN ('tenant','user')),
      CONSTRAINT torqueshed_assist_rate_count_check CHECK (request_count BETWEEN 1 AND 100000)
    );
    CREATE INDEX IF NOT EXISTS idx_torqueshed_assist_rate_expiry
      ON torqueshed_assist_rate_windows(window_started_at);

    CREATE TABLE IF NOT EXISTS torqueshed_ai_provider_circuits (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      provider VARCHAR(80) NOT NULL, state VARCHAR(20) NOT NULL DEFAULT 'closed',
      consecutive_failures INTEGER NOT NULL DEFAULT 0, open_until TIMESTAMP,
      last_error_code VARCHAR(120), updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_torqueshed_ai_provider_circuit UNIQUE (tenant_id, provider),
      CONSTRAINT torqueshed_ai_provider_circuit_state_check CHECK (state IN ('closed','open')),
      CONSTRAINT torqueshed_ai_provider_circuit_failure_check CHECK (consecutive_failures BETWEEN 0 AND 100000)
    );

    CREATE TABLE IF NOT EXISTS torqueshed_social_profiles (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id), display_name VARCHAR(100) NOT NULL, bio TEXT,
      specialties TEXT, locality VARCHAR(100), region VARCHAR(100), country_code CHAR(2) NOT NULL DEFAULT 'US',
      visibility VARCHAR(20) NOT NULL DEFAULT 'tenant', created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(), archived_at TIMESTAMP,
      CONSTRAINT uq_torqueshed_social_profiles_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_torqueshed_social_profiles_user UNIQUE (tenant_id, user_id),
      CONSTRAINT torqueshed_social_profile_visibility_check CHECK (visibility IN ('tenant','private')),
      CONSTRAINT torqueshed_social_profile_version_check CHECK (version >= 1)
    );

    CREATE TABLE IF NOT EXISTS torqueshed_social_notification_preferences (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id), messages_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      comments_enabled BOOLEAN NOT NULL DEFAULT TRUE, reactions_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      follows_enabled BOOLEAN NOT NULL DEFAULT TRUE, moderation_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      version INTEGER NOT NULL DEFAULT 1, updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_torqueshed_social_preferences_user UNIQUE (tenant_id, user_id),
      CONSTRAINT torqueshed_social_preferences_version_check CHECK (version >= 1)
    );

    CREATE TABLE IF NOT EXISTS torqueshed_social_blocks (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      blocker_user_id VARCHAR(36) NOT NULL REFERENCES users(id), blocked_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_torqueshed_social_block UNIQUE (tenant_id, blocker_user_id, blocked_user_id),
      CONSTRAINT torqueshed_social_block_distinct_check CHECK (blocker_user_id <> blocked_user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_torqueshed_social_blocks_reverse
      ON torqueshed_social_blocks(tenant_id, blocked_user_id, blocker_user_id);

    CREATE TABLE IF NOT EXISTS torqueshed_marketplace_categories (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      slug VARCHAR(80) NOT NULL, name VARCHAR(120) NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
      display_order INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_torqueshed_marketplace_categories_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_torqueshed_marketplace_category_slug UNIQUE (tenant_id, slug),
      CONSTRAINT torqueshed_marketplace_category_order_check CHECK (display_order BETWEEN 0 AND 10000)
    );

    CREATE TABLE IF NOT EXISTS torqueshed_marketplace_listings (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      seller_user_id VARCHAR(36) NOT NULL REFERENCES users(id), category_id VARCHAR(36) NOT NULL,
      vehicle_id VARCHAR(36), build_id VARCHAR(36), listing_type VARCHAR(20) NOT NULL DEFAULT 'sell',
      status VARCHAR(20) NOT NULL DEFAULT 'draft', condition VARCHAR(20) NOT NULL,
      title VARCHAR(160) NOT NULL, description TEXT NOT NULL, price_minor INTEGER, currency CHAR(3) NOT NULL DEFAULT 'USD',
      negotiable BOOLEAN NOT NULL DEFAULT FALSE, locality VARCHAR(100), region VARCHAR(100), country_code CHAR(2) NOT NULL DEFAULT 'US',
      content_hash CHAR(64) NOT NULL, created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(), published_at TIMESTAMP,
      sold_at TIMESTAMP, expires_at TIMESTAMP, renewed_at TIMESTAMP, archived_at TIMESTAMP,
      CONSTRAINT torqueshed_marketplace_listing_category_fk FOREIGN KEY (tenant_id, category_id)
        REFERENCES torqueshed_marketplace_categories(tenant_id, id),
      CONSTRAINT torqueshed_marketplace_listing_vehicle_fk FOREIGN KEY (tenant_id, vehicle_id)
        REFERENCES torqueshed_vehicles(tenant_id, id),
      CONSTRAINT torqueshed_marketplace_listing_build_fk FOREIGN KEY (tenant_id, build_id)
        REFERENCES torqueshed_builds(tenant_id, id),
      CONSTRAINT uq_torqueshed_marketplace_listings_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_torqueshed_marketplace_listings_seller UNIQUE (tenant_id, id, seller_user_id),
      CONSTRAINT torqueshed_marketplace_listing_type_check CHECK (listing_type IN ('sell','wanted','trade')),
      CONSTRAINT torqueshed_marketplace_listing_status_check CHECK (status IN ('draft','published','sold','expired','archived','removed')),
      CONSTRAINT torqueshed_marketplace_listing_condition_check CHECK (condition IN ('new','excellent','working','parts')),
      CONSTRAINT torqueshed_marketplace_listing_price_check CHECK (price_minor IS NULL OR price_minor >= 0),
      CONSTRAINT torqueshed_marketplace_listing_hash_check CHECK (content_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT torqueshed_marketplace_listing_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_torqueshed_marketplace_listing_search
      ON torqueshed_marketplace_listings(tenant_id, status, category_id, created_at DESC, id);
    CREATE INDEX IF NOT EXISTS idx_torqueshed_marketplace_listing_seller
      ON torqueshed_marketplace_listings(tenant_id, seller_user_id, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_torqueshed_marketplace_listing_expiry
      ON torqueshed_marketplace_listings(tenant_id, expires_at) WHERE status = 'published';

    CREATE TABLE IF NOT EXISTS torqueshed_marketplace_favorites (
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id), user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      listing_id VARCHAR(36) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT torqueshed_marketplace_favorite_listing_fk FOREIGN KEY (tenant_id, listing_id)
        REFERENCES torqueshed_marketplace_listings(tenant_id, id),
      CONSTRAINT pk_torqueshed_marketplace_favorites PRIMARY KEY (tenant_id, user_id, listing_id)
    );

    CREATE TABLE IF NOT EXISTS torqueshed_marketplace_conversations (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      listing_id VARCHAR(36) NOT NULL, buyer_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      seller_user_id VARCHAR(36) NOT NULL REFERENCES users(id), created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(), archived_at TIMESTAMP,
      CONSTRAINT torqueshed_marketplace_conversation_listing_fk FOREIGN KEY (tenant_id, listing_id, seller_user_id)
        REFERENCES torqueshed_marketplace_listings(tenant_id, id, seller_user_id),
      CONSTRAINT uq_torqueshed_marketplace_conversation UNIQUE (tenant_id, listing_id, buyer_user_id),
      CONSTRAINT uq_torqueshed_marketplace_conversations_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT torqueshed_marketplace_conversation_distinct_check CHECK (buyer_user_id <> seller_user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_torqueshed_marketplace_conversation_participants
      ON torqueshed_marketplace_conversations(tenant_id, buyer_user_id, seller_user_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS torqueshed_marketplace_messages (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      conversation_id VARCHAR(36) NOT NULL, sender_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      body TEXT NOT NULL, content_hash CHAR(64) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      edited_at TIMESTAMP, archived_at TIMESTAMP,
      CONSTRAINT torqueshed_marketplace_message_conversation_fk FOREIGN KEY (tenant_id, conversation_id)
        REFERENCES torqueshed_marketplace_conversations(tenant_id, id),
      CONSTRAINT uq_torqueshed_marketplace_messages_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT torqueshed_marketplace_message_hash_check CHECK (content_hash ~ '^[0-9a-f]{64}$')
    );
    CREATE INDEX IF NOT EXISTS idx_torqueshed_marketplace_messages_conversation
      ON torqueshed_marketplace_messages(tenant_id, conversation_id, created_at, id);

    CREATE TABLE IF NOT EXISTS torqueshed_community_topics (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      slug VARCHAR(80) NOT NULL, name VARCHAR(120) NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
      display_order INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_torqueshed_community_topics_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_torqueshed_community_topic_slug UNIQUE (tenant_id, slug)
    );

    CREATE TABLE IF NOT EXISTS torqueshed_community_tags (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      slug VARCHAR(80) NOT NULL, name VARCHAR(80) NOT NULL, created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), archived_at TIMESTAMP,
      CONSTRAINT uq_torqueshed_community_tags_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_torqueshed_community_tag_slug UNIQUE (tenant_id, slug)
    );

    CREATE TABLE IF NOT EXISTS torqueshed_community_posts (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      author_user_id VARCHAR(36) NOT NULL REFERENCES users(id), topic_id VARCHAR(36), vehicle_id VARCHAR(36), build_id VARCHAR(36),
      title VARCHAR(180) NOT NULL, body TEXT NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'draft',
      visibility VARCHAR(20) NOT NULL DEFAULT 'public', content_hash CHAR(64) NOT NULL,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      published_at TIMESTAMP, edited_at TIMESTAMP, archived_at TIMESTAMP,
      CONSTRAINT torqueshed_community_post_topic_fk FOREIGN KEY (tenant_id, topic_id)
        REFERENCES torqueshed_community_topics(tenant_id, id),
      CONSTRAINT torqueshed_community_post_vehicle_fk FOREIGN KEY (tenant_id, vehicle_id)
        REFERENCES torqueshed_vehicles(tenant_id, id),
      CONSTRAINT torqueshed_community_post_build_fk FOREIGN KEY (tenant_id, build_id)
        REFERENCES torqueshed_builds(tenant_id, id),
      CONSTRAINT uq_torqueshed_community_posts_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT torqueshed_community_post_status_check CHECK (status IN ('draft','published','hidden','removed','archived')),
      CONSTRAINT torqueshed_community_post_visibility_check CHECK (visibility IN ('public','followers','private')),
      CONSTRAINT torqueshed_community_post_hash_check CHECK (content_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT torqueshed_community_post_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_torqueshed_community_post_feed
      ON torqueshed_community_posts(tenant_id, status, visibility, created_at DESC, id);
    CREATE INDEX IF NOT EXISTS idx_torqueshed_community_post_author
      ON torqueshed_community_posts(tenant_id, author_user_id, status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS torqueshed_community_post_tags (
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id), post_id VARCHAR(36) NOT NULL, tag_id VARCHAR(36) NOT NULL,
      CONSTRAINT torqueshed_community_post_tag_post_fk FOREIGN KEY (tenant_id, post_id)
        REFERENCES torqueshed_community_posts(tenant_id, id),
      CONSTRAINT torqueshed_community_post_tag_tag_fk FOREIGN KEY (tenant_id, tag_id)
        REFERENCES torqueshed_community_tags(tenant_id, id),
      CONSTRAINT pk_torqueshed_community_post_tags PRIMARY KEY (tenant_id, post_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS torqueshed_community_comments (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      post_id VARCHAR(36) NOT NULL, parent_id VARCHAR(36), author_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      body TEXT NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'published', content_hash CHAR(64) NOT NULL,
      version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      edited_at TIMESTAMP, archived_at TIMESTAMP,
      CONSTRAINT torqueshed_community_comment_post_fk FOREIGN KEY (tenant_id, post_id)
        REFERENCES torqueshed_community_posts(tenant_id, id),
      CONSTRAINT uq_torqueshed_community_comments_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_torqueshed_community_comments_post_id UNIQUE (tenant_id, post_id, id),
      CONSTRAINT torqueshed_community_comment_parent_fk FOREIGN KEY (tenant_id, post_id, parent_id)
        REFERENCES torqueshed_community_comments(tenant_id, post_id, id),
      CONSTRAINT torqueshed_community_comment_status_check CHECK (status IN ('published','hidden','removed','archived')),
      CONSTRAINT torqueshed_community_comment_hash_check CHECK (content_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT torqueshed_community_comment_version_check CHECK (version >= 1),
      CONSTRAINT torqueshed_community_comment_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id)
    );
    CREATE INDEX IF NOT EXISTS idx_torqueshed_community_comments_post
      ON torqueshed_community_comments(tenant_id, post_id, created_at, id);

    CREATE TABLE IF NOT EXISTS torqueshed_community_post_reactions (
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id), user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      post_id VARCHAR(36) NOT NULL, reaction VARCHAR(20) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT torqueshed_community_post_reaction_post_fk FOREIGN KEY (tenant_id, post_id)
        REFERENCES torqueshed_community_posts(tenant_id, id),
      CONSTRAINT pk_torqueshed_community_post_reactions PRIMARY KEY (tenant_id, user_id, post_id),
      CONSTRAINT torqueshed_community_post_reaction_check CHECK (reaction IN ('like','helpful','insightful'))
    );

    CREATE TABLE IF NOT EXISTS torqueshed_community_comment_reactions (
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id), user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      comment_id VARCHAR(36) NOT NULL, reaction VARCHAR(20) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT torqueshed_community_comment_reaction_comment_fk FOREIGN KEY (tenant_id, comment_id)
        REFERENCES torqueshed_community_comments(tenant_id, id),
      CONSTRAINT pk_torqueshed_community_comment_reactions PRIMARY KEY (tenant_id, user_id, comment_id),
      CONSTRAINT torqueshed_community_comment_reaction_check CHECK (reaction IN ('like','helpful','insightful'))
    );

    CREATE TABLE IF NOT EXISTS torqueshed_community_follows (
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id), follower_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      followed_user_id VARCHAR(36) NOT NULL REFERENCES users(id), created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT pk_torqueshed_community_follows PRIMARY KEY (tenant_id, follower_user_id, followed_user_id),
      CONSTRAINT torqueshed_community_follow_distinct_check CHECK (follower_user_id <> followed_user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_torqueshed_community_followed
      ON torqueshed_community_follows(tenant_id, followed_user_id, follower_user_id);

    CREATE TABLE IF NOT EXISTS torqueshed_social_reports (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      reporter_user_id VARCHAR(36) NOT NULL REFERENCES users(id), target_type VARCHAR(30) NOT NULL,
      target_id VARCHAR(36) NOT NULL, reason_code VARCHAR(40) NOT NULL, details TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'open', assigned_user_id VARCHAR(36) REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(), resolved_at TIMESTAMP,
      CONSTRAINT uq_torqueshed_social_reporter_target UNIQUE (tenant_id, reporter_user_id, target_type, target_id),
      CONSTRAINT uq_torqueshed_social_reports_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT torqueshed_social_report_target_check CHECK (target_type IN ('listing','message','post','comment','profile')),
      CONSTRAINT torqueshed_social_report_status_check CHECK (status IN ('open','reviewing','resolved','dismissed')),
      CONSTRAINT torqueshed_social_report_reason_check CHECK (reason_code IN ('spam','harassment','fraud','prohibited_item','privacy','unsafe','other'))
    );
    CREATE INDEX IF NOT EXISTS idx_torqueshed_social_reports_queue
      ON torqueshed_social_reports(tenant_id, status, created_at, id);

    CREATE TABLE IF NOT EXISTS torqueshed_social_moderation_actions (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      report_id VARCHAR(36), target_type VARCHAR(30) NOT NULL, target_id VARCHAR(36) NOT NULL,
      action VARCHAR(30) NOT NULL, reason TEXT NOT NULL, moderator_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT torqueshed_social_moderation_report_fk FOREIGN KEY (tenant_id, report_id)
        REFERENCES torqueshed_social_reports(tenant_id, id),
      CONSTRAINT torqueshed_social_moderation_target_check CHECK (target_type IN ('listing','message','post','comment','profile')),
      CONSTRAINT torqueshed_social_moderation_action_check CHECK (action IN ('hide','remove','restore','resolve','dismiss','warn')),
      CONSTRAINT torqueshed_social_moderation_metadata_check CHECK (jsonb_typeof(metadata_json) = 'object')
    );
    CREATE INDEX IF NOT EXISTS idx_torqueshed_social_moderation_target
      ON torqueshed_social_moderation_actions(tenant_id, target_type, target_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS torqueshed_social_rate_windows (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      scope VARCHAR(30) NOT NULL, subject_id VARCHAR(80) NOT NULL, window_started_at TIMESTAMP NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 1, updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_torqueshed_social_rate_window UNIQUE (tenant_id, scope, subject_id, window_started_at),
      CONSTRAINT torqueshed_social_rate_scope_check CHECK (scope IN ('tenant_write','user_write','user_message','tenant_message','user_report','tenant_report')),
      CONSTRAINT torqueshed_social_rate_count_check CHECK (request_count BETWEEN 1 AND 100000)
    );
    CREATE INDEX IF NOT EXISTS idx_torqueshed_social_rate_expiry
      ON torqueshed_social_rate_windows(window_started_at);

    CREATE OR REPLACE FUNCTION torqueshed_reject_moderation_action_mutation()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'TorqueShed moderation actions are append-only'
        USING ERRCODE = '55000';
    END;
    $$;
    DROP TRIGGER IF EXISTS torqueshed_social_moderation_append_only ON torqueshed_social_moderation_actions;
    CREATE TRIGGER torqueshed_social_moderation_append_only
      BEFORE UPDATE OR DELETE ON torqueshed_social_moderation_actions
      FOR EACH ROW EXECUTE FUNCTION torqueshed_reject_moderation_action_mutation();

    CREATE OR REPLACE FUNCTION torqueshed_reject_token_ledger_mutation()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'TorqueShed token ledger is append-only; write a reversal entry'
        USING ERRCODE = '55000';
    END;
    $$;
    DROP TRIGGER IF EXISTS torqueshed_token_ledger_append_only ON torqueshed_token_ledger_entries;
    CREATE TRIGGER torqueshed_token_ledger_append_only
      BEFORE UPDATE OR DELETE ON torqueshed_token_ledger_entries
      FOR EACH ROW EXECUTE FUNCTION torqueshed_reject_token_ledger_mutation();
  `);
}
