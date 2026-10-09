# TechDeck budgeted Responses slice - local evidence, 2026-10-07

Follow-up: [local review of bfd9bf0d](LOCAL-REVIEW-2026-10-07.md) adds actual
populated upgrade, legacy compatibility, retry telemetry and visible-error
evidence. The original 21-check results below are the initial implementation
checkpoint; the review has its own 43-check gate and fresh build/security results.

Implementation and local verification are complete. This document accompanies
the local source commit on `codex/openai-responses-budget-oct7`, based on
`5b50b2cadd815ba1c6de1af79deb04e8971af0b4`. No push, hosted CI, merge, publication,
live model acceptance or production migration occurred. Module parity is unchanged.
The [revised stages and cost inventory](OPENAI-FIRST-REVISED-PLAN.md) replace the
plan's assumed architecture and monthly total with verified scope and explicit gates.

## Actual state and preserved work

- Canonical `C:\Dev\OperatorOS` and remote main were clean/current at `5b50b2c`.
  Replit remains the autoscale Next/Fastify/PostgreSQL deployment.
- Read-only `https://operatoros.net/api/health` returned 200 on October 7,
  serving commit `5b50b2ca`, build `224589f065463d1b7a8db358`, build time
  `2026-10-06T19:59:12.950Z`, deployment time `2026-10-06T20:09:22.589Z`,
  lock SHA-256 `52a1d54aeaff9a42b1e832d369b53e3cd9cbee629d184e982c19ce1ea8364981`,
  database 65/65, last step `techdeck_resolution_semantic_tables`. Public
  `/api/readyz` returned 404; it is not used as current readiness evidence.
  Historical October 6 customer/CI evidence does not become current acceptance.
- Landing integration `5aedd03da26f54fe4bf54dcce698ee04eb7d21b5` remains on
  `codex/flagship-landings-current-main` in the October 5 worktree. Its existing
  `docs/phase-39/OPERATOROS-SBOM.cdx.json` modification was found and preserved.
  It was neither copied into this branch nor dropped, pushed or published.
- Initial process inventory found no leftover OperatorOS/test processes to stop.
  Only this task's runtime children and disposable PostgreSQL container are
  stopped during cleanup. Other branches, worktrees and services are preserved.
- Codex usage read showed 1% weekly consumed and no credits. No quota execution
  blocker was observed; no credit purchase, reset or model change occurred.

## Customer outcome and server boundaries

The existing TechDeck compliance/IT guidance form now displays structured checks
requiring operator review. Its existing authenticated module-write route remains
`/v1/modules/techdeck/itops/query`; the customer web transport uses
`/api/modules/techdeck/itops/query`. The server revalidates requested tenant
selection, membership, entitlement and module write access before any dispatch.
Browser input contains only `query` and an `Idempotency-Key`; it cannot select
tenant, model, rates, budget or tools. Tenant switches hide previous guidance and
ignore late responses from the previous view.

`OpenAiResponsesProvider` implements the existing `AiProvider` interface. It uses
`store:false`, the explicitly approved model and Standard `service_tier:default`,
strict structured text, no tools, no automatic retries and no fallback. Actual
returned model and tier must match the tariff; aliases resolving to an unexpected
model fail closed. No assistant subscription/OAuth credentials are used.
Provider output is validated before rendering; execution/review flags are fixed.
Neither scripts nor customer-device actions run. ADR-0014 remains in force.

The release manifest appends `shared_ai_budget_tables` as step 66. The first 65
steps are integrity-tested unchanged. Two additive tables retain tenant/module
policies and durable requests. Migration seeds no spending policy. Policies
default disabled with zero per-call, UTC-day and UTC-month micro-USD ceilings.
Server configuration additionally requires explicit enablement, provider/model,
existing authorized API credentials and exact dated USD rates no older than
30 days. Production-artifact deterministic mode refuses this spending path.

A policy row lock serializes reservations across autoscale instances before
provider dispatch. Requests reserve conservative input/output envelopes, snapshot
the approved tariff and settle measured ordinary/cache-read/cache-write/output
usage using integer arithmetic, rounded upward to a micro-USD. Output counts
already include reasoning. Known failed/refused output still records measured
cost; missing or ambiguous usage retains the full hold indefinitely, including
after month rollover. Replays of completed requests return the persisted response
without a second call. Uncertain requests do not automatically retry. Observed
cost overruns are fully recorded and disable further spending for that policy.
Settlement and usage/activity telemetry are atomic and tenant scoped; failed
settlement leaves the durable reservation. Prompts are hashed, not stored in the
ledger; validated output is stored for tenant-scoped replay. Logs contain bounded
codes and references, not provider error payloads.

These budgets cover this TechDeck workflow only. Legacy Chat Completions,
`agent.ts`, script generation and voice paths are not newly capped. Existing
Torque Assist credit reservations and billing authority are preserved. This is
neither a global OpenAI-account cap nor a clinical/regulated-data readiness claim.

## Verification commands and results

All fixtures use synthetic identities, prompts, keys and rates. Model transport
is replaced with deterministic responses; no billed API call, OAuth, outbound
email/SMS, Stripe transaction or client/employer data was used. Database tests
validate a marked loopback disposable PostgreSQL URL before accessing data.

From the isolated worktree, the final focused command was:

```powershell
$env:APP_ENV='test'; $env:NODE_ENV='test'
$env:DATABASE_URL='postgresql://postgres:synthetic_local_test_only@127.0.0.1:55439/operatoros_ai_oct7_test'
$env:PARITY_DATABASE_IS_DISPOSABLE='1'
corepack pnpm --dir apps/api exec tsx --test --test-concurrency=1 test/openai-responses-budget.test.ts test/ai-provider-configuration.test.ts test/database-release-contract.test.ts test/techdeck-ai-budget.integration.test.ts test/techdeck-ai-guidance.browser.mts
```

Result: **21 passed; 0 failed, cancelled, skipped or todo**. Coverage includes
measured pricing/cache categories, stale/mismatched tariffs, disabled defaults,
provider isolation, actual request shape, refusal/schema validation, server
denials, persistence/replays, concurrent budget reservations, rollover holds,
unknown usage/transport ambiguity and overrun closure. Three real Chromium
checks bundle the actual console and call the actual Fastify/PostgreSQL route:
desktop 1280x900, mobile 390x844 and an in-flight tenant switch. Surrounding
workspace/auth transport is fixture supplied. This is not full Next/SSO or
deployed customer acceptance. Screenshots: `build/ai/guidance-desktop.png` and
`build/ai/guidance-mobile.png`; the mobile rendering was visually inspected.

Additional final results:

| Command | Result |
| --- | --- |
| `node --test scripts/ai-offline-environment.test.mjs` | 1/1; strips spending configuration without mutating the caller environment |
| `node --test scripts/parity/quality-gates.test.mjs` | 20/20; existing database/browser isolation gates |
| `corepack pnpm --dir apps/api exec tsx --test --test-concurrency=1 test/provider-isolation-production-artifact.test.ts test/production-env-preflight.test.ts` | 13/13 with `APP_ENV=NODE_ENV=test` and a synthetic `SESSION_SECRET` |
| `node --test scripts/phase39/security-scan.test.mjs scripts/phase39/image-size-regression.test.mjs scripts/phase39/launch-dependency-regression.test.mjs` | 12/12; unchanged patched dependencies and exception integrity |
| `node scripts/phase39/security-scan.mjs` | 0 findings; 1,278 dependencies; 4 disclosed high exceptions; 0 critical or unresolved; exception integrity and deployment scope pass |
| `corepack pnpm build:production` | Exit 0; all four workspace typechecks, SDK/API/runner/Next builds, deployment scope, TechDeck generated contracts and four Faultline catalog tests pass |
| `corepack pnpm lint` | Exit 0; current root script/config used, despite the older AGENTS note saying no lint script exists |
| `corepack pnpm db:apply` twice, then `corepack pnpm db:verify` | Clean disposable database, additive/idempotent release v66/66 verified |
| `node ..\ai-runtime-smoke.mjs` | Actual compiled Replit supervisor, disposable v66 DB, readiness 200/true, public health 200, homepage 200, unauthenticated guidance 401; providers off |

Migration rehearsal uses separate `operatoros_ai_release_test` on the same
loopback container, synthetic session secret and bootstrap email, and
`OPERATOROS_DATABASE_RELEASE_MODE=apply` only for the two apply calls. It is
unset for verification and supervisor boot. No positive AI policy was seeded.
The smoke wrapper lives in the task directory outside the repository and builds
a minimal synthetic environment; it inherits no provider credentials. Runtime
uses the final local source artifacts with pre-commit base metadata, not a
published exact-commit candidate.

Dependencies were reused through ignored junctions to installed canonical
`node_modules`; no fresh frozen install, purchase or lockfile change occurred.
The shell lacks a bare `pnpm` executable. A workspace-only `local-tools/pnpm.cmd`
shim calls existing Corepack, with PATH prepended for build scripts. Final build
uses `CI=true`, `INTERNAL_API_URL=http://127.0.0.1:5001` and
`NEXT_TELEMETRY_DISABLED=1`.

Original failures were corrected without relaxing assertions or skipping cases:
missing fresh-fixture TechDeck registration; expected foreign-tenant 403 corrected
to the existing 404 non-enumeration contract; one nonexistent test-file command;
provider-isolation invocation missing synthetic session secret; build scripts
missing bare pnpm; smoke fixture using internal `/v1` instead of public `/api`.
All final commands above pass. Full 14-stage release, full API suite, hosted CI,
live model and target customer acceptance were not run or claimed.

The unchanged security exception set remains disclosed:
`GHSA-5p2g-fcmc-qvqq`, `GHSA-w3rx-r6r6-pgpr`, `GHSA-86w9-cpqp-85rv`,
`GHSA-vfj7-8cjw-p6xm`. No new exception or security-policy weakening was added.
Scanner artifact: `build/phase39/security-scan.json`.

## Release and spend gates

1. Before any push/hosted CI: John must confirm the GitHub Actions enforced $0
   spending ceiling and an approved validation route while included minutes are
   exhausted (delegated account evidence: 2,000/2,000). No spend-cap verification
   or quota reset is inferred from a git push or a local green run.
2. Before live AI enablement: approve the exact project/model with actual access,
   Standard input/cache-read/cache-write/output rates and effective date; choose
   numeric per-call/day/month USD budgets for an identified tenant/module and a
   bounded synthetic live acceptance call. Existing subscriptions do not grant
   API/OAuth authority. App reservations supplement provider project limits.
3. Before migration/publication: integrate the preserved landing branch in the
   chosen order, rebuild/test the resulting exact commit, satisfy release CI,
   follow backup/restore instructions, then apply approved v66 and publish through
   Replit. Keep spending disabled and policies absent until the separate live
   approval. Verify serving identity and a non-admin customer journey afterward.

No budget administration or reconciliation UI ships in this bounded slice.
Unknown reservations require an approved support reconciliation procedure using
provider evidence before release; automatic expiration would falsely free money.
Rates need periodic review. Input-envelope reservation is conservative, not a
provider billing guarantee; measured overrun handling remains necessary.

Rollback first disables `OPERATOROS_AI_SPEND_ENABLED` and policy spending. The
schema is additive: retain ledger/holds and do not delete uncertain charges.
Before reverting application code, assess the previous legacy guidance route's
provider behavior; do not accidentally re-enable uncapped calls. Use the existing
restore-to-new-database/switch-traffic procedure for database rollback, only with
approval and a verified backup. No destructive rollback was performed here.
