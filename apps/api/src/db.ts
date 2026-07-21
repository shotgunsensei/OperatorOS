import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';

export const db: NodePgDatabase<typeof schema> = drizzle({
  // node-postgres otherwise keeps an idle pool handle alive after a test or
  // one-shot maintenance command completes. Fastify's listener keeps the
  // production service alive; allowing the pool itself to exit when idle
  // makes clean test/CLI shutdown deterministic without closing active work.
  connection: { connectionString: process.env.DATABASE_URL, allowExitOnIdle: true },
  schema,
});
