# Executable phase prompts

These prompts turn the review into bounded implementation work. They do not authorize production writes, paid provider actions, publishing, push, merge or deployment. Run a phase against current source, reproduce the listed issue first and update its disposition with fresh evidence. Each block is intended to be usable as a task prompt by itself because it explicitly requires the common contract below.

## Common contract — every phase must read this section

Work in `C:\Dev\OperatorOS`, the canonical deployment repository. Read `AGENTS.md`, `PLANS.md`, `docs/auth/OPERATOROS_SSO_CONTRACT_V1.md`, `docs/OPERATOROS_ECOSYSTEM_INTEGRATION_CONTRACT.md`, `docs/MODULE_CONSOLIDATION_STATUS.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/modules/MODULE_PARITY_INDEX.md`, `docs/FINAL_E2E_ACCEPTANCE_REPORT.md`, `docs/CROSS_MODULE_READINESS_REPORT.md`, `docs/DATABASE_BACKUP_RESTORE.md` and relevant ADRs before changing shared/module code. Read the relevant finding in this review. Inspect branch, status and recent history; preserve unrelated changes and use a scoped `codex/` branch. The review baseline was `fe7f1711428e10daefc9b56d15b8e6a73289dadc`; do not assume it is still HEAD or production.

OperatorOS remains the sole authority for identity, credentials, sessions, tenants, memberships, roles, subscriptions, entitlements, billing, registry, launch policy and platform audit. Preserve exact-host SSO, single-use opaque exchange, PKCE/state/nonce and relative return paths. Preserve host-only Secure/HttpOnly/SameSite=Lax sessions. No module-local login, bearer in localStorage or URL, parent-domain cookie, weakened viewer restrictions or client-supplied tenant authority. Existing non-credential UI drafts are not bearer storage; scope/expire them deliberately.

Every read/write, uniqueness rule, transaction and audit operation uses trusted tenant identity. Verify both normal and foreign-resource behavior. Keep platform billing separate from module business payments. No mocked counters, nonfunctional buttons or source-only checks presented as customer acceptance. Read imported `apps/modules/<slug>/source` only as migration evidence; never run its servers, install it or apply its migrations.

Use isolated disposable PostgreSQL and synthetic identities/data for all tests. Strip provider secrets from local test environments. Schema changes use only the ordered idempotent release manifest, include constraints/indexes/audit/transaction/rollback notes and clean apply/reapply tests. `db:plan` is read-only; a production migration requires the applicable approval and backup. Do not run child schema-push tooling.

Start with a failing behavior test that demonstrates the listed defect, then the minimum coherent fix, focused checks and the broadest relevant gate. Run current repository commands rather than inventing script names. The reviewed package has `lint`; verify that before using it. For release work run typecheck, production build and required API/integration/browser checks through the readiness-gated supervisor. Do not turn failures into skips. Never count deterministic provider doubles as live acceptance, nor a file hash as semantic parity.

Deliver: what changed and why; exact source SHA/dirty state, command, environment, fixture class, test counts and artifacts; before/after screenshots for visible work; remaining blockers; rollback notes; updated `docs/IMPLEMENTATION_STATUS.md`, relevant parity row and this review's finding disposition. A commit is allowed only when documentation and fresh evidence agree. Push and deployment are separate human gates. Do all authorized local work before requesting a concrete final external approval. Do not send customer messages or trigger paid/provider actions from these prompts alone.

## Execution order

1. P00 establishes the candidate. P01–P13 repair correctness and finishing defects. P18 is an independent required security gate when the managed environment is available.
2. P14–P17 are targeted module-quality increments; choose their smallest valuable scope after blocking repairs. P27 applies the final visual/accessibility standard after the flows work.
3. P19–P22 produce provider, browser, native and operational acceptance. Keep OutCall disabled until its own entire chain passes and activation is separately authorized.
4. P24–P26 are optional differentiators. P23 is maintenance that should avoid destabilizing the release. Do not add all enhancements merely because they are listed.

The numbering identifies prompts, not a claim that phases are already complete. No schedule or effort estimate should substitute for the acceptance criteria.

## P00 — Pin the release candidate and make evidence auditable

```text
Read and follow the Common contract in docs/reviews/2026-09-12/ecosystem/PHASE_PROMPTS.md. Execute P00 for findings F30 and F34.

Establish the exact source/build/schema/environment that this release will certify. Inspect the current branch and remote history, current readiness metadata using read-only access, .replit, scripts/start-unified-runtime.mjs, database-release-contract.ts and the authoritative release reports. Reconcile historical v60/v61 and local/synthetic/deployed labels without rewriting historical results. Fix stale current-facing references, including promoted Pool Hall engine documentation if it still says the active online implementation is disabled.

Create one candidate acceptance ledger listing all 13 module IDs, their intended release status, shared services, TorqueShed native, the disabled runner and quarantined source evidence. Record every mandatory gate as pass/fail/not-run/blocked with exact commit and artifact identity. Include the dedicated OutCall source gate; ensure a green root unit/parity run cannot hide it.

Reproduce the latest inventory and relevant read-only/static contracts. Repair the superseded customer-experience copy assertion identified by F34 using a meaningful rendered first-action/trust-boundary check; rerun all six represented journeys and the full API gate. Do not enable OutCall or infer release approval from readiness=true. Finish with a concrete candidate checklist, fixture plan, role/tenant matrix, release-owner decision list and a mapping from every F01–F34 issue to its repair or explicit gate. This phase changes documentation/gate wiring and affected acceptance tests only where needed; it does not publish.
```

## P01 — Make TradeFlowKit payment intent and audit amounts exact

```text
Read the Common contract in docs/reviews/2026-09-12/ecosystem/PHASE_PROMPTS.md and findings F01–F02. Repair the single-invoice record-payment journey.

Trace TradeFlowKitRevenueFlow.tsx through apps/web/src/lib/auth.ts to the invoices/:id/pay handler in module-shell-routes.ts and its payment/audit transaction. Reproduce Cancel invoking the payment mutation. Replace the ambiguous optional-reference prompt with a clear accessible confirmation that shows the exact invoice and outstanding amount, or otherwise separate null cancellation from a confirmed blank value. Keep focus, busy state and error recovery usable; a cancelled dialog must issue zero requests.

Compute the remaining payment once inside the locked/version-checked transaction and use that amount in the payment row and audit. Preserve prior partial payments and linked-job behavior without silently changing business rules.

Add component/browser tests for Cancel, Escape, confirmed blank reference, double click, denied viewer and failed request. Add disposable-database tests for a 10,000-cent invoice with 4,000 cents outstanding, stale version, concurrent payment and already-paid state. Inspect persisted ledger/audit values after restart. Do not send invoices, process live money or rewrite historical records. Deliver focused evidence and the relevant broad revenue/API gate.
```

## P02 — Preserve native offline work and recover failed actions

```text
Read the Common contract in docs/reviews/2026-09-12/ecosystem/PHASE_PROMPTS.md and F03–F04. Repair TorqueShed native queue and settings failure recovery.

Inspect queue-domain.ts, offline-queue.ts, scoped-queue-coordinator.ts, API/resource hooks, sync UI and settings.tsx. A permanent error must stop automatic retry while retaining the mutation body and durable file in a tenant/user-scoped failed-work collection. Design explicit failed/retry/re-authentication/conflict states, with inspect/edit/retry when valid and deliberate discard. Delete durable files only after acknowledged success or deliberate discard. Existing tests that expect silent permanent-error removal must be replaced by behavior tests for retained work.

Use bounded requests and finally-based busy recovery. Preserve the central native-session contract on offline logout and tenant changes. Do not replay denied writes to work around authorization.

Test enqueue during flush, partial success, 401/403/409/422/429/500, lost response, confirmed duplicate, app restart and user/tenant switch. Verify saved bytes remain after a rejected upload and disappear only at the correct terminal decision. Complete unit/type/config checks locally and specify real-device acceptance for P21. No native publication is authorized.
```

## P03 — Complete TorqueShed exports, preferences and record switching

```text
Read the Common contract in docs/reviews/2026-09-12/ecosystem/PHASE_PROMPTS.md and F06–F08. Finish the web garage's existing promises before adding features.

In TorqueShedRestorationPanels.tsx and torqueshed-web-api-routes.ts, bind the discoverable checkbox to profileDiscoverable explicitly. Prove false stays false when saving units or another preference. Make form reload/reset behavior intentional for every setting.

Finish Portable history: stable export intent, pending/failed/ready states, bounded completion refresh, authorized artifact download and reachable history beyond eight rows. Use the existing attachment system. Parse downloaded JSON/CSV and compare its meaningful contents with persisted synthetic garage records. Handle request and download errors visibly.

Reproduce journal selection races with delayed A/B responses. Bind loads and mutations to the correct vehicle/build/diagnostic; ignore stale responses. Inspect related report/live-bay switches for the same pattern and fix only evidenced cases.

Verify direct routes, reload, role restrictions, two tenants, export after restart, more than eight exports, false preferences and rapid record switching. Preserve sharing consent and revocation. Include phone screenshots and keyboard operation; do not claim real native/provider acceptance from these web tests.
```

## P04 — Make TechDeck's queue complete at realistic scale

```text
Read the Common contract in docs/reviews/2026-09-12/ecosystem/PHASE_PROMPTS.md and F09. Repair TechDeckTicketQueue.tsx and the canonical ticket-list contract.

Connect search/status/priority/assignment filters to server filtering before pagination. Provide stable ordering, bounded pages/cursors and truthful collection totals. Use existing query capabilities where available; add an indexed tenant-scoped query only if required. Preserve selection and deep links independently of the loaded page. Separate page counts from all-queue counts and label them honestly.

Seed at least 250 synthetic tickets with an old unresolved critical item outside the latest 100, tied update times and tickets in another tenant. Search must find the old authorized item and never the foreign one. Test filter reset, rapid typing, stale responses, page transitions, a ticket moving between pages, saved route reload and viewer use. Avoid a global 1,000-row response as a shortcut.

Keep the existing workday brief and guided journey. Demonstrate triage, assignment, status change and reopening the exact ticket. Document any query indexes and measured query behavior; do not invent remote execution or new service-level promises.
```

## P05 — Make PulseDesk request search and saved views usable

```text
Read the Common contract in docs/reviews/2026-09-12/ecosystem/PHASE_PROMPTS.md and F10–F12. Repair PulseDeskServiceDeskWorkspace.tsx and associated list/saved-view contracts.

Add bounded pagination with correct total and stable ordering. Make saved views apply their stored filters and sorting, show the active view and support existing ownership/sharing rules. Preserve selected request details when appropriate and clearly scope bulk actions.

Keep search controls mounted while requests run, debounce text input, avoid refetching configuration and directories on every character, and ignore stale results. Use per-section loading/error states with actionable retry. Preserve the existing operations-only privacy acknowledgment and equipment deep links.

Verify 0/1/100/101/250 requests, an older bookmarked request, typing a full phrase without losing focus, reverse response order, a failed lookup, private/shared saved views and browser reload. Check viewer and wrong-tenant behavior in disposable PostgreSQL and the browser. Include independent failures for assignees, attachments and configuration; no failed request should be described as no available data. This phase must not add clinical records or patient data fields.
```

## P06 — Make SnapProof team and evidence outcomes dependable

```text
Read the Common contract in docs/reviews/2026-09-12/ecosystem/PHASE_PROMPTS.md and F05. Fix SnapProofFieldWorkspace.tsx so Team loads its own authorized roster on a cold route, not only after Jobs happened to load it. Add loading/empty/error/retry states and guard stale tenant/route responses.

Then verify the existing core evidence journey with synthetic records: customer → assigned job → photo/note capture → findings/costs → reviewed report → real generated artifact → controlled share → revoke → reopen. Verify offline capture recovery using the existing mechanism, denied/read-only writes, rejected upload, oversized/unsupported file feedback and retained local work after transient failure. Do not silently auto-approve a report.

Include tests for direct /team entry and refresh with populated, empty and denied rosters, plus tenant switch. Test report export/download content and share revocation; a shell screenshot is insufficient. Preserve the exact originating TradeFlowKit/TorqueShed linkage where present. Record remaining completeness-checklist or client-package enhancements separately for P26 rather than expanding this bug fix into a new product.
```

## P07 — Repair StudyForge session completion and keyboard learning

```text
Read the Common contract in docs/reviews/2026-09-12/ecosystem/PHASE_PROMPTS.md and F13–F14. Repair Flashcards in StudyForgeCompleteWorkspace.tsx and verify studyforge-phase33-routes.ts invariants.

Implement explicit idle/active/completed session behavior. After Finish session, show its recorded result and allow a deliberate new session; never send another card rating to the completed ID. Count active study duration from the intended start event and reset it for each session. Preserve idempotent completion and activity accounting across retry/reload.

Scope flashcard shortcuts so Space, arrows and rating keys do not override buttons, selects, links or editable fields. Give previous/next controls meaningful accessible names, appropriate disabled states and focus behavior.

Test rate → finish → rate/new session, repeated finish, failed completion, long idle before starting, set changes, read-only access and restart. Keyboard-test every interactive control and verify persisted session/card/activity rows. Keep generated study content editable and source-grounded; do not label a learner competent from a single score or account-wide average. Record library deep-link and targeted-review enhancements under P26.
```

## P08 — Distinguish unavailable FaultlineLab evidence from no evidence

```text
Read the Common contract in docs/reviews/2026-09-12/ecosystem/PHASE_PROMPTS.md and F15. Replace silent attachment/analytics fallbacks in FaultlineLabWorkspace.tsx with explicit per-section states and retry.

Keep successfully loaded sections usable. Preserve prior evidence as visibly stale when appropriate; do not show an empty collection for a request that failed. Review the authoring, learner session, result and evidence screens for this exact distinction. Prevent publishing or consequential review actions from relying on an unverified evidence state where the existing contract requires evidence.

Test authoring and session attachment failures independently, recovery after retry, a genuinely empty collection, a deleted attachment and permission changes. Complete a real disposable challenge lifecycle: draft → trainer review revision → publish → assignment → learner investigation → scored run → evidence/result review. Imported training drafts must remain unpublished until a reviewed revision satisfies the current contract.

Run the deterministic source-catalog checks and relevant database/browser gates. Do not change scoring merely to make a screenshot attractive. Put optional targeted remedial practice and trainer coaching in P26 with honest learning claims.
```

## P09 — Make CallCommand records, metrics and setup claims exact

```text
Read the Common contract in docs/reviews/2026-09-12/ecosystem/PHASE_PROMPTS.md and F16–F17/F33. Preserve the existing v61 guided setup; it is already implemented.

In CallCommandCommercialWorkspace.tsx, resolve a requested call independently of the latest-100 workspace list. Return that exact authorized general-product call or a clear unavailable result; never substitute the first call. Preserve lane/tenant checks and loading cancellation. Add server-owned product-scoped reporting totals with an explicit timezone/window instead of counting a UTC slice of 100 records.

Update CallCommandSetup.tsx copy so saved setup, connected number, enabled answering and a verified completed first call are distinct states. Remove unconditional availability language. Keep the final real-call confirmation and provider-attention recovery.

Test old/deleted/wrong-lane deep links, back/forward, more than 100 calls, midnight/DST boundaries and partial commercial-workspace failure. Regress saved setup return, included versus paid number selection, signed payment quantity, repair/release state and duplicate callbacks with doubles. Do not buy a number, trigger a paid checkout or place a live call. Produce a concrete provider acceptance checklist for P19.
```

## P10 — Repair OutCall's gate and align public availability

```text
Read the Common contract in docs/reviews/2026-09-12/ecosystem/PHASE_PROMPTS.md and F18/F23/F35. Keep OutCall coming_soon, planned and deployment-disabled throughout this phase.

Reproduce scripts/phase37-outcall-source-gate.mjs and scripts/phase37/outcall-source-gate.test.mjs failures. Replace the brittle marketing-sentence match with a semantic assertion that marketing availability derives from the canonical catalog. Test each real activation boundary independently, including existing database row relock and production verification. Add negative cases showing that a harmless description change passes but an enabled registry/available catalog or unguarded launch fails.

Refresh canonical source fingerprints and the committed ledger only after the actual checks pass. Connect the dedicated OutCall gate to required release verification so root unit success cannot hide it. Preserve the existing owner-authorized reconstruction and truthful historical provenance.

On the public card, replace the contradictory add-on availability/access-options copy with a planned informational state. Correct TradeFlowKit's obsolete OutCall business-call-recovery route/Help promise: map it truthfully to the existing CallCommand business intake/handoff or retire it with deliberate deep-link compatibility. Do not turn OutCall into customer outreach. Verify desktop/mobile catalog, pricing exclusion, direct launch and help. Do not add a waitlist unless backed by a real commissioned persistence/consent feature, and do not activate the module as a test shortcut.
```

## P11 — Finish OutCall's unreleased self-call workflow

```text
Read the Common contract in docs/reviews/2026-09-12/ecosystem/PHASE_PROMPTS.md and F19–F22/F32. Complete the canonical reconstructed OutCall experience in an isolated environment while preserving all public activation locks.

Add complete paginated profiles/triggers/calls and exact call detail. Give immediate/scheduled requests an explicit stable profile choice, content preview, own verified destination summary and timezone-aware schedule review. Bind OTP confirmation to the pending phone; implement rate-aware resend, change-number reset, expiry and reload recovery through existing server verification.

Use one idempotency identity per call intent until acceptance is known, with status reconciliation after lost responses. Provide bounded progress refresh and clear queued/dispatching/completed/failed/cancelled outcomes. Resolve cancellation-versus-dispatch races on the server. Put concise delivery and non-emergency limitations beside acknowledgment and final review; retain the acknowledged version.

Test six-plus profiles and 101-plus calls, profile reordering/deletion, expired codes, wrong number, schedule timezone/DST bounds, lost accepted response, duplicate callback, provider failure, restart and cancel races. Use provider doubles only here. No third-party destination, automatic emergency response, covert tracking or live phone traffic. Deliver a functional acceptance package to P19, not a go-live claim.
```

## P12 — Finish the public pricing-to-sign-in journey

```text
Read the Common contract in docs/reviews/2026-09-12/ecosystem/PHASE_PROMPTS.md and F24–F26. Repair PricingSection.tsx and the central login presentation without changing identity or billing authority.

Persist a bounded non-authoritative stack draft across central sign-in and return. Revalidate against the current server catalog and account before a final price review; handle expired draft, changed price, unavailable add-on and existing subscription. Never trust browser quantities/prices or store bearer credentials.

On phones, put the sign-in form and recovery actions before the long marketing explanation. Retain desktop identity, accessible labels, autofill and validation focus. Keep the keyboard from obscuring the active field/action.

Use explicit catalog loading versus error/retry states. Single-choice products/companions need radio semantics; independent add-ons retain checkbox semantics. Announce updated totals clearly.

Browser-test anonymous non-default stack with extra seats → sign-in → exact return draft, refresh, back, price change, denied billing role and mobile keyboard at 320/390/768/1440 widths. Verify no layout overflow or obscured primary action. Use test billing only; no actual subscription purchase is authorized. Save before/after screenshots and real interaction assertions.
```

## P13 — Validate and repair shared job lease lifecycle

```text
Read the Common contract in docs/reviews/2026-09-12/ecosystem/PHASE_PROMPTS.md and F27. Investigate shared-background-jobs.ts, shared-service-worker.ts and the analogous notification/webhook consumers as a reliability task.

Create a deterministic disposable-PostgreSQL reproduction with two workers, a batch containing a slow first handler, lease expiry and a second claimant. Record handler invocation and effect identity separately from completed-row counts. Determine which existing handlers already deduplicate effects and which can act twice. Do not assume duplicate billing without evidence.

If reproducible, implement the smallest coherent lease strategy: claim just before work, bounded parallelism with renewal, or fencing appropriate to the actual side effect. Preserve atomic claim, tenant context, stable effect keys, retry policy, dead letters and graceful shutdown. Completion owner checks alone are insufficient if the effect already ran.

Test crash before/after effect, lost provider response, expired lease, old worker completion, takeover, unregistered handler, backlog and shutdown. Verify retry does not silently widen permissions or use stale source versions. Document achievable delivery semantics and remaining provider ambiguity honestly. No production load generation or external deliveries are authorized.
```

## P14 — BrandForgeOS: make approved campaign delivery feel finished

```text
Read the Common contract in docs/reviews/2026-09-12/ecosystem/PHASE_PROMPTS.md and opportunity E04 in VALUE_OPPORTUNITIES.md. Inspect BrandForgeWorkspace.tsx, brandforgeos routes/domain and the existing BrandForge-to-Deploy Ops adapter before implementing anything already present.

Complete a focused improvement to the existing review-to-export outcome: a campaign readiness checklist grounded in saved brand/audience/offer/asset/approval records; clear blockers with exact links; and a reviewable package whose approved revision and provenance are visible. Add a useful side-by-side content revision comparison only if the current immutable data supports it. Preserve the existing logo SVG/PNG workflow and make export progress/download errors recoverable.

Do not label missing integrations as connected or invent campaign performance. Distinguish manually entered results, generated content and provider-observed metrics. Do not publish externally or contact customers.

Verify brand → persona → campaign → content revision → approval → export → reopen, stale approval after content change, rejected asset, viewer access and another user's/tenant's records. Download real files and inspect contents, dimensions and naming. Measure success as an approved usable package with no missing required fields, not extra dashboard cards. Keep this bounded; defer new providers.
```

## P15 — Deploy Ops: produce a coherent handoff package

```text
Read the Common contract in docs/reviews/2026-09-12/ecosystem/PHASE_PROMPTS.md and E07 in VALUE_OPPORTUNITIES.md. Inspect NinjaLaunchKitCompleteWorkspace.tsx, ninja-launch-kit-phase34 routes/domain, source catalog and the existing campaign handoff.

Improve the existing campaign-package review: show exactly which deliverables are ready, stale or awaiting a human decision; link each blocker to its editable record; include a concise export manifest identifying package revision, deliverable filenames and review status. Preserve personal ownership, agency/shared review limits, plan-bound export formats and generation accounting. If dependency/owner/due-date controls already exist, connect them rather than duplicate them.

Test a complete template-to-export flow, regeneration after approval, shared read-only package, limits reached, failed generation, duplicate export request and a reopened saved package. Parse TXT/Markdown/JSON exports and verify expected content, no empty placeholders and correct plan restrictions.

Keep the product's boundary explicit: it prepares materials and review work; it does not deploy a website, buy media, publish ads or send campaigns. No new external publishing integration belongs in this phase. Show the saved package and readiness manifest as the user-visible result.
```

## P16 — Script Ops: make exact-version review easier

```text
Read the Common contract in docs/reviews/2026-09-12/ecosystem/PHASE_PROMPTS.md and E09 in VALUE_OPPORTUNITIES.md. Inspect NinjamationShell.tsx, ninjamation-phase36.ts, sync/catalog contracts and the approved-revision TechDeck handoff.

Add a focused revision comparison and intended-environment summary for the existing review workflow: what changed since the last approved version, supported platform/language, required privileges, known static checks and operator review notes. Preserve immutable content hashes, source commit provenance and approval invalidation for changed content. A static check is not proof a script is safe to execute.

Make import/sync progress and failures recoverable without replacing a known working approved version. Verify approved download bytes/hash and the existing non-executing TechDeck package. Test modified source, failed sync, conflicting review, retired version, viewer download and cross-tenant denial.

Never run catalog scripts, enable a runner, add endpoint execution or broaden credentials. This phase improves preparation and human review only. Use fixtures for source changes; do not modify the external AutomationPacks repository. Deliver a useful before/after reviewer flow and exact-version regression evidence.
```

## P17 — Operator Pool Hall: polish play and recovery

```text
Read the Common contract in docs/reviews/2026-09-12/ecosystem/PHASE_PROMPTS.md and E03 in VALUE_OPPORTUNITIES.md. Inspect the active Pool Hall practice/CPU/local/online components, promoted physics/rules, practice-recovery and server online/match contracts. Treat quarantined networking as historical evidence only.

Choose small, evidence-backed improvements: readable current-turn/rule explanation, keyboard and touch control discoverability, reduced motion/audio preferences, explicit reconnect/recovery state and a useful saved practice summary. Preserve the free included entitlement and truthful distinction between browser-local physics, server-applied rules and verified competition.

Playtest practice, CPU, local two-player and a private same-tenant online match. Verify a full rack, scratch/8-ball rules, resize/orientation, touch cancellation, tab backgrounding, network drop/reconnect, stale move, reload and saved match history. Run deterministic engine/source-provenance tests before any physics change; do not alter physics merely for animation polish.

Do not add gambling, prizes, public competitive rankings or anti-cheat claims. Record observed device/browser performance instead of asserting 60 FPS everywhere. Keep the phase focused on an enjoyable recoverable game and explain exactly what state can be resumed.
```

## P18 — Complete the managed deep security gate

```text
Read the Common contract in docs/reviews/2026-09-12/ecosystem/PHASE_PROMPTS.md and F31. Run the codex-security deep-security-scan skill according to its current instructions in a session with a supported managed filesystem permission profile. The prior attempt did not start and produced no scan ID; do not claim it covered anything or retry it as an existing scan.

Pin a source commit and include shared identity/SSO/tenant/entitlement/billing/audit, active module APIs/web, provider entry points, native authority and canonical unreleased OutCall. Keep imported source offline and distinguish disabled runner surfaces. Use the skill's discovery, validation, reporting and remediation process; do not replace tool failure with an invented equivalent scan.

Produce validated findings with exact paths, prerequisites, impact and bounded reproductions in isolated test data. Separate confirmed vulnerabilities, hardening proposals and coverage gaps. Remediate via focused authorized phases and rerun the applicable verification. Preserve existing disclosed dependency-exception history and require fresh evidence for current advisories.

No production exploitation, customer-data access, credential changes or paid provider actions. If the managed-profile requirement still blocks startup, report the exact blocker and the coverage left open. Only a completed supported process can close this gate.
```

## P19 — Prove external provider lifecycles without ambiguous success claims

```text
Read the Common contract in docs/reviews/2026-09-12/ecosystem/PHASE_PROMPTS.md and F22/F30. Prepare and run provider acceptance only within separately authorized sandbox accounts and approved destinations. Finish fixtures, manifests and expected outcomes before requesting any final external permission. This prompt alone does not authorize spending, calling or sending.

Build concrete cases for central Stripe subscription/add-on checkout and signed webhook reconciliation; TradeFlowKit business-payment separation; CallCommand number setup, activation, real test call, analysis, permitted follow-up and usage reconciliation; shared email/SMS delivery; and OutCall own-phone verification, scheduled dispatch, cancellation and delivery failure. Use the current provider contracts and registered exact callbacks. Inspect current documentation if necessary rather than guessing API behavior.

For each case record expected owner, tenant, external request ID, masked destination, amount/currency if applicable, idempotency identity, callback receipt, durable state and recovery result. Cover lost response, duplicate/out-of-order callback, timeout, quota failure and revocation. A configured key, redirect, simulation or sent request is not completed delivery/payment.

Keep OutCall disabled until all its required cases and separate activation approval pass. Produce a clear pass/fail/not-run matrix and the exact remaining human action; never fabricate provider receipts or use real customer contacts.
```

## P20 — Run complete ecosystem browser acceptance

```text
Read the Common contract in docs/reviews/2026-09-12/ecosystem/PHASE_PROMPTS.md, F30 and ACCEPTANCE_MATRIX.md. Certify the built candidate through scripts/start-unified-runtime.mjs and the repository exact-host test proxy, using an isolated disposable database and stripped provider credentials.

Run the required release browser suites and extend them to the concrete missing behaviors from this review. For all 12 available modules, prove central sign-in → entitled launch → exact deep link → primary persisted outcome → actual result/artifact → reload/restart → return navigation → logout. For OutCall prove unavailable boundaries publicly and its reconstructed workflow only in the approved test configuration.

Use owner/admin/member/viewer and a foreign tenant; include empty/populated/error/denied/loading states, more records than page caps, slow and reversed responses, repeated actions and expired sessions. Exercise all ten registered cross-module outcomes with source version change and permission revocation between queue and delivery. Keep provider-origin requirements intact; synthetic doubles must be explicitly labeled.

Record exact pass/fail/skip counts, source/build/schema identity, screenshots, browser console/network failures and downloaded-content checks. Do not accept only route-crawl or shell-render results. Never update visual baselines merely to suppress a defect. Target-deployment acceptance remains a separate approved step.
```

## P21 — Validate native release on real devices

```text
Read the Common contract in docs/reviews/2026-09-12/ecosystem/PHASE_PROMPTS.md and F03–F04/F30. After P02, run the current TorqueShed native type/unit/config/export gates and then actual supported iOS/Android device acceptance.

Verify central auth/deep-link return, tenant selection, permission denial, camera/photo selection, retained offline mutation/file, process kill/restart, reconnect, conflict repair, logout and revoked membership. Check that the keyboard, safe areas, system font scale, rotation and reduced motion do not hide controls. Record device/OS/app version and release artifact, not only a simulator screenshot.

Exercise 401/403/409/422/429 and intermittent network conditions with synthetic accounts. Confirm no cross-user draft or file leakage and no silent removal of unsent work. Check privacy permissions are requested at the moment needed and that denying them leaves a usable alternative.

If no device or signing environment is available, leave those rows not-run with a precise handoff checklist. Do not infer device acceptance from a web export or publish an app/store build. Deliver signed-artifact provenance and publication steps only when separately authorized.
```

## P22 — Close operational readiness and prepare a concrete release decision

```text
Read the Common contract in docs/reviews/2026-09-12/ecosystem/PHASE_PROMPTS.md and F30. Consolidate completed phase evidence into a release decision for a pinned artifact.

Run current production preflight, read-only database plan, clean disposable apply/reapply/verify, production build and supervisor start/health/readiness. Rehearse backup/restore only with disposable or explicitly approved non-production data, including schema/artifact compatibility. Verify graceful shutdown, worker backlog/dead-letter visibility, provider failure alerts, session/logout behavior and rollback steps. Do not perform a destructive production migration or restore.

Set concrete release criteria: zero unresolved P1 issues on released surfaces, no skipped mandatory tests, known P2 disposition, all intended provider claims proven, correct current catalog and help, and OutCall still disabled unless separately accepted and approved. Keep locally passed and deployed passed evidence separate.

Prepare a reviewable release manifest, migration/backup plan, smoke checklist, rollback trigger/owner, communication copy and support triage instructions. Request only the final specific push/deploy/provider action that still needs authorization after all local work is complete. A deadline does not turn missing evidence into a pass.
```

## P23 — Reduce maintenance cost without destabilizing release

```text
Read the Common contract in docs/reviews/2026-09-12/ecosystem/PHASE_PROMPTS.md and F28–F29. Measure large source and generated-artifact costs before changing structure.

Propose a bounded artifact retention policy: small canonical ledgers and checksums remain tracked; large generated logs/crawls/reports move to retained CI artifacts with an index and retrieval instructions. Do not rewrite Git history or delete required evidence. Measure tracked bytes, checkout/review overhead and any build packaging impact; distinguish those from runtime performance.

Extract typed API contracts and focused module state components only around repaired areas, with existing behavior tests. Prioritize central client contracts, financial operations and repeated async-state handling. Do not scatter a generic abstraction across all modules or do a release-week framework rewrite.

Verify import boundaries, bundle/build output and focused regression after each extraction. Preserve read-only migration evidence and the production exclusion of runner/source workspaces. Deliver measured improvements, unchanged behavior evidence and an explicit deferred list rather than a large cosmetic refactor.
```

## P24 — Make existing cross-module outcomes visibly complete

```text
Read the Common contract in docs/reviews/2026-09-12/ecosystem/PHASE_PROMPTS.md and E14–E16 in VALUE_OPPORTUNITIES.md. Inspect the ten registered outcomes, cross-module-workflow-adapters.ts and OutcomeWorkflowAction before proposing new integrations; preview, confirmation, durable status and exact result links already exist.

Implement a small user-value increment: a permission-aware relationship timeline on source/destination records showing reviewed source version, queued/completed/failed state and the exact resulting record/artifact. Make reopen/retry recovery accessible from the relevant daily workflow. Reuse durable workflow identity and redacted result contracts; do not duplicate business records or expose administrators' audit fields to ordinary users.

Prioritize the strongest complete loops: TradeFlowKit → SnapProof → exact approved PDF back; CallCommand → reviewed operational work; Script Ops → non-executing TechDeck runbook; BrandForge → Deploy Ops package. Training transfers stay private pending trainer revision.

Test duplicate users/actions, refresh, stale source, revoked destination access and actor-scoped versus tenant-shared outcomes. Measure completion and time-to-result from real events; do not invent saved-hours or revenue claims. No automatic outreach, publication, payment or script execution.
```

## P25 — Add one high-value Core Suite outcome per module

```text
Read the Common contract in docs/reviews/2026-09-12/ecosystem/PHASE_PROMPTS.md and E01/E02/E05 in VALUE_OPPORTUNITIES.md. After correctness fixes, select the smallest additive version of each outcome and verify it is not already implemented.

TradeFlowKit: a customer-ready closeout packet linking accepted work, approved proof, exact outstanding balance and next action. TechDeck: a resolution/handover packet connecting issue, affected asset, approved procedure, evidence and follow-up owner. PulseDesk: an operations-only shift handover showing open risk, owner, service target and the next safe action.

Derive content from saved records and existing permissions; label missing inputs, stale records and manual acknowledgments. Reuse existing document/export/shared-delivery services. Provide preview and deliberate approval before any external delivery, with no customer messages sent in this phase. Do not create a second CRM, ticket engine, billing system or clinical workflow.

For each packet, demonstrate a complete synthetic lifecycle, usable exported content, incomplete-state blockers, viewer/read-only behavior and revision after the source changes. Choose measurable success such as fewer manual steps or a complete handover, not invented ROI. Defer recurring outreach/automation until provider and consent acceptance is separately proven.
```

## P26 — Add evidence-based companion value

```text
Read the Common contract in docs/reviews/2026-09-12/ecosystem/PHASE_PROMPTS.md and E06/E08/E10–E13 in VALUE_OPPORTUNITIES.md. Implement only the smallest selected enhancements after core defects are repaired; split by module if changes cannot be independently verified.

SnapProof: a job-specific evidence-completeness checklist and exact reviewed customer package. TorqueShed: a verification follow-up tied to a recorded diagnostic/repair and actual costs/history. FaultlineLab: trainer-reviewed next-practice recommendations grounded in missed evidence/actions. StudyForge: a targeted next session based on that set's recorded difficult cards/questions, with source links and recoverable navigation. OutCall: neutral profile preview and an explicitly labeled preparation/rehearsal mode that does not place a call.

Inspect existing capabilities first. Reuse saved data, approval states and central access, and show missing evidence honestly. Do not imply a repair is safe from an AI suggestion, certify competence from a quiz, promise emergency reliability or fabricate learning/performance scores.

For every chosen increment specify the user problem, required saved inputs, result, permissions, failure recovery and success measure. Test a complete outcome plus insufficient-data and stale-source cases. Keep provider actions and OutCall activation gated. Record unselected ideas as deferred rather than shipping shells or inactive controls.
```

## P27 — Apply a consistent finish to the working product

```text
Read the Common contract in docs/reviews/2026-09-12/ecosystem/PHASE_PROMPTS.md and the visual acceptance section in ACCEPTANCE_MATRIX.md. Apply the product-design audit workflow to the actual built, authenticated candidate; use saved screenshots before proposing visual fixes.

Review each primary route at desktop/tablet/phone: one clear next action, readable record context, compact optional detail, consistent spacing/type, adequate contrast, complete labels, visible keyboard focus, useful empty/error/retry states and honest status language. Retain the existing guided journeys, page guides, workday briefs and recently improved messenger/admin controls. Do not add another layer of onboarding cards everywhere.

Check forms with long names, validation, autofill and mobile keyboard; dialogs with focus trap/return and Escape; tables with hundreds of rows; charts with no data; reduced motion; 200% zoom and font scaling. Verify actual button behavior and downloaded output, not only appearance. Keep application identity within shared tokens without making every workspace visually identical.

Capture paired screenshots and interactive checks for each changed flow. Run targeted accessibility tooling and manual keyboard checks; report their scope instead of claiming blanket conformance. Fix root components where appropriate, but avoid a large visual rewrite before release acceptance. Success is clearer, faster completed work.
```
