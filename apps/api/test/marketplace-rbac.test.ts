/**
 * Gate 3 — Marketplace RBAC contract.
 *
 * For every (user-plan x module-access) intersection the marketplace must
 * surface the *correct* CTA so users can self-serve unlock paths and
 * locked-out users see *why* they're locked.
 *
 *   - Module they already have access to     -> cta=open
 *   - Module purchasable as add-on            -> cta=buy_addon
 *   - Module reachable only by upgrading plan -> cta=upgrade
 *   - Module status=coming_soon                -> cta=coming_soon
 *
 * The test creates fresh modules so it doesn't depend on the seeded catalog.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import { modules, planModules, subscriptionPlans } from '../src/schema.js';
import { signToken } from '../src/lib/auth.js';
import {
  ensureSchemaReady, createTestUser, createTestModule, cleanupUser, cleanupModule,
} from './_setup.js';

let app: any;
let user: any;
let comingSoonMod: any;
let upgradeMod: any;
let addonMod: any;

before(async () => {
  await ensureSchemaReady();
  user = await createTestUser();

  // 1. Coming-soon module: status flipped to coming_soon; user has no access.
  comingSoonMod = await createTestModule();
  await db.update(modules).set({ status: 'coming_soon' })
    .where(eq(modules.id, comingSoonMod.id));

  // Look up the elite plan so we can wire plan_modules rows below.
  // smallestUpgradeTarget() reads from plan_modules, NOT planMin, so a
  // module without a mapping resolves to cta=disabled instead of upgrade.
  const [elitePlan] = await db.select().from(subscriptionPlans)
    .where(eq(subscriptionPlans.slug, 'elite')).limit(1);
  assert.ok(elitePlan, 'elite plan must exist (seeded by saas-db-init)');

  // 2. Upgrade-only module: requires a plan tier the test user doesn't have,
  //    no addon price -> only path is plan upgrade.
  upgradeMod = await createTestModule();
  await db.update(modules).set({ planMin: 'elite' })
    .where(eq(modules.id, upgradeMod.id));
  await db.insert(planModules).values({ planId: elitePlan.id, moduleId: upgradeMod.id });

  // 3. Add-on purchasable module: high planMin but with addonPriceCents set
  //    in metadata so entitlement-service offers the buy_addon CTA.
  addonMod = await createTestModule();
  await db.update(modules).set({
    planMin: 'elite',
    metadata: { addonPriceCents: 1500 } as any,
  }).where(eq(modules.id, addonMod.id));
  await db.insert(planModules).values({ planId: elitePlan.id, moduleId: addonMod.id });

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
  if (user) await cleanupUser(user.id);
  for (const m of [comingSoonMod, upgradeMod, addonMod]) {
    if (!m) continue;
    try { await db.delete(planModules).where(eq(planModules.moduleId, m.id)); } catch {}
    await cleanupModule(m.id);
  }
});

const bearer = (u: any) => ({
  authorization: `Bearer ${signToken({ userId: u.id, email: u.email, role: u.role })}`,
});

async function fetchModules() {
  const r = await app.inject({ method: 'GET', url: '/v1/modules', headers: bearer(user) });
  assert.equal(r.statusCode, 200);
  return r.json().modules as Array<any>;
}

test('coming-soon modules surface cta=coming_soon and unlocked=false', async () => {
  const list = await fetchModules();
  const row = list.find(m => m.module.slug === comingSoonMod.slug);
  assert.ok(row, 'coming-soon module must appear in catalog');
  assert.equal(row.cta, 'coming_soon');
  assert.equal(row.unlocked, false);
});

test('plan-locked modules with no addon surface cta=upgrade', async () => {
  const list = await fetchModules();
  const row = list.find(m => m.module.slug === upgradeMod.slug);
  assert.ok(row, 'upgrade-only module must appear in catalog');
  assert.equal(row.unlocked, false);
  assert.equal(row.cta, 'upgrade');
  assert.ok(row.upgrade_target_plan, 'upgrade CTA must include target plan');
});

test('plan-locked modules with addon price surface cta=buy_addon', async () => {
  const list = await fetchModules();
  const row = list.find(m => m.module.slug === addonMod.slug);
  assert.ok(row, 'addon-purchasable module must appear in catalog');
  assert.equal(row.unlocked, false);
  assert.equal(row.cta, 'buy_addon');
  assert.equal(row.addon_price_cents, 1500);
});
