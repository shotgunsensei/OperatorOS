# Stripe Setup

OperatorOS uses Stripe Checkout Sessions in subscription mode for one
tenant-owned flagship stack. Billing is monthly-only. The stack uses five
recurring monthly Prices; CallCommand capacity adds three recurring Prices and
Torque Assist adds three one-time credit-pack Prices. The complete eleven-SKU
matrix and acceptance gates are in
[the commercial launch record](ECOSYSTEM_COMMERCIAL_LAUNCH_2026-10-05.md).
Set these existing deployment secrets in the correct Stripe account/mode:

```text
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_MODE=test        # "test" for the sandbox, "live" for production
STRIPE_EXPECTED_ACCOUNT_ID
STRIPE_PRICE_TRADEFLOWKIT_MONTHLY
STRIPE_PRICE_PULSEDESK_MONTHLY
STRIPE_PRICE_TECHDECK_MONTHLY
STRIPE_PRICE_COMPANION_MODULE_MONTHLY
STRIPE_PRICE_ADDITIONAL_SEAT_MONTHLY
STRIPE_PRICE_CALLCOMMAND_CONCURRENT_LANE_MONTHLY
STRIPE_PRICE_CALLCOMMAND_ADDITIONAL_LOCAL_NUMBER_MONTHLY
STRIPE_PRICE_CALLCOMMAND_TOLL_FREE_NUMBER_MONTHLY
STRIPE_BILLING_PORTAL_CONFIGURATION_ID
```

Stripe is enabled whenever `STRIPE_SECRET_KEY` is present **and** `STRIPE_MODE`
is either `test` or `live`. Use a `sk_test_…` key with `STRIPE_MODE=test` to run
the full sandbox flow (checkout + webhooks), and a `sk_live_…` key with
`STRIPE_MODE=live` for production. Any other value (or a missing key) leaves
billing disabled: checkout fails closed and the webhook returns a non-2xx
response without applying billing or entitlement mutations.

Suggested Stripe catalog:

- TradeFlowKit: $149/month
- PulseDesk: $149/month
- TechDeck: $99/month
- Companion Module: $29/month
- Additional Operator Seat: $15/month
- CallCommand additional concurrent lane: $49/month
- CallCommand additional local number: $5/month
- CallCommand toll-free number: $8/month
- Torque Assist Roadside: 25,000 credits for $5 once
- Torque Assist Workshop: 100,000 credits for $15 once
- Torque Assist Fleet: 500,000 credits for $50 once

CallCommand retains its documented bounded amount overrides and separate
licensed quantities. Torque Assist uses its existing lookup-key catalog,
durable database mapping and exact-release purchase activation gate. Neither
an opened Checkout Session nor a configured Price grants paid capacity/credit.

From a trusted server environment, `corepack pnpm stripe:plan:ecosystem` lists
the full manifest and `corepack pnpm stripe:verify:ecosystem` performs a read-only
account/Price/Product/portal/webhook validation. Neither command creates or
changes provider resources. Validation never prints secret values and does not
replace completed hosted payment and signed settlement acceptance.

The selected flagship contributes one line item with quantity 1. The companion
Price is reused with quantity equal to the number of paid additional modules;
the one included companion contributes no Stripe line item. The seat Price uses
quantity equal to seats above the five included tenant seats. Module keys and
quantities are stored in Checkout and Subscription metadata and validated
against the server-owned catalog again when the signed webhook arrives.

Do not create annual variants, a separate Price per companion, a Price for a
free application, or an OutCall Price for this offer. Starter, Pro, Elite, and
legacy `STRIPE_PRICE_ADDON_*` Prices may remain in Stripe for existing customer
history, but no forward-sale route may create a Checkout Session from them.

OperatorOS does not treat a populated environment variable as proof that a
Price is safe. Before checkout and again before any webhook grants or preserves
stack access, the API retrieves every applicable Price from Stripe and requires
the exact configured ID, an active recurring Price, USD currency, one-month
recurrence, and the exact server-owned amount shown above. The subscription
must contain exactly those Price IDs and exact quantities—no missing, duplicate,
or extra line item is accepted. Platform readiness reports environment presence
and provider validation separately; production is ready only when both pass.

## Restrictive Billing Portal configuration

Create a dedicated Billing Portal configuration in the same Stripe mode/account
as `STRIPE_SECRET_KEY`, then set its `bpc_...` identifier as
`STRIPE_BILLING_PORTAL_CONFIGURATION_ID`. The configuration must be active and
must disable **subscription updates** and **subscription pausing**. In
particular, customers must not be able to switch Product/Price, add or remove a
subscription item, or change an item quantity in the portal. Payment-method,
invoice-history, and cancellation features may be enabled according to the
organization's reviewed support policy because signed subscription lifecycle
webhooks remain the authority for access.

OperatorOS retrieves and validates this configuration before creating every
portal session. A missing ID, inactive configuration, disabled provider access,
or enabled subscription-update/pause feature fails closed; the API does not
silently fall back to Stripe's default portal configuration. This repository
does not create or mutate the provider configuration because that is an
external Stripe account decision.

Configure the webhook endpoint as:

```text
POST /v1/billing/webhook
```

The full ecosystem audit requires the canonical event set below, covering
subscriptions, feature quantities and credit purchases/refunds/disputes:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_succeeded` (both are supported and replay-safe)
- `invoice.payment_failed`
- `payment_intent.payment_failed`
- `charge.refunded`
- `charge.dispute.created`
- `charge.dispute.closed`

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

The tenant owner is the normal billing actor. OperatorOS persists and reuses
the Stripe customer at tenant scope before redirecting to Checkout, binds the
completed subscription to that same tenant, and opens the Stripe customer
portal from the tenant billing record. Tenant administrators may inspect
billing state but cannot start checkout, change the included companion, or open
a mutation-capable portal. A tenant with an active flagship stack cannot buy a
second flagship through this release.

## Cancellation behavior

When a flagship subscription is cancelled
(`customer.subscription.deleted`), only that subscription's entitlement rows
are deactivated and its tenant billing record is moved to the terminal Stripe
state. The paid flagship and companions stop launching when provider-confirmed
access ends; the tenant's free applications remain available. The paid seat
limit collapses to 0 because the forward model permits one active flagship.

Cancellation code still handles multiple historical stack subscriptions
defensively so a grandfathered or previously inconsistent tenant does not lose
entitlements backed by another active Stripe subscription. That safety behavior
must not be interpreted as permission for new multi-flagship checkout.
