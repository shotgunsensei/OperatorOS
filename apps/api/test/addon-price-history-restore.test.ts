/**
 * Historical per-module price reads remain available for audit, but release
 * v60 closes every per-module price mutation. Forward sales use the single
 * shared companion price owned by the Application Stack contract.
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
  authorization: `Bearer ${signToken({ userId: u.id, email: u.email, role: u.role, sessionType: 'platform' })}`,
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
  assert.equal(res.statusCode, 409, `PUT addon-price ${cents}: ${res.body}`);
  assert.equal(res.json().code, 'APPLICATION_STACK_SHARED_PRICE_REQUIRED');
  return res.json();
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

test('addon-price-history: legacy rows remain readable but restore mutation is closed', async () => {
  const m = await makeModule(1000);
  await putPrice(m.slug, 2000);

  const [reread] = await db.select().from(modules).where(eq(modules.id, m.id));
  assert.equal((reread.metadata as any).addonPriceCents, 1000, 'closed mutation cannot alter legacy metadata');

  const after = await getHistory(m.slug);
  assert.equal(after.history.length, 0, 'rejected mutation cannot manufacture an audit-history entry');
});
