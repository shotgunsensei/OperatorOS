/**
 * Task #39 — Platform stats: billing-event counts.
 *
 * Regression guard for the silent-zero bug where the dashboard read
 * `billingEvents.status` (a column that does not exist) and reported 0
 * for both processed and failed counters. The fix re-derives those
 * counts from the real columns:
 *   - failed    => errorMessage IS NOT NULL
 *   - processed => processedAt IS NOT NULL
 *
 * This test seeds a known mix of processed/failed/pending rows, hits
 * the real /v1/platform/stats route, and asserts the deltas match.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import { users, billingEvents } from '../src/schema.js';
import { signToken } from '../src/lib/auth.js';
import { ensureSchemaReady, createTestUser, cleanupUser, uniqueId } from './_setup.js';

let app: any;
let superAdmin: any;
let owner: any;
const seededEventIds: string[] = [];
let baseline: { total: number; processed: number; failed: number };

before(async () => {
  await ensureSchemaReady();
  superAdmin = await createTestUser();
  owner = await createTestUser();
  await db.update(users).set({ platformRole: 'super_admin' }).where(eq(users.id, superAdmin.id));

  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerPlatformRoutes } = await import('../src/routes/platform-routes.js');
  app = Fastify();
  await app.register(cookie, { secret: 'test-secret' });
  await registerPlatformRoutes(app);
  await app.ready();
});

after(async () => {
  for (const id of seededEventIds) {
    try { await db.delete(billingEvents).where(eq(billingEvents.id, id)); } catch {}
  }
  if (app) await app.close();
  for (const u of [owner, superAdmin]) if (u) await cleanupUser(u.id);
});

const bearer = (u: any) => ({ authorization: `Bearer ${signToken({ userId: u.id, email: u.email, role: u.role })}` });

async function fetchStats() {
  const res = await app.inject({
    method: 'GET',
    url: '/v1/platform/stats',
    headers: bearer(superAdmin),
  });
  assert.equal(res.statusCode, 200, 'super_admin should reach /v1/platform/stats');
  const body = res.json();
  assert.ok(body.billingEvents, 'response includes billingEvents block');
  return body.billingEvents as { total: number; processed: number; failed: number };
}

async function seedEvent(opts: { processed?: boolean; failed?: boolean }) {
  const [row] = await db.insert(billingEvents).values({
    userId: owner.id,
    eventType: 'test.synthetic',
    stripeEventId: uniqueId('evt'),
    processedAt: opts.processed ? new Date() : null,
    errorMessage: opts.failed ? 'synthetic failure' : null,
  }).returning();
  seededEventIds.push(row.id);
  return row;
}

test('billing-event counters reflect real column values (not the missing status column)', async () => {
  baseline = await fetchStats();

  // Seed: 3 processed (no error), 2 failed (with error, never processed),
  // 1 pending (neither), and 1 row that is BOTH processed and failed
  // (a retried event that eventually succeeded but kept its error). The
  // last row should count toward both `processed` and `failed`.
  for (let i = 0; i < 3; i++) await seedEvent({ processed: true });
  for (let i = 0; i < 2; i++) await seedEvent({ failed: true });
  await seedEvent({});
  await seedEvent({ processed: true, failed: true });

  const after = await fetchStats();

  assert.equal(after.total - baseline.total, 7, 'total grows by every seeded row');
  assert.equal(after.processed - baseline.processed, 4, 'processed counts processedAt IS NOT NULL');
  assert.equal(after.failed - baseline.failed, 3, 'failed counts errorMessage IS NOT NULL');

  // Anti-regression: if the route ever reverts to reading a non-existent
  // `status` column, both counters silently fall back to 0 — guard that.
  assert.ok(after.processed > 0, 'processed counter must not be silently zero after seeding');
  assert.ok(after.failed > 0, 'failed counter must not be silently zero after seeding');
});
