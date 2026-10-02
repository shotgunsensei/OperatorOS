import { sql } from 'drizzle-orm';
import { db } from '../db.js';

export const resolutionResearchDdl = `CREATE TABLE IF NOT EXISTS techdeck_resolution_research_settings (
  tenant_id VARCHAR(36) PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  daily_request_limit INTEGER NOT NULL DEFAULT 20,
  version INTEGER NOT NULL DEFAULT 1,
  updated_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tdri_research_limit_ck CHECK (daily_request_limit BETWEEN 1 AND 100),
  CONSTRAINT tdri_research_version_ck CHECK (version > 0)
);`;
export async function ensureResolutionResearchTables() {
  await db.transaction(async tx => { await tx.execute(sql.raw(resolutionResearchDdl)); await verifyResolutionResearchTables(tx); });
}
export async function verifyResolutionResearchTables(executor: Pick<typeof db, 'execute'> = db) {
  const columns = await executor.execute(sql`SELECT column_name,udt_name,is_nullable,character_maximum_length FROM information_schema.columns WHERE table_schema='public' AND table_name='techdeck_resolution_research_settings'`);
  const expected = [['tenant_id','varchar','NO',36],['enabled','bool','NO',null],['daily_request_limit','int4','NO',null],['version','int4','NO',null],['updated_by_user_id','varchar','YES',36],['updated_at','timestamptz','NO',null]];
  const constraints = await executor.execute(sql`SELECT conname FROM pg_constraint WHERE conrelid=to_regclass('public.techdeck_resolution_research_settings') AND convalidated AND conname IN ('techdeck_resolution_research_settings_pkey','techdeck_resolution_research_settings_tenant_id_fkey','techdeck_resolution_research_settings_updated_by_user_id_fkey','tdri_research_limit_ck','tdri_research_version_ck')`);
  if (expected.some(([name,type,nullable,length]) => !columns.rows.some(row => row.column_name===name && row.udt_name===type && row.is_nullable===nullable && row.character_maximum_length===length)) || constraints.rows.length!==5) throw new Error('Resolution research storage verification failed');
}
