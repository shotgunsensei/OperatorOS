# OperatorOS Admin Console

Phase 8 establishes the OperatorOS admin console as the platform-owned surface for tenants, users, modules, entitlements, and audit review. OperatorOS remains the authority for identity, sessions, tenants, roles, billing, entitlements, module registry, and super-admin authority.

## Access Model

- Root platform admins and users with server-verified `platformRole = super_admin` can access the admin API.
- `john@shotgunninjas.com` is recognized server-side through the shared root super-admin helper, not through UI-only logic.
- Normal users and tenant admins are denied from `/api/admin/*` and `/v1/admin/*`.
- Tenant-admin self-service remains tenant-scoped and must not be expanded into platform-wide tenant or entitlement control.

## API Contract

Frontend calls use `/api/admin/*`. In the Next.js web app, `/api/:path*` rewrites to the backend `/v1/:path*`, so `/api/admin/tenants` reaches `/v1/admin/tenants`.

The API service also registers direct `/api/admin/*` aliases for local API-only smoke checks. Both prefixes use the same `requireSuperAdmin` server-side guard.

Current Phase 8 endpoints:

- `GET /api/admin/tenants`
- `GET /api/admin/tenants/:tenantId`
- `GET /api/admin/tenants/:tenantId/entitlements`
- `POST /api/admin/tenants/:tenantId/entitlements`
- `DELETE /api/admin/tenants/:tenantId/entitlements/:moduleId`
- `GET /api/admin/users`
- `GET /api/admin/modules`
- `GET /api/admin/audit-logs`

## Console Behavior

The existing Platform Command page remains the admin console shell. Tenant detail module actions now grant and revoke module entitlements through `/api/admin/tenants/:tenantId/entitlements`.

The console supports:

- Tenant list and tenant detail.
- Tenant members.
- Module status list per tenant.
- Entitlement grant and revoke.
- User list through the admin API.
- Module status list through the admin API.
- Tenant-scoped audit log review.
- Clear UI indication that Platform Command requires super-admin authority.

## Entitlement Grant and Revoke

Grant:

`POST /api/admin/tenants/:tenantId/entitlements`

Body:

```json
{
  "moduleId": "techdeck",
  "allowAllMembers": true,
  "source": "admin",
  "reason": "Internal provisioning"
}
```

Revoke:

`DELETE /api/admin/tenants/:tenantId/entitlements/:moduleId`

`moduleId` may be the module id or slug. Grant and revoke delegate to the central tenant entitlement helpers so module access, launch checks, and admin actions use one source of truth.

## Audit Logging

Grant and revoke actions use the central entitlement helpers, which write audit rows for:

- `tenant_module_entitlement_granted`
- `tenant_module_entitlement_revoked`

Admin route failure logging records sanitized route, method, actor id, status code, and backend error code. Request bodies, headers, cookies, tokens, Stripe payloads, and private environment variables are not logged by this route layer.

## Local Verification

Use these checks after Phase 8 changes:

```bash
pnpm --dir apps/api typecheck
pnpm --dir apps/web typecheck
pnpm exec tsx --test apps/api/test/admin-route-contract.test.ts apps/api/test/admin-console-static.test.ts
```

Database-backed grant and revoke tests require a configured development database and seeded tenants/modules.

## Next-Step Recommendation

Phase 9 should not import modules until this admin surface has been exercised against seeded data with a root admin account, a normal user, and at least one tenant admin. The highest-value manual check is granting and revoking `techdeck`, `pulsedesk`, and `tradeflowkit` for the Shotgun Ninjas Productions tenant, then confirming Command Center launch visibility follows those entitlements.
