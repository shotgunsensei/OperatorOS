import { pgTable, varchar, integer, boolean, timestamp, real, unique, check, foreignKey, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants, users } from './schema.js';
import { techdeckResolutionSearchDocuments } from './techdeck-resolution-schema.js';

export const techdeckResolutionSemanticSettings = pgTable('techdeck_resolution_semantic_settings', {
  tenantId: varchar('tenant_id',{ length:36 }).primaryKey().references(()=>tenants.id,{ onDelete:'cascade' }),
  enabled: boolean('enabled').notNull().default(false),
  dailyRequestLimit: integer('daily_request_limit').notNull().default(100),
  version: integer('version').notNull().default(1),
  updatedByUserId: varchar('updated_by_user_id',{ length:36 }).references(()=>users.id,{ onDelete:'set null' }),
  updatedAt: timestamp('updated_at',{ withTimezone:true }).notNull().defaultNow(),
},t=>[
  check('techdeck_resolution_semantic_settings_daily_request_limit_check',sql`${t.dailyRequestLimit} BETWEEN 1 AND 1000`),
  check('techdeck_resolution_semantic_settings_version_check',sql`${t.version}>0`),
]);
export const techdeckResolutionEmbeddings = pgTable('techdeck_resolution_embeddings', {
  id: varchar('id',{ length:36 }).primaryKey().default(sql`gen_random_uuid()`),
  tenantId:varchar('tenant_id',{ length:36 }).notNull(), incidentId:varchar('incident_id',{ length:36 }).notNull(), revision:integer('revision').notNull(),
  sourceVersion:integer('source_version').notNull(),documentId:varchar('document_id',{ length:36 }).notNull(),chunkOffset:integer('chunk_offset').notNull(),
  sourceHash:varchar('source_hash',{ length:64 }).notNull(),inputHash:varchar('input_hash',{ length:64 }).notNull(),redactorVersion:varchar('redactor_version',{ length:80 }).notNull(),
  provider:varchar('provider',{ length:80 }).notNull(),model:varchar('model',{ length:100 }).notNull(),dimensions:integer('dimensions').notNull(),settingsVersion:integer('settings_version').notNull(),generation:varchar('generation',{ length:36 }).notNull(),
  requestedByUserId:varchar('requested_by_user_id',{ length:36 }).references(()=>users.id,{ onDelete:'set null' }),
  status:varchar('status',{ length:20 }).notNull().default('pending'),embedding:real('embedding').array(),lastErrorCode:varchar('last_error_code',{ length:100 }),
  createdAt:timestamp('created_at',{ withTimezone:true }).notNull().defaultNow(),updatedAt:timestamp('updated_at',{ withTimezone:true }).notNull().defaultNow(),
},t=>[
  foreignKey({ name:'tdri_embeddings_source_fk',columns:[t.tenantId,t.incidentId,t.revision,t.documentId],foreignColumns:[techdeckResolutionSearchDocuments.tenantId,techdeckResolutionSearchDocuments.incidentId,techdeckResolutionSearchDocuments.revision,techdeckResolutionSearchDocuments.id] }).onDelete('cascade'),
  unique('tdri_embeddings_chunk_uq').on(t.tenantId,t.documentId,t.chunkOffset,t.provider,t.model,t.dimensions,t.redactorVersion),
  index('tdri_embeddings_tenant_revision_idx').on(t.tenantId,t.incidentId,t.revision,t.sourceVersion),
  check('techdeck_resolution_embeddings_source_version_check',sql`${t.sourceVersion}>0`),
  check('techdeck_resolution_embeddings_chunk_offset_check',sql`${t.chunkOffset}>=0`),
  check('techdeck_resolution_embeddings_source_hash_check',sql`${t.sourceHash} ~ '^[a-f0-9]{64}$'`),
  check('techdeck_resolution_embeddings_input_hash_check',sql`${t.inputHash} ~ '^[a-f0-9]{64}$'`),
  check('techdeck_resolution_embeddings_dimensions_check',sql`${t.dimensions} BETWEEN 1 AND 3072`),
  check('techdeck_resolution_embeddings_settings_version_check',sql`${t.settingsVersion}>0`),
  check('techdeck_resolution_embeddings_status_check',sql`${t.status} IN ('pending','ready','failed','stale')`),
  check('tdri_embeddings_vector_ck',sql`(${t.status}='ready' AND ${t.embedding} IS NOT NULL AND cardinality(${t.embedding})=${t.dimensions} AND array_ndims(${t.embedding})=1 AND array_position(${t.embedding},NULL) IS NULL AND NOT ('NaN'::real=ANY(${t.embedding})) AND NOT ('Infinity'::real=ANY(${t.embedding})) AND NOT ('-Infinity'::real=ANY(${t.embedding}))) OR (${t.status}<>'ready' AND ${t.embedding} IS NULL)`),
]);
