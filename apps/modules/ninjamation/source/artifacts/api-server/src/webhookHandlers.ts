import { getStripeSync, getUncachableStripeClient } from './stripeClient';
import { storage } from './storage';
import { logger } from './lib/logger';
import type Stripe from 'stripe';

const VALID_TIERS = new Set(['starter', 'pro', 'enterprise']);

function amountToTier(amount: number): string {
  if (amount >= 10000) return 'enterprise';
  if (amount >= 2000) return 'pro';
  return 'starter';
}

async function resolveTier(stripe: Stripe, priceId: string): Promise<string> {
  try {
    const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
    const product = price.product;
    if (typeof product === 'object' && product !== null && 'metadata' in product) {
      const metaTier = (product as Stripe.Product).metadata?.tier;
      if (metaTier && VALID_TIERS.has(metaTier)) {
        return metaTier;
      }
    }
    if (price.unit_amount) {
      return amountToTier(price.unit_amount);
    }
  } catch (err) {
    logger.warn({ priceId, error: err }, 'Failed to resolve tier from Stripe, falling back to starter');
  }

  return 'starter';
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  if (session.mode !== 'subscription' || !session.subscription || !session.customer) {
    return;
  }

  const customerId = typeof session.customer === 'string' ? session.customer : session.customer.id;
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;

  const user = await storage.getUserByStripeCustomerId(customerId);
  if (!user) {
    logger.warn({ customerId }, 'No user found for Stripe customer during checkout');
    return;
  }

  const stripe = await getUncachableStripeClient();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const priceId = subscription.items.data[0]?.price?.id;
  const tier = priceId ? await resolveTier(stripe, priceId) : 'starter';

  await storage.updateUserStripeInfo(user.id, {
    stripeSubscriptionId: subscriptionId,
    subscriptionTier: tier,
  });

  logger.info({ userId: user.id, tier, subscriptionId }, 'User subscription activated after checkout');
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  const user = await storage.getUserByStripeCustomerId(customerId);
  if (!user) return;

  const isActive = subscription.status === 'active' || subscription.status === 'trialing';

  if (isActive) {
    const stripe = await getUncachableStripeClient();
    const priceId = subscription.items.data[0]?.price?.id;
    const tier = priceId ? await resolveTier(stripe, priceId) : 'starter';

    await storage.updateUserStripeInfo(user.id, {
      stripeSubscriptionId: subscription.id,
      subscriptionTier: tier,
    });
    logger.info({ userId: user.id, tier }, 'Subscription updated');
  } else {
    await storage.updateUserStripeInfo(user.id, {
      stripeSubscriptionId: subscription.id,
      subscriptionTier: null,
    });
    logger.info({ userId: user.id, status: subscription.status }, 'Subscription deactivated');
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  const user = await storage.getUserByStripeCustomerId(customerId);
  if (!user) return;

  await storage.updateUserStripeInfo(user.id, {
    stripeSubscriptionId: null,
    subscriptionTier: null,
  });
  logger.info({ userId: user.id }, 'Subscription deleted');
}

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    const event = JSON.parse(payload.toString()) as Stripe.Event;

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
          break;
        case 'customer.subscription.updated':
          await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
          break;
        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;
      }
    } catch (err) {
      logger.error({ error: err, eventType: event.type }, 'Error processing webhook event for user update');
    }
  }
}
