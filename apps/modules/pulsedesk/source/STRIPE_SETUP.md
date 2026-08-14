# Stripe Setup for PulseDesk

> Deprecated legacy reference.
>
> PulseDesk no longer owns pricing, checkout, subscription management, seats, or
> Stripe webhooks. OperatorOS is the billing and entitlement authority for the
> PulseDesk module. The PulseDesk `/api/billing/*`, `/api/stripe/webhook`, and
> `/billing` paths are not active production paths. Keep this document only for
> historical rollback context.

The steps below describe the retired standalone Stripe model and should not be
used for current PulseDesk deployments.

---

## 1. Prerequisites

- A Stripe account (test mode for development, live mode for production)
- Stripe connected via the Replit Stripe integration (do not store secret keys as raw env vars)
- The app deployed and accessible at a public URL (e.g., `https://pulsedesk.replit.app`)

---

## 2. Create Products in Stripe Dashboard

Go to **Stripe Dashboard → Products → Add Product** and create the following four products **exactly** as listed. The `metadata.plan` key is what PulseDesk uses to recognize and activate the correct plan tier.

| Product Name         | Metadata key `plan` | Price (USD/month) |
|----------------------|---------------------|-------------------|
| PulseDesk Pro        | `pro`               | $60.00            |
| PulseDesk Pro Plus   | `pro_plus`          | $80.00            |
| PulseDesk Enterprise | `enterprise`        | $100.00           |
| PulseDesk Unlimited  | `unlimited`         | $200.00           |

**For each product:**
1. Click **Add product**
2. Set the **Name** exactly as shown above (must start with `PulseDesk`)
3. Under **Metadata**, add key `plan` with the value from the table above
4. Set **Pricing model** → Recurring → Monthly
5. Set the price in USD as shown
6. Click **Save product**

---

## 3. Note Price IDs

After creating each product and its monthly price, go to the product page and copy the **Price ID** (starts with `price_`). These are optional environment variables that allow future webhook verification:

```
STRIPE_PRICE_ID_PRO=price_xxxxx
STRIPE_PRICE_ID_PRO_PLUS=price_xxxxx
STRIPE_PRICE_ID_ENTERPRISE=price_xxxxx
STRIPE_PRICE_ID_UNLIMITED=price_xxxxx
```

Set these via Replit Secrets if you want price ID validation in addition to product metadata validation.

---

## 4. Configure the Customer Portal

Go to **Stripe Dashboard → Settings → Billing → Customer portal** and configure:

- Allow customers to **update their payment method**
- Allow customers to **cancel their subscription**
- Allow customers to **switch plans** (optional, for self-serve upgrades)
- Set the **Return URL** to: `https://YOUR_APP_DOMAIN/billing`

---

## 5. Register the Webhook

> **Note:** PulseDesk uses `stripe-replit-sync` which **auto-registers** a webhook endpoint automatically when the app starts. You generally do not need to create the webhook manually.

If you need to register it manually:

1. Go to **Stripe Dashboard → Developers → Webhooks → Add endpoint**
2. Set the **Endpoint URL** to: `https://YOUR_APP_DOMAIN/api/stripe/webhook`
3. Select the following events to listen for:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `checkout.session.completed`
4. Click **Add endpoint**
5. Note the **Signing secret** (starts with `whsec_`) — the Replit Stripe integration handles this automatically

---

## 6. Set APP_BASE_URL (Important for Redirects)

Set this environment variable in Replit Secrets so that Stripe checkout success/cancel redirects work correctly:

```
APP_BASE_URL=https://YOUR_APP_DOMAIN
```

For example: `APP_BASE_URL=https://pulsedesk.replit.app`

This is especially important for production deployments. In development, the app falls back to `REPLIT_DOMAINS` and then the request host.

---

## 7. Plan Feature Reference

| Plan       | Members | Entra SSO | Email-to-Ticket | Price  |
|------------|---------|-----------|-----------------|--------|
| Free       | 5       | No        | No              | $0/mo  |
| Pro        | 50      | Yes       | No              | $60/mo |
| Pro Plus   | 100     | Yes       | No              | $80/mo |
| Enterprise | 200     | Yes       | Yes             | $100/mo|
| Unlimited  | ∞       | Yes       | Yes             | $200/mo|

---

## 8. How Billing Works in PulseDesk

1. **Checkout**: Org admin clicks a plan card → POST `/api/billing/checkout` creates a Stripe Checkout Session with `allow_promotion_codes: true` (promo codes supported) and an idempotency key
2. **Webhook**: When Stripe fires `customer.subscription.updated` (or similar), POST `/api/stripe/webhook` → `stripe-replit-sync` verifies signature and writes to `stripe.*` tables → PulseDesk `billingSync.ts` immediately updates the org's plan, `subscriptionStatus`, `cancelAtPeriodEnd`, and `planExpiresAt`
3. **Status page**: When org admin visits `/billing`, `syncOrgPlanFromStripe()` runs as a lazy sync fallback to catch any missed events
4. **Admin panel**: Super admins can see all org billing state at `/admin` and trigger a manual sync per org

---

## 9. Go-Live Checklist

- [ ] All four PulseDesk products created in **live** Stripe mode with correct `metadata.plan` values
- [ ] Monthly prices set on each product
- [ ] Customer Portal configured with return URL
- [ ] Webhook registered (or auto-registered by stripe-replit-sync)
- [ ] `APP_BASE_URL` set to production URL in Replit Secrets
- [ ] App deployed in Replit production environment
- [ ] Test a checkout flow end-to-end (use Stripe test card `4242 4242 4242 4242`)
- [ ] Verify webhook fires and org plan updates in real-time
- [ ] Test cancellation flow via Customer Portal
