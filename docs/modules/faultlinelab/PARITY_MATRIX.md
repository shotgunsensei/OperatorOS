# FaultlineLab Phase 25 parity matrix

## Phase 25 executable catalog notice (2026-08-09)

Current release truth is generated in `docs/parity/modules/faultlinelab.json`.
Every playable case reachable from the pinned source `allCases` export is now
mapped to the deterministic compiler, immutable-version initializer, player,
and full-catalog automated iteration. Exact counts come from the compiler
manifest and database, never this Markdown file. See
`docs/phase-25/FAULTLINELAB-FULL-CATALOG-REPORT.md`.

Assessment date: 2026-07-18

## Provenance and audit boundary

The clean read-only checkout at `C:\Dev\Faultline-Lab` and the quarantined
snapshot both resolve to commit
`46877aae35565149ccf4f4988dd94627fc6bb92b`. The snapshot manifest records 610
tracked source files, 451 retained files, and the exclusions applied during
import. No fetch, install, child migration, child server, source write, or
standalone database access was performed.

The source is a browser troubleshooting simulator with standalone and authored
pack cases across Windows/AD, networking, automotive, electronics, servers,
mixed cascades, and healthcare imaging. Every `allCases` entry has a complete
runnable definition; older OperatorOS documentation incorrectly classified
pack entries as metadata-only. A case contains
symptoms, one root cause, evidence, four hint tiers, terminal commands, event
logs, ticket history, remediation, preventative measures, and a 100-point
score definition. The Phase 25 compiler validates or explicitly repairs the
authored definitions and imports all valid output as playable versions.

The product audit covered the frontend domain types, case registry/catalog,
authoring schemas and validation, four composed case definitions, simulation
and scoring engine, daily challenge and Chaos mode, sandbox scenarios,
recommendations, Zustand state, browser persistence, cloud synchronization,
incident board, investigation tools, debrief/profile/daily/sandbox/admin
surfaces, Express routes, Drizzle schemas, OpenAPI contract, and available
tests. The source has no server-owned case-attempt or scoring model. It stores
profiles and arbitrary case-state JSON from the browser, computes scores and
achievements in the client, and permits the client to overwrite the whole
cloud profile. Team case drafts are unversioned JSON rows; the apparent
"promote" action only tells an administrator to make a later code change.

## Capability disposition

| Source capability | Source reality at the pinned commit | OperatorOS Phase 10A disposition | Required evidence |
| --- | --- | --- | --- |
| Standalone Clerk/OperatorOS JWT identities, local users, roles, linked accounts, sessions, and password/account flows | Duplicate authority; legacy SSO places a JWT in a query string and creates a child cookie | Excluded. OperatorOS exact-host SSO, session, tenant, membership, role, and module guards remain the only authority | Existing SSO/RBAC negatives plus module workflow tests |
| Standalone Stripe catalog, subscription, purchase, store, pricing, and product recommendations | Child platform billing and client upsell behavior | Excluded. FaultlineLab remains a free OperatorOS module; no local checkout, entitlement grant, or product-recommendation authority is mounted | Static route/schema scan and commercial-boundary tests |
| Complete `allCases` authored catalog | Static TypeScript definitions composed from standalone cases plus every authored pack | Deterministically compile every reachable definition, repair invalid authored records explicitly, and import by source hash into tenant-scoped published immutable versions | Compiler negative fixtures plus zero-exclusion full-catalog start/action/submit/score/reload test |
| Case authoring | Validated draft form backed by one unversioned JSON row per id | Versioned tenant/personal drafts, immutable version snapshots, validation results, optimistic concurrency, preview, publish, retire, and superseding-version history | Author/admin role, stale-write, immutability, publish and prior-version tests |
| Sandbox authoring and preview | Browser-local custom scenarios converted into runnable cases | Personal draft challenges with server validation and preview sessions; tenant publication requires tenant admin/owner authority | Owner privacy, admin publish, preview isolation and persistence tests |
| Challenge types | Standard case, daily challenge, sandbox preview, optional Chaos mode | Server-owned `standard`, `daily`, `preview`, `assignment`, and deterministic `chaos` sessions bound to one immutable challenge version | Start-mode validation, version pinning and replay tests |
| Investigation sessions | Browser `CaseState` with local timestamps, evidence, hints, commands and completion | Tenant/user-scoped sessions with deterministic states, optimistic version, append-only ordered actions, server timestamps, restart/resume and explicit abandonment | State-machine, conflict, sequence, restart and foreign-user tests |
| Terminal commands | Client matches a command/alias and returns static output | Server matches only commands in the pinned challenge version, returns bounded output, records risky actions, and unlocks only declared evidence | Command/alias/unknown/risky/evidence tests |
| Event logs and ticket history | Client view actions unlock declared evidence | Server validates the selected event/ticket id against the version, records the action, and atomically unlocks declared evidence | Invalid-id, duplicate action and evidence-unlock tests |
| Evidence locker | Client-owned array of unlocked evidence ids | Server-derived evidence projection from append-only session actions; submissions may cite only evidence unlocked in that session | Locked-evidence rejection and cross-session isolation tests |
| Four-tier hints | Client records hint levels and penalties | Server reveals each valid hint once, records its penalty, and enforces Chaos hint blackout | Duplicate/invalid/blackout/penalty tests |
| Hypothesis, diagnosis, findings, remediation and proof | Free-text client submission plus client-selected evidence | Server accepts a bounded hypothesis, canonical root-cause selection, unlocked evidence, remediation, and optional proof note; one final submission per attempt | Validation, tamper, duplicate-submit and audit tests |
| Scoring | Client keyword matching, action/time penalties, multipliers, tiers, and achievements | Deterministic server-only score from the immutable content version and recorded actions. Clients cannot supply score, timing, unlocked evidence, badges, or completion | Known vectors, tampered payload, concurrency and exact-once progression tests |
| Debrief | Client exposes root cause, relevant/misleading evidence, remediation and prevention | Server emits a post-submission debrief with the score breakdown and canonical explanation; answer-bearing fields are absent before completion | Pre/post completion disclosure tests |
| Progress and best scores | Mutable profile JSON supplied by the browser | Server projection from completed attempts, with best score per challenge/version, solved count, totals, streak and earned badge records | Repeat attempt, lower score, failure, streak and restart tests |
| Daily challenge | Client hashes UTC date across accessible cases and mutates a local streak | Server deterministically selects from published tenant challenges and counts at most one daily outcome per user/UTC day | Date/idempotency/streak tests |
| Chaos mode | Client seed, evidence/log shuffle, injected red herrings, timer, hint blackout and multiplier | Server owns seed/settings and presentation order; only declared content is scored. No client-authored evidence or multiplier is trusted | Seed repeatability, timer/hint and score tests |
| Assignments | Not implemented in the source product | Add tenant-admin assignments to member, challenge version, due date and state; attempt completion updates the assignment exactly once | Membership, role, due/status and completion tests |
| Badges/certificates | Seven client-computed achievement labels; no certificates | Persist the approved badge equivalents from server scoring. Do not claim certificates because no issuance, identity proof, curriculum, or revocation model exists | Badge exact-once tests and explicit no-certificate copy |
| Dashboard/profile | Client-local counts, best scores, streaks and recommendations | Real server aggregates for published challenges, active attempts, assigned work, completions, best scores and badges | Empty/populated/restart/tenant tests |
| Reports and analytics | No authoritative server reporting | Tenant-admin aggregate completion/pass/score/hint/time metrics derived from attempts; participant history is user-scoped | Role denial, aggregate correctness and no cross-tenant/user leakage |
| Attachments | Generic public object serving exists; no case-integrated secure workflow | Link only OperatorOS shared private, scanned attachments to authorized challenge drafts or proof notes; no raw/public storage URL | MIME/signature/scan/authorization/link tests |
| Export | Admin copies composed JSON to clipboard | Authenticated versioned challenge JSON and participant attempt-history CSV/JSON exports with tenant/user authorization | Content type, escaping, role and tenant tests |
| Accessibility and deep links | Responsive SPA views and `?case=` links | Keyboard-labelled native UI with loading/empty/error/conflict states and stable `/challenges/:id`, `/sessions/:id`, `/assignments`, `/progress`, and `/authoring` routes | Static UI contracts and browser deep-link acceptance |
| Cloud sync | Whole profile/settings/case-state JSON accepted from the client | Rejected. Canonical state is normalized server data written through narrow guarded transitions | No generic profile/case-state write route |
| PWA, OpenGraph, sitemap and standalone SEO | Standalone deployment concerns | Excluded from the host-routed shared OperatorOS module; shared platform owns public navigation/metadata | Consolidated build and route-map checks |
| Child Express server, Drizzle schema and migrations | Separate incompatible runtime and authority tables | Excluded. Only active Fastify/Next code and the ordered OperatorOS release manifest may execute | Release-contract and source-quarantine tests |

## Source tests and gaps

The source tests focus on SSO, entitlement/store presentation, deep-link
routing, catalog cards, admin users/catalog overrides, account email settings,
and billing support. There is no dedicated automated coverage for the core
simulation score vectors, server attempt integrity, authoring publication,
tenant isolation of product data, concurrency, restart persistence, assignment
completion, or server analytics. Phase 10A therefore requires new OperatorOS
domain, static-contract, database workflow, and browser acceptance coverage
rather than carrying the source test count forward.

## Completion boundary

State 4 requires every approved row above to run from the OperatorOS workload,
the source compiler and content-hash initializer to reconcile deterministically,
and clean isolated-database tests to prove persistence, tenant/user/role
isolation, optimistic concurrency, attempt integrity and server scoring.
State 5 additionally requires the production build and supervisor, health and
readiness, exact-host SSO/deep links/refresh/logout, deployed workflow smoke,
and an authorized data cutover or explicit no-data reconciliation. Until
those gates pass, this matrix must report the highest fully evidenced lower
state rather than infer completion from source code or a rendered UI.
