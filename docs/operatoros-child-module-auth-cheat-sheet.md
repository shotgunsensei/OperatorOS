# OperatorOS Child Module Auth Cheat Sheet

This document is the implementation contract for future child modules that
connect to OperatorOS. It is written for Codex sessions building or repairing a
module such as TechDeck, PulseDesk, TradeFlowKit, TorqueShed, FaultlineLab,
BrandForge OS, SnapProofOS, NinjaMation, or another Shotgun Ninjas product.

OperatorOS is the parent authority. A child module can own its local product
data and UI, but it should not independently decide identity, tenant access,
paid access, or module entitlement unless the product is intentionally
standalone and documented that way.

## 1. OperatorOS Parent/Child Model

OperatorOS parent owns:

- users and login state
- tenants and organizations
- tenant memberships
- platform, tenant, and module roles
- module catalog rows
- plan, add-on, and entitlement state
- purchase and subscription state
- Stripe webhook processing
- child-module access handoff
- entitlement introspection for receiver services

Child modules own:

- module-specific UI
- module-specific tenant data
- local child sessions after successful OperatorOS handoff
- product workflows inside the access boundary OperatorOS grants

Child modules should not:

- create a separate paid-access source of truth
- grant their own subscription access from browser state
- trust client-provided tenant ids without server verification
- bypass OperatorOS entitlements because a launch card was visible
- duplicate Stripe billing unless the module is intentionally standalone

## 2. Required Concepts

- `user`: row in `users`; authenticated by OperatorOS. Current fields include
  `id`, `email`, `role`, `platformRole`, `status`, `currentTenantId`, and
  `tokenVersion`.
- `tenant/org`: row in `tenants`; the active account or organization context
  a user is acting inside.
- `membership`: row in `tenant_users`; connects a user to a tenant.
- `role`: there are separate authority axes. `users.platformRole` is platform
  authority (`super_admin` or `user`). `tenant_users.role` is tenant authority
  (`owner`, `admin`, `member`). `tenant_user_module_access.accessLevel` is
  module authority (`none`, `user`, `manager`).
- `module`: row in `modules`; identified by `slug`, not numeric module id in
  the public launch APIs.
- `entitlement`: the effective result of checking user, tenant, module status,
  tenant module rows, plan grants, add-on grants, and explicit per-user module
  access rows.
- `subscription`: base plan row in `subscriptions`; Stripe-enabled when Stripe
  ids exist and Stripe mode is live.
- `add-on subscription`: module-level purchase row in `addon_subscriptions`.
- `handoff token`: short-lived SSO JWT issued by OperatorOS for one module
  launch; persisted by `jti` in `sso_handoff_tokens`.
- `introspection`: service-token API that returns the canonical entitlement
  snapshot for a user and tenant.
- `child session`: local session a child creates only after validating the
  handoff and receiving a current entitlement snapshot.

## 3. Expected Parent APIs

The Fastify API currently registers `/v1/*` routes. The Next.js web app rewrites
browser `/api/*` calls to Fastify `/v1/*` through `apps/web/next.config.js`.

Current implemented parent APIs:

| Purpose | Browser path through web | Fastify path |
| --- | --- | --- |
| Register | `POST /api/auth/register` | `POST /v1/auth/register` |
| Login | `POST /api/auth/login` | `POST /v1/auth/login` |
| Logout | `POST /api/auth/logout` | `POST /v1/auth/logout` |
| Current user | `GET /api/auth/me` | `GET /v1/auth/me` |
| Forgot password | `POST /api/auth/forgot-password` | `POST /v1/auth/forgot-password` |
| Reset password | `POST /api/auth/reset-password` | `POST /v1/auth/reset-password` |
| List my tenants | `GET /api/me/tenants` | `GET /v1/me/tenants` |
| Get tenant | `GET /api/tenants/:tenantId` | `GET /v1/tenants/:tenantId` |
| Switch tenant | `POST /api/tenants/:tenantId/switch` | `POST /v1/tenants/:tenantId/switch` |
| Module catalog for active tenant | `GET /api/modules` | `GET /v1/modules` |
| Single module entitlement/detail | `GET /api/modules/:slug` | `GET /v1/modules/:slug` |
| Module handoff | `POST /api/modules/:slug/handoff` | `POST /v1/modules/:slug/handoff` |
| SSO consume | `POST /api/modules/sso/consume` | `POST /v1/modules/sso/consume` |
| Legacy SSO consume alias | no rewrite required if direct API origin | `POST /modules/sso/consume` |
| Entitlements for current user | `GET /api/entitlements/me` | `GET /v1/entitlements/me` |
| Service introspection | direct API call recommended | `GET /v1/sso/entitlements/introspect` |
| Service webhook sync | direct API call recommended | `POST /v1/sso/entitlements/sync` |
| Billing plans | `GET /api/billing/plans` | `GET /v1/billing/plans` |
| Subscribe to base plan | `POST /api/billing/subscribe` | `POST /v1/billing/subscribe` |
| Stripe checkout | `POST /api/billing/create-checkout-session` | `POST /v1/billing/create-checkout-session` |
| Billing portal | `POST /api/billing/create-portal-session` | `POST /v1/billing/create-portal-session` |
| Add-on checkout | `POST /api/billing/addons/subscribe` | `POST /v1/billing/addons/subscribe` |
| Add-on cancel | `POST /api/billing/addons/cancel` | `POST /v1/billing/addons/cancel` |
| Stripe webhook | direct Stripe target | `POST /v1/billing/webhook` |

Requested generic API names and current OperatorOS mapping:

- `POST /api/auth/login`: exists through the web rewrite.
- `POST /api/auth/logout`: exists through the web rewrite.
- `GET /api/auth/me`: exists through the web rewrite.
- `GET /api/tenants/current`: not currently implemented. Use
  `GET /api/me/tenants` plus `current`, or add a dedicated route later.
- `GET /api/modules`: exists through the web rewrite.
- `GET /api/modules/:moduleId/entitlement`: not currently implemented by id.
  Use `GET /api/modules/:slug` and treat `slug` as the module identifier.
- `POST /api/modules/:moduleId/handoff`: implemented as
  `POST /api/modules/:slug/handoff`.
- `POST /api/child/introspect`: not currently implemented. Use
  `GET /v1/sso/entitlements/introspect` with a service token.
- `POST /api/billing/checkout`: not currently implemented under that exact
  name. Use `POST /api/billing/create-checkout-session` for plans or
  `POST /api/billing/addons/subscribe` for module add-ons.
- `POST /api/billing/webhook`: available as `POST /v1/billing/webhook`; Stripe
  should target the API origin directly.

## 4. Child Module Required Environment Variables

Current repo-aligned variables for child modules:

```env
OPERATOROS_BASE_URL=https://operatoros.net
OPERATOROS_API_URL=https://operatoros.net/api
OPERATOROS_SSO_AUDIENCE=<module-slug>
OPERATOROS_SSO_ENV=prod
MODULE_SSO_SECRET=<same-value-as-operatoros>
OPERATOROS_SERVICE_TOKEN=<server-only-service-token>
APP_BASE_URL=https://child.example.com
NODE_ENV=production
```

OperatorOS parent also uses:

```env
DATABASE_URL=<postgres-url>
SESSION_SECRET=<high-entropy-session-secret>
APP_ENV=prod
INTERNAL_API_URL=<api-origin-for-next-rewrites>
NEXT_PUBLIC_API_URL=<public-api-origin-if-needed>
STRIPE_MODE=live
STRIPE_SECRET_KEY=<stripe-secret-key>
STRIPE_WEBHOOK_SECRET=<stripe-webhook-secret>
STRIPE_PRICE_STARTER_MONTHLY=<price-id>
STRIPE_PRICE_STARTER_ANNUAL=<price-id>
STRIPE_PRICE_PRO_MONTHLY=<price-id>
STRIPE_PRICE_PRO_ANNUAL=<price-id>
STRIPE_PRICE_ELITE_MONTHLY=<price-id>
STRIPE_PRICE_ELITE_ANNUAL=<price-id>
STRIPE_PRICE_ADDON_<MODULE_SLUG>=<price-id>
OPERATOROS_BOOTSTRAP_SUPER_ADMIN_EMAIL=<admin-email>
```

Names from the requested target contract and how to adapt them:

- `OPERATOROS_PARENT_URL`: use current `OPERATOROS_BASE_URL`, or define this
  as an alias in a child if preferred.
- `OPERATOROS_CHILD_MODULE_ID`: use the module `slug`; current APIs identify
  modules by slug.
- `OPERATOROS_CHILD_CLIENT_ID`: not currently implemented. Future per-module
  service credentials can add this.
- `OPERATOROS_CHILD_CLIENT_SECRET`: not currently implemented. Current service
  auth uses global `OPERATOROS_SERVICE_TOKEN`.
- `OPERATOROS_INTROSPECTION_URL`: set to
  `{OPERATOROS_API_URL}/v1/sso/entitlements/introspect` for direct API calls,
  or `{OPERATOROS_API_URL}/sso/entitlements/introspect` if `OPERATOROS_API_URL`
  already includes `/api` and is served behind the Next rewrite.
- `OPERATOROS_JWT_PUBLIC_KEY`: not current. OperatorOS handoff JWTs use HS256
  with `MODULE_SSO_SECRET`, not asymmetric public key verification.
- `OPERATOROS_JWT_SECRET`: current equivalent is `MODULE_SSO_SECRET`.
- `BILLING_PROVIDER_SECRET`: child modules should not handle OperatorOS billing
  webhooks unless standalone. Parent uses `STRIPE_WEBHOOK_SECRET`.

## 5. Child Module Auth Flow

1. User logs into OperatorOS parent via `POST /api/auth/login`.
2. Parent sets a `token` cookie and returns user state.
3. User selects a module from OperatorOS.
4. Parent resolves active tenant using this precedence:
   `:tenantId` path param, `X-Tenant-Id` header, then `users.current_tenant_id`.
5. Parent verifies tenant membership through `requireTenantMember`.
6. Parent verifies module entitlement through `hasModuleAccess(userId, tenantId, slug)`.
7. Parent creates a short-lived SSO JWT and `sso_handoff_tokens` row.
8. Parent returns a launch URL shaped as:

```text
{modules.base_url}/sso?token={jwt}
```

9. Child receives the token at `/sso`.
10. Child validates JWT signature, issuer, audience, env, expiration, and
    required claims.
11. Child calls OperatorOS consume endpoint with `jti`, `aud`, and `env`.
12. OperatorOS marks the handoff consumed atomically and returns the canonical
    entitlement snapshot.
13. Child creates a scoped local session containing user id, tenant id, module
    slug, role context, and snapshot metadata.
14. Child enforces tenant, user, module, and entitlement scope on every
    protected server route.

## 6. Entitlement Flow

Current entitlement rules are centralized in `hasModuleAccess(userId, tenantId,
moduleSlug)`:

- inactive user: denied
- platform `super_admin`: granted
- missing module: denied
- missing `tenant_modules` row: may fall back to active plan inclusion
- tenant module status not in `enabled`, `trial`, `purchased`, or `beta`: denied
- explicit `tenant_user_module_access.accessLevel = none`: denied
- explicit `accessLevel = user` or `manager`: granted
- `tenant_modules.allowAllMembers = true` plus tenant membership: granted
- otherwise: denied

Status handling for child modules:

- free module: parent should represent access as a plan grant or enabled tenant
  module row; child still verifies through parent.
- trial module: `tenant_modules.status = trial`; child should display trial
  state from snapshot if exposed but enforce server-side access the same way.
- paid module: parent grants via subscription plan or module add-on.
- tenant-wide entitlement: use `tenant_modules.allowAllMembers = true` or
  tenant-wide module status.
- per-user entitlement: use `tenant_user_module_access`.
- expired entitlement: parent should deny through subscription/add-on status or
  disabled tenant module status.
- revoked entitlement: explicit per-user `none` or disabled/archived tenant
  module status denies.
- subscription canceled: parent updates subscription/add-on state, then child
  sees denial on next introspection or consume.
- payment failed: parent subscription can become `past_due`; child should not
  make local exceptions unless OperatorOS snapshot says access is still valid.

Child modules must evaluate paid feature access server-side. Frontend flags are
display hints only.

## 7. Purchase Flow

Base plan flow:

1. User clicks upgrade in OperatorOS parent.
2. Parent calls `POST /api/billing/create-checkout-session` or
   `POST /api/billing/subscribe`.
3. Stripe redirects user through checkout when Stripe is enabled.
4. Stripe calls `POST /v1/billing/webhook`.
5. Parent verifies `stripe-signature` using the raw request body and
   `STRIPE_WEBHOOK_SECRET`.
6. Parent claims the Stripe `event.id` idempotently in `billing_events`.
7. Parent updates `subscriptions`.
8. Parent entitlement checks begin reflecting the new plan state.

Module add-on flow:

1. User clicks purchase for a module in OperatorOS parent.
2. Parent calls `POST /api/billing/addons/subscribe`.
3. Parent verifies the user can purchase for the selected tenant with
   `canPurchaseAddon(userId, tenantId, moduleSlug)`.
4. Parent creates or promotes an `addon_subscriptions` row.
5. Stripe webhook confirms subscription state.
6. Parent grants entitlement through tenant/module/add-on state.
7. Child module sees access only through handoff consume or introspection.

Child modules should route upgrade CTAs back to OperatorOS. They should not
grant paid access from local checkout success pages or unverified webhook
payloads.

## 8. Middleware Contract

Backend child middleware pseudocode:

```ts
type ChildAuthContext = {
  operatorosUserId: string;
  operatorosTenantId: string;
  moduleSlug: string;
  email: string;
  platformRole: 'super_admin' | 'user';
  tenantRole: string;
  moduleRole: string;
  entitlementSnapshot: unknown;
};

async function requireOperatorOsModuleAccess(req, res, next) {
  const session = await readChildSession(req);
  if (!session) return redirectToParentLogin(res);

  if (!session.operatorosUserId) return res.status(401).end();
  if (!session.operatorosTenantId) return res.status(403).end();
  if (session.moduleSlug !== process.env.OPERATOROS_SSO_AUDIENCE) {
    return res.status(403).end();
  }

  const fresh = await introspectOperatorOs({
    userId: session.operatorosUserId,
    tenantId: session.operatorosTenantId,
  });

  const target = fresh.modules.find(m => m.slug === session.moduleSlug);
  if (!target?.enabled) return res.status(402).json({ code: 'MODULE_NOT_ENTITLED' });

  req.operatoros = {
    operatorosUserId: session.operatorosUserId,
    operatorosTenantId: session.operatorosTenantId,
    moduleSlug: session.moduleSlug,
    email: fresh.user.email,
    platformRole: fresh.user.platformRole,
    tenantRole: fresh.tenant.role,
    moduleRole: target.moduleRole,
    entitlementSnapshot: fresh,
  } satisfies ChildAuthContext;

  next();
}
```

Data access pseudocode:

```ts
async function getRecord(req, id: string) {
  return db.record.findFirst({
    where: {
      id,
      tenantId: req.operatoros.operatorosTenantId,
    },
  });
}
```

Never run a tenant-owned query without tenant scope from the verified child
session.

## 9. Frontend Guard Contract

Frontend guard pseudocode:

```ts
async function loadChildSession() {
  const res = await fetch('/api/child/me', { credentials: 'include' });
  if (res.status === 401) {
    window.location.href = `${OPERATOROS_BASE_URL}/login?next=${encodeURIComponent(location.href)}`;
    return null;
  }
  if (res.status === 402 || res.status === 403) {
    showUpgradeOrAccessDenied();
    return null;
  }
  return res.json();
}
```

Frontend rules:

- check the child server session, not only browser storage
- call child `/me` or equivalent on page load
- redirect unauthenticated users to OperatorOS login or launchpad
- show an upgrade/access-denied state when the server says not entitled
- never trust localStorage alone for entitlement
- never let a tenant selector override server-verified tenant membership
- preserve mobile/Capacitor requirements if the child app ships mobile shells

## 10. Database/Data Isolation Rules

Every tenant-owned child table must include `tenantId` or `orgId`.

Required patterns:

- Stamp `tenantId` from verified OperatorOS child session on every insert.
- Add `tenantId` to every read/update/delete predicate.
- Never accept `tenantId` from request body, query, or route params without
  verifying membership and entitlement through OperatorOS.
- Treat random UUID ids as insufficient isolation. A valid id must still match
  the active tenant.
- Collapse cross-tenant access to 404 when practical to avoid existence leaks.
- Admin routes still require platform or tenant role checks.
- Service jobs that process tenant data must carry tenant context explicitly.
- Audit records for sensitive actions should include tenant id, user id, module
  slug, action, and safe metadata.

Child schema checklist:

- tenant-scoped core tables: `tenantId` not nullable
- user-owned records: `operatorosUserId` plus `tenantId`
- files/uploads: `tenantId`, owner id, content type, size, storage key
- audit logs: `tenantId`, actor user id, target id, action
- billing mirrors: read-only cache only, never source of truth

## 11. Security Requirements

Required:

- short-lived handoff tokens
- one-time token consume
- server-side signature verification
- issuer, audience, env, expiration, and `jti` checks
- secure cookies in production
- `httpOnly` cookies where possible
- explicit SameSite strategy
- CORS origin allowlist in production
- redirect allowlist for handoff and return URLs
- no hardcoded secrets
- no demo secrets in production
- no token logging
- webhook signature verification
- idempotent webhook processing
- server-side entitlement enforcement
- high-entropy `SESSION_SECRET`, `MODULE_SSO_SECRET`, and service tokens
- secrets only in server runtimes

Current OperatorOS specifics:

- app login JWT cookie name is `token`
- auth JWTs use `SESSION_SECRET`
- SSO handoff JWTs use `MODULE_SSO_SECRET`
- service introspection uses `OPERATOROS_SERVICE_TOKEN`
- Stripe webhook verification uses `STRIPE_WEBHOOK_SECRET`
- module handoff JWTs use HS256
- frontend currently uses `/api/*` rewrite and `credentials: include`

Follow-up hardening to consider before production scale:

- replace permissive credentialed CORS with an allowlist
- move from global service token to per-module credentials
- consider asymmetric SSO signing if third-party child modules are added
- avoid storing bearer tokens in browser localStorage unless required for
  mobile compatibility and threat-modeled

## 12. Test Checklist

Every child module should add tests for:

- unauthenticated request is rejected
- missing child session is rejected
- invalid handoff token is rejected
- expired handoff token is rejected
- wrong `iss` is rejected
- wrong `aud` is rejected
- wrong `env` is rejected
- already consumed `jti` is rejected
- wrong tenant is rejected
- missing entitlement is rejected
- revoked entitlement is rejected
- canceled subscription removes entitlement
- payment failed or past-due state does not grant new access unless parent says so
- valid entitled user is allowed
- user cannot switch `tenantId` manually
- object id from another tenant returns 404 or 403
- tenant admin can access tenant admin routes
- tenant member cannot access tenant admin routes
- platform admin-only route requires `super_admin`
- purchase webhook requires valid signature
- duplicate webhook event is idempotent
- logout clears child session
- local child session refreshes or re-introspects after entitlement changes
- mobile/Capacitor shell still follows the same server-side entitlement checks

## 13. Common Mistakes Future Codex Must Avoid

- building separate child auth accidentally
- trusting frontend module flags
- using localStorage as entitlement source
- skipping tenant scoping on reads or writes
- accepting arbitrary redirect URLs
- accepting arbitrary `tenantId` from the browser
- adding fallback production secrets
- allowing child app to grant its own paid access
- treating Stripe checkout success as entitlement without webhook confirmation
- logging SSO tokens or service tokens
- using `moduleId` when current OperatorOS APIs expect module `slug`
- assuming `/api/child/introspect` exists
- forgetting mobile/Capacitor behavior if applicable
- breaking existing parent login, cookie, SSO, or entitlement behavior
- bypassing `requireTenantMember`, `requireSuperAdmin`, or service token checks
- adding demo accounts or hardcoded admin logic to child modules

## 14. New Child Module Launch Checklist

Parent setup:

- register module in the parent catalog (`modules.slug`, `name`, `status`,
  `baseUrl`, `planMin`, pricing metadata as needed)
- define canonical module slug
- define which plan or add-on grants access
- add tenant module defaults or seed behavior
- add parent launch card
- configure module `baseUrl`
- configure any redirect allowlist behavior needed by the child
- configure `MODULE_SSO_SECRET`
- configure `OPERATOROS_BASE_URL`
- configure `OPERATOROS_API_URL`
- configure `OPERATOROS_SERVICE_TOKEN`
- configure Stripe price ids if paid (`STRIPE_PRICE_ADDON_<MODULE_SLUG>`)

Child setup:

- set child env vars
- implement `/sso?token=...` receiver
- verify handoff JWT
- call OperatorOS consume endpoint
- create local child session
- add auth middleware
- add entitlement middleware
- add tenant-scoped DB models
- add server-side route guards
- add frontend guard
- add upgrade path back to OperatorOS parent
- add audit logging
- add tests from the checklist above
- run build and typecheck
- update module-specific docs

Operational smoke test:

- verify parent `/api/modules` shows expected access state
- verify `POST /api/modules/:slug/handoff` returns a launch URL
- verify child `/sso` consumes once
- verify replay of same `jti` is rejected
- verify revoked entitlement blocks launch or consume
- verify child route cannot read another tenant's data

## Repo Anchors For Future Codex

Inspect these files before changing the contract:

- `apps/api/src/routes/auth-routes.ts`
- `apps/api/src/lib/auth.ts`
- `apps/api/src/lib/session-secret.ts`
- `apps/api/src/lib/tenant-auth.ts`
- `apps/api/src/routes/tenant-routes.ts`
- `apps/api/src/routes/module-routes.ts`
- `apps/api/src/lib/entitlement-service.ts`
- `apps/api/src/routes/entitlement-routes.ts`
- `apps/api/src/lib/service-token.ts`
- `apps/api/src/routes/billing-routes.ts`
- `apps/api/src/lib/billing-service.ts`
- `apps/api/src/schema.ts`
- `apps/web/next.config.js`
- `apps/web/src/lib/auth.ts`
- `apps/web/src/components/AuthProvider.tsx`
- `apps/web/src/middleware.ts`

Do not claim a route or credential model exists unless it is present in these
files or a newer migration explicitly adds it.
