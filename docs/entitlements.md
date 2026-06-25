# Tenant Entitlements

Paid app access is tenant-scoped and app/module based. The
`tenant_entitlements` table stores:

- `tenant_id`
- `entitlement_key`
- `entitlement_type`
- `source`
- `active`
- `stripe_subscription_id`
- `stripe_price_id`
- `metadata`
- timestamps

Supported types are `core_product`, `included_app`, `companion_module`,
`seat_pack`, and `system`. Supported sources are `stripe`,
`included_with_core`, `selected_free_companion`, `manual`, and `admin`.

Activating a core product writes one core entitlement, the three included-app
entitlements, exactly one free companion entitlement, optional paid companion
entitlements, and an optional seat-pack entitlement. It also updates
`tenants.seat_limit` to 5 plus purchased additional seats.

Only one active `selected_free_companion` row is allowed per Stripe core
subscription. Changing the selection deactivates the previous row and creates a
new auditable row.

Cancellation deactivates every entitlement tied to the Stripe subscription and
resets paid seat capacity. OperatorOS itself remains available.

