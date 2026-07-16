# OperatorOS SSO contract v1

Status: source implementation and isolated DB/browser validation complete; the
production enablement gate remains closed pending deployment and live
authenticated-browser validation.
OperatorOS/auth is the sole identity, session-validity, tenant, role,
account-status, module-status, and entitlement authority.

Session renewal uses `POST /api/auth/refresh`. Rotation occurs only inside the
final 24 hours, preserves platform or tenant/module scope, revokes the replaced
token fingerprint, and never places the new session value in a response body
or URL.

## Protocol

```mermaid
sequenceDiagram
  participant B as Browser
  participant M as Module host
  participant O as OperatorOS auth/API authority
  B->>M: Open module deep link
  M-->>B: Auth redirect with state, nonce, S256 challenge
  B->>O: Authenticate or reuse auth-host session
  O->>O: Validate session, user, tenant, role, module and entitlement
  O->>O: Persist 60s one-time handoff and seal opaque code
  O-->>B: Exact registered module callback?code=opaque
  B->>M: GET exact callback
  M->>O: Same-origin browser exchange with code + state
  O->>O: Verify host, nonce cookie, PKCE verifier; revalidate and atomic consume
  O-->>B: Host-only session cookie + validated relative return path
  B->>M: Navigate without code in URL
```

1. Only an authenticated OperatorOS session may issue a code.
2. Client ID, environment, and exact callback are registered and bound. Module
   clients additionally bind module, tenant, and entitlement; the
   `operatoros:web` platform client has no tenant or module claims.
3. Codes expire after 60 seconds and are single use. Replay returns
   `CODE_REPLAYED`/409.
4. The browser may carry only `code`, `state`, and non-sensitive local navigation data. It must never carry identity/access/refresh/session JWTs.
5. Exchange terminates at the shared Fastify server through the target host's
   same-origin `/api/sso/browser-exchange` path. No client secret or session
   credential is exposed to browser JavaScript. PKCE S256 is mandatory; plain
   PKCE is forbidden.
6. `state` is compared against both the sealed binding and a target-host
   HttpOnly cookie in constant time. `nonce` and the PKCE verifier are also
   target-host HttpOnly cookies and are verified before session creation.
7. Every exchange rechecks user status at redemption time. A module exchange
   also rechecks tenant status/membership, global module status, and
   entitlement. The global module kill switch is evaluated before any
   platform-administrator access override.
8. Modules may map OperatorOS roles into narrower local application permissions; they may not widen or reinterpret authority.
9. Modules link accounts by immutable OperatorOS subject first. Email is only a verified migration/linking aid and must not silently create an unrelated identity.
10. A successful callback atomically consumes the code, sets a host-only
    secure OperatorOS application cookie on that exact host, clears the
    transaction cookies, removes the code from browser history, and redirects
    to the validated local relative path.

## Session lifecycle

- Every OperatorOS surface has an independent host-scoped copy of the shared
  application session. No parent-domain cookie grants ambient subdomain access.
- Root, app, and auth hosts receive `sessionType=platform` without tenant or
  module claims. An exact enabled module host receives `sessionType=module`
  bound to one module and tenant.
- Public credential submission and global account mutation routes are accepted
  only on the exact root, app, and auth hosts (plus loopback in development).
  Module and public Replit hosts cannot mint or upgrade a platform session.
- Production cookies: Secure, HttpOnly, SameSite=Lax or stricter, Path `/`, no Domain attribute.
- Local logout destroys only the current application session.
- Global logout increments/revokes the OperatorOS token/session version. The
  unified runtime invalidates each host session on its next authenticated
  request; a separately deployed approved client must re-introspect within its
  documented maximum cache interval.
- Session renewal never reuses an authorization code.
- Privilege elevation rotates the session.

## Tenant switching

Tenant switching occurs at OperatorOS. A module session remains bound to the tenant returned by exchange. Switching the OperatorOS tenant requires a new module authorization; a frontend tenant ID never changes module authority.

## Environment separation

- Development may use HTTP loopback callbacks registered explicitly.
- Preview callbacks are disabled unless separately registered; no wildcard `replit.dev` URI.
- The default `operator-os.replit.app` deployment alias is not a registered
  callback, allowed origin, or absolute auth return target.
- Staging and production use different session and code-encryption secrets.
- Production callbacks are HTTPS exact matches from the registry.

## Errors and redirects

Errors are bounded. A callback failure redirects once to a safe local or OperatorOS error page with a correlation ID; it never restarts authorization automatically. Auth responses use `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.

## Audit fields

Every SSO response carries a server-generated `X-Correlation-ID`; bounded JSON
errors also return that ID in the response body. Route-scoped decision logs
record request/correlation/launch IDs, contract version, environment,
client/module IDs, available user and tenant context, roles, entitlement key,
session presence/validity, redirect host, decision, normalized reason, status,
and duration. Authorization-code database identifiers are recorded by the
specific issue/exchange audit events rather than extracted from raw browser
codes. Never log raw cookies, codes, tokens, passwords, or signing keys.

## Versioning

Clients advertise `contractVersion=v1` and an adapter version at or above the registry minimum. Breaking protocol or claim changes require v2; additive response fields may remain v1.
