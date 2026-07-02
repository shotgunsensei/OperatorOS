# PulseDesk OperatorOS Integration Plan

Phase 0 audit date: 2026-06-29

## Current State

PulseDesk is a React + Vite + TypeScript frontend with an Express backend, Drizzle ORM, PostgreSQL, and `express-session` backed by `connect-pg-simple`.

The current auth model is mixed:

- Local username/password auth in `server/routes/auth.ts`.
- Per-org Microsoft 365 / Entra auth config in `org_auth_config`, with JIT provisioning and role mappings.
- Session state in `req.session.userId`, `req.session.orgId`, and `req.session.authSource`.
- Org membership and role enforcement through `memberships`, `requireAuth`, `requireOrg`, `requireRole`, and `requireMinRole`.
- Super-admin access through `users.isSuperAdmin`, protected by `requireSuperAdmin`.

The current OperatorOS SSO receiver is now entitlement-aware:

- `GET /sso?token=...` is implemented in `server/routes/sso.ts`.
- JWT verification lives in `server/auth/operatoros-sso.ts`.
- Provisioning lives in `storage.provisionOperatorOsUser`.
- SSO columns are present in `users` and `orgs`, with migrations in `server/migrate.ts`.
- The receiver verifies HS256, issuer, audience, environment, token age, `module_slug`, `sub`, `user_id`, email, role, `plan_slug`, and `organization_id`.
- The receiver calls `consumeToken()` before creating a child session.
- The receiver prefers `OPERATOROS_SSO_CONSUME_URL`, falls back to safe `OPERATOROS_API_URL` consume URL resolution, and does not append duplicate `/api` or `/v1` path segments.
- The receiver preserves successful consume JSON when present and uses JWT/consume entitlement signals for tenant id, plan slug, target module status, and local role mapping.
- The receiver stores OperatorOS user/org identifiers and plan metadata. OperatorOS `super_admin` or the master-admin email maps to local `isSuperAdmin=true` and tenant `owner`; OperatorOS `admin` maps to tenant `admin`; `member`/`user` map to `staff` unless entitlement claims explicitly grant owner/admin/module-admin/manager access.
- Phase 2 adds `operatoros_entitlement_snapshots` as the local cache for OperatorOS canonical snapshots, keyed by `(operatoros_user_id, operatoros_tenant_id, module_slug)`.
- SSO sessions store local PulseDesk ids plus OperatorOS user id, tenant id, module slug, and snapshot id. The raw OperatorOS JWT is never stored in the child session.
- Protected OperatorOS sessions are rejected on the next authenticated request if the cached snapshot is disabled, revoked, or missing for a tenant-aware OperatorOS session.

The current billing and entitlement model is OperatorOS-owned:

- OperatorOS SSO and entitlement snapshots are the source of truth for PulseDesk access.
- Backend feature gates for Entra, email-to-ticket, member limits, ticket limits, email processing, IMAP polling, and connector polling now read OperatorOS entitlement snapshots.
- `server/routes/billing.ts`, `server/stripeClient.ts`, `server/webhookHandlers.ts`, `server/services/billingSync.ts`, `server/config/billingConfig.ts`, and `shared/billingConfig.ts` remain as deprecated legacy rollback code, but the billing router, Stripe webhook route, and Stripe startup sync are not registered in production runtime.
- The `/billing` route, Billing sidebar item, PulseDesk pricing page, local checkout calls, local billing portal calls, and plan upsell cards have been removed from the active UI.

The current master admin model is email-based:

- `PULSEDESK_MASTER_ADMIN_EMAIL` configures master-admin identities and always includes `john@shotgunninjas.com` by default.
- `server/seed.ts` no longer creates a source-defined production super-admin username/password.
- Existing users whose normalized email matches the configured master-admin list are promoted to `isSuperAdmin=true`.
- OperatorOS SSO provisioning promotes configured master-admin emails to local `isSuperAdmin=true` and tenant `owner`.
- Demo/reviewer users require explicit seed flags and password env vars.
- Master-admin demotion, deletion, and tenant-membership removal are blocked through the admin APIs and tenant membership APIs.

## OperatorOS Contract Mismatches

The copied OperatorOS docs make OperatorOS the access authority, not just the identity provider:

- `MODULE_SSO.md` expects SSO to carry an entitlement snapshot including `operatoros_tenant_id`, tenant role aliases, subscription status, `target_module_enabled`, `target_module_access_level`, `target_module_role`, `target_module_features`, and `all_enabled_modules`.
- PulseDesk currently accepts the older identity-shaped claims: `organization_id`, `role`, and `plan_slug`.
- `CHILD_APP_ENTITLEMENT_PROMPT.md` requires cached entitlement snapshots, stale snapshot refresh, webhook revocation, and S2S introspection.
- PulseDesk now has an OperatorOS entitlement cache, signed webhook receiver, service-token introspection, boot-time webhook registration, and OperatorOS-owned UI copy for access state.
- `sso-module-access.md` says child apps must not recreate feature-level pricing checks.
- PulseDesk no longer uses local Stripe checkout, portal, or plan comparisons as active production access paths.
- `operatoros-env-vars.md` centralizes PulseDesk pricing in OperatorOS with `STRIPE_PRICE_PULSEDESK_MONTHLY`; PulseDesk only consumes the resulting module entitlement state.
- `child-sso-integration-prompt.md` and `MODULE_SSO.md` both require `/sso` and HS256 verification, but they differ on consume URL/body expectations. PulseDesk currently posts to `OPERATOROS_API_URL` as a full URL with `{ jti, aud, env }` because prior live validation found the deployed consume path at `https://operatoros.net/api/modules/sso/consume`.
- Phase 1 keeps the verified `{ jti, aud, env }` consume body and supports either the legacy alias or versioned consume endpoint, but the preferred child-app configuration is now an explicit full consume URL in `OPERATOROS_SSO_CONSUME_URL`.

## Target State

OperatorOS is the source of truth for PulseDesk launch access, subscription status, module role, feature flags, and entitlement revocation.

PulseDesk keeps its healthcare workflow data, org-scoped records, local role enforcement, and session cookie, but it no longer treats local Stripe state as the authority for whether a tenant can use PulseDesk capabilities.

Target auth and entitlement behavior:

- `/sso` accepts OperatorOS launches, verifies HS256, validates `aud` and `module_slug === pulsedesk`, enforces TTL/replay/consume, and creates only a PulseDesk child session.
- PulseDesk stores OperatorOS user id, tenant id, tenant role alias, module role, subscription status, feature map, all enabled module slugs, and `computedAt`.
- `target_module_enabled === false` prevents a working PulseDesk session and redirects to a locked or relaunch view.
- Sensitive feature checks use the cached OperatorOS module snapshot first.
- Stale snapshots are refreshed through `GET {OPERATOROS_API_URL}/v1/sso/entitlements/introspect?user_id=...&tenant_id=...` with `OPERATOROS_SERVICE_TOKEN`.
- `POST /webhooks/operatoros/entitlements` verifies `X-Operatoros-Signature` with `MODULE_SSO_SECRET`, updates cached entitlement state, and revokes access when PulseDesk is disabled or missing from the module list.
- Local plan gates are deprecated legacy fallback code only; active production access and feature checks should use OperatorOS entitlement snapshots.

Target admin behavior:

- Keep `john@shotgunninjas.com` as the default configured master-admin email.
- Promote configured master-admin emails only by normalized email, never by hardcoded username/password.
- Block self-demotion, configured-master demotion/deletion, and configured-master membership removal.
- Audit every master-admin action with actor id/email, target tenant/user, before/after values, and success/failure.

## Migration Phases

### Phase 0: Baseline Stabilization

- Keep behavior unchanged.
- Fix compile-only interface drift.
- Document the current contract map and target migration path.
- Verify `npm run check` and `npm run build`.

### Phase 1: SSO Receiver Hardening And Session Normalization

- Enforce `/sso?token=...` as the production login path.
- Reject missing tokens with `400 { "code": "missing_token" }`.
- Require HS256 only, reject `alg=none`, normalize issuer trailing slashes, enforce audience/module slug, environment, issued-at, expiration, and a 90-second max token age.
- Make consume mandatory before local session creation.
- Preserve consume JSON and use entitlement snapshot signals for target-module denial and role mapping.
- Recognize `john@shotgunninjas.com` and `PULSEDESK_MASTER_ADMIN_EMAIL` as master-admin identities only after OperatorOS authentication.
- Gate local username/password register/login behind `PULSEDESK_LOCAL_AUTH_ENABLED=true` for development or reviewer workflows.
- Keep `requireSuperAdmin` and admin routes intact during the transition.

### Phase 1B: Safe Local Master Admin Bootstrap

- Replace `ensureSuperAdmin()` hardcoded username/password behavior.
- Add an idempotent local bootstrap path keyed by normalized email if an emergency local fallback is still needed.
- Add audit entries for bootstrap promotion and super-admin toggles.

### Phase 2: Entitlement Snapshot Cache, Introspection, And Webhooks

- Add local storage for OperatorOS entitlement snapshots keyed by `(operatorOsUserId, operatorOsTenantId, moduleSlug)`.
- Store `computedAt`, `subscriptionStatus`, `moduleEnabled`, `moduleRole`, `accessLevel`, feature map, raw snapshot metadata, and revocation timestamp.
- Cache SSO consume snapshots and attach only snapshot metadata to the PulseDesk session.
- Add `POST /webhooks/operatoros/entitlements` with raw-body HMAC verification using `X-Operatoros-Signature: sha256=<hex>`.
- Ignore stale snapshots where incoming `computedAt` is older than the cached value.
- Treat a missing PulseDesk module entry or `enabled=false` as revocation.
- Add service-token introspection through `GET {OPERATOROS_BASE_URL}/v1/sso/entitlements/introspect?user_id=...&tenant_id=...`, or `OPERATOROS_ENTITLEMENTS_INTROSPECT_URL` when configured. Legacy alias `OPERATOROS_INTROSPECTION_URL` is also accepted.
- Register the webhook idempotently on boot when `OPERATOROS_SERVICE_TOKEN`, `OPERATOROS_BASE_URL`, and a public app base URL are configured.
- Replace backend plan-derived gates for Entra, email-to-ticket, ticket limits, member limits, and pollers with OperatorOS snapshot checks. A valid enabled PulseDesk module unlocks core behavior unless OperatorOS sends an explicit false feature flag or numeric limit.

### Phase 3: Master Admin Control Plane

- Centralize master-admin config in `server/config/masterAdmin.ts`.
- Remove production reliance on the legacy source-defined local super-admin seed flow.
- Require `ENABLE_DEMO_SEEDS=true` plus `PULSEDESK_DEMO_PASSWORD` for demo data.
- Require `ENABLE_LOCAL_REVIEWER=true` plus `PULSEDESK_REVIEWER_PASSWORD` for reviewer account creation.
- Expand `/api/admin/*` for tenant summaries, support context switching, tenant profile edits, membership roles/removal, invites, entitlement snapshots, inbox failures, connector actions, and audit visibility.
- Refresh `client/src/pages/admin.tsx` into tabs for Tenants, Users, Entitlements, Inboxes, Audit, and System Health.

### Phase 4: Remove PulseDesk-Owned Pricing And Billing

- Remove the `/billing` frontend route and Billing sidebar item.
- Delete the local billing page and remove local pricing, checkout, billing portal, upgrade, and plan-comparison UI.
- Stop registering `billingRouter`.
- Stop registering the local Stripe webhook route.
- Stop running Stripe sync on startup.
- Remove active admin plan mutation and billing overview endpoints.
- Keep Stripe files and DB columns as deprecated legacy rollback code only.
- Keep README and docs clear that OperatorOS owns pricing, checkout, subscriptions, seats, and PulseDesk entitlements.

### Phase 5: Contract Tightening And Tests

- Add focused automated tests for SSO validation, consume replay, entitlement revocation, stale webhook ignores, and master-admin protections.
- Add targeted route tests proving PulseDesk no longer mounts local checkout, portal, plans, publishable-key, or Stripe webhook endpoints.
- Audit residual `org.plan`, `subscriptionStatus`, and `stripeSubscriptionId` reads and either remove them or document them as historical display/migration fields.
- Consider deleting legacy Stripe files in a later migration once rollback is no longer required.

## Environment Variables

Current PulseDesk env:

- `DATABASE_URL`
- `SESSION_SECRET`
- `MODULE_SSO_SECRET`
- `OPERATOROS_BASE_URL`
- `OPERATOROS_SSO_AUDIENCE` (`pulsedesk`)
- `OPERATOROS_SSO_ENV`
- `OPERATOROS_API_URL`
- `OPERATOROS_SSO_CONSUME_URL` (preferred as of Phase 1)
- `PULSEDESK_LOCAL_AUTH_ENABLED` (development/reviewer only; local register/login disabled unless set to `true`)
- Deprecated local Stripe env, if present, is ignored by active PulseDesk runtime paths. OperatorOS owns Stripe configuration.
- Email/OAuth envs listed in `README.md`

Target OperatorOS child-module env:

- `MODULE_SSO_SECRET`: HS256 JWT verification and entitlement webhook HMAC.
- `OPERATOROS_BASE_URL`: expected issuer and user-facing parent URL.
- `OPERATOROS_SSO_CONSUME_URL`: preferred full absolute consume endpoint. Expected production value for the currently validated OperatorOS route is `https://operatoros.net/api/modules/sso/consume`. If OperatorOS is using the versioned route for the deployment, use `https://operatoros.net/api/v1/modules/sso/consume`. Do not add a trailing path elsewhere when this is set.
- `OPERATOROS_API_URL`: legacy fallback. Supported exact full consume values are `https://operatoros.net/api/modules/sso/consume` and `https://operatoros.net/api/v1/modules/sso/consume`. If used as an API base, set it to `https://operatoros.net/api` or `https://operatoros.net/api/v1`; PulseDesk derives the consume URL without duplicating `/api` or `/v1`.
- `OPERATOROS_SSO_AUDIENCE=pulsedesk`.
- `OPERATOROS_SSO_ENV=prod|staging|dev`.
- `OPERATOROS_SERVICE_TOKEN`: server-only bearer token for introspection and webhook registration.
- `PULSEDESK_MASTER_ADMIN_EMAIL`: comma-separated OperatorOS-authenticated email list that should receive local `isSuperAdmin=true` and tenant `owner` on SSO. `john@shotgunninjas.com` is recognized by default for ecosystem ownership.
- `PULSEDESK_LOCAL_AUTH_ENABLED=true`: explicitly enables local username/password register and login for development or reviewer workflows. Leave unset in production so OperatorOS SSO is the primary entry.
- `ENABLE_DEMO_SEEDS=true`: explicitly enables local demo data seeding.
- `PULSEDESK_DEMO_PASSWORD`: required when `ENABLE_DEMO_SEEDS=true`; used for seeded demo users and never logged.
- `ENABLE_LOCAL_REVIEWER=true`: explicitly enables local reviewer account seeding.
- `PULSEDESK_REVIEWER_PASSWORD`: required when `ENABLE_LOCAL_REVIEWER=true`; never logged.
- `OPERATOROS_ENTITLEMENTS_INTROSPECT_URL`: optional full URL override for service-token introspection. Defaults to `{OPERATOROS_BASE_URL}/v1/sso/entitlements/introspect`. Legacy alias `OPERATOROS_INTROSPECTION_URL` is also accepted.
- `OPERATOROS_ENTITLEMENT_SYNC_URL`: optional full URL override for webhook registration. Defaults to `{OPERATOROS_BASE_URL}/v1/sso/entitlements/sync`.
- `PULSEDESK_PUBLIC_URL`, `APP_BASE_URL`, `PUBLIC_BASE_URL`, or Replit `REPLIT_DOMAINS`: public PulseDesk root used to register `{base}/webhooks/operatoros/entitlements`.

OperatorOS-side env from the copied docs:

- `PULSEDESK_URL`
- `STRIPE_PRICE_PULSEDESK_MONTHLY`
- `STRIPE_PRICE_ADDON_<MODULE_SLUG>` for add-on modules where applicable.
- `OPERATOROS_BOOTSTRAP_SUPER_ADMIN_EMAIL`

## Routes Removed Or Replaced

Removed from active runtime in Phase 4:

- `POST /api/billing/checkout`
- `POST /api/billing/portal`
- `GET /api/billing/plans`
- `GET /api/billing/status`
- `GET /api/billing/publishable-key`
- `POST /api/stripe/webhook`
- `PATCH /api/admin/orgs/:id/plan`
- `GET /api/admin/billing`
- `POST /api/admin/billing/sync/:orgId`

Routes still backed by legacy files but not mounted:

- `server/routes/billing.ts`
- `server/webhookHandlers.ts`
- `server/services/billingSync.ts`
- `server/stripeClient.ts`

Routes to keep or continue hardening:

- `PATCH /api/admin/users/:id/superadmin`: currently restricted by email-based master-admin policy and audit; later remove if OperatorOS becomes the only super-admin authority.
- `POST /webhooks/operatoros/entitlements`
- Optional admin diagnostic route for the current cached OperatorOS entitlement snapshot.
- `GET /sso`
- `POST /api/auth/login`: retained for development/reviewer fallback, but disabled unless `PULSEDESK_LOCAL_AUTH_ENABLED=true`.
- `POST /api/auth/register`: retained for development/reviewer fallback, but disabled unless `PULSEDESK_LOCAL_AUTH_ENABLED=true`.
- `GET /api/public/sso-config`, unless replaced by static parent URL config.
- Existing healthcare workflow APIs, scoped by `requireOrg`.

## Testing Checklist

Baseline:

- `npm run check`
- `npm run build`
- Smoke `/api/auth/me` authenticated and unauthenticated behavior.
- Verify seeded demo org still works.
- Verify existing local auth and M365 auth flows are not changed by Phase 0.

SSO:

- Missing token returns `400 missing_token`.
- Malformed token returns `400 bad_request`.
- Wrong alg or signature returns `401 signature_invalid`.
- Wrong issuer returns `401 issuer_mismatch`.
- Wrong audience or module slug returns `401 audience_mismatch`.
- Wrong env returns `401 env_mismatch`.
- Expired or old token returns `401 expired`.
- Future `iat` returns `401 clock_skew`.
- Consume replay returns `401 consume_failed`.
- Successful launch creates a PulseDesk session and no raw JWT is stored.
- Successful consume JSON is parsed and available to the SSO route.
- `target_module_enabled=false` or an enabled-module list excluding `pulsedesk` returns `403 entitlement_disabled` before a session is created.
- `john@shotgunninjas.com` authenticated by OperatorOS becomes a local super admin and tenant owner.
- Local username/password login returns `403 local_auth_disabled` unless `PULSEDESK_LOCAL_AUTH_ENABLED=true`.

Entitlements:

- SSO with `target_module_enabled=false` does not create a working session.
- Webhook with bad signature returns `401`.
- Older `computedAt` webhook is ignored.
- Webhook disabling PulseDesk revokes or blocks the local session.
- Introspection with bad service token fails closed.
- Introspection with valid service token updates the local snapshot.
- `operatoros_entitlement_snapshots` has one row per OperatorOS user, tenant, and module slug.
- Raw webhook JSON is parsed only after HMAC verification.
- The active PulseDesk session stores `operatorOsEntitlementSnapshotId`, not the OperatorOS JWT.

Billing and feature gates:

- M365 configuration gate follows OperatorOS feature snapshot.
- Email-to-ticket and connector polling stop when entitlement is revoked.
- `/api/billing/plans`, `/api/billing/checkout`, `/api/billing/portal`, `/api/billing/publishable-key`, and `/api/stripe/webhook` are not mounted.
- PulseDesk has no active `/billing` route, Billing sidebar item, local checkout button, local billing portal button, pricing page, or plan-comparison card.
- Local Stripe checkout success cannot grant PulseDesk access because PulseDesk no longer creates checkout sessions.

Admin:

- No hardcoded admin username or password remains.
- Bootstrap is idempotent and email-keyed.
- Self-demotion remains blocked.
- Super-admin changes are audit logged.

Security:

- Secrets are never logged.
- HMAC signature comparison is constant-time.
- Cross-tenant storage access remains scoped by `orgId`.
- Revoked users cannot switch into old sessions or orgs.
