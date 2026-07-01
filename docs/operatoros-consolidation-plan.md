# OperatorOS Consolidation Plan

Phase: target architecture plan for subdomain-routed module consolidation.

Status: planning document only. No module has been migrated by this plan.

## Target Domain Model

OperatorOS remains the parent platform and control plane.

| Host | Responsibility |
| --- | --- |
| `operatoros.net` | Public/root brand surface, ecosystem positioning, pricing, and conversion pages. |
| `app.operatoros.net` | OperatorOS Command Center for authenticated users, tenants, launchpad, billing, and admin navigation. |
| `auth.operatoros.net` | Shared login, logout, password reset, SSO handoff initiation, and account recovery. |
| `api.operatoros.net` | Platform API under `/v1/*`, service-to-service endpoints, webhooks, SSO consume/introspect, billing, tenants, entitlements, and audit surfaces. |
| `<module>.operatoros.net` | Module surfaces. Modules own feature workflows, module UI, module-local settings, and module-local data only. |

## Non-Negotiable Ownership Boundary

OperatorOS owns:

- Identity and sessions.
- Tenants and tenant membership.
- Roles and platform super-admin authority.
- Billing, Stripe checkout, webhooks, subscriptions, add-ons, and seats.
- Entitlements and module access decisions.
- Module registry and launch metadata.
- SSO issue/consume/introspection.
- Audit logging for admin, billing, module launch, and entitlement changes.

Modules own:

- Module feature workflows.
- Module-specific UI.
- Module-specific settings.
- Module-local operational data.
- Receiver-side interpretation of OperatorOS entitlement snapshots.

Modules must not duplicate:

- Login.
- Billing.
- Tenant membership.
- Entitlement resolution.
- Root/super-admin policy.
- Subscription state.
- Stripe webhook handling.

## Current Foundation To Preserve

The current repo already has the right major building blocks:

- pnpm workspace monorepo.
- Fastify API with explicit route registration.
- Next.js app router frontend.
- Central module catalog in `packages/sdk/src/catalog.ts`.
- Ecosystem registry and host detector in `packages/sdk/src/ecosystem.ts`.
- Tenant-aware entitlement resolver in `apps/api/src/lib/entitlement-resolver.ts`.
- SSO handoff/consume route pair in `apps/api/src/routes/module-routes.ts`.
- Service-token-gated entitlement introspection and sync routes.
- Stripe/local billing mode with raw-body webhook verification.
- Platform super-admin route gates via `requireSuperAdmin`.
- Tenant role gates via `requireTenantRole`.
- Platform Command route contract: browser `/api/platform/*` rewrites to backend `/v1/platform/*`.

The consolidation should extend these pieces instead of replacing them.

## Proposed Repository Shape

Keep the existing workspace structure and add module boundaries inside it:

```text
apps/
  modules/            # Phase 1 reserved module consolidation root; docs only until migration
    techdeck/
    pulsedesk/
    tradeflowkit/
  api/
    src/
      routes/
      lib/
      modules/
        <module-slug>/
          routes.ts
          service.ts
          schema.ts
          tests/
  web/
    src/
      app/
      modules/
        <module-slug>/
          components/
          pages/
          api-client.ts
          module-config.ts
  runner-gateway/
packages/
  sdk/
  profiles/
  agent-runtime/
  auth/               # Phase 1 reserved package boundary; no package.json yet
  sso/
  tenants/
  entitlements/
  modules/
  ui/
  config/
  audit/
```

Rules for the proposed `modules/<module-slug>` folders:

- They may call OperatorOS API helpers.
- They may read entitlement snapshots.
- They may store module-local data only.
- They may not create separate user/session/billing/tenant tables unless explicitly approved for module-local non-authoritative data.
- Shared module registry data stays in `packages/sdk`.

Phase 1 intentionally creates README-only placeholders for future modules and
shared package boundaries. These directories do not contain `package.json`
files yet, so they are not active workspace packages and do not affect current
build, typecheck, or deployment behavior.

Phase 2 adds `packages/modules/registry.ts` as the metadata-only central
normalized module registry. It intentionally does not add a `package.json` yet,
so the active pnpm workspace remains unchanged and no module source code is
imported.

## Host-Based Routing Strategy

The current `detectOperatorOSHost(hostname)` helper should become the routing foundation.

Routing behavior:

- `operatoros.net` and `www.operatoros.net` render the public root surface.
- `app.operatoros.net` renders `/app` and authenticated command center routes.
- `auth.operatoros.net` renders shared auth flows.
- `api.operatoros.net` serves the Fastify API directly.
- `<module>.operatoros.net` resolves a module slug from the ecosystem registry and renders the corresponding module surface only after auth/entitlement checks.
- Localhost, Replit preview hosts, and foreign custom hosts remain inert unless explicitly configured.

Implementation guidance:

- Add host-routing tests before changing runtime behavior.
- Keep path-based routes working during migration.
- Do not break existing `/app/*` routes.
- Do not break the existing `/api/* -> /v1/*` rewrite contract.
- Do not introduce redirects from legacy domains until DNS and HTTPS are verified.

## Shared Session Strategy

Target session behavior:

- API remains the authority for JWT verification.
- Browser session cookie is HttpOnly, Secure in production, and scoped to `.operatoros.net` when running on the OperatorOS domain.
- Same-site policy remains explicit and tested.
- Auth redirects preserve `next` only for same-origin or known OperatorOS subdomain targets.
- Logout clears the parent-domain cookie across the ecosystem.

Required hardening:

- Add a safe env var for cookie domain, such as `OPERATOROS_COOKIE_DOMAIN=.operatoros.net`, with no default on localhost.
- Add tests for cookie options in production and development.
- Add CSRF review before enabling broad credentialed subdomain writes.

## Root Super-Admin Strategy

Target behavior:

- `john@shotgunninjas.com` is treated as the root platform super-admin server-side.
- UI checks remain secondary affordances only.
- The API and database state must enforce the invariant.
- Platform routes continue to use `requireSuperAdmin`.
- Bootstrap must be idempotent and auditable.

Recommended Phase 1 implementation:

- Centralize root-admin email policy in one server-side helper.
- Ensure bootstrap promotes the configured root email and the canonical root email.
- Add regression tests proving non-super-admins receive `403 PLATFORM_ROLE_REQUIRED`.
- Add regression tests proving the root account receives `platform_role='super_admin'` after bootstrap.
- Do not make root-admin status depend only on frontend `platformRole` checks.

## Entitlement-Gated Module Launch

Target launch flow:

1. User signs in through OperatorOS.
2. User selects an active tenant.
3. User opens a module from `app.operatoros.net` or directly visits `<module>.operatoros.net`.
4. OperatorOS resolves tenant context.
5. OperatorOS resolves entitlements through `resolveEntitlements(userId, tenantId)`.
6. If allowed, OperatorOS issues or verifies the module session/handoff.
7. The module renders only the feature surface the entitlement snapshot allows.
8. Every denied launch returns an explicit, non-leaky error state.

Required constraints:

- Branch on `enabled` from the entitlement snapshot for launch decisions.
- Preserve `tenant.viaPlatformRole` for super-admin audit visibility.
- Keep module roles as aliases from OperatorOS, not module-invented roles.
- Record module launch intent and consume/confirmed-launch telemetry.

## Centralized Billing Strategy

Target behavior:

- `api.operatoros.net/v1/billing/*` remains the only billing API.
- Stripe webhooks stay centralized in OperatorOS.
- Modules never process Stripe webhooks directly.
- Modules never trust client-side billing state.
- Add-ons and module access are represented through OperatorOS entitlements.
- Pricing metadata remains tied to the module registry and plan catalog.

Before module migration:

- Confirm all module UI paths read billing/upgrade state from OperatorOS.
- Confirm checkout failure states are explicit when Stripe env vars are absent.
- Keep local billing mode as a development fallback only.

## Audit Logging Strategy

Audit logs should cover:

- Root/super-admin bootstrap and platform admin actions.
- Tenant lifecycle changes.
- Tenant member and role changes.
- Module enable/disable and per-user grant changes.
- Billing checkout, webhook, resync, and DLQ retry actions.
- SSO handoff issued, rejected, consumed, and diagnose actions.
- Module subdomain direct-access denials.

Use the existing `admin_audit_logs`, `billing_events`, `activity_feed`, and SSO audit helpers where possible.

## Migration Phases

### Phase 0 - Baseline Audit

Deliverables:

- `docs/operatoros-consolidation-baseline-audit.md`
- `docs/operatoros-consolidation-plan.md`

No code migration.

### Phase 1 - Root Super-Admin And Env Contract

Goals:

- Enforce the root super-admin invariant server-side.
- Normalize production-required env docs.
- Resolve API/web port assumptions in docs and scripts.
- Add focused regression tests.

Acceptance criteria:

- Root admin bootstrap is idempotent.
- `john@shotgunninjas.com` ends up as `platform_role='super_admin'` server-side.
- Platform Command API routes still reject non-super-admins.
- No secrets are hardcoded or exposed.

### Phase 2 - Host Router Skeleton

Goals:

- Wire host detection into web routing/middleware.
- Keep existing path routes operational.
- Add host-classification and route-selection tests.

Acceptance criteria:

- Root/app/auth/module hosts classify correctly.
- Localhost and Replit preview hosts remain inert.
- No module business logic is migrated yet.

### Phase 3 - Shared Parent-Domain Session

Goals:

- Add explicit cookie domain configuration.
- Make auth redirects safe across known OperatorOS hosts.
- Add logout clearing for parent-domain cookies.

Acceptance criteria:

- `app.operatoros.net` and module subdomains can share the session cookie in production config.
- Localhost development still works.
- API remains the JWT authority.

### Phase 4 - SSO And Service Credential Hardening

Goals:

- Fail closed for unsigned SSO in production.
- Begin per-module service credential model.
- Preserve legacy consume alias where required.

Acceptance criteria:

- Missing `MODULE_SSO_SECRET` cannot silently launch modules in production.
- S2S calls remain denied when credentials are missing or invalid.
- Existing receiver integrations keep working until explicitly migrated.

### Phase 5 - Module Boundary Framework

Goals:

- Add module folder conventions.
- Add shared module loader/config helpers.
- Define module-local storage rules.

Acceptance criteria:

- Modules can register UI/API workflows without owning platform systems.
- Entitlement checks are reusable and tested.
- Module routes have empty/loading/error/denied states.

### Phase 6 - First Module Consolidation

Goals:

- Migrate one module surface into the OperatorOS project.
- Keep OperatorOS-owned auth, billing, tenancy, and entitlements unchanged.
- Verify direct subdomain and command-center launch paths.

Recommended first candidate:

- Use the lowest-risk internal module shell or TechDeck only after DNS/HTTPS and host routing are verified.

Acceptance criteria:

- Module renders from `<module>.operatoros.net`.
- Module also launches from `app.operatoros.net`.
- Unauthorized and unentitled users are denied cleanly.
- Existing platform billing and tenant behavior is unchanged.

## Test Strategy

Required test classes before consolidation:

- Unit tests for host detection and host-to-module resolution.
- Middleware tests for protected app/module paths.
- API tests for `requireSuperAdmin`.
- API tests for tenant membership and cross-tenant non-enumeration.
- SSO tests for handoff, consume, bad signature, expired token, wrong audience, and replay.
- Entitlement tests for plan, add-on, override, and revoked access.
- Billing tests for Stripe disabled, checkout env missing, webhook idempotency, and entitlement propagation.
- E2E smoke for sign in -> tenant switch -> launch entitled module -> deny unentitled module.

Keep `pnpm typecheck` mandatory because the web build intentionally skips Next's built-in type/lint enforcement.

## Exact Next Step

Start Phase 1. Do not migrate a module yet. First make root super-admin behavior, env documentation, and route/port assumptions deterministic so every later subdomain/module phase rests on a stable control plane.
