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

The body is the **canonical snapshot from §2 at the top level**, with
three transport metadata fields added alongside (`event`, `reason`,
`receiver_slug`). No field is renamed or relocated — the same code
that parses the `/introspect` response works here unchanged.

```http
POST {your_webhook_url}
Content-Type: application/json
X-Operatoros-Signature: sha256=<hex>

{
  "version": 1,
  "computedAt": "2026-05-19T12:34:56.000Z",
  "tenant":       { ...tenant block from §2 },
  "user":         { ...user block from §2 },
  "subscription": { ...subscription block from §2 },
  "modules":      [ { ...all module entries from §2 } ],
  "limits":       { ... },
  "capabilities": { ... },
  "event": "entitlements.changed",
  "reason": "stripe:customer.subscription.updated",
  "receiver_slug": "torqueshed"
}
```

Verify the signature with HMAC-SHA256 over the **raw body** using the
shared `MODULE_SSO_SECRET`. Reject anything older than your last seen
`computedAt` per (user, tenant).

Find your module entry with
`modules.find(m => m.slug === receiver_slug)`. If that entry's
`enabled` is `false`, you must **revoke** the user's access in your
app. If the entry is missing, your module is no longer enabled for
that tenant — treat the user as unauthorized.

### 3.6 Per-receiver push adapters (Task #109)

The canonical shape in §3.4 is the **default** push format and what
every receiver gets unless the operator selects otherwise. A small set
of receivers need a different wire shape because their existing
integration contract pre-dates OperatorOS. Each `modules` row carries
three columns that select the adapter:

| Column                  | Default               | Meaning                                                          |
| ----------------------- | --------------------- | ---------------------------------------------------------------- |
| `push_shape`            | `canonical_snapshot`  | `canonical_snapshot` (§3.4) or `tradeflowkit_v1` (below).        |
| `push_auth_mode`        | `hmac_signature`      | `hmac_signature` (X-Operatoros-Signature) or `bearer_token`.     |
| `push_bearer_env_var`   | NULL                  | Name of env var holding the bearer token (bearer mode only).     |

The adapter is a **transport/presentation layer only** — the resolver
snapshot is the single source of truth and is not modified by any
adapter. New receivers cannot change tenant-authoritative state by
speaking their own dialect; they only choose how they want to receive
the snapshot.

#### TradeFlowKit (`push_shape='tradeflowkit_v1'`)

- **Auth**: bearer token from `process.env[push_bearer_env_var]`. The
  default seed sets `push_bearer_env_var='TRADEFLOWKIT_OPERATOROS_SERVICE_TOKEN'`.
- **Batching**: ONE POST per receiver (all members in `members[]`),
  not one POST per (member × receiver).
- **Body**:
  ```jsonc
  {
    "tenantId": "tnt_…",
    "planSlug": "pro",
    "subscriptionStatus": "active",
    "accessLevel": "full",            // full|revoked, derived from status
    "features": { "automations": true, ... },
    "limits":   { "teamMembers": 25, ... },
    "members": [
      { "operatorosUserId": "u_…", "moduleRole": "module_admin",
        "enabled": true, "tenantRole": "tenant_admin" }
    ]
  }
  ```
  The envelope is **strict** — no extra top-level keys (TFK rejects
  unknown fields with `400 invalid_body`). Transport metadata
  (event/reason/receiver) lives only in OperatorOS's local audit log,
  never on the wire.
- **`accessLevel` derivation**: `active|trialing|grace|past_due_grace`
  → `"full"`, everything else → `"revoked"`.
- **Feature whitelist** — TradeFlowKit only accepts these 12 keys.
  Anything else is dropped silently at push-time, and rejected with
  `400 invalid_body` if surfaced through `/v1/sso/entitlements/sync`'s
  optional `features` field:
  ```
  automations, recurring_jobs, analytics, team_invites,
  unlimited_entities, call_recovery, audit_log, accounting_export,
  customer_portal, review_requests, recurring_invoices, stripe_connect
  ```
- **Fail-closed**: if `push_bearer_env_var` is null OR resolves to an
  empty string, the push is skipped and an audit row records
  `kind: 'propagation', skipped: [{receiver, reason: 'bearer_env_value_empty', ...}]`.

#### Adding another adapter later

1. Implement `EntitlementPushAdapter` in
   `apps/api/src/lib/entitlement-adapters.ts` (your adapter receives
   the member snapshots + target + context and returns an array of
   `{url, method, headers, body}` requests).
2. Register the shape name in the `ADAPTERS` registry.
3. Add the shape to the `modules.push_shape` CHECK constraint in
   `saas-db-init.ts`.
4. Update the seed for the receiver's `modules` row to point at your
   shape; ship a doc paragraph here under §3.6.

### 3.7 Legacy consume URL alias

TradeFlowKit's integration contract hard-codes the consume URL as
`POST {OPERATOROS_API_URL}/modules/sso/consume` (no `/v1`). OperatorOS
mounts both paths to the **same handler**, so the alias and the
versioned path return byte-identical bodies. Receivers SHOULD use the
versioned `/v1/modules/sso/consume`; the alias exists for legacy
compatibility only.

The merged `user.role` field on the consume response is clamped to
`"super_admin" | "user"` regardless of the underlying `users.role`
column value (which may carry historical values like `"admin"`). The
canonical taxonomy stays on `user.platformRole`.

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
