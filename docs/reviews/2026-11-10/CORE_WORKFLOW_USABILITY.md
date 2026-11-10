# Core application review and accessible handoff recovery

Verdict: implementation verified locally; deployment unverified. This is a
bounded shared workflow repair, not whole-application visual or parity acceptance.

## Source, scope and release boundary

Frozen base: `ed1ab8dcf75db4ce0832006ca19b6ff0b3d4b3ea`, tree
`7f24780bffcc6438d9a13c8957dcf68f78c453b0`. Isolated branch
`codex/core-usability-nov10`, worktree `operatoros-core-usability-nov10`.
Only OutcomeWorkflowAction, its browser regression suite and review documentation
change. No dependencies, backend, schema, decoder, baseline checkout or providers
change. No publication, migration, production browser or live tenant was used.

The smallest common outcome is reviewing an existing record's connected work,
confirming it, and returning to its saved result without losing keyboard position
or mistaking a status read for a new creation. Original app imports under
`apps/modules/{techdeck,tradeflowkit,pulsedesk}/source` remain migration evidence;
this review uses the active native destinations below, not imported servers or
historical inventory counts. Earlier continuity and security integration reports
remain valid evidence for their own exact source and checks.

## Entry-to-outcome ledger

All component anchors below are in `apps/web/src/components/module-shells`.
All API anchors are in `apps/api/src/routes` unless stated otherwise.

| Application / user goal | Active native path and boundaries | State coverage and findings | Acceptance status / next owner |
| --- | --- | --- | --- |
| TechDeck: triage a support ticket and turn its resolution into private staff practice | TechDeckShell routes tickets into TechDeckTicketQueue with tenant, actor and write/manage flags. Queue loads the exact requested ticket as well as the recent list; title/priority/deadline/assignment forms mutate native tickets. `techdeck-routes.ts` read/write/admin guards preserve module membership, write entitlement and tenant-admin authority. Resolved ticket training uses `support.resolved_to_faultlinelab`, source version and manager/privacy approval. | Queue has loading, search/filter, read-only, missing-record and retry messaging; its list effect cancels obsolete reads. Shared review formerly removed the focused trigger; Cancel/Close left focus on the document. Those shared defects are repaired. The ticket creation/update forms and full queue were source-traced, not browser-accepted in this slice. | Integrated source; shared action verified with TechDeck scope at 390px and keyboard. Existing native ticket persistence, live auth and private training delivery remain separate acceptance. Follow-up owner: core workflow review. |
| TradeFlowKit: manage a customer job and collect proof without re-entry | TradeFlowKitShell jobs -> TradeFlowKitOperations; revenue forms in TradeFlowKitRevenueFlow remain separate. Operations loads an exact job bundle plus recent operations; selected job -> `tradeflowkit.job_to_snapproof` -> field job/draft report. Approved generated proof returns through existing provenance and the attachment query. `tradeflowkit-routes.ts` and related revenue routes retain server tenant/write/version controls; platform subscription billing remains separate from business payments. | Loading, no jobs, conflicts, refresh, missing attachment, scan/download gates and responsive job layout exist. Shared status recovery incorrectly said Creating while only GET ran; repaired. `TradeFlowKitOperations.load` still has no request sequence fence for overlapping search/filter reads. This is a source-level race risk, not reproduced here or asserted to bypass authorization. Historical operations list limits remain. | Integrated source; shared action verified with TradeFlow scope and retained attachment-link/reload/Back/Forward regressions. Full revenue/payment/field proof persistence, provider and deployment acceptance not rerun. Follow-up owner: operations loading lifecycle. |
| PulseDesk: resolve non-clinical operational requests and prepare private practice | PulseDeskShell maps requests to PulseDeskServiceDeskWorkspace. Service desk loads configuration, tickets and directory choices; detail loads role-filtered requester/internal attachments. Forms create/update requests with PHI acknowledgement and expected versions; native roles distinguish requester/internal/manager capabilities in `pulsedesk-service-desk-routes.ts:87-123`. Resolved request -> private Faultline draft with manager/privacy review. | Operational-only warning, busy/error/notice, read/write controls and detail forms exist. Shared review/recovery repairs apply. `loadTicket` and `loadAll` lack sequence fencing: overlapping same-workspace detail/filter reads could replace newer detail or attachments. Shell keys tenant and area, which limits cross-tenant remount exposure; this does not solve overlapping same-workspace requests. Needs dedicated browser reproduction. | Integrated source; shared action verified with PulseDesk scope at 390px and keyboard. No clinical advice, patient-data transfer, mailbox or compliance claim. Full service-desk navigation and role/persistence journeys unverified here. Follow-up owner: service-desk loading lifecycle. |

Common launch authority remains OperatorOS SSO, active membership, server module
entitlement and host namespace. Shared action readiness, POST and GET use
`cross-module-data-fabric-routes.ts:117-154, 178-212` and existing library policy;
source/destination access, source version and actor/tenant record boundaries are
not moved into the browser. Disabled UI is not authorization. Draft creation is
not training publication, remote execution, clinical treatment or a payment.

## Exact repair and interaction acceptance

1. Entry/readiness: unchanged fail-closed checks. No autofocus on mount, receipt
   restoration or context change. Browser denied-readiness and hash-failure cases
   remain green.
2. Open review: explicit action focuses the semantic `This will create` heading,
   so keyboard/screen-reader navigation starts before the preview and checkbox.
   This is inline content: no dialog semantics, focus trap or new modal.
3. Confirm/cancel: checkbox still gates creation. Tab reaches confirmation then
   Cancel. Cancel and Close restore the initiating button and clear confirmation.
   Focus requests carry the current generation and recheck identity; context
   remount discards them. No timeout or global DOM lookup restores stale focus.
4. Submission/status read: an explicit click moves focus to the persistent named
   region before removing its button. GET-only work now says `Checking the status
   of previously submitted work. No new request is being created.` The decorative
   spinner is hidden from accessibility APIs. Existing polite status remains.
5. Outcome/retry: async completion does not move focus, including when the user
   moves to other work. Review again restores the trigger; fresh confirmation is
   still needed. Status reads cannot fall through into POST; uncertain retry keys,
   actor/tenant/intent receipts, generation fences and safe links are unchanged.

These are keyboard/DOM accessibility assertions, not a claim that a real screen
reader or all WCAG criteria were tested. Native browser focus rendering and the
existing colors/density are preserved; no broad visual redesign was attempted.

## Fresh verification and reproducibility

Installed assets are explicitly resolved from the frozen sibling
`operatoros-workflow-security-integration-nov09`; no installation or graph drift.
This is not a newly materialized candidate dependency graph or full build claim.
The runner retains only OS/runtime environment values, removes provider/DB
credentials, blocks Node networking/listening and aborts nonfixture browser
requests. Chromium uses a closed loopback proxy. No app/API/DB server runs.

From this worktree:

- `node build/lateral-check/prepare.cjs` prepares current TS tests and type config.
- `node build/lateral-check/run.cjs`: **39/39 Chromium cases pass**, zero skipped.
  Includes five new keyboard/focus/status cases plus all 34 existing continuity
  regressions (identity, tenant, payload/version, denial, uncertain retries,
  storage restrictions, safe links, Back/Forward, reload, mobile/desktop).
- `node build/lateral-check/check.cjs`: complete web source plus this test strict
  types pass; component/test zero-warning lint passes.
- `node build/lateral-check/contracts.cjs`: **15/15 DB-free/static contracts pass**,
  zero skipped. These are not PostgreSQL transaction execution.
- `git diff --check`: passes.

Baseline's existing 34 browser cases also passed freshly before editing.
`node build/lateral-check/baseline.cjs` runs the five new assertions against
immutable baseline component bytes from `git show`: **five expected failures**,
zero passes/skips (three missing review focus points, incorrect GET status,
missing retry focus). The baseline checkout is never edited. Exact final source
receipt is retained beside the runner. Initial candidate run caught the unchanged ellipsis-bearing loading line
(38 pass, one fail); the line was corrected and the complete suite rerun. Initial
negative-control setup selected the candidate config, then hit an ESM require
name mismatch; those harness logs remain and are not behavioral evidence.

## Current screenshots and limits

Current-run screenshots live in ignored `build/lateral-check/`:
`review-390-before.png`, `review-1440-before.png`, `review-390.png`,
`review-1440.png`, `recovery-390.png`, `recovery-1440.png`, and
`checking-after.png`. The before/after mobile reviews, desktop review and status
read image were inspected. The review retains visible Cancel/Close/confirmation,
no horizontal overflow at 390px, and the same compact panel. The status image now
accurately describes a read. These render the actual component with synthetic
identity/API data, but without full app font/theme/shell. They do not certify whole
module aesthetics, real screen-reader speech, live SSO or deployment.

Not run: full aggregate build/lint, API/DB integration, providers, payments,
production data, deployed browsers, native devices, production migration or
release. No parity state is promoted. Existing publication outcome reconciliation,
backup/apply/activation, rollback and deployed health gates remain closed.
Rollback is the focused commit revert, with no data migration or dependency work.
