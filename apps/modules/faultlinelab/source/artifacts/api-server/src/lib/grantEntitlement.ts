import { randomUUID } from 'crypto';
import { db } from '@workspace/db';
import { userEntitlementsTable, purchasesTable } from '@workspace/db/schema';
import { and, eq } from 'drizzle-orm';
import { logger } from './logger';

export const PRODUCT_TYPE_MAP: Record<string, string> = {
  'pro-subscription': 'subscription',
  'pack-network-ops': 'content-pack',
  'pack-server-graveyard': 'content-pack',
  'pack-garage-diagnostics': 'content-pack',
  'pack-sensor-mesh': 'content-pack',
  'pack-mixed-cascades': 'content-pack',
  'pack-healthcare-imaging': 'content-pack',
  'upgrade-advanced-tools': 'feature-upgrade',
  'upgrade-chaos-mode': 'feature-upgrade',
  'upgrade-deep-telemetry': 'feature-upgrade',
  'upgrade-sandbox-pro': 'feature-upgrade',
  'upgrade-pro-analytics': 'feature-upgrade',
  'bundle-clinical-systems': 'bundle',
  'bundle-master-investigator': 'bundle',
};

export async function grantEntitlementFromCheckout(opts: {
  userId: string;
  productId: string;
  source: string;
  stripePaymentId?: string | null;
}) {
  const { userId, productId, source, stripePaymentId } = opts;
  const entitlementType = PRODUCT_TYPE_MAP[productId];
  if (!entitlementType) {
    logger.warn({ productId }, "[grant] unknown productId, skipping");
    return null;
  }

  const existing = await db
    .select()
    .from(userEntitlementsTable)
    .where(
      and(
        eq(userEntitlementsTable.userId, userId),
        eq(userEntitlementsTable.productId, productId),
        eq(userEntitlementsTable.isActive, true)
      )
    )
    .limit(1);

  if (existing.length > 0) return existing[0].id;

  const id = randomUUID();
  await db.insert(userEntitlementsTable).values({
    id,
    userId,
    productId,
    entitlementType,
    source,
    stripePaymentId: stripePaymentId || null,
    isActive: true,
  });
  return id;
}

export async function revokeEntitlement(opts: {
  userId: string;
  productId: string;
}): Promise<number> {
  const { userId, productId } = opts;
  const now = new Date();
  const rows = await db
    .update(userEntitlementsTable)
    .set({ isActive: false, revokedAt: now })
    .where(
      and(
        eq(userEntitlementsTable.userId, userId),
        eq(userEntitlementsTable.productId, productId),
        eq(userEntitlementsTable.isActive, true)
      )
    )
    .returning({ id: userEntitlementsTable.id });
  if (rows.length === 0) {
    logger.warn({ userId, productId }, '[revoke] no active entitlement found');
  }
  return rows.length;
}

export async function recordPurchase(opts: {
  userId: string;
  productId: string;
  stripeSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  amount?: number | null;
  currency?: string | null;
}) {
  if (opts.stripeSessionId) {
    const existing = await db
      .select()
      .from(purchasesTable)
      .where(eq(purchasesTable.stripeSessionId, opts.stripeSessionId))
      .limit(1);
    if (existing.length > 0) return;
  }
  await db.insert(purchasesTable).values({
    id: randomUUID(),
    userId: opts.userId,
    productId: opts.productId,
    stripeSessionId: opts.stripeSessionId || null,
    stripePaymentIntentId: opts.stripePaymentIntentId || null,
    amount: opts.amount ?? null,
    currency: opts.currency || 'usd',
    status: 'completed',
    fulfilledAt: new Date(),
  });
}
