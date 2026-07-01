# OperatorOS Entitlement Contract

Status: Phase 1 structure-preparation contract. This document does not change
billing or entitlement logic.

## Entitlement Names

Module entitlement identity is based on the module slug from the OperatorOS
module registry.

Current central registry ids include:

- `operatoros`
- `techdeck`
- `tradeflowkit`
- `torqueshed`
- `pulsedesk`
- `faultlinelab`
- `ninja-pool-hall`
- `brandforgeos`
- `snapproofos`
- `studyforge-ai`
- `ninja-launch-kit`
- `callcommand-ai`
- `ninjamation`

Subdomain labels may differ from slugs. For example, `brandforge.operatoros.net`
maps to the `brandforgeos` module slug. Slugs remain the entitlement authority.

## Tenant Access Checks

Every module access decision must include:

- Authenticated OperatorOS user.
- Active OperatorOS tenant.
- Verified tenant membership unless the caller is a platform super-admin.
- Tenant status check.
- Module row lookup by slug.
- Tenant module status check.
- Per-user module access row check.
- Plan, add-on, or override access source.

Tenant context resolution should follow the current API precedence:

1. `:tenantId` route parameter.
2. `X-Tenant-Id` header.
3. `users.current_tenant_id`.

Cross-tenant access should avoid tenant existence leaks.

## Root Super-Admin Override

Platform super-admin authority comes from `users.platform_role = 'super_admin'`.

Root super-admin behavior:

- Server-side checks are authoritative.
- UI checks are secondary affordances only.
- A platform super-admin may inspect tenant/module state through controlled
  server routes.
- Super-admin tenant bypass must preserve `viaPlatformRole` or equivalent audit
  visibility.
- Super-admin override must not silently grant ordinary users access.

The canonical root account policy is defined by the OperatorOS platform, not by
individual modules.

## Access Sources

Valid access sources include:

- `plan`: included through the tenant owner's active plan.
- `addon`: purchased module add-on.
- `override`: explicit admin override.
- `admin_role`: platform super-admin path.
- `null`: no access source.

Modules should display source information only when useful and safe. Modules
must not use source labels to bypass `enabled === true`.

## Access Denied Behavior

Access denied behavior must be explicit and safe:

- Unauthenticated: redirect to OperatorOS auth or return `401`.
- No tenant context: return a tenant selection or `404 TENANT_NOT_FOUND`.
- Not a tenant member: return `404 TENANT_NOT_FOUND` where practical.
- Suspended tenant: return a suspended-tenant state.
- Module not enabled for tenant: return an access denied or upgrade state.
- Explicit user revoke: return access denied.
- Missing paid entitlement: return upgrade or request-access state.
- Platform route without `super_admin`: return `403 PLATFORM_ROLE_REQUIRED`.

Do not return stack traces, raw SQL errors, secret values, or cross-tenant data
in access-denied responses.

## Canonical Snapshot

The canonical tenant/module entitlement decision comes from:

```text
apps/api/src/lib/tenant-entitlements.ts
```

The canonical UI entitlement snapshot comes from:

```text
apps/api/src/lib/entitlement-resolver.ts
```

Modules should branch on each module entry's `enabled` value for launch/access
decisions. Role aliases and feature flags are supporting context, not a
replacement for the final enabled decision.

## Current Repo Anchors

- `packages/modules/registry.ts`
- `apps/api/src/lib/tenant-entitlements.ts`
- `apps/api/src/lib/entitlement-resolver.ts`
- `apps/api/src/lib/entitlement-service.ts`
- `apps/api/src/lib/tenant-auth.ts`
- `apps/api/src/routes/entitlement-routes.ts`
- `apps/api/src/routes/module-routes.ts`
- `apps/api/src/lib/product-entitlements.ts`
- `docs/entitlements.md`
- `docs/MODULE_SSO.md`
