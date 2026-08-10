import { db } from '../db.js';

/**
 * Phase 26 additive TechDeck product tables.
 *
 * OperatorOS continues to own identity, tenants, billing, provider secrets,
 * API-token credentials, webhooks, jobs, and attachment blobs. These tables
 * contain only TechDeck's tenant-scoped product records and references into
 * those shared authorities.
 */
export async function ensureTechDeckLiteralTables(): Promise<void> {
  await db.execute(`
    ALTER TABLE shared_exports DROP CONSTRAINT IF EXISTS shared_export_format_check;
    DO $$ BEGIN
      ALTER TABLE shared_exports ADD CONSTRAINT shared_export_format_check CHECK (format IN ('json','csv','zip'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS techdeck_portal_assignments (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      directory_organization_id VARCHAR(36) NOT NULL,
      directory_site_id VARCHAR(36),
      can_create_tickets BOOLEAN NOT NULL DEFAULT TRUE,
      can_comment BOOLEAN NOT NULL DEFAULT TRUE,
      can_view_evidence BOOLEAN NOT NULL DEFAULT TRUE,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMPTZ,
      CONSTRAINT techdeck_portal_assignment_org_fk FOREIGN KEY (tenant_id, directory_organization_id)
        REFERENCES directory_organizations(tenant_id, id),
      CONSTRAINT techdeck_portal_assignment_site_fk FOREIGN KEY (tenant_id, directory_organization_id, directory_site_id)
        REFERENCES directory_sites(tenant_id, organization_id, id),
      CONSTRAINT techdeck_portal_assignment_version_check CHECK (version >= 1),
      CONSTRAINT uq_techdeck_portal_assignment_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_techdeck_portal_assignment_active
      ON techdeck_portal_assignments(tenant_id, user_id, directory_organization_id, COALESCE(directory_site_id, ''))
      WHERE revoked_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_techdeck_portal_assignment_user
      ON techdeck_portal_assignments(tenant_id, user_id) WHERE revoked_at IS NULL;

    CREATE TABLE IF NOT EXISTS techdeck_appointments (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      directory_organization_id VARCHAR(36),
      directory_site_id VARCHAR(36),
      ticket_id VARCHAR(36),
      assigned_to_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      title VARCHAR(200) NOT NULL,
      description TEXT,
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled',
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      cancelled_at TIMESTAMPTZ,
      CONSTRAINT techdeck_appointment_org_fk FOREIGN KEY (tenant_id, directory_organization_id)
        REFERENCES directory_organizations(tenant_id, id),
      CONSTRAINT techdeck_appointment_site_fk FOREIGN KEY (tenant_id, directory_organization_id, directory_site_id)
        REFERENCES directory_sites(tenant_id, organization_id, id),
      CONSTRAINT techdeck_appointment_ticket_fk FOREIGN KEY (tenant_id, ticket_id)
        REFERENCES techdeck_tickets(tenant_id, id),
      CONSTRAINT techdeck_appointment_range_check CHECK (ends_at > starts_at),
      CONSTRAINT techdeck_appointment_status_check CHECK (status IN ('scheduled','confirmed','completed','cancelled')),
      CONSTRAINT techdeck_appointment_version_check CHECK (version >= 1),
      CONSTRAINT uq_techdeck_appointment_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_techdeck_appointments_tenant_start
      ON techdeck_appointments(tenant_id, starts_at) WHERE cancelled_at IS NULL;

    CREATE TABLE IF NOT EXISTS techdeck_license_products (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      name VARCHAR(160) NOT NULL,
      slug VARCHAR(120) NOT NULL,
      description TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      archived_at TIMESTAMPTZ,
      CONSTRAINT techdeck_license_product_version_check CHECK (version >= 1),
      CONSTRAINT techdeck_license_product_slug_check CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
      CONSTRAINT uq_techdeck_license_product_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_techdeck_license_product_slug
      ON techdeck_license_products(tenant_id, slug) WHERE archived_at IS NULL;

    CREATE TABLE IF NOT EXISTS techdeck_license_keys (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      product_id VARCHAR(36) NOT NULL,
      label VARCHAR(160),
      key_prefix VARCHAR(20) NOT NULL,
      key_hash CHAR(64) NOT NULL,
      max_activations INTEGER NOT NULL DEFAULT 1,
      expires_at TIMESTAMPTZ,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMPTZ,
      CONSTRAINT techdeck_license_key_product_fk FOREIGN KEY (tenant_id, product_id)
        REFERENCES techdeck_license_products(tenant_id, id),
      CONSTRAINT techdeck_license_key_hash_check CHECK (key_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT techdeck_license_key_activation_check CHECK (max_activations BETWEEN 1 AND 10000),
      CONSTRAINT uq_techdeck_license_key_hash UNIQUE (key_hash),
      CONSTRAINT uq_techdeck_license_key_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_techdeck_license_keys_product
      ON techdeck_license_keys(tenant_id, product_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS techdeck_license_activations (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      license_key_id VARCHAR(36) NOT NULL,
      device_fingerprint_hash CHAR(64) NOT NULL,
      client_ip_hash CHAR(64),
      user_agent VARCHAR(300),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_validated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMPTZ,
      CONSTRAINT techdeck_license_activation_key_fk FOREIGN KEY (tenant_id, license_key_id)
        REFERENCES techdeck_license_keys(tenant_id, id),
      CONSTRAINT techdeck_license_activation_device_hash_check CHECK (device_fingerprint_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT techdeck_license_activation_ip_hash_check CHECK (client_ip_hash IS NULL OR client_ip_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT uq_techdeck_license_activation_device UNIQUE (tenant_id, license_key_id, device_fingerprint_hash),
      CONSTRAINT uq_techdeck_license_activation_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_techdeck_license_activation_key
      ON techdeck_license_activations(tenant_id, license_key_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS techdeck_license_rate_limits (
      bucket_hash CHAR(64) PRIMARY KEY,
      request_count INTEGER NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT techdeck_license_rate_limit_count_check CHECK (request_count BETWEEN 1 AND 10000),
      CONSTRAINT techdeck_license_rate_limit_hash_check CHECK (bucket_hash ~ '^[0-9a-f]{64}$')
    );
    CREATE INDEX IF NOT EXISTS idx_techdeck_license_rate_limit_expiry ON techdeck_license_rate_limits(expires_at);

    CREATE TABLE IF NOT EXISTS techdeck_status_pages (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      title VARCHAR(160) NOT NULL,
      public_slug VARCHAR(120) NOT NULL,
      description TEXT,
      public BOOLEAN NOT NULL DEFAULT FALSE,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      archived_at TIMESTAMPTZ,
      CONSTRAINT techdeck_status_page_slug_check CHECK (public_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
      CONSTRAINT techdeck_status_page_version_check CHECK (version >= 1),
      CONSTRAINT uq_techdeck_status_page_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_techdeck_status_page_slug
      ON techdeck_status_pages(public_slug) WHERE archived_at IS NULL;

    CREATE TABLE IF NOT EXISTS techdeck_status_components (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      status_page_id VARCHAR(36) NOT NULL,
      name VARCHAR(160) NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'operational',
      display_order INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      archived_at TIMESTAMPTZ,
      CONSTRAINT techdeck_status_component_page_fk FOREIGN KEY (tenant_id, status_page_id)
        REFERENCES techdeck_status_pages(tenant_id, id),
      CONSTRAINT techdeck_status_component_state_check CHECK (status IN ('operational','degraded','partial_outage','major_outage','maintenance')),
      CONSTRAINT techdeck_status_component_version_check CHECK (version >= 1),
      CONSTRAINT uq_techdeck_status_component_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_techdeck_status_components_page
      ON techdeck_status_components(tenant_id, status_page_id, display_order) WHERE archived_at IS NULL;

    CREATE TABLE IF NOT EXISTS techdeck_status_incidents (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      status_page_id VARCHAR(36) NOT NULL,
      title VARCHAR(200) NOT NULL,
      description TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'minor',
      status TEXT NOT NULL DEFAULT 'investigating',
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      archived_at TIMESTAMPTZ,
      CONSTRAINT techdeck_status_incident_page_fk FOREIGN KEY (tenant_id, status_page_id)
        REFERENCES techdeck_status_pages(tenant_id, id),
      CONSTRAINT techdeck_status_incident_severity_check CHECK (severity IN ('maintenance','minor','major','critical')),
      CONSTRAINT techdeck_status_incident_state_check CHECK (status IN ('investigating','identified','monitoring','resolved')),
      CONSTRAINT techdeck_status_incident_version_check CHECK (version >= 1),
      CONSTRAINT uq_techdeck_status_incident_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_techdeck_status_incidents_page
      ON techdeck_status_incidents(tenant_id, status_page_id, started_at DESC) WHERE archived_at IS NULL;

    CREATE TABLE IF NOT EXISTS techdeck_status_incident_updates (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      incident_id VARCHAR(36) NOT NULL,
      status TEXT NOT NULL,
      message TEXT NOT NULL,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT techdeck_status_update_incident_fk FOREIGN KEY (tenant_id, incident_id)
        REFERENCES techdeck_status_incidents(tenant_id, id) ON DELETE CASCADE,
      CONSTRAINT techdeck_status_update_state_check CHECK (status IN ('investigating','identified','monitoring','resolved')),
      CONSTRAINT uq_techdeck_status_update_tenant_id UNIQUE (tenant_id, id)
    );

    CREATE TABLE IF NOT EXISTS techdeck_status_subscriptions (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      status_page_id VARCHAR(36) NOT NULL,
      channel TEXT NOT NULL,
      destination_hash CHAR(64) NOT NULL,
      destination_reference_id VARCHAR(36) NOT NULL,
      verified BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMPTZ,
      CONSTRAINT techdeck_status_subscription_page_fk FOREIGN KEY (tenant_id, status_page_id)
        REFERENCES techdeck_status_pages(tenant_id, id),
      CONSTRAINT techdeck_status_subscription_destination_fk FOREIGN KEY (tenant_id, destination_reference_id)
        REFERENCES shared_secret_references(tenant_id, id),
      CONSTRAINT techdeck_status_subscription_channel_check CHECK (channel IN ('email','webhook')),
      CONSTRAINT techdeck_status_subscription_hash_check CHECK (destination_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT uq_techdeck_status_subscription UNIQUE (tenant_id, status_page_id, channel, destination_hash),
      CONSTRAINT uq_techdeck_status_subscription_tenant_id UNIQUE (tenant_id, id)
    );

    CREATE TABLE IF NOT EXISTS techdeck_intake_policies (
      tenant_id VARCHAR(36) PRIMARY KEY REFERENCES tenants(id),
      allowed_file_types JSONB NOT NULL DEFAULT '["application/pdf","image/png","image/jpeg","text/plain"]'::jsonb,
      max_file_size_bytes INTEGER NOT NULL DEFAULT 10485760,
      default_expiration_hours INTEGER NOT NULL DEFAULT 72,
      default_retention_days INTEGER NOT NULL DEFAULT 30,
      require_password BOOLEAN NOT NULL DEFAULT TRUE,
      compliance_notice TEXT,
      updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT techdeck_intake_policy_types_check CHECK (jsonb_typeof(allowed_file_types) = 'array'),
      CONSTRAINT techdeck_intake_policy_size_check CHECK (max_file_size_bytes BETWEEN 1024 AND 10485760),
      CONSTRAINT techdeck_intake_policy_expiry_check CHECK (default_expiration_hours BETWEEN 1 AND 720),
      CONSTRAINT techdeck_intake_policy_retention_check CHECK (default_retention_days BETWEEN 1 AND 3650),
      CONSTRAINT techdeck_intake_policy_version_check CHECK (version >= 1)
    );

    CREATE TABLE IF NOT EXISTS techdeck_intake_spaces (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      name VARCHAR(160) NOT NULL,
      slug VARCHAR(120) NOT NULL,
      description TEXT,
      allowed_file_types JSONB NOT NULL DEFAULT '[]'::jsonb,
      max_file_size_bytes INTEGER NOT NULL DEFAULT 10485760,
      retention_days INTEGER NOT NULL DEFAULT 30,
      external_uploads_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      status TEXT NOT NULL DEFAULT 'active',
      metadata_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      archived_at TIMESTAMPTZ,
      CONSTRAINT techdeck_intake_space_slug_check CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
      CONSTRAINT techdeck_intake_space_types_check CHECK (jsonb_typeof(allowed_file_types) = 'array'),
      CONSTRAINT techdeck_intake_space_metadata_check CHECK (jsonb_typeof(metadata_schema) = 'object'),
      CONSTRAINT techdeck_intake_space_size_check CHECK (max_file_size_bytes BETWEEN 1024 AND 10485760),
      CONSTRAINT techdeck_intake_space_retention_check CHECK (retention_days BETWEEN 1 AND 3650),
      CONSTRAINT techdeck_intake_space_state_check CHECK (status IN ('active','paused','archived')),
      CONSTRAINT techdeck_intake_space_version_check CHECK (version >= 1),
      CONSTRAINT uq_techdeck_intake_space_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_techdeck_intake_space_slug
      ON techdeck_intake_spaces(tenant_id, slug) WHERE archived_at IS NULL;

    CREATE TABLE IF NOT EXISTS techdeck_intake_requests (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      space_id VARCHAR(36) NOT NULL,
      directory_organization_id VARCHAR(36),
      title VARCHAR(200) NOT NULL,
      instructions TEXT,
      token_prefix VARCHAR(20) NOT NULL,
      token_hash CHAR(64) NOT NULL,
      password_hash TEXT,
      uploader_name VARCHAR(160),
      uploader_email_hash CHAR(64),
      max_uploads INTEGER NOT NULL DEFAULT 5,
      max_total_size_bytes INTEGER NOT NULL DEFAULT 26214400,
      upload_count INTEGER NOT NULL DEFAULT 0,
      uploaded_bytes INTEGER NOT NULL DEFAULT 0,
      one_time_use BOOLEAN NOT NULL DEFAULT FALSE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      CONSTRAINT techdeck_intake_request_space_fk FOREIGN KEY (tenant_id, space_id)
        REFERENCES techdeck_intake_spaces(tenant_id, id),
      CONSTRAINT techdeck_intake_request_org_fk FOREIGN KEY (tenant_id, directory_organization_id)
        REFERENCES directory_organizations(tenant_id, id),
      CONSTRAINT techdeck_intake_request_token_hash_check CHECK (token_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT techdeck_intake_request_email_hash_check CHECK (uploader_email_hash IS NULL OR uploader_email_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT techdeck_intake_request_upload_check CHECK (max_uploads BETWEEN 1 AND 100 AND upload_count BETWEEN 0 AND max_uploads),
      CONSTRAINT techdeck_intake_request_size_check CHECK (max_total_size_bytes BETWEEN 1024 AND 104857600 AND uploaded_bytes BETWEEN 0 AND max_total_size_bytes),
      CONSTRAINT techdeck_intake_request_version_check CHECK (version >= 1),
      CONSTRAINT uq_techdeck_intake_request_token UNIQUE (token_hash),
      CONSTRAINT uq_techdeck_intake_request_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_techdeck_intake_requests_tenant
      ON techdeck_intake_requests(tenant_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS techdeck_intake_files (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      request_id VARCHAR(36) NOT NULL,
      shared_attachment_id VARCHAR(36) NOT NULL,
      original_name VARCHAR(240) NOT NULL,
      mime_type VARCHAR(160) NOT NULL,
      size_bytes INTEGER NOT NULL,
      sha256 CHAR(64) NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'pending_scan',
      uploader_ip_hash CHAR(64),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMPTZ,
      review_notes TEXT,
      deleted_at TIMESTAMPTZ,
      CONSTRAINT techdeck_intake_file_request_fk FOREIGN KEY (tenant_id, request_id)
        REFERENCES techdeck_intake_requests(tenant_id, id),
      CONSTRAINT techdeck_intake_file_attachment_fk FOREIGN KEY (tenant_id, shared_attachment_id)
        REFERENCES shared_attachments(tenant_id, id),
      CONSTRAINT techdeck_intake_file_hash_check CHECK (sha256 ~ '^[0-9a-f]{64}$'),
      CONSTRAINT techdeck_intake_file_ip_hash_check CHECK (uploader_ip_hash IS NULL OR uploader_ip_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT techdeck_intake_file_metadata_check CHECK (jsonb_typeof(metadata) = 'object'),
      CONSTRAINT techdeck_intake_file_state_check CHECK (status IN ('pending_scan','clean','quarantined','reviewed','deleted')),
      CONSTRAINT uq_techdeck_intake_file_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_techdeck_intake_file_hash
      ON techdeck_intake_files(tenant_id, request_id, sha256) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS techdeck_intake_audit_events (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      request_id VARCHAR(36),
      actor_type TEXT NOT NULL,
      actor_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      action VARCHAR(120) NOT NULL,
      object_type VARCHAR(80),
      object_id VARCHAR(36),
      ip_hash CHAR(64),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT techdeck_intake_audit_request_fk FOREIGN KEY (tenant_id, request_id)
        REFERENCES techdeck_intake_requests(tenant_id, id),
      CONSTRAINT techdeck_intake_audit_actor_check CHECK (actor_type IN ('operator','external','system')),
      CONSTRAINT techdeck_intake_audit_ip_hash_check CHECK (ip_hash IS NULL OR ip_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT techdeck_intake_audit_metadata_check CHECK (jsonb_typeof(metadata) = 'object'),
      CONSTRAINT uq_techdeck_intake_audit_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_techdeck_intake_audit_tenant
      ON techdeck_intake_audit_events(tenant_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS techdeck_intake_rate_limits (
      bucket_hash CHAR(64) PRIMARY KEY,
      request_count INTEGER NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT techdeck_intake_rate_limit_count_check CHECK (request_count BETWEEN 1 AND 10000),
      CONSTRAINT techdeck_intake_rate_limit_hash_check CHECK (bucket_hash ~ '^[0-9a-f]{64}$')
    );
    CREATE INDEX IF NOT EXISTS idx_techdeck_intake_rate_limit_expiry ON techdeck_intake_rate_limits(expires_at);

    CREATE TABLE IF NOT EXISTS techdeck_evidence_file_links (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      evidence_id VARCHAR(36) NOT NULL,
      shared_attachment_id VARCHAR(36) NOT NULL,
      sha256 CHAR(64) NOT NULL,
      original_name VARCHAR(240) NOT NULL,
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ,
      CONSTRAINT techdeck_evidence_file_evidence_fk FOREIGN KEY (tenant_id, evidence_id)
        REFERENCES techdeck_evidence(tenant_id, id),
      CONSTRAINT techdeck_evidence_file_attachment_fk FOREIGN KEY (tenant_id, shared_attachment_id)
        REFERENCES shared_attachments(tenant_id, id),
      CONSTRAINT techdeck_evidence_file_hash_check CHECK (sha256 ~ '^[0-9a-f]{64}$'),
      CONSTRAINT uq_techdeck_evidence_file_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_techdeck_evidence_file_link
      ON techdeck_evidence_file_links(tenant_id, evidence_id, sha256) WHERE deleted_at IS NULL;
  `);
}
