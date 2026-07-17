# OperatorOS

Status: current Replit operator summary. `AGENTS.md`,
`docs/auth/OPERATOROS_SSO_CONTRACT_V1.md`, and
`docs/OPERATOROS_ECOSYSTEM_INTEGRATION_CONTRACT.md` are the architecture and
security authority.

OperatorOS is the central identity, tenant, entitlement, billing, launcher,
and host-routed runtime for the Shotgun Ninjas application ecosystem. Its CDE
capabilities are platform features, not a second identity or tenant authority.

## Run & Operate

To run OperatorOS, ensure you have PostgreSQL running and the following environment variables configured:

- `DATABASE_URL`: PostgreSQL connection string
- `SESSION_SECRET`: strong host-session signing secret
- `SSO_CODE_ENCRYPTION_SECRET`: strong hub-only SSO code-encryption secret
- `APP_ENV=production` and `NODE_ENV=production`
- `OPERATOROS_BASE_URL=https://operatoros.net`
- `OPERATOROS_APPS_URL=https://app.operatoros.net/`
- `INTERNAL_API_URL=http://localhost:5001`: private server-side Next-to-Fastify route
- `OPERATOROS_DATABASE_RELEASE_MODE=apply`: authorizes the reviewed idempotent release before API startup
- `TRUST_PROXY=true` behind the managed Replit proxy
- the exact canonical module URL variables documented in `.env.example`
- `OPENAI_API_KEY`: optional provider configuration; mock output is never production acceptance evidence
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_MODE`, `STRIPE_PRICE_*`: For Stripe integration (optional)
- `OPERATOROS_BOOTSTRAP_SUPER_ADMIN_EMAIL`: Email to grant `super_admin` role on boot.

Commands:
- `$env:CI='true'; corepack pnpm install --frozen-lockfile`: install the pinned workspace
- `corepack pnpm dev`: start local development services
- `corepack pnpm typecheck`: run all supported TypeScript checks
- `$env:INTERNAL_API_URL='http://localhost:5001'; corepack pnpm build:production`: typecheck and build production artifacts
- `corepack pnpm --dir apps/api test`: run tests against an isolated PostgreSQL database
- `corepack pnpm preflight:production -- --core`: validate production authority configuration
- `corepack pnpm db:plan`: print the ordered, secret-free database release plan

The repository does not define `db:push`, migration generation, lint, or format
scripts. `corepack pnpm db:apply` is the only supported root release apply path
and requires an isolated/approved `DATABASE_URL` plus
`OPERATOROS_DATABASE_RELEASE_MODE=apply`. The Replit supervisor runs its
compiled equivalent before Fastify. Never run an imported child application's
Drizzle migration against OperatorOS.

## Stack

- **Frameworks:** Fastify (API), Next.js (Web)
- **Runtime:** Node.js
- **ORM:** Drizzle ORM
- **Validation:** _Populate as you build_
- **Build Tool:** pnpm (monorepo)

## Where things live

- **API Entrypoint:** `apps/api/src/index.ts`
- **Web Frontend Entrypoint:** `apps/web/src/app/page.tsx`
- **DB Schema (Source of Truth):** `apps/api/src/schema.ts`
- **Database Release Contract:** `apps/api/src/lib/database-release-contract.ts` + `apps/api/src/lib/database-release.ts`
- **AI Tool Definitions:** `apps/api/src/lib/ai-service.ts`
- **Authentication Logic:** `apps/api/src/lib/auth.ts`
- **Tenant Authorization:** `apps/api/src/lib/tenant-auth.ts`
- **Plan Configuration:** `apps/api/src/lib/plans.ts`
- **Platform Command (Super Admin):** `apps/api/src/routes/platform-routes.ts` + `apps/web/src/components/pages/PlatformPage.tsx`
- **Centralized Audit:** `apps/api/src/lib/audit.ts` (`writeAudit`, `pickSafe`, field allowlists)
- **Centralized Entitlements (Task #108):** `apps/api/src/lib/entitlement-resolver.ts` (`resolveEntitlements(userId, tenantId)` — the single snapshot every surface reads). Role aliases live in `apps/api/src/lib/role-aliases.ts`. Receivers register a push URL via `POST /v1/sso/entitlements/sync` and read live snapshots via `GET /v1/sso/entitlements/introspect` (both service-token gated by `OPERATOROS_SERVICE_TOKEN`). The user-facing surface is `GET /v1/entitlements/me`. Propagation pipeline `apps/api/src/lib/entitlement-propagation.ts` is fired from Stripe webhooks and tenant-admin grant changes.
- **Pluggable Push Adapters (Task #109):** `apps/api/src/lib/entitlement-adapters.ts` defines `EntitlementPushAdapter` and selects per-module wire shape from the `modules` columns `push_shape`, `push_auth_mode`, `push_bearer_env_var`. Default is `canonical_snapshot` (HMAC, one push per member×receiver). TradeFlowKit ships as `tradeflowkit_v1` (bearer-token, one batched push per receiver, 12-key feature whitelist). The adapter is presentation-only — the resolver snapshot remains the single source of truth. The legacy unversioned consume alias is disabled by default and can only be enabled as a temporary rollback control outside production. See `docs/MODULE_SSO.md` §3.6 / §3.7.
- **AI Provider Abstraction:** `apps/api/src/lib/ai-provider.ts`
- **UI Layout:** `apps/web/src/components/SaasLayout.tsx`
- **Runner Gateway Logic:** `apps/runner-gateway/src/`

## Architecture decisions

- **Monorepo Structure:** Uses `pnpm` monorepo for shared code (`@operatoros/sdk`) and consistent development across services (`api`, `web`, `runner-gateway`).
- **Multi-Tenancy:** All module data and features are scoped by `tenant_id`.
  Authority comes from the validated server session plus verified membership.
  A path or `X-Tenant-Id` value is only a requested tenant selection and must
  be revalidated; it never overrides a module session's sealed tenant. Foreign
  resources return 404 or a stable denial without leaking another tenant.
- **AI-First Design:** Integrated AI Agent and AI Operations Assistant with a pluggable provider architecture (OpenAI, Mock) and plan-gated tools, emphasizing AI assistance throughout the development workflow.
- **Role-Based Access Control (RBAC):** Granular authorization via platform roles (`super_admin`, `user`) and tenant-specific roles (`owner`, `admin`, `member`), along with module and feature gating based on subscription plans. **Helper contract shape:** RBAC helpers in `tenant-auth.ts` are implemented as Fastify pre-handlers (e.g. `requireTenantOwner`, `requireTenantAdmin`, `requireTenantMember`, `requireTenantModuleAccess(slug)`), not standalone `(tenantId, userId) -> boolean` functions. The active tenant is resolved from request context (precedence: `:tenantId` URL param > `X-Tenant-Id` header > `users.current_tenant_id`) and exposed as `request.tenantContext`. Use `resolveTenantContext(request)` directly when authorization needs to happen mid-handler instead of as a pre-handler.
- **HTTP code policy (tenant surface):**
  | Condition                                    | Code | Error code                    |
  | -------------------------------------------- | ---- | ----------------------------- |
  | Cross-tenant or non-member of tenant         | 404  | `TENANT_NOT_FOUND`            |
  | Authenticated, member, role too low          | 403  | `TENANT_ROLE_INSUFFICIENT`    |
  | Authenticated, not platform super_admin      | 403  | `PLATFORM_ROLE_REQUIRED`      |
  | Module not enabled for tenant (disabled/archived/missing tenant_module row) | 403 | `TENANT_MODULE_DISABLED` |
  | Module enabled but user has no grant         | 403  | `TENANT_MODULE_ACCESS_DENIED` |
  | Add-on already active for tenant             | 409  | `ADDON_ALREADY_ACTIVE`        |
  | Tenant/module slug collision on create/rename | 409 | `SLUG_TAKEN`                  |
  | Module slug change blocked by entitlements/subs | 409 | `MODULE_HAS_DEPENDENTS`     |
  | Module archive blocked by active addon subs (overridable with `?confirm=1`) | 409 | `MODULE_HAS_ACTIVE_SUBS` |
  | Module is archived (cannot be enabled/edited) | 409 | `MODULE_ARCHIVED`             |
  Rationale: tenant existence is masked behind 404 (anti-enumeration), but once membership is established the deny reason is surfaced as 403 so admins can act on it.
- **Database Choice:** PostgreSQL with Drizzle ORM for robust, type-safe data management, supporting both SaaS and CDE-specific entities.

## Product

OperatorOS provides central login, My Apps, tenant administration, billing,
entitlements, Platform Command, module routing, and shared operational/CDE
capabilities. Module product parity is tracked in
`docs/modules/MODULE_PARITY_INDEX.md`; a rendered shell is not completion.

## User preferences

I want iterative development.
Ask before making major changes.
I prefer to be given all the information before you make any changes.
I prefer detailed explanations.
I prefer simple language.
I like functional programming.

## Gotchas

- **Tenant Context:** Always derive effective tenant authority server-side.
  Revalidate requested path/header/current selections against membership and
  the sealed module session before database access.
- **Super Admin Bootstrap:** The `super_admin` role can only be bootstrapped via the `OPERATOROS_BOOTSTRAP_SUPER_ADMIN_EMAIL` environment variable.
- **AI Provider Fallback:** Provider-disabled/mock behavior must be explicit in
  the UI and cannot satisfy production workflow, metering, or release gates.
- **Stripe Integration:** Stripe billing is only enabled if `STRIPE_MODE` is set to `live` and relevant `STRIPE_SECRET_KEY` and `STRIPE_PRICE_*` variables are configured.
- **Add-on pre-create + promote:** `subscribeToAddon` inserts an `incomplete` `addon_subscriptions` row before opening the Stripe checkout session and threads its id through `metadata.internal_addon_subscription_id`. The webhook handler promotes the same row to `active` (no duplicate insert). The double-buy guard ignores `incomplete` rows.
- **CDE Command Denylist:** The CDE shell enforces a command denylist to prevent unsafe operations unless `ALLOW_UNSAFE_COMMANDS` is set to `true` (not recommended for production).

## Pointers

- **Drizzle ORM Docs:** [https://orm.drizzle.team/docs/overview](https://orm.drizzle.team/docs/overview)
- **Fastify Docs:** [https://www.fastify.io/docs/latest/](https://www.fastify.io/docs/latest/)
- **Next.js Docs:** [https://nextjs.org/docs](https://nextjs.org/docs)
- **OpenAI API Docs:** [https://platform.openai.com/docs/api-reference](https://platform.openai.com/docs/api-reference)
- **Stripe API Docs:** [https://stripe.com/docs/api](https://stripe.com/docs/api)
- **JWT (JSON Web Tokens):** [https://jwt.io/introduction](https://jwt.io/introduction)
