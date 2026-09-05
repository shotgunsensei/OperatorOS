import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import {
  COMPANION_MODULE_KEYS,
  CORE_PRODUCTS_BY_KEY,
  INCLUDED_SEATS,
  FREE_WITH_ANY_ACCOUNT,
  normalizeStackSelection,
  type CompanionModuleKey,
  type CoreProductKey,
  type StackSelection,
} from '@operatoros/sdk';
import { db } from '../db.js';
import { tenantApplicationSubscriptions, tenantEntitlements, tenants, tenantUsers } from '../schema.js';

export interface GrantStackInput extends StackSelection {
  tenantId: string;
  stripeSubscriptionId: string;
  corePriceId?: string | null;
  companionPriceId?: string | null;
  additionalSeatPriceId?: string | null;
  /** When supplied by the webhook path, activation is committed atomically with every entitlement row. */
  applicationSubscriptionId?: string;
  applicationSubscriptionStatus?: 'trialing' | 'active' | 'canceling';
  cancelAtPeriodEnd?: boolean;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
}

export class ProductEntitlementConflictError extends Error {
  code = 'STACK_FLAGSHIP_LIMIT' as const;
  httpStatus = 409 as const;
  constructor(message = 'This tenant already has its release flagship application.') {
    super(message);
    this.name = 'ProductEntitlementConflictError';
  }
}

const APPLICATION_STACK_ACCESS_STATUSES = ['trialing', 'active', 'past_due', 'canceling'] as const;

function isPostgresUndefinedTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; cause?: { code?: unknown } };
  return candidate.code === '42P01' || candidate.cause?.code === '42P01';
}

/**
 * Return whether a tenant's active Application Stack owns this companion.
 *
 * The base tenant-entitlement key alone is not enough to identify the new
 * commercial model because grandfathered add-ons and manual grants can use
 * the same key. Requiring the exact tenant + Stripe subscription linkage to
 * the tenant-owned stack row keeps legacy tiers intact and prevents a client
 * or an unrelated entitlement row from promoting the application's tier.
 */
export async function tenantHasActiveApplicationStackCompanion(
  tenantId: string,
  moduleKey: CompanionModuleKey,
): Promise<boolean> {
  if (!COMPANION_MODULE_KEYS.has(moduleKey)) return false;
  try {
    const [row] = await db.select({ id: tenantEntitlements.id })
      .from(tenantEntitlements)
      .innerJoin(
        tenantApplicationSubscriptions,
        and(
          eq(tenantApplicationSubscriptions.tenantId, tenantEntitlements.tenantId),
          eq(tenantApplicationSubscriptions.stripeSubscriptionId, tenantEntitlements.stripeSubscriptionId),
        ),
      )
      .where(and(
        eq(tenantEntitlements.tenantId, tenantId),
        eq(tenantEntitlements.entitlementKey, moduleKey),
        eq(tenantEntitlements.entitlementType, 'companion_module'),
        eq(tenantEntitlements.active, true),
        inArray(tenantEntitlements.source, ['stripe', 'selected_free_companion']),
        inArray(tenantApplicationSubscriptions.status, APPLICATION_STACK_ACCESS_STATUSES),
      ))
      .limit(1);

    return !!row;
  } catch (error) {
    // Before release v60 exists, an Application Stack cannot be active. This
    // exact missing-table case therefore denies the paid tier safely while
    // preserving legacy-suite bootstraps. Every other database error escapes.
    if (isPostgresUndefinedTable(error)) return false;
    throw error;
  }
}

export async function grantStackEntitlements(input: GrantStackInput): Promise<void> {
  const normalized = normalizeStackSelection(input);
  const seatLimit = INCLUDED_SEATS + (normalized.additionalSeats ?? 0);
  const now = new Date();

  await db.transaction(async tx => {
    const [otherCore] = await tx.select({
      id: tenantEntitlements.id,
      stripeSubscriptionId: tenantEntitlements.stripeSubscriptionId,
    }).from(tenantEntitlements)
      .where(and(
        eq(tenantEntitlements.tenantId, input.tenantId),
        eq(tenantEntitlements.entitlementType, 'core_product'),
        eq(tenantEntitlements.active, true),
      ))
      .limit(1);
    if (otherCore && otherCore.stripeSubscriptionId !== input.stripeSubscriptionId) {
      throw new ProductEntitlementConflictError();
    }

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
      FREE_WITH_ANY_ACCOUNT.map(app => ({
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
        metadata: sql`COALESCE(${tenants.metadata}, '{}'::jsonb) || ${JSON.stringify({
          pricingModel: 'core_product_stack',
          coreProduct: normalized.coreProduct,
          freeCompanionModule: normalized.freeCompanionModule,
          additionalModules: normalized.additionalModules ?? [],
          additionalSeats: normalized.additionalSeats ?? 0,
        })}::jsonb`,
        updatedAt: now,
      })
      .where(eq(tenants.id, input.tenantId));

    if (input.applicationSubscriptionId) {
      const [activated] = await tx.update(tenantApplicationSubscriptions)
        .set({
          status: input.applicationSubscriptionStatus ?? 'active',
          stripeSubscriptionId: input.stripeSubscriptionId,
          currentPeriodStart: input.currentPeriodStart ?? now,
          currentPeriodEnd: input.currentPeriodEnd ?? null,
          cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
          updatedAt: now,
        })
        .where(and(
          eq(tenantApplicationSubscriptions.id, input.applicationSubscriptionId),
          eq(tenantApplicationSubscriptions.tenantId, input.tenantId),
          eq(tenantApplicationSubscriptions.status, 'incomplete'),
        ))
        .returning({ id: tenantApplicationSubscriptions.id });
      if (!activated) {
        throw new ProductEntitlementConflictError(
          'The Application Stack checkout intent was already settled or is no longer activatable.',
        );
      }
    }
  });
}

export async function changeFreeCompanionModule(
  tenantId: string,
  moduleKey: CompanionModuleKey,
  additionalModules?: readonly CompanionModuleKey[],
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
    const [stack] = await tx.select().from(tenantApplicationSubscriptions)
      .where(eq(tenantApplicationSubscriptions.tenantId, tenantId)).limit(1);
    if (!stack) throw new Error('Application stack billing record not found');
    const nextAdditionalModules = additionalModules ?? stack.additionalModuleKeys as CompanionModuleKey[];
    const oldIncluded = stack.includedCompanionKey as CompanionModuleKey;
    const paidSwap = nextAdditionalModules.includes(oldIncluded)
      && stack.additionalModuleKeys.includes(moduleKey);
    if (paidSwap) {
      const [paidRow] = await tx.select().from(tenantEntitlements)
        .where(and(
          eq(tenantEntitlements.tenantId, tenantId),
          eq(tenantEntitlements.entitlementKey, moduleKey),
          eq(tenantEntitlements.source, 'stripe'),
          eq(tenantEntitlements.stripeSubscriptionId, core.stripeSubscriptionId!),
          eq(tenantEntitlements.active, true),
        )).limit(1);
      await tx.update(tenantEntitlements)
        .set({ active: false, updatedAt: new Date() })
        .where(and(
          eq(tenantEntitlements.tenantId, tenantId),
          eq(tenantEntitlements.entitlementKey, moduleKey),
          eq(tenantEntitlements.source, 'stripe'),
          eq(tenantEntitlements.stripeSubscriptionId, core.stripeSubscriptionId!),
          eq(tenantEntitlements.active, true),
        ));
      await tx.insert(tenantEntitlements).values({
        tenantId,
        entitlementKey: oldIncluded,
        entitlementType: 'companion_module',
        source: 'stripe',
        stripeSubscriptionId: core.stripeSubscriptionId,
        stripePriceId: paidRow?.stripePriceId ?? stack.companionPriceId,
        metadata: paidRow?.metadata ?? { monthlyPriceCents: 2900, swappedFromIncluded: true },
      });
    }
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
    await tx.update(tenantApplicationSubscriptions)
      .set({
        includedCompanionKey: moduleKey,
        additionalModuleKeys: [...nextAdditionalModules],
        updatedAt: new Date(),
      })
      .where(and(
        eq(tenantApplicationSubscriptions.tenantId, tenantId),
        eq(tenantApplicationSubscriptions.stripeSubscriptionId, core.stripeSubscriptionId!),
      ));
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
