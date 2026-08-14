# OperatorOS SSO

Faultline Lab is launchable as a child app inside OperatorOS. OperatorOS issues
a short-lived HS256 JWT and redirects the user to:

```
GET <child_app_origin>/sso?token=<JWT>&returnTo=/some/path
```

The api-server owns the `/sso` path (see `artifacts/api-server/.replit-artifact/artifact.toml`,
`paths = ["/api", "/sso"]`). On success it sets a local HMAC-signed session
cookie (`fl_session`) and redirects to `?sso=ok`; on failure it redirects to
`?sso=error&reason=<code>`.

This auth path **coexists** with Clerk: Clerk users continue to sign in via
the existing widget; OperatorOS users arrive via `/sso` and never touch
Clerk. A single human with both auth methods will currently have two distinct
rows in `users` — linking is intentionally out of scope for this change.

## Required environment variables

| Variable | Purpose | Notes |
| --- | --- | --- |
| `MODULE_SSO_SECRET` | Shared HS256 signing secret with OperatorOS | **Hard-fail** in production if missing or `< 16` chars. |
| `OPERATOROS_BASE_URL` | Expected `iss` claim | Exact match. |
| `OPERATOROS_SSO_AUDIENCE` | Module slug, expected `aud` claim | Always lowercased; must equal `faultlinelab` for this app. |
| `OPERATOROS_SSO_ENV` | Expected `env` claim (`dev` / `staging` / `production`) | Tokens minted for a different env are rejected. |
| `OPERATOROS_API_URL` | Base URL for the OperatorOS API | We POST `${API}/v1/modules/sso/consume` to assert single-use. |
| `OPERATOROS_SERVICE_TOKEN` | Bearer secret OperatorOS uses to call `POST /api/operatoros/entitlements/sync` | **Hard-fail** in production if missing. Compared with `timingSafeEqual`. |
| `OPERATOROS_ISSUER` | Optional alias for `OPERATOROS_BASE_URL` | New canonical name; legacy `OPERATOROS_BASE_URL` still honored. |
| `OPERATOROS_JWT_SECRET` | Optional alias for `MODULE_SSO_SECRET` | New canonical name; legacy `MODULE_SSO_SECRET` still honored. |
| `CHILD_APP_MODULE_KEY` | Optional alias for `OPERATOROS_SSO_AUDIENCE` | New canonical name; legacy `OPERATOROS_SSO_AUDIENCE` still honored. |
| `SESSION_SECRET` | Already present; signs the local `fl_session` cookie | Must remain stable across deploys or all sessions invalidate. |

## Entitlement contract

OperatorOS is the **single source of truth** for who can use Faultline Lab and
what they can see. The Faultline Lab client never exposes Stripe checkout or
pricing controls to a signed-in user — both the `/store` and `/pricing`
screens render the `ManagedByOperatorOS` panel instead. The legacy in-app
catalog still exists for guest mode only.

### Token claims (extends the SSO JWT)

| Claim | Type | Purpose |
| --- | --- | --- |
| `target_module_key` | string | Must equal the configured module key (lowercased). Mismatch → `reason=wrong_module`. |
| `target_module_enabled` | boolean | **Required.** Must be the boolean literal `true`. Missing or non-boolean → `reason=module_disabled`; `false` → `reason=module_disabled`. No implicit default. |
| `tenant_id` | string | Persisted to `users.operatoros_tenant_id`. |
| `module_role` | `module_admin` \| `module_user` \| `viewer` \| `none` | Takes precedence over legacy `role`. |
| `tenant_role` | string | Persisted to the snapshot only. |
| `access_level` | `pro` \| `standard` \| `read-only` \| `denied` | Drives the locally-derived role. |
| `features` | string[] | Free-form feature flags. |
| `granted_product_ids` | string[] | Catalog ids the user has access to. |
| `subscription_status` | string | e.g. `active`, `trialing`, `canceled`. Persisted to the snapshot. |

### Local role derivation (`operatorOsRole.deriveLocalRole`)

- `target_module_enabled === false` **or** `access_level === "denied"` **or**
  `module_role === "none"` → `deny`
- `module_role === "module_admin"` → `admin`
- `module_role === "module_user"` → `standard`
- `module_role === "viewer"` → `read-only`
- otherwise → `standard`

`requireAuth` returns HTTP 403 with `{ error: "access_denied" }` whenever
`users.local_role === "deny"`. The SPA routes these users to the
`AccessDeniedScreen`.

### Persistence

`ensureOperatorOsUserRow` now also writes:

- `users.operatoros_tenant_id`
- `users.local_role` (derived)
- `users.last_entitlement_sync_at` (epoch ms)
- `users.entitlement_snapshot_json` — full snapshot:
  `{ accessLevel, moduleEnabled, moduleRole, tenantRole, planSlug,
  subscriptionStatus, features[], grantedProductIds[], syncedAt }`

`entitlementsPayload.ts` uses this snapshot when `authSource === "operatoros"`
instead of querying the local `user_entitlements` table.

### Out-of-band sync — `POST /api/operatoros/entitlements/sync`

OperatorOS calls this whenever a plan, role, or feature flag changes between
launches. The handler:

1. Requires `Authorization: Bearer <OPERATOROS_SERVICE_TOKEN>` (constant-time
   compare). Missing/wrong token → 401.
2. Body `{ operatoros_user_id, access_level?, module_enabled?, module_role?,
   tenant_role?, plan_slug?, subscription_status?, features?,
   granted_product_ids? }`. Missing id → 400.
3. Looks up the user by `users.operator_identity_id`. Not found → 404.
4. Recomputes the snapshot + `local_role`, persists, and returns
   `{ success: true, localRole, snapshot }`.

The endpoint is unaware of Clerk and never sets cookies — it is strictly a
server-to-server channel.

## Verification pipeline (`artifacts/api-server/src/lib/operatorOsSso.ts`)

1. Decode header — reject anything other than `alg=HS256` (rejects `none`,
   `RS256`, etc. before any signature work).
2. `jwt.verify` with `MODULE_SSO_SECRET`, ±5s clock skew.
3. Claim assertions: `iss`, `aud` (lowercased), `module_slug` (lowercased,
   **must equal both `aud` and the configured audience**), `env`, `iat` not
   older than 90s and not more than 5s in the future, `exp` in the future,
   non-empty `jti` and `sub`. Failure codes:
   `wrong_issuer` / `wrong_audience` / `wrong_module` / `wrong_env` /
   `expired` / `invalid_token` (covers `iat_in_future`, missing claims,
   bad signature, alg mismatch).
4. Mandatory `POST {OPERATOROS_API_URL}/v1/modules/sso/consume` with
   `{ jti, aud, env }`. Upstream codes map to local failure reasons:

   | Upstream code | Local `reason=` |
   | --- | --- |
   | `TOKEN_UNKNOWN` / `TOKEN_REPLAYED` | `consume_failed` |
   | `TOKEN_EXPIRED` | `expired` |
   | `AUDIENCE_MISMATCH` | `wrong_audience` |
   | `ENV_MISMATCH` | `wrong_env` |
   | 5xx / network | `sso_consume_unavailable` (HTTP 502) |

5. `ensureOperatorOsUserRow` upserts on `users.operator_identity_id` (= `sub`)
   and refreshes `email`, `display_name`, `avatar_url`, `operator_plan_slug`,
   `operator_organization_id`, `operator_role`, `operator_last_launch_at`.
6. `mintSessionToken(userId, "operatoros")` — base64url-encoded payload
   `{ uid, iat, exp, src }` HMAC'd with `SESSION_SECRET`. We never reuse the
   OperatorOS JWT as a session cookie.
7. Cookie is set `HttpOnly; SameSite=Lax; Path=/; Secure` (in production).

## Logging & secrets

`req.log` only ever sees `{ jti, code }` on failures and `{ jti, userId, planSlug }`
on success. The raw token, claim payload, and shared secret are never
logged. The pino logger redacts `req.headers.authorization`,
`req.headers.cookie`, and `res.headers['set-cookie']` globally.

## Dual-session middleware

`requireAuth` / `optionalAuth` (`artifacts/api-server/src/middlewares/requireAuth.ts`)
resolve `req.appUser` from either the `fl_session` cookie or the Clerk
session, and set `req.userId` to the local `users.id`. All downstream routes
(`profile`, `entitlements`, `admin`, `stripe`, `crossPromo`) now query users
by their app id rather than by `clerk_id`.

## Client surface

- `GET /api/me` returns `{ user: { id, email, displayName, avatarUrl,
  isAdmin, isSuperAdmin, authSource, operator } }` for both auth modes.
- `POST /api/logout` clears `fl_session` (idempotent). It does not sign the
  user out of OperatorOS or Clerk.
- The SPA hydrates signed-in state from `/api/me` whenever Clerk reports no
  user (both with and without `VITE_CLERK_PUBLISHABLE_KEY`).
- `consumeSsoLandingParams` (`src/lib/ssoLanding.ts`) reads `?sso=ok|error`
  on the landing page, surfaces a Sonner toast, and strips the params from
  the URL so refreshing doesn't replay the toast.

## Tests

`artifacts/api-server/src/routes/sso.test.ts` exercises the endpoint end-to-end
with a stubbed `consumeSsoToken`. Coverage:

- valid token → 302 to `/?sso=ok`, cookie set, user row upserted with plan
- wrong-secret signature → `reason=invalid_token`, no cookie, no consume call
- `alg=none` token → rejected before any signature work
- expired `exp` / stale `iat` → `reason=expired`
- audience mismatch → `reason=wrong_audience`
- env mismatch → `reason=wrong_env`
- consume `TOKEN_REPLAYED` → `reason=consume_failed`
- consume 5xx → HTTP 502, `reason=sso_consume_unavailable`
- relaunch with same `sub` → single row, refreshed `plan_slug`
- `target_module_key` mismatch → `reason=wrong_module`
- `target_module_enabled=false` → `reason=module_disabled`, no cookie set
- entitlement snapshot + `local_role` persisted from the token
- `module_role=none` collapses to `local_role=deny`

`artifacts/api-server/src/routes/operatoros.test.ts` covers
`POST /api/operatoros/entitlements/sync`: missing/wrong bearer (401), missing
body field (400), unknown user (404), happy-path upgrade to pro
(`local_role=admin`), and disable flow (`local_role=deny`).
