# OutCall Replit Deployment

Status: target design; no production deployment is activated in Phase 1.

## Topology

Create one Replit app from this repository, rooted/build-scoped to
`apps/modules/outcall/source`, and publish it as a Reserved VM. The production
entrypoint will run one Node supervisor containing the HTTP server and durable
worker/reconciliation loops. Bind to `0.0.0.0:${PORT}`. Do not use Autoscale for
the MVP worker and do not depend on the development workspace.

Provision Replit managed PostgreSQL only if it is the same approved OperatorOS
production database or an approved network path to that shared database. The
recommended choice is shared OperatorOS PostgreSQL with restricted OutCall
permissions. `DATABASE_URL` is the only database connection variable required.

## Build and start contract

The Phase 2 runtime should provide:

- `pnpm install --frozen-lockfile`
- `pnpm build` for server/UI artifacts
- `pnpm start` for the supervised HTTP and worker process
- `pnpm migrate` as an explicit, locked release step
- `pnpm reconcile` as an idempotent maintenance entrypoint

The Reserved VM health check targets `GET /api/outcall/health`; readiness uses
`GET /api/outcall/readiness` and validates database connectivity, schema
compatibility, required configuration, and a fresh worker heartbeat without
returning internal details.

## Domain and provider routing

After publishing, add `outcall.operatoros.net` in Replit Domains and copy the
exact Replit-provided DNS record to the OperatorOS DNS provider. Do not guess
the target. Verify DNS and TLS before configuring production callbacks. Stable
production endpoints will be:

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
3. Deploy with the module still planned/disabled; verify health, readiness,
   worker heartbeat, SSO, and provider test mode.
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
