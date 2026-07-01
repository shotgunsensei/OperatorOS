# OperatorOS Auth Hardening Notes

Phase: 3 - shared auth, session, and root admin enforcement audit.

Status: implemented central helpers and low-risk server-side hardening. No external modules were imported. Stripe billing behavior was not changed.

## Current Auth Behavior

- `apps/api/src/routes/auth-routes.ts` owns register, login, logout, profile, password reset, password change, email change, and account deletion routes.
- `apps/api/src/lib/auth.ts` owns password hashing, JWT signing/verification, `authenticate`, legacy `requireAdmin`, subscription preconditions, audit logging, failed-login lockout, and sanitized user output.
- API sessions use a custom HS256 JWT signed with `SESSION_SECRET`. The token payload includes `userId`, `email`, `role`, and optional `tokenVersion`.
- `SESSION_SECRET` is enforced at boot by `apps/api/src/lib/session-secret.ts`.
- `authenticate` accepts `Authorization: Bearer <token>` first, then falls back to the `token` cookie.
- Login, password change, and email change return the JWT in the response body and set the `token` cookie.
- Logout and account deletion clear the `token` cookie.
- The Next.js app middleware checks the `token` cookie before allowing `/app/*` shell routes.
- The frontend still reads/writes the JWT in `localStorage` for existing SPA calls and E2E coverage. This phase preserves that behavior.

## Current Authorization Behavior

- Platform-only routes are primarily protected by `requireSuperAdmin` in `apps/api/src/lib/tenant-auth.ts`.
- Tenant access is resolved by `resolveTenantContext`, with precedence: path `:tenantId`, `X-Tenant-Id`, then `users.current_tenant_id`.
- Cross-tenant and missing tenant access collapse to `404 TENANT_NOT_FOUND`.
- Tenant roles are enforced by `requireTenantRole`, `requireTenantOwner`, `requireTenantAdmin`, and `requireTenantMember`.
- Module launches are enforced server-side by `requireTenantModuleAccess` and the entitlement service. Module access is not only a frontend hiding rule.
- Platform Command routes remain under `/v1/platform/*` and are gated by `requireSuperAdmin`.

## Changes Made

- Added shared auth helpers in `packages/auth/index.ts`:
  - `getCurrentUser(request)`
  - `requireAuth(request)`
  - `requirePlatformAdmin(request)`
  - `isRootSuperAdmin(user)`
  - `hasPlatformAdminAuthority(user)`
  - `getSessionCookieOptions()`
  - `getSessionClearCookieOptions()`
- Added shared tenant helpers in `packages/tenants/index.ts`:
  - `getTenantContext(request)`
  - `isTenantMember(request, tenantId)`
  - `requireTenantMember(request, tenantId)`
  - `isTenantAdmin(tenantContext, user)`
- Added shared entitlement helpers in `packages/entitlements/index.ts`:
  - `hasModuleEntitlement(entitlements, moduleId)`
  - `requireModuleEntitlement(request, moduleId)`
- Updated `apps/api/src/lib/rbac.ts` to centralize platform admin authority through the shared auth helper.
- Updated `requireSuperAdmin`, tenant context resolution, suspended tenant bypasses, and tenant module access bypasses to use effective platform admin authority.
- Updated module entitlement resolution and SSO snapshot output so the root account is represented as `platformRole: 'super_admin'` when effective root authority applies.
- Updated module debug and handoff routes, tenant switching, billing add-on tenant authorization, OS/workspace routes, and platform admin stats/last-admin checks to use the central authority helper.
- Updated auth cookie issuance and clearing to use the shared session cookie options.
- Added focused tests for root-admin predicates and shared session cookie behavior.

## Root Admin Enforcement

`john@shotgunninjas.com` is now treated as the root platform super-admin server-side by `isRootSuperAdmin(user)` and `hasPlatformAdminAuthority(user)`.

This is independent of frontend UI checks. Any API path using the centralized helper grants root platform authority when the authenticated user email normalizes to `john@shotgunninjas.com`, even if the stored `users.platform_role` value is `user`.

The existing database bootstrap still promotes configured super-admin accounts where applicable. This phase does not remove that behavior.

## Subdomain Session Behavior

`getSessionCookieOptions()` now targets:

- `HttpOnly: true`
- `Secure: true` in production
- `SameSite: Lax`
- `Domain: .operatoros.net` in production
- `Path: /`
- `Max-Age: 604800` seconds

Local development fallback:

- no `Domain` attribute
- `Secure: false` unless `NODE_ENV=production`
- same `HttpOnly`, `SameSite=Lax`, `Path=/`, and max-age behavior

This prepares the session cookie for `app.operatoros.net`, `auth.operatoros.net`, `api.operatoros.net`, and `<module>.operatoros.net` once production hosts are deployed under the shared parent domain.

## Remaining Concerns

- The frontend still mirrors the JWT into `localStorage`. That should be reduced or removed in a later SSO/session phase after all browser API calls rely on the HttpOnly cookie path.
- Root-admin authority still requires an authenticated user record with the root email. This phase does not seed or create that user.
- `apps/api/src/lib/saas-db-init.ts` still contains bootstrap checks against stored `platformRole === 'super_admin'`. Those are seed/idempotency checks, not request authorization gates.
- Production cookie sharing assumes HTTPS and hosts under `operatoros.net`. A non-OperatorOS production/staging parent domain would need an explicit config extension in a later phase.
- The current SSO handoff token flow remains separate from shared parent-domain session consumption by child modules.
- Some legacy `users.role` admin behavior remains in older account/subscription helpers. Platform authority should continue moving to `platformRole` plus root authority only.

## Commands Verified

- `pnpm --filter ./apps/api typecheck` - passed.
- `C:\Dev\OperatorOS\apps\api\node_modules\.bin\tsx.cmd --test --test-concurrency=1 test/rbac-predicates.test.ts test/auth-session-cookie.test.ts` - passed, 8 tests.
- `rg -n "setCookie\('token'|clearCookie\('token'|platformRole === 'super_admin'|platformRole !== 'super_admin'|isSuperAdmin\(user\.platformRole\)" apps/api/src apps/api/test packages -g "*.ts"` - verified no request-authorization direct checks remain outside the central helper and bootstrap/snapshot cases.

## Failed Or Skipped Checks

- `pnpm --dir apps/api exec tsc ...` failed because this workspace invocation did not resolve `tsc` on PATH.
- `pnpm --dir apps/api exec tsx ...` failed because this workspace invocation did not resolve `tsx` on PATH.
- Full API test suite was not run in this phase; targeted helper/RBAC tests and API typecheck were run.

## Exact Next-Step Recommendation

Phase 4 should add host-based subdomain routing middleware and SSO launch/consume wiring that consumes the centralized module registry and shared session-cookie contract without moving module source code yet.
