# OperatorOS Module Contract

Status: Phase 1 structure-preparation contract. No module is imported by this
document.

OperatorOS is the parent platform and control plane. Every module is a child
surface that runs inside OperatorOS authority.

## Module Ownership

A module may own:

- Module-specific user interface and workflows.
- Module-local API handlers that operate only after OperatorOS auth and
  entitlement checks.
- Module-local settings scoped by tenant and module slug.
- Module-local data tables or collections, when every tenant-owned record is
  scoped by the OperatorOS tenant id.
- Module-specific background jobs, if they carry tenant id, actor id, and module
  slug context.
- Module-specific health details, if they do not expose secrets.

A module must not own:

- User registration, login, password reset, or global session authority.
- Tenant creation, tenant membership, tenant role source of truth, or tenant
  switching authority.
- Platform `super_admin` policy or root-admin bootstrap logic.
- Stripe checkout, Stripe webhooks, subscription state, add-on source of truth,
  or billing recovery.
- Entitlement resolution.
- Module registry source of truth.
- Cross-module audit policy.
- Private OperatorOS environment variables.

## Required Module Shape

Future consolidated modules should expose these internal seams:

- `module-config`: slug, display name, feature flags, local route roots, health
  metadata, and required module-local env names.
- `routes` or `handlers`: server endpoints for module-local workflows.
- `components` or `pages`: UI entry points.
- `services`: module-local business logic.
- `data` or `schema`: tenant-scoped module-local persistence definitions when
  needed.
- `tests`: entitlement, tenant isolation, and smoke coverage.

The exact file names can adapt to the existing OperatorOS app structure, but
the boundaries must remain clear.

## Required Endpoints

For a future module mounted under OperatorOS, these endpoint classes are
expected:

- `GET /health` or equivalent module-local readiness check.
- `GET /me` or equivalent module-local session check that returns current
  OperatorOS user, tenant, module role, and entitlement summary.
- Module workflow endpoints, each protected by server-side tenant and module
  entitlement checks.
- Optional module settings endpoints, restricted to tenant owner/admin or
  module admin roles as appropriate.

These endpoints are module-local. They do not replace OperatorOS parent APIs
such as `/v1/auth/*`, `/v1/billing/*`, `/v1/modules/*`, or
`/v1/sso/entitlements/*`.

## Required Components

Every module UI should include:

- Authenticated default screen.
- Loading state while module session and entitlement state are checked.
- Empty state for no module-local data.
- Access denied state for missing entitlement or tenant access.
- Suspended tenant state when OperatorOS reports tenant suspension.
- Error state that does not leak stack traces or secrets.
- Mobile-safe layout for primary workflows.

## Health And Readiness

Module health should report:

- Module slug.
- Module version or build marker when available.
- Readiness of module-local dependencies.
- Whether OperatorOS parent API connectivity is configured.
- Whether module-local optional integrations are configured.

Module health must not report:

- Secret values.
- Full tokens.
- Customer data.
- Raw stack traces.
- Cross-tenant data.

## Data Isolation

Every module-owned record that belongs to a tenant must include the OperatorOS
tenant id. User-owned module records should include both `tenantId` and
`operatorosUserId`.

Never trust a tenant id from a browser request without verifying it against the
OperatorOS session or entitlement snapshot.

## Current Repo Anchors

Before implementing module code, inspect:

- `packages/modules/registry.ts`
- `packages/sdk/src/catalog.ts`
- `packages/sdk/src/ecosystem.ts`
- `apps/api/src/lib/tenant-auth.ts`
- `apps/api/src/lib/entitlement-resolver.ts`
- `apps/api/src/routes/module-routes.ts`
- `apps/api/src/routes/module-shell-routes.ts`
- `apps/web/src/middleware.ts`
- `apps/web/src/app/app/apps/[slug]/page.tsx`

Do not claim a module contract is implemented until the corresponding code path
exists and is tested.
