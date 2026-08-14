import { Router, type IRouter } from 'express';
import { requireAuth } from '../middlewares/requireAuth';
import { getUncachableStripeClient } from '../stripeClient';
import { stripeStorage } from '../stripeStorage';
import { db } from '@workspace/db';
import { usersTable, purchasesTable } from '@workspace/db/schema';
import { eq, sql, desc } from 'drizzle-orm';

const router: IRouter = Router();

router.get('/products', async (_req, res) => {
  try {
    const rows = await stripeStorage.listProductsWithPrices();
    const productsMap = new Map();
    for (const row of rows) {
      if (!productsMap.has(row.product_id)) {
        productsMap.set(row.product_id, {
          id: row.product_id,
          name: row.product_name,
          description: row.product_description,
          active: row.product_active,
          metadata: row.product_metadata,
          prices: []
        });
      }
      if (row.price_id) {
        productsMap.get(row.product_id).prices.push({
          id: row.price_id,
          unit_amount: row.unit_amount,
          currency: row.currency,
          recurring: row.recurring,
          active: row.price_active,
        });
      }
    }
    res.json({ data: Array.from(productsMap.values()) });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to list products' });
  }
});

// NOTE: A previous /checkout endpoint accepted a client-supplied priceId and
// passed it directly to Stripe — a price-tampering vector (a user could
// substitute any active Stripe Price ID, including a $0.01 promo). It was
// never wired up on the client. Removed in favor of /checkout-by-catalog,
// which resolves the price server-side from a trusted catalog id.

router.post('/checkout-by-catalog', requireAuth, async (req: any, res): Promise<void> => {
  try {
    const { catalogProductId, interval } = req.body || {};
    if (!catalogProductId || typeof catalogProductId !== 'string') {
      res.status(400).json({ error: 'catalogProductId required' });
      return;
    }
    if (interval && interval !== 'month' && interval !== 'year') {
      res.status(400).json({ error: 'interval must be month or year' });
      return;
    }

    const userId = req.userId as string;
    const stripe = await getUncachableStripeClient();

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) {
      res.status(500).json({ error: 'Failed to resolve user' });
      return;
    }
    const clerkId = user.clerkId ?? user.operatorIdentityId ?? user.id;

    const productRows = await db.execute(
      sql`SELECT id FROM stripe.products
          WHERE active = true
            AND metadata->>'catalogId' = ${catalogProductId}
          LIMIT 1`
    );
    const stripeProductId = productRows.rows[0]?.id as string | undefined;
    if (!stripeProductId) {
      res.status(404).json({ error: 'Product not configured in Stripe' });
      return;
    }

    const priceRows = await db.execute(
      sql`SELECT id, unit_amount, currency, recurring
          FROM stripe.prices
          WHERE product = ${stripeProductId} AND active = true`
    );
    const prices = priceRows.rows as Array<{
      id: string;
      unit_amount: number | null;
      currency: string;
      recurring: any;
    }>;
    if (prices.length === 0) {
      res.status(404).json({ error: 'No active prices for product' });
      return;
    }

    let chosen = prices.find((p) => {
      const r = p.recurring;
      const intervalVal = typeof r === 'string' ? JSON.parse(r)?.interval : r?.interval;
      if (interval === 'year') return intervalVal === 'year';
      if (interval === 'month') return intervalVal === 'month';
      return !r;
    });
    if (!chosen) chosen = prices[0];

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { userId: user.id, clerkId },
      });
      customerId = customer.id;
      await db.update(usersTable).set({ stripeCustomerId: customerId }).where(eq(usersTable.id, user.id));
    }

    const baseUrl = `https://${process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS?.split(',')[0] || 'localhost'}`;
    const recurringRaw = chosen.recurring;
    const recurringObj = typeof recurringRaw === 'string' ? JSON.parse(recurringRaw) : recurringRaw;
    const mode = recurringObj ? 'subscription' : 'payment';

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: chosen.id, quantity: 1 }],
      mode,
      success_url: `${baseUrl}/?checkout=success&product=${encodeURIComponent(catalogProductId)}`,
      cancel_url: `${baseUrl}/?checkout=cancel`,
      metadata: { userId: user.id, clerkId, catalogProductId, interval: interval || '' },
      ...(mode === 'subscription'
        ? { subscription_data: { metadata: { userId: user.id, clerkId, catalogProductId, interval: interval || '' } } }
        : { payment_intent_data: { metadata: { userId: user.id, clerkId, catalogProductId, interval: interval || '' } } }),
    });

    res.json({ url: session.url, id: session.id });
  } catch (err: any) {
    req.log.error({ err }, 'checkout-by-catalog error');
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

router.post('/portal-session', requireAuth, async (req: any, res): Promise<void> => {
  try {
    const userId = req.userId as string;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user?.stripeCustomerId) {
      res.status(400).json({ error: 'No Stripe customer on file. Make a purchase first.' });
      return;
    }

    const stripe = await getUncachableStripeClient();
    const baseUrl = `https://${process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS?.split(',')[0] || 'localhost'}`;

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${baseUrl}/?account=return`,
    });

    res.json({ url: session.url });
  } catch (err: any) {
    console.error('portal-session error:', err.message);
    res.status(500).json({ error: 'Failed to create billing portal session' });
  }
});

async function resolveReceiptUrl(
  p: typeof purchasesTable.$inferSelect,
  log: { warn: (...args: any[]) => void },
): Promise<string | null> {
  let paymentIntentId = p.stripePaymentIntentId;
  if (!paymentIntentId && p.stripeSessionId) {
    try {
      paymentIntentId = await stripeStorage.getPaymentIntentBySession(p.stripeSessionId);
    } catch (err) {
      log.warn({ err, sessionId: p.stripeSessionId }, 'getPaymentIntentBySession failed');
    }
  }
  if (paymentIntentId) {
    try {
      const fromMirror = await stripeStorage.findChargeReceiptByPaymentIntent(paymentIntentId);
      if (fromMirror) return fromMirror;
    } catch (err) {
      log.warn({ err, paymentIntentId }, 'findChargeReceiptByPaymentIntent failed');
    }
  }
  // Fall back to live Stripe API (mirror may be behind on a fresh purchase).
  try {
    const stripe = await getUncachableStripeClient();
    if (paymentIntentId) {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ['latest_charge'],
      });
      const charge = pi.latest_charge;
      if (charge && typeof charge !== 'string' && charge.receipt_url) {
        return charge.receipt_url;
      }
    } else if (p.stripeSessionId) {
      const session = await stripe.checkout.sessions.retrieve(p.stripeSessionId, {
        expand: ['payment_intent.latest_charge'],
      });
      const pi = session.payment_intent;
      if (pi && typeof pi !== 'string') {
        const charge = pi.latest_charge;
        if (charge && typeof charge !== 'string' && charge.receipt_url) {
          return charge.receipt_url;
        }
      }
    }
  } catch (err) {
    log.warn({ err, purchaseId: p.id }, 'stripe receipt lookup failed');
  }
  return null;
}

type BillingHistoryEntry = {
  kind: 'invoice' | 'purchase';
  id: string;
  productId: string | null;
  amount: number | null;
  currency: string | null;
  status: string | null;
  createdAt: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
  number: string | null;
};

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function asNumberOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function extractAttrField(attrs: unknown, key: string): string | null {
  if (attrs !== null && typeof attrs === 'object' && key in (attrs as Record<string, unknown>)) {
    return asString((attrs as Record<string, unknown>)[key]);
  }
  return null;
}

function coerceCreatedAt(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) {
    const ms = v > 1e12 ? v : v * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

router.get('/invoices', requireAuth, async (req: any, res): Promise<void> => {
  try {
    const userId = req.userId as string;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));

    const purchases = await db
      .select()
      .from(purchasesTable)
      .where(eq(purchasesTable.userId, userId))
      .orderBy(desc(purchasesTable.createdAt))
      .limit(20);

    const enrichedPurchases = await Promise.all(
      purchases.map(async (p) => {
        if (p.receiptUrl) return p;
        const receiptUrl = await resolveReceiptUrl(p, req.log);
        if (!receiptUrl) return p;
        try {
          await db
            .update(purchasesTable)
            .set({ receiptUrl })
            .where(eq(purchasesTable.id, p.id));
        } catch (err) {
          req.log.warn({ err, purchaseId: p.id }, 'failed to cache receipt url');
        }
        return { ...p, receiptUrl };
      }),
    );

    const purchaseHistory: BillingHistoryEntry[] = enrichedPurchases.map((p) => ({
      kind: 'purchase',
      id: p.id,
      productId: p.productId,
      amount: p.amount ?? null,
      currency: p.currency ?? null,
      status: p.status,
      createdAt: (p.fulfilledAt ?? p.createdAt)?.toISOString() ?? null,
      hostedInvoiceUrl: p.receiptUrl ?? null,
      invoicePdf: null,
      number: null,
    }));

    let invoiceHistory: BillingHistoryEntry[] = [];

    if (user?.stripeCustomerId) {
      try {
        const rows = await stripeStorage.listInvoicesByCustomer(user.stripeCustomerId, 10);
        invoiceHistory = rows.map((row): BillingHistoryEntry => {
          const r = row as Record<string, unknown>;
          const rawAttrs = r.attrs;
          const attrs: unknown =
            typeof rawAttrs === 'string' ? safeJsonParse(rawAttrs) : (rawAttrs ?? null);
          return {
            kind: 'invoice',
            id: String(r.id ?? ''),
            productId: null,
            amount: asNumberOrNull(r.total),
            currency: asString(r.currency),
            status: asString(r.status),
            createdAt: coerceCreatedAt(r.created),
            hostedInvoiceUrl: extractAttrField(attrs, 'hosted_invoice_url'),
            invoicePdf: extractAttrField(attrs, 'invoice_pdf'),
            number: extractAttrField(attrs, 'number'),
          };
        });
      } catch (err) {
        req.log.warn({ err }, 'listInvoicesByCustomer failed');
      }
    }

    const merged = [...invoiceHistory, ...purchaseHistory]
      .filter((entry) => entry.createdAt !== null)
      .sort((a, b) => {
        const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
        const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
        return tb - ta;
      })
      .slice(0, 10);

    res.json({ history: merged });
  } catch (err) {
    req.log.error({ err }, 'invoices endpoint error');
    res.status(500).json({ error: 'Failed to list invoices' });
  }
});

router.get('/subscription', requireAuth, async (req: any, res): Promise<void> => {
  try {
    const userId = req.userId as string;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));

    if (!user?.stripeSubscriptionId) {
      res.json({ subscription: null });
      return;
    }

    const subscription = await stripeStorage.getSubscription(user.stripeSubscriptionId);
    res.json({ subscription });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to get subscription' });
  }
});

export default router;
