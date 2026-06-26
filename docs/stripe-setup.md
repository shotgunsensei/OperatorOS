# Stripe Setup

OperatorOS uses Stripe Checkout Sessions in subscription mode. Create five
recurring monthly Prices in Stripe and set these deployment secrets:

```text
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_MODE=test        # "test" for the sandbox, "live" for production
STRIPE_PRICE_TRADEFLOWKIT_MONTHLY
STRIPE_PRICE_PULSEDESK_MONTHLY
STRIPE_PRICE_TECHDECK_MONTHLY
STRIPE_PRICE_COMPANION_MODULE_MONTHLY
STRIPE_PRICE_ADDITIONAL_SEAT_MONTHLY
```

Stripe is enabled whenever `STRIPE_SECRET_KEY` is present **and** `STRIPE_MODE`
is either `test` or `live`. Use a `sk_test_…` key with `STRIPE_MODE=test` to run
the full sandbox flow (checkout + webhooks), and a `sk_live_…` key with
`STRIPE_MODE=live` for production. Any other value (or a missing key) leaves
billing disabled: checkout returns `409 STRIPE_NOT_CONFIGURED` and the webhook
no-ops.

Suggested Stripe catalog:

- TradeFlowKit: $149/month
- PulseDesk: $149/month
- TechDeck: $99/month
- Companion Module: $29/month
- Additional Operator Seat: $15/month

The companion Price is reused with quantity equal to the number of paid
additional modules. Module keys are stored in Checkout and Subscription
metadata. The seat Price uses quantity equal to the number of additional seats.

Configure the webhook endpoint as:

```text
POST /v1/billing/webhook
```

Subscribe it to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid` **or** `invoice.payment_succeeded` (the API routes both to the
  same handler, so pick whichever you prefer — subscribing to both just delivers
  duplicate events that are idempotently ignored)
- `invoice.payment_failed`

For local testing, forward events with the Stripe CLI:

```text
stripe listen --forward-to localhost:5001/v1/billing/webhook
```

Use the `whsec_…` secret it prints as `STRIPE_WEBHOOK_SECRET`.

Checkout metadata includes `billing_model`, `tenant_id`, `user_id`,
`selected_core_product`, `selected_free_companion_module`,
`additional_module_keys`, and `additional_seats`. Webhooks are signature
verified against the raw request body and claimed idempotently by Stripe event
ID before entitlement mutations run.

## Cancellation behavior

When a core-product subscription is cancelled (`customer.subscription.deleted`),
only that subscription's entitlement rows are deactivated. The tenant seat limit
is then recomputed from what remains active:

- If the tenant still owns **another active core product**, its included apps
  stay enabled and the seat limit becomes the included base (5) plus any
  still-active additional seat packs.
- If **no active core product remains**, the seat limit collapses to 0.
