# OperatorOS Subdomain Routing Contract

Status: Phase 5 implementation baseline. OperatorOS now has a central
host resolver in `packages/modules/registry.ts` and a Next.js middleware layer
in `apps/web/src/middleware.ts`. Real module source is still not imported.

## Target Host Model

| Host | Target behavior |
| --- | --- |
| `operatoros.net` | Public/root brand surface. |
| `www.operatoros.net` | Same as root. |
| `app.operatoros.net` | Authenticated OperatorOS Command Center. |
| `auth.operatoros.net` | Shared auth, recovery, and SSO entry surface. |
| `api.operatoros.net` | Fastify API under `/v1/*`. |
| `<module>.operatoros.net` | Module surface resolved through the OperatorOS registry. |

## Host-Based Routing

Host classification uses the central module registry in
`packages/modules/registry.ts`.

Implemented helpers:

- `normalizeHost(input)`: lowercases a host or URL and strips scheme, port,
  path, and trailing dot.
- `getHostSurface(host)`: classifies hosts as `root`, `app`, `auth`, `api`,
  `module`, or `unknown`.
- `getModuleByHost(host)`: resolves a production module host to the registry
  entry.
- `resolveModuleContext(request)`: resolves host, local fallback path, module,
  auth-cookie presence, registry status, entitlement decision when provided,
  and root platform admin override.

Implemented routing:

- `operatoros.net` and `www.operatoros.net` remain public/root surfaces.
- `app.operatoros.net/` rewrites to `/app` and requires the session cookie.
- `auth.operatoros.net/` rewrites to `/login`.
- `api.operatoros.net` is classified as the platform API host. API routing
  remains owned by deployment and the existing Next rewrite.
- `<module>.operatoros.net/*` rewrites to `/modules/<slug>`.
- `/modules/<slug>` is the local development fallback for module shell access.
- Active module fallback pages render the existing `/app/apps/<slug>` module
  shell, which still calls `GET /api/modules/:slug` for the authoritative
  tenant-scoped entitlement check.

## Default Fallback Behavior

Fallbacks must be safe:

- Foreign hosts remain inert and keep normal path-based behavior.
- Localhost and Replit preview hosts keep path-based behavior.
- Unknown `*.operatoros.net` hosts rewrite to `/modules/unknown-host` and show
  a controlled unknown-module state.
- Unknown local module slugs show the same controlled unknown-module state.
- Modules with a registry status other than `active` render a controlled
  unavailable state.
- Missing entitlement renders the existing not-accessible module state from
  `/app/apps/<slug>` after the backend denies `GET /api/modules/:slug`.
- Suspended or archived tenant states must stay enforced by the API tenant
  guard; the routing layer does not mask backend denials.

## Local Development Behavior

Local development should not require real wildcard DNS.

Supported local patterns:

- `localhost` or `127.0.0.1` with `/modules/<slug>`.
- Optional host-header simulation in tests.
- Optional local reverse proxy only after a dedicated routing phase.

Local development must not require setting `.operatoros.net` cookies.

## Production Subdomain Behavior

Production behavior should require:

- HTTPS for every OperatorOS platform and module host.
- Explicit cookie-domain configuration before shared parent-domain sessions are
  enabled.
- Explicit CORS allowlist for credentialed API calls.
- No early redirects from legacy domains until DNS, HTTPS, and app readiness
  are verified.
- Module host access must still pass OperatorOS auth and entitlements.

## Auth and Entitlement Gates

The Phase 5 middleware performs a presence-only session-cookie check. Full JWT,
tenant membership, module entitlement, role, suspended-tenant, and user-status
validation remains in the Fastify API.

Guard behavior:

- Anonymous `/app/*` traffic redirects to `/login?next=...`.
- Anonymous local `/modules/<slug>` traffic redirects to local `/login?next=...`.
- Anonymous production module subdomain traffic redirects to
  `auth.operatoros.net/login?next=...`.
- Root platform super-admin resolution is server-side through the shared auth
  helper; `john@shotgunninjas.com` is treated as platform admin by
  `hasPlatformAdminAuthority`.
- Entitlement checks are available in `resolveModuleContext(request)` when the
  caller supplies entitlement data, and remain authoritatively enforced by the
  module API route during web rendering.

## Current Routing Contract To Preserve

Current browser API calls use the Next.js rewrite:

```text
/api/:path* -> {INTERNAL_API_URL or NEXT_PUBLIC_API_URL}/v1/:path*
```

Platform Command browser calls must stay on:

```text
/api/platform/*
```

They must not emit:

```text
/api/v1/platform/*
/v1/v1/platform/*
raw browser /v1/platform/*
```

## Current Repo Anchors

- `packages/modules/registry.ts`
- `packages/sdk/src/ecosystem.ts`
- `apps/web/next.config.js`
- `apps/web/src/middleware.ts`
- `apps/web/src/app/modules/[slug]/page.tsx`
- `apps/api/test/ecosystem-registry.test.ts`
- `apps/api/test/operatoros-module-registry.test.ts`
- `apps/api/test/platform-frontend-paths.test.ts`
- `docs/DOMAIN-MIGRATION.md`
