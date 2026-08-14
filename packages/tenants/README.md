# `@operatoros/tenants` Placeholder

Reserved package boundary for future tenant helpers.

No package manifest or runtime code is added in Phase 1. Current production
tenant logic remains in:

- `apps/api/src/lib/tenant-auth.ts`
- `apps/api/src/routes/tenant-routes.ts`
- `apps/api/src/routes/tenant-admin-routes.ts`
- `apps/api/src/schema.ts`

Future extraction must preserve tenant membership checks, cross-tenant
non-enumeration behavior, suspended/archived tenant handling, and
super-admin audit visibility through `viaPlatformRole`.
