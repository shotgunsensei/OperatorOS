/**
 * Task #66 — OperatorOS launch-fix bootstrap.
 *
 * Two phases:
 *   - `launchFixPreSeed()`  runs BEFORE `seedModules`. Renames the
 *     legacy `bf-os` module to `brandforgeos` so `seedModules` finds the
 *     row by its new slug and doesn't insert a duplicate. Adds the
 *     `subscription_plans.stripe_price_id_annual` column (idempotent).
 *
 *   - `launchFixPostSeed()` runs AFTER `seedDemoCoTenant`. Aligns plan
 *     prices to PLAN_CONFIGS, back-fills Stripe price IDs (monthly +
 *     annual) from env, renames John's tenant to "Shotgun Ninjas
 *     Productions" + flips `type → 'company'`, and back-fills
 *     `tenant_modules` rows for every plan-included live module on
 *     John's tenant.
 *
 * Every UPDATE is idempotent — guarded by a value comparison so a
 * re-boot is a no-op. Inserts use `onConflictDoNothing` against the
 * existing UNIQUE indexes.
 */

import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  users, tenants, tenantUsers, tenantModules, tenantUserModuleAccess,
  modules, planModules, subscriptions, subscriptionPlans,
} from '../schema.js';
import { PLAN_CONFIGS } from './plans.js';

// ---------------------------------------------------------------------------
// PRE-SEED — must run before `seedModules` so the slug rename is in place
// before the seeder iterates MODULE_SEED_SPECS.
// ---------------------------------------------------------------------------

export async function launchFixPreSeed(): Promise<void> {
  // 1. Add stripe_price_id_annual column (idempotent).
  try {
    await db.execute(sql`ALTER TABLE subscription_plans
      ADD COLUMN IF NOT EXISTS stripe_price_id_annual TEXT`);
  } catch (err) {
    console.warn('[launch-fix:pre] failed to add stripe_price_id_annual:', err);
  }

  // 2. Idempotent slug rename: bf-os → brandforgeos. All FKs reference
  //    modules.id, so plan_modules / tenant_modules / addon_subscriptions
  //    follow the row automatically.
  const [legacy] = await db.select().from(modules).where(eq(modules.slug, 'bf-os')).limit(1);
  const [target] = await db.select().from(modules).where(eq(modules.slug, 'brandforgeos')).limit(1);

  if (legacy && !target) {
    await db.update(modules)
      .set({ slug: 'brandforgeos', name: 'BrandForgeOS', updatedAt: new Date() })
      .where(eq(modules.slug, 'bf-os'));
    console.log('[launch-fix:pre] Renamed module bf-os -> brandforgeos');
  } else if (legacy && target) {
    // Both exist (shouldn't happen, but defensive). Keep the new slug,
    // remove the legacy duplicate.
    await db.delete(modules).where(eq(modules.slug, 'bf-os'));
    console.log('[launch-fix:pre] Dropped duplicate bf-os row (brandforgeos already present)');
  }
}

// ---------------------------------------------------------------------------
// POST-SEED — plan prices, Stripe price IDs, John's tenant, backfills.
// ---------------------------------------------------------------------------

export async function launchFixPostSeed(): Promise<void> {
  await alignPlanPricesAndStripeIds();
  await fixShotgunTenant();
}

async function alignPlanPricesAndStripeIds(): Promise<void> {
  // PLAN_CONFIGS is the source of truth; back-fill the DB to match.
  for (const cfg of PLAN_CONFIGS) {
    await db.update(subscriptionPlans)
      .set({ price: cfg.price, updatedAt: new Date() })
      .where(and(
        eq(subscriptionPlans.slug, cfg.slug),
        sql`${subscriptionPlans.price} <> ${cfg.price}`,
      ));
  }

  // Stripe price IDs (monthly + annual) from env.
  const planEnv: Record<string, { monthly?: string; annual?: string }> = {
    starter: {
      monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY || process.env.STRIPE_PRICE_STARTER || undefined,
      annual: process.env.STRIPE_PRICE_STARTER_ANNUAL || undefined,
    },
    pro: {
      monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || process.env.STRIPE_PRICE_PRO || undefined,
      annual: process.env.STRIPE_PRICE_PRO_ANNUAL || undefined,
    },
    elite: {
      monthly: process.env.STRIPE_PRICE_ELITE_MONTHLY || process.env.STRIPE_PRICE_ELITE || undefined,
      annual: process.env.STRIPE_PRICE_ELITE_ANNUAL || undefined,
    },
  };

  for (const [slug, ids] of Object.entries(planEnv)) {
    if (ids.monthly) {
      await db.update(subscriptionPlans)
        .set({ stripePriceId: ids.monthly, updatedAt: new Date() })
        .where(and(
          eq(subscriptionPlans.slug, slug),
          sql`(${subscriptionPlans.stripePriceId} IS NULL OR ${subscriptionPlans.stripePriceId} <> ${ids.monthly})`,
        ));
    }
    if (ids.annual) {
      await db.execute(sql`
        UPDATE subscription_plans
        SET stripe_price_id_annual = ${ids.annual}, updated_at = NOW()
        WHERE slug = ${slug}
          AND (stripe_price_id_annual IS NULL OR stripe_price_id_annual <> ${ids.annual})
      `);
    }
  }
}

async function fixShotgunTenant(): Promise<void> {
  const adminEmail =
    process.env.OPERATOROS_BOOTSTRAP_SUPER_ADMIN_EMAIL ||
    process.env.ADMIN_EMAIL ||
    'john@shotgunninjas.com';

  const [john] = await db.select().from(users).where(eq(users.email, adminEmail)).limit(1);
  if (!john || !john.currentTenantId) {
    console.log(`[launch-fix:post] super-admin ${adminEmail} or current_tenant_id missing; skipping`);
    return;
  }

  const desiredName = process.env.SHOTGUN_TENANT_NAME || 'Shotgun Ninjas Productions';
  const tenantId = john.currentTenantId;

  // Idempotent rename + type flip.
  const [tenantBefore] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (tenantBefore && (tenantBefore.name !== desiredName || tenantBefore.type !== 'company')) {
    await db.update(tenants)
      .set({ name: desiredName, type: 'company', updatedAt: new Date() })
      .where(eq(tenants.id, tenantId));
    console.log(`[launch-fix:post] Renamed John's tenant -> "${desiredName}" (company)`);
  }

  // Back-fill tenant_modules for every plan-included live module on
  // John's tenant. Mirrors the Demo Co pattern.
  const [activeSub] = await db.select().from(subscriptions)
    .where(and(eq(subscriptions.userId, john.id), eq(subscriptions.status, 'active')))
    .limit(1);
  if (!activeSub) {
    console.log('[launch-fix:post] no active subscription for super-admin; skipping module backfill');
    return;
  }

  const planMods = await db.select().from(planModules)
    .where(eq(planModules.planId, activeSub.planId));
  const planModIds = new Set(planMods.map(pm => pm.moduleId));
  const liveMods = await db.select().from(modules).where(eq(modules.status, 'live'));

  let backfilled = 0;
  for (const mod of liveMods) {
    if (!planModIds.has(mod.id)) continue;
    await db.insert(tenantModules).values({
      tenantId,
      moduleId: mod.id,
      status: 'enabled',
      source: 'included',
      allowAllMembers: true,
    }).onConflictDoNothing({ target: [tenantModules.tenantId, tenantModules.moduleId] });

    await db.insert(tenantUserModuleAccess).values({
      tenantId,
      userId: john.id,
      moduleId: mod.id,
      accessLevel: 'manager',
    }).onConflictDoNothing({
      target: [tenantUserModuleAccess.tenantId, tenantUserModuleAccess.userId, tenantUserModuleAccess.moduleId],
    });
    backfilled++;
  }
  if (backfilled > 0) {
    console.log(`[launch-fix:post] Back-filled ${backfilled} tenant_modules rows on John's tenant`);
  }
}
