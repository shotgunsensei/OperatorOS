# OperatorOS Entitlement Test Plan

Status: Phase 6 test plan. This plan covers the shared tenant and module
entitlement model before Stripe billing consolidation or module imports.

## Automated Checks Added

`apps/api/test/tenant-entitlement-model-static.test.ts`

Verifies:

- The central helper exports the required Phase 6 functions.
- The helper references server-side platform admin authority.
- The helper still enforces tenant entitlement and seat capacity.
- Legacy launchpad entitlement service delegates to `resolveTenantModuleAccess`.
- Tenant route guards delegate to `requireTenantModuleAccess`.
- SSO routes use `resolveTenantModuleAccess` instead of directly checking only
  the older product-entitlement helper.
- The internal Shotgun Ninjas bootstrap seeds TechDeck, PulseDesk, and
  TradeFlowKit entitlements without adding Stripe wiring.

Existing static coverage:

- `apps/api/test/product-entitlement-contract.test.ts`

## Database Test Cases To Add

Add DB-backed tests when the test database is available:

- `getUserTenants` returns only tenants where the user has membership.
- `getTenantMembership` returns owner/admin/member roles and returns null for
  non-members.
- `getTenantEntitlements` returns active entitlement rows and tenant module rows.
- `tenantHasModuleEntitlement` returns true for enabled `tenant_modules`.
- `tenantHasModuleEntitlement` returns true for active `tenant_entitlements`.
- `tenantHasModuleEntitlement` returns true for owner active-plan fallback.
- Disabled `tenant_modules` rows deny access.
- Explicit `tenant_user_module_access.access_level = 'none'` denies access.
- Explicit user and manager grants allow access.
- `allowAllMembers` allows ordinary tenant members.
- Missing membership is denied without leaking tenant data.
- Suspended tenants are denied for normal users.
- Root platform admin is allowed server-side.
- `grantModuleEntitlement` creates or updates `tenant_modules`.
- `grantModuleEntitlement` creates or updates active `tenant_entitlements`.
- `revokeModuleEntitlement` disables tenant module access and deactivates
  entitlement rows.
- Grant/revoke helpers write audit log events when `actorUserId` is supplied.

## Manual Verification

Use these checks after applying migrations/seeds in a local or staging database:

1. Log in as `john@shotgunninjas.com`.
2. Confirm the current tenant can be set to `Shotgun Ninjas Productions`.
3. Confirm TechDeck, PulseDesk, and TradeFlowKit resolve as launchable.
4. Create or use a normal tenant user without entitlements.
5. Confirm the same modules are denied for the normal user.
6. Grant a module entitlement to the tenant through the helper or admin route.
7. Confirm launch and route access both allow the newly granted module.
8. Revoke the entitlement.
9. Confirm launch and direct route access both deny the module.

## Regression Gates

Before moving into module import work, run:

```powershell
pnpm --dir apps/api typecheck
.\node_modules\.bin\tsx.CMD --test apps/api/test/product-entitlement-contract.test.ts apps/api/test/tenant-entitlement-model-static.test.ts
```

If a live database is configured, also run the broader API test suite:

```powershell
pnpm --dir apps/api test
```

Record whether database tests were run, skipped, or blocked by missing
`DATABASE_URL` or local Postgres availability.
