/**
 * Task #50 — Platform stats: silent-zero billing-event warning.
 *
 * Guards the runtime alert that fires when /v1/platform/stats sees a
 * non-empty billing_events table but reports processed=0 AND failed=0.
 * The endpoint must:
 *   - emit a `warnings` entry with code BILLING_EVENTS_SILENT_ZERO
 *   - log a warning via request.log.warn
 * The threshold is tunable via PLATFORM_STATS_SILENT_ZERO_THRESHOLD; we
 * lower it for the test so we don't need to seed 50+ rows.
 */

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { eq, isNotNull, or } from 'drizzle-orm';
import { db } from '../src/db.js';
import { users, billingEvents } from '../src/schema.js';
import { signToken } from '../src/lib/auth.js';
import { ensureSchemaReady, createTestUser, cleanupUser, uniqueId } from './_setup.js';

let app: any;
let superAdmin: any;
let owner: any;
const seededEventIds: string[] = [];
const ORIGINAL_THRESHOLD = process.env.PLATFORM_STATS_SILENT_ZERO_THRESHOLD;
const warnLogs: { obj: any; msg: string }[] = [];
// Snapshot of any pre-existing rows that have processedAt or errorMessage
// set. We temporarily NULL those columns so the silent-zero condition is
// fully under the test's control, then restore them in `after`. Restoring
// is wrapped in a try/finally pattern across the lifecycle hooks.
type Snapshot = { id: string; processedAt: Date | null; errorMessage: string | null };
const snapshot: Snapshot[] = [];

before(async () => {
  await ensureSchemaReady();
  // Lower the threshold so a handful of seeded rows trips the guard
  // without depending on whatever already lives in billing_events.
  process.env.PLATFORM_STATS_SILENT_ZERO_THRESHOLD = '2';

  // Snapshot every existing billing_events row that has a non-null
  // processedAt or errorMessage, then NULL those two columns. This gives
  // the test full control over the silent-zero condition regardless of
  // what other test data is already in the shared DB. We restore the
  // values in the `after` hook.
  const dirty = await db.select({
    id: billingEvents.id,
    processedAt: billingEvents.processedAt,
    errorMessage: billingEvents.errorMessage,
  }).from(billingEvents).where(or(isNotNull(billingEvents.processedAt), isNotNull(billingEvents.errorMessage)));
  for (const row of dirty) snapshot.push(row as Snapshot);
  if (snapshot.length > 0) {
    await db.update(billingEvents)
      .set({ processedAt: null, errorMessage: null })
      .where(or(isNotNull(billingEvents.processedAt), isNotNull(billingEvents.errorMessage)));
  }

  superAdmin = await createTestUser();
  owner = await createTestUser();
  await db.update(users).set({ platformRole: 'super_admin' }).where(eq(users.id, superAdmin.id));

  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerPlatformRoutes } = await import('../src/routes/platform-routes.js');
  // Inject a tiny in-memory logger so we can assert request.log.warn was
  // actually called when the silent-zero condition fires. Pino accepts a
  // custom stream; we intercept warn-level entries by logger method too
  // via a simple proxy on the bindings.
  const captureLogger: any = {
    level: 'warn',
    fatal: () => {}, error: () => {}, info: () => {}, debug: () => {}, trace: () => {},
    warn: (obj: any, msg?: string) => {
      if (typeof obj === 'string') warnLogs.push({ obj: {}, msg: obj });
      else warnLogs.push({ obj, msg: msg ?? '' });
    },
    child() { return captureLogger; },
  };
  app = Fastify({ loggerInstance: captureLogger });
  await app.register(cookie, { secret: 'test-secret' });
  await registerPlatformRoutes(app);
  await app.ready();
});

after(async () => {
  for (const id of seededEventIds) {
    try { await db.delete(billingEvents).where(eq(billingEvents.id, id)); } catch {}
  }
  // Restore the rows we NULLed out in `before` so we don't pollute other
  // tests that read from billing_events.
  for (const row of snapshot) {
    try {
      await db.update(billingEvents)
        .set({ processedAt: row.processedAt, errorMessage: row.errorMessage })
        .where(eq(billingEvents.id, row.id));
    } catch {}
  }
  if (app) await app.close();
  for (const u of [owner, superAdmin]) if (u) await cleanupUser(u.id);
  if (ORIGINAL_THRESHOLD === undefined) delete process.env.PLATFORM_STATS_SILENT_ZERO_THRESHOLD;
  else process.env.PLATFORM_STATS_SILENT_ZERO_THRESHOLD = ORIGINAL_THRESHOLD;
});

beforeEach(() => { warnLogs.length = 0; });

const bearer = (u: any) => ({ authorization: `Bearer ${signToken({ userId: u.id, email: u.email, role: u.role })}` });

async function fetchStats() {
  const res = await app.inject({ method: 'GET', url: '/v1/platform/stats', headers: bearer(superAdmin) });
  assert.equal(res.statusCode, 200);
  return res.json();
}

async function seedEvent(opts: { processed?: boolean; failed?: boolean }) {
  const [row] = await db.insert(billingEvents).values({
    userId: owner.id,
    eventType: 'test.silent-zero',
    stripeEventId: uniqueId('evt'),
    processedAt: opts.processed ? new Date() : null,
    errorMessage: opts.failed ? 'synthetic failure' : null,
  }).returning();
  seededEventIds.push(row.id);
  return row;
}

test('emits BILLING_EVENTS_SILENT_ZERO warning when total > threshold but processed=0 and failed=0', async () => {
  // Seed enough pending rows to push total above the lowered threshold (2).
  // The before() hook guarantees no other rows have processedAt/errorMessage
  // set, so this assertion path always executes deterministically.
  for (let i = 0; i < 6; i++) await seedEvent({});

  const body = await fetchStats();
  const be = body.billingEvents;
  assert.equal(be.processed, 0, 'all rows are pending — processed must be 0');
  assert.equal(be.failed, 0, 'all rows are pending — failed must be 0');
  assert.ok(be.total >= 6, 'seeded rows are reflected in total');

  assert.ok(Array.isArray(body.warnings), 'response includes warnings array');
  const w = body.warnings.find((x: any) => x.code === 'BILLING_EVENTS_SILENT_ZERO');
  assert.ok(w, 'silent-zero warning fires when processed=0 AND failed=0 AND total>threshold');
  assert.match(w.message, /billing_events/);

  // Logger spy: the route must also have emitted a warn-level log line
  // tagged with [platform-stats] so an operator scraping logs notices.
  const logged = warnLogs.find(l => /\[platform-stats\]/.test(l.msg) && /billing_events/.test(l.msg));
  assert.ok(logged, 'request.log.warn was called with the [platform-stats] silent-zero message');
  assert.equal(logged!.obj.billingTotal, be.total, 'log payload includes the observed billingTotal');
});

test('does NOT emit silent-zero warning when at least one row is processed or failed', async () => {
  // Flip one of the seeded rows to processed so processed > 0. The guard
  // must stay silent — both in the response payload and the logger.
  const flipId = seededEventIds[0];
  assert.ok(flipId, 'previous test seeded rows we can flip');
  await db.update(billingEvents).set({ processedAt: new Date() }).where(eq(billingEvents.id, flipId));

  const body = await fetchStats();
  assert.ok(body.billingEvents.processed >= 1, 'flipped row makes processed > 0');
  const w = (body.warnings ?? []).find((x: any) => x.code === 'BILLING_EVENTS_SILENT_ZERO');
  assert.equal(w, undefined, 'silent-zero warning must not fire when counters are non-zero');
  const logged = warnLogs.find(l => /\[platform-stats\]/.test(l.msg));
  assert.equal(logged, undefined, 'no silent-zero log line when counters are non-zero');
});
