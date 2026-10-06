# OperatorOS publication continuation - 2026-10-06

## Current scope and authorization

The owner explicitly authorized finalization through publication. The release
branch is pushed and [PR #115](https://github.com/shotgunsensei/OperatorOS/pull/115)
is attached to the task. Stripe configuration and the three production credit
catalog mappings from the [configuration record](ECOSYSTEM_STRIPE_CONFIGURATION_2026-10-06.md)
remain intact. No charge, subscription, entitlement grant, outbound message,
phone purchase or production schema change has been performed.

Publication remains pending a fresh exact-commit release gate. The serving
release is still `62fb640c64bd5477a8e5752301c17cb108ab6d2e`, database v65/65.
Replit is staged on the reviewed branch with the original seven Stripe bindings
preserved byte-for-byte. Its previous `main` publication commit, configuration
backup and a named Git stash remain recoverable. An empty October 3 Git lock
with no owning Git process was moved to a recovery file before checkout.
Production startup remains verification-only; development database copying is
disabled. No database apply or migration is needed for this release.

## First fresh CI result and remediation

Exact branch commit `b03b553848c2834f3bf9726b579aa20ffb1dd2c2` completed
[release run 37496744813](https://github.com/shotgunsensei/OperatorOS/actions/runs/37496744813)
with **13/14 scopes passed**, failing only `phase39-production-hardening`.
[PR release run 37496745667](https://github.com/shotgunsensei/OperatorOS/actions/runs/37496745667)
failed the same scope. Both runs retained their failures. The fresh registry
audit had six unresolved high/critical advisories, including three critical
findings; these were not present in the previous local audit. The branch run
passed API tests, integration apply/reapply, production build, typecheck, lint,
32 compiled exact-host browser tests and four visual tests. Semantic vector
checks and native contract/Android/iOS simulator checks also passed. This is
evidence for that earlier commit, not a green gate for the updated candidate.

Upstream fixed packages replace the affected versions. The two new moderate
advisories are also resolved. No audit exception was added or weakened.

| Package | Resolved version | Primary advisory |
| --- | --- | --- |
| source-map-js | 1.2.2 | [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) |
| proxy-addr under Express | 2.0.8 | [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) |
| compression | 1.8.2 | [GHSA-vc2v-76pw-4v95](https://github.com/advisories/GHSA-vc2v-76pw-4v95) |
| Capacitor Android and core | 8.5.2; declared minimum 8.5.1 | [GHSA-rvm3-566m-v7fv](https://github.com/advisories/GHSA-rvm3-566m-v7fv) |
| sharp | 0.35.5 | [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) |
| shell-quote | 1.11.0 | [GHSA-pqg4-j6r4-53mv](https://github.com/advisories/GHSA-pqg4-j6r4-53mv) |
| postcss-selector-parser | 7.1.6 | [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) |
| fast-copy | 4.1.0 | [GHSA-jggr-w7fw-pc2j](https://github.com/advisories/GHSA-jggr-w7fw-pc2j) |

Installed-package regressions reject unsafe IPv4-mapped proxy trust, shell
line terminators after comment tokens and unbounded indexed source-map
offsets, preserve Tailwind selector semantics, and retain the prior braces and
RSA DigestInfo protections. Torque Assist's credits subtitle now describes
available credits without labeling live purchases as test credits.

## Fresh local evidence

Windows PowerShell, Node v24.16.0, pinned Corepack pnpm 10.34.5. Local tests use
`APP_ENV=test`, `NODE_ENV=test` and, where a database variable is needed, a
non-routable `127.0.0.1:1` URL. The focused API checks are static/mocked and
perform no database operations. Full database and browser gates run separately
in CI with its disposable PostgreSQL service and synthetic provider secrets.

| Command | Result |
| --- | --- |
| `corepack pnpm install --frozen-lockfile` | PASS after reviewed lock refresh |
| `corepack pnpm audit --json` | PASS; 1,278 dependency instances, zero unresolved advisories at all severities; four previously patched high exceptions disclosed, zero critical |
| `node scripts/phase39/security-scan.mjs` | PASS; complete dependency report, exception integrity true, secret/SAST/deployment checks pass |
| `node --test scripts/phase39/launch-dependency-regression.test.mjs` | PASS 6/6; zero fail/cancel/skip/todo; 562.1458 ms |
| `node --test scripts/phase39/*.test.mjs` | PASS 21/21, including those six regressions; zero fail/cancel/skip/todo; 1,644.8594 ms |
| `corepack pnpm --dir apps/api exec tsx --test --test-concurrency=1 test/phase39-production-hardening.test.ts test/production-env-preflight.test.ts` | PASS 16/16; zero fail/cancel/skip/todo; 13,522.4668 ms |
| `corepack pnpm typecheck` | PASS all four projects |
| `corepack pnpm lint` | PASS the repository-defined ESLint command, zero warnings |
| `corepack pnpm build:production` | PASS API, runner and Next production artifacts; `INTERNAL_API_URL=http://localhost:5001` |
| `node scripts/phase39/generate-sbom.mjs` | PASS; 1,238 unique components; lock fingerprint refreshed |
| `git diff --check` | PASS |

The frozen install still reports existing native peer warnings; it succeeds.
New exact-commit CI, publication and
target runtime verification must be added below when they actually finish.
Local logs are retained under ignored `build/launch/`; the first CI gate
artifact is `build/launch/ci-b03b5538/parity/release-gate-results.json`.

## Second CI result and release-fixture correction

Exact head `854ded68bb4ebb6b1afcbe5fc6b98f0d2232542c` runs
`37501183415` (dispatch) and `37501185090` (PR) both complete **13/14**.
Dependency hardening now passes. The only failed scope is API: **1,604/1,605**,
with zero canceled/skipped/todo. The Replit npm-versus-pnpm override contract
still expected the former floating sharp range `>=0.35.4`; the reviewed
security change correctly pins sharp to `0.35.5`. Its assertion is updated to
that exact reviewed pin, preserving every other package-manager assertion.
No runtime code, dependency resolution, budget, waiver or skip changes in this
correction. Fresh exact-commit CI is required for the corrected fixture.

The PR browser run passes **32/32** cleanly and visual **4/4**. Dispatch passes
31 browser cases cleanly plus one accessibility/performance case on the
configured retry, and visual **4/4**. Its first PulseDesk mobile CLS is
`0.3369334782375819`; this failed measurement remains recorded, not erased or
counted as a clean first pass. A separate local compiled-runtime reproduction
on a newly created disposable PostgreSQL 16 database passes **1/1** on its
first attempt (57.9 s), covering all **26** desktop/mobile samples with zero
reported failures. PulseDesk CLS is `0.028668402777777775` desktop and
`0.09219296684537806` mobile. Budgets remain unchanged. This intermittent
measurement is a remaining performance risk, not paid-tenant/provider proof.
The local runtime and disposable container have been stopped.

The same pinned frozen install/production build completes on Replit with exit
0. Replit remains on the exact tested source, with only the two reviewed live
mode/release-pin configuration lines beyond the checked-in file. Nothing has
been published. The corrected release-identity, production-env and Phase 39
static/mocked API contracts pass **22/22**, zero fail/cancel/skip/todo,
1,952.5878 ms, against a non-routable DB URL. Logs and both failed CI gate
artifacts remain under `build/launch/ci-854ded68-*`; local reproduction is
`build/launch/cls-isolated-accessibility-performance-854ded68.json`.

## Live activation and acceptance boundaries

Replit now stages live Torque Assist purchase mode and an exact release pin.
The purchase switch remains closed until the corrected release passes CI and
all configuration/catalog/database/return-route prerequisites are satisfied.
The final pin must match the actual published build, not the superseded staged
commit. The restricted Stripe portal and canonical signed webhook are already
validated; runtime readback and hosted checkout remain pending publication.

The authenticated target reached TorqueShed's real organization, diagnostic and
credits routes, showing $5/25,000, $15/100,000 and $50/500,000 packs with zero
available credits and purchases disabled on the older serving release. The
editor presence audit confirms existing Twilio account credentials, source
number and Verify service without exposing their values. OpenAI project ID,
webhook secret, CallCommand SIP route secret and Realtime model are absent from
that inspected environment. Their independent target/provider acceptance is
still required. OutCall remains coming soon; its verified-self calling and
commercial launch gates have not passed.

A specific $5 purchase/refund authorization was requested separately because
an actual charge needs an exact item and spending limit. Until supplied, only
checkout creation and non-charge verification are authorized. New-tenant
non-admin acceptance, authoritative paid settlement, refund reconciliation and
controlled voice acceptance remain distinct from an administrator launch,
provider catalog validation or green CI. Never grant credits or access from a
pending checkout to satisfy these checks.
