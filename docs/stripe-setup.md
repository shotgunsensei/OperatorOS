# Stripe Setup

OperatorOS uses Stripe Checkout Sessions in subscription mode. Create five
recurring monthly Prices in Stripe and set these deployment secrets:

```text
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_MODE=live
STRIPE_PRICE_TRADEFLOWKIT_MONTHLY
STRIPE_PRICE_PULSEDESK_MONTHLY
STRIPE_PRICE_TECHDECK_MONTHLY
STRIPE_PRICE_COMPANION_MODULE_MONTHLY
STRIPE_PRICE_ADDITIONAL_SEAT_MONTHLY
```

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
- `invoice.paid`
- `invoice.payment_failed`

Checkout metadata includes `tenant_id`, `user_id`,
`selected_core_product`, `selected_free_companion_module`,
`additional_module_keys`, and `additional_seats`. Webhooks are signature
verified against the raw request body and claimed idempotently by Stripe event
ID before entitlement mutations run.

