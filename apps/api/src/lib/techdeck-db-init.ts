import { db } from '../db.js';

/**
 * Additive, idempotent TechDeck state-5 schema release.
 *
 * TechDeck owns tenant-scoped managed-infrastructure documentation, network
 * and IPAM records, runbook documentation, evidence, reports, and time. It
 * deliberately stores only external vault references and has no command
 * execution tables. Rollback follows the root restore-to-new-database
 * contract; this release never performs a destructive in-place down step.
 */
export async function ensureTechDeckTables(): Promise<void> {
  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_directory_sites_tenant_org_id ON directory_sites(tenant_id, organization_id, id);
    ALTER TABLE techdeck_tickets ADD COLUMN IF NOT EXISTS directory_organization_id VARCHAR(36) REFERENCES directory_organizations(id) ON DELETE SET NULL;
    ALTER TABLE techdeck_tickets ADD COLUMN IF NOT EXISTS directory_site_id VARCHAR(36) REFERENCES directory_sites(id) ON DELETE SET NULL;
    ALTER TABLE techdeck_tickets ADD COLUMN IF NOT EXISTS configuration_item_id VARCHAR(36);
    ALTER TABLE techdeck_tickets ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_techdeck_tickets_tenant_id ON techdeck_tickets(tenant_id, id);
    CREATE INDEX IF NOT EXISTS idx_techdeck_tickets_directory ON techdeck_tickets(tenant_id, directory_organization_id, directory_site_id);
    DO $$ BEGIN
      ALTER TABLE techdeck_tickets ADD CONSTRAINT techdeck_tickets_version_check CHECK (version >= 1);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE techdeck_tickets ADD CONSTRAINT techdeck_tickets_org_tenant_fk
        FOREIGN KEY (tenant_id, directory_organization_id) REFERENCES directory_organizations(tenant_id, id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE techdeck_tickets ADD CONSTRAINT techdeck_tickets_site_tenant_fk
        FOREIGN KEY (tenant_id, directory_site_id) REFERENCES directory_sites(tenant_id, id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE techdeck_tickets ADD CONSTRAINT techdeck_tickets_site_org_fk
        FOREIGN KEY (tenant_id, directory_organization_id, directory_site_id) REFERENCES directory_sites(tenant_id, organization_id, id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE techdeck_tickets ADD CONSTRAINT techdeck_tickets_site_org_check
        CHECK (directory_site_id IS NULL OR directory_organization_id IS NOT NULL);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    ALTER TABLE techdeck_assets ADD COLUMN IF NOT EXISTS directory_organization_id VARCHAR(36) REFERENCES directory_organizations(id) ON DELETE SET NULL;
    ALTER TABLE techdeck_assets ADD COLUMN IF NOT EXISTS directory_site_id VARCHAR(36) REFERENCES directory_sites(id) ON DELETE SET NULL;
    ALTER TABLE techdeck_assets ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
    ALTER TABLE techdeck_assets ADD COLUMN IF NOT EXISTS vendor TEXT;
    ALTER TABLE techdeck_assets ADD COLUMN IF NOT EXISTS product TEXT;
    ALTER TABLE techdeck_assets ADD COLUMN IF NOT EXISTS model TEXT;
    ALTER TABLE techdeck_assets ADD COLUMN IF NOT EXISTS serial_number TEXT;
    ALTER TABLE techdeck_assets ADD COLUMN IF NOT EXISTS mac_address TEXT;
    ALTER TABLE techdeck_assets ADD COLUMN IF NOT EXISTS external_vault_reference TEXT;
    ALTER TABLE techdeck_assets ADD COLUMN IF NOT EXISTS vlan_number INTEGER;
    ALTER TABLE techdeck_assets ADD COLUMN IF NOT EXISTS cidr TEXT;
    ALTER TABLE techdeck_assets ADD COLUMN IF NOT EXISTS gateway TEXT;
    ALTER TABLE techdeck_assets ADD COLUMN IF NOT EXISTS dhcp_start TEXT;
    ALTER TABLE techdeck_assets ADD COLUMN IF NOT EXISTS dhcp_end TEXT;
    ALTER TABLE techdeck_assets ADD COLUMN IF NOT EXISTS dns_servers JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE techdeck_assets ADD COLUMN IF NOT EXISTS expiration_date TIMESTAMP;
    ALTER TABLE techdeck_assets ADD COLUMN IF NOT EXISTS renewal_date TIMESTAMP;
    ALTER TABLE techdeck_assets ADD COLUMN IF NOT EXISTS warranty_end_date TIMESTAMP;
    ALTER TABLE techdeck_assets ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE techdeck_assets ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_techdeck_assets_tenant_id ON techdeck_assets(tenant_id, id);
    CREATE INDEX IF NOT EXISTS idx_techdeck_assets_tenant_type ON techdeck_assets(tenant_id, type);
    CREATE INDEX IF NOT EXISTS idx_techdeck_assets_directory ON techdeck_assets(tenant_id, directory_organization_id, directory_site_id);
    CREATE INDEX IF NOT EXISTS idx_techdeck_assets_lifecycle ON techdeck_assets(tenant_id, expiration_date, renewal_date, warranty_end_date);
    ALTER TABLE techdeck_assets DROP CONSTRAINT IF EXISTS techdeck_assets_type_check;
    DO $$ BEGIN
      ALTER TABLE techdeck_assets ADD CONSTRAINT techdeck_assets_type_check CHECK (type IN (
        'endpoint','server','workstation','network','network_device','firewall','switch','access_point',
        'printer','mobile','application','domain','dns_record','dhcp_scope','vlan','subnet','ip_address',
        'public_ip','isp','circuit','vendor','license','certificate','warranty','port_mapping',
        'configuration_item','credential_reference','other'
      ));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE techdeck_assets ADD CONSTRAINT techdeck_assets_status_check CHECK (status IN ('active','inactive','planned','retired'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE techdeck_assets ADD CONSTRAINT techdeck_assets_version_check CHECK (version >= 1);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE techdeck_assets ADD CONSTRAINT techdeck_assets_vlan_check CHECK (vlan_number IS NULL OR vlan_number BETWEEN 1 AND 4094);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE techdeck_assets ADD CONSTRAINT techdeck_assets_dns_check CHECK (jsonb_typeof(dns_servers) = 'array');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE techdeck_assets ADD CONSTRAINT techdeck_assets_details_check CHECK (jsonb_typeof(details) = 'object');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE techdeck_assets ADD CONSTRAINT techdeck_assets_tags_check CHECK (jsonb_typeof(tags) = 'array');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE techdeck_assets ADD CONSTRAINT techdeck_assets_org_tenant_fk
        FOREIGN KEY (tenant_id, directory_organization_id) REFERENCES directory_organizations(tenant_id, id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE techdeck_assets ADD CONSTRAINT techdeck_assets_site_tenant_fk
        FOREIGN KEY (tenant_id, directory_site_id) REFERENCES directory_sites(tenant_id, id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE techdeck_assets ADD CONSTRAINT techdeck_assets_site_org_fk
        FOREIGN KEY (tenant_id, directory_organization_id, directory_site_id) REFERENCES directory_sites(tenant_id, organization_id, id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE techdeck_assets ADD CONSTRAINT techdeck_assets_site_org_check
        CHECK (directory_site_id IS NULL OR directory_organization_id IS NOT NULL);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS techdeck_configuration_relationships (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      source_asset_id VARCHAR(36) NOT NULL, target_asset_id VARCHAR(36) NOT NULL,
      relationship_type TEXT NOT NULL DEFAULT 'depends_on', notes TEXT,
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), deleted_at TIMESTAMP,
      CONSTRAINT techdeck_relationship_source_fk FOREIGN KEY (tenant_id, source_asset_id) REFERENCES techdeck_assets(tenant_id, id) ON DELETE CASCADE,
      CONSTRAINT techdeck_relationship_target_fk FOREIGN KEY (tenant_id, target_asset_id) REFERENCES techdeck_assets(tenant_id, id) ON DELETE CASCADE,
      CONSTRAINT techdeck_relationship_not_self CHECK (source_asset_id <> target_asset_id),
      CONSTRAINT techdeck_relationship_type_check CHECK (relationship_type IN ('depends_on','connects_to','hosts','runs','protects','routes_to','assigned_to','documents','other')),
      CONSTRAINT uq_techdeck_relationship_tenant_id UNIQUE (tenant_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_techdeck_relationships_tenant_source ON techdeck_configuration_relationships(tenant_id, source_asset_id);
    CREATE INDEX IF NOT EXISTS idx_techdeck_relationships_tenant_target ON techdeck_configuration_relationships(tenant_id, target_asset_id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_techdeck_relationship_active ON techdeck_configuration_relationships(tenant_id, source_asset_id, target_asset_id, relationship_type) WHERE deleted_at IS NULL;

    DO $$ BEGIN
      ALTER TABLE techdeck_tickets ADD CONSTRAINT techdeck_tickets_configuration_tenant_fk
        FOREIGN KEY (tenant_id, configuration_item_id) REFERENCES techdeck_assets(tenant_id, id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS techdeck_document_folders (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      directory_organization_id VARCHAR(36), parent_id VARCHAR(36), name TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1, created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(), archived_at TIMESTAMP,
      CONSTRAINT uq_techdeck_folder_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT techdeck_folder_org_fk FOREIGN KEY (tenant_id, directory_organization_id) REFERENCES directory_organizations(tenant_id, id),
      CONSTRAINT techdeck_folder_version_check CHECK (version >= 1)
    );
    DO $$ BEGIN
      ALTER TABLE techdeck_document_folders ADD CONSTRAINT techdeck_folder_parent_fk
        FOREIGN KEY (tenant_id, parent_id) REFERENCES techdeck_document_folders(tenant_id, id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS idx_techdeck_folders_tenant_parent ON techdeck_document_folders(tenant_id, parent_id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_techdeck_folder_name ON techdeck_document_folders(tenant_id, COALESCE(parent_id, ''), lower(name)) WHERE archived_at IS NULL;

    CREATE TABLE IF NOT EXISTS techdeck_documents (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      directory_organization_id VARCHAR(36), directory_site_id VARCHAR(36), folder_id VARCHAR(36),
      page_type TEXT NOT NULL DEFAULT 'documentation', title TEXT NOT NULL, slug TEXT NOT NULL,
      summary TEXT, content TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', minimum_role TEXT NOT NULL DEFAULT 'member',
      tags JSONB NOT NULL DEFAULT '[]'::jsonb, version INTEGER NOT NULL DEFAULT 1,
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL, updated_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      reviewed_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL, approved_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      published_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMP, approved_at TIMESTAMP, published_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(), archived_at TIMESTAMP,
      CONSTRAINT uq_techdeck_document_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT techdeck_document_org_fk FOREIGN KEY (tenant_id, directory_organization_id) REFERENCES directory_organizations(tenant_id, id),
      CONSTRAINT techdeck_document_site_fk FOREIGN KEY (tenant_id, directory_site_id) REFERENCES directory_sites(tenant_id, id),
      CONSTRAINT techdeck_document_site_org_fk FOREIGN KEY (tenant_id, directory_organization_id, directory_site_id) REFERENCES directory_sites(tenant_id, organization_id, id),
      CONSTRAINT techdeck_document_folder_fk FOREIGN KEY (tenant_id, folder_id) REFERENCES techdeck_document_folders(tenant_id, id),
      CONSTRAINT techdeck_document_type_check CHECK (page_type IN ('documentation','runbook','knowledge_base','procedure','network_diagram','configuration_standard')),
      CONSTRAINT techdeck_document_status_check CHECK (status IN ('draft','in_review','approved','published','archived')),
      CONSTRAINT techdeck_document_role_check CHECK (minimum_role IN ('member','admin','owner')),
      CONSTRAINT techdeck_document_version_check CHECK (version >= 1),
      CONSTRAINT techdeck_document_tags_check CHECK (jsonb_typeof(tags) = 'array')
      ,CONSTRAINT techdeck_document_site_org_check CHECK (directory_site_id IS NULL OR directory_organization_id IS NOT NULL)
    );
    CREATE INDEX IF NOT EXISTS idx_techdeck_documents_tenant_status ON techdeck_documents(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_techdeck_documents_directory ON techdeck_documents(tenant_id, directory_organization_id, directory_site_id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_techdeck_document_slug ON techdeck_documents(tenant_id, slug);
    DO $$ BEGIN
      ALTER TABLE techdeck_documents ADD CONSTRAINT techdeck_document_site_org_fk
        FOREIGN KEY (tenant_id, directory_organization_id, directory_site_id) REFERENCES directory_sites(tenant_id, organization_id, id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE techdeck_documents ADD CONSTRAINT techdeck_document_site_org_check
        CHECK (directory_site_id IS NULL OR directory_organization_id IS NOT NULL);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS techdeck_document_revisions (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id), document_id VARCHAR(36) NOT NULL,
      version INTEGER NOT NULL, title TEXT NOT NULL, summary TEXT, content TEXT NOT NULL, status TEXT NOT NULL,
      minimum_role TEXT NOT NULL, tags JSONB NOT NULL DEFAULT '[]'::jsonb, change_note TEXT,
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT techdeck_revision_document_fk FOREIGN KEY (tenant_id, document_id) REFERENCES techdeck_documents(tenant_id, id) ON DELETE CASCADE,
      CONSTRAINT techdeck_revision_version_check CHECK (version >= 1),
      CONSTRAINT techdeck_revision_tags_check CHECK (jsonb_typeof(tags) = 'array'),
      CONSTRAINT uq_techdeck_revision_version UNIQUE (tenant_id, document_id, version)
    );
    CREATE INDEX IF NOT EXISTS idx_techdeck_revisions_document ON techdeck_document_revisions(tenant_id, document_id, version DESC);

    CREATE TABLE IF NOT EXISTS techdeck_document_links (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      source_document_id VARCHAR(36) NOT NULL, target_document_id VARCHAR(36) NOT NULL, label TEXT,
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT techdeck_document_link_source_fk FOREIGN KEY (tenant_id, source_document_id) REFERENCES techdeck_documents(tenant_id, id) ON DELETE CASCADE,
      CONSTRAINT techdeck_document_link_target_fk FOREIGN KEY (tenant_id, target_document_id) REFERENCES techdeck_documents(tenant_id, id) ON DELETE CASCADE,
      CONSTRAINT techdeck_document_link_not_self CHECK (source_document_id <> target_document_id),
      CONSTRAINT uq_techdeck_document_link UNIQUE (tenant_id, source_document_id, target_document_id)
    );
    CREATE INDEX IF NOT EXISTS idx_techdeck_document_links_target ON techdeck_document_links(tenant_id, target_document_id);

    CREATE TABLE IF NOT EXISTS techdeck_evidence (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      directory_organization_id VARCHAR(36), directory_site_id VARCHAR(36), configuration_item_id VARCHAR(36), document_id VARCHAR(36), ticket_id VARCHAR(36),
      title TEXT NOT NULL, evidence_type TEXT NOT NULL DEFAULT 'observation', summary TEXT, source_reference TEXT, observed_at TIMESTAMP,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb, version INTEGER NOT NULL DEFAULT 1,
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(), archived_at TIMESTAMP,
      CONSTRAINT uq_techdeck_evidence_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT techdeck_evidence_org_fk FOREIGN KEY (tenant_id, directory_organization_id) REFERENCES directory_organizations(tenant_id, id),
      CONSTRAINT techdeck_evidence_site_fk FOREIGN KEY (tenant_id, directory_site_id) REFERENCES directory_sites(tenant_id, id),
      CONSTRAINT techdeck_evidence_site_org_fk FOREIGN KEY (tenant_id, directory_organization_id, directory_site_id) REFERENCES directory_sites(tenant_id, organization_id, id),
      CONSTRAINT techdeck_evidence_config_fk FOREIGN KEY (tenant_id, configuration_item_id) REFERENCES techdeck_assets(tenant_id, id),
      CONSTRAINT techdeck_evidence_document_fk FOREIGN KEY (tenant_id, document_id) REFERENCES techdeck_documents(tenant_id, id),
      CONSTRAINT techdeck_evidence_ticket_fk FOREIGN KEY (tenant_id, ticket_id) REFERENCES techdeck_tickets(tenant_id, id),
      CONSTRAINT techdeck_evidence_type_check CHECK (evidence_type IN ('observation','configuration_snapshot','test_result','photo','document','other')),
      CONSTRAINT techdeck_evidence_version_check CHECK (version >= 1),
      CONSTRAINT techdeck_evidence_tags_check CHECK (jsonb_typeof(tags) = 'array')
      ,CONSTRAINT techdeck_evidence_site_org_check CHECK (directory_site_id IS NULL OR directory_organization_id IS NOT NULL)
    );
    CREATE INDEX IF NOT EXISTS idx_techdeck_evidence_tenant_created ON techdeck_evidence(tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_techdeck_evidence_configuration ON techdeck_evidence(tenant_id, configuration_item_id);
    DO $$ BEGIN
      ALTER TABLE techdeck_evidence ADD CONSTRAINT techdeck_evidence_site_org_fk
        FOREIGN KEY (tenant_id, directory_organization_id, directory_site_id) REFERENCES directory_sites(tenant_id, organization_id, id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE techdeck_evidence ADD CONSTRAINT techdeck_evidence_site_org_check
        CHECK (directory_site_id IS NULL OR directory_organization_id IS NOT NULL);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS techdeck_reports (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL, report_type TEXT NOT NULL, filters JSONB NOT NULL DEFAULT '{}'::jsonb,
      snapshot JSONB NOT NULL DEFAULT '{}'::jsonb, sha256 VARCHAR(64) NOT NULL, version INTEGER NOT NULL DEFAULT 1,
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMP NOT NULL DEFAULT NOW(), archived_at TIMESTAMP,
      CONSTRAINT uq_techdeck_report_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT techdeck_report_type_check CHECK (report_type IN ('asset_inventory','network_inventory','lifecycle','ticket_summary','evidence_register','time_summary')),
      CONSTRAINT techdeck_report_sha_check CHECK (sha256 ~ '^[0-9a-f]{64}$'),
      CONSTRAINT techdeck_report_json_check CHECK (jsonb_typeof(filters) = 'object' AND jsonb_typeof(snapshot) = 'object'),
      CONSTRAINT techdeck_report_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_techdeck_reports_tenant_created ON techdeck_reports(tenant_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS techdeck_time_entries (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id), user_id VARCHAR(36) NOT NULL REFERENCES users(id),
      ticket_id VARCHAR(36), directory_organization_id VARCHAR(36), directory_site_id VARCHAR(36), configuration_item_id VARCHAR(36),
      worked_at TIMESTAMP NOT NULL, minutes INTEGER NOT NULL, billable BOOLEAN NOT NULL DEFAULT false, notes TEXT, version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(), deleted_at TIMESTAMP,
      CONSTRAINT techdeck_time_ticket_fk FOREIGN KEY (tenant_id, ticket_id) REFERENCES techdeck_tickets(tenant_id, id),
      CONSTRAINT techdeck_time_org_fk FOREIGN KEY (tenant_id, directory_organization_id) REFERENCES directory_organizations(tenant_id, id),
      CONSTRAINT techdeck_time_site_fk FOREIGN KEY (tenant_id, directory_site_id) REFERENCES directory_sites(tenant_id, id),
      CONSTRAINT techdeck_time_site_org_fk FOREIGN KEY (tenant_id, directory_organization_id, directory_site_id) REFERENCES directory_sites(tenant_id, organization_id, id),
      CONSTRAINT techdeck_time_config_fk FOREIGN KEY (tenant_id, configuration_item_id) REFERENCES techdeck_assets(tenant_id, id),
      CONSTRAINT techdeck_time_minutes_check CHECK (minutes BETWEEN 1 AND 1440),
      CONSTRAINT techdeck_time_version_check CHECK (version >= 1)
      ,CONSTRAINT techdeck_time_site_org_check CHECK (directory_site_id IS NULL OR directory_organization_id IS NOT NULL)
    );
    CREATE INDEX IF NOT EXISTS idx_techdeck_time_tenant_worked ON techdeck_time_entries(tenant_id, worked_at DESC);
    DO $$ BEGIN
      ALTER TABLE techdeck_time_entries ADD CONSTRAINT techdeck_time_site_org_fk
        FOREIGN KEY (tenant_id, directory_organization_id, directory_site_id) REFERENCES directory_sites(tenant_id, organization_id, id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE techdeck_time_entries ADD CONSTRAINT techdeck_time_site_org_check
        CHECK (directory_site_id IS NULL OR directory_organization_id IS NOT NULL);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS techdeck_ticket_comments (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id), ticket_id VARCHAR(36) NOT NULL,
      author_user_id VARCHAR(36) NOT NULL REFERENCES users(id), body TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(), deleted_at TIMESTAMP,
      CONSTRAINT techdeck_comment_ticket_fk FOREIGN KEY (tenant_id, ticket_id) REFERENCES techdeck_tickets(tenant_id, id) ON DELETE CASCADE,
      CONSTRAINT techdeck_comment_body_check CHECK (char_length(body) BETWEEN 1 AND 10000),
      CONSTRAINT techdeck_comment_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_techdeck_comments_ticket ON techdeck_ticket_comments(tenant_id, ticket_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS techdeck_migration_refs (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      source_type VARCHAR(80) NOT NULL, source_id VARCHAR(160) NOT NULL, target_type VARCHAR(80) NOT NULL,
      target_id VARCHAR(36) NOT NULL, source_hash VARCHAR(64) NOT NULL, imported_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT techdeck_migration_hash_check CHECK (source_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT uq_techdeck_migration_source UNIQUE (tenant_id, source_type, source_id)
    );
    CREATE INDEX IF NOT EXISTS idx_techdeck_migration_target ON techdeck_migration_refs(tenant_id, target_type, target_id);
  `);
}
