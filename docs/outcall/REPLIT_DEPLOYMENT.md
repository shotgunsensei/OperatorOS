# OutCall Replit Deployment

Status: shared-runtime target design; no Phase 12B production deployment is
claimed.

## Topology

Deploy through the repository's existing `.replit` and
`scripts/start-unified-runtime.mjs` contract. Never start or build
`apps/modules/outcall/source`; it is read-only evidence. The compiled Fastify
API, Next web app, and shared PostgreSQL service worker run under the existing
supervisor. A separate OutCall deployment requires a later workload ADR.

Provision Replit managed PostgreSQL only if it is the same approved OperatorOS
production database or an approved network path to that shared database. The
recommended choice is shared OperatorOS PostgreSQL with restricted OutCall
permissions. `DATABASE_URL` is the only database connection variable required.

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
the target. Verify DNS and TLS before configuring production callbacks. These
planned endpoints must not be configured in Twilio until their signed
implementations and controlled acceptance tests exist:

- `POST https://outcall.operatoros.net/api/outcall/webhooks/twilio/sms`
- `POST https://outcall.operatoros.net/api/outcall/webhooks/twilio/sms/status`
- `POST https://outcall.operatoros.net/api/outcall/webhooks/twilio/voice`
- `POST https://outcall.operatoros.net/api/outcall/webhooks/twilio/voice/gather`
- `POST https://outcall.operatoros.net/api/outcall/webhooks/twilio/voice/status`

Twilio signature validation must use `OUTCALL_PUBLIC_URL`, not an untrusted Host
or forwarding header. Production must not trust `replit.dev` preview URLs.

## Release and rollback

1. Back up/export the database and record the deployed commit.
2. Acquire a PostgreSQL migration advisory lock and apply backward-compatible
   migrations before switching traffic.
3. Deploy with live provider operations fail-closed; verify health, readiness,
   worker heartbeat, SSO, tenant isolation and the explicit provider state.
4. Configure domain and provider callbacks, then grant a limited beta tenant.
5. Activate registry status only in a separate reviewed release.

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
