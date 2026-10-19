# OperatorOS outbound webhook egress review

Verdict: implementation candidate; deployment and full release acceptance unverified.

## Scope and source

Reviewed initial main `21fa642021a658167d766fee653c544692078f31`, then
fast-forwarded the isolated candidate to
`c55e580f8858ec3e3200a717af310a184285832b` (2026-10-19T13:01:40Z).
The intervening commit changes development migration SQL and local memory only;
it does not change this webhook path. The canonical checkout and preserved
branches were not modified. This repository meets the requested recent-activity
cutoff of 2026-09-21 based on pre-audit source activity.

This was ordinary source/security review, not a completed formal Codex Security
Deep Scan. Its scan server was unavailable. Historical scan findings at
`47d32d71` are prioritization context, not current verification.

## Confirmed boundary and repair

Tenant administrators register receiver URLs through
`shared-platform-routes.ts`. CallCommand writers can enqueue an existing
tenant/module endpoint; the queue checks enabled status and subscribed events.
The shared service worker delivers the signed payload later.

Previously, `shared-outbound-webhooks.ts` checked DNS and then called `fetch`,
whose separate connection could resolve a changed address. The address policy
also mishandled mapped hexadecimal IPv6 and incomplete link-local ranges; URL
hostnames retain brackets for IPv6 literals. Normal HTTPS certificate checking,
port 443 and rejected redirects constrained impact: arbitrary HTTP metadata
access or a successful internal POST was not demonstrated. Private literal
creation validation alone was not proof of successful delivery.

The shared transport now validates literals consistently, rejects non-public
and special-use addresses, validates all DNS answers, and supplies only that
validated set to the HTTPS socket lookup. Original URL identity preserves Host,
SNI and certificate checks. Each request has a fresh agent, a 15-second deadline
covering DNS and transport, unchanged signed body/headers, and no redirect follow.
Receiver response bodies are destroyed instead of buffered. Upgrade responses
and premature closes settle the operation so one receiver cannot stall the
shared worker indefinitely. The existing retry/status accounting remains in
the caller. Deterministic production-artifact tests still return before DNS,
secret resolution or network access. No dependency or database change is needed.

Nine new offline tests cover alternate IP encodings, mapped IPv6, public
dual-stack addresses, mixed/empty DNS results, pinned lookup in both callback
forms, original HTTPS identity and payload, redirects, DNS/TLS errors,
cancellation, upgrades and premature close. A real Node ClientRequest parser
over an in-memory Duplex reproduces the upgrade event without opening sockets.

One independent read-only investigator traced the original boundary; a fresh
read-only reviewer found the HTTP 101 settlement issue, which was corrected
and retained as a regression. No additional concrete bypass was reported.

## Verification actually completed

Pinned pnpm 10.34.5 installation used the frozen lockfile in the isolated copy
with lifecycle scripts disabled. Local runtime is Node 24.16.0; release CI
and Replit specify Node 20, so exact deployment-runtime evidence remains a gate.
Commands below use that pinned pnpm through a task-local executable shim.

- `pnpm --dir apps/api exec tsx --test --test-concurrency=1 test/public-webhook-http.test.ts test/deterministic-outbound-isolation.test.ts test/shared-queue-tenant-scope.test.ts test/replit-unified-runtime.test.ts`: 16 passed, zero failed/skipped. The existing gateway test uses task-local loopback only.
- `pnpm --dir apps/api exec tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --esModuleInterop --skipLibCheck src/lib/public-webhook-http.ts test/public-webhook-http.test.ts`: passed.
- `pnpm lint`: passed with zero warnings.
- `pnpm typecheck`: passed for all four workspaces.
- `INTERNAL_API_URL=http://localhost:5001 pnpm build:production`: passed, including 38/38 generated Next pages. No API server or database was started by this build.
- `pnpm db:plan`: passed; read-only v67 manifest, no database connection.
- `git diff --check`: passed.

Initial supplementary auth-boundary tests without a disposable database failed
(16 of 18 checks passed); they were not changed to skips. The database-backed
cases attempted loopback port 5432 and were denied by the sandbox before any
DDL executed. No persistent or production database configuration was used.
The gateway loopback fixture also initially failed sandbox network access;
rerunning that exact fixture with permitted loopback access passed. An initial
Next production build failed local directory creation under the sandbox;
rerunning the same isolated build with permitted filesystem access passed.
Exact-head CI remains a separate gate.

## Broader audit evidence and open gates

Static inventory found 37 active Next page templates, 322 registered static
module deep links, 145 supplemental navigation literal occurrences and 330
imported page/route capabilities across 13 modules. There are 302 tracked
page/screen source files including imported snapshots. The existing discovery
tools inventoried 1,173 route declarations. These are inventory counts, not
deep coverage or proof that every customer workflow works. Imported source
snapshots remain read-only migration evidence. A task-local page and route
inventory records source paths independently of examined security paths.

Shared auth/session scope, tenant selection/membership, webhook HMAC and secret
vault, worker lifecycle, billing binding, supervisor readiness, database release
manifest and backup/rollback contracts were inspected at their relevant boundaries.
This does not constitute exhaustive review of all module handlers or pages.

Fresh registry audit found two unignored moderate Next.js advisories,
GHSA-4jqv-mc3x-m676 and GHSA-mcj8-r9mp-w47p, with fixed range >=15.5.27;
the frozen candidate uses 15.5.25. Existing locally patched advisory exceptions
remain intact. The [first advisory](https://github.com/advisories/GHSA-4jqv-mc3x-m676)
specifically requires self-hosted Pages Router SSG/ISR; current active web source
uses App Router. The [second advisory](https://github.com/advisories/GHSA-mcj8-r9mp-w47p)
requires a root catch-all with SSG/ISR; current catch-alls are nested. A direct
production exploit is not established. The [maintainer patch release](https://github.com/vercel/next.js/releases/tag/v15.5.27)
is verified, but the update is queued separately: the parent reported automatic
approval review rejected further unsigned third-party dependency installation
on the host. No dependency acquisition was attempted after that denial.

Draft PRs 111, 112 and 114 remain preserved. PR112's payment-cancel source is
already identical to main. PR111's pricing work has later main changes; it
must be reconciled rather than merged wholesale. PR114's grounded-research
branch appends a conflicting historical v66 research step while main owns
v66 AI budget and v67 OutCall resource steps. It requires explicit source and
migration reconciliation; this patch does not merge it.

Production schema is not verified by this task. Main expects v67/67; historical
live evidence was v65/65. No production migration, backup, write pause, provider
call, customer scan, deployment or paid-feature activation was performed.
Exact database confirmation, recoverable whole-platform backup, write-pause
window and explicit approval remain mandatory before any production apply.
Full release CI, disposable database integration, exact deployed revision,
authenticated two-tenant/role workflows, real receiver acceptance and rollback
rehearsal remain open. No module parity or launch state is promoted.
