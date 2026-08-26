const DISPOSABLE_NAME = /(?:test|phase21|ci|disposable)/iu;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

export function assertDisposableDatabaseEnvironment(environment = process.env) {
  if (environment.PARITY_DATABASE_IS_DISPOSABLE !== '1') {
    throw new Error('PARITY_DATABASE_IS_DISPOSABLE=1 is required');
  }
  if (!environment.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const parsed = new URL(environment.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('Disposable database URL must use PostgreSQL');
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(`Refusing non-loopback disposable database host: ${parsed.hostname}`);
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//u, ''));
  if (!database || !DISPOSABLE_NAME.test(database)) {
    throw new Error('Disposable database name must contain test, phase21, ci, or disposable');
  }
  return { url: parsed.toString(), host: parsed.hostname, database };
}

function quotePostgresIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

/**
 * Reset a disposable public schema without asking PostgreSQL to lock the whole
 * release graph in one transaction. The release currently owns hundreds of
 * related objects, which can exceed a stock server's
 * max_locks_per_transaction during one DROP SCHEMA ... CASCADE statement.
 */
export async function resetDisposablePublicSchema(client) {
  const dropped = { foreignKeys: 0, views: 0, tables: 0, sequences: 0, foreignTables: 0 };
  const qualified = (row) => `${quotePostgresIdentifier(row.schema_name)}.${quotePostgresIdentifier(row.object_name)}`;

  const foreignKeys = await client.query(`
    SELECT namespace.nspname AS schema_name,
           relation.relname AS object_name,
           constraint_record.conname AS constraint_name
      FROM pg_constraint constraint_record
      JOIN pg_class relation ON relation.oid = constraint_record.conrelid
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = 'public'
       AND constraint_record.contype = 'f'
     ORDER BY relation.relname, constraint_record.conname
  `);
  for (const row of foreignKeys.rows) {
    await client.query(`ALTER TABLE IF EXISTS ${qualified(row)} DROP CONSTRAINT IF EXISTS ${quotePostgresIdentifier(row.constraint_name)}`);
    dropped.foreignKeys += 1;
  }

  const relations = await client.query(`
    SELECT namespace.nspname AS schema_name,
           relation.relname AS object_name,
           relation.relkind AS object_kind
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = 'public'
       AND relation.relkind IN ('m', 'v', 'p', 'r', 'S', 'f')
     ORDER BY CASE relation.relkind
       WHEN 'm' THEN 1 WHEN 'v' THEN 2 WHEN 'p' THEN 3
       WHEN 'r' THEN 4 WHEN 'S' THEN 5 ELSE 6 END,
       relation.relname
  `);
  for (const row of relations.rows) {
    const statement = row.object_kind === 'm'
      ? 'DROP MATERIALIZED VIEW IF EXISTS'
      : row.object_kind === 'v'
        ? 'DROP VIEW IF EXISTS'
        : row.object_kind === 'S'
          ? 'DROP SEQUENCE IF EXISTS'
          : row.object_kind === 'f'
            ? 'DROP FOREIGN TABLE IF EXISTS'
            : 'DROP TABLE IF EXISTS';
    await client.query(`${statement} ${qualified(row)} CASCADE`);
    if (row.object_kind === 'm' || row.object_kind === 'v') dropped.views += 1;
    else if (row.object_kind === 'S') dropped.sequences += 1;
    else if (row.object_kind === 'f') dropped.foreignTables += 1;
    else dropped.tables += 1;
  }

  // Table and view dependency locks have already been released by the bounded
  // autocommit statements above. This final step removes only residual public
  // schema objects (for example enum types or routines) and restores the schema.
  await client.query('DROP SCHEMA IF EXISTS public CASCADE');
  await client.query('CREATE SCHEMA public');
  return dropped;
}
