/**
 * Gate 3 — GET /v1/me/modules launchpad shape.
 *
 * Verifies that:
 *   - Auth required.
 *   - Modules with no access do NOT appear.
 *   - Modules with active addon DO appear.
 *   - Response shape matches what MyAppsPage consumes.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import { addonSubscriptions } from '../src/schema.js';
import { signToken } from '../src/lib/auth.js';
import {
  ensureSchemaReady, createTestUser, createTestModule, cleanupUser, cleanupModule,
} from './_setup.js';

let app: any;
let user: any;
let lockedMod: any, unlockedMod: any, betaMod: any;

before(async () => {
  await ensureSchemaReady();
  user = await createTestUser();
  lockedMod = await createTestModule();
  unlockedMod = await createTestModule();
  betaMod = await createTestModule();
  // Flip betaMod into beta status — entitlement service treats `beta`
  // as launchable when access exists, so My Apps must include it.
  const { modules: modsTable } = await import('../src/schema.js');
  await db.update(modsTable).set({ status: 'beta' }).where(eq(modsTable.id, betaMod.id));
  // Give the user active add-on subscriptions on both unlocked + beta mods.
  await db.insert(addonSubscriptions).values([
    {
      userId: user.id, moduleId: unlockedMod.id, status: 'active',
      stripeSubscriptionId: `test_sub_${user.id}`,
      stripeCustomerId: `test_cus_${user.id}`,
      stripePriceId: 'price_test',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400_000),
    },
    {
      userId: user.id, moduleId: betaMod.id, status: 'active',
      stripeSubscriptionId: `beta_sub_${user.id}`,
      stripeCustomerId: `beta_cus_${user.id}`,
      stripePriceId: 'price_beta',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400_000),
    },
  ]);

  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerModuleRoutes } = await import('../src/routes/module-routes.js');
  app = Fastify();
  await app.register(cookie);
  await registerModuleRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  try { await db.delete(addonSubscriptions).where(eq(addonSubscriptions.userId, user.id)); } catch {}
  if (user) await cleanupUser(user.id);
  for (const m of [lockedMod, unlockedMod, betaMod]) if (m) await cleanupModule(m.id);
});

const bearer = (u: any) => ({ authorization: `Bearer ${signToken({ userId: u.id, email: u.email, role: u.role })}` });

test('401 when unauthenticated', async () => {
  const r = await app.inject({ method: 'GET', url: '/v1/me/modules' });
  assert.equal(r.statusCode, 401);
});

test('returns only unlocked modules with the launchpad shape', async () => {
  const r = await app.inject({ method: 'GET', url: '/v1/me/modules', headers: bearer(user) });
  assert.equal(r.statusCode, 200);
  const body = r.json();
  assert.ok(Array.isArray(body.modules), 'modules must be an array');
  const slugs = body.modules.map((m: any) => m.slug);
  assert.ok(slugs.includes(unlockedMod.slug), 'addon-unlocked module should be present');
  assert.ok(!slugs.includes(lockedMod.slug), 'locked module must not be returned');
  // Shape contract for MyAppsPage.
  const m = body.modules.find((x: any) => x.slug === unlockedMod.slug);
  for (const k of ['slug', 'name', 'description', 'category', 'iconUrl', 'baseUrl']) {
    assert.ok(k in m, `missing field ${k}`);
  }
});

test('beta-status modules with access are also returned (not just live)', async () => {
  const r = await app.inject({ method: 'GET', url: '/v1/me/modules', headers: bearer(user) });
  const slugs = r.json().modules.map((m: any) => m.slug);
  assert.ok(slugs.includes(betaMod.slug),
    'beta-status modules with active entitlement must appear on the launchpad');
});
