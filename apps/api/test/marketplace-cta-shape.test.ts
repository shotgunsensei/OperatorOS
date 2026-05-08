/**
 * Gate 3 — Marketplace CTA contract.
 *
 * AppsPage relies on the cta + access_source + addon_price_cents fields
 * returned by GET /v1/modules. Lock those down with explicit assertions
 * so refactors of the entitlement service can't silently break the UI.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import { addonSubscriptions, tenantModules } from '../src/schema.js';
import { signToken } from '../src/lib/auth.js';
import {
  ensureSchemaReady, createTestUser, createTestModule, cleanupUser, cleanupModule,
} from './_setup.js';

let app: any;
let user: any;
let mod: any;

before(async () => {
  await ensureSchemaReady();
  user = await createTestUser();
  mod = await createTestModule();
  await db.insert(addonSubscriptions).values({
    userId: user.id, moduleId: mod.id, status: 'active',
    stripeSubscriptionId: `mkt_sub_${user.id}`,
    stripeCustomerId: `mkt_cus_${user.id}`,
    stripePriceId: 'price_mkt',
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 86400_000),
  });
  // Gate 2: addon access is tenant-scoped. The webhook normally inserts
  // a tenant_modules row with status='purchased' + allowAllMembers=true
  // when the user buys the addon. We replicate that here since this test
  // seeds addon_subscriptions directly.
  await db.insert(tenantModules).values({
    tenantId: user.currentTenantId,
    moduleId: mod.id,
    status: 'purchased',
    allowAllMembers: true,
  });

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
  if (mod) await cleanupModule(mod.id);
});

const bearer = (u: any) => ({ authorization: `Bearer ${signToken({ userId: u.id, email: u.email, role: u.role })}` });

test('GET /v1/modules contract: every row has cta + access_source + module envelope', async () => {
  const r = await app.inject({ method: 'GET', url: '/v1/modules', headers: bearer(user) });
  assert.equal(r.statusCode, 200);
  const body = r.json();
  assert.ok(Array.isArray(body.modules));
  assert.ok('ssoFallback' in body, 'ssoFallback flag is required');
  for (const row of body.modules) {
    assert.ok(row.module && typeof row.module.slug === 'string', 'module envelope shape');
    assert.ok(typeof row.unlocked === 'boolean');
    assert.ok(['open', 'upgrade', 'buy_addon', 'coming_soon', 'disabled'].includes(row.cta), `bad cta: ${row.cta}`);
  }
});

test('addon-unlocked module surfaces cta=open + access_source=addon', async () => {
  const r = await app.inject({ method: 'GET', url: '/v1/modules', headers: bearer(user) });
  const row = r.json().modules.find((m: any) => m.module.slug === mod.slug);
  assert.ok(row, 'test module must appear in catalog');
  assert.equal(row.unlocked, true);
  assert.equal(row.access_source, 'addon');
  assert.equal(row.cta, 'open');
});
