import { db } from '../db';
import { orgs } from '@shared/schema';
import type { Org } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { storage } from '../storage';
import { getAllowedPlanMetaKeys } from '../config/billingConfig';
import { getUncachableStripeClient } from '../stripeClient';

type OrgPlan = Org['plan'];

export async function syncOrgFromStripeEvent(event: any): Promise<void> {
  const eventId: string = event.id;
  const eventType: string = event.type;
  const eventCreated: number = event.created;

  if (!eventId || !eventType) return;

  const obj = event.data?.object;
  let customerId: string | null = null;

  if (
    eventType.startsWith('customer.subscription') ||
    eventType.startsWith('invoice')
  ) {
    customerId = obj?.customer ?? null;
  }

  if (!customerId) return;

  const [org] = await db.select().from(orgs).where(eq(orgs.stripeCustomerId, customerId));
  if (!org) {
    console.log(`[billingSync] No org found for Stripe customer ${customerId} (event: ${eventId})`);
    return;
  }

  if (org.lastStripeEventId === eventId) {
    console.log(`[billingSync] Event ${eventId} already processed for org ${org.id} — skipping (exact match)`);
    return;
  }

  if (org.lastStripeEventCreated && eventCreated < org.lastStripeEventCreated) {
    console.log(`[billingSync] Event ${eventId} (created=${eventCreated}) is older than last processed event (created=${org.lastStripeEventCreated}) for org ${org.id} — skipping`);
    return;
  }

  const update: Partial<Org> & { lastStripeEventId: string; lastStripeEventCreated: number } = {
    lastStripeEventId: eventId,
    lastStripeEventCreated: eventCreated,
  };

  if (eventType === 'customer.subscription.created' || eventType === 'customer.subscription.updated') {
    const sub = obj;
    update.stripeSubscriptionId = sub?.id ?? null;
    update.subscriptionStatus = sub?.status ?? null;
    update.cancelAtPeriodEnd = sub?.cancel_at_period_end ?? false;
    update.planExpiresAt = sub?.current_period_end ? new Date(sub.current_period_end * 1000) : null;

    const priceId: string | undefined = sub?.items?.data?.[0]?.price?.id;
    if (priceId) {
      const planKey = await resolvePlanFromPriceId(priceId);
      if (planKey && (sub?.status === 'active' || sub?.status === 'trialing')) {
        update.plan = planKey as OrgPlan;
      } else if (sub?.status === 'canceled' || sub?.status === 'unpaid') {
        update.plan = 'free';
      }
    }
  } else if (eventType === 'customer.subscription.deleted') {
    update.plan = 'free';
    update.stripeSubscriptionId = null;
    update.planExpiresAt = null;
    update.subscriptionStatus = 'canceled';
    update.cancelAtPeriodEnd = false;
  } else if (eventType === 'invoice.paid') {
    const invoiceSubId: string | undefined = obj?.subscription;
    if (invoiceSubId && org.stripeSubscriptionId === invoiceSubId) {
      update.subscriptionStatus = 'active';
    }
  } else if (eventType === 'invoice.payment_failed') {
    const invoiceSubId: string | undefined = obj?.subscription;
    if (invoiceSubId && org.stripeSubscriptionId === invoiceSubId) {
      update.subscriptionStatus = 'past_due';
    }
  } else {
    return;
  }

  await storage.updateOrg(org.id, update);
  console.log(`[billingSync] Synced org ${org.id} (${org.slug}) from Stripe event ${eventType} (${eventId})`);
}

async function resolvePlanFromPriceId(priceId: string): Promise<string | null> {
  const allowedKeys = getAllowedPlanMetaKeys();

  try {
    const result = await db.execute(sql`
      SELECT p.metadata as product_metadata
      FROM stripe.prices pr
      JOIN stripe.products p ON pr.product = p.id
      WHERE pr.id = ${priceId}
      LIMIT 1
    `);
    if (result.rows.length > 0) {
      const row = result.rows[0] as any;
      const meta = typeof row.product_metadata === 'string'
        ? JSON.parse(row.product_metadata)
        : row.product_metadata;
      const planKey: string | undefined = meta?.plan;
      if (planKey && allowedKeys.includes(planKey)) return planKey;
    }
  } catch { }

  try {
    const stripe = await getUncachableStripeClient();
    const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
    const product = price.product as any;
    const planKey: string | undefined = product?.metadata?.plan;
    if (planKey && allowedKeys.includes(planKey)) return planKey;
  } catch { }

  return null;
}
