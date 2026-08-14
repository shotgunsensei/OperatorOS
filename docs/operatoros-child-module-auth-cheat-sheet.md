# OperatorOS Module Auth Cheat Sheet

## Authority

OperatorOS owns identity, host sessions, users, tenants, membership, platform
roles, tenant roles, module entitlements, billing, and global revocation.
Modules own product workflows and tenant-scoped product data only.

## Canonical endpoints

| Purpose | Route |
| --- | --- |
| Central sign-in | `https://auth.operatoros.net/login` |
| Issue one-time code | `POST /api/sso/issue` |
| Exact callback | `https://<module>.operatoros.net/sso` |
| Same-origin exchange | `POST /api/sso/browser-exchange` |
| Current session | `GET /api/auth/me` |
| Bound tenant summary | `GET /api/me/tenants` |
| Local logout | `GET /logout` or `POST /api/auth/logout` |
| Global logout | `POST /api/auth/logout-all` |

These are public same-origin browser routes. Next maps `/api/*` to the internal
Fastify `/v1/*` aliases; module code must not bypass the same-origin proxy.

## Required browser transaction

- Exact `client_id` and `redirect_uri`
- High-entropy state and nonce
- PKCE S256 verifier/challenge
- Secure, HttpOnly, SameSite=Lax, host-only transaction cookies
- Encrypted opaque code, 60-second TTL, one use
- Exact callback/request host validation
- No token in URL, fragment, localStorage, or sessionStorage
- Bounded errors and redirect-loop breaker

## Required API guard

```ts
preHandler: [
  requireTenantMember,
  requireTenantModuleAccess('<module-slug>'),
]
```

Never accept user, tenant, role, or entitlement authority from the frontend.
Every resource query must include the authenticated tenant predicate.

## Required production secrets

- `SESSION_SECRET`: high-entropy host-session signing key
- `SSO_CODE_ENCRYPTION_SECRET`: independent 32+ character hub-only code key
- `TRUST_PROXY=true` only behind the managed Replit proxy

Unified-runtime modules do not receive a shared signing secret. See
`docs/auth/ENVIRONMENT_VARIABLES.md` for the complete names-only matrix.

## Denial codes to preserve

- `AUTH_REQUIRED`, `TOKEN_INVALID`, `TOKEN_REVOKED`
- `SESSION_SCOPE_DENIED`, `SESSION_TENANT_MISMATCH`,
  `SESSION_MODULE_MISMATCH`
- `TENANT_NOT_FOUND`, `TENANT_SUSPENDED`
- `MODULE_ACCESS_DENIED`, `MODULE_DISABLED`, `MODULE_UNAVAILABLE`
- `TRANSACTION_MISMATCH`, `CODE_INVALID`, `CODE_EXPIRED`, `CODE_REPLAYED`
- `ORIGIN_HOST_MISMATCH`, `RATE_LIMITED`

## Verification gate

Require typecheck/build, DB-backed replay and two-tenant isolation tests,
authenticated browser launch/reload/logout tests, exact production callbacks,
no-store auth headers, and zero final credential-bearing URLs. The current
status is tracked in `docs/auth/VALIDATION_MATRIX.md`.
