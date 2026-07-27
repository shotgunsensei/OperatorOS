# OperatorOS ecosystem integration contract

Status: v1 shared-runtime contract. This contract governs OperatorOS,
TradeFlowKit, PulseDesk, TechDeck, and TorqueShed. OperatorOS is the only
identity, tenant, subscription, entitlement, and module-launch authority.
Imported `apps/modules/*/source` trees are migration evidence, not executable
production applications.

## SSO contract

- A module launch starts from the canonical registry and uses an opaque,
  one-time authorization code. JWTs, refresh credentials, and session values
  are forbidden in URLs and logs.
- The browser transaction binds exact `client_id`, exact callback URI,
  `state`, `nonce`, PKCE S256 challenge, tenant, module, environment, and a
  validated same-host return path.
- Authorization codes expire quickly, are consumed once, and are sealed by
  the hub-only `SSO_CODE_ENCRYPTION_SECRET`. `MODULE_SSO_SECRET` is not part of
  v1.
- The callback verifies state, nonce, PKCE, code expiry, one-time consumption,
  account status, tenant membership, module status, and entitlement before it
  creates the host-only module session.

## Session contract

- Cookie: `operatoros_session`; `HttpOnly`; `Secure` in production;
  `SameSite=Lax`; `Path=/`; no `Domain` attribute.
- Platform sessions can use platform APIs. Module sessions are sealed to one
  tenant and one module and can use only `/auth/me`, logout/refresh, tenant
  identity, and that module's API namespace.
- `POST /api/auth/refresh` rotates a session only inside the final 24 hours,
  revokes the replaced token fingerprint, preserves platform/module scope,
  and returns `Cache-Control: no-store`. The browser checks on visibility and
  every 30 minutes.
- Invalid, expired, suspended, deleted, revoked, or version-mismatched sessions
  fail with 401/403 and restart central authentication without leaking the
  token.

## User and tenant claim contracts

The validated session identity contains `userId`, normalized email, platform
role, token version, session version, and session type. Module sessions also
contain immutable `tenantId` and `moduleId` bindings. The database user row is
reloaded on every authenticated request; browser claims are never sufficient.

Tenant context is resolved server-side from the sealed module session or from
the authenticated user's active tenant plus verified membership. An
`X-Tenant-Id` value is a selection request, not authority. Every module query,
mutation, unique constraint, audit event, and transaction must include the
resolved tenant ID. Foreign-object access returns 404 or a stable access error
without disclosing another tenant's data.

## Entitlement and authorization contracts

- Entitlements are resolved from OperatorOS plans, tenant module assignments,
  per-user module access, and explicit platform policy. Module UI never
  computes or grants access.
- Shared tenant roles are `owner`, `admin`, and `member`; module adapters may
  map them to module vocabulary. Platform super-admin authority is explicit
  and remains auditable.
- Read guards require tenant membership plus named module access. Write guards
  additionally require module write access. Administrative operations require
  tenant owner/admin or platform authority. UI hiding is presentation only.
- Least privilege is the default: missing membership, entitlement, or grant
  fails closed.

## Navigation and return URL contracts

The shared ecosystem header supplies My Apps, Profile, Billing, Support, and
global Logout plus module, tenant, and user context. The canonical My Apps URL
is `https://app.operatoros.net/`. Production return URLs must use an exact
registered OperatorOS/module origin and a validated relative path. Credentials,
protocol-relative URLs, userinfo, arbitrary hosts, and nested redirect
parameters are rejected. Deep links are preserved only after the same
authentication and entitlement checks as a root launch.

## Logout contract

Local logout revokes and clears only the current host session. The shared
header uses `POST /api/auth/logout-all`, increments the user's token version,
clears the current cookie, and marks every other OperatorOS host session
invalid on its next request. The UI reports success only after the authority
confirms global revocation.

## Error and API contracts

Errors use an appropriate HTTP status and JSON `{ error, code, ...safeFields }`.
401 means the session must be re-established; 403 means authenticated but not
authorized; 404 hides missing or foreign tenant objects; 409 covers version or
state conflicts; 422 is reserved for semantic validation; 429 is rate limit;
503 is an unavailable dependency/configuration. Stack traces, tokens, secret
values, and cross-tenant identifiers are never returned.

Collection APIs accept bounded `limit` plus documented filters and return a
stable collection key and pagination metadata when pagination is supported.
Mutations validate server-owned fields, use transactions across related
writes/audit events, and use optimistic versioning or idempotency keys where a
retry could duplicate money, messages, webhooks, or workflow transitions.
Uploads must enforce authentication, tenant scope, size, MIME/signature,
randomized storage keys, malware scanning where available, and download
authorization.

## Health and observability contracts

- Fastify `/healthz` is the private/native non-secret liveness response.
  Replit reserves raw public `/healthz` before the application, so the
  canonical public root-host liveness probe is `/api/health`, which rewrites
  to the same Fastify health snapshot.
- `/readyz` checks database connectivity, auth configuration, SSO code
  encryption in production, and the module registry. It reports optional
  Stripe, email, Twilio, and OpenAI integrations as configured or disabled
  without exposing values.
- Every response includes `X-Request-Id`. Production logs are structured JSON
  and record request ID, method, route template, status, duration, user ID,
  tenant ID, and module ID. Authorization, cookies, passwords, tokens, and
  secrets are redacted; request bodies are not included in completion logs.

## Configuration and ownership

Production startup/preflight requires PostgreSQL, strong session and SSO
secrets, the canonical platform/module registry, explicit proxy trust, and
production environment flags. Public origins are exact HTTPS registrations;
localhost is allowed only for the private same-deployment `INTERNAL_API_URL`
or local development. OperatorOS owns migrations, auth, billing, tenant,
entitlement, audit, and shared tables. Modules own only tenant-scoped workflow
data and UI.

Related evidence: `docs/auth/OPERATOROS_SSO_CONTRACT_V1.md`,
`docs/auth/VALIDATION_MATRIX.md`, `docs/MODULE_CONSOLIDATION_STATUS.md`, and
`docs/DATABASE_BACKUP_RESTORE.md`.
