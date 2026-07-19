# Cross-module readiness report

Assessment updated: 2026-07-18. Scope: OperatorOS, TradeFlowKit, PulseDesk,
TechDeck, and TorqueShed in the consolidated `C:\Dev\OperatorOS` runtime.

## Release rule

No row may be marked production-ready until authenticated SSO, return
navigation, persisted functionality, server authorization, cross-tenant
isolation, production build, live health/readiness, and end-to-end browser
tests all pass in the target deployment.

## Current matrix

| Module | Real shared-runtime workload | Auth/tenant enforcement | Build | DB tests | Live health | Browser E2E | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- |
| OperatorOS | Identity, tenant, entitlement, billing, audit, launcher | Local SSO/RBAC/tenant tests pass | Pass | Pass | Local pass; deployed target not run | Local 2/2; deployed target not run | **Not production-ready** |
| TradeFlowKit | Source/local state 4 candidate: lead conversion; shared Directory customers; numbered jobs/tasks/dependencies; quotes/public decisions; idempotent invoices; partial manual/test-provider payments; portal/documents; messaging; settings; real analytics; CSV export | Server guards, versions, idempotency, persistence/restart, viewer denial, Directory mapping, and cross-tenant tests pass | Pass | Pass | Compiled shared runtime and public route pass locally; deployed target not run | TradeFlowKit rows pass in refreshed acceptance and SSO 2/2 passes; deployed workflow/cutover not run | **Not production-ready** |
| PulseDesk | Source/local state 4 candidate: PHI-minimized Directory clients/facilities/requesters; departments; operational assets; numbered tickets; queue/team assignment; notes/replies; shared attachments; time/SLA; vendor, supply and facility coordination; knowledge, views, configuration, dashboards and deep links | Server guards, capability limits, versions, idempotency, privacy validation, internal-note isolation, restart persistence, Directory mapping and cross-tenant tests pass | Pass | Pass | Compiled 19-step shared runtime and anonymous deep-link smoke pass locally; deployed target not run | Local production-host SSO/return/logout evidence recorded below; deployed workflow/privacy/cutover not run | **Not production-ready** |
| TechDeck | Source/local state 4 candidate: Directory-linked tickets/comments/time; configuration inventory; network/IPAM; lifecycle; versioned documentation/runbooks/backlinks; private attachments; evidence; reports; deep links | Server guards, versions, site/client pairing, managed-client Directory profile, document transitions, secret-field rejection, audit, viewer denial, and cross-tenant tests pass | Pass | Pass | Compiled 18-step shared runtime and anonymous deep-link smoke pass locally; deployed target not run | Production-host SSO 2/2 and TechDeck deep-link/refresh/Back/local logout pass locally; deployed workflow/provider/cutover not run | **Not production-ready** |
| TorqueShed | Phase 9 source candidate: Phase 7 automotive foundation; safety-ranked Assist and append-only token accounting; persistent Marketplace/Community, scanned media, blocks, reports and append-only moderation with native UI | Phase 9 domain/static 7/7 and cumulative database-independent Phase 7-9/release 24/24 pass; DB payment/ledger/provider/scanner/social/moderation/concurrency workflows exist but are unrun because Docker is unusable | Pass | Source contracts pass; exact persistence/isolation/one-credit/one-debit/scanner/moderation browser rerun blocked | Production build/preflight evidence recorded in Phase 9 verification; compiled runtime and deployed target not run | Existing shared SSO/shell evidence predates Phase 7-9; new `/diagnostics`, Assist, Marketplace and Community rerun blocked | **Not production-ready** |

## Final E2E acceptance update

The full 35-step production-host browser sequence was executed locally on
2026-07-16. It emitted 28 passing evidence records and 10 failures. Shared SSO,
exact My Apps entitlement filtering, module launch/return, global logout and
revocation, implemented-data persistence, expired-session handling, disabled
entitlements, foreign-tenant denial, unauthorized API denial, production
builds, health/readiness, and primary navigation checks passed.

Phase 4 closes the approved TradeFlowKit source/local workflow gap and resolves
projects versus jobs through ADR-0010. The refreshed acceptance has 29 passing
evidence records and 9 failures; all TradeFlowKit-specific rows pass. It does
not pass the ecosystem release because deployed/cutover evidence is absent and
the remaining historical failures are PulseDesk assets/tickets/internal notes/time
entries; TechDeck VLANs/subnets; and the older deployed TorqueShed first-class
vehicles/diagnostic sessions/trouble codes/measurements, Torque Assist, token
ledger, marketplace/community, and `/diagnostics` deep route. Phase 7/8/9 source
remediates the automotive, Assist/ledger and social gaps, but no browser result is
rewritten without a clean runtime rerun. See
`docs/FINAL_E2E_ACCEPTANCE_REPORT.md` for captured URLs, request IDs, responses,
retests, and the final matrix.

Phase 5 closes the approved TechDeck source/local VLAN/subnet and broader
managed-operations gap through ADR-0012/0013/0014. The historical TechDeck
failure is superseded locally by shared Directory references, typed
configuration/network/IPAM/lifecycle records, versioned documentation,
evidence/reports/time, and real deep links. The release still fails because
the cumulative browser acceptance has not been rerun on a deployed target and
TechDeck provider/data-cutover evidence is absent.

Phase 6 closes the approved PulseDesk source/local service-desk gap through
ADR-0015 without introducing an EHR or unnecessary PHI. The historical
PulseDesk failures are superseded locally by shared Directory references,
operational assets, ticket messages/time/SLA, assignments, shared private
attachments, vendor/supply/facility workflows, real dashboards and ticket deep
links. The release still fails because the cumulative browser workflow has not
run on the deployed target and no privacy-reviewed data apply, reconciliation
or cutover was authorized.

## Hardening delivered in this pass

- One shared module header/configuration for My Apps, Profile, Billing,
  Support, globally coordinated logout, module name, current tenant, and user.
- Rolling session refresh inside the final 24 hours with scope preservation and
  revocation of the replaced token fingerprint.
- Production JSON logging, request IDs, safe user/tenant/module correlation,
  and secret redaction.
- Database-aware readiness with auth/SSO/registry and optional dependency
  state.
- Non-migrated workflow cards explicitly say `Migration pending — disabled`.
- Shared integration, error, health, and backup/restore contracts.
- One shared, audited Business Directory with tenant-composite database
  constraints, module-specific profiles, reusable responsive UI, and
  cross-module browser persistence proof.

## Known release blockers

- The local production-host SSO browser matrix passes, but it must be rerun
  against the deployed target to prove its proxy, cookies, callback routing,
  direct deep links, return navigation, sibling tabs, and global logout.
- `/healthz` and `/readyz` pass through the local HTTPS host-preserving proxy;
  both must pass against the deployed production database and SSO secret.
- Optional providers are not module readiness claims. Provider-backed UI must
  stay disabled until its configuration and signed webhook/callback tests pass.
- A disposable PostgreSQL backup/restore rehearsal is recorded and passed.
- The reviewed release candidate has not been deployed to the public target.
  The read-only public gate passed 32/47 checks: API readiness, all 17 module
  diagnostics, all 12 callback routes, and OutCall fail-closed behavior passed;
  apex health and anonymous host-only SSO transaction-cookie checks still
  reflect the older public release and block promotion.

## Verification evidence

- `corepack pnpm typecheck`: pass across API, runner gateway, and web.
- The exact pinned `.replit` build command and `corepack pnpm
  build:production` pass for API, runner gateway, and the Next production
  build. The unified runtime applies the compiled database release, starts the
  compiled API, waits for readiness, and starts the compiled Next application.
- Phase 5 focused TechDeck regression: 16/16 passed; the new Phase 5 subset
  passed 5/5. The first full Phase 5 API aggregate reported 702 total, 695
  passed, one stale static-navigation assertion failed, and 6 HTTP-only skips;
  the corrected focused rerun passed 8/8. A stale pnpm-policy assertion was
  also corrected and passed 2/2. The final clean-database aggregate passed 696,
  failed 0, and skipped 6 out of 702 in 616,919 ms.
- Phase 6 PulseDesk focused regression passed 37/37. The final clean-database
  API aggregate passed 706, failed 0, and skipped 6 HTTP-only tests out of 712
  in 1,305,103 ms. The privacy-reviewed dry-run resolved 34/34 references with
  no missing references or privacy findings.
- Focused ecosystem contract suite: 30/30 passed.
- Post-fix focused ecosystem/navigation suite: 15/15 passed; targeted
  database-backed tenant/module RBAC suite: 8/8 passed.
- Production-host HTTPS Playwright SSO matrix: 2/2 passed locally across the
  canonical app host and all 12 enabled module hosts, including direct
  deep-link return, silent PulseDesk sibling launch, clean URLs, host-only
  cookies, local logout, and global revocation. The fresh Phase 6 run passed in
  3.9 minutes.
- Phase 2 production-artifact Playwright: 1/1 passed on isolated ports 5100
  and 5101; created one organization, contact, and addressed site through
  TradeFlowKit, survived refresh, reused the same organization ID in TechDeck
  and PulseDesk, and exposed no script-readable auth material.
- Local shared runtime: `operatoros.net/healthz` returned 200 and
  `api.operatoros.net/readyz` returned 200 with database, auth, SSO encryption,
  and module registry healthy/configured.
- The last database-verified release is Phase 6's 19-step manifest on clean
  isolated PostgreSQL 16 without drift. Phase 7 defines a 20th TorqueShed step
  and Phase 8 extends it with Assist/accounting tables, but Docker daemon
  failure blocked apply and verification. Separately, the Phase 1 PostgreSQL
  16.14 custom-format backup restored into a new database
  with matching critical table counts, 61 public tables, 100 validated foreign
  keys, and no unvalidated foreign keys.

The imported module source trees are quarantined migration snapshots, not
independent deployable repositories. Their production behavior is therefore
validated through the consolidated OperatorOS build, database suite, shared
API, and host-routed browser matrix. Every module remains explicitly not
production-ready until deployed-target health and browser gates pass. Phase 1
and Phase 2 source/local acceptance are complete, but the public target remains blocked
at 32/47 checks until this candidate is deployed and the authenticated
deployed-target gate is rerun.
