/**
 * Task 41 — Confirm price-history restore works end-to-end.
 *
 * Mirrors what the Modules tab "Restore" button does, at the API layer:
 *   1. Edit a module's add-on price twice (PUT addon-price).
 *   2. GET addon-price-history and assert two entries with the
 *      `previousCents`/`nextCents` shape the UI consumes.
 *   3. "Restore" the older entry by re-issuing PUT addon-price with
 *      that entry's `previousCents`, the same call the UI makes.
 *   4. Assert the module's stored price now matches the restored value
 *      and a new audit row has been written for the restore.
 *
 * Also covers the empty-history case: a freshly created module returns
 * `{ history: [] }` so the UI's "No price changes recorded yet." state
 * keeps rendering.
 *
 * No Playwright runner is configured in this monorepo; the existing
 * `apps/api/test/*.test.ts` Node test suite is the closest end-to-end
 * harness we have (it boots a real Fastify instance + DB), so the
 * regression coverage required by the task lives there.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import { users, modules, adminAuditLogs } from '../src/schema.js';
import { signToken } from '../src/lib/auth.js';
import {
  ensureSchemaReady, createTestUser, cleanupUser, cleanupModule, uniqueId,
} from './_setup.js';

let app: any;
let superAdmin: any;
const createdModuleIds: string[] = [];

before(async () => {
  await ensureSchemaReady();
  superAdmin = await createTestUser();
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
  if (app) await app.close();
  for (const id of createdModuleIds) await cleanupModule(id);
  try { await db.delete(adminAuditLogs).where(eq(adminAuditLogs.adminId, superAdmin.id)); } catch {}
  if (superAdmin) await cleanupUser(superAdmin.id);
});

const bearer = (u: any) => ({
  authorization: `Bearer ${signToken({ userId: u.id, email: u.email, role: u.role })}`,
});

async function makeModule(initialCents?: number) {
  const slug = `aphr-${uniqueId('m').replace(/_/g, '-')}`;
  const [m] = await db.insert(modules).values({
    slug, name: 'Addon Price History Test',
    description: 'fixture', baseUrl: 'https://example.test',
    status: 'live', planMin: 'starter', ord: 0,
    metadata: initialCents != null ? { addonPriceCents: initialCents } : {},
  }).returning();
  createdModuleIds.push(m.id);
  return m;
}

async function putPrice(slug: string, cents: number) {
  const res = await app.inject({
    method: 'PUT',
    url: `/v1/platform/modules/${slug}/addon-price`,
    headers: bearer(superAdmin),
    payload: { addonPriceCents: cents },
  });
  assert.equal(res.statusCode, 200, `PUT addon-price ${cents}: ${res.body}`);
  return res.json().module;
}

async function getHistory(slug: string) {
  const res = await app.inject({
    method: 'GET',
    url: `/v1/platform/modules/${slug}/addon-price-history`,
    headers: bearer(superAdmin),
  });
  assert.equal(res.statusCode, 200, `GET history: ${res.body}`);
  return res.json();
}

test('addon-price-history: empty for a module that has never been edited', async () => {
  const m = await makeModule();
  const body = await getHistory(m.slug);
  assert.equal(body.slug, m.slug);
  assert.ok(Array.isArray(body.history), 'history is an array');
  assert.equal(body.history.length, 0, 'no entries before any edit');
});

test('addon-price-history: restore older entry re-issues PUT and writes a new audit row', async () => {
  // Start at 1000¢, then edit to 2000¢, then 3000¢. The "older" history
  // entry the UI's Restore button targets is the 1000 → 2000 change.
  const m = await makeModule(1000);
  await putPrice(m.slug, 2000);
  await putPrice(m.slug, 3000);

  const before = await getHistory(m.slug);
  assert.equal(before.history.length, 2, 'two edits yield two history rows');

  // Routes return rows ordered by createdAt DESC, so [0] is the most
  // recent edit (2000 → 3000) and [1] is the older one (1000 → 2000).
  const newest = before.history[0];
  const older = before.history[1];
  assert.equal(newest.previousCents, 2000);
  assert.equal(newest.nextCents, 3000);
  assert.equal(older.previousCents, 1000);
  assert.equal(older.nextCents, 2000);
  for (const e of before.history) {
    assert.equal(typeof e.id, 'string');
    assert.ok(e.createdAt, 'createdAt populated');
    assert.equal(e.adminId, superAdmin.id);
    assert.equal(e.adminEmail, superAdmin.email);
  }

  // Simulate the "Restore" click: re-issue PUT addon-price with the
  // older entry's previousCents (the value the UI restores to).
  assert.equal(older.previousCents, 1000, 'restore target is 1000¢');
  const restored = await putPrice(m.slug, older.previousCents!);
  assert.equal(
    (restored.metadata as any).addonPriceCents,
    1000,
    'module metadata reflects restored value',
  );

  // The DB should agree with the API response.
  const [reread] = await db.select().from(modules).where(eq(modules.id, m.id));
  assert.equal((reread.metadata as any).addonPriceCents, 1000);

  // A fresh history row must have been written for the restore itself,
  // capturing the 3000 → 1000 transition with the same shape the UI reads.
  const after = await getHistory(m.slug);
  assert.equal(after.history.length, 3, 'restore writes a third audit row');
  const restoreEntry = after.history[0];
  assert.equal(restoreEntry.previousCents, 3000);
  assert.equal(restoreEntry.nextCents, 1000);
  assert.equal(restoreEntry.adminId, superAdmin.id);
});
