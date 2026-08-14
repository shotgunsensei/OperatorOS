# Admin Security Checklist

Use this checklist for OperatorOS admin console changes and before importing any module source.

## Server-Side Authority

- `/api/admin/*` frontend calls must resolve to `/v1/admin/*` backend routes.
- Every `/v1/admin/*` and direct `/api/admin/*` backend route must use `requireSuperAdmin`.
- Root super-admin authority must flow through `hasPlatformAdminAuthority`, which includes `isRootSuperAdmin`.
- `john@shotgunninjas.com` must not be checked only in React components or navigation.
- Do not rely on hidden buttons, hidden cards, or route labels as authorization.

## Tenant Isolation

- Tenant list and tenant detail are platform-admin-only.
- Tenant admins may manage only tenant-scoped surfaces, not the platform admin API.
- Normal users must not be able to list tenants, users, modules, entitlements, or audit logs.
- Entitlement grant and revoke must always include the target `tenantId`.
- Tenant-scoped module access must continue to use the shared tenant entitlement model.

## Entitlements

- Use `grantModuleEntitlement` for grants.
- Use `revokeModuleEntitlement` for revokes.
- Do not write directly to `tenant_modules` or `tenant_entitlements` from admin UI handlers.
- Do not create module-local entitlement systems.
- Do not grant Stripe-sourced entitlements from the admin console unless central billing owns that transition.

## Audit Logging

- Grant and revoke actions must create admin audit rows.
- Audit rows should include actor id, tenant id, target type/id, action, before/after where available, module slug, and safe metadata.
- Failure logs must not include request bodies, cookies, authorization headers, tokens, webhook payloads, or environment variables.
- Read-only audit log access must remain platform-admin-only.

## UI Safety

- Admin navigation can hide links for non-admins, but backend protection is mandatory.
- Error states should surface backend `status`, `code`, and message without leaking stack traces or secrets.
- Destructive actions should use clear labels and avoid accidental one-click permanent deletion where applicable.
- Module grant/revoke controls should refresh from server state after mutation.

## Verification Targets

- Root admin allowed.
- Normal user denied.
- Tenant admin denied from platform admin API and limited to tenant-owned routes.
- Entitlement grant updates tenant module access.
- Entitlement revoke disables tenant module access.
- Audit log records grant/revoke actions.
- Browser code calls `/api/admin/*`, not `/api/v1/admin/*` or `/v1/admin/*`.

## Remaining Phase 8 Risks

- Database-backed admin grant/revoke coverage still depends on local database availability and seeded tenants/modules.
- Tenant-admin self-service should remain separate from root platform administration until a formal delegated-admin policy is defined.
- Future billing consolidation must decide which admin-created entitlements can coexist with Stripe-managed entitlements.
