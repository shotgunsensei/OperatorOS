import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  resolutionStorageDdl,
  resolutionStorageTables,
  resolutionStorageConstraints,
  resolutionStorageIndexes,
} from '../generated/techdeck-resolution-storage.js';

type Executor = Pick<typeof db, 'execute'>;

/** Additive v64 storage only. No fixture seed, provider call or raw import occurs. */
export async function ensureTechDeckResolutionTables(): Promise<void> {
  await db.transaction(async tx => {
    await tx.execute(sql.raw(resolutionStorageDdl));
    await verifyTechDeckResolutionTables(tx);
  });
}

/** Read-only catalog verification also runs on normal production startup. */
export async function verifyTechDeckResolutionTables(executor: Executor = db): Promise<void> {
  const names = resolutionStorageTables.map(table => table.name);
  const tableNames = sql.join(names.map(name => sql`${name}`), sql`, `);
  const columns = await executor.execute(sql`
    SELECT table_name,column_name,udt_name,is_nullable,character_maximum_length,is_generated
    FROM information_schema.columns WHERE table_schema='public'
    AND table_name IN (${tableNames})
  `);
  const actualColumns = new Map(columns.rows.map(row => [`${row.table_name}.${row.column_name}`, row]));
  const types: Record<string, string> = {
    VARCHAR: 'varchar', TEXT: 'text', TIMESTAMPTZ: 'timestamptz', INTEGER: 'int4',
    BIGINT: 'int8', NUMERIC: 'numeric', BOOLEAN: 'bool', JSONB: 'jsonb', TSVECTOR: 'tsvector',
  };
  const missing: string[] = [];
  for (const table of resolutionStorageTables) {
    for (const [column, definition] of Object.entries(table.columns)) {
      const actual = actualColumns.get(`${table.name}.${column}`);
      const sqlType = definition.match(/^[A-Z]+/)?.[0] ?? '';
      const length = definition.match(/^VARCHAR\((\d+)\)/)?.[1];
      const nullable = definition.includes('NOT NULL') || definition.includes('PRIMARY KEY') ? 'NO' : 'YES';
      if (!actual || actual.udt_name !== types[sqlType] || actual.is_nullable !== nullable
        || (length && Number(actual.character_maximum_length) !== Number(length))
        || (sqlType === 'TSVECTOR' && actual.is_generated !== 'ALWAYS')) missing.push(`${table.name}.${column}`);
    }
  }
  const constraints = await executor.execute(sql`
    SELECT c.conname,c.contype,c.convalidated,t.relname AS table_name
    FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='public' AND t.relname IN (${tableNames})
  `);
  for (const required of resolutionStorageConstraints) {
    if (!constraints.rows.some(row => row.conname === required.name && row.table_name === required.table
      && row.contype === required.kind && row.convalidated === true)) missing.push(required.name);
  }
  const indexes = await executor.execute(sql`
    SELECT index_class.relname AS name,table_class.relname AS table_name,i.indisvalid,i.indisready
    FROM pg_index i JOIN pg_class index_class ON index_class.oid=i.indexrelid
    JOIN pg_class table_class ON table_class.oid=i.indrelid
    JOIN pg_namespace n ON n.oid=table_class.relnamespace
    WHERE n.nspname='public' AND table_class.relname IN (${tableNames})
  `);
  for (const required of resolutionStorageIndexes) {
    if (!indexes.rows.some(row => row.name === required.name && row.table_name === required.table
      && row.indisvalid === true && row.indisready === true)) missing.push(required.name);
  }
  const trigger = await executor.execute(sql`
    SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.techdeck_resolution_raw_exports')
      AND tgname='tdri_raw_export_immutable' AND tgenabled='O' AND NOT tgisinternal
  `);
  if (trigger.rows.length !== 1) missing.push('tdri_raw_export_immutable');
  if (missing.length) throw new Error(`Resolution storage verification failed: ${missing.join(', ')}`);
}
