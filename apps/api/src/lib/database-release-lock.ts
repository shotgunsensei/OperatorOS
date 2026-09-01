import { Client } from 'pg';

const RELEASE_LOCK_KEY = 'operatoros:database-release:v1';

function connectionTimeoutMillis(env: NodeJS.ProcessEnv): number {
  const configured = Number(env.DATABASE_POOL_CONNECTION_TIMEOUT_MS ?? 10_000);
  if (!Number.isFinite(configured)) return 10_000;
  return Math.max(1_000, Math.min(60_000, Math.trunc(configured)));
}
/**
 * Hold one dedicated PostgreSQL session for the complete release. The release
 * operations use the shared pool, so a separate Client avoids deadlocking a
 * deployment configured with DATABASE_POOL_MAX=1. PostgreSQL releases the
 * advisory lock automatically if the process or connection terminates.
 */
export async function withDatabaseReleaseLock<T>(
  operation: () => Promise<T>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<T> {
  const connectionString = env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error('DATABASE_URL is required for the database release lock');

  const client = new Client({
    connectionString,
    connectionTimeoutMillis: connectionTimeoutMillis(env),
    application_name: 'operatoros-database-release-lock',
  });
  let locked = false;
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [RELEASE_LOCK_KEY]);
    locked = true;
    return await operation();
  } finally {
    if (locked) {
      await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [RELEASE_LOCK_KEY])
        .catch(() => undefined);
    }
    await client.end().catch(() => undefined);
  }
}
