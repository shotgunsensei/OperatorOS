# Resolution Intelligence Phase 4 review

Date: 2026-09-27 UTC. Candidate branch: `codex/techdeck-evidence-documents`.
Scope: completed phases 0–3 and Phase 4 / deterministic Prompt 7, with local
production-artifact verification. This is not target-deployment acceptance.

## Latest commits and prompt sequence

Phase 3 landed through PR #106, merge `307a774`, from implementation `e8930f5`.
Fetched main `c800265` adds only an empty publication marker; its tree is unchanged.
The exact merge release run was cancelled. The later
[main release run](https://github.com/shotgunsensei/OperatorOS/actions/runs/36334015348)
passed 12 of 14 gates, including 31 browser journeys and four visual cases.
API/integration failed because the Phase 3 test used a private database-name
regex that rejected the configured disposable CI database `operatoros_phase21_release`.

Both Phase 3 and Phase 4 tests now call the existing, unchanged root disposable
database validator. A connection-free probe confirms CI's loopback service is
accepted and missing opt-in, non-loopback hosts, persistent database names and
URL connection overrides are rejected. A new candidate CI run remains required.

The persisted [phase/prompt list](resolution-intelligence-implementation-plan.md#12-implementation-phases-and-exit-criteria)
maps Phase 4 to deterministic Prompt 7. The canonical prompt is unchanged. The
complete original multi-prompt attachment is still absent from the repository.
Phase 5 is semantic retrieval; embeddings and AI generation are not active.

## Consistency and source integrity

The new preview, linked drafts and many-to-one source references reuse native
TechDeck documents, revisions and review/approve/publish. No parallel document
store, module auth or schema step was introduced. Storage remains v64/64.

Generation uses bounded normalized evidence with source-revision and JSON-pointer
citations. It preserves failed actions, pending validation, warnings and qualified
causal claims. Missing information stays unknown. Previews persist nothing;
creation requires the current incident version, matching preview hash and audience
acknowledgement. Concurrent duplicate requests converge on one document and never
overwrite technician edits. Each edit, added source and workflow transition saves
a revision. Reprocessed sources preserve earlier content and block further
approval/publication of the stale document.

## Security sweep

Source review and disposable-database regressions cover the new API and all active
generic TechDeck document read/write surfaces. The review checked routes,
workspace aggregation, attachments, references, links, revision history and the
tenant-wide compliance exporter; other active references create ordinary manual
documents or implement schema/import tooling.

- Trusted server tenant/module context, existing role/write guards, internal-only
  access and persistent mutation rate limits remain authoritative. Headless import
  tokens have no document endpoints.
- Every linked source must remain readable before document content, title or
  provenance is returned. Archive/restriction applies immediately on subsequent
  reads, including generic routes. Portal assignments cannot read internal evidence.
- Audience edits cannot broaden below any source. Historical revisions retain
  role filtering. Links filter the other document endpoint before returning it.
- Writes use explicit versions, source/document row locks where linking or creating,
  transactional revisions/audits and actor-scoped idempotency. Cached receipts
  revalidate current access. Foreign IDs receive no record content.
- Preview fields and record counts are bounded, omission is explicit, source HTML
  delimiters are neutralized in the derived plain text, and commands remain inert.
  No external fetch, provider invocation, raw-source mutation or execution occurs.
- Tenant-wide compliance packets omit linked documents and associated document
  activity because they lack per-source reader authority; the manifest declares it.

This is a scoped source review with executable regressions, not a new sealed
Codex Security scan or a claim that all unrelated platform code was audited.
The previous Phase 3 scan and its reproduction limitation remain recorded in the
[Phase 3 review](resolution-intelligence-phase3-review.md).

## Visual and workflow verification

The first production browser run found `/documentation/:id` missing from the
catch-all allowlist despite the route contract accepting it. The canonical path
now resolves alongside its older aliases. No API behavior or authorization gate
was weakened to fix navigation. Production artifacts were rebuilt after the fix.

The second run reached editing and found the full detail response was discarded
when a summary row already existed in the workspace. The editor now prefers the
detail response, retaining source references and revision history. The test's
implicit-label picker selector was also corrected to its accessible combobox role.
Screenshots use page capture to avoid off-viewport fixed elements being pulled
into oversized element screenshots. Assertions still check accessibility and
horizontal overflow without hiding any product elements.

The first aggregate reused the database after focused browser attempts. The
production 10-login/15-minute per-IP limit then rejected the Phase 3 journey with
429. Its failing retry was terminated after confirming the cause; this aggregate
is not acceptance evidence. The new Phase 4 browser identity now uses its own
synthetic private address at the local proxy, matching the existing SSO test
pattern. Production limits are unchanged. Final aggregate verification starts
after resetting only the owned disposable database and applying the root manifest.

The clean final browser suite passes all 32 journeys without skips or retries,
including Phase 2 ingestion, Phase 3 technician/prompt/history/logout and Phase 4
documents. The new journey proves preview without persistence, editing, two
source links, six document versions, review/approval/publication and retained
content after reprocessing. Desktop 1440px and mobile 390px axe and overflow
checks pass, with no page errors. The inherited module layout and navigation
remain consistent. All four final visual cases also pass, with unchanged
baselines/tolerance. Exact commands, environment and counts are in
[implementation status](../IMPLEMENTATION_STATUS.md).

Six synthetic [screenshots](evidence/phase4/README.md) retain the preview, editor,
published document, knowledge library and stale-source warning. They are review
evidence; existing visual baselines and tolerances were not changed.

## Release boundaries

All persistence tests use task-owned, loopback PostgreSQL 16 with synthetic data;
browser verification uses the compiled readiness supervisor and local TLS host
mapping. No production/developer database, live provider or customer incident was
used. Local Node 24/Windows results do not replace Node 20/Linux CI or separately
authorized deployment acceptance. No publication or deployment was performed.
After the passing aggregate, the task-owned disposable container/volume was
removed and all four runtime/proxy ports were confirmed closed. Unrelated
generated CallCommand screenshots were restored. Changes remain uncommitted.

The [document guide](resolution-intelligence-documents.md) describes technician
steps, API contracts, source restrictions and rollback. A rollback must retain the
linked-source guards/export exclusion while these documents remain accessible;
reverting blindly to the pre-feature API would broaden access.
