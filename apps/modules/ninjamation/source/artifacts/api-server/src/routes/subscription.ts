import { Router, type IRouter } from "express";
import { storage } from "../storage";
import { stripeService } from "../stripeService";
import { getStripePublishableKey } from "../stripeClient";
import {
  GetSubscriptionStatusResponse,
  CreateCheckoutSessionBody,
  CreateCheckoutSessionResponse,
  CreatePortalSessionResponse,
  GetSubscriptionPlansResponse,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/subscription/status", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const user = await storage.getUser(req.user.id);
    if (!user) {
      const data = GetSubscriptionStatusResponse.parse({
        hasSubscription: false,
        tier: null,
        status: null,
        currentPeriodEnd: null,
        stripeCustomerId: null,
      });
      res.json(data);
      return;
    }

    if (user.subscriptionTier && !user.stripeSubscriptionId) {
      const data = GetSubscriptionStatusResponse.parse({
        hasSubscription: true,
        tier: user.subscriptionTier,
        status: 'active',
        currentPeriodEnd: null,
        stripeCustomerId: user.stripeCustomerId || null,
      });
      res.json(data);
      return;
    }

    if (!user.stripeSubscriptionId) {
      const data = GetSubscriptionStatusResponse.parse({
        hasSubscription: false,
        tier: null,
        status: null,
        currentPeriodEnd: null,
        stripeCustomerId: user.stripeCustomerId || null,
      });
      res.json(data);
      return;
    }

    let subscription: any = null;
    let isActive = false;
    try {
      subscription = await storage.getSubscription(user.stripeSubscriptionId);
      isActive = subscription?.status === 'active' || subscription?.status === 'trialing';
    } catch {
      logger.warn({ userId: user.id }, "Could not query stripe.subscriptions, falling back to tier field");
    }

    const data = GetSubscriptionStatusResponse.parse({
      hasSubscription: isActive || !!user.subscriptionTier,
      tier: user.subscriptionTier || (isActive ? 'starter' : null),
      status: subscription?.status || (user.subscriptionTier ? 'active' : null),
      currentPeriodEnd: subscription?.current_period_end ? new Date(Number(subscription.current_period_end) * 1000).toISOString() : null,
      stripeCustomerId: user.stripeCustomerId || null,
    });
    res.json(data);
  } catch (err) {
    req.log.error({ error: err }, "Failed to get subscription status");
    res.status(500).json({ error: "Failed to get subscription status" });
  }
});

router.post("/subscription/checkout", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const { priceId } = CreateCheckoutSessionBody.parse(req.body);
    const user = await storage.getUser(req.user.id);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripeService.createCustomer(user.email || '', user.id);
      await storage.updateUserStripeInfo(user.id, { stripeCustomerId: customer.id });
      customerId = customer.id;
    }

    const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
    const session = await stripeService.createCheckoutSession(
      customerId,
      priceId,
      `${baseUrl}/checkout/success`,
      `${baseUrl}/pricing`
    );

    const data = CreateCheckoutSessionResponse.parse({ url: session.url });
    res.json(data);
  } catch (err) {
    req.log.error({ error: err }, "Failed to create checkout session");
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

router.post("/subscription/portal", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const user = await storage.getUser(req.user.id);
    if (!user?.stripeCustomerId) {
      res.status(400).json({ error: "No Stripe customer found" });
      return;
    }

    const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
    const session = await stripeService.createCustomerPortalSession(
      user.stripeCustomerId,
      `${baseUrl}/account`
    );

    const data = CreatePortalSessionResponse.parse({ url: session.url });
    res.json(data);
  } catch (err) {
    req.log.error({ error: err }, "Failed to create portal session");
    res.status(500).json({ error: "Failed to create portal session" });
  }
});

interface ProductPrice {
  id: string;
  unit_amount: number;
  currency: string;
  recurring: string | { interval?: string } | null;
}

interface ProductWithPrices {
  id: string;
  name: string;
  description: string;
  metadata: string | Record<string, string> | null;
  prices: ProductPrice[];
}

const VALID_TIERS = new Set(['starter', 'pro', 'enterprise']);

function getProductTier(metadata: string | Record<string, string> | null): string | null {
  try {
    const parsed = typeof metadata === 'string' ? JSON.parse(metadata) as Record<string, string> : (metadata || {});
    const tier = parsed.tier;
    return tier && VALID_TIERS.has(tier) ? tier : null;
  } catch {
    return null;
  }
}

function parsePlan(product: ProductWithPrices) {
  const monthlyPrice = product.prices.find((pr) => {
    const recurring = typeof pr.recurring === 'string' ? JSON.parse(pr.recurring) : pr.recurring;
    return recurring?.interval === 'month';
  });

  const metadata = typeof product.metadata === 'string'
    ? (JSON.parse(product.metadata) as Record<string, string>)
    : (product.metadata || {});
  const features = metadata.features ? metadata.features.split(',').map((f: string) => f.trim()) : [];

  return {
    id: product.id,
    name: product.name || 'Plan',
    description: product.description || '',
    priceId: monthlyPrice?.id || '',
    amount: monthlyPrice?.unit_amount || 0,
    interval: 'month',
    features,
  };
}

router.get("/subscription/plans", async (_req, res) => {
  res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  try {
    let dbRows: Awaited<ReturnType<typeof storage.listProductsWithPrices>> = [];
    try {
      dbRows = await storage.listProductsWithPrices();
    } catch (dbErr) {
      logger.warn({ error: dbErr }, "DB query for plans failed, falling back to Stripe API");
    }

    if (dbRows.length > 0) {
      const productsMap = new Map<string, ProductWithPrices>();
      for (const row of dbRows) {
        const productId = row.product_id as string;
        if (!productsMap.has(productId)) {
          productsMap.set(productId, {
            id: productId,
            name: row.product_name as string,
            description: (row.product_description as string) || '',
            metadata: row.product_metadata as string | Record<string, string> | null,
            prices: [],
          });
        }
        if (row.price_id) {
          productsMap.get(productId)!.prices.push({
            id: row.price_id as string,
            unit_amount: row.unit_amount as number,
            currency: row.currency as string,
            recurring: row.recurring as string | { interval?: string } | null,
          });
        }
      }

      const plans = Array.from(productsMap.values())
        .filter(p => getProductTier(p.metadata) !== null)
        .map(parsePlan)
        .sort((a, b) => a.amount - b.amount);
      const data = GetSubscriptionPlansResponse.parse({ plans });
      res.json(data);
      return;
    }

    let plans: Array<{ id: string; name: string; description: string; priceId: string; amount: number; interval: string; features: string[] }> = [];

    try {
      const { getUncachableStripeClient } = await import("../stripeClient");
      const stripe = await getUncachableStripeClient();
      const products = await stripe.products.list({ active: true, limit: 10 });
      const prices = await stripe.prices.list({ active: true, limit: 20 });

      logger.info({ productCount: products.data.length, priceCount: prices.data.length, productNames: products.data.map(p => ({ name: p.name, tier: p.metadata?.tier })) }, "Stripe API returned products");

      plans = products.data
        .filter(product => {
          const tier = product.metadata?.tier;
          return tier && VALID_TIERS.has(tier);
        })
        .map((product) => {
          const productPrices = prices.data.filter(
            (p) => (typeof p.product === 'string' ? p.product : p.product) === product.id && p.recurring?.interval === 'month'
          );
          const monthlyPrice = productPrices[0];
          const metadata = product.metadata || {};
          const features = metadata.features ? metadata.features.split(',').map((f: string) => f.trim()) : [];

          return {
            id: product.id,
            name: product.name,
            description: product.description || '',
            priceId: monthlyPrice?.id || '',
            amount: monthlyPrice?.unit_amount || 0,
            interval: 'month',
            features,
          };
        })
        .sort((a, b) => a.amount - b.amount);
    } catch (stripeErr) {
      logger.warn({ error: stripeErr }, "Stripe API call failed");
    }

    if (plans.length === 0) {
      logger.warn("No plans from Stripe API, using hardcoded fallback");
      plans = [
        {
          id: 'starter',
          name: 'Starter',
          description: 'Perfect for individuals getting started with automation.',
          priceId: '',
          amount: 1000,
          interval: 'month',
          features: ['Access to Script Library', 'Up to 10 scripts/month', 'Community support', 'Basic automation tools'],
        },
        {
          id: 'pro',
          name: 'Pro',
          description: 'For power users who need AI-generated scripts and more.',
          priceId: '',
          amount: 2000,
          interval: 'month',
          features: ['Everything in Starter', 'AI Script Generation', 'Unlimited scripts', 'Priority support', 'Advanced automation'],
        },
        {
          id: 'enterprise',
          name: 'Enterprise',
          description: 'Full platform access for teams and businesses.',
          priceId: '',
          amount: 10000,
          interval: 'month',
          features: ['Everything in Pro', 'Custom script development', 'Dedicated account manager', 'SLA guarantee', 'Team collaboration', 'API access'],
        },
      ];
    }

    const data = GetSubscriptionPlansResponse.parse({ plans });
    res.json(data);
  } catch (err) {
    logger.error({ error: err }, "Failed to get plans");
    res.status(500).json({ error: "Failed to get subscription plans" });
  }
});

export default router;
