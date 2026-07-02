# Subdomain Runtime Audit — Public URL & Host Routing

## Summary

OperatorOS serves every subdomain (`operatoros.net`, `app`, `auth`, `api`, and
each module host such as `techdeck`, `pulsedesk`, `tradeflowkit`) from a
**single Replit deployment** using host-based routing. Internally the web app
binds to Replit's required port (e.g. `5000`); Replit's proxy terminates TLS and
forwards the real public host in `x-forwarded-host` / `x-forwarded-proto`.

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
- `isProductionHost(host)` — `operatoros.net` or any `*.operatoros.net`.
- `isLocalHost(host)` / `isSameSiteHost(host)` — dev/preview + same-site checks.
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
`resolveAppBaseUrl()` (console/`app` domain). When an explicit base URL env var
is set it is honored; otherwise production falls back to the clean HTTPS
platform domains and dev falls back to localhost.

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
- `apps/api/src/index.ts` — CORS restricted to an allowlist (prod: only
  `*.operatoros.net`; dev: localhost/preview too); the SSE endpoint reflects an
  allowlisted origin instead of emitting `Access-Control-Allow-Origin: *`.
- `apps/api/src/routes/diagnostics-routes.ts` — new non-secret diagnostics
  endpoint.

## Public vs dev URL rules

| Context | Host role known? | Result |
| --- | --- | --- |
| Production (`*.operatoros.net`) | yes | `https://<host>` — never a port, never `http://` |
| Local dev (`localhost:5000`) | n/a | protocol + port preserved (`http://localhost:5000`) |
| Replit preview (`*.replit.dev`) | n/a | protocol + port preserved |

## Cookie / CORS / subdomain rules

- **Session cookie** (`packages/auth/index.ts`, unchanged — verified correct):
  production is `HttpOnly; Secure; SameSite=Lax; Domain=.operatoros.net; Path=/`
  so the session is shared across every subdomain; dev omits `Domain` and
  `Secure` so localhost keeps working.
- **CORS**: production allows only same-site `*.operatoros.net` origins with
  credentials (no wildcard); dev additionally allows localhost/preview. A
  missing `Origin` (same-origin or non-browser callers like Stripe webhooks) is
  always permitted.
- **Module hosts**: the registry maps `techdeck` / `pulsedesk` /
  `tradeflowkit` (and every ecosystem module) to their module by host; `auth`
  and `app` are classified as platform surfaces, not modules; ports are
  normalized away; unknown `*.operatoros.net` hosts fall through to the
  controlled unknown-host page.

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
  "cookieDomainMode": "parent-domain",
  "cookieDomain": ".operatoros.net"
}
```

It returns no secrets, env values, or session data.

## Remaining risks

- **`OPERATOROS_BASE_URL` consistency.** Child module apps verify the SSO token
  `iss` against their own configured issuer. If they were previously validating
  the accidental `http://localhost:5000` value, they must now expect
  `https://operatoros.net` (or the shared explicit `OPERATOROS_BASE_URL`). Set
  `OPERATOROS_BASE_URL` identically on the hub and every child module.
- **DNS / custom-domain records** for each subdomain must exist and point at the
  deployment (out of scope for code — see `docs/replit-subdomain-checklist.md`).
- The `app` vs `root` split for billing return URLs assumes the authenticated
  console lives on `app.operatoros.net`. If billing screens move, revisit
  `resolveAppBaseUrl()` usage.
