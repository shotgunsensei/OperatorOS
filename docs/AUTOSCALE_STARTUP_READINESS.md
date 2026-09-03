# OperatorOS Autoscale startup and readiness

Status: release candidate accepted on `codex/autoscale-startup-readiness`;
owner-authorized production publish and deployed acceptance are in progress.

## Purpose

The Replit Autoscale serving process must not perform the complete ordered
database release every time a new instance wakes. Database promotion is a
separate, backup-gated release operation. Routine serving startup is read-only,
and public application traffic remains closed until the database release,
Fastify, and Next are all ready.

This boundary addresses the 2026-09-02 incident in which a new instance ran all
59 release steps for about 85.7 seconds while a user navigated to the
TradeFlowKit invoice surface. The page displayed a startup response because the
replacement instance was still bootstrapping; the log contained no invoice
exception.

## Runtime contract

`scripts/start-unified-runtime.mjs` owns the only public listener.

1. It validates the production environment and binds `0.0.0.0:5000` with
   readiness closed.
2. It runs the compiled `--verify-current` database check. This check is
   read-only and fails when any required release object is absent.
3. It starts private Next on port 5002 in parallel with database verification.
4. It starts private Fastify on port 5001 only after database and Next
   prerequisites pass. The supervisor passes the internal-only
   `OPERATOROS_DATABASE_RELEASE_VERIFIED=1` marker so the API does not repeat
   the already-completed verification.
5. It sets runtime readiness only after Fastify `/readyz` reports
   `ready: true`. Until then, every HTTP route and WebSocket upgrade remains
   unavailable to application traffic.

The public startup response is HTTP 503, includes `Retry-After: 2`, is
`no-store`, and carries `X-OperatorOS-Runtime-State: starting`. Browser
navigations receive a nonce-protected page that captures the complete
`window.location.href`, polls same-origin `/readyz` with bounded backoff, and
uses `window.location.replace(originalUrl)` after readiness. Path, query, and
fragment are therefore retained. Non-browser callers receive structured JSON;
mutations and WebSocket upgrades fail closed.

Production serving configuration must leave
`OPERATOROS_DATABASE_RELEASE_MODE` unset. The production environment preflight
rejects a serving environment that contains it. The two child-process markers
`OPERATOROS_DATABASE_RELEASE_APPLIED` and
`OPERATOROS_DATABASE_RELEASE_VERIFIED` are internal only and must never be
configured in Replit Secrets or another secret manager.

## Database release procedure

When a reviewed release changes `DATABASE_RELEASE_CONTRACT.releaseVersion`, use
this order from a trusted operator environment. Production backup, apply, and
traffic decisions remain explicit human gates.

```powershell
corepack pnpm db:plan

# Capture and verify the production backup described in
# docs/DATABASE_BACKUP_RESTORE.md before authorizing apply.
$env:OPERATOROS_DATABASE_RELEASE_MODE='apply'
corepack pnpm db:apply
Remove-Item Env:OPERATOROS_DATABASE_RELEASE_MODE

corepack pnpm db:verify
corepack pnpm preflight:production -- --core
corepack pnpm build:production
node scripts/start-unified-runtime.mjs
```

`db:apply` holds a dedicated PostgreSQL advisory lock for the complete release
and final verification, preventing overlapping release processes. A failed or
stale release leaves the serving supervisor at HTTP 503 and stops the startup;
it does not silently apply schema changes or route around readiness.

For a code-only publish whose target database already reports the exact current
release, do not grant apply authority to the Autoscale runtime. Run
`db:verify`, publish the reviewed artifact, and confirm public `/readyz` release
identity before accepting traffic.

## 2026-09-03 release-candidate evidence

- Focused runtime, release CLI, and production environment contracts: 18/18
  passed with zero skips.
- Disposable PostgreSQL 16: clean v59 apply completed in 16,481 ms; idempotent
  reapply completed in 1,595 ms; read-only `db:verify` completed in 1,116 ms.
- Advisory-lock serialization, tenant isolation, module sessions, and shared
  platform integration: 31/31 passed with zero skips.
- All four workspace typechecks passed.
- Deployment-scope verification passed with only public port 80 and one
  authoritative lockfile.
- Production build passed, including 4/4 FaultlineLab catalog checks and 35/35
  generated Next routes.
- The decisive root release gate passed 14/14 stages. Its complete evidence
  includes 46/46 unit tests, 1,322/1,322 API tests with zero skips, 31/31
  disposable-database integration tests, 1,304 route-control capabilities with
  zero failures, all 13 static visual contracts, 21/21 exact-host production
  browser/accessibility journeys, 4/4 visual suites, and production preflight.
- The dependency/security gate inspected 1,279 dependencies and reported zero
  unresolved advisories and zero findings. Fastify resolves to 5.12.1 and
  `fast-uri` resolves to 4.1.4.
- The final independent disposable-database rehearsal applied clean v59 in
  19,728 ms and verified current v59/59 in 1,044 ms. The full release gate's
  clean apply/reapply integration stage passed in 58,944 ms.
- The production-mode supervisor against the disposable current database
  captured HTTP 503 during bootstrap and public `/readyz` HTTP 200 after
  4,909 ms. Its database verification logged 889 ms and Next became ready in
  538 ms. An unauthenticated TradeFlowKit invoice deep link then reached the
  expected exact-host SSO redirect instead of the startup response.

These figures accept the source and local production artifact. They do not yet
claim a Replit publish or deployed release identity. Production already reports
database release v59/59, so this code-only publish uses read-only verification
and must not grant schema-apply authority to the serving runtime.
