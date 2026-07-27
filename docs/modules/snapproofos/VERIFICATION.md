# SnapProofOS Phase 11B verification

Assessment date: 2026-07-26
Environment: compiled local artifacts plus isolated disposable PostgreSQL 16
on `127.0.0.1:55432`; no production data, source-data apply, deployment, or
provider traffic.

## Recorded evidence

| Gate | Result |
| --- | --- |
| Workspace typecheck | PASS: API, runner gateway and web |
| Focused contracts | PASS 17/17: domain, import, database workflow/security, release and canonical deep links |
| PostgreSQL workflow/security | PASS: private upload/download, signature/MIME validation, scan state, SHA-256 integrity, member submit/admin review, findings/comments, append-only custody, report/export, cross-tenant non-enumeration and viewer denial |
| Ordered release | PASS: clean 24-step apply in 7,713 ms and idempotent reapply in 1,409 ms |
| Complete API aggregate | PASS 787/787, failed 0, skipped 0 on a fresh database |
| Production build | PASS: SDK, API, runner gateway and Next.js 14.2.35; 20 static page entries |
| Core production preflight | PASS with exact canonical non-secret test configuration |
| Compiled production start | PASS: readiness-gated supervisor applied all 24 steps, started Fastify and the shared worker, then started compiled Next |
| Health/readiness | PASS: direct and web-proxied `/healthz` and `/readyz`; database, auth, SSO code encryption, module registry and shared worker configured |
| Focused production-host browser E2E | PASS 1/1 in 13.8 seconds |
| Full production-host browser E2E | PASS 6/6 in 1.3 minutes with no retry |
| Deployed target | NOT RUN; deployment not authorized |

The browser scenario creates a real evidence case, captures an append-only
note, uploads private bytes, waits for the shared scanner, verifies both
evidence records under server reviewer authority, records a finding and
internal comment, approves the case, snapshots and approves a report, downloads
a real JSON export, verifies displayed custody continuity, places a legal hold,
checks mobile navigation, returns through My Apps, globally logs out, directly
reopens the case through SSO, refreshes the deep route, and confirms persistence.

## Failure and retest record

- A first compiled supervisor attempt failed safely because a new production
  database had no explicit `ADMIN_PASSWORD`. The rerun supplied a disposable
  test-only bootstrap secret and completed. No fallback credential was added.
- Port 5000 was already owned by an unrelated local Node process. The accepted
  supervisor run used public port 5100 while preserving private Fastify port
  5001 and the production environment contract.
- The first SnapProofOS browser run completed the workflow but its final
  assertion matched both the list and detail `approved` labels. The selector
  was scoped, the focused scenario passed 1/1, and the full matrix passed 6/6.
- An immediate repeated full matrix reached the intended per-process
  registration rate limit after earlier test identities. Restarting only the
  disposable API cleared the in-memory test bucket; production limits were not
  weakened, and the clean full rerun passed 6/6.

Phase 11B is a source/local consolidation state-4 candidate. State 5 still
requires the exact revision deployed on the target plus authorized
reconciliation/cutover, deployed health, SSO, return, logout, persistence,
tenant-isolation, authorization and browser acceptance evidence.
