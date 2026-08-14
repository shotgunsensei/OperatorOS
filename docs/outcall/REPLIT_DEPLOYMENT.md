# OutCall Replit Deployment

Status: Phase 18 active source/local candidate; no production deployment or
live-provider acceptance is claimed.

## Topology

Deploy through the repository's existing `.replit` and
`scripts/start-unified-runtime.mjs` contract. Never start or build
`apps/modules/outcall/source`; it is read-only evidence. The compiled Fastify
API, Next web app, and shared PostgreSQL service worker run under the existing
supervisor. A separate OutCall deployment requires a later workload ADR.

Provision Replit managed PostgreSQL only if it is the same approved OperatorOS
production database or an approved network path to that shared database. The
supported choice is shared OperatorOS PostgreSQL governed by the single
ordered release contract. `DATABASE_URL` is the only database connection
variable; do not run a child migration tool.

## Build and start contract

The shared runtime provides:

- `corepack pnpm install --frozen-lockfile`
- `corepack pnpm build:production`
- `corepack pnpm db:plan` and the guarded `corepack pnpm db:apply`
- `node scripts/start-unified-runtime.mjs`

Platform health targets `/healthz`; `/readyz` validates the shared database,
auth, registry and runtime. The privacy-safe module probe is
`GET /api/modules/outcall/health`. The `--outcall-ready` preflight is the
provider/configuration gate.

## Domain and provider routing

After publishing, add `outcall.operatoros.net` in Replit Domains and copy the
exact Replit-provided DNS record to the OperatorOS DNS provider. Do not guess
the target. Verify DNS and TLS before configuring callbacks. Set the Twilio
number's inbound messaging webhook to:

- `POST https://outcall.operatoros.net/api/modules/outcall/webhooks/twilio/sms`

Voice status and DTMF gather callbacks are generated per call under these
implemented prefixes and include the server-owned request identifier:

- `POST https://outcall.operatoros.net/api/modules/outcall/webhooks/twilio/voice/status`
- `POST https://outcall.operatoros.net/api/modules/outcall/webhooks/twilio/voice/gather`

There is no OutCall recording callback, generic voice-inbound route, or SMS
status route. Do not invent or configure one.

Twilio signature validation must use `OUTCALL_PUBLIC_URL`, not an untrusted Host
or forwarding header. Production must not trust `replit.dev` preview URLs.

## Release and rollback

1. Back up/export the database and record the exact committed candidate.
2. Review `corepack pnpm db:plan`, then let the readiness-gated supervisor
   apply release v33 through the supported guarded path.
3. Deploy with live provider operations fail-closed; verify health, readiness,
   worker heartbeat, SSO, tenant isolation, active registry state, and the
   explicit provider state.
4. Configure the domain and inbound SMS callback, grant only the controlled
   acceptance tenant, and set `OUTCALL_LIVE_PROVIDER=enabled` for the reviewed
   test window.
5. Complete the Verify/SMS/voice/DTMF/replay/tamper/cancellation acceptance and
   either approve the limited launch or turn the provider flag off.

Rollback application code to the prior deployment while leaving additive
migrations in place. Destructive schema reversal requires a separately tested
runbook. Pause new job claims before shutdown, finish or release leases, close
database pools, and exit within Replit's termination window.

## Operations

Use structured logs with request/correlation id, job id, provider request id,
deployment version, safe state, and latency. Export queue age, worker heartbeat,
webhook failures, failed calls, retry/dead-letter counts, and usage-reconciliation
failures. Replit Scheduled Deployments may invoke the idempotent reconciliation
entrypoint for defense in depth, but are not the primary scheduler.
