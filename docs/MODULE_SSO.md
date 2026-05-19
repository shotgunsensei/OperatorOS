# Module SSO & Entitlements (Task #108)

OperatorOS is a multi-tenant control plane. Every child app ("module") —
TorqueShed, NinjaMation, BF-OS, PulseDesk, FaultLineLab, SnapProofOS,
TradeFlowKit, TechDeck, CallCommand.ai — is a separate web app that the
user *launches from* OperatorOS. SSO carries the user identity AND the
entitlement decision in one trip so child apps never have to re-derive
"can this user use this feature, at what role, with which flags?".

This document is the authoritative integration guide for a receiving
child app. If you are building or maintaining a child app, you only have
to implement the receiver pieces in §3.

---

## 1. Architecture in one paragraph

The OperatorOS API exposes **one canonical resolver**,
`resolveEntitlements(userId, tenantId)`, in
`apps/api/src/lib/entitlement-resolver.ts`. Every surface that needs to
make an authorization decision — the user-facing `/v1/entitlements/me`,
the service-to-service `/v1/sso/entitlements/introspect`, the SSO JWT
claim builder, and the outbound webhook to receivers — reads from this
function. Receivers therefore see the **same shape and the same answer**
no matter how they ask.

When something material changes (Stripe webhook, tenant admin grant
change, module enable/disable), the API runs
`recomputeAndPropagateEntitlements(tenantId)`, which (a) reconciles
`tenant_modules` against the owner's plan — disabling rows for modules
the new plan no longer includes and revoking every
`tenant_user_module_access` row pointing at them — and (b) POSTs a
fresh snapshot to every tenant-enabled receiver that has registered a
webhook URL.

---

## 2. The canonical snapshot

```jsonc
{
  "version": 1,
  "computedAt": "2026-05-19T12:34:56.000Z",
  "tenant": {
    "id": "uuid",
    "slug": "acme",
    "name": "Acme Industries",
    "type": "company",
    "role": "admin",                  // internal: owner|admin|member|null
    "roleAlias": "tenant_admin",      // public: owner|tenant_admin|billing_admin|user|viewer
    "viaPlatformRole": false
  },
  "user": {
    "id": "uuid",
    "email": "ops@acme.test",
    "platformRole": "user"
  },
  "subscription": {
    "status": "active",               // null when user has no plan
    "planSlug": "elite",
    "planName": "Elite",
    "currentPeriodEnd": "2026-06-01T00:00:00.000Z",
    "cancelAtPeriodEnd": false
  },
  "modules": [
    {
      "slug": "torqueshed",
      "name": "TorqueShed",
      "baseUrl": "https://torqueshed.example.com",
      "status": "enabled",
      "enabled": true,                // FINAL launch decision
      "accessLevel": "manager",       // internal: none|user|manager
      "moduleRole": "module_admin",   // public: none|viewer|module_user|module_admin
      "features": {                   // merged: plan defaults + tenant overrides
        "ai_assistant": true,
        "seats": 10,
        "advanced_reports": true
      },
      "source": "plan"                // plan|addon|override|admin_role|null
    }
  ],
  "limits": { "...plan_limits": 0 },
  "capabilities": { "...plan_features": true }
}
```

Field meanings:

| Field                    | Meaning                                                           |
| ------------------------ | ----------------------------------------------------------------- |
| `enabled`                | **The only field you should branch on for launch decisions.**     |
| `accessLevel`            | Internal column value, kept for back-compat.                      |
| `moduleRole`             | Public alias every receiver should display in admin UIs.          |
| `features`               | Plan-side defaults overlaid with per-tenant overrides.            |
| `source`                 | How the user got access (plan, addon, override, admin_role).      |
| `tenant.viaPlatformRole` | TRUE when a super-admin is masquerading without membership.       |

---

## 3. Receiver integration

### 3.1 Register your webhook (one-time)

POST to `/v1/sso/entitlements/sync` with the service token
(`OPERATOROS_SERVICE_TOKEN`):

```http
POST /v1/sso/entitlements/sync
Authorization: Bearer <OPERATOROS_SERVICE_TOKEN>
Content-Type: application/json

{ "module_slug": "torqueshed", "webhook_url": "https://torqueshed.example.com/webhooks/entitlements" }
```

Send `"webhook_url": null` to deregister.

### 3.2 Accept SSO at `{your_root}/sso`

OperatorOS sends the user to `{module.baseUrl}/sso?token=<JWT>`. The
JWT is HS256-signed with `MODULE_SSO_SECRET`. The relevant claims:

| Claim                          | Use                                                              |
| ------------------------------ | ---------------------------------------------------------------- |
| `sub` / `user_id`              | OperatorOS user id (use as your local user FK).                  |
| `email`                        | User email.                                                      |
| `module_slug`                  | Your slug — reject if it does not match yours.                   |
| `operatoros_tenant_id`         | Active tenant id (also mirrored at `tenant_id` for back-compat). |
| `tenant_role` / `tenant_role_alias` | Internal + public tenant role.                              |
| `subscription_status`          | `active`/`trialing`/`past_due`/`canceled`/`null`.                |
| `target_module_enabled`        | **Branch on this for the page-load decision.**                   |
| `target_module_access_level`   | Internal access value (none|user|manager).                       |
| `target_module_role`           | Public module role.                                              |
| `target_module_features`       | Merged feature flag map.                                         |
| `all_enabled_modules`          | List of slugs the user can launch right now.                     |
| `iss`, `aud`, `exp`, `jti`     | Standard. Reject after `exp`. Replay-protect `jti`.              |

If you prefer not to verify the JWT yourself, call
`POST /v1/modules/sso/consume` with `{ token, moduleSlug }`. The
response includes an `entitlement` block with the exact same fields.

### 3.3 Re-introspect on demand

When you receive a request that you suspect is from a stale snapshot,
ask OperatorOS for a fresh one:

```http
GET /v1/sso/entitlements/introspect?user_id=<uuid>&tenant_id=<uuid>
Authorization: Bearer <OPERATOROS_SERVICE_TOKEN>
```

The response is the canonical snapshot from §2.

### 3.4 Handle entitlement-change webhooks

Whenever entitlements change for your tenant, OperatorOS will POST
to your registered URL **once per affected (member × receiver)**.

```http
POST {your_webhook_url}
Content-Type: application/json
X-Operatoros-Signature: sha256=<hex>

{
  "event": "entitlements.changed",
  "reason": "stripe:customer.subscription.updated",
  "tenant":       { ...tenant block from §2 },
  "user":         { ...user block from §2 },
  "subscription": { ...subscription block from §2 },
  "module":       { ...the module entry for your slug },
  "all_enabled_modules": ["torqueshed", "bf-os"],
  "version": 1,
  "computed_at": "2026-05-19T12:34:56.000Z"
}
```

Verify the signature with HMAC-SHA256 over the **raw body** using the
shared `MODULE_SSO_SECRET`. Reject anything older than your last seen
`computed_at` per (user, tenant).

If `module.enabled === false`, you must **revoke** the user's access in
your app. If `module === null`, your module is no longer enabled for
that tenant — treat the user as unauthorized.

### 3.5 Failure modes

OperatorOS pushes are best-effort and may be retried but are not
guaranteed. If you suspect drift (no push for ≥10 minutes after a
billing change, or a user complains they can't launch), call
`/v1/sso/entitlements/introspect` and trust its answer.

---

## 4. Operator surface (OperatorOS side)

- `GET /v1/entitlements/me` — current user, current tenant. Auth-gated.
- `GET /v1/sso/entitlements/introspect?user_id&tenant_id` — service-token gated.
- `POST /v1/sso/entitlements/sync` — service-token gated; registers/clears webhook URL.
- `POST /v1/modules/sso/issue` — issues a JWT (called by web during launch).
- `POST /v1/modules/sso/consume` — verifies a JWT; returns the entitlement snapshot.

`OPERATOROS_SERVICE_TOKEN` must be ≥16 chars in production. Missing or
short tokens reject S2S calls with `SERVICE_TOKEN_REQUIRED` /
`SERVICE_TOKEN_INVALID`.

---

## 5. Triggers that fire recompute + propagation

1. **Stripe webhooks** (`customer.subscription.*`,
   `checkout.session.completed`, `invoice.paid`, …) →
   `schedulePropagationForUser(userId, { reason: 'stripe:<event>' })`
   which iterates every tenant where the user is the owner and calls
   `recomputeAndPropagateEntitlements(tenantId)`.
2. **Tenant admin grant changes** (`POST .../users/:userId/module-access`)
   → `schedulePropagation(tenantId, { reason: 'tenant_user_module_access_set' })`.
3. **Module enable/disable / archive** (`module-routes.ts`) — pipe these
   through `schedulePropagation(tenantId, { reason: 'module_<verb>' })`
   if/when those endpoints add their own audit hook.

Every recompute writes an `entitlement_change` audit row capturing
the reason, member count, receiver count, dropped slugs, and revoked
access row count.
