import { db } from '../db.js';

/**
 * Additive Phase 31 BrandForgeOS product restoration.
 *
 * Identity, tenants, memberships, plans, billing, entitlements, provider
 * credentials, background execution, usage and audit remain shared OperatorOS
 * authorities. These tables hold only BrandForgeOS marketing work product and
 * durable projections needed to preserve source user outcomes.
 */
export async function ensureBrandForgeOsPhase31Tables(): Promise<void> {
  await db.execute(`
    ALTER TABLE brandforge_brands
      ADD COLUMN IF NOT EXISTS logo_attachment_id VARCHAR(36),
      ADD COLUMN IF NOT EXISTS asset_summary JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE brandforge_copy_assets
      ADD COLUMN IF NOT EXISTS favorite BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS scores JSONB NOT NULL DEFAULT '{}'::jsonb;

    CREATE TABLE IF NOT EXISTS brandforge_offers (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      brand_id VARCHAR(36),
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      name VARCHAR(160) NOT NULL,
      description TEXT,
      price_label VARCHAR(120),
      offer_type VARCHAR(60) NOT NULL DEFAULT 'service',
      target_audience TEXT,
      call_to_action VARCHAR(300),
      urgency TEXT,
      status VARCHAR(24) NOT NULL DEFAULT 'draft',
      version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_brandforge_offer_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT brandforge_offer_status_check CHECK (status IN ('draft','active','retired')),
      CONSTRAINT brandforge_offer_version_check CHECK (version >= 1),
      CONSTRAINT brandforge_offer_brand_fk FOREIGN KEY (tenant_id,brand_id)
        REFERENCES brandforge_brands(tenant_id,id)
    );
    CREATE INDEX IF NOT EXISTS idx_brandforge_offers_tenant_status
      ON brandforge_offers(tenant_id,status,updated_at DESC) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS brandforge_campaign_tasks (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      campaign_id VARCHAR(36) NOT NULL,
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      assignee_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      title VARCHAR(240) NOT NULL,
      description TEXT,
      status VARCHAR(24) NOT NULL DEFAULT 'todo',
      priority VARCHAR(16) NOT NULL DEFAULT 'medium',
      due_at TIMESTAMP,
      completed_at TIMESTAMP,
      sort_order INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_brandforge_campaign_task_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT brandforge_campaign_task_status_check CHECK (status IN ('todo','in_progress','blocked','done')),
      CONSTRAINT brandforge_campaign_task_priority_check CHECK (priority IN ('low','medium','high','urgent')),
      CONSTRAINT brandforge_campaign_task_campaign_fk FOREIGN KEY (tenant_id,campaign_id)
        REFERENCES brandforge_campaigns(tenant_id,id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_brandforge_campaign_tasks_campaign
      ON brandforge_campaign_tasks(tenant_id,campaign_id,sort_order,created_at);

    CREATE TABLE IF NOT EXISTS brandforge_campaign_comments (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      campaign_id VARCHAR(36) NOT NULL,
      author_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      parent_id VARCHAR(36),
      body TEXT NOT NULL,
      edited_at TIMESTAMP,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_brandforge_campaign_comment_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT brandforge_campaign_comment_campaign_fk FOREIGN KEY (tenant_id,campaign_id)
        REFERENCES brandforge_campaigns(tenant_id,id) ON DELETE CASCADE,
      CONSTRAINT brandforge_campaign_comment_parent_fk FOREIGN KEY (tenant_id,parent_id)
        REFERENCES brandforge_campaign_comments(tenant_id,id)
    );
    CREATE INDEX IF NOT EXISTS idx_brandforge_campaign_comments_campaign
      ON brandforge_campaign_comments(tenant_id,campaign_id,created_at);

    CREATE TABLE IF NOT EXISTS brandforge_landing_pages (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      campaign_id VARCHAR(36) NOT NULL,
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      title VARCHAR(200) NOT NULL,
      slug VARCHAR(160) NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'draft',
      content JSONB NOT NULL DEFAULT '{}'::jsonb,
      seo JSONB NOT NULL DEFAULT '{}'::jsonb,
      version INTEGER NOT NULL DEFAULT 1,
      published_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_brandforge_landing_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT uq_brandforge_landing_slug UNIQUE (tenant_id,slug),
      CONSTRAINT brandforge_landing_status_check CHECK (status IN ('draft','review','published','archived')),
      CONSTRAINT brandforge_landing_campaign_fk FOREIGN KEY (tenant_id,campaign_id)
        REFERENCES brandforge_campaigns(tenant_id,id) ON DELETE CASCADE,
      CONSTRAINT brandforge_landing_content_check CHECK (jsonb_typeof(content)='object')
    );

    CREATE TABLE IF NOT EXISTS brandforge_ai_workflows (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      brand_id VARCHAR(36),
      campaign_id VARCHAR(36),
      generation_id VARCHAR(36),
      workflow_type VARCHAR(60) NOT NULL,
      name VARCHAR(200) NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'draft',
      inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
      output JSONB NOT NULL DEFAULT '{}'::jsonb,
      step INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 1,
      completed_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_brandforge_workflow_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT brandforge_workflow_type_check CHECK (workflow_type IN ('product_launch','content_plan','ad_campaign','lead_gen','email_sequence','refresh_messaging')),
      CONSTRAINT brandforge_workflow_status_check CHECK (status IN ('draft','generating','completed','failed','archived')),
      CONSTRAINT brandforge_workflow_json_check CHECK (jsonb_typeof(inputs)='object' AND jsonb_typeof(output)='object'),
      CONSTRAINT brandforge_workflow_brand_fk FOREIGN KEY (tenant_id,brand_id)
        REFERENCES brandforge_brands(tenant_id,id),
      CONSTRAINT brandforge_workflow_campaign_fk FOREIGN KEY (tenant_id,campaign_id)
        REFERENCES brandforge_campaigns(tenant_id,id),
      CONSTRAINT brandforge_workflow_generation_fk FOREIGN KEY (tenant_id,generation_id)
        REFERENCES brandforge_generations(tenant_id,id)
    );
    CREATE INDEX IF NOT EXISTS idx_brandforge_workflows_tenant_created
      ON brandforge_ai_workflows(tenant_id,created_at DESC);

    CREATE TABLE IF NOT EXISTS brandforge_templates (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) REFERENCES tenants(id),
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      name VARCHAR(180) NOT NULL,
      description TEXT,
      category VARCHAR(80) NOT NULL DEFAULT 'general',
      template_type VARCHAR(80) NOT NULL DEFAULT 'campaign',
      content JSONB NOT NULL DEFAULT '{}'::jsonb,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      is_global BOOLEAN NOT NULL DEFAULT FALSE,
      is_featured BOOLEAN NOT NULL DEFAULT FALSE,
      is_premium BOOLEAN NOT NULL DEFAULT FALSE,
      required_entitlement VARCHAR(160),
      preview_attachment_id VARCHAR(36),
      usage_count INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT brandforge_template_scope_check CHECK ((is_global=TRUE AND tenant_id IS NULL) OR (is_global=FALSE AND tenant_id IS NOT NULL)),
      CONSTRAINT brandforge_template_json_check CHECK (jsonb_typeof(content)='object' AND jsonb_typeof(tags)='array'),
      CONSTRAINT brandforge_template_usage_check CHECK (usage_count >= 0)
    );
    CREATE INDEX IF NOT EXISTS idx_brandforge_templates_catalog
      ON brandforge_templates(is_global,category,template_type,created_at DESC) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_brandforge_templates_tenant
      ON brandforge_templates(tenant_id,updated_at DESC) WHERE deleted_at IS NULL;

    INSERT INTO brandforge_templates
      (name,description,category,template_type,content,tags,is_global,is_featured,is_premium,required_entitlement)
    SELECT seed.name,seed.description,seed.category,seed.template_type,seed.content,seed.tags,TRUE,seed.is_featured,seed.is_premium,seed.required_entitlement
    FROM (VALUES
      ('Product Launch Campaign','Plan positioning, channel execution, launch tasks, and measurement.','campaigns','campaign','{"objective":"Launch a product with a coordinated channel plan","sections":["positioning","channels","tasks","measurement"]}'::jsonb,'["launch","strategy"]'::jsonb,TRUE,FALSE,NULL),
      ('30-Day Content Plan','Build a balanced month of audience-aware content.','content','calendar','{"cadence":"30_days","sections":["themes","channels","callsToAction"]}'::jsonb,'["calendar","content"]'::jsonb,TRUE,FALSE,NULL),
      ('Lead Generation Funnel','Map offer, landing content, follow-up, and conversion measures.','lead-generation','workflow','{"sections":["offer","landing","followUp","conversion"]}'::jsonb,'["leads","funnel"]'::jsonb,FALSE,FALSE,NULL),
      ('Email Nurture Sequence','Create an audience-specific five-message nurture sequence.','email','copy','{"messageCount":5,"sections":["subject","body","cta"]}'::jsonb,'["email","nurture"]'::jsonb,FALSE,FALSE,NULL),
      ('Paid Campaign Control Room','Coordinate advanced cross-channel paid media and reporting.','advertising','campaign','{"sections":["audiences","creativeMatrix","budgetGuardrails","attribution"]}'::jsonb,'["paid","analytics"]'::jsonb,TRUE,TRUE,'brandforgeos.templates.premium'),
      ('White-Label Executive Review','Produce a client-ready strategy and performance review.','reports','report','{"sections":["executiveSummary","kpis","recommendations","nextSteps"]}'::jsonb,'["report","white-label"]'::jsonb,FALSE,TRUE,'brandforgeos.templates.premium')
    ) AS seed(name,description,category,template_type,content,tags,is_featured,is_premium,required_entitlement)
    WHERE NOT EXISTS (
      SELECT 1 FROM brandforge_templates existing
      WHERE existing.is_global=TRUE AND existing.name=seed.name AND existing.deleted_at IS NULL
    );

    CREATE TABLE IF NOT EXISTS brandforge_integrations (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      provider_key VARCHAR(80) NOT NULL,
      shared_provider_config_id VARCHAR(36),
      status VARCHAR(24) NOT NULL DEFAULT 'disconnected',
      account_label VARCHAR(200),
      health JSONB NOT NULL DEFAULT '{}'::jsonb,
      connected_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      connected_at TIMESTAMP,
      disconnected_at TIMESTAMP,
      last_sync_at TIMESTAMP,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_brandforge_integration_provider UNIQUE (tenant_id,provider_key),
      CONSTRAINT uq_brandforge_integration_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT brandforge_integration_status_check CHECK (status IN ('disconnected','configured','ready','degraded','error','revoked')),
      CONSTRAINT brandforge_integration_health_check CHECK (jsonb_typeof(health)='object')
    );

    CREATE TABLE IF NOT EXISTS brandforge_sync_runs (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      integration_id VARCHAR(36) NOT NULL,
      shared_job_id VARCHAR(36),
      requested_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'queued',
      direction VARCHAR(16) NOT NULL DEFAULT 'inbound',
      processed_items INTEGER NOT NULL DEFAULT 0,
      total_items INTEGER NOT NULL DEFAULT 0,
      error_code VARCHAR(120),
      result JSONB NOT NULL DEFAULT '{}'::jsonb,
      started_at TIMESTAMP,
      completed_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT brandforge_sync_status_check CHECK (status IN ('queued','processing','completed','retry','dead_letter','cancelled')),
      CONSTRAINT brandforge_sync_counts_check CHECK (processed_items >= 0 AND total_items >= processed_items),
      CONSTRAINT brandforge_sync_integration_fk FOREIGN KEY (tenant_id,integration_id)
        REFERENCES brandforge_integrations(tenant_id,id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_brandforge_sync_runs_integration
      ON brandforge_sync_runs(tenant_id,integration_id,created_at DESC);

    CREATE TABLE IF NOT EXISTS brandforge_recommendations (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      recommendation_type VARCHAR(80) NOT NULL,
      category VARCHAR(80),
      title VARCHAR(220) NOT NULL,
      description TEXT NOT NULL,
      action_label VARCHAR(120),
      action_url VARCHAR(500),
      priority VARCHAR(16) NOT NULL DEFAULT 'medium',
      evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
      dismissed_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      dismissed_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT brandforge_recommendation_priority_check CHECK (priority IN ('low','medium','high')),
      CONSTRAINT brandforge_recommendation_evidence_check CHECK (jsonb_typeof(evidence)='object')
    );
    CREATE INDEX IF NOT EXISTS idx_brandforge_recommendations_tenant
      ON brandforge_recommendations(tenant_id,dismissed_at,created_at DESC);

    CREATE TABLE IF NOT EXISTS brandforge_lead_submissions (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      campaign_id VARCHAR(36),
      landing_page_id VARCHAR(36),
      source VARCHAR(120),
      contact JSONB NOT NULL DEFAULT '{}'::jsonb,
      consent JSONB NOT NULL DEFAULT '{}'::jsonb,
      status VARCHAR(24) NOT NULL DEFAULT 'new',
      duplicate_key VARCHAR(128),
      received_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_brandforge_lead_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT uq_brandforge_lead_duplicate UNIQUE (tenant_id,duplicate_key),
      CONSTRAINT brandforge_lead_status_check CHECK (status IN ('new','qualified','contacted','converted','archived')),
      CONSTRAINT brandforge_lead_json_check CHECK (jsonb_typeof(contact)='object' AND jsonb_typeof(consent)='object'),
      CONSTRAINT brandforge_lead_campaign_fk FOREIGN KEY (tenant_id,campaign_id)
        REFERENCES brandforge_campaigns(tenant_id,id),
      CONSTRAINT brandforge_lead_landing_fk FOREIGN KEY (tenant_id,landing_page_id)
        REFERENCES brandforge_landing_pages(tenant_id,id)
    );
    CREATE INDEX IF NOT EXISTS idx_brandforge_leads_tenant_status
      ON brandforge_lead_submissions(tenant_id,status,received_at DESC);

    CREATE TABLE IF NOT EXISTS brandforge_reports (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      brand_id VARCHAR(36),
      campaign_id VARCHAR(36),
      name VARCHAR(200) NOT NULL,
      report_type VARCHAR(60) NOT NULL DEFAULT 'campaign_summary',
      date_from DATE,
      date_to DATE,
      sections JSONB NOT NULL DEFAULT '[]'::jsonb,
      branding JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_white_label BOOLEAN NOT NULL DEFAULT FALSE,
      status VARCHAR(24) NOT NULL DEFAULT 'draft',
      snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      snapshot_sha256 VARCHAR(64),
      generated_at TIMESTAMP,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_brandforge_report_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT brandforge_report_type_check CHECK (report_type IN ('campaign_summary','content_performance','channel_breakdown','executive_summary','team_activity','brand_health')),
      CONSTRAINT brandforge_report_status_check CHECK (status IN ('draft','queued','generated','failed','archived')),
      CONSTRAINT brandforge_report_json_check CHECK (jsonb_typeof(sections)='array' AND jsonb_typeof(branding)='object' AND jsonb_typeof(snapshot)='object'),
      CONSTRAINT brandforge_report_brand_fk FOREIGN KEY (tenant_id,brand_id)
        REFERENCES brandforge_brands(tenant_id,id),
      CONSTRAINT brandforge_report_campaign_fk FOREIGN KEY (tenant_id,campaign_id)
        REFERENCES brandforge_campaigns(tenant_id,id)
    );
    CREATE INDEX IF NOT EXISTS idx_brandforge_reports_tenant_created
      ON brandforge_reports(tenant_id,created_at DESC);

    CREATE TABLE IF NOT EXISTS brandforge_export_jobs (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      requested_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      report_id VARCHAR(36),
      shared_job_id VARCHAR(36),
      idempotency_key VARCHAR(160),
      export_type VARCHAR(60) NOT NULL,
      format VARCHAR(16) NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'queued',
      output JSONB NOT NULL DEFAULT '{}'::jsonb,
      content_sha256 VARCHAR(64),
      error_code VARCHAR(120),
      completed_at TIMESTAMP,
      expires_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT brandforge_export_format_check CHECK (format IN ('json','csv','html')),
      CONSTRAINT brandforge_export_status_check CHECK (status IN ('queued','processing','completed','retry','dead_letter','expired')),
      CONSTRAINT brandforge_export_report_fk FOREIGN KEY (tenant_id,report_id)
        REFERENCES brandforge_reports(tenant_id,id)
    );
    CREATE INDEX IF NOT EXISTS idx_brandforge_exports_tenant_created
      ON brandforge_export_jobs(tenant_id,created_at DESC);
    ALTER TABLE brandforge_export_jobs
      ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(160);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_brandforge_exports_tenant_idempotency
      ON brandforge_export_jobs(tenant_id,idempotency_key)
      WHERE idempotency_key IS NOT NULL;

    CREATE TABLE IF NOT EXISTS brandforge_credit_counters (
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      period_start DATE NOT NULL,
      limit_snapshot INTEGER,
      used_credits INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id,period_start),
      CONSTRAINT brandforge_credit_counter_check CHECK (
        used_credits >= 0 AND (limit_snapshot IS NULL OR limit_snapshot >= used_credits)
      )
    );
  `);
}
