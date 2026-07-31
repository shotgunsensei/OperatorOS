# TorqueShed verification

## State 4 acceptance follow-up — 2026-07-31

The prior Phase 9 blocked-gate record below is retained as historical evidence.
Docker Desktop was started, and the missing local gates were rerun against a
new disposable PostgreSQL 16 database and compiled OperatorOS artifacts.

| Gate | Result |
| --- | --- |
| Focused domain/static/browser contracts | PASS 23/23 |
| Phase 7 foundation + Phase 8 Assist + Phase 9 social PostgreSQL workflows | PASS 3/3 in 14.8 seconds total |
| Database release | PASS; v29 plan, clean apply in 10.4 seconds, idempotent reapply in 1.8 seconds |
| Workspace typecheck | PASS for API, runner gateway, and web |
| Production build | PASS; SDK/API/runner and Next 15.5.22 with 20/20 static pages |
| Core preflight and compiled runtime | PASS; web-proxied health/readiness HTTP 200, release v29/29, all core readiness checks configured |
| Dedicated exact-host browser workflow | PASS 1/1 in 13.8 seconds |

The browser workflow proves native vehicle/diagnostic/evidence persistence,
VIN masking, deterministic server-selected Assist, one signed test payment
credit and one exact ledger debit, Marketplace draft/publish, Community
draft/publish/reaction/comment, direct database persistence, mobile layout,
global revocation, diagnostic deep-link reauthentication, My Apps
return/relaunch, Marketplace refresh, and host-only logout. The adapters are
available only in the explicit local test environment; no live payment or AI
provider traffic occurred.

TorqueShed is therefore a source/local consolidation state 4 candidate. It is
not state 5 or production-ready: deployed authenticated acceptance, approved
live Stripe/OpenAI configuration, production backup/rollback, real-data
reconciliation, and an authorized cutover remain open.

## Historical Phase 9 verification — 2026-07-18

Assessment date: 2026-07-18
Branch: `codex/phase-9-torqueshed-marketplace-community`

## Passed database-independent gates

| Gate | Result |
| --- | --- |
| Phase 9 domain/static contracts | PASS 7/7 in 5,152.6855 ms on the final combined rerun; the earlier focused static rerun was 4/4 in 1,414.8039 ms |
| Cumulative Phase 7-9/release contracts | PASS 24/24 in 25,971.4411 ms on the final rerun; the first run was 23/24 only because a UI sentence wrapped across lines in one static regex, then the whitespace-tolerant assertion passed without a behavior change |
| API/web typecheck | PASS; fresh `pnpm --dir apps/api typecheck` and `pnpm --dir apps/web typecheck`, both exit 0 |
| Production build | PASS on the final exact-source rerun; workspace API/runner/web typecheck, SDK/API/runner builds and Next.js 14.2.35 build completed with 20/20 static pages and exit 0 |
| Database release plan | PASS; 20 additive steps, with Phase 9 tables extending the existing ordered `torqueshed_tables` operation |
| Core production preflight | PASS with the exact canonical non-secret contract values and `TRUST_PROXY=true` |
| Formatting | New Phase 9 TypeScript files pass the available Prettier check; repository has no defined lint or formatting script, so neither is a release gate |

## Implemented database workflow coverage

`torqueshed-social-workflow.test.ts` covers:

- community profile persistence and server-side viewer denial;
- draft/publish/expiry listing lifecycle and integer price storage;
- cross-tenant 404 behavior and saved-listing retrieval;
- in-app buyer/seller conversation and message persistence;
- listing and message reports;
- community draft/publish, tags, comments and reactions;
- owner/admin moderation hide plus append-only action evidence; and
- bilateral block behavior preventing later listing enumeration.

The final browser acceptance now creates schema-valid Marketplace and Community
drafts, carries returned IDs/versions, and publishes both. Native UI paths also
cover search/filter/sort/saved listings, seller contact/conversation replies,
reports, scanned images, profiles/preferences, feeds, comments/reactions,
follows/blocks and the manager moderation queue.

## Blocked database/runtime gates

Docker Desktop and the CLI are installed, but the engine is unusable. The
latest probe returns:

`request returned 500 Internal Server Error for API route and version http://%2F%2F.%2Fpipe%2FdockerDesktopLinuxEngine/v1.55/info`

Therefore the following were **not run and do not pass by inference**:

- clean isolated PostgreSQL release apply, second apply, constraints, indexes,
  composite tenant foreign keys and append-only moderation trigger;
- `torqueshed-foundation-workflow.test.ts`,
  `torque-assist-workflow.test.ts` and `torqueshed-social-workflow.test.ts`;
- complete API regression on a clean disposable database;
- shared attachment storage/job/scanner state transitions and clean-only media
  visibility in a real runtime;
- persistence/restart, expiry, rate-window, block, report, moderation,
  notification and second-tenant browser journeys;
- compiled production supervisor, local readiness and health;
- production-host SSO, Marketplace/Community deep-link refresh, return and
  logout acceptance;
- current public verifier/deployed acceptance; and
- real Stripe, AI, scanner or other provider traffic.

To resume, restart Windows or start Docker Desktop/service once with
administrator rights, confirm `docker info` returns server information, and
create a new isolated disposable PostgreSQL database. Use the supported root
release path and never point the tests at a persistent developer or production
database.

## Honest state

The combined Phase 7-9 source candidate implements and builds the requested
automotive, Assist/accounting, Marketplace, Community, privacy, abuse,
moderation and UI boundaries. TorqueShed remains consolidation state 3 until
the clean-database, workflow, scanner, runtime, browser and deployed gates
pass. It is not production-ready. Per the owner's direction, this branch may
be committed and Phase 10A may proceed separately with every blocked gate
preserved for later review.
