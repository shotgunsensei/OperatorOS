# OperatorOS SSO Contract

Status: Phase 4 shared SSO handoff contract. OperatorOS remains the identity,
tenant, entitlement, and audit authority. Modules consume handoff tokens; they
do not own login, billing, tenant membership, or entitlement decisions.

## Public API Surface

Browser-facing paths use the web app rewrite:

| Browser path | API route | Purpose |
| --- | --- | --- |
| `POST /api/sso/issue` | `POST /v1/sso/issue` | Issue a short-lived module handoff token and launch URL. |
| `POST /api/sso/consume` | `POST /v1/sso/consume` | Consume and validate a handoff token. |
| `GET /api/auth/me` | `GET /v1/auth/me` | Return the current authenticated OperatorOS user. |
| `POST /api/auth/logout` | `POST /v1/auth/logout` | Clear the OperatorOS session cookie. |

The API also registers direct `/api/sso/issue`, `/api/sso/consume`,
`/api/auth/me`, and `/api/auth/logout` aliases for direct API-origin testing.

Legacy compatibility remains available:

- `POST /v1/modules/:slug/handoff`
- `POST /v1/modules/sso/consume`
- `POST /modules/sso/consume`

New module integrations should use `/api/sso/issue` and `/api/sso/consume`.

## Shared Session Behavior

- OperatorOS API verifies the parent session.
- The API accepts `Authorization: Bearer <token>` and the HttpOnly `token`
  cookie for authenticated OperatorOS requests.
- Production session cookies are HttpOnly, Secure, SameSite=Lax, path `/`, and
  scoped to `.operatoros.net`.
- Local development omits the cookie domain and does not force Secure unless
  `NODE_ENV=production`.
- `POST /api/sso/consume` sets or confirms the OperatorOS session cookie after
  successful consume.

## Issue Flow

`POST /api/sso/issue`

Request body:

```json
{
  "moduleId": "techdeck",
  "tenantId": "tenant-id"
}
```

Server behavior:

1. Require an authenticated OperatorOS user.
2. Resolve selected tenant from body `tenantId`, `X-Tenant-Id`, then
   `users.current_tenant_id`.
3. Verify the tenant exists.
4. Verify tenant membership, unless the user has platform admin authority.
5. Resolve the target module from `packages/modules/registry.ts`.
6. Reject disabled, hidden, or planned modules.
7. Verify active tenant/module access through `resolveTenantModuleAccess`,
   unless the module does not require subscription.
8. Require `MODULE_SSO_SECRET` with at least 16 characters.
9. Create a short-lived HS256 JWT.
10. Persist the `jti` in `sso_handoff_tokens` for one-time consume support.
11. Write SSO audit events through `admin_audit_logs` where a user exists.
12. Return `launchUrl`, `redirectUrl`, and `redirect_url`.

Response shape:

```json
{
  "token": "<handoff-jwt>",
  "launchUrl": "https://techdeck.operatoros.net/sso?token=<handoff-jwt>",
  "redirectUrl": "https://techdeck.operatoros.net/sso?token=<handoff-jwt>",
  "redirect_url": "https://techdeck.operatoros.net/sso?token=<handoff-jwt>",
  "expiresIn": 90,
  "jti": "...",
  "issuer": "https://operatoros.test",
  "audience": "techdeck",
  "tenantId": "...",
  "module": {
    "id": "techdeck",
    "slug": "techdeck",
    "name": "TechDeck",
    "hostname": "techdeck.operatoros.net",
    "entitlementKey": "techdeck"
  }
}
```

## Consume Flow

`POST /api/sso/consume`

Request body:

```json
{
  "token": "<handoff-jwt>",
  "moduleId": "techdeck"
}
```

Server behavior:

1. Verify `token` and `moduleId` are present.
2. Resolve the module from the registry.
3. Require `MODULE_SSO_SECRET`.
4. Verify HS256 signature.
5. Verify expiration.
6. Verify issuer.
7. Verify audience equals the requested module id.
8. Verify module id and entitlement key claims match the registry.
9. Verify `jti` exists in `sso_handoff_tokens`.
10. Verify the stored audience, module id, tenant id, environment, expiry, and
    consumed state.
11. Verify the user still exists and is active.
12. Verify the tenant still exists.
13. Verify tenant membership, unless the user has platform admin authority.
14. Verify entitlement still exists, unless platform admin or no subscription is
    required.
15. Atomically mark the handoff consumed.
16. Set/confirm the OperatorOS session cookie.
17. Return safe authenticated context.

Response shape:

```json
{
  "ok": true,
  "sessionEstablished": true,
  "user": {
    "id": "...",
    "email": "operator@example.com",
    "platformRole": "user"
  },
  "tenant": {
    "id": "...",
    "slug": "tenant-slug",
    "name": "Tenant",
    "role": "owner",
    "viaPlatformRole": false
  },
  "module": {
    "id": "techdeck",
    "slug": "techdeck",
    "name": "TechDeck",
    "entitlementKey": "techdeck"
  },
  "claims": {
    "iss": "https://operatoros.test",
    "aud": "techdeck",
    "jti": "...",
    "exp": 1800000090,
    "nonce": "..."
  }
}
```

## Token Fields

Shared handoff JWTs include:

| Field | Meaning |
| --- | --- |
| `iss` | OperatorOS issuer from `OPERATOROS_BASE_URL`, normalized without trailing slash. |
| `aud` | Target module id from the registry. |
| `env` | Normalized environment: `prod`, `staging`, or `dev`. |
| `sub`, `userId`, `user_id` | OperatorOS user id. |
| `email` | OperatorOS user email. |
| `role` | Effective handoff role; platform admins become `super_admin`, otherwise tenant role or user role. |
| `platformRole` | Effective platform role. |
| `isPlatformAdmin` | Boolean server-side platform/root admin authority. |
| `tenantId`, `tenant_id`, `operatoros_tenant_id` | Selected OperatorOS tenant id. |
| `tenantRole`, `tenant_role` | Tenant membership role or synthetic admin role. |
| `moduleId`, `module_id` | Target module id. |
| `moduleSlug`, `module_slug` | Target module slug. |
| `entitlementKey`, `entitlement_key` | Registry entitlement key used for tenant access. |
| `jti` | Persisted one-time handoff id. |
| `nonce` | Token nonce for traceability and replay defense layering. |
| `iat` | Issued-at timestamp. |
| `exp` | Expiration timestamp. |

## Expiration, Audience, And Replay Rules

- Tokens use HS256 and `MODULE_SSO_SECRET`.
- `MODULE_SSO_SECRET` must be at least 16 characters.
- Default TTL is 90 seconds.
- Tokens are audience-bound to one registry module id.
- Consume rejects wrong audience, wrong issuer, expired tokens, unknown `jti`,
  already-consumed `jti`, tenant mismatch, inactive users, missing membership,
  and missing entitlement.
- `sso_handoff_tokens` is already present and stores `jti`, user, tenant,
  audience, environment, issue/consume metadata, and expiry.

## Module Responsibilities

Modules must:

- Serve a receiver route at `/sso`.
- Extract the handoff JWT from `?token=`.
- Call `POST /api/sso/consume` or the API-origin equivalent before creating a
  module-local session.
- Fail closed on any non-2xx consume response.
- Store only safe context needed for module-local operation.
- Re-check entitlement through OperatorOS for sensitive server actions when
  session freshness is uncertain.

Modules must not:

- Accept unsigned handoff tokens.
- Trust client-only flags or launch card visibility.
- Derive billing/subscription state locally.
- Duplicate OperatorOS login, tenant, entitlement, root-admin, or billing logic.

## Current Repo Anchors

- `packages/sso/index.ts`
- `packages/modules/registry.ts`
- `apps/api/src/routes/sso-routes.ts`
- `apps/api/src/routes/auth-routes.ts`
- `apps/api/src/schema.ts`
- `apps/api/src/lib/tenant-entitlements.ts`
- `apps/api/src/lib/sso-cleanup.ts`
- `docs/sso-test-plan.md`
