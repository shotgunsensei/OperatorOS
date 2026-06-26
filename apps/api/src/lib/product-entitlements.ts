import { and, asc, eq } from 'drizzle-orm';
import {
  COMPANION_MODULE_KEYS,
  CORE_PRODUCTS_BY_KEY,
  INCLUDED_SEATS,
  INCLUDED_WITH_ANY_PAID_CORE,
  normalizeStackSelection,
  type CompanionModuleKey,
  type CoreProductKey,
  type StackSelection,
} from '@operatoros/sdk';
import { db } from '../db.js';
import { tenantEntitlements, tenants, tenantUsers } from '../schema.js';

export interface GrantStackInput extends StackSelection {
  tenantId: string;
  stripeSubscriptionId: string;
  corePriceId?: string | null;
  companionPriceId?: string | null;
  additionalSeatPriceId?: string | null;
}

export async function grantStackEntitlements(input: GrantStackInput): Promise<void> {
  const normalized = normalizeStackSelection(input);
  const seatLimit = INCLUDED_SEATS + (normalized.additionalSeats ?? 0);
  const now = new Date();

  await db.transaction(async tx => {
    await tx.update(tenantEntitlements)
      .set({ active: false, updatedAt: now })
      .where(and(
        eq(tenantEntitlements.tenantId, input.tenantId),
        eq(tenantEntitlements.stripeSubscriptionId, input.stripeSubscriptionId),
        eq(tenantEntitlements.active, true),
      ));

    await tx.insert(tenantEntitlements).values({
      tenantId: input.tenantId,
      entitlementKey: normalized.coreProduct,
      entitlementType: 'core_product',
      source: 'stripe',
      stripeSubscriptionId: input.stripeSubscriptionId,
      stripePriceId: input.corePriceId ?? null,
      metadata: { fullyUnlocked: true, includedSeats: INCLUDED_SEATS },
    });

    await tx.insert(tenantEntitlements).values(
      INCLUDED_WITH_ANY_PAID_CORE.map(app => ({
        tenantId: input.tenantId,
        entitlementKey: app.key,
        entitlementType: 'included_app' as const,
        source: 'included_with_core' as const,
        stripeSubscriptionId: input.stripeSubscriptionId,
        metadata: { includedWithCoreProduct: normalized.coreProduct },
      })),
    );

    await tx.insert(tenantEntitlements).values({
      tenantId: input.tenantId,
      entitlementKey: normalized.freeCompanionModule,
      entitlementType: 'companion_module',
      source: 'selected_free_companion',
      stripeSubscriptionId: input.stripeSubscriptionId,
      metadata: { includedPriceCents: 0, coreProduct: normalized.coreProduct },
    });

    if (normalized.additionalModules?.length) {
      await tx.insert(tenantEntitlements).values(
        normalized.additionalModules.map(moduleKey => ({
          tenantId: input.tenantId,
          entitlementKey: moduleKey,
          entitlementType: 'companion_module' as const,
          source: 'stripe' as const,
          stripeSubscriptionId: input.stripeSubscriptionId,
          stripePriceId: input.companionPriceId ?? null,
          metadata: { monthlyPriceCents: 2900 },
        })),
      );
    }

    if ((normalized.additionalSeats ?? 0) > 0) {
      await tx.insert(tenantEntitlements).values({
        tenantId: input.tenantId,
        entitlementKey: 'additional-seats',
        entitlementType: 'seat_pack',
        source: 'stripe',
        stripeSubscriptionId: input.stripeSubscriptionId,
        stripePriceId: input.additionalSeatPriceId ?? null,
        metadata: { quantity: normalized.additionalSeats },
      });
    }

    await tx.update(tenants)
      .set({
        seatLimit,
        metadata: {
          pricingModel: 'core_product_stack',
          coreProduct: normalized.coreProduct,
          freeCompanionModule: normalized.freeCompanionModule,
          additionalModules: normalized.additionalModules ?? [],
          additionalSeats: normalized.additionalSeats ?? 0,
        },
        updatedAt: now,
      })
      .where(eq(tenants.id, input.tenantId));
  });
}

export async function changeFreeCompanionModule(
  tenantId: string,
  moduleKey: CompanionModuleKey,
): Promise<void> {
  if (!COMPANION_MODULE_KEYS.has(moduleKey)) throw new Error(`Unknown companion module: ${moduleKey}`);

  const [core] = await db.select().from(tenantEntitlements)
    .where(and(
      eq(tenantEntitlements.tenantId, tenantId),
      eq(tenantEntitlements.entitlementType, 'core_product'),
      eq(tenantEntitlements.active, true),
    ))
    .limit(1);
  if (!core) throw new Error('An active core product is required');

  await db.transaction(async tx => {
    await tx.update(tenantEntitlements)
      .set({ active: false, updatedAt: new Date() })
      .where(and(
        eq(tenantEntitlements.tenantId, tenantId),
        eq(tenantEntitlements.source, 'selected_free_companion'),
        eq(tenantEntitlements.active, true),
      ));
    await tx.insert(tenantEntitlements).values({
      tenantId,
      entitlementKey: moduleKey,
      entitlementType: 'companion_module',
      source: 'selected_free_companion',
      stripeSubscriptionId: core.stripeSubscriptionId,
      metadata: { includedPriceCents: 0, changedInOperatorOS: true },
    });
  });
}

export async function deactivateSubscriptionEntitlements(
  stripeSubscriptionId: string,
): Promise<string | null> {
  const [row] = await db.select({ tenantId: tenantEntitlements.tenantId })
    .from(tenantEntitlements)
    .where(and(
      eq(tenantEntitlements.stripeSubscriptionId, stripeSubscriptionId),
      eq(tenantEntitlements.active, true),
    ))
    .limit(1);
  if (!row) return null;

  const now = new Date();
  await db.transaction(async tx => {
    // 1. Deactivate ONLY the cancelled subscription's rows. Entitlements
    //    belonging to any OTHER active core subscription (its included apps,
    //    companion, and seat packs) are left untouched.
    await tx.update(tenantEntitlements)
      .set({ active: false, updatedAt: now })
      .where(eq(tenantEntitlements.stripeSubscriptionId, stripeSubscriptionId));

    // 2. Recompute the tenant seat limit from what REMAINS active. If the
    //    tenant still owns at least one active core product, the seat limit
    //    is the included base plus every still-active seat-pack quantity.
    //    If no active core remains, the seat limit collapses to 0.
    const remaining = await tx.select({
      entitlementType: tenantEntitlements.entitlementType,
      metadata: tenantEntitlements.metadata,
    })
      .from(tenantEntitlements)
      .where(and(
        eq(tenantEntitlements.tenantId, row.tenantId),
        eq(tenantEntitlements.active, true),
      ));

    const hasActiveCore = remaining.some(r => r.entitlementType === 'core_product');
    const activeSeatPackTotal = remaining
      .filter(r => r.entitlementType === 'seat_pack')
      .reduce((sum, r) => {
        const qty = Number((r.metadata as { quantity?: unknown } | null)?.quantity ?? 0);
        return sum + (Number.isFinite(qty) && qty > 0 ? qty : 0);
      }, 0);

    const seatLimit = hasActiveCore ? INCLUDED_SEATS + activeSeatPackTotal : 0;

    await tx.update(tenants)
      .set({ seatLimit, updatedAt: now })
      .where(eq(tenants.id, row.tenantId));
  });
  return row.tenantId;
}

export async function tenantHasActiveEntitlement(
  tenantId: string,
  entitlementKey: string,
): Promise<boolean> {
  const [row] = await db.select({ id: tenantEntitlements.id })
    .from(tenantEntitlements)
    .where(and(
      eq(tenantEntitlements.tenantId, tenantId),
      eq(tenantEntitlements.entitlementKey, entitlementKey),
      eq(tenantEntitlements.active, true),
    ))
    .limit(1);
  return !!row;
}

export async function isUserWithinTenantSeatLimit(
  tenantId: string,
  userId: string,
): Promise<boolean> {
  const [tenant] = await db.select({ seatLimit: tenants.seatLimit })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!tenant || tenant.seatLimit <= 0) return false;

  const members = await db.select({
    userId: tenantUsers.userId,
    role: tenantUsers.role,
    joinedAt: tenantUsers.joinedAt,
  })
    .from(tenantUsers)
    .where(eq(tenantUsers.tenantId, tenantId))
    .orderBy(asc(tenantUsers.joinedAt), asc(tenantUsers.id));

  const ordered = members.sort((a, b) => {
    const rank = (role: string) => role === 'owner' ? 0 : role === 'admin' || role === 'tenant_admin' ? 1 : 2;
    return rank(a.role) - rank(b.role) || a.joinedAt.getTime() - b.joinedAt.getTime();
  });
  return ordered.slice(0, tenant.seatLimit).some(member => member.userId === userId);
}

export function isCoreProductKey(value: string): value is CoreProductKey {
  return Object.prototype.hasOwnProperty.call(CORE_PRODUCTS_BY_KEY, value);
}
