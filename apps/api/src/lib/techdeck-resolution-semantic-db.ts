import { sql } from 'drizzle-orm';
import { db } from '../db.js';

export const resolutionSemanticDdl = `
CREATE TABLE IF NOT EXISTS techdeck_resolution_semantic_settings (
  tenant_id VARCHAR(36) PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  daily_request_limit INTEGER NOT NULL DEFAULT 100 CHECK (daily_request_limit BETWEEN 1 AND 1000),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS techdeck_resolution_embeddings (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(36) NOT NULL,
  incident_id VARCHAR(36) NOT NULL,
  revision INTEGER NOT NULL,
  source_version INTEGER NOT NULL CHECK (source_version > 0),
  document_id VARCHAR(36) NOT NULL,
  chunk_offset INTEGER NOT NULL CHECK (chunk_offset >= 0),
  source_hash VARCHAR(64) NOT NULL CHECK (source_hash ~ '^[a-f0-9]{64}$'),
  input_hash VARCHAR(64) NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  redactor_version VARCHAR(80) NOT NULL,
  provider VARCHAR(80) NOT NULL,
  model VARCHAR(100) NOT NULL,
  dimensions INTEGER NOT NULL CHECK (dimensions BETWEEN 1 AND 3072),
  settings_version INTEGER NOT NULL CHECK (settings_version > 0),
  generation VARCHAR(36) NOT NULL,
  requested_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready','failed','stale')),
  embedding REAL[],
  last_error_code VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tdri_embeddings_source_fk FOREIGN KEY (tenant_id,incident_id,revision,document_id)
    REFERENCES techdeck_resolution_search_documents(tenant_id,incident_id,revision,id) ON DELETE CASCADE,
  CONSTRAINT tdri_embeddings_chunk_uq UNIQUE (tenant_id,document_id,chunk_offset,provider,model,dimensions,redactor_version),
  CONSTRAINT tdri_embeddings_vector_ck CHECK (
    (status='ready' AND embedding IS NOT NULL AND cardinality(embedding)=dimensions AND array_ndims(embedding)=1 AND array_position(embedding,NULL) IS NULL
      AND NOT ('NaN'::real=ANY(embedding)) AND NOT ('Infinity'::real=ANY(embedding)) AND NOT ('-Infinity'::real=ANY(embedding)))
    OR (status<>'ready' AND embedding IS NULL))
);
CREATE INDEX IF NOT EXISTS tdri_embeddings_tenant_revision_idx ON techdeck_resolution_embeddings(tenant_id,incident_id,revision,source_version);
`;
/** Portable storage keeps v65 usable on plain PostgreSQL. pgvector is never installed by startup/apply. */
export async function ensureResolutionSemanticTables() {
  await db.transaction(async tx => { await tx.execute(sql.raw(resolutionSemanticDdl)); await verifyResolutionSemanticTables(tx); });
}
export async function verifyResolutionSemanticTables(executor: Pick<typeof db, 'execute'> = db) {
  const expected = {
    techdeck_resolution_semantic_settings: ['tenant_id','enabled','daily_request_limit','version','updated_by_user_id','updated_at'],
    techdeck_resolution_embeddings: ['id','tenant_id','incident_id','revision','source_version','document_id','chunk_offset','source_hash','input_hash','redactor_version','provider','model','dimensions','settings_version','generation','requested_by_user_id','status','embedding','last_error_code','created_at','updated_at'],
  };
  for (const [table, names] of Object.entries(expected)) {
    const rows = await executor.execute(sql`SELECT column_name,udt_name,is_nullable,character_maximum_length FROM information_schema.columns WHERE table_schema='public' AND table_name=${table}`);
    const integers=new Set(['revision','source_version','chunk_offset','dimensions','settings_version','daily_request_limit','version']);
    const nullable=new Set(['embedding','last_error_code','requested_by_user_id','updated_by_user_id']);
    const lengths:Record<string,number>={source_hash:64,input_hash:64,redactor_version:80,provider:80,model:100,status:20,last_error_code:100};
    if (names.some(name => {
      const row=rows.rows.find(r=>r.column_name===name);
      const type=name==='embedding'?'_float4':name==='enabled'?'bool':name.endsWith('_at')?'timestamptz':integers.has(name)?'int4':'varchar';
      return !row || row.udt_name!==type || row.is_nullable!==(nullable.has(name)?'YES':'NO') || type==='varchar' && row.character_maximum_length!==(lengths[name]??36);
    })) throw new Error('Resolution semantic storage verification failed');
  }
  const result = await executor.execute(sql`SELECT conname FROM pg_constraint WHERE conrelid=to_regclass('public.techdeck_resolution_embeddings') AND convalidated AND conname IN ('tdri_embeddings_source_fk','tdri_embeddings_chunk_uq','tdri_embeddings_vector_ck')`);
  const index = await executor.execute(sql`SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.tdri_embeddings_tenant_revision_idx') AND indisvalid AND indisready`);
  if (result.rows.length !== 3 || index.rows.length !== 1) throw new Error('Resolution semantic constraints verification failed');
}
/** Read-only capability probe. Restricted/missing/non-public extensions degrade safely. */
export async function resolutionVectorCapability() {
  const result = await db.execute(sql`SELECT current_setting('server_version_num') AS server_version,
    EXISTS(SELECT 1 FROM pg_available_extensions WHERE name='vector') AS available,
    EXISTS(SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='vector' AND n.nspname='public') AS installed,
    has_database_privilege(current_database(),'CREATE') AS can_create,
    (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS superuser`);
  return result.rows[0] as { server_version: string; available: boolean; installed: boolean; can_create: boolean; superuser: boolean };
}
