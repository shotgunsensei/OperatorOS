import { sql } from 'drizzle-orm';
import { db } from '../db.js';

/** Additive, idempotent Phase 2 Business Directory schema. */
export async function ensureDirectoryTables(): Promise<void> {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS directory_organizations (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL, normalized_name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'client', status TEXT NOT NULL DEFAULT 'active',
      website TEXT, notes TEXT, created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(), archived_at TIMESTAMP,
      CONSTRAINT directory_org_type_check CHECK (type IN ('customer','client','vendor','partner','facility','other')),
      CONSTRAINT directory_org_status_check CHECK (status IN ('active','inactive')),
      CONSTRAINT uq_directory_org_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_directory_orgs_tenant_name ON directory_organizations(tenant_id, normalized_name);
    CREATE INDEX IF NOT EXISTS idx_directory_orgs_tenant_type ON directory_organizations(tenant_id, type);
    CREATE INDEX IF NOT EXISTS idx_directory_orgs_tenant_status ON directory_organizations(tenant_id, status, archived_at);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_directory_orgs_tenant_active_name ON directory_organizations(tenant_id, normalized_name) WHERE archived_at IS NULL;

    CREATE TABLE IF NOT EXISTS directory_contacts (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      first_name TEXT NOT NULL, last_name TEXT NOT NULL DEFAULT '', normalized_name TEXT NOT NULL, email TEXT, normalized_email TEXT, phone TEXT, title TEXT,
      status TEXT NOT NULL DEFAULT 'active', created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(), archived_at TIMESTAMP,
      CONSTRAINT directory_contact_status_check CHECK (status IN ('active','inactive')),
      CONSTRAINT uq_directory_contact_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_directory_contacts_tenant_name ON directory_contacts(tenant_id, normalized_name);
    CREATE INDEX IF NOT EXISTS idx_directory_contacts_tenant_status ON directory_contacts(tenant_id, status, archived_at);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_directory_contacts_tenant_active_email ON directory_contacts(tenant_id, normalized_email) WHERE normalized_email IS NOT NULL AND archived_at IS NULL;

    CREATE TABLE IF NOT EXISTS directory_addresses (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id), label TEXT,
      line1 TEXT NOT NULL, line2 TEXT, city TEXT NOT NULL, region TEXT NOT NULL, postal_code TEXT NOT NULL, country_code VARCHAR(2) NOT NULL DEFAULT 'US',
      normalized_key TEXT NOT NULL, created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(), archived_at TIMESTAMP,
      CONSTRAINT uq_directory_address_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_directory_addresses_tenant_postal ON directory_addresses(tenant_id, postal_code);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_directory_addresses_tenant_active_key ON directory_addresses(tenant_id, normalized_key) WHERE archived_at IS NULL;

    CREATE TABLE IF NOT EXISTS directory_sites (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id), organization_id VARCHAR(36) NOT NULL,
      address_id VARCHAR(36), name TEXT NOT NULL, normalized_name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'office', status TEXT NOT NULL DEFAULT 'active',
      timezone TEXT, notes TEXT, created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(), archived_at TIMESTAMP,
      CONSTRAINT directory_site_org_fk FOREIGN KEY (tenant_id, organization_id) REFERENCES directory_organizations(tenant_id, id),
      CONSTRAINT directory_site_address_fk FOREIGN KEY (tenant_id, address_id) REFERENCES directory_addresses(tenant_id, id),
      CONSTRAINT directory_site_type_check CHECK (type IN ('headquarters','office','facility','service','remote','other')),
      CONSTRAINT directory_site_status_check CHECK (status IN ('active','inactive')),
      CONSTRAINT uq_directory_site_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_directory_sites_tenant_org ON directory_sites(tenant_id, organization_id);
    CREATE INDEX IF NOT EXISTS idx_directory_sites_tenant_status ON directory_sites(tenant_id, status, archived_at);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_directory_sites_tenant_org_active_name ON directory_sites(tenant_id, organization_id, normalized_name) WHERE archived_at IS NULL;

    CREATE TABLE IF NOT EXISTS directory_organization_contacts (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id), organization_id VARCHAR(36) NOT NULL,
      contact_id VARCHAR(36) NOT NULL, role TEXT, is_primary BOOLEAN NOT NULL DEFAULT FALSE, created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT directory_org_contact_org_fk FOREIGN KEY (tenant_id, organization_id) REFERENCES directory_organizations(tenant_id, id),
      CONSTRAINT directory_org_contact_contact_fk FOREIGN KEY (tenant_id, contact_id) REFERENCES directory_contacts(tenant_id, id),
      CONSTRAINT uq_directory_org_contacts UNIQUE (tenant_id, organization_id, contact_id)
    );
    CREATE INDEX IF NOT EXISTS idx_directory_org_contacts_contact ON directory_organization_contacts(tenant_id, contact_id);

    CREATE TABLE IF NOT EXISTS directory_site_contacts (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id), site_id VARCHAR(36) NOT NULL,
      contact_id VARCHAR(36) NOT NULL, role TEXT, is_primary BOOLEAN NOT NULL DEFAULT FALSE, created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT directory_site_contact_site_fk FOREIGN KEY (tenant_id, site_id) REFERENCES directory_sites(tenant_id, id),
      CONSTRAINT directory_site_contact_contact_fk FOREIGN KEY (tenant_id, contact_id) REFERENCES directory_contacts(tenant_id, id),
      CONSTRAINT uq_directory_site_contacts UNIQUE (tenant_id, site_id, contact_id)
    );
    CREATE INDEX IF NOT EXISTS idx_directory_site_contacts_contact ON directory_site_contacts(tenant_id, contact_id);

    CREATE TABLE IF NOT EXISTS directory_relationships (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id), from_organization_id VARCHAR(36) NOT NULL,
      to_organization_id VARCHAR(36) NOT NULL, type TEXT NOT NULL, notes TEXT, created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(), archived_at TIMESTAMP,
      CONSTRAINT directory_relationship_from_fk FOREIGN KEY (tenant_id, from_organization_id) REFERENCES directory_organizations(tenant_id, id),
      CONSTRAINT directory_relationship_to_fk FOREIGN KEY (tenant_id, to_organization_id) REFERENCES directory_organizations(tenant_id, id),
      CONSTRAINT directory_relationship_distinct_check CHECK (from_organization_id <> to_organization_id)
    );
    CREATE INDEX IF NOT EXISTS idx_directory_relationships_from ON directory_relationships(tenant_id, from_organization_id);
    CREATE INDEX IF NOT EXISTS idx_directory_relationships_to ON directory_relationships(tenant_id, to_organization_id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_directory_relationships_active ON directory_relationships(tenant_id, from_organization_id, to_organization_id, type) WHERE archived_at IS NULL;

    CREATE TABLE IF NOT EXISTS directory_tags (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id), name TEXT NOT NULL, normalized_name TEXT NOT NULL,
      color TEXT, created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), created_at TIMESTAMP NOT NULL DEFAULT NOW(), archived_at TIMESTAMP,
      CONSTRAINT uq_directory_tag_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_directory_tags_tenant_active_name ON directory_tags(tenant_id, normalized_name) WHERE archived_at IS NULL;

    CREATE TABLE IF NOT EXISTS directory_tag_assignments (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id), tag_id VARCHAR(36) NOT NULL,
      entity_type TEXT NOT NULL, organization_id VARCHAR(36), contact_id VARCHAR(36), site_id VARCHAR(36),
      created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT directory_tag_assignment_tag_fk FOREIGN KEY (tenant_id, tag_id) REFERENCES directory_tags(tenant_id, id),
      CONSTRAINT directory_tag_assignment_org_fk FOREIGN KEY (tenant_id, organization_id) REFERENCES directory_organizations(tenant_id, id),
      CONSTRAINT directory_tag_assignment_contact_fk FOREIGN KEY (tenant_id, contact_id) REFERENCES directory_contacts(tenant_id, id),
      CONSTRAINT directory_tag_assignment_site_fk FOREIGN KEY (tenant_id, site_id) REFERENCES directory_sites(tenant_id, id),
      CONSTRAINT directory_tag_assignment_entity_check CHECK (
        (entity_type = 'organization' AND organization_id IS NOT NULL AND contact_id IS NULL AND site_id IS NULL) OR
        (entity_type = 'contact' AND organization_id IS NULL AND contact_id IS NOT NULL AND site_id IS NULL) OR
        (entity_type = 'site' AND organization_id IS NULL AND contact_id IS NULL AND site_id IS NOT NULL)
      )
    );
    CREATE INDEX IF NOT EXISTS idx_directory_tag_assignments_entity ON directory_tag_assignments(tenant_id, entity_type);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_directory_tag_assignments_org ON directory_tag_assignments(tenant_id, tag_id, organization_id) WHERE organization_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_directory_tag_assignments_contact ON directory_tag_assignments(tenant_id, tag_id, contact_id) WHERE contact_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_directory_tag_assignments_site ON directory_tag_assignments(tenant_id, tag_id, site_id) WHERE site_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS tradeflowkit_customer_profiles (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id), organization_id VARCHAR(36) NOT NULL,
      customer_status TEXT NOT NULL DEFAULT 'active', payment_terms_days INTEGER, notes TEXT, created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT tfk_customer_profile_org_fk FOREIGN KEY (tenant_id, organization_id) REFERENCES directory_organizations(tenant_id, id),
      CONSTRAINT uq_tfk_customer_profiles_tenant_org UNIQUE (tenant_id, organization_id)
    );
    CREATE TABLE IF NOT EXISTS techdeck_managed_client_profiles (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id), organization_id VARCHAR(36) NOT NULL,
      service_tier TEXT, account_code TEXT, notes TEXT, created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT techdeck_client_profile_org_fk FOREIGN KEY (tenant_id, organization_id) REFERENCES directory_organizations(tenant_id, id),
      CONSTRAINT uq_techdeck_client_profiles_tenant_org UNIQUE (tenant_id, organization_id)
    );
    CREATE TABLE IF NOT EXISTS pulsedesk_service_client_profiles (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id), organization_id VARCHAR(36) NOT NULL,
      facility_category TEXT, phi_restricted BOOLEAN NOT NULL DEFAULT TRUE, notes TEXT, created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      updated_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id), version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT pulsedesk_client_profile_org_fk FOREIGN KEY (tenant_id, organization_id) REFERENCES directory_organizations(tenant_id, id),
      CONSTRAINT uq_pulsedesk_client_profiles_tenant_org UNIQUE (tenant_id, organization_id)
    );
  `));
}
