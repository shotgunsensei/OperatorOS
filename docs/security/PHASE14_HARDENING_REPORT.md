# Phase 14 security, privacy, performance, and reliability report

Assessment date: 2026-07-27
Branch: `codex/phase-14-hardening`
Environment: Windows local source/build plus disposable PostgreSQL 16 in
`operatoros-phase11e-db`; no production data or external provider traffic.

## 1. Findings by severity

| Severity | Finding | Disposition |
| --- | --- | --- |
| High | Locked dependency graph contained 17 high advisories, including Next.js SSRF/DoS, Fastify routing DoS, URL parser confusion, PostCSS file disclosure, Sharp/libvips issues, and transitive template/route DoS | Patched Next and constrained vulnerable transitives; final `pnpm audit --audit-level low` reports no known vulnerabilities |
| Medium | API/web responses lacked a uniform framing, MIME, referrer, permissions, and transport header baseline | Fixed globally; runtime `/healthz` confirmed request ID, `nosniff`, `DENY`, `no-referrer`, and permissions policy |
| Medium | PostgreSQL pool had no explicit capacity/connect/idle bounds and was not closed by Fastify shutdown | Added validated bounds, documented env controls, explicit pool, idempotent close, and `onClose` drain |
| Medium | Disabled Stripe webhook returned `200 received`, masking configuration failure | Now returns `503 STRIPE_NOT_CONFIGURED` and emits no false acknowledgement |
| Medium | Concurrent Torque Assist completions could both observe the pre-charge balance when the advisory-lock contract was not reliably serialized by the explicit pooled driver | Final balance checks now serialize on the durable user row; the live two-request race produces one `200`, one `402`, one debit, and no negative balance |
| Medium | SSO console audit lines included the handoff replay identifier, and billing logs included Stripe/user identifiers | Console output now excludes `jti`, Stripe event/subscription IDs, and billing user IDs while durable audit records and request correlation remain available |
| Medium | Module threat-model coverage was incomplete/noncanonical | Added platform plus TradeFlowKit, FaultlineLab, Ninja Launch Kit, CallCommand AI, Ninjamation, and canonical OutCall models; existing seven module models remain authoritative |
| Low | Phase 13 import paths depended on the caller's current working directory | Added workspace-root discovery that works from root, `pnpm --dir apps/api`, source execution, and compiled execution |
| Low | Drizzle's updated error wrapper hid PostgreSQL `23505`, turning a normalized Directory duplicate into `500` | Directory error handling now follows bounded `cause` links and returns the stable `409 DIRECTORY_DUPLICATE` contract |
| Low | Append-only trigger assertions depended on the old Drizzle error surface | Assertions now inspect the database cause while retaining the append-only requirement; SnapProof and Torque ledger rerun 4/4 |
| Informational | Placeholder scan found reserved package READMEs and deliberately planned/disabled UI, but no new primary workflow was accepted as real from a static placeholder | Reserved package boundaries are not runtime routes; planned module UI remains visibly gated |

Tracked-file scanning found only `.env.example` by sensitive-filename policy and
zero high-confidence live-key/private-key signatures. This is not a substitute
for organization-level GitHub secret scanning.

## 2. Fixes and regression tests

- Next.js resolves to patched `15.5.22`; scoped pnpm overrides avoid unrelated
  major upgrades and the final audit is zero known vulnerabilities.
- The shared web header policy denies framing/objects, constrains base URI, and
  sets HSTS, MIME, referrer, and browser capability policy.
- Fastify applies the API header baseline and keeps structured route-template
  completion logs without raw URL/query logging.
- SSO and billing console logs preserve action/request context without replay,
  provider event, subscription, or billing-user identifiers.
- `DATABASE_POOL_MAX` defaults to 10 and is bounded `1..50`;
  idle timeout defaults to 30 seconds; connect timeout defaults to 10 seconds.
  Invalid values fail startup.
- The disabled payment webhook fails closed with a stable error code.
- Phase 14 contract: 7/7 passed.
- Cross-module negative batch on the clean regression database: 61/62 passed
  initially; the one Drizzle wrapper assertion was corrected and the failed
  SnapProof scenario plus related Torque append-only regression passed 4/4.
  All exercised tenant/role scenarios therefore passed after rerun.
- Workspace typecheck passed. Production build passed for API, runner gateway,
  and Next.js 15.5.22. No lint result is claimed because the repository has no
  lint script.
- Final empty-database API aggregate: 852 tests, 846 passed, zero failed, six
  explicitly skipped browser-HTTP checks because that API command does not
  attach a Next server. The production build and prior compiled load run cover
  the built web/runtime boundary separately.
- Core production environment preflight and the read-only 29-step database
  release plan passed with isolated test values.

## 3. Performance and load evidence

Harness: `scripts/phase14-load-baseline.mjs`. It refuses non-loopback targets,
uses no URL credentials, and requires explicit isolated test-user bootstrap or
test credentials for authenticated scenarios.

Run configuration: compiled API artifact, isolated release database, 100
requests per scenario, concurrency 10, p95 gate 750 ms.

| Scenario | Status | p50 | p95 | p99 |
| --- | ---: | ---: | ---: | ---: |
| Liveness | 100 x 200 | 7.39 ms | 16.34 ms | 18.88 ms |
| Readiness/database | 100 x 200 | 7.61 ms | 9.23 ms | 44.92 ms |
| Disabled Stripe signature boundary | 100 x 503 | 7.00 ms | 12.33 ms | 12.61 ms |
| Authenticated session | 100 x 200 | 16.00 ms | 19.22 ms | 24.32 ms |
| Entitled launcher | 100 x 200 | 43.21 ms | 53.88 ms | 54.73 ms |
| Upload authorization/validation boundary | 100 x 403 | 54.88 ms | 67.07 ms | 71.83 ms |

All scenarios had zero transport or unexpected-status failures. This is a
local baseline, not a capacity claim. Successful maximum-size uploads, live
provider callbacks, geographically distributed traffic, and sustained soak
testing remain target-deployment gates.

## 4. Accepted risks

| Risk | Severity | Owner | Mitigation | Deadline |
| --- | --- | --- | --- | --- |
| CSP is deliberately incremental rather than a nonce-based `default-src` policy because current Next output uses framework inline bootstrap code | Medium | Platform security | Frame/object/base restrictions now; design nonce/hash CSP and run browser/provider regression before tightening | Before enabling user-authored HTML or third-party script expansion |
| Deprecated `@esbuild-kit` migration tooling and Recharts 2 remain in the graph, with no known audit vulnerability | Low | Platform engineering | Keep build-only exposure, frozen lock, audit gate; migrate during reviewed toolchain/UI upgrade | 2026 Q4 |
| Windows `process.kill(..., SIGTERM)` terminates the compiled local process with exit code 1, so Linux signal-drain behavior was not re-proven in this Windows run | Low | Release engineering | `app.close()` owns worker/pool drain; repeat SIGTERM/restart recovery under the Linux Replit supervisor | Phase 15 deployment rehearsal |

No critical or high exploitable issue is knowingly accepted.

## 5. Release blockers

- No reviewed cumulative revision is deployed; public 48-check verification,
  exact-host SSO, deep-link/return, refresh, logout, and persistence acceptance
  must run on the deployed commit.
- Live Stripe, Twilio, email, OpenAI, scanner/blob, and module-specific provider
  paths were disabled. Signature/replay and deterministic adapters pass, but
  real-provider acceptance, consent, spend/rate, and alert configuration remain
  required where a module depends on them.
- The local load run did not perform successful large-file storage/scanning or
  a valid Stripe webhook because that would require approved provider/storage
  infrastructure.
- Monitoring alerts described in the SLO runbook are configuration, not source
  code; they must be created and tested in the target environment.

## 6. Backup/restore and Phase 15 readiness

The custom logical archive contained 2,019 TOC lines, was 1,061,361 bytes, and
had SHA-256
`7f9e35dfb6f06c6617cbe6016d14e7486dd92d8b64a2c5c7b373ddd451e0e918`.
Restore into a new isolated database completed successfully. After the
supported 29-step release was applied to both source and restored targets, the
vectors matched exactly:

`228 tables | 712 foreign keys | 0 unvalidated constraints | 7 users | 7 tenants | 8 memberships | 13 modules | 21 tenant modules | 0 tenant entitlements | 0 SSO handoffs | 8 admin audit rows`

The restored compiled API returned `200` for `/healthz` and `/readyz`; database,
auth, SSO sealing, module registry, and shared worker were healthy. External
providers were explicitly disabled.

Phase 14 is a locally hardened Phase 15 candidate, not a production-ready
certification. Phase 15 may begin only as an authorized deployment/acceptance
phase and must preserve every blocker above.
