# OperatorOS SSO Contract

Tech Deck is an OperatorOS child app. OperatorOS is the source of truth for launch, module entitlement, billing, and revocation.

## Required Environment

Production SSO requires:

| Variable | Required value |
|---|---|
| `MODULE_SSO_SECRET` | Shared HS256 secret, at least 32 characters. Never log it. |
| `OPERATOROS_BASE_URL` | Canonical OperatorOS base URL, no trailing slash. |
| `OPERATOROS_ISSUER` | Optional canonical JWT issuer. Defaults to `OPERATOROS_BASE_URL`. |
| `OPERATOROS_API_URL` | Absolute OperatorOS API URL, no trailing slash. |
| `OPERATOROS_SSO_ENV` | Exact environment claim expected from OperatorOS, such as `prod`, `staging`, or `dev`. |
| `OPERATOROS_SSO_AUDIENCE` | Must be `techdeck`. |
| `OPERATOROS_SERVICE_TOKEN` | Shared server-to-server sync token, at least 32 characters. |
| `CHILD_APP_MODULE_KEY` | Must be `techdeck`. |
| `VITE_OPERATOROS_URL` | Browser link target for access-denied recovery. Falls back to `VITE_OPERATOROS_BASE_URL`, then `https://operatoros.net`. |

`MODULE_SSO_DISABLED=true` is accepted only outside production. In production, missing or malformed SSO config fails closed at startup.

`OPERATOROS_SSO_ALLOW_LEGACY_ISSUER=true` temporarily accepts legacy `iss=operatoros`. It is off by default and logs a warning when enabled. Do not enable it for steady-state production.

## JWT Claim Matrix

Tech Deck verifies HS256 only and rejects `alg=none`, RS256, JWKS-style tokens, and malformed JWTs before calling OperatorOS consume.

| Claim | Expected | Required | Validation |
|---|---|---:|---|
| `iss` | `OPERATOROS_ISSUER` or `OPERATOROS_BASE_URL` | Yes | Exact match. Legacy `operatoros` only with explicit compatibility env. |
| `aud` | `techdeck` | Yes | Exact match to `OPERATOROS_SSO_AUDIENCE`. |
| `env` | `OPERATOROS_SSO_ENV` | Yes | Exact match. |
| `sub` | OperatorOS subject | Yes | Stable local fallback identity. |
| `user_id` | OperatorOS user id | Preferred | Used as primary local identity when present. |
| `email` | User email | Yes | Stored lowercased; never used as SSO binding key. |
| `name` | User display name | Optional | Updates local first/last name when present. |
| `role` | Platform role | Optional | Stored only as source context; module roles drive local access. |
| `module_slug` | `techdeck` | Yes | Must match `aud`. |
| `target_module_key` | `techdeck` | Yes | Authoritative module target. |
| `target_module_enabled` | `true` | Yes | `false` denies launch. |
| `target_module_access_level` | Plan/access level | Optional | Stored in entitlement snapshot. |
| `target_module_features` | Feature list | Optional | Stored as sent; absent means no local feature grant. |
| `target_module_limits` | Limit object | Optional | Stored as sent; absent limit values block limit-gated mutations. |
| `module_role` | Positive module role | Yes | `none` or empty denies launch. |
| `tenant_role` | Tenant role | Optional | Can elevate local role to `ADMIN`; never to `OWNER`. |
| `subscription_status` | Subscription state | Optional | Stored in entitlement snapshot. |
| `plan_slug` | Plan slug | Optional | Stored in entitlement snapshot. |
| `organization_id` | OperatorOS tenant/org id | Optional | Drives local tenant provisioning. |
| `jti` | Single-use token id | Yes | Sent to consume endpoint before session creation. |
| `iat` | Issued-at seconds | Yes | Cannot be more than 5 seconds in the future or older than 90 seconds. |
| `exp` | Expiry seconds | Yes | Must not be expired. |

## Launch Flow

1. OperatorOS redirects to `GET /sso?token=<jwt>`.
2. Tech Deck validates JWT header, signature, issuer, audience, env, module claims, `iat`, and `exp`.
3. Tech Deck posts exactly to `${OPERATOROS_API_URL}/v1/modules/sso/consume`.
4. Consume body is `{ "jti": "...", "aud": "techdeck", "env": "..." }`.
5. Consume headers include `X-Module-Slug: techdeck` and `X-Request-Id` when a request id exists.
6. Tech Deck creates or updates the local user, tenant, membership, and entitlement snapshot only after consume succeeds.
7. Tech Deck regenerates its own session and redirects to `/`.

Consume error mapping:

| OperatorOS code | Tech Deck code |
|---|---|
| `TOKEN_UNKNOWN` | `consume_failed` |
| `TOKEN_REPLAYED` | `consume_failed` |
| `TOKEN_EXPIRED` | `expired` |
| `AUDIENCE_MISMATCH` | `audience_mismatch` |
| `ENV_MISMATCH` | `env_mismatch` |
| 5xx or network failure | `sso_consume_unavailable` |

## Role Mapping

OperatorOS users never become local `OWNER`. `OWNER` is reserved for legacy/local workspace ownership and is not granted by SSO.

| OperatorOS role signal | Local role |
|---|---|
| `module_role=none` | Deny |
| `tenant_role=owner` | `ADMIN` |
| `tenant_role=tenant_admin` | `ADMIN` |
| `module_role=module_admin` | `ADMIN` |
| `module_role=admin` | `ADMIN` |
| `module_role=viewer` | `CLIENT` |
| `module_role=module_user` | `TECH` |
| `module_role=tech` | `TECH` |
| Unknown positive module role | `TECH` safe minimum |
| Empty module and tenant role | Deny |

## Entitlement Sync

OperatorOS calls `POST /api/operatoros/entitlements/sync` with `Authorization: Bearer <OPERATOROS_SERVICE_TOKEN>`.

The endpoint uses timing-safe token comparison, requires `target_module_key=techdeck`, requires `target_module_enabled`, updates the entitlement snapshot, and sets `revokedAt` when access is disabled or role mapping denies access.

When access is revoked, Tech Deck deletes matching rows from the `sessions` table and middleware also blocks any stale session that still presents a revoked user or disabled snapshot.

## Local Login Policy

In production, direct registration is disabled. Direct email/password login is reserved for explicit local `isSystemAdmin` emergency accounts only. Normal users must launch Tech Deck from OperatorOS and cannot use a local account to bypass OperatorOS module entitlements.

Outside production, local registration and login remain available for development and test workflows.

## Error Handling

Browser SSO `module_access_denied` responses redirect to `/access-denied`, which links back to OperatorOS using `VITE_OPERATOROS_URL`. JSON clients receive stable `{ code, message }` bodies. SSO error pages never include the raw JWT, auth headers, stack traces, `MODULE_SSO_SECRET`, or `OPERATOROS_SERVICE_TOKEN`.
