# Resolution Intelligence prompt ledger — 2026-10-02

The original twelve-prompt sequence is not complete. The next unfinished prompt
was **6 — AI Technician Research Assistant**; this branch implements that
workflow, with [configuration and acceptance boundaries](resolution-intelligence-research.md).
This ledger concerns OperatorOS TechDeck, not unrelated portal or RemoteOps work.
Private source attachment/customer endpoint content is not copied into Git.

## Original contract and scope

The retained September 25 attachment's LF-normalized canonical closeout prompt
matches the repository SHA-256 exactly:
`3d0283064bcb14240d229d94c096d6dc897a2fd5a2d12b323bf78b88df9c2004`.
The export is `schema_version:1.0`, `export_type:msp_incident_closeout`, final
`MACHINE_EVIDENCE_EXPORT` section. Conversation shorthand does not establish a
different schema. Original Prompt 6 requires authorized evidence retrieval,
incident/KB citations, four evidence labels, ten output sections, visible failures,
side effects and contradictory/unknown evidence, and no automatic command execution.

| Prompt | Supplied title | Evidence-backed status |
| --- | --- | --- |
| 1 | Repository Audit and Implementation Plan | Implemented plan/audit; earlier planning-only memory is superseded by current source/PR evidence. |
| 2 | Database and FixGraph Foundation | PR104 implemented/tested; v64/v65 storage deployed. |
| 3 | MACHINE_EVIDENCE_EXPORT Ingestion Engine | PR105 native/headless validation/import/reprocess, screened immutable source, transactional dedupe/audit, graph/search implemented/deployed. |
| 4 | Resolution Intelligence UI | PR106 native/embedded import/detail/search/history implemented, browser-tested and deployed. |
| 5 | Hybrid Search Engine | PR109 exact/full-text plus optional semantic/structured/graph retrieval implemented/deployed v65. Live activation, judged real-model evaluation and authenticated v65 write acceptance remain open. |
| 6 | AI Technician Research Assistant | Implemented on `codex/techdeck-grounded-research`: local hybrid retrieval, reviewed normalized projection, shared completion adapter, strict source/quote validation, ten sections/four labels, mandatory negative/uncertain evidence, role/tenant/delayed-access guards, no execution; candidate verification and release evidence below. Not deployed. |
| 7 | Automatic KB and Runbook Generation | PR107 deterministic linked/versioned drafts and approval workflow implemented/deployed. AI generation and shared library scope remain separate/open. |
| 8 | Automation Opportunity Miner | Imported opportunity storage exists; cross-incident miner/backlog absent. |
| 9 | MSP Intelligence Dashboard | Basic incident counts exist; complete requested intelligence/drilldown analytics absent. |
| 10 | Ticket Completion Prompt Integration | Canonical prompt/shortcut/schema/template settings, copy/download and alias implemented/deployed with Phase3. |
| 11 | Hardening, Testing, and Production Readiness | Earlier implementation tests exist; dependency security, deployed write/other-role/logout and restore acceptance remain open. |
| 12 | First real incident seed and acceptance | Private import/review/five-query acceptance not evidenced. Synthetic CAM WAL fixtures do not count. Production private incident data was not inspected or changed. |

## Source provenance and deployed identity

This isolated branch starts from main `62fb640c64bd5477a8e5752301c17cb108ab6d2e`.
[PR113](https://github.com/shotgunsensei/OperatorOS/pull/113) was merged at
2026-10-02T20:19:32Z under `shotgunsensei`. GitHub identifies that account, not
which human/agent used it. This worker did not issue that merge or publication
and did not revert it. Its head `40f8aae8` passed 13/14 stages: 1,596 API,
108 integration, 52 unit, 32 browser and four visual checks; dependency security
failed with multiple advisories. [Exact-head CI](https://github.com/shotgunsensei/OperatorOS/actions/runs/37059828362)
is distinct from exact-merge approval or deployment evidence.

Read-only [public readiness](https://api.operatoros.net/readyz) observed v65/65,
commit `ee9ca05e8346bdb1770932029ae8a9a8d682ef0f`, build
`8eff6d674044c40a533419b4` compiled September 29. A later process start is not
proof of a new build. That commit's [immutable release CI](https://github.com/shotgunsensei/OperatorOS/actions/runs/36591653046)
passed. No later source is claimed deployed. Presence of configured OpenAI/Stripe
variables is not credential or checkout verification. The previously reported
Replit editor key issue is distinct from untested published credentials.

## Candidate verification checkpoint

Environment: Windows Xodus-John, Node 24.16.0, pinned pnpm 10.34.5; fresh disposable
loopback PostgreSQL16, all external provider credentials stripped, strict
deterministic test mode. User Chrome/Replit was not used. Initial frozen offline
install passed; supported-resolution install updated only the bounded packages
below. The source remains on an isolated branch; canonical/unrelated work is preserved.

- Clean root release apply through v66 passed. Settings idempotency/constraint
  verification passed in focused tests.
- Focused research/database contract suite passed 20/20, zero skips, including
  exact-session logout, positive versus conflicting fixes, revoked consent/module
  access, oversized evidence and concurrent cap reservations. Zero-warning lint,
  workspace typechecks and the production build passed. Commands: the root
  `pnpm lint`, `pnpm build:production` (includes typecheck), `pnpm db:apply`, and
  `pnpm --dir apps/api exec tsx --test --test-concurrency=1 test/techdeck-resolution-research.test.ts test/database-release-contract.test.ts`.
- Focused Playwright workflow passed 2/2, zero retries/skips: native/embedded
  host, all ten sections, source citations, inert injected markup, uncertainty,
  desktop/mobile Axe checks, refresh/back, no-evidence and cancellation. The first
  run's new touch-target defect was fixed in research-scoped CSS. Command:
  `pnpm --dir apps/web exec playwright test --retries=0 e2e/techdeck-resolution-research.spec.ts` against the isolated production artifacts/TLS proxy.
- Complete `pnpm verify:release` and exact-head CI are pending for the final candidate.
  The draft PR's verification section will record the terminal all-stage results
  and artifact URLs; this committed ledger records the preflight checkpoint. This is not
  release approval, and no live provider/research/production data writes occurred.

## Dependency release blocker

Inherited audit disclosed 23 distinct advisories (25 affected dependency counts:
16 high, nine moderate). Bounded supported resolutions are Fastify 5.12.5,
Axios 1.20.0, brace-expansion 5.0.12 and fast-uri 4.1.5. Fresh audit now leaves
only advisory 1240912 / [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv),
node-forge1.4.0 via Expo's CLI. The registry reports no patched version; metadata
counts three high affected dependency instances, one distinct advisory, zero
moderate/critical. No advisory was ignored or test/security gate weakened.
Supported maintainer fixes: [Fastify](https://github.com/fastify/fastify/releases/tag/v5.12.5),
[Axios](https://github.com/axios/axios/releases/tag/v1.20.0),
[brace-expansion](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr),
[fast-uri](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj).
Until the required security gate passes, keep this PR draft; do not merge/publish
or substitute an unsupported fork, remove active tooling, or add a waiver.

## First-revenue priority

Owner reports no known trials/customers and prefers TradeFlowKit. The first
sellable offering remains one assisted TradeFlowKit pilot at the existing $149
monthly tenant plan (five seats, one companion), proving customer → quote → saved
invoice → approved test merchant payment → receipt → second-user access. $29
companion/$15 seat prices are existing documentation, not new pricing or purchase
authorization. Subscription checkout and entitlements are separate from merchant
Stripe Connect payments. PR111 signup/plan preservation and PR112 invoice-payment
cancellation fixes remain separate draft work; neither is claimed published here.
An isolated read-only October2 browser check rendered the public $149 price and
total correctly; fetched-text “Price unavailable” was not a confirmed live blocker.
Live Price/checkout, payment/webhook acceptance and the complete paid pilot still
require owner configuration/acceptance without real purchases by this worker.
