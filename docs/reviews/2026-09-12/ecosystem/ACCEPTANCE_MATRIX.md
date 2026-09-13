# End-to-end acceptance matrix

This document defines the completion criteria for the phase prompts. It is **not a filled-in all-pass certification**. Fresh execution results belong in [the review evidence](README.md); implementation phases must attach case-level results to the candidate's exact source/build/schema. Existing tests are valuable starting points, not a reason to omit the specific defects found here.

## Evidence classes

| Class | Proves | Does not prove |
| --- | --- | --- |
| Source inventory/hash | Files and versions included in scope | Every line was understood or semantically reviewed |
| Static source/route/parity contract | Expected mappings/patterns and coverage declarations agree | An actual user can complete the mapped workflow |
| Unit/component test | Specified behavior under controlled collaborators | Full persistence, provider or device integration |
| Disposable PostgreSQL/API | Real constraints/transactions/authorized persistence in fixtures | Browser intent, actual email/phone/payment delivery |
| Compiled local browser | The built app works through local supervisor/exact-host proxy for tested cases | The deployed artifact/environment or real providers work identically |
| Public deployed read-only | Observed public pages and readiness metadata | Authenticated customer mutations or complete provider lifecycle |
| Authorized provider sandbox | The tested provider lifecycle with approved test accounts/destinations | All production accounts, amounts, regions or carriers |
| Target deployment acceptance | The actual candidate's tested authorized production/staging journey | Untested edge cases or future changes |
| Real native device | Named app/device/OS flows | Other devices, OS versions or publication approval |

## Shared case dimensions

Use synthetic owner, tenant administrator, ordinary member and viewer in Tenant A, plus unrelated Tenant B and a user whose membership/entitlement is revoked during a queued operation. Include a person belonging to both tenants. Test exact role semantics rather than assuming the UI label is authority. A test must verify no foreign resource is returned or changed, not merely that its link is hidden.

For each collection: 0, 1, one full page, page+1 and several pages; tied sort keys; deleted/stale selected record; cold deep link; back/forward; refresh; query change during loading; oldest still-actionable record. For each mutation: valid, invalid, cancelled, double click, timeout before/after acceptance, retry, conflict, denied write, unmount and reopened persisted result.

For each async operation: queued/running/terminal; lost response; duplicate/out-of-order event; lease takeover; provider outage; source version change; access revocation; restart. Inspect the effect and the audit, not just job status. For each artifact: nonempty valid bytes, correct source/revision/tenant, useful filename, authorized download, revoked grant and readable content. Exported CSV must preserve values and handle spreadsheet-sensitive cells under existing policy.

All test databases are isolated and disposable. Capture no production credentials/customer content in screenshots, logs or fixtures. External sending/payment/calls require a separately authorized concrete test plan.

## Module journeys

| Module and canonical ID | Primary end-to-end result | Specific failure/regression cases | Release evidence still required after a fix |
| --- | --- | --- | --- |
| TradeFlowKit — `tradeflowkit` | Lead → customer → scheduled job → quote/recorded response → invoice → deliberately recorded payment → accurate history; optional exact approved proof returned | F01 Cancel/Escape makes zero calls; F02 partial-payment audit; stale version; duplicate payment; provider delivery distinct from record status | Browser intent plus persisted financial/audit values and approved provider business-payment lifecycle where claimed |
| TechDeck — `techdeck` | Request → affected asset/site → assignment → work notes/procedure/evidence → resolution → report/handover | F09 old unresolved item beyond 100; filters/paging; direct record; viewer; topology/document links and actual attachments | Complete queue at scale, exact deep links and persistent supporting records |
| PulseDesk — `pulsedesk` | Operations-only request → owner/target → routing/escalation → updates → resolution → handover | F10 full collection; F11 apply saved view; F12 typing focus; missing directories; requester/internal attachments; wrong tenant | Complete request workflow with privacy acknowledgment and actual role behavior; no clinical claim |
| TorqueShed — `torqueshed` | Vehicle → diagnostic/tests → service/verification → history/journal → usable export/share | F06 ready artifact download; F07 reversed record loads; F08 saved false discoverability; failed collaboration/upload | Real export content, preference fidelity, protected sharing, device evidence separately |
| FaultlineLab — `faultlinelab` | Reviewed challenge → publish/assignment → learner investigation → scored run → evidence/result → targeted practice | F15 evidence request failure; restricted imported first revision; wrong learner; deterministic scoring/catalog; interrupted session | Accurate evidence availability and complete scored persistent workflow |
| Operator Pool Hall — `ninja-pool-hall` | Practice/CPU/local/private online → valid turn/rack completion → saved history/recovery | Scratch/8-ball rules; stale move; reconnect; resize; input cancellation; history after reauth; free entitlement | Named-browser playtest, rule/provenance checks and honest physics/competition claims |
| BrandForgeOS — `brandforgeos` | Brand/persona → campaign → generated/edited content → revision approval → actual export/handoff | Failed generation/asset; stale approval; plan limits; logo SVG/PNG contents/dimensions; manual versus provider metrics | Approved usable output, ownership constraints and truthful integrations |
| SnapProofOS — `snapproofos` | Customer/job/team → offline/online capture → findings/costs → approved report → generated PDF → controlled share/revoke | F05 cold Team route; retained upload failure; reviewer denial; stale report revision; exact origin; real downloaded PDF | Field workflow with durable evidence and correct custody/review/sharing |
| StudyForge AI — `studyforge-ai` | Source → reviewed saved set → cards/quiz → completion → recorded progress → next session | F13 finish then new rating; F14 keyboard; failed generation; incomplete answer; selected set reload; per-set progress | Session correctness, source-grounded material and actual recorded learning activity |
| Deploy Ops — `ninja-launch-kit` | Template/brief → saved package → reviewed deliverables/launch work → actual plan-bound export | Stale approval after regeneration; missing required deliverable; owner/shared viewer; failed export; clear visual-brief labeling | Coherent output manifest and durable review; no actual publishing/deployment claim |
| CallCommand AI — `callcommand-ai` | Saved business setup → correct number/billing state → authorized activation → completed real call → reviewed request → allowed follow-up | F16 exact old call; F17 full timezone count; F33 state language; lost billing return; repair/release; usage dedupe | Sandbox/target provider, actual call and billing reconciliation in addition to simulation |
| Script Ops — `ninjamation` | Source/draft → static analysis → human review → exact immutable approved version → byte-verified download → non-executing runbook handoff | Source changed after approval; failed sync preserving approved version; retired record; hash mismatch; denied download | Reviewed artifact and provenance; no remote execution or automatic safety guarantee |
| OutCall — `outcall` | While public remains unavailable: acknowledgment → own-phone verification → explicit profile/preview → request/schedule → actual state → cancellation/recovery | F18 gate semantics; F19 complete lists; F20 stable choice; F21 resend/change; F22 accepted-timeout retry; F32 limitations | All dedicated source and provider lifecycle gates plus separate activation decision; historical literal parity remains unclaimed |

## All ten registered connected outcomes

The sixth registered outcome supports two source modules. Test both source variants; “ten outcomes” is not an excuse to test only one variant.

| Outcome | Positive result to inspect | Required negative/recovery case |
| --- | --- | --- |
| TradeFlowKit job → SnapProof | Exact customer/job and draft report with source linkage | Duplicate intent, changed job, destination access revoked, no automatic completion/payment |
| Approved SnapProof → originating TradeFlowKit | Exact approved generated PDF attached to the original job | Wrong/missing origin, stale/unapproved report, no PDF, different tenant, no false delivery claim |
| Provider CallCommand → TradeFlowKit | Reviewed lead or customer/job as selected | Simulation rejected, wrong call/product, duplicate intent and changed source |
| Provider CallCommand → PulseDesk | Operations-only request with explicit per-call privacy acknowledgment | Missing acknowledgment, clinical/patient content boundary, simulation and automatic-rule rejection |
| Provider CallCommand → TechDeck | Exact reviewed support ticket | Unanalyzed/incomplete call, simulation, revoked destination access |
| Resolved TechDeck or PulseDesk → FaultlineLab | Unpublished contextual training draft, clues/actions/hints/remediation | Manager access in both modules, privacy review, changed source, imported first revision cannot publish |
| TorqueShed diagnostic → SnapProof | Correct diagnostic job/observations/draft report | Another member's private diagnostic, revoked source access at delivery, duplicate intent |
| Verified/resolved TorqueShed → FaultlineLab | Unpublished automotive training draft grounded in recorded tests/results | Unresolved source, manager/privacy gate, changed source and publication barrier |
| BrandForge campaign → Deploy Ops | Actor-owned package, copy/visual briefs, launch work and review starting state | Actor-scoped dedupe, plan allowance, another user's access, no external publishing |
| Approved Script Ops → TechDeck | Draft runbook, first revision and exact protected script artifact | Changed/unapproved version, bad hash, revoked access, no script execution |

For every row verify preview/explicit confirmation, source-version binding, semantic idempotency, result redaction, creator/manager/shared-user access, retry after a corrected eligible failure, exact result deep link and restart persistence. Existing `OutcomeWorkflowAction` already implements important recovery features; extend tests before changing it.

## Shared platform, operations and native

| Surface | Required journey and boundary |
| --- | --- |
| Central auth and SSO | One credential entry, exact-host launch, direct deep-link return, silent sibling SSO, state/nonce/PKCE failures, single-use expiry/replay, local versus global logout and reauthentication |
| Tenant/roles/entitlements | Initial setup, selected tenant, membership change, viewer writes denied, requested tenant revalidated, suspended/expired entitlement, module-disabled boundary and current-session refresh |
| Billing | Catalog → persisted selection → approved checkout → authoritative callback → entitlement/seat state; signed quantity; duplicates/out-of-order events; cancellation and reconciliation; business money kept separate |
| Platform/organization administration | Reachable current navigation, explicit denied state, false-empty prevention, user/access changes under existing roles, readable audit context and actionable exceptions |
| Tenant messenger | Correct recipient, drafts isolated by conversation, same-ID retry, unread/history, edit/delete/mute ownership, stale response, socket reconnect/fallback and membership revocation |
| Jobs/outbox/webhooks | Lease lifecycle, dedupe, backoff, dead letters, provider ambiguity, source freshness, current access at execution, bounded backlog and graceful shutdown |
| Files/search/directory | Complete bounded search, tenant/resource access, scan status, authorized artifact retrieval, stable links, no false-empty failure state and cross-module origin consistency |
| Database/release | Ordered manifest plan, clean apply/reapply/current verification, indexes/constraints, locking, schema readiness before app serving, compatible rollback and backup/restore rehearsal |
| Supervisor/deployment | Same `.replit` path, compiled API/web, readiness gating, no imported child/legacy runner in public runtime, release identity agreement, health under dependency failure and shutdown cleanup |
| Native TorqueShed | Real iOS/Android central auth, safe areas/keyboard, camera permission, offline file retention, process death, conflict/re-authentication, scope change and logout |
| Quarantined modules | Provenance/manifest completeness and documented migration disposition; no server execution/dependency install/schema apply |

## Visual and accessibility acceptance

Use screenshots from actual built routes at 320, 390, 768 and 1440 CSS-pixel widths, plus appropriate landscape and mobile-keyboard cases. Record theme, role, route and fixture state. Observe the screen before diagnosing visual problems; do not infer all modules' visual quality from source styling.

- The page tells the user which record/organization/module they are in and exposes one clear primary next action.
- Secondary detail is available without overpowering the task; existing guided navigation remains functional and active-stage state does not imply completed work.
- Primary actions remain visible/reachable with long labels, validation text, mobile keyboard, safe areas and help/messenger overlays.
- Labels and descriptions are explicit; icons-only controls have names; radio versus checkbox semantics match selection behavior.
- Keyboard focus is visible and ordered; modal focus/return/Escape work; shortcuts do not intercept unrelated interactive controls.
- Loading, true empty, error, stale, partial, denied and successful states are distinguishable; each failure offers a useful next step.
- Text, borders and status colors work in each supported theme; status is not conveyed by color alone. Reduced motion and font/zoom scaling preserve usability.
- Downloads contain readable actual output with useful names, source/revision context and correct access, rather than merely rendering a success toast.
- Accessibility tools supplement manual keyboard/screen-reader checks. Report the tested routes/regions and rule set; do not infer universal WCAG conformance from a small axe pass.

## Release decision template

Record candidate SHA, build ID, lockfile hash, schema manifest version, deployment target, date/time and owner. List P1 issues on released surfaces, P2 dispositions, all required gate counts, provider/device cases not run, and OutCall's explicit state. Attach rollback/backup and support plans.

The review recommends withholding a “fully polished and release-accepted” claim while known payment/offline-loss defects, failed required gates or missing provider/security evidence remain. Module availability and the release date are product decisions, but unresolved evidence must remain visible in that decision.
