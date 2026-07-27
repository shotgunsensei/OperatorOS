import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';
import * as schema from './schema.js';

function boundedInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

export function resolveDatabasePoolConfig(env: NodeJS.ProcessEnv = process.env): PoolConfig {
  return {
    connectionString: env.DATABASE_URL,
    max: boundedInteger(env, 'DATABASE_POOL_MAX', 10, 1, 50),
    idleTimeoutMillis: boundedInteger(env, 'DATABASE_POOL_IDLE_TIMEOUT_MS', 30_000, 1_000, 300_000),
    connectionTimeoutMillis: boundedInteger(
      env,
      'DATABASE_POOL_CONNECTION_TIMEOUT_MS',
      10_000,
      1_000,
      60_000,
    ),
    allowExitOnIdle: true,
    application_name: 'operatoros-api',
  };
}

export const databasePool = new Pool(resolveDatabasePoolConfig());

export const db: NodePgDatabase<typeof schema> = drizzle(databasePool, {
  schema,
});

let databasePoolClosed = false;

export async function closeDatabasePool(): Promise<void> {
  if (databasePoolClosed) return;
  databasePoolClosed = true;
  await databasePool.end();
}
