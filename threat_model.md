# Threat Model

## Project Overview

OperatorOS is a multi-tenant SaaS and cloud development environment built with a Fastify API, a Next.js web app, PostgreSQL via Drizzle ORM, and a separate runner-gateway service for provisioning and executing commands inside workspaces. Production users include end users, tenant admins, and platform super-admins. The highest-risk production behavior is workspace lifecycle control, code execution, tenant administration, billing, and module SSO/handoff.

Assumptions for this threat model:
- Only production-reachable surfaces are in scope.
- Mockup sandbox behavior is out of scope unless production reachability is shown.
- Replit deployment TLS is handled by the platform.
- `NODE_ENV` is `production` in production.

## Assets

- **User accounts and sessions** — JWT-backed sessions, auth cookies, password hashes, password reset tokens, and current-tenant state. Compromise enables impersonation and platform access.
- **Tenant data** — tenants, memberships, plans, module grants, projects, notes, tasks, audit trails, and billing state. Cross-tenant disclosure or tampering breaks the product’s core isolation guarantee.
- **Workspace code and execution plane** — git repositories, files, patches, process lists, logs, services, task traces, runner streams, and command execution capability. Compromise can expose source code, secrets in repos, or enable arbitrary code execution in runners.
- **Platform admin surface** — platform-wide tenant views, audit logs, billing event DLQ, pricing management, and user management. Compromise grants global control across customers.
- **Application secrets and third-party credentials** — `SESSION_SECRET`, database credentials, Stripe secrets, module SSO secret, and optional OpenAI key. Leakage would allow account compromise, forged sessions, fraudulent billing actions, or abusive API usage.

## Trust Boundaries

- **Browser / API boundary** — all client input is untrusted. The API must authenticate and authorize every sensitive action server-side.
- **API / PostgreSQL boundary** — the API has broad database authority. Injection or broken authorization at the API layer becomes direct data exposure or tampering.
- **API / runner-gateway boundary** — the control plane asks the runner service to provision containers and execute commands. This is a critical trust boundary because mistakes here can become remote code execution or workspace takeover.
- **Runner / workspace boundary** — user-requested commands run inside workspace execution environments. The system must prevent one workspace from controlling another or escaping intended limits.
- **Authenticated / tenant-member / tenant-admin / super-admin boundaries** — OperatorOS has layered authority. Platform role and tenant role must both be enforced consistently.
- **API / external services boundary** — Stripe webhooks and optional OpenAI calls cross into third-party systems and must be verified, scoped, and fail closed.

## Scan Anchors

- **Production entry points**: `apps/api/src/index.ts`, `apps/api/src/routes/*.ts`, `apps/runner-gateway/src/index.ts`, `apps/web/src/app/**`
- **Highest-risk code areas**: `apps/api/src/index.ts`, `apps/api/src/routes/os-routes.ts`, `apps/runner-gateway/src/*`, `apps/api/src/lib/auth.ts`, `apps/api/src/lib/tenant-auth.ts`, `apps/api/src/routes/platform-routes.ts`, `apps/api/src/routes/module-routes.ts`, `apps/api/src/routes/billing-routes.ts`
- **Public surfaces**: auth registration/login/reset, billing plan metadata, health/readiness, any route mounted without `authenticate`/tenant guards
- **Authenticated/admin surfaces**: tenant routes, platform routes, AI routes, module access and SSO, billing mutations
- **Usually dev-only / ignore unless reachability is shown**: `apps/web/.next`, `apps/web/out`, Android build artifacts, tests, scripts, local-only mock behaviors

## Threat Categories

### Spoofing

OperatorOS relies on JWT sessions and role-derived request context. The system must require a valid session for every non-public control-plane action, must resolve tenant context from trusted request state only after authentication, and must verify Stripe webhook signatures before changing billing state.

### Tampering

Attackers can try to modify tenant data, module grants, billing state, workspace files, or git history through API endpoints. All sensitive mutations must enforce server-side authorization, validate inputs, and ensure workspace- and tenant-scoped actions cannot be triggered by unrelated users.

### Information Disclosure

This project stores tenant-scoped SaaS data and potentially sensitive source code inside workspaces. The system must prevent unauthenticated or cross-tenant reads of workspace files, process logs, task events, publish runs, billing data, and platform-only views. Error messages and logs must not expose secrets.

### Denial of Service

Workspace provisioning, runner exec, publish analysis, AI operations, and password reset flows can consume expensive resources. The system must prevent unauthenticated callers from triggering compute-heavy operations and should bound public auth-related flows to avoid abuse.

### Elevation of Privilege

The main risk in this project is privilege escalation from public or low-privilege users into workspace control, tenant administration, or platform-wide authority. All command execution, runner streaming, module admin actions, and platform routes must enforce the correct platform role or tenant role server-side. Any route that can access another workspace, tenant, or user’s data must bind that action to an authenticated principal and authorized scope.
