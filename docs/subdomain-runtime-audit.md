# Subdomain Runtime Audit — Public URL & Host Routing

## Summary

OperatorOS serves the four exact registered platform hosts and thirteen exact
active module hosts from a **single Replit deployment** using host-based
routing. All thirteen module clients are enabled in the Phase 18 source
candidate, including OutCall. Internally the web app binds to Replit's required public port
(for example `5000`); Replit's proxy terminates TLS and forwards the real
public host in `x-forwarded-host` / `x-forwarded-proto`.

The default `operator-os.replit.app` alias is deployment transport only. It is
not a registered callback, CORS origin, or absolute auth return target.

This audit fixed a class of bugs where browser-facing URLs were built from the
inbound request URL — which behind the proxy still carries the internal `:5000`
port and `http` — producing broken links like `http://auth.operatoros.net:5000`.

## Root cause

The Next.js edge middleware login redirect (`apps/web/src/middleware.ts`,
`redirectToLogin`) cloned the inbound `nextUrl` and only overwrote the
hostname to `auth.operatoros.net`, leaving the port (`:5000`) and protocol
(`http`) untouched. The emitted `Location` was therefore
`http://auth.operatoros.net:5000/login…`, which is not routable on the public
host — hence the lag-then-error symptom.

The same anti-pattern (`process.env.APP_URL || 'http://localhost:5000'`,
`OPERATOROS_BASE_URL || 'http://localhost:5000'`) lived in several API code
paths, so any of them could emit an unreachable localhost/port URL in
production if the env override was unset.

## The single source of truth

`packages/modules/public-url.ts` — pure, framework-agnostic helpers used by both
the Fastify API and the Next.js edge middleware:

- `normalizeHost(host)` — lowercase, strip scheme/port/trailing-dot.
- `isProductionHost(host)` — exact registered root/app/auth/api or module host;
  an arbitrary `*.operatoros.net` sibling is rejected.
- `isLocalHost(host)` / `isSameSiteHost(host)` — loopback plus exact-host
  checks. Public Replit preview suffixes are not trusted redirect targets.
- `resolveHostRole(host)` — `root | app | auth | api | module | unknown`.
- `getPublicOrigin({host, forwardedHost, forwardedProto})` — the core fix:
  recognized production hosts collapse to `https://<host>` (no port); local/dev
  hosts keep their protocol and port.
- `buildPublicUrl(path, hostRole)` — clean platform URL for a role.
- `sanitizeReturnTo(raw, fallback)` — open-redirect guard (relative paths or
  same-site absolute URLs only).

`apps/api/src/lib/public-url.ts` re-exports those and adds the Node/env-aware
pieces: `getRequestPublicOrigin(request)`, `getRequestHostRole(request)`,
`isProductionEnv()`, `resolvePlatformBaseUrl()` (root domain), and
`resolveAppBaseUrl()` (console/`app` domain). `OPERATOROS_BASE_URL` is the only
supported production platform override; legacy `APP_URL` must remain unset.
Otherwise production falls back to the clean HTTPS platform domains and
development falls back to loopback.

## Files changed

- `packages/modules/public-url.ts` — new shared helper module.
- `apps/api/src/lib/public-url.ts` — new API-side env-aware resolver.
- `apps/web/src/middleware.ts` — `redirectToLogin` now clears the port and
  forces HTTPS on cross-host redirects, and encodes an absolute clean public
  URL in `?next=` so the user lands back on the original subdomain.
- `apps/web/src/app/login/page.tsx` — `safeNext` accepts same-site absolute
  URLs; the post-login effect uses a full navigation for cross-host `next`.
- `packages/sso/index.ts` — `resolveSsoIssuer` uses a production-aware default
  (`https://operatoros.net`) instead of `http://localhost:5000`.
- `apps/api/src/routes/module-routes.ts` — SSO issuer base uses
  `resolvePlatformBaseUrl()`.
- `apps/api/src/lib/billing-service.ts` — Stripe success/cancel/portal return
  URLs use `resolveAppBaseUrl()`.
- `apps/api/src/lib/email-service.ts` — invite-accept URL fallback is
  production-aware.
- `apps/api/src/index.ts` — production CORS is restricted to exact registered
  platform/module origins plus explicitly configured exact HTTPS origins;
  sharing the `operatoros.net` suffix is insufficient. Development permits
  loopback. The SSE endpoint reflects an allowlisted origin instead of emitting
  `Access-Control-Allow-Origin: *`.
- `apps/api/src/routes/diagnostics-routes.ts` — new non-secret diagnostics
  endpoint.

## Public vs dev URL rules

| Context | Host role known? | Result |
| --- | --- | --- |
| Production (exact registered host) | yes | `https://<host>` — never a port, never `http://` |
| Local dev (`localhost:5000`) | n/a | protocol + port preserved (`http://localhost:5000`) |
| Unregistered Replit preview | no | protocol + port may be preserved for rendering, but it is not accepted as an auth callback or absolute return target |

## Cookie / CORS / subdomain rules

- **Session cookie** (`packages/auth/index.ts`): production is
  `HttpOnly; Secure; SameSite=Lax; Path=/` with no `Domain` attribute. Each
  host establishes its own session through the bound `/sso` exchange; no
  subdomain receives ambient access from a parent-domain cookie. Root/app/auth
  sessions are platform-scoped without tenant/module claims; module sessions
  bind one exact module and tenant.
- **CORS/origin**: response CORS recognizes registered OperatorOS origins, but
  a state-changing browser request also requires its `Origin` host to equal
  the public request host. Sibling-subdomain mutations fail with
  `ORIGIN_HOST_MISMATCH` before a handler runs, so modules call their own
  same-origin `/api/*` proxy. Dev additionally allows loopback; a
  missing `Origin` (same-origin or non-browser callers like Stripe webhooks) is
  permitted.
- **Module hosts**: the registry maps each of the thirteen exact attached hosts
  to its module; `auth` and `app` are platform surfaces, not modules. OutCall
  resolves to its active exact-host module session; its Twilio features still
  fail closed until the explicit live-provider configuration passes. Ports are normalized
  away; an unknown `*.operatoros.net` request that reaches the deployment falls
  through to the controlled unknown-host page without becoming trusted.

## Diagnostics endpoint

`GET /api/diagnostics/public-url` (also `GET /v1/diagnostics/public-url`) returns
a non-secret snapshot of how the server interprets the request:

```json
{
  "ok": true,
  "environment": "production",
  "host": { "raw": "...", "forwarded": "auth.operatoros.net", "normalized": "auth.operatoros.net" },
  "forwardedProto": "https",
  "hostRole": "auth",
  "isProductionHost": true,
  "isKnownSubdomain": true,
  "publicOrigin": "https://auth.operatoros.net",
  "cookieDomainMode": "host-only",
  "cookieDomain": null
}
```

It returns no secrets, env values, or session data.

## Remaining risks

- **`OPERATOROS_BASE_URL` consistency.** The unified API validates and emits
  the canonical issuer. Production must use `https://operatoros.net` (or the
  explicit equivalent) and must never emit the internal localhost API URL.
- **Release routing verification.** The custom domains are already attached;
  remaining work is to deploy this unified release and confirm Replit preserves
  the exact public host/HTTPS scheme for each route. This is not a DNS migration
  (see `docs/replit-subdomain-checklist.md`).
- The `app` vs `root` split for billing return URLs assumes the authenticated
  console lives on `app.operatoros.net`. If billing screens move, revisit
  `resolveAppBaseUrl()` usage.
