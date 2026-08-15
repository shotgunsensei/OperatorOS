# Phase 39 — Production Security, Reliability, Performance, Accessibility, and Operations

> Overall status: **SOURCE/LOCAL HARDENING PASS; PLATFORM RELEASE NOT ACCEPTED**. Phase 39 controls and focused gates pass against production artifacts and disposable PostgreSQL 16. The repository-wide parity compiler still reports inherited blocked/missing capabilities, so `verify:release` is correctly non-green. Production deployment, live-provider failure rehearsal, production backup/PITR restore, alert delivery, human visual review, merge, and promotion are not claimed.

## Outcome

Phase 39 hardens the cumulative OperatorOS platform without retiring user outcomes. It adds an executable security/dependency gate, CycloneDX SBOM, patched transitive parser regression tests, fail-closed runner/provider modes, dependency-aware readiness, worker lease/queue telemetry, explicit performance budgets, exact-host accessibility and responsive checks, 39 visual baselines, deterministic clean-database backup/restore/reapply rehearsal, and platform/module threat-model and incident/SLO runbooks.

The work also repaired production-artifact acceptance infrastructure discovered by the clean-database sweep: the release workflow now supplies the disposable admin bootstrap secret; browser subprocess output cannot deadlock the runtime; exact-host TLS test traffic is explicit; canceled Next.js RSC prefetches are distinguished from application failures; deterministic AI/payment adapters require a three-part disposable-CI guard; and Ninja Launch Kit exposes both the Phase 34 complete-kit product and the earlier persisted execution/readiness workspace rather than silently replacing either one.

## Security controls and evidence

| Boundary | Implemented control | Local evidence |
|---|---|---|
| tenant, role, entitlement | Existing request guards remain authoritative; Phase 39 RBAC matrix enumerates parent, tenant, module, public-token, and worker authority; isolation/denial journeys remain in the compiled browser and API suites | `RBAC-ENTITLEMENT-MATRIX.md`; API/preflight tests; exact-host SSO tests |
| dependency/SBOM | Frozen pnpm graph, CycloneDX 1.6 SBOM, production dependency audit, exact advisory allowlist, and executable regression coverage for both patched `image-size` parser defects | 1,217 SBOM components; 0 critical and 0 unresolved high findings; 2 exact patched/allowlisted upstream advisories |
| SAST/secrets | Repository scanner checks tracked source/config for private keys, credential assignments, query-string credentials, command interpolation, unsafe SQL fragments, and sensitive logging patterns | 1,162 files scanned; 0 findings; controlled-positive scanner fixtures pass |
| runner | Production default is `disabled`; local/docker/kubernetes modes require explicit configuration; API execution routes deny with `RUNNER_GATEWAY_DISABLED`; no arbitrary script executes in the web/API process | runner unit/static and API route denial tests |
| AI/payment deterministic adapters | Test fallback is available only when `OPERATOROS_DETERMINISTIC_PROVIDER_MODE=1`, `PARITY_DATABASE_IS_DISPOSABLE=1`, and `CI=true` are all present | negative single-/double-flag tests plus production-artifact TorqueShed/BrandForge acceptance |
| uploads/content | CallCommand request envelopes are bounded; shared upload contracts enforce raw, absolute, and encoded-envelope limits; parser regression prevents malformed ICNS/JXL non-advancing reads | API/static hardening tests and performance-budget contract |
| browser response | CSP, HSTS, frame denial, MIME sniffing denial, referrer policy, and permissions policy are emitted by the production web surface | production build and exact-host route/accessibility sweep |
| SQL/path/redirect/provider secrets | raw dynamic TechDeck filter fragments were replaced by bounded SQL composition; existing safe redirect, provider reference/vault, and redaction boundaries remain part of preflight and threat models | typecheck, static tests, platform/module threat-model register |

The dependency gate records the two upstream high-severity `image-size@1.2.1` advisories by exact GHSA only because the installed package is patched in-repository and both exploit regressions are executable. A broad package-name or severity suppression is not used.

### Residual security finding

`M-39-01` — the web CSP retains compatibility allowances for existing inline styles/scripts while the app migrates to request nonces/hashes. No critical or high Phase 39 finding remains open. Proposed owner/remediation date: **2026-09-30**. This date is **not owner-approved yet**, so the acceptance clause for documented owner-approved medium dates remains open.

## Reliability, database, and worker evidence

- Cumulative database release **v48** applies to an empty PostgreSQL 16 database and immediately reapplies idempotently.
- The disposable recovery rehearsal produced a `pg_dump` archive of **1,753,870 bytes**, SHA-256 `bf25267ab707935cbad3100b4c74bee92dd7a1461bec59b73565fa5c119b2fba`, with **3,276** TOC entries.
- Restore into a separately created database reproduced **378 tables**, **1,191 foreign keys**, and **0 unvalidated constraints**. A second release reapply produced an identical schema fingerprint. Total rehearsal time was **37,012 ms**.
- Shared workers publish heartbeat age, active leases, oldest-ready age, processed/failed counts, and graceful-shutdown state. Readiness is non-green for stale required workers, excessive queue age, unavailable required providers, invalid release/database state, or missing production security configuration.
- Retry, backoff, idempotency, lease, dead-letter, restart, and provider-failure behavior is exercised by the existing shared-service suites plus the Phase 39 focused database/reliability set (**34/34 passed**).
- `DATABASE_BACKUP_RESTORE.md`, `SLO_AND_ALERT_RUNBOOK.md`, and `INCIDENT_ROLLBACK_RUNBOOK.md` define backup verification, restore-to-new-database, reconciliation, forward-fix/rollback, alert thresholds, and incident ownership.

This is a disposable local restore rehearsal, not evidence that the production provider has PITR enabled or that a production backup can be restored within the target RTO/RPO.

## Observability and operations

Production health/readiness includes release identity, database release, required dependency state, worker heartbeat/lease/queue state, and provider readiness without returning secret material. Correlation/request IDs continue through HTTP and shared jobs. Structured logging requirements, sensitive-field redaction, retention, alert routing, failed-job/provider/webhook/import/export operations, and incident response are captured in the platform threat model and SLO/incident runbooks.

Readiness deliberately fails closed when required security keys, canonical hosts, database release state, runner policy, providers, or required workers are invalid. Optional provider absence remains visible as unavailable rather than simulated success.

## Performance budgets and measurements

`config/production-budgets.json` is executable policy rather than narrative guidance:

| Surface | Budget |
|---|---|
| API | read p95 <= 300 ms; write p95 <= 500 ms; p99 <= 1,500 ms; 10 concurrent clients; 100 requests/route |
| browser | LCP <= 2,500 ms; CLS <= 0.1; INP <= 200 ms; JavaScript transfer <= 3 MiB |
| workers | heartbeat stale <= 120 s; oldest ready <= 300 s; graceful shutdown <= 10 s |
| uploads | default raw <= 10 MiB; absolute raw <= 25 MiB; encoded envelope <= 35,000,000 bytes |
| realtime/game | message p95 <= 250 ms; target frame 16.7 ms; maximum frame 33.4 ms |
| mobile/offline | mutation attempts <= 8; queue <= 250; media upload concurrency <= 2 |

The deterministic load baseline completed **600 requests** across six scenarios with **0 failures**. Recorded p95 values were: liveness **13.70 ms**, readiness **19.04 ms**, Stripe webhook denial **12.40 ms**, authentication denial **23.74 ms**, launcher **42.08 ms**, and upload denial **89.55 ms**. These local timings demonstrate regression budgets, not production capacity or Internet latency.

## Accessibility, responsive behavior, and visual identity

- Production-artifact accessibility/performance suite: **26/26 representative desktop/mobile module cases passed** across all thirteen modules.
- Automated axe violations: **0** for the tested critical surfaces.
- Horizontal overflow failures: **0**; undersized tested interactive targets: **0**; focusable module navigation and named controls are asserted.
- Keyboard/focus semantics, accessible labels, alert/status announcements, mobile reflow, touch targets, and reduced-motion behavior were repaired across shared Directory, shell chrome, TradeFlowKit, PulseDesk, TechDeck, SnapProofOS, StudyForge, CallCommand, and OutCall surfaces.
- Visual regression: **39/39 module/viewport baselines** (desktop, tablet, mobile) and the four visual-contract checks passed against exact-host production artifacts.

The approval manifest records a **Codex Phase 39 automated review**. It is not a substitute for owner/human visual approval.

## Threat-model coverage

`THREAT-MODEL-REGISTER.md` refreshes the platform model and all thirteen active module models: OperatorOS parent authority; TradeFlowKit; TorqueShed; TechDeck; PulseDesk; FaultlineLab; Ninja Pool Hall; BrandForgeOS; SnapProofOS; StudyForge AI; Ninja Launch Kit; CallCommand AI; Ninjamation; and OutCall. The register explicitly covers runner, AI, telephony, object-storage, public/share-token, webhook, OAuth, realtime/game, cross-module, and provider trust boundaries.

## Verification summary

| Gate | Result |
|---|---|
| frozen dependency install | PASS |
| TypeScript (API, web, runner, native) | PASS |
| ESLint | PASS |
| production build | PASS |
| Phase 39 hardening gate | PASS: 7 script tests + 12 API/preflight tests |
| dependency audit/SBOM/security scan | PASS under exact patched-advisory policy |
| API product/contract suite | 1,124/1,126 passed with 0 skipped on a fresh database; the cold Next.js invite probe was then repaired and passed 33/33 in focused verification; the remaining full-suite failure is the fail-closed TorqueShed source-snapshot provenance check |
| integration suite | PASS, 28/28 on an explicitly disposable test database after clean apply/reapply |
| focused DB/reliability | PASS, 34/34 |
| clean apply/reapply/backup/restore | PASS on disposable PostgreSQL 16 |
| load budgets | PASS, 600/600 with 0 failures |
| accessibility/performance | PASS, 26/26 |
| visual regression/contracts | PASS, 39 comparisons + 4 contract tests |
| compiled production-artifact E2E | PASS, 21/21 from a fresh disposable database in 5.8 minutes |
| repository parity compiler | FAIL: inherited blocked/missing source facets remain |
| `verify:release` | FAIL CLOSED, 9/14 stages passed; parity, unit provenance/generated-evidence, API provenance, and static route-control gates remain non-green in the consolidated run; its first integration attempt also rejected the non-test database name, while the correctly named standalone integration run passed 28/28 |

### Repository-wide release blocker

The current compiler inventory contains **7,396 capabilities**: 3,515 native, 2,432 shared-equivalent, and 1,449 blocked. It reports **2,459 failures**: 1,449 blocked-required records, 84 missing target routes, 925 missing test IDs, and one source-drift record. The source-drift record is caused by the untracked, user-owned TradeFlowKit signing keystore under the pinned source tree; Phase 39 deliberately does not delete or rewrite that artifact. The static route-control gate independently reports **118 findings** (84 non-crawlable routes, 31 static dead-button candidates, two hard-coded feature-count candidates, and one coming-soon completion marker).

The API provenance check also fails closed because `apps/modules/torqueshed/source/SOURCE_SNAPSHOT.json` declares **165 files** while the pinned source tree contains **181**. Git history shows commit `b987d37` introduced 16 duplicate ` (1)` source artifacts without updating the authoritative snapshot. Phase 39 does not silently redefine the source fingerprint or remove recovered source files. Product/API behavior otherwise completed the fresh-database run with 0 skipped tests; the only other failure in that run was a cold-development-server HTTP timeout, which was repaired with bounded startup warming, a 15-second probe timeout, and Windows process-tree shutdown, then passed **33/33** in focused verification.

These repository-wide defects include inherited TradeFlowKit/FaultlineLab blocked-required records, missing BrandForge/TradeFlow target routes, missing CallCommand/Ninja Launch Kit test IDs, and an OutCall blocked capability. Phase 39 does not relabel those records or weaken any compiler, source-fingerprint, or route-control rule to manufacture a green release.

## Production promotion gates

1. Resolve the repository parity failures and rerun `pnpm verify:release` from a clean clone and fresh database at the exact candidate commit.
2. Obtain owner approval or a revised remediation date for `M-39-01`, and perform human visual review of all 39 baselines.
3. Verify production backup/PITR configuration; restore a real reviewed backup into isolated infrastructure; record RPO/RTO, reconciliation, and rollback evidence.
4. Rehearse required-provider, storage, queue, database, worker, and process interruption in the deployment environment; verify alert delivery and administrative recovery views.
5. Run authenticated exact-host acceptance with reviewed tenants, real sandbox providers, release identity, worker state, and monitoring; then merge/promote through the owner-controlled release process.

## Evidence index

- `scripts/phase39/security-scan.mjs`
- `scripts/phase39/generate-sbom.mjs`
- `scripts/phase39/recovery-rehearsal.mjs`
- `scripts/phase39/performance-budget.test.mjs`
- `scripts/phase39/image-size-regression.test.mjs`
- `apps/api/test/phase39-production-hardening.test.ts`
- `apps/api/test/production-env-preflight.test.ts`
- `apps/web/e2e/phase39-accessibility-performance.spec.ts`
- `apps/web/e2e/parity-visual.spec.ts`
- `apps/web/e2e/visual-baselines/`
- `docs/phase-39/OPERATOROS-SBOM.cdx.json`
- `docs/phase-39/THREAT-MODEL-REGISTER.md`
- `docs/phase-39/RBAC-ENTITLEMENT-MATRIX.md`

## Final compiled-browser result

**PASS — 21/21 tests in 5.8 minutes** from a freshly created disposable PostgreSQL 16 database, compiled production web/API artifacts, the exact-host TLS proxy, one browser worker, and the strict disposable-CI deterministic-provider guard. The run includes complete route control, all thirteen module launches, SSO/deep-link/logout isolation, TechDeck, TorqueShed, FaultlineLab, BrandForgeOS, StudyForge, Ninja Launch Kit, CallCommand, SnapProofOS, Ninja Pool Hall, Ninjamation, Twilio public compliance, and Phase 39 accessibility/performance.

## Release statement

Phase 39 is complete as a source/local hardening implementation. OperatorOS is **not** declared production-ready or release-accepted because the full release contract is fail-closed on inherited parity defects and because production provider/restore/monitoring/human gates remain external and unexecuted.
