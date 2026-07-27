# OperatorOS current architecture

Status: Phase 5 TechDeck source/local architecture, 2026-07-18.

This document describes the executable OperatorOS control plane. The SSO and
ecosystem integration contracts remain authoritative for protocol details.
Module feature parity is tracked separately in `docs/modules/MODULE_PARITY_INDEX.md`.

## Authority boundary

OperatorOS is the only authority for credentials, identities, host sessions,
tenants, memberships, platform roles, subscriptions, entitlements, module
registry, launch policy, billing, and platform audit. Host-routed modules use
the validated OperatorOS session and may narrow permissions; they cannot add a
second password, tenant authority, billing authority, or broader role.

All active platform and module data uses one PostgreSQL authority. Effective
tenant and module scope comes from the validated server session plus verified
membership and entitlement. Browser-provided tenant selectors are requests to
switch context, never trusted authority.

## Production topology

One Replit autoscale workload owns the public runtime:

1. `.replit` uses `npm exec` with pnpm `10.34.5` to install the frozen
   workspace and run `pnpm build:production`.
2. `scripts/start-unified-runtime.mjs` validates the production environment.
3. The supervisor runs the compiled 21-step database release and stops on any
   failure.
4. The compiled Fastify API starts privately on port 5001 and must report
   `/readyz` before public startup continues.
5. The compiled Next server starts on public port 5000. Its server-only
   `INTERNAL_API_URL=http://localhost:5001` rewrites same-origin API traffic to
   Fastify.
6. Replit TLS and host attachment route the canonical hosts to the one Next
   surface. Next middleware and rewrites preserve the exact host as the routing
   and session boundary.

The runner gateway is not part of the public autoscale process. Imported
`apps/modules/*/source` trees are read-only migration evidence and are never
started or migrated against the OperatorOS database.

## Canonical host registry

| Host | Role | Launch state |
| --- | --- | --- |
| `operatoros.net` | Public platform/root and canonical signed-out destination | Active |
| `app.operatoros.net` | Authenticated My Apps launcher | Active |
| `auth.operatoros.net` | Credential entry and SSO authorization | Active |
| `api.operatoros.net` | Path-preserving Fastify proxy | Active |
| `tradeflowkit.operatoros.net` | TradeFlowKit module | Enabled |
| `torqueshed.operatoros.net` | TorqueShed module | Enabled |
| `techdeck.operatoros.net` | TechDeck module | Enabled |
| `pulsedesk.operatoros.net` | PulseDesk module | Enabled |
| `faultlinelab.operatoros.net` | FaultlineLab module | Enabled |
| `ninja-pool-hall.operatoros.net` | Ninja Pool Hall module | Enabled |
| `brandforgeos.operatoros.net` | BrandForgeOS module | Enabled |
| `snapproofos.operatoros.net` | SnapProofOS module | Enabled |
| `studyforge-ai.operatoros.net` | StudyForge AI module | Enabled |
| `ninjalaunchkit.operatoros.net` | Ninja Launch Kit module | Enabled |
| `callcommand-ai.operatoros.net` | CallCommand AI module | Enabled |
| `ninjamation.operatoros.net` | Ninjamation module | Enabled host; parity unresolved |
| `outcall.operatoros.net` | OutCall module | Enabled bounded workload; live provider fail-closed |

The machine-readable URL and environment authority is
`config/production-environment.contract.json`. Standalone branded domains and
the default Replit alias are not callbacks, CORS origins, or return targets.

## Authentication and navigation

Browser SSO uses exact registered HTTPS callbacks, opaque 60-second single-use
codes, state, nonce, PKCE S256, environment binding, replay protection, and
host-only `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/` cookies. Codes appear
only on the registered `/sso` callback and are removed from browser history;
session tokens do not appear in URLs, browser storage, or logs.

The external launcher is `https://app.operatoros.net/`. Module navigation uses
the server-authoritative module navigation contract. Relative module-host
`/app` links are unsupported. Return targets are exact-host or approved
same-site destinations and hostile targets collapse to a canonical fallback.
Global logout rotates the user's token version so already-issued host sessions
become unusable. Local logout clears and revokes only the current host session.

## Database release contract

`corepack pnpm db:plan` emits the ordered, secret-free release plan.
`corepack pnpm db:apply` is the only supported root apply path and requires
`OPERATOROS_DATABASE_RELEASE_MODE=apply`. The production supervisor executes
the compiled equivalent before Fastify starts.

The release has 21 ordered, idempotent steps: base, extended, SaaS, tenant,
shared-directory, module, TradeFlowKit, TechDeck, PulseDesk, TorqueShed,
FaultlineLab, and shared-service DDL;
plan/admin seed; pre-seed repair; platform component and module catalog seed;
personal-tenant and super-admin backfills; demo tenant seed; post-seed repair;
and free-account-app backfill. The contract is additive and declares no
destructive step. Recovery is restore-to-new-database followed by traffic
switching, never in-place destructive rollback.

The shared Business Directory is owned by OperatorOS and keeps tenant-scoped
organizations, contacts, normalized addresses, sites, associations,
relationships, tags, archive/version/audit fields, and narrow TradeFlowKit,
TechDeck, and PulseDesk profile extensions. A directory organization is a
business record inside a tenant; it is never an identity tenant or authority
boundary. Legacy module client records remain migration inputs until a
repeatable importer and reconciliation report are approved.

Shared platform services are also owned by OperatorOS. Ten tenant/module-bound
tables persist private attachment content and scan state, versioned notification
templates, durable outbox and user notifications, leased jobs, verified
webhook receipts, append-only usage and activity events, and generic
idempotency claims. Provider adapters expose configured, disabled, or test
state without exposing credentials. The compiled API worker uses bounded
`SKIP LOCKED` leases, retry/dead-letter state, and expired-lease recovery.
Imported module queues, providers, upload paths, and migrations are not runtime
authority. The full contract is recorded in
`docs/shared-services/SHARED_SERVICE_CONTRACTS.md`.

TradeFlowKit is the first module with an approved source/local state 4
candidate. Its namespaced runtime uses shared Directory identities and shared
attachments/outbox/activity while owning only the tenant-scoped revenue and
field-service domain: leads, linked customers, numbered jobs, first-class
tasks/dependencies, quotes, invoices, payments, public documents, settings,
and migration references. Public tokens are stored only as hashes. Customer
invoice payments remain separate from OperatorOS subscription billing, and
the production customer-payment adapter is disabled pending a reviewed shared
provider contract. ADR-0010 and ADR-0011 define the product boundary.

TechDeck is the second module with an approved source/local state 4 candidate.
It references shared Directory organizations/sites and shared private
attachments while owning tenant-scoped configuration inventory, documented
network/IPAM topology, lifecycle records, tickets/comments/time, versioned
documentation/runbooks/backlinks, evidence metadata, deterministic report
snapshots, and migration references. These records document operator-managed
state; no discovery or device mutation is implied. ADR-0012, ADR-0013, and
ADR-0014 define the network/IPAM, credential-reference, and no-remote-execution
boundaries.

FaultlineLab is a Phase 10A state-3 source/local completion candidate. It owns
tenant-scoped versioned challenges, attempts, assignments, progress and
append-only evidence while OperatorOS retains identity, tenant, entitlement
and billing authority. Only four validated runnable source cases initialize;
52 planned cards remain non-playable. Scores and evidence release are
server-derived, proof files use shared private attachments, and no certificate
claim exists. ADR-0019 defines this boundary.

Child migrations and `drizzle-kit push` are not supported deployment paths.

## Health and observability

- `/healthz` reports process health and service version.
- `/readyz` fails closed unless the database, session signing, SSO code
  encryption, module registry, and shared service worker are ready. Optional
  providers report configured or disabled state explicitly without values.
- Structured request completion logs include request ID and bounded
  user/tenant/module context. SSO decisions include correlation IDs without
  raw codes, cookies, passwords, secrets, or authorization headers.
- `scripts/verify-production-runtime.mjs` performs 47 unauthenticated,
  read-only checks across health, readiness, diagnostics, PKCE redirects,
  callback reachability, and OutCall's exact enabled callback boundary.

## Configuration and release order

1. Review `corepack pnpm db:plan` and take a verified backup.
2. Configure secrets and exact values from the machine-readable environment
   contract; keep `APP_URL`, `COOKIE_DOMAIN`, and `NEXT_PUBLIC_API_URL` unset.
3. Run `corepack pnpm preflight:production -- --core` in the deployment
   environment. Run provider-specific profiles only for features being enabled.
4. Build with `corepack pnpm build:production`.
5. Start only through `node scripts/start-unified-runtime.mjs`.
6. Require `/healthz`, `/readyz`, the public 48-check verifier, and the
   production-host browser SSO gate before accepting the release.
7. Roll traffic back if identity, tenant isolation, entitlement, SSO, audit,
   persistence, or readiness checks fail.

The current source/local evidence is recorded in
`docs/CURRENT_RELEASE_GATE.md`. Passing this platform gate does not certify
module workflow parity.
