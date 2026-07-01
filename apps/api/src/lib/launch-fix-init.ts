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
  modules, planModules, subscriptions, subscriptionPlans, billingEvents,
  tenantEntitlements,
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
      .set({ slug: 'brandforgeos', name: 'BrandForgeOS' })
      .where(eq(modules.slug, 'bf-os'));
    console.log('[launch-fix:pre] Renamed module bf-os -> brandforgeos');
  } else if (legacy && target) {
    // Both exist (shouldn't happen, but defensive). FK dependents
    // (plan_modules, tenant_modules, addon_subscriptions,
    // tenant_user_module_access, entitlement_overrides) reference
    // modules.id, so deleting the legacy row directly would either FK-
    // restrict-fail or — worse — silently strand grants if the FK is
    // ON DELETE CASCADE. Re-point every dependent row to the canonical
    // brandforgeos id first, swallow uniqueness collisions on
    // (plan_id, module_id) / (tenant_id, module_id) / (tenant_id,
    // user_id, module_id) so the heal stays idempotent across retries,
    // then drop the legacy row.
    const legacyId = legacy.id;
    const targetId = target.id;
    const repointed: Record<string, number> = {
      plan_modules: 0,
      tenant_modules: 0,
      tenant_user_module_access: 0,
      addon_subscriptions: 0,
      entitlement_overrides: 0,
    };
    const dropped: Record<string, number> = {
      plan_modules: 0,
      tenant_modules: 0,
      tenant_user_module_access: 0,
    };
    await db.transaction(async (tx) => {
      const pmUpd = await tx.execute(sql`
        UPDATE plan_modules SET module_id = ${targetId}
        WHERE module_id = ${legacyId}
          AND NOT EXISTS (
            SELECT 1 FROM plan_modules pm2
            WHERE pm2.plan_id = plan_modules.plan_id AND pm2.module_id = ${targetId}
          )`);
      repointed.plan_modules = pmUpd.rowCount ?? 0;
      const pmDel = await tx.execute(sql`DELETE FROM plan_modules WHERE module_id = ${legacyId}`);
      dropped.plan_modules = pmDel.rowCount ?? 0;

      const tmUpd = await tx.execute(sql`
        UPDATE tenant_modules SET module_id = ${targetId}
        WHERE module_id = ${legacyId}
          AND NOT EXISTS (
            SELECT 1 FROM tenant_modules tm2
            WHERE tm2.tenant_id = tenant_modules.tenant_id AND tm2.module_id = ${targetId}
          )`);
      repointed.tenant_modules = tmUpd.rowCount ?? 0;
      const tmDel = await tx.execute(sql`DELETE FROM tenant_modules WHERE module_id = ${legacyId}`);
      dropped.tenant_modules = tmDel.rowCount ?? 0;

      const tumaUpd = await tx.execute(sql`
        UPDATE tenant_user_module_access SET module_id = ${targetId}
        WHERE module_id = ${legacyId}
          AND NOT EXISTS (
            SELECT 1 FROM tenant_user_module_access tuma2
            WHERE tuma2.tenant_id = tenant_user_module_access.tenant_id
              AND tuma2.user_id   = tenant_user_module_access.user_id
              AND tuma2.module_id = ${targetId}
          )`);
      repointed.tenant_user_module_access = tumaUpd.rowCount ?? 0;
      const tumaDel = await tx.execute(sql`DELETE FROM tenant_user_module_access WHERE module_id = ${legacyId}`);
      dropped.tenant_user_module_access = tumaDel.rowCount ?? 0;

      // addon_subscriptions + entitlement_overrides: re-point in place;
      // there's no composite uniqueness preventing a straight UPDATE.
      const addonUpd = await tx.execute(sql`UPDATE addon_subscriptions   SET module_id = ${targetId} WHERE module_id = ${legacyId}`);
      repointed.addon_subscriptions = addonUpd.rowCount ?? 0;
      const entUpd = await tx.execute(sql`UPDATE entitlement_overrides SET module_id = ${targetId} WHERE module_id = ${legacyId}`);
      repointed.entitlement_overrides = entUpd.rowCount ?? 0;

      await tx.delete(modules).where(eq(modules.id, legacyId));
    });
    console.log('[launch-fix:pre] Migrated FK refs from bf-os -> brandforgeos and dropped duplicate row');

    // Surface the heal through billing_events so admin DLQ / alert
    // tooling picks it up. Repeated boots without the duplicate won't
    // re-enter this branch, so this stays silent on healthy runs.
    try {
      await db.insert(billingEvents).values({
        userId: null,
        eventType: 'launch_fix_module_slug_heal',
        metadata: {
          legacySlug: 'bf-os',
          canonicalSlug: 'brandforgeos',
          legacyModuleId: legacyId,
          canonicalModuleId: targetId,
          repointed,
          dropped,
          source: 'launchFixPreSeed',
          note: 'Duplicate legacy module row detected at boot; FK dependents migrated and legacy row dropped. Investigate why both bf-os and brandforgeos exist.',
        },
        processedAt: new Date(),
      });
    } catch (err) {
      console.error('[launch-fix:pre] failed to record duplicate-heal billing_event:', err);
    }
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
      .set({ price: cfg.price })
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
        .set({ stripePriceId: ids.monthly })
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

// Task #81: ensure the canonical "Shotgun Ninjas Productions" tenant
// exists with slug=shotgun-ninjas, status=active, type=company, and
// john@shotgunninjas.com as owner.
//
// Strategy is FIND-OR-CREATE by slug. We never rename or modify any
// tenant that doesn't already match the canonical slug. If the canonical
// row exists we only heal owner + membership; otherwise we create it
// from scratch and re-point john's `current_tenant_id` to it.
//
// Exported so the bootstrap idempotency test can call it directly.
export async function fixShotgunTenant(): Promise<void> {
  const adminEmail =
    process.env.OPERATOROS_BOOTSTRAP_SUPER_ADMIN_EMAIL ||
    process.env.ADMIN_EMAIL ||
    'john@shotgunninjas.com';

  const [john] = await db.select().from(users).where(eq(users.email, adminEmail)).limit(1);
  if (!john) {
    console.log(`[launch-fix:post] super-admin ${adminEmail} not found; skipping`);
    return;
  }

  const desiredName = process.env.SHOTGUN_TENANT_NAME || 'Shotgun Ninjas Productions';
  const desiredSlug = 'shotgun-ninjas';

  // Find-or-create the canonical tenant strictly by slug.
  let [canonical] = await db.select().from(tenants).where(eq(tenants.slug, desiredSlug)).limit(1);
  if (!canonical) {
    [canonical] = await db.insert(tenants).values({
      name: desiredName,
      slug: desiredSlug,
      type: 'company',
      status: 'active',
      ownerUserId: john.id,
    }).returning();
    console.log(`[bootstrap] shotgun-ninjas created (${canonical.id})`);
  } else {
    console.log(`[bootstrap] shotgun-ninjas already-present (${canonical.id})`);
  }

  // Ensure john has an owner-role membership row on the canonical tenant.
  // We DO NOT modify any other field on an already-existing canonical
  // tenant — name, slug, type, status, ownerUserId are left as-is.
  await db.insert(tenantUsers).values({
    tenantId: canonical.id, userId: john.id, role: 'owner',
  }).onConflictDoNothing({ target: [tenantUsers.tenantId, tenantUsers.userId] });

  // Re-point john's current_tenant_id to canonical only if it isn't
  // already (so subsequent module backfill writes to the right place).
  if (john.currentTenantId !== canonical.id) {
    await db.update(users).set({ currentTenantId: canonical.id }).where(eq(users.id, john.id));
  }
  const tenantId = canonical.id;

  await ensureShotgunCoreModuleEntitlements(tenantId, john.id);

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

async function ensureShotgunCoreModuleEntitlements(tenantId: string, johnUserId: string): Promise<void> {
  const coreSlugs = ['techdeck', 'pulsedesk', 'tradeflowkit'];
  let granted = 0;

  for (const slug of coreSlugs) {
    const [mod] = await db.select().from(modules).where(eq(modules.slug, slug)).limit(1);
    if (!mod) {
      console.warn(`[launch-fix:post] module ${slug} not found; skipping Shotgun entitlement seed`);
      continue;
    }

    await db.insert(tenantModules).values({
      tenantId,
      moduleId: mod.id,
      status: 'enabled',
      source: 'admin',
      allowAllMembers: true,
      metadata: { seededBy: 'fixShotgunTenant', phase: 'operatoros_phase_6' },
    }).onConflictDoNothing({ target: [tenantModules.tenantId, tenantModules.moduleId] });

    await db.insert(tenantUserModuleAccess).values({
      tenantId,
      userId: johnUserId,
      moduleId: mod.id,
      accessLevel: 'manager',
      grantedByUserId: johnUserId,
    }).onConflictDoNothing({
      target: [tenantUserModuleAccess.tenantId, tenantUserModuleAccess.userId, tenantUserModuleAccess.moduleId],
    });

    const [activeEntitlement] = await db.select().from(tenantEntitlements)
      .where(and(
        eq(tenantEntitlements.tenantId, tenantId),
        eq(tenantEntitlements.entitlementKey, slug),
        eq(tenantEntitlements.active, true),
      ))
      .limit(1);
    if (!activeEntitlement) {
      await db.insert(tenantEntitlements).values({
        tenantId,
        entitlementKey: slug,
        entitlementType: 'system',
        source: 'admin',
        active: true,
        metadata: {
          seededBy: 'fixShotgunTenant',
          phase: 'operatoros_phase_6',
          moduleId: mod.id,
        },
      });
      granted++;
    }
  }

  if (granted > 0) {
    console.log(`[launch-fix:post] Seeded ${granted} Shotgun Ninjas module entitlement(s)`);
  }
}
