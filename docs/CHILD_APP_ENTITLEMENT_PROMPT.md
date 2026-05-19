# Child-App Entitlement Integration Prompt (Task #108)

Copy this prompt into the child app's agent when wiring or refreshing
the OperatorOS integration. It is intentionally self-contained.

---

You are integrating OperatorOS as the single source of truth for who can
use this app, with what role, and which feature flags. OperatorOS will
SSO the user in and push entitlement changes to you. You must not derive
authorization decisions from any other source.

**Your slug:** `<MODULE_SLUG>` (e.g. `torqueshed`).
**OperatorOS base URL:** `<OPERATOROS_BASE_URL>`.
**Shared secrets you need:**
- `MODULE_SSO_SECRET` — HS256 key for SSO JWTs and HMAC signatures.
- `OPERATOROS_SERVICE_TOKEN` — bearer for service-to-service calls.

## 1. Implement the SSO entry point

Build `GET {your_root}/sso`. Read `?token=<JWT>`. Verify HS256 with
`MODULE_SSO_SECRET`. Reject when any of these are true:
- `aud` ≠ your slug, `module_slug` ≠ your slug
- `iss` ≠ `<OPERATOROS_BASE_URL>`
- `exp` is in the past
- `jti` has been seen before (store last N for replay protection)

After verification, persist or upsert a local session with these
fields from the JWT: `sub` (user id), `email`, `operatoros_tenant_id`,
`tenant_role`, `tenant_role_alias`, `subscription_status`,
`target_module_enabled`, `target_module_access_level`,
`target_module_role`, `target_module_features`, `all_enabled_modules`,
`computed_at` (use `iat`).

If `target_module_enabled === false`, redirect to your locked/upsell
view; do not create a working session.

## 2. Register your entitlement webhook

On boot (idempotently), POST to OperatorOS:

```http
POST {OPERATOROS_BASE_URL}/v1/sso/entitlements/sync
Authorization: Bearer {OPERATOROS_SERVICE_TOKEN}
Content-Type: application/json

{ "module_slug": "<YOUR_SLUG>", "webhook_url": "{your_root}/webhooks/operatoros/entitlements" }
```

## 3. Implement the webhook receiver

Build `POST {your_root}/webhooks/operatoros/entitlements`:

1. Read the raw body BEFORE any JSON parser touches it.
2. Compute `sha256=` HMAC of the raw body with `MODULE_SSO_SECRET` and
   constant-time-compare to the `X-Operatoros-Signature` header. Reject
   401 on mismatch.
3. Parse the JSON body. Schema:
   ```jsonc
   {
     "event": "entitlements.changed",
     "reason": "stripe:customer.subscription.updated",
     "tenant":       { "id": "...", "slug": "...", "role": "admin", "roleAlias": "tenant_admin", ... },
     "user":         { "id": "...", "email": "...", "platformRole": "user" },
     "subscription": { "status": "active", "planSlug": "elite", ... } | null,
     "module":       { "slug": "<YOUR_SLUG>", "enabled": true, "accessLevel": "manager",
                       "moduleRole": "module_admin", "features": { ... }, "source": "plan", ... } | null,
     "all_enabled_modules": ["...", "..."],
     "version": 1,
     "computed_at": "2026-05-19T12:34:56.000Z"
   }
   ```
4. Look up the local user by `user.id`. If `module === null` OR
   `module.enabled === false`, revoke their session and lock further
   logins for `(user, tenant)`. Otherwise, update the cached
   `accessLevel`, `moduleRole`, and `features` map.
5. If the incoming `computed_at` is older than what you already have
   stored for `(user.id, tenant.id)`, drop it.
6. Return `200 OK` immediately. Do downstream work asynchronously.

## 4. Use the snapshot, never re-derive

Authorization decisions in your app are functions of the snapshot only:

```
canLaunch(user)        := snapshot.module.enabled === true
canManage(user)        := snapshot.module.moduleRole === 'module_admin'
canSeeReports(user)    := snapshot.module.features.advanced_reports === true
seatsAvailable(user)   := snapshot.module.features.seats - currentSeatCount(...)
```

Never derive these from the Stripe plan slug, never call Stripe
directly, never read your local copy of the user's plan. If you find
yourself wanting to, call OperatorOS's introspect endpoint instead.

## 5. On-demand re-introspect

If a request hits your app and the cached snapshot is stale (e.g. user
complains, or `computed_at` is more than 10 minutes old on a sensitive
path), call:

```http
GET {OPERATOROS_BASE_URL}/v1/sso/entitlements/introspect?user_id={uuid}&tenant_id={uuid}
Authorization: Bearer {OPERATOROS_SERVICE_TOKEN}
```

Treat the response as ground truth and overwrite your cache.

## 6. Do not

- Do **not** maintain a separate roles table for OperatorOS users.
- Do **not** read `subscription.planSlug` to decide access — read
  `module.enabled` and `module.features.<flag>`.
- Do **not** ignore `module === null` in a webhook — that means
  OperatorOS has revoked your module for this tenant entirely.
- Do **not** trust unsigned webhook calls.

## 7. Sanity tests

- SSO with an expired JWT → 401.
- SSO with `module_slug` mismatch → 401.
- Webhook with bad signature → 401.
- Webhook flipping `module.enabled` from `true` → `false` revokes the
  user's local session within one request.
- Introspect call with a wrong service token → 401, with the right one
  → 200 + the snapshot from §3.
