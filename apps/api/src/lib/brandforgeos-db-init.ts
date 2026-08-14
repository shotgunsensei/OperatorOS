import { db } from '../db.js';

/** Additive, idempotent Phase 11A BrandForgeOS release. */
export async function ensureBrandForgeOsTables(): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS brandforge_workspace_settings (
      tenant_id VARCHAR(36) PRIMARY KEY REFERENCES tenants(id),
      updated_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      profile JSONB NOT NULL DEFAULT '{"goals":[],"channels":[]}'::jsonb,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT brandforge_settings_profile_check CHECK (jsonb_typeof(profile)='object'),
      CONSTRAINT brandforge_settings_version_check CHECK (version >= 1)
    );

    CREATE TABLE IF NOT EXISTS brandforge_brands (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      name VARCHAR(120) NOT NULL,
      description TEXT,
      primary_color VARCHAR(7),
      secondary_color VARCHAR(7),
      accent_color VARCHAR(7),
      heading_font VARCHAR(80),
      body_font VARCHAR(80),
      voice_tone TEXT,
      guidelines TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_brandforge_brand_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT brandforge_brand_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
      CONSTRAINT brandforge_brand_color_check CHECK (
        (primary_color IS NULL OR primary_color ~ '^#[0-9A-Fa-f]{6}$') AND
        (secondary_color IS NULL OR secondary_color ~ '^#[0-9A-Fa-f]{6}$') AND
        (accent_color IS NULL OR accent_color ~ '^#[0-9A-Fa-f]{6}$')
      ),
      CONSTRAINT brandforge_brand_version_check CHECK (version >= 1)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_brandforge_brand_name_active
      ON brandforge_brands(tenant_id,lower(name)) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_brandforge_brands_tenant_updated
      ON brandforge_brands(tenant_id,updated_at DESC) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS brandforge_personas (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      name VARCHAR(120) NOT NULL,
      age_range VARCHAR(80),
      location VARCHAR(160),
      interests TEXT,
      pain_points TEXT,
      goals TEXT,
      channels JSONB NOT NULL DEFAULT '[]'::jsonb,
      description TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_brandforge_persona_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT brandforge_persona_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
      CONSTRAINT brandforge_persona_channels_check CHECK (jsonb_typeof(channels)='array'),
      CONSTRAINT brandforge_persona_version_check CHECK (version >= 1)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_brandforge_persona_name_active
      ON brandforge_personas(tenant_id,lower(name)) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_brandforge_personas_tenant_updated
      ON brandforge_personas(tenant_id,updated_at DESC) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS brandforge_campaigns (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      brand_id VARCHAR(36),
      persona_id VARCHAR(36),
      name VARCHAR(160) NOT NULL,
      objective TEXT,
      target_audience TEXT,
      core_message TEXT,
      offer TEXT,
      status VARCHAR(24) NOT NULL DEFAULT 'draft',
      channels JSONB NOT NULL DEFAULT '[]'::jsonb,
      start_at TIMESTAMP,
      end_at TIMESTAMP,
      budget_cents INTEGER,
      notes TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_brandforge_campaign_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT brandforge_campaign_brand_fk FOREIGN KEY (tenant_id,brand_id)
        REFERENCES brandforge_brands(tenant_id,id),
      CONSTRAINT brandforge_campaign_persona_fk FOREIGN KEY (tenant_id,persona_id)
        REFERENCES brandforge_personas(tenant_id,id),
      CONSTRAINT brandforge_campaign_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
      CONSTRAINT brandforge_campaign_status_check CHECK (status IN ('draft','planning','producing','review','scheduled','active','completed','archived')),
      CONSTRAINT brandforge_campaign_channels_check CHECK (jsonb_typeof(channels)='array'),
      CONSTRAINT brandforge_campaign_dates_check CHECK (start_at IS NULL OR end_at IS NULL OR end_at >= start_at),
      CONSTRAINT brandforge_campaign_budget_check CHECK (budget_cents IS NULL OR budget_cents BETWEEN 0 AND 2147483647),
      CONSTRAINT brandforge_campaign_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_brandforge_campaigns_tenant_status
      ON brandforge_campaigns(tenant_id,status,updated_at DESC) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_brandforge_campaigns_tenant_brand
      ON brandforge_campaigns(tenant_id,brand_id) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_brandforge_campaigns_tenant_persona
      ON brandforge_campaigns(tenant_id,persona_id) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS brandforge_generations (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      brand_id VARCHAR(36),
      campaign_id VARCHAR(36),
      generation_type VARCHAR(24) NOT NULL,
      idempotency_key VARCHAR(160) NOT NULL,
      input_hash VARCHAR(64) NOT NULL,
      input_summary JSONB NOT NULL,
      output JSONB NOT NULL,
      provider VARCHAR(40) NOT NULL,
      model VARCHAR(120) NOT NULL,
      provider_version VARCHAR(80) NOT NULL,
      token_count INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_brandforge_generation_idempotency UNIQUE (tenant_id,user_id,idempotency_key),
      CONSTRAINT uq_brandforge_generation_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT brandforge_generation_brand_fk FOREIGN KEY (tenant_id,brand_id)
        REFERENCES brandforge_brands(tenant_id,id),
      CONSTRAINT brandforge_generation_campaign_fk FOREIGN KEY (tenant_id,campaign_id)
        REFERENCES brandforge_campaigns(tenant_id,id),
      CONSTRAINT brandforge_generation_type_check CHECK (generation_type IN ('copy','strategy','campaign_ideas')),
      CONSTRAINT brandforge_generation_hash_check CHECK (input_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT brandforge_generation_json_check CHECK (jsonb_typeof(input_summary)='object' AND jsonb_typeof(output)='object'),
      CONSTRAINT brandforge_generation_usage_check CHECK (token_count >= 0 AND duration_ms >= 0)
    );
    CREATE INDEX IF NOT EXISTS idx_brandforge_generation_tenant_created
      ON brandforge_generations(tenant_id,created_at DESC);

    CREATE TABLE IF NOT EXISTS brandforge_copy_assets (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      brand_id VARCHAR(36),
      campaign_id VARCHAR(36),
      title VARCHAR(200) NOT NULL,
      content TEXT NOT NULL,
      copy_type VARCHAR(60) NOT NULL,
      channel VARCHAR(60),
      tone VARCHAR(120),
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      generation_id VARCHAR(36),
      version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_brandforge_copy_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT brandforge_copy_brand_fk FOREIGN KEY (tenant_id,brand_id)
        REFERENCES brandforge_brands(tenant_id,id),
      CONSTRAINT brandforge_copy_campaign_fk FOREIGN KEY (tenant_id,campaign_id)
        REFERENCES brandforge_campaigns(tenant_id,id),
      CONSTRAINT brandforge_copy_generation_fk FOREIGN KEY (tenant_id,generation_id)
        REFERENCES brandforge_generations(tenant_id,id),
      CONSTRAINT brandforge_copy_title_check CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
      CONSTRAINT brandforge_copy_content_check CHECK (char_length(btrim(content)) BETWEEN 1 AND 20000),
      CONSTRAINT brandforge_copy_status_check CHECK (status IN ('draft','review','approved','published','archived')),
      CONSTRAINT brandforge_copy_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_brandforge_copy_tenant_status
      ON brandforge_copy_assets(tenant_id,status,updated_at DESC) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_brandforge_copy_tenant_campaign
      ON brandforge_copy_assets(tenant_id,campaign_id) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS brandforge_calendar_items (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      brand_id VARCHAR(36),
      campaign_id VARCHAR(36),
      copy_asset_id VARCHAR(36),
      title VARCHAR(200) NOT NULL,
      description TEXT,
      item_type VARCHAR(60) NOT NULL,
      channel VARCHAR(60),
      scheduled_at TIMESTAMP NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'idea',
      version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_brandforge_calendar_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT brandforge_calendar_brand_fk FOREIGN KEY (tenant_id,brand_id)
        REFERENCES brandforge_brands(tenant_id,id),
      CONSTRAINT brandforge_calendar_campaign_fk FOREIGN KEY (tenant_id,campaign_id)
        REFERENCES brandforge_campaigns(tenant_id,id),
      CONSTRAINT brandforge_calendar_copy_fk FOREIGN KEY (tenant_id,copy_asset_id)
        REFERENCES brandforge_copy_assets(tenant_id,id),
      CONSTRAINT brandforge_calendar_title_check CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
      CONSTRAINT brandforge_calendar_status_check CHECK (status IN ('idea','draft','review','scheduled','published','cancelled')),
      CONSTRAINT brandforge_calendar_version_check CHECK (version >= 1)
    );
    CREATE INDEX IF NOT EXISTS idx_brandforge_calendar_tenant_date
      ON brandforge_calendar_items(tenant_id,scheduled_at) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_brandforge_calendar_tenant_status
      ON brandforge_calendar_items(tenant_id,status) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS brandforge_campaign_metrics (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      campaign_id VARCHAR(36) NOT NULL,
      recorded_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      metric_date TIMESTAMP NOT NULL,
      channel VARCHAR(60),
      impressions INTEGER NOT NULL DEFAULT 0,
      clicks INTEGER NOT NULL DEFAULT 0,
      conversions INTEGER NOT NULL DEFAULT 0,
      spend_cents INTEGER NOT NULL DEFAULT 0,
      revenue_cents INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT brandforge_metric_campaign_fk FOREIGN KEY (tenant_id,campaign_id)
        REFERENCES brandforge_campaigns(tenant_id,id),
      CONSTRAINT brandforge_metric_counts_check CHECK (
        impressions >= 0 AND clicks >= 0 AND conversions >= 0 AND
        clicks <= impressions AND conversions <= clicks AND
        spend_cents BETWEEN 0 AND 2147483647 AND revenue_cents BETWEEN 0 AND 2147483647
      )
    );
    CREATE INDEX IF NOT EXISTS idx_brandforge_metrics_tenant_campaign_date
      ON brandforge_campaign_metrics(tenant_id,campaign_id,metric_date DESC);
    CREATE INDEX IF NOT EXISTS idx_brandforge_metrics_tenant_date
      ON brandforge_campaign_metrics(tenant_id,metric_date DESC);
  `);
}
