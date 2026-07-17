# OperatorOS repository instructions

## Mission and authority

`C:\Dev\OperatorOS` is the canonical OperatorOS deployment repository.
OperatorOS is the sole authority for identity, credentials, sessions, tenants,
memberships, platform roles, subscriptions, billing, entitlements, module
registry, launch policy, and platform audit.

Read these current documents before changing shared platform or module code:

- `docs/auth/OPERATOROS_SSO_CONTRACT_V1.md`
- `docs/OPERATOROS_ECOSYSTEM_INTEGRATION_CONTRACT.md`
- `docs/MODULE_CONSOLIDATION_STATUS.md`
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/modules/MODULE_PARITY_INDEX.md`
- `docs/FINAL_E2E_ACCEPTANCE_REPORT.md`
- `docs/CROSS_MODULE_READINESS_REPORT.md`
- `docs/DATABASE_BACKUP_RESTORE.md`
- `PLANS.md`

Historical files may explain earlier designs but are not authority when they
conflict with the documents above or `docs/adr/README.md`.

## Repository layout

- `apps/api`: Fastify API, shared auth/tenant/entitlement authority, active
  module APIs, boot-time schema initialization, and production health.
- `apps/web`: Next.js public, auth, launcher, platform, and host-routed module
  UI.
- `apps/runner-gateway`: local/legacy runner workload; not the public Replit
  surface.
- `packages/modules`: canonical module registry and navigation policy.
- `packages/sso`: SSO v1 primitives.
- `packages/sdk`: shared contracts and catalog types.
- `apps/modules/<slug>/source`: read-only migration evidence outside the pnpm
  workspace. Never run its server, install its dependencies, or apply its
  migrations to the OperatorOS database.
- `scripts`: production preflight, runtime supervisor, verification, and
  snapshot import tooling.

## Non-negotiable boundaries

- Use exact-host SSO with opaque, short-lived, single-use codes bound to the
  exact client/callback, state, nonce, PKCE S256, environment, tenant, module,
  entitlement, and relative return path.
- Use host-only `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/` sessions. Never
  add a parent-domain cookie, JWT/token in a URL, localStorage bearer, or
  module-local login/password reset.
- Resolve tenant and module authority from the validated server session.
  `X-Tenant-Id` is only a requested selection and must be revalidated.
- Every module read/write, uniqueness rule, audit event, and transaction must
  include the trusted tenant ID. Foreign resources must not be enumerated.
- Modules may narrow OperatorOS roles but never widen them. UI hiding is not
  authorization.
- OperatorOS owns Stripe subscription/add-on billing. Module business payments
  must remain explicitly separate from platform billing.
- No mock counters, static dashboards, fake CRUD, in-memory production data,
  TODO handlers, or inactive buttons may be presented as working features.
- Do not commit secrets, credentials, `.env` files, tokens, private dumps, or
  customer data.

## Database rules

- Use only an isolated disposable database for tests. Never point tests or
  imported child migrations at production or a developer's persistent data.
- The active repository currently initializes schema idempotently from
  `apps/api/src/lib/db-init.ts` and `apps/api/src/lib/saas-db-init.ts`; it does
  not expose supported root `db:push`, migration-generation, or migration-apply
  scripts. Do not invent or run child `drizzle-kit push` commands.
- Schema work must include constraints, indexes, tenant predicates, audit
  fields, transaction boundaries, rollback notes, and clean-database tests.
- Back up before an approved migration and follow
  `docs/DATABASE_BACKUP_RESTORE.md`. Destructive production migration or
  restore actions require explicit human approval.

## Authoritative commands

PowerShell from the repository root:

```powershell
$env:CI='true'; corepack pnpm install --frozen-lockfile
corepack pnpm typecheck

# Requires an isolated PostgreSQL URL and non-production test secrets.
$env:APP_ENV='test'; $env:NODE_ENV='test'
corepack pnpm --dir apps/api test

$env:INTERNAL_API_URL='http://localhost:5001'
corepack pnpm build
corepack pnpm preflight:production -- --core
```

There is currently no repository-defined lint or formatting script. Do not
claim either check passed. Add a reviewed command before making it a release
gate.

Production artifacts can be exercised with:

```powershell
corepack pnpm --filter @operatoros/api start
$env:PORT='5000'; $env:INTERNAL_API_URL='http://127.0.0.1:5001'
corepack pnpm --dir apps/web start
corepack pnpm --dir apps/web test:e2e:sso:proxy
$env:E2E_PRODUCTION_HOSTS='1'
corepack pnpm --dir apps/web test:e2e:sso
```

The Replit deployment path is defined by `.replit` and
`scripts/start-unified-runtime.mjs`. Non-development builds require
`INTERNAL_API_URL` or `NEXT_PUBLIC_API_URL`.

## Verification and definition of done

For changed behavior, run focused tests first and then the broadest relevant
gate. Before calling a module production-ready, prove SSO, return navigation,
real persistent functionality, server authorization, tenant isolation,
production build/start, health/readiness, deep links, logout, and browser E2E
on the target deployment. Do not convert failures to skips or infer parity
from a rendered shell.

Record exact commands, environment, pass/fail/skip counts, and blockers in
`docs/IMPLEMENTATION_STATUS.md`. Update the relevant module parity row whenever
scope or evidence changes.

## Git and delivery

- Inspect branch, status, and recent history before editing. Preserve unrelated
  user changes.
- Prefer a scoped `codex/<phase-or-feature>` branch and focused commits.
- Do not rewrite history, force push, deploy, publish, or mutate production
  data without explicit authorization.
- A commit is allowed only after documentation and fresh verification evidence
  agree. Pushing and deployment are separate human gates.
