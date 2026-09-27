# TechDeck Phase 3 consistency, visual and security review

Evidence date: 2026-09-27 UTC. Branch: `codex/techdeck-resolution-workspace`.
This is local implementation evidence, not a production deployment approval.

## Latest changes and prompt list

The clean starting branch was `main` at
`0c74dc5661e9ce178954f1cd9bb0adff7502e164`, confirmed against fetched `origin`.
[PR #105](https://github.com/shotgunsensei/OperatorOS/pull/105) merged the Phase 2
ingestion implementation (`ce69284`). Its exact merge
[release gate failed](https://github.com/shotgunsensei/OperatorOS/actions/runs/36296556974)
in the source-secret scanner: the negative validation test contained a complete
synthetic private-key header. The fixture now assembles the identical rejected
input from two strings; the scanner and validator remain unchanged. Fresh local
hardening passes. The separate
[Torque native run passed](https://github.com/shotgunsensei/OperatorOS/actions/runs/36296556928).
The earlier report's local green gates did not establish green merge CI.

The persisted prompt list is
[implementation plan section 12](resolution-intelligence-implementation-plan.md#12-implementation-phases-and-exit-criteria).
The full original multi-prompt attachment is absent from the repository.
The [canonical prompt](../prompts/MSP_RESOLUTION_CLOSEOUT_PROMPT.md) remains
13,112 LF-normalized UTF-8 bytes, SHA-256
`3d0283064bcb14240d229d94c096d6dc897a2fd5a2d12b323bf78b88df9c2004`.
Its [shortcut](../prompts/MSP_RESOLUTION_CLOSEOUT_SHORTCUT.md), example template
and formal schema remain distinct packaged assets.

This continuation implements **Phase 3 / Prompt 4 + exact/full-text portions of
Prompt 5 + Prompt 10**. Phase 4 is next: evidence-derived, linked versioned
KB/runbook drafts through the existing review/publication flow. Semantic search,
AI research, analytics, execution and private real-incident import remain later
phases. Existing source-migration parity counts are unchanged.

## Consistency sweep and corrections

- Kept the v64 manifest and normalize-v1 immutable source contract. No migration,
  extension, provider, secret store or independent identity authority was added.
- Implemented native incident list/detail, 22 evidence sections, revision history,
  audited administrator raw download, exact/full-text search, related evidence,
  real summary counts, native link choices, optimistic review/visibility edits
  and archive. The headless scope remains import-only.
- Added both module-host and embedded routes, prompt/settings alias, TechDeck
  navigation, client/device incident-history links and contextual help.
- Import preview remains nonpersistent; accepted import requires a source review
  acknowledgement and explicit confirmation. Native client/site/device/ticket
  links are selected explicitly and checked again by the server.
- Warnings and pending validation precede reported resolution; failed attempts,
  side effects and source pointers remain visible. Commands are inert source
  text with copy controls, no execution or implied approval.
- Corrected list cursor precision to preserve PostgreSQL microseconds, preventing
  skipped incidents created within one millisecond.
- Added an authorized safe-document compatibility match for contextual ports in
  normalize-v1 imports. Bare numeric values are not guessed to be event IDs.
- Split `canDownloadRaw` from `canManage`, matching administrator module-reader
  access without granting write or reprocess permission.
- Restricted owner-only visibility choices to owners and clear the displayed
  evidence after a confirmed archive. Both actions retain server authorization.
- Exposed the 8,000-character full-text prefix limit in the search response/UI;
  up to 100 exact identifiers are extracted from the bounded submitted text.
- Removed the floating contact overlap on TechDeck mobile widths while retaining
  the shell Help control. No unrelated module layout is changed.

## Security sweep

Codex Security immutable diff scan
`be7e35ab-faa2-42ea-ba76-2a800efda826` completed against the pre-correction snapshot
`codex-security-snapshot/v1:sha256:6faa1c73f19d9edc5cec52bfb93a1683e74eb3b41dd52441a35ad227177283a9`.
The managed report is stored outside the repository under the user's Codex
Security scan directory, ending in
`0c74dc5661e9ce178954f1cd9bb0adff7502e164_20260927T054214Z_i8prgp9a/report.md`.
It reviewed all 20 changed source inventory entries, supporting authority paths,
and supplemental API tests/SBOM. No scoped SECURITY.md applied.

The scan retained four medium, source-validated resource-exhaustion findings:
overlapping event-ID whitespace, overlapping port whitespace, unbounded basename
suffix scans, and unanchored trailing punctuation trimming. The authenticated
100KB diagnostic-search path made these relevant to shared API availability.
An automated safety filter blocked the delegated isolated reproduction attempt
before a PoC ran. Runtime duration and deployment-wide impact were not measured;
the report does not claim a reproduced outage.

Subsequent corrections bound/disjoin numeric context separators, consume maximal
tokens once before bounded checks, and replace punctuation regex trimming with
a bounded reverse loop. An independent read-only follow-up confirmed removal of
all four source mechanisms and found no additional security concern in the
corrected paths. This follow-up is separate from the sealed immutable report;
the report's findings are preserved as the pre-fix record.

The follow-up also checked that the port fallback uses only materialized
authorized incidents and active same-tenant search documents; all values remain
bound SQL parameters. Raw downloads retain administrator authority, incident
visibility and transactional audit. Module-viewer grants remain read-only.
Tenant/role/archive/revision restrictions precede snippets, counts, scores,
related targets and source history. Evidence is React text, not executable HTML.
No external URL is fetched and no source command is executed.

## Visual and verification evidence

Final browser and regression results are recorded in
[implementation status](../IMPLEMENTATION_STATUS.md). Initial browser assertions
were corrected to use the fixture's lowercase `camsvc` warning and to add an
explicit synthetic, non-executed command observation for copy-control coverage.
The original source fixture remains unchanged. Clipboard permissions are explicitly
granted for the local browser test; the product retains its unavailable-clipboard
fallback. Review controls are selected by their accessible combobox role, and
logout is issued as a real same-origin browser request with normal origin checks. UI screenshots use synthetic
tenant evidence only. No customer data, credentials or test environment files
are committed.

An intermediate broad run recorded 29 browser passes and two failures: the
new test's non-browser logout request lacked origin context, and the existing
TorqueShed login received 429 after accumulated local authentication attempts.
The logout test was corrected to use same-origin browser fetch. The subsequent
broad run started after the task-owned schema reset; rate-limit policy remains intact.
The intermediate visual suite passed all four cases with existing baselines and
the unchanged 0.005 pixel-difference tolerance.

That subsequent broad run passed 30 browser journeys and all four visual cases;
the new journey reached its last assertion, where the separate Playwright
request client returned 404. Unlike Chromium, that client does not inherit the
canonical-host loopback resolver. The assertion now uses same-origin browser
fetch against the summary endpoint, avoiding both an external DNS lookup and
the archived incident's independent 404 semantics. It also verifies host-only
cookie removal and the exact session fingerprint's local-logout revocation row.
The corrected full technician journey passed in 20.2 seconds with no failure,
retry or skip, using the unchanged compiled production artifacts. No runtime
authorization was weakened to satisfy a test. The broad failed aggregate and
the separate passing correction remain distinct evidence.

Final supporting gates passed: 14 focused workspace tests, 52 unit tests,
1,575 full API tests, 90 clean-database integration tests, production
build/typechecks, core preflight, v64 database plan, route integrity, 13 static
visual contracts and phase39 hardening. See implementation status for exact
commands, environment and logs. The technician journey's desktop/mobile axe
audits and horizontal overflow assertions passed. Manual review confirms the
existing dark/cyan TechDeck identity, visible evidence warnings, usable controls
at 390px and no floating Help overlap on the mobile workspace.

These nine screenshots contain only the final passing journey's synthetic data:

| Surface | Desktop evidence | Mobile evidence |
| --- | --- | --- |
| Import and nonpersistent preview | [Desktop](evidence/phase3/import-desktop.png) | [Mobile](evidence/phase3/import-mobile.png) |
| Incident detail and evidence | [Desktop](evidence/phase3/detail-desktop.png) | [Mobile](evidence/phase3/detail-mobile.png) |
| Exact search and warnings | [Desktop](evidence/phase3/search-desktop.png) | [Mobile](evidence/phase3/search-mobile.png) |
| Revision history / audited raw download | Covered by browser journey | [Mobile](evidence/phase3/history-mobile.png) |
| Canonical prompt / distinct template and schema | [Desktop](evidence/phase3/prompt-desktop.png) | [Mobile](evidence/phase3/prompt-mobile.png) |

## Operational boundaries

All database-backed work uses the task-owned disposable PostgreSQL 16 container
`operatoros-resolution-phase3-disposable` on loopback 55466, database
`operatoros_resolution_phase3_test`. Integration applies and reapplies the root
manifest on its isolated schema. Production browser checks use the compiled
readiness-gated supervisor and canonical-host loopback TLS proxy.
No production database, child source migration, live provider, deployment, push
or publication was performed. Candidate CI and target deployment acceptance
remain separate gates; this feature is not declared production-ready.

After verification, the task-owned container/volume and browser runtime were
cleaned up. Only the selected TechDeck screenshots were retained; unrelated
CallCommand screenshots generated by the broad suite were restored.

Rollback of this application-only phase requires reverting its application
artifacts; v64 accepted source remains compatible with the earlier ingestion
service. No destructive down migration or source deletion is required. Any
production release or restore still follows the repository's separate approval
and backup requirements.
