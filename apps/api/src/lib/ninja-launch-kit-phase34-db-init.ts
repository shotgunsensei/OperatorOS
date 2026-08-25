import { db } from '../db.js';

/**
 * Phase 34 additive Deploy Ops product persistence (stable database namespace retained).
 *
 * OperatorOS continues to own users, tenants, membership, roles, subscriptions,
 * entitlements, credits, billing, provider configuration, and audit activity.
 */
export async function ensureNinjaLaunchKitPhase34Tables(): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS launchkit_brand_profiles (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(160) NOT NULL,
      logo_text VARCHAR(160),
      primary_color VARCHAR(7) NOT NULL DEFAULT '#111827',
      accent_color VARCHAR(7) NOT NULL DEFAULT '#DC2626',
      voice TEXT,
      contact_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      version INTEGER NOT NULL DEFAULT 1,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_launchkit_brand_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT launchkit_brand_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
      CONSTRAINT launchkit_brand_colors_check CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$' AND accent_color ~ '^#[0-9A-Fa-f]{6}$'),
      CONSTRAINT launchkit_brand_contact_check CHECK (jsonb_typeof(contact_json)='object')
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_launchkit_brand_user_name
      ON launchkit_brand_profiles(tenant_id,user_id,lower(name)) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS launchkit_product_kits (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      brand_profile_id VARCHAR(36),
      source_kit_id VARCHAR(36),
      template_slug VARCHAR(120),
      title VARCHAR(200) NOT NULL,
      business_type VARCHAR(160) NOT NULL,
      input_json JSONB NOT NULL,
      content_json JSONB NOT NULL,
      visual_promo_json JSONB NOT NULL,
      generator_mode VARCHAR(20) NOT NULL DEFAULT 'deterministic',
      provider VARCHAR(80) NOT NULL DEFAULT 'deterministic',
      provider_model VARCHAR(160) NOT NULL DEFAULT 'ninja-launch-kit-v1',
      provenance_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      content_sha256 VARCHAR(64) NOT NULL,
      watermarked BOOLEAN NOT NULL DEFAULT TRUE,
      white_label BOOLEAN NOT NULL DEFAULT FALSE,
      idempotency_key VARCHAR(160) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      version INTEGER NOT NULL DEFAULT 1,
      archived_at TIMESTAMP,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_launchkit_product_tenant_id UNIQUE (tenant_id,id),
      CONSTRAINT uq_launchkit_product_key UNIQUE (tenant_id,user_id,idempotency_key),
      CONSTRAINT launchkit_product_brand_fk FOREIGN KEY (tenant_id,brand_profile_id) REFERENCES launchkit_brand_profiles(tenant_id,id),
      CONSTRAINT launchkit_product_source_fk FOREIGN KEY (tenant_id,source_kit_id) REFERENCES launchkit_product_kits(tenant_id,id),
      CONSTRAINT launchkit_product_title_check CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
      CONSTRAINT launchkit_product_status_check CHECK (status IN ('active','archived')),
      CONSTRAINT launchkit_product_mode_check CHECK (generator_mode IN ('deterministic','ai','fallback')),
      CONSTRAINT launchkit_product_json_check CHECK (jsonb_typeof(input_json)='object' AND jsonb_typeof(content_json)='object' AND jsonb_typeof(visual_promo_json)='array' AND jsonb_typeof(provenance_json)='object')
    );
    CREATE INDEX IF NOT EXISTS idx_launchkit_product_user_updated
      ON launchkit_product_kits(tenant_id,user_id,updated_at DESC) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_launchkit_product_template
      ON launchkit_product_kits(tenant_id,template_slug) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS launchkit_product_revisions (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      kit_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL,
      reason VARCHAR(40) NOT NULL,
      input_json JSONB NOT NULL,
      content_json JSONB NOT NULL,
      visual_promo_json JSONB NOT NULL,
      provenance_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      content_sha256 VARCHAR(64) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT launchkit_revision_kit_fk FOREIGN KEY (tenant_id,kit_id) REFERENCES launchkit_product_kits(tenant_id,id) ON DELETE CASCADE,
      CONSTRAINT uq_launchkit_revision UNIQUE (tenant_id,kit_id,revision),
      CONSTRAINT launchkit_revision_reason_check CHECK (reason IN ('created','edited','regenerated','duplicated','restored'))
    );

    CREATE TABLE IF NOT EXISTS launchkit_product_exports (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      kit_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      format VARCHAR(12) NOT NULL,
      file_name VARCHAR(240) NOT NULL,
      mime_type VARCHAR(120) NOT NULL,
      content_text TEXT NOT NULL,
      content_sha256 VARCHAR(64) NOT NULL,
      size_bytes INTEGER NOT NULL,
      watermarked BOOLEAN NOT NULL,
      white_label BOOLEAN NOT NULL,
      idempotency_key VARCHAR(160) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT launchkit_export_kit_fk FOREIGN KEY (tenant_id,kit_id) REFERENCES launchkit_product_kits(tenant_id,id) ON DELETE CASCADE,
      CONSTRAINT uq_launchkit_export_key UNIQUE (tenant_id,user_id,idempotency_key),
      CONSTRAINT launchkit_export_format_check CHECK (format IN ('txt','markdown','json')),
      CONSTRAINT launchkit_export_size_check CHECK (size_bytes > 0)
    );
    CREATE INDEX IF NOT EXISTS idx_launchkit_export_user_created
      ON launchkit_product_exports(tenant_id,user_id,created_at DESC);

    CREATE TABLE IF NOT EXISTS launchkit_usage_counters (
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
      user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      period_start DATE NOT NULL,
      generation_count INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id,user_id,period_start),
      CONSTRAINT launchkit_usage_nonnegative CHECK (generation_count >= 0)
    );
  `);
}
