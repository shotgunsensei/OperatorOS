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
3. A supervised public gateway binds `0.0.0.0:5000` immediately. During
   bootstrap every HTTP request receives 503 and every WebSocket upgrade fails
   closed. Browser navigations receive a no-store auto-retrying startup page;
   non-browser callers receive structured JSON. `.replit` exposes only this
   listener as external port 80. Ports 5001 and 5002 are private
   process-to-process listeners.
4. The supervisor runs the compiled read-only current-release verifier while
   starting compiled Next privately on port 5002. Next must answer its private
   root and the database must match the exact ordered release before startup
   continues. Routine serving startup never applies DDL or seed operations.
5. The compiled Fastify API starts privately on port 5001 with a
   supervisor-owned verification marker and must report `/readyz` with
   `ready: true`.
6. The supervisor then marks the already-bound gateway ready. It routes HTTP
   to Next and routes `/ws/*` upgrades directly to Fastify after removing the
   internal `/ws` prefix. The server-only
   `INTERNAL_API_URL=http://localhost:5001` remains the HTTP API rewrite
   authority.
7. Replit TLS and host attachment route the canonical hosts to the public
   gateway. It preserves exact host/session headers; Next middleware owns HTTP
   routing while Fastify authenticates and authorizes upgraded sockets.

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
`OPERATOROS_DATABASE_RELEASE_MODE=apply`. Apply is a separate, backup-gated
release operation and holds a PostgreSQL advisory lock for the complete ordered
release. `corepack pnpm db:verify` is the read-only current-release check used
by routine serving startup. The production Autoscale environment must leave
the apply-mode variable unset, and preflight rejects it when present.

The current release has 59 ordered, idempotent steps ending in
`core_suite_trial_tables`. The machine-readable release contract is the only
step authority; historical counts in older evidence do not override it. The
contract is additive and declares no destructive step. Recovery is
restore-to-new-database followed by traffic switching, never in-place
destructive rollback.

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
and billing authority. Every valid definition reachable from the pinned source
`allCases` export initializes by compiler/source hash as a published immutable
version; no authored pack case remains planned-only. Scores and evidence release are
server-derived, proof files use shared private attachments, and no certificate
claim exists. ADR-0019 defines this boundary.

Child migrations and `drizzle-kit push` are not supported deployment paths.

## Health and observability

- Fastify `/healthz` reports process health and service version. Replit
  reserves raw public `/healthz`; production probes use root `/api/health`,
  which reaches the same Fastify snapshot through the supported API rewrite.
- `/readyz` fails closed unless the database, session signing, SSO code
  encryption, module registry, and shared service worker are ready. Optional
  providers report configured or disabled state explicitly without values.
- Before those checks and the private Next root check pass, the public
  gateway identifies itself with `X-OperatorOS-Runtime-State: starting` and
  never proxies application or WebSocket traffic. Every bootstrap response is
  HTTP 503. Browser navigations poll `/readyz` and replace the startup document
  with the exact original URL only after readiness.
- Structured request completion logs include request ID and bounded
  user/tenant/module context. SSO decisions include correlation IDs without
  raw codes, cookies, passwords, secrets, or authorization headers.
- `scripts/verify-production-runtime.mjs` performs 48 unauthenticated,
  read-only checks across health, readiness, diagnostics, PKCE redirects,
  callback reachability, and OutCall's exact enabled callback boundary.

## Configuration and release order

1. Review `corepack pnpm db:plan` and take a verified backup.
2. In a trusted one-shot release environment only, set
   `OPERATOROS_DATABASE_RELEASE_MODE=apply`, run `corepack pnpm db:apply`, unset
   the mode, and run `corepack pnpm db:verify`.
3. Configure secrets and exact values from the machine-readable environment
   contract; keep `APP_URL`, `COOKIE_DOMAIN`, and `NEXT_PUBLIC_API_URL` unset.
   Keep `OPERATOROS_DATABASE_RELEASE_MODE` unset in the serving environment.
4. Run `corepack pnpm preflight:production -- --core` in the deployment
   environment. Run provider-specific profiles only for features being enabled.
5. Build with `corepack pnpm build:production`.
6. Start only through `node scripts/start-unified-runtime.mjs`.
7. Require public root `/api/health`, `/readyz`, the public 48-check verifier,
   and the
   production-host browser SSO gate before accepting the release.
8. Roll traffic back if identity, tenant isolation, entitlement, SSO, audit,
   persistence, or readiness checks fail.

The current source/local evidence is recorded in
`docs/CURRENT_RELEASE_GATE.md`. Passing this platform gate does not certify
module workflow parity.
