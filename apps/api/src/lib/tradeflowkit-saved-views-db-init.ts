import { sql } from 'drizzle-orm';
import { db } from '../db.js';

/**
 * Release v30: additive, tenant-scoped TradeFlowKit saved views.
 *
 * Rollback remains the repository-wide restore-to-new-database procedure. The
 * table is retained on application rollback so personal view state is not lost.
 */
export async function ensureTradeFlowKitSavedViewTables(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS tradeflowkit_saved_views (
      id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      resource VARCHAR(80) NOT NULL,
      name VARCHAR(120) NOT NULL,
      normalized_name VARCHAR(120) NOT NULL,
      filters JSONB NOT NULL DEFAULT '{}'::jsonb,
      sort JSONB NOT NULL,
      is_shared BOOLEAN NOT NULL DEFAULT FALSE,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      archived_at TIMESTAMP,
      CONSTRAINT uq_tfk_saved_views_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT tfk_saved_views_resource_check CHECK (resource IN ('jobs','tasks','leads','customers','quotes','invoices')),
      CONSTRAINT tfk_saved_views_name_check CHECK (char_length(name) BETWEEN 1 AND 120),
      CONSTRAINT tfk_saved_views_normalized_name_check CHECK (char_length(normalized_name) BETWEEN 1 AND 120),
      CONSTRAINT tfk_saved_views_filters_check CHECK (jsonb_typeof(filters) = 'object' AND pg_column_size(filters) <= 4096),
      CONSTRAINT tfk_saved_views_sort_check CHECK (jsonb_typeof(sort) = 'object' AND pg_column_size(sort) <= 1024),
      CONSTRAINT tfk_saved_views_version_check CHECK (version >= 1)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tfk_saved_views_active_name
      ON tradeflowkit_saved_views(tenant_id, user_id, resource, normalized_name)
      WHERE archived_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_tfk_saved_views_visible
      ON tradeflowkit_saved_views(tenant_id, resource, is_shared, user_id, archived_at);
  `);
}
