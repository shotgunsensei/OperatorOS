# `@operatoros/entitlements` Placeholder

Reserved package boundary for future entitlement helpers.

No package manifest or runtime code is added in Phase 1. Current production
entitlement logic remains in:

- `apps/api/src/lib/entitlement-resolver.ts`
- `apps/api/src/lib/entitlement-service.ts`
- `apps/api/src/routes/entitlement-routes.ts`
- `apps/api/src/lib/product-entitlements.ts`
- `apps/api/src/lib/entitlement-propagation.ts`

Future extraction must preserve `resolveEntitlements(userId, tenantId)` as the
single source of truth for module access decisions.
