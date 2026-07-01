# OperatorOS Tenant And Entitlement Model

Status: Phase 6 implementation notes. OperatorOS remains the authority for
users, tenants, roles, module access, root platform administration, audit hooks,
and future billing-driven entitlement changes.

## Schema Audit

The current API schema already contains the tables needed for the Phase 6 target
model. No new migration was added in this phase.

| Target concept | Current table or source | Phase 6 usage |
| --- | --- | --- |
| Users | `users` | Identity, status, active tenant, platform role, root-admin evaluation. |
| Tenants | `tenants` | Tenant record, owner, slug, status, tenant type. |
| Tenant members | `tenant_users` | Central tenant membership and tenant role source. |
| Roles | `users.platform_role`, `tenant_users.role` | Platform authority and tenant-scoped authority stay separate. |
| Modules | `modules`, `packages/modules/registry.ts` | DB module rows are entitlement authority; registry owns host/launch metadata. |
| Tenant modules | `tenant_modules` | Tenant-wide module enablement, status, source, and `allowAllMembers`. |
| User module access | `tenant_user_module_access` | Per-user explicit grant, manager grant, or explicit `none` deny. |
| Tenant entitlements | `tenant_entitlements` | Tenant-level entitlement rows for included apps, companion modules, system grants, and future billing grants. |
| Subscriptions | `subscriptions`, `plan_modules` | Existing plan fallback for the tenant owner's active or trialing plan. |
| SSO handoffs | `sso_handoff_tokens` | Already supports persisted handoff token state. |
| Audit logs | `admin_audit_logs` | Grant/revoke helpers write audit events when an actor is supplied. |

## Central Source Of Truth

The central tenant entitlement helper is:

```text
apps/api/src/lib/tenant-entitlements.ts
```

It exports:

- `getUserTenants(userId)`
- `getTenantMembership(userId, tenantId)`
- `getTenantEntitlements(tenantId)`
- `tenantHasModuleEntitlement(tenantId, moduleId)`
- `requireTenantModuleAccess(request, tenantId, moduleId)`
- `grantModuleEntitlement(tenantId, moduleId, source)`
- `revokeModuleEntitlement(tenantId, moduleId)`

Existing launchpad access checks, tenant route guards, and SSO entitlement checks
now delegate through this helper instead of maintaining separate decisions.

## Access Resolution

`resolveTenantModuleAccess(userId, tenantId, moduleId)` is the shared decision
engine behind the public helpers. It resolves module ids and slugs through the
database module table, then evaluates:

1. User exists and is active.
2. Module exists.
3. Platform admin/root authority through `hasPlatformAdminAuthority`.
4. Tenant exists and is not archived or suspended.
5. User is a tenant member.
6. Disabled or archived `tenant_modules` row denies access.
7. `tenant_user_module_access.access_level = 'none'` denies access.
8. Explicit user or manager grant allows access.
9. `tenant_modules.allow_all_members` allows tenant members.
10. Active `tenant_entitlements` row allows access when the user is within seat capacity.
11. Tenant owner's active or trialing subscription plus `plan_modules` allows access.
12. Otherwise the request is denied.

Root platform admins are allowed server-side through `hasPlatformAdminAuthority`
and receive manager-level module access. This is not a frontend-only bypass.

## Grant And Revoke Behavior

`grantModuleEntitlement` upserts:

- `tenant_modules` with the correct source/status mapping.
- `tenant_entitlements` with an active entitlement key matching the module slug.

When `actorUserId` is supplied, it writes
`tenant_module_entitlement_granted` to the audit log.

`revokeModuleEntitlement`:

- Marks the tenant module disabled when a row exists.
- Deactivates active tenant entitlement rows for that module slug.
- Writes `tenant_module_entitlement_revoked` when an actor is supplied.

This prepares billing webhooks to grant or revoke module access centrally in a
future phase without wiring Stripe in Phase 6.

## Seed And Dev Data

The existing launch bootstrap now ensures the canonical internal tenant:

```text
Shotgun Ninjas Productions
```

For the root account, the bootstrap grants tenant module access and active
tenant entitlements for:

- `techdeck`
- `pulsedesk`
- `tradeflowkit`

The seed is idempotent and admin-sourced. It does not insert Stripe price ids or
wire billing behavior.

## Remaining Risks

- `tenant_entitlements` and `tenant_modules` coexist during consolidation. The
  central helper reconciles both, but old call sites should continue migrating
  toward `tenant-entitlements.ts`.
- The owner-plan fallback preserves existing behavior while billing
  consolidation is pending. Phase 16 should replace or formalize this with
  tenant-owned subscriptions.
- Static contract tests verify wiring without requiring a local database. Full
  grant/revoke database coverage should be added once the local test database is
  standardized.

## Next Recommendation

Proceed to Phase 7: update the OperatorOS Command Center launchpad to read the
central registry and use `/api/sso/issue`, while relying on the shared tenant
entitlement helper for launchability and locked-state decisions.
