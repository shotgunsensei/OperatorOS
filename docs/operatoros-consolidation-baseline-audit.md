# OperatorOS Consolidation Baseline Audit

Date: 2026-07-01

Phase: 0 - repository safety, baseline audit, and migration readiness.

Scope: documentation only. No module migration, route migration, schema change, or runtime code change was performed.

## Current Architecture Summary

OperatorOS is already organized as a pnpm workspace monorepo. The current system has three runnable apps and shared packages:

- `apps/api`: Fastify API, database bootstrap, auth, SSO, tenants, billing, entitlements, module registry/admin routes, CDE/workspace routes, and module-local API shells.
- `apps/web`: Next.js app router frontend for the public marketing surface, login, command center, platform command, module marketplace/launch pages, pricing, and internal module shells.
- `apps/runner-gateway`: Fastify/WebSocket runner gateway for workspace execution in local Docker or Kubernetes-style runner modes.
- `packages/sdk`: shared product, module catalog, ecosystem registry, host detection helpers, stack-pricing data, and API/event types.
- `packages/profiles`: runner profile definitions.
- `packages/agent-runtime`: deterministic verification-first task runner package.
- `infra`: Docker, k3d, and Kubernetes deployment assets.

The repository is already monorepo-style and does not need a wholesale restructuring before consolidation. The safer path is to add host-based routing and module-boundary conventions incrementally.

## Current App And Package Layout

Relevant package scripts:

- Root `dev`: `pnpm -r --parallel --filter ./apps/api --filter ./apps/runner-gateway --filter ./apps/web dev`
- Root `build`: `pnpm -r --filter ./apps/api --filter ./apps/runner-gateway --filter ./apps/web build`
- Root `start`: `pnpm -r --parallel --filter ./apps/api --filter ./apps/runner-gateway --filter ./apps/web start`
- Root `typecheck`: `pnpm -r --filter ./apps/api --filter ./apps/runner-gateway --filter ./apps/web typecheck`
- API `test`: `tsx --test --test-concurrency=1 test/*.test.ts test/*.test.tsx`
- Web `build`: `next build`
- Web `typecheck`: `tsc --noEmit`
- Runner `typecheck`: `tsc --noEmit`

Current frontend route surfaces include:

- Public/root: `/`, `/pricing`, `/apps`, `/apps/[slug]`, `/modules`, `/ecosystem`, `/portfolio`, `/john`, `/how-it-works`.
- Auth: `/login`, plus API-backed register/login/reset flows in the shared auth page/components.
- Command center: `/app`, `/app/platform/[[...slug]]`, `/app/apps/[slug]`, `/app/invites/[token]`.
- Legacy redirects: `/platform`, `/platform/:path*`, `/apps/:slug`, and `/invites/:token` redirect to `/app/*` equivalents.
- Admin health: `/admin/health`.
- Legacy admin URL: `/admin` redirects toward Platform Command behavior.

Current backend route groups are registered from `apps/api/src/index.ts`:

- `registerAuthRoutes`: `/v1/auth/*`
- `registerSaasRoutes`: `/v1/saas/*`
- `registerBillingRoutes`: `/v1/billing/*`
- `registerAiRoutes`: `/v1/ai/*`
- `registerModuleRoutes`: `/v1/modules/*`, `/v1/me/modules`, `/v1/modules/sso/consume`, legacy `/modules/sso/consume`
- `registerModuleShellRoutes`: module-local API shell endpoints, including CallCommand/Twilio webhook routes.
- `registerTenantRoutes`: `/v1/tenants`, `/v1/me/tenants`
- `registerTenantAdminRoutes`: tenant member, invite, module assignment, and tenant-admin operations.
- `registerPlatformRoutes`: `/v1/platform/*`
- `registerEntitlementRoutes`: `/v1/entitlements/me`, `/v1/sso/entitlements/introspect`, `/v1/sso/entitlements/sync`
- `registerEcosystemRoutes`: `/v1/ecosystem/modules`
- Root/workspace/CDE routes remain directly in `apps/api/src/index.ts`.

## Auth, Session, And SSO Findings

Current auth model:

- API auth is custom JWT-based auth using `SESSION_SECRET`.
- `SESSION_SECRET` is required at boot, must be at least 24 chars, and weak placeholder values are rejected.
- API issues a `token` cookie on login/register-sensitive flows:
  - `httpOnly: true`
  - `secure: true` only in production
  - `sameSite: 'lax'`
  - `path: '/'`
  - no explicit cookie `domain` is currently set.
- The web middleware protects `/app/:path*` by checking only for presence of the `token` cookie, then the API performs real JWT verification.
- Current shared session does not yet explicitly set `Domain=.operatoros.net`, so cross-subdomain parent-domain sessions are declared as a target architecture but not implemented.

Current SSO model:

- Module handoff uses `/v1/modules/:slug/handoff`.
- The handoff path checks tenant membership, module existence, module entitlement, module status, and `baseUrl`.
- Signed launch JWTs use `MODULE_SSO_SECRET` when configured.
- The consume endpoint is mounted at both `/v1/modules/sso/consume` and legacy `/modules/sso/consume`.
- The canonical entitlement snapshot comes from `resolveEntitlements(userId, tenantId)` and is reused by `/v1/entitlements/me`, S2S introspection, SSO consume enrichment, and entitlement webhooks.
- Service-to-service entitlement routes use one global `OPERATOROS_SERVICE_TOKEN`, accepted through `Authorization: Bearer` or `X-Service-Token`.

SSO risks before consolidation:

- `MODULE_SSO_SECRET` has an unsigned fallback path for module launches. Production consolidation should fail closed when the shared secret is missing or too short.
- `OPERATOROS_SERVICE_TOKEN` is global across receivers. The code comments already identify per-module credentials as a follow-up.
- Parent-domain cookie sharing is not yet implemented.
- `/auth.operatoros.net` is not currently a host-routed auth surface; `/login` is a path on the same Next app.

## Tenant, Role, And Admin Findings

Current role model:

- `users.role` still exists with `user` / `admin` values for legacy account classification.
- `users.platform_role` is the platform authority field and is constrained to `super_admin` / `user`.
- `tenant_users.role` is tenant-scoped and supports `owner`, `admin`, and `member`.
- `requireSuperAdmin` gates platform-only API routes by checking `users.platform_role === 'super_admin'`.
- `requireTenantRole` and `resolveTenantContext` enforce tenant membership and return 404 for missing/cross-tenant access to avoid tenant enumeration.
- Platform super-admins can inspect tenants through a synthetic owner role with `viaPlatformRole: true` for audit visibility.

Current root admin behavior:

- `seedPlansAndAdmin()` seeds an admin-style account from `ADMIN_EMAIL`, defaulting to `john@shotgunninjas.com` when unset.
- `bootstrapSuperAdmin()` promotes the email in `OPERATOROS_BOOTSTRAP_SUPER_ADMIN_EMAIL` to `platform_role='super_admin'`; when the env var is absent, it skips promotion.
- `fixShotgunTenant()` uses `OPERATOROS_BOOTSTRAP_SUPER_ADMIN_EMAIL`, then `ADMIN_EMAIL`, then `john@shotgunninjas.com` as the canonical owner email for the `shotgun-ninjas` tenant.
- Current server-side super-admin status for `john@shotgunninjas.com` is therefore not guaranteed unless the bootstrap env path has run or the DB was manually updated.

Admin risks before consolidation:

- The roadmap requirement says `john@shotgunninjas.com` must be treated as the root platform super-admin server-side. Current code supports that outcome through bootstrap/env, but the invariant is not guaranteed unconditionally.
- There is a code-defined fallback admin password in the seed path. Do not rely on it for production; require explicit secrets before live deployment.
- Some UI pages also check `platformRole`, but these are affordances only. The server-side `requireSuperAdmin` gates are the authority.

## Billing And Stripe Findings

OperatorOS already owns billing and entitlement state:

- Billing API routes live under `/v1/billing/*`.
- Stripe is enabled only when `STRIPE_SECRET_KEY` is present and `STRIPE_MODE` is `test` or `live`.
- Stripe webhook signature verification uses raw request body capture and `STRIPE_WEBHOOK_SECRET`.
- Billing supports local mode for development and Stripe mode for test/live.
- Plan catalog data is shared through `packages/sdk/src/catalog.ts`.
- Plan module inclusion is represented by `plan_modules`.
- Tenant module availability is represented by `tenant_modules`.
- Per-user module grants are represented by `tenant_user_module_access`.
- Subscription/add-on changes feed entitlement propagation.
- Admin billing recovery routes exist under Platform Command surfaces.

Relevant billing env families:

- Plans: `STRIPE_PRICE_STARTER_MONTHLY`, `STRIPE_PRICE_STARTER_ANNUAL`, `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_ANNUAL`, `STRIPE_PRICE_ELITE_MONTHLY`, `STRIPE_PRICE_ELITE_ANNUAL`, with legacy bare monthly fallback for some plan keys.
- Stack pricing: `STRIPE_PRICE_TRADEFLOWKIT_MONTHLY`, `STRIPE_PRICE_PULSEDESK_MONTHLY`, `STRIPE_PRICE_TECHDECK_MONTHLY`, `STRIPE_PRICE_COMPANION_MODULE_MONTHLY`, `STRIPE_PRICE_ADDITIONAL_SEAT_MONTHLY`.
- Add-ons: `STRIPE_PRICE_ADDON_<UPPER_SNAKE_SLUG>`, with explicit BrandForge legacy fallback.

Billing risks before consolidation:

- Modules must not add their own login, tenant, billing, subscription, or entitlement systems.
- Module migration must preserve Stripe webhook idempotency and centralized entitlement recompute.
- Child modules should consume entitlement snapshots or SSO claims, not infer plan access locally.
- Some product descriptions in the current module catalog drift from the intended ecosystem positioning and should be corrected before public subdomain expansion.

## Module Registry And Routing Findings

Current module sources of truth:

- `packages/sdk/src/catalog.ts` defines module slugs, names, default status, plan tier, component grouping, env URL keys, and add-on env keys.
- `packages/sdk/src/ecosystem.ts` derives platform domains and module subdomain URLs from the module catalog.
- `ecosystem.registry.json` materializes the current platform domains and module list.
- API seed code writes module rows and platform component rows into the database.
- Web module pages read API/module data and launch via OperatorOS handoff.

Current target domain declarations already exist:

- `operatoros.net`
- `app.operatoros.net`
- `api.operatoros.net`
- `admin.operatoros.net`
- `auth.operatoros.net`
- `docs.operatoros.net`
- `status.operatoros.net`
- `<module>.operatoros.net`, with explicit slug-to-subdomain overrides for BrandForgeOS, StudyForge AI, Ninja Launch Kit, and CallCommand AI.

Current routing behavior:

- Browser calls from the web app use `/api/:path*`.
- Next rewrites `/api/:path*` to `${INTERNAL_API_URL || NEXT_PUBLIC_API_URL}/v1/:path*`.
- Platform Command browser calls should use `/api/platform/*`, which rewrites to backend `/v1/platform/*`.
- Prior route-contract work explicitly avoids frontend `/api/v1/platform/*`, `/v1/v1/platform/*`, or raw browser `/v1/platform/*`.
- `detectOperatorOSHost(hostname)` exists in the SDK and can classify root/app/api/admin/module subdomains, but it is not wired into Next middleware or a host-based router yet.
- `docs/DOMAIN-MIGRATION.md` covers manual DNS/Replit migration for TechDeck subdomain routing, but this is infrastructure-level and not app-level host routing.

Routing risks before consolidation:

- Host-based subdomain routing is declared but not implemented as runtime routing.
- Parent-domain session behavior is not implemented yet.
- `api.operatoros.net` is declared, but current web rewrite behavior still depends on `INTERNAL_API_URL` or `NEXT_PUBLIC_API_URL`.
- API default port and docs are inconsistent in places: API code defaults to `5001`, while README/Replit guidance references `5000`. This should be normalized before relying on multi-host local verification.
- `apps/web/next.config.js` skips Next build type/lint enforcement and relies on `pnpm typecheck`; keep `pnpm typecheck` mandatory in release gates.

## Environment Variable Usage

Env vars referenced by source/tests/docs include:

- Core/runtime: `DATABASE_URL`, `SESSION_SECRET`, `PORT`, `NODE_ENV`, `APP_ENV`, `APP_URL`, `OPERATOROS_BASE_URL`, `OPERATOROS_API_URL`, `INTERNAL_API_URL`, `NEXT_PUBLIC_API_URL`, `MOBILE_BUILD`.
- Admin/bootstrap: `OPERATOROS_BOOTSTRAP_SUPER_ADMIN_EMAIL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `DEMO_EMAIL`, `DEMO_PASSWORD`, `SHOTGUN_TENANT_NAME`.
- SSO/S2S: `MODULE_SSO_SECRET`, `OPERATOROS_SERVICE_TOKEN`, `OPERATOROS_SSO_AUDIENCE`, `TRUST_PROXY`.
- Stripe/billing: `STRIPE_MODE`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, plan price vars, companion/additional-seat vars, and add-on price vars.
- Email: `RESEND_API_KEY`, `EMAIL_FROM`, `INVITE_FROM_EMAIL`, `INVITE_ACCEPT_BASE_URL`, `APP_BASE_URL`, `WEB_BASE_URL`.
- AI/telephony/module shells: `OPENAI_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `TWILIO_PUBLIC_BASE_URL`.
- Replit/runner: `REPL_OWNER`, `REPL_SLUG`, `REPLIT_CONNECTORS_HOSTNAME`, `REPL_IDENTITY`, `WEB_REPL_RENEWAL`, `RUNNER_MODE`, `WORKSPACE_VOLUME_BASE`, `ALLOW_UNSAFE_COMMANDS`.
- E2E/test-only: `E2E_API_URL`, `E2E_WEB_URL`, `TRADEFLOWKIT_TEST_TOKEN`.

Do not expose values for any of these variables in docs, logs, client bundles, or module code.

## Standalone Login Path Findings

Inside this repository, login and account management are centralized through OperatorOS:

- UI path: `/login`
- API paths: `/v1/auth/register`, `/v1/auth/login`, `/v1/auth/logout`, `/v1/auth/me`, `/v1/auth/forgot-password`, `/v1/auth/reset-password`, `/v1/auth/profile`, `/v1/auth/change-password`, `/v1/auth/change-email`, `/v1/auth/request-deletion`

No separate module-specific login system was found inside the OperatorOS repo. External module applications may still have their own auth systems, but those are outside this checkout and must be audited per module before consolidation.

## Known Risks

1. Root super-admin invariance is not guaranteed unless bootstrap/env state is correct.
2. Shared parent-domain sessions are not implemented yet because the auth cookie has no explicit `.operatoros.net` domain.
3. Host-based routing is present as SDK classification only, not as a Next/Fastify runtime router.
4. The SSO service-token model is global, not per-module.
5. Missing or weak `MODULE_SSO_SECRET` should fail closed in production before module subdomains become first-class.
6. CORS is currently configured with `origin: true` and credentials enabled; this needs a domain allowlist before multi-subdomain production.
7. API/web port assumptions are inconsistent between README, tests, and runtime defaults.
8. Some module catalog copy does not match the intended product positioning for the ecosystem.
9. Current public subdomain URLs are declared, but DNS/Replit linkage is manual and outside the codebase.
10. The current docs/env list should be refreshed as consolidation adds host routing, cookie-domain settings, and per-module credentials.

## Recommended Migration Sequence

1. Phase 1 - Root super-admin and environment hardening:
   - Make `john@shotgunninjas.com` a server-side root super-admin invariant without relying on UI checks.
   - Remove reliance on any code-defined production admin password fallback.
   - Normalize docs for local/prod ports and required env vars.

2. Phase 2 - Host-based routing foundation:
   - Wire `detectOperatorOSHost()` into Next middleware or a small host-router layer.
   - Keep route behavior inert on localhost/Replit preview hosts.
   - Add tests for `operatoros.net`, `app.operatoros.net`, `auth.operatoros.net`, `api.operatoros.net`, and module subdomains.

3. Phase 3 - Parent-domain session and auth split:
   - Add explicit secure cookie-domain configuration for `.operatoros.net`.
   - Keep API-side JWT verification as the authority.
   - Add CSRF-aware handling for credentialed cross-subdomain requests.
   - Make `auth.operatoros.net` a shared login/SSO surface.

4. Phase 4 - SSO and entitlement hardening:
   - Fail closed for unsigned SSO in production.
   - Move from one global `OPERATOROS_SERVICE_TOKEN` toward per-module service credentials.
   - Preserve `resolveEntitlements()` as the single authorization source.

5. Phase 5 - Module architecture conventions:
   - Define module-owned directories and API boundaries.
   - Keep modules from owning identity, sessions, tenants, roles, billing, entitlements, or super-admin logic.
   - Add acceptance tests for entitlement-gated module access.

6. Phase 6 - First module consolidation:
   - Choose one low-risk module.
   - Move feature workflows only.
   - Preserve OperatorOS-owned launch, tenant, entitlement, billing, and audit flows.

## Commands Verified

- `git status --short`: clean before documentation edits.
- `rg --files`: repository inventory captured.
- `pnpm typecheck`: passed for `apps/api`, `apps/runner-gateway`, and `apps/web`.
- `pnpm --dir apps/api exec tsx --test test/ecosystem-registry.test.ts test/platform-frontend-paths.test.ts test/platform-route-contract.test.ts`: failed because this Windows shell did not resolve `tsx` through `pnpm exec`.
- `.\node_modules\.bin\tsx.cmd --test apps\api\test\ecosystem-registry.test.ts apps\api\test\platform-frontend-paths.test.ts apps\api\test\platform-route-contract.test.ts`: initially failed because `SESSION_SECRET` is required at boot.
- `SESSION_SECRET=<test-only value> .\node_modules\.bin\tsx.cmd --test apps\api\test\ecosystem-registry.test.ts apps\api\test\platform-frontend-paths.test.ts apps\api\test\platform-route-contract.test.ts`: passed 19 tests.

## Skipped Checks

- Full `pnpm build` was not run for Phase 0 because only markdown documentation changed and the build would generate runtime artifacts unrelated to the audit.
- Full `apps/api` test suite was not run because many tests are database-backed and Phase 0 only needed targeted coverage for the ecosystem registry and Platform Command route contract.

## Exact Next-Step Recommendation

Proceed to Phase 1 before any module migration: harden the server-side root super-admin invariant, normalize the required env/port contract, and add regression coverage proving platform super-admin access is server-side and not a UI-only assumption.
