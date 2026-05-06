# OperatorOS

OperatorOS is an AI-native Cloud Development Environment (CDE) and SaaS platform for managing application workspaces, services, and deployments.

## Run & Operate

To run OperatorOS, ensure you have PostgreSQL running and the following environment variables configured:

- `DATABASE_URL`: PostgreSQL connection string
- `SESSION_SECRET`: JWT signing secret
- `NEXT_PUBLIC_API_URL`: API URL for the Next.js frontend
- `OPENAI_API_KEY`: For AI functionalities (optional, mock fallback available)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_MODE`, `STRIPE_PRICE_*`: For Stripe integration (optional)
- `OPERATOROS_BOOTSTRAP_SUPER_ADMIN_EMAIL`: Email to grant `super_admin` role on boot.

Commands:
- `pnpm install`: Install dependencies
- `pnpm dev`: Start all services in development mode
- `pnpm build`: Build all services
- `pnpm db:push`: Apply Drizzle ORM schema changes to the database
- `pnpm typecheck`: Run TypeScript type checking
- `pnpm generate`: Generate Drizzle migrations and other code

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
- **AI Tool Definitions:** `apps/api/src/lib/ai-service.ts`
- **Authentication Logic:** `apps/api/src/lib/auth.ts`
- **Tenant Authorization:** `apps/api/src/lib/tenant-auth.ts`
- **Plan Configuration:** `apps/api/src/lib/plans.ts`
- **AI Provider Abstraction:** `apps/api/src/lib/ai-provider.ts`
- **UI Layout:** `apps/web/src/components/SaasLayout.tsx`
- **Runner Gateway Logic:** `apps/runner-gateway/src/`

## Architecture decisions

- **Monorepo Structure:** Uses `pnpm` monorepo for shared code (`@operatoros/sdk`) and consistent development across services (`api`, `web`, `runner-gateway`).
- **Multi-Tenancy:** Core architectural principle, where all data and features are scoped by `tenant_id`. Access is strictly controlled, resolving active tenant via URL, header, or user preference. Cross-tenant access results in a `404 TENANT_NOT_FOUND` to prevent leakage.
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
  Rationale: tenant existence is masked behind 404 (anti-enumeration), but once membership is established the deny reason is surfaced as 403 so admins can act on it.
- **Database Choice:** PostgreSQL with Drizzle ORM for robust, type-safe data management, supporting both SaaS and CDE-specific entities.

## Product

OperatorOS offers an AI-native CDE with features including workspace and project management, task tracking, note-taking, and activity monitoring. It provides a web-based GUI and a CDE Operator Shell for terminal access, process management, and automation. Key functionalities include secure authentication, subscription management with feature gating, an admin control center, and an AI Operations Assistant with various AI-powered tools.

## User preferences

I want iterative development.
Ask before making major changes.
I prefer to be given all the information before you make any changes.
I prefer detailed explanations.
I prefer simple language.
I like functional programming.

## Gotchas

- **Tenant Context:** Always ensure the correct tenant context is active for requests, either via URL param (`:tenantId`), `X-Tenant-Id` header, or `users.current_tenant_id`. Incorrect context leads to `404 TENANT_NOT_FOUND`.
- **Super Admin Bootstrap:** The `super_admin` role can only be bootstrapped via the `OPERATOROS_BOOTSTRAP_SUPER_ADMIN_EMAIL` environment variable.
- **AI Provider Fallback:** If `OPENAI_API_KEY` is not set or OpenAI quota is exhausted, the AI module automatically falls back to a mock provider.
- **Stripe Integration:** Stripe billing is only enabled if `STRIPE_MODE` is set to `live` and relevant `STRIPE_SECRET_KEY` and `STRIPE_PRICE_*` variables are configured.
- **CDE Command Denylist:** The CDE shell enforces a command denylist to prevent unsafe operations unless `ALLOW_UNSAFE_COMMANDS` is set to `true` (not recommended for production).

## Pointers

- **Drizzle ORM Docs:** [https://orm.drizzle.team/docs/overview](https://orm.drizzle.team/docs/overview)
- **Fastify Docs:** [https://www.fastify.io/docs/latest/](https://www.fastify.io/docs/latest/)
- **Next.js Docs:** [https://nextjs.org/docs](https://nextjs.org/docs)
- **OpenAI API Docs:** [https://platform.openai.com/docs/api-reference](https://platform.openai.com/docs/api-reference)
- **Stripe API Docs:** [https://stripe.com/docs/api](https://stripe.com/docs/api)
- **JWT (JSON Web Tokens):** [https://jwt.io/introduction](https://jwt.io/introduction)