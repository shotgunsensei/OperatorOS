# Final local AI guidance candidate - 2026-10-07

This continuation corrects the remaining wording and evidence gaps after local
review commit `12d804bbbc29f94a87fad2b845cab985009e0397`. The candidate is the
local commit containing this document on `codex/openai-responses-budget-oct7`.
Its full SHA is captured in the subsequent delivery report and release metadata.
No push, hosted CI, merge, publication, paid API, credential/account setting or
production-data operation is authorized in this continuation.

## Changes and fresh verification before commit

The button says **Generate guidance**, because the generated output still needs
human review. Its busy state, support reference, structured guidance and review
notice remain visible. Browser selectors follow the corrected accessible label.

Existing source compares both `prior.user_id` and `prior.request_hash` before
replay, under the tenant/module policy row lock. New real-route tests demonstrate
that another authorized writer in the same tenant cannot replay completed,
failed, unknown or in-flight requests. Distinct request keys prove that writer's
ordinary access works. Denied replay adds no request, provider call or usage;
successful replay preserves measured usage exactly once. Twelve concurrent
requests under an enabled zero-dollar policy create no reservations, calls or
usage events. Existing unknown-charge/timeout and rollover tests retain full
holds; observed overruns remain accounted and disable further spending.

The selected compatibility/API/browser gate passes **45/45**, zero failures,
cancellations, skips or todos, on the final working source before this commit.
It covers legacy completion selection, Torque Assist credit workflows, TechDeck
literal workflows, actor-bound retry, measured/cache-aware usage, concurrent
budgets, unknown holds and five real Chromium console scenarios.

The runner uses a new disposable loopback PostgreSQL container
`operatoros-ai-final-oct7`, port 55442, with no persistent volume. Child processes
inherit only tool/OS paths plus synthetic secrets and local test configuration;
no provider credentials or spending switches are inherited. Responses transport
is stubbed in focused tests; production browser runs use the existing deterministic
local-only provider mode. Installed dependency/package/lockfile sources match the
candidate base; no parallel checkout/provider source is imported.

## Exact candidate release verification

The complete local run at `325b61088b34fe6e34ca7ab817ab5d675e2e8669`
finished all 14 stages: **12 passed, 2 failed, 0 not run**. Unit tests passed
52/52, API tests 1,623/1,626, integration tests 108/108, exact-host browser tests
32/33 and visual checks 4/4. Build, security and production preflight passed.
Three API failures exposed test fixture issues: two identity fixtures still
expected release 65; the catalog-tier fixture inherited earlier explicit Starter
grants. The latter also fails on the unchanged v65 source with those bindings.
This follow-up updates the identity fixtures to v66 and temporarily normalizes
only the fixture's two plans' live-catalog bindings, restoring original IDs,
values and PostgreSQL timestamps afterward. All 15 affected checks pass with
the conflicting bindings present; full original binding snapshots match.
Runtime entitlement rules and the paid/disabled denial assertions are unchanged.

The remaining exact-host failure is the separate saved-cart checkout scenario:
its generic session helper registers through `127.0.0.1:5001`, and the production
authentication guard correctly returns `403 AUTH_HOST_NOT_ALLOWED`. Do not weaken
that guard or import parallel checkout/provider changes to hide this failure.
The final gate must report the failure if it persists. Prior complete and
interrupted runs are preserved as historical evidence, not final-commit passes.

The prior build/runtime identified `bfd9bf0d` with working-tree review fixes; it
is historical evidence and does not prove exact commit `12d804bb`. After this
commit, run the existing **14-stage** `corepack pnpm verify:release` gate using
`../ai-final-checks.mjs release`. It retains every stage and failure result,
including broad API, apply/reapply, production build, exact-host E2E/visual and
core preflight. At commit time this full gate is **not yet run**; its exact final
passed/failed/not-run results belong to the subsequent delivery report.

After the gate, archive and restore only its own generated tracked SBOM and
CallCommand screenshots if needed,
verify a clean source tree, and build/start the exact candidate. Compare both the
full commit and generated build ID to public health through the Replit supervisor.
Use the task-owned database and synthetic/no-spend configuration. Do not stop
unrelated runtimes to reclaim occupied ports. Preserve failures honestly and do
not waive visual/security/authorization requirements.

The real populated v65-to-v66 upgrade/reapply has already passed on the reviewed
source; repeat against a separate fresh marked database for this final candidate.
Legacy snapshots, absence of positive policy seeds, defaults and constraints
remain required. Do not point these checks at a development/production database.

## Activation and handoff gates

New guidance spending remains disabled by default with no seeded tenant policy.
Before a paid/live check: explicitly approve the provider/project and accessible
model, current dated input/output/cache tariffs, numeric per-call/day/month tenant
limits, and a bounded synthetic request. Application limits cover this TechDeck
flow only; legacy AI/voice is outside them. Unknown charges need reconciliation.
No account-level hard-cap or global spending-cap claim is made.

Push/hosted CI remains gated on the exhausted included Actions minutes and an
enforced zero-dollar setting. Standing publication authority does not authorize
new spending. Production backup/apply/publication and non-admin real customer
acceptance remain unperformed. Keep Replit and current shared authority.
The four inherited patched advisory exceptions remain disclosed and unchanged:
GHSA-5p2g-fcmc-qvqq, GHSA-w3rx-r6r6-pgpr, GHSA-86w9-cpqp-85rv,
GHSA-vfj7-8cjw-p6xm. Require their existing integrity tests and security gate.

The original complete two-commit patch is already saved to Library as
`libfile_c07aed010b848191866e9a3298505a55` (148,806 bytes). Preserve that receipt;
do not duplicate it. The subsequent handoff should include an incremental source
patch from `12d804bb` and put both existing and incremental patches inside the raw
bundle, with exact commit/build identity and checks. Library identities and final
raw evidence are recorded outside Git to avoid a self-referencing commit hash.
