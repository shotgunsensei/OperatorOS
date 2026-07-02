# Local Billing Decommission

Tech Deck no longer owns subscriptions, plan assignment, upgrades, downgrades, pause/unpause, Stripe checkout, or the Stripe customer portal.

## Authority Map

| Usage | Final classification |
| --- | --- |
| `stripe`, `Stripe` | Legacy audit only, disabled by default behind `ENABLE_LEGACY_STRIPE_WEBHOOK_AUDIT=true`. |
| `checkout` | Local checkout write endpoint returns `410 Gone`. |
| `customer-portal` | Local customer portal write endpoint returns `410 Gone`. |
| `subscription` | Read-only OperatorOS projection or legacy audit/reference depending on file. |
| `tenantSubscriptions` | Legacy reference table only. Not production access authority. |
| `subscriptionPlans` | Legacy reference/seed table only. Seeding disabled unless `ENABLE_LEGACY_BILLING_SEED=true`. |
| `planCode` | Legacy display/audit only where retained. OperatorOS `accessLevel` is authoritative. |
| `pausedAt` | Legacy reference only. Not consulted for production access decisions. Grace cleanup is disabled in production and disabled by default elsewhere. |
| `billing` | Read-only OperatorOS projection in Tech Deck UI/API. |
| `pricing` | Public copy points to OperatorOS. Tech Deck does not publish local plans as authority. |
| `/register` | Dev/local registration route remains, but public funnel points to OperatorOS/request access. |
| `free plan`, `no credit card` | Removed from public Tech Deck funnel. |
| `upgrade`, `downgrade` | Managed in OperatorOS. Local mutation routes return `410 Gone`. |

## Endpoints Returning 410 Gone

- `POST /api/billing/checkout-session`
- `POST /api/billing/customer-portal`
- `PATCH /api/admin/tenants/:tenantId/subscription`
- `POST /api/admin/tenants/:tenantId/pause`
- `POST /api/admin/tenants/:tenantId/unpause`

Response shape:

```json
{
  "code": "managed_by_operatoros",
  "message": "Tenant plans, subscription status, pause/unpause, upgrades, and downgrades are managed by OperatorOS.",
  "operatorosUrl": "https://operatoros.example/billing"
}
```

Billing endpoints use `error: "managed_by_operatoros"` for compatibility with existing clients and also send a `Location` header.

## Read-Only Endpoints

- `GET /api/me/entitlements` returns the current user snapshot.
- `GET /api/billing/subscription` projects from `entitlement_snapshot_json`.
- `GET /api/billing/plans` returns an OperatorOS pointer, not a local catalog.
- `GET /api/admin/tenants/:tenantId/subscription` returns OperatorOS snapshot status plus legacy reference data.
- `GET /api/admin/plans` returns an OperatorOS pointer with an empty local plan list.

## Stripe Webhook Behavior

`/api/stripe/webhook` is not registered unless `ENABLE_LEGACY_STRIPE_WEBHOOK_AUDIT=true`.

When registered, it:

- Verifies/processes the webhook.
- Emits audit events with `legacyAuditOnly: true`.
- May read legacy subscription rows to locate a tenant.

It does not:

- Create checkout sessions.
- Create customer portal sessions.
- Upsert `tenant_subscriptions`.
- Update `tenant_subscriptions.status`.
- Write `pausedAt`.
- Change `users.entitlement_snapshot_json`.
- Upgrade, downgrade, pause, unpause, revoke, or restore access.

## Legacy Tables Remaining

- `subscription_plans`
- `tenant_subscriptions`

These remain for historical reference, migrations, and audit-only lookups. They must not override OperatorOS.

## Recovery Notes

If a user loses access because the snapshot is missing or stale:

1. Have them launch Tech Deck from OperatorOS.
2. Confirm the OperatorOS sync endpoint is configured and authorized.
3. Confirm `last_entitlement_sync_at` updates.
4. Do not repair access by editing `tenant_subscriptions`.
