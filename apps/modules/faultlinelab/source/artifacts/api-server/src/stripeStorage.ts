import { sql } from 'drizzle-orm';
import { db } from '@workspace/db';

export class StripeStorage {
  async getProduct(productId: string) {
    const result = await db.execute(
      sql`SELECT * FROM stripe.products WHERE id = ${productId}`
    );
    return result.rows[0] || null;
  }

  async listProducts(active = true) {
    const result = await db.execute(
      sql`SELECT * FROM stripe.products WHERE active = ${active} ORDER BY id`
    );
    return result.rows;
  }

  async listProductsWithPrices(active = true) {
    const result = await db.execute(
      sql`
        SELECT
          p.id as product_id,
          p.name as product_name,
          p.description as product_description,
          p.active as product_active,
          p.metadata as product_metadata,
          pr.id as price_id,
          pr.unit_amount,
          pr.currency,
          pr.recurring,
          pr.active as price_active
        FROM stripe.products p
        LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
        WHERE p.active = ${active}
        ORDER BY p.id, pr.unit_amount
      `
    );
    return result.rows;
  }

  async getSubscription(subscriptionId: string) {
    const result = await db.execute(
      sql`SELECT * FROM stripe.subscriptions WHERE id = ${subscriptionId}`
    );
    return result.rows[0] || null;
  }

  async findChargeReceiptByPaymentIntent(paymentIntentId: string): Promise<string | null> {
    const result = await db.execute(
      sql`SELECT _raw_data->>'receipt_url' AS receipt_url
          FROM stripe.charges
          WHERE payment_intent = ${paymentIntentId}
            AND _raw_data->>'receipt_url' IS NOT NULL
          ORDER BY created DESC NULLS LAST
          LIMIT 1`
    );
    const row = result.rows[0] as { receipt_url?: string | null } | undefined;
    return row?.receipt_url ?? null;
  }

  async getPaymentIntentBySession(sessionId: string): Promise<string | null> {
    const result = await db.execute(
      sql`SELECT payment_intent
          FROM stripe.checkout_sessions
          WHERE id = ${sessionId}
          LIMIT 1`
    );
    const row = result.rows[0] as { payment_intent?: string | null } | undefined;
    return row?.payment_intent ?? null;
  }

  async listInvoicesByCustomer(customerId: string, limit = 10) {
    const result = await db.execute(
      sql`SELECT id, customer, subscription, status, total, currency, period_start, period_end, created, attrs
          FROM stripe.invoices
          WHERE customer = ${customerId}
          ORDER BY created DESC
          LIMIT ${limit}`
    );
    return result.rows;
  }
}

export const stripeStorage = new StripeStorage();
