# Resolution Intelligence data model

Phase 1 / supplied Prompt 2, 2026-09-25. Public name: **Resolution Intelligence**;
internal relationship model: **FixGraph**. This release provides the export
contract and PostgreSQL storage foundation. Import, validation services, search
endpoints, document generation, AI, analytics and UI are subsequent phases.

## Authority and release

The root manifest appends v64 `techdeck_resolution_intelligence_tables` after the
immutable first 63 steps. `db:plan` reviews it without connecting; `db:apply` is
the only supported apply path. It runs under the existing release advisory lock.
Normal production startup calls the read-only catalog verifier and fails closed
when the release is absent. No fixture or customer record is seeded at startup.

`scripts/techdeck/generate-resolution-storage.mjs` owns the checked-in table,
constraint and index definitions. It emits release SQL/catalog expectations and
Drizzle declarations, including named tenant keys, checks and indexes. Deferred
foreign-key timing and the immutable-source trigger are implemented by release
SQL; Drizzle cannot express that timing. Do not use schema push as a substitute.
`corepack pnpm verify:techdeck:resolution-contract` detects generated-file drift
and runs during every production build. There are **27 tables, 435 named
constraints and 38 explicit indexes**, in addition to primary/unique indexes.

All new tables use `techdeck_resolution_`. Existing `tenants`, `users`, shared
Directory organizations/sites, TechDeck assets/tickets/evidence and versioned
documents remain canonical. Imported labels describe observations; they are not
authority and must never silently create or select an identity. No entitlement,
billing, login, credential store, provider, remote runner or organization is added.

## Tables and relationships

| Table suffix | Purpose and important fields |
| --- | --- |
| `incidents` | Tenant-owned incident; optional existing client/site/ticket FKs; external/source IDs, technician/client labels, timestamps, severity, impact, summaries, classification, confidence, closure state, suggested KB title, environment, archive/review/visibility metadata, active revision and optimistic version. Creator/updater reference platform users. |
| `raw_exports` | Immutable accepted UTF-8 JSON text, SHA-256, schema/source type, revision, duplicate fingerprint, normalizer/redactor versions, screening result, validation report and optional human closeout. |
| `incident_assets` | Source asset observations, OS/build, hostname, network addresses and optional existing asset FK. Multiple devices per incident are supported. |
| `symptoms` | Reported, observed or unspecified symptoms, claim kind and confidence. |
| `identifiers` | Exact original and normalized error codes, event IDs, hostname, service, application, port, file/registry path, OS build or error message; optional numeric value/context. |
| `components` | Application, service, vendor, platform, technology or component name and optional version. |
| `root_causes` | Primary, contributing, secondary and not-proven statements; category, confidence and claim kind. |
| `actions` | Diagnostic, corrective, failed, successful, recovery and final actions; source sequence/time, purpose, expected/actual result, outcome, success, failure/error/side-effect/lesson evidence, source and reviewed risk, elevation and destructive flags. |
| `commands` | Exact accepted command text and separate screened search text; incident versus recommended-future source, language/type, sequence, results, success and risk metadata; optional action FK. Storage never enables execution. |
| `side_effects` | Triggering action -> observed effect -> recovery action, including original source descriptions, recovery status, confidence and qualified causal status. |
| `evidence_links` | Source evidence IDs/times/type/location, value text/numeric value/units, confidence and optional existing evidence FK. |
| `changes` | Before/after observations, target, reason, time/sequence, reversibility and rollback description; optional action FK. |
| `validations` | Performed, successful, failed and pending checks, with confidence and claim kind. |
| `followups` | Action/priority/source owner and due label, optional normalized date/platform assignee, completion time. |
| `warnings`, `lessons`, `escalation_conditions` | Separate retrievable statements with provenance; warnings may reference a side effect and risk. |
| `automation_opportunities`, `automation_steps` | Nonexecuting idea/draft/review state, trigger, reported time estimate, inputs, diagnostic logic, safe suggestions, approval-required actions and risks. `execution_enabled` is constrained to false. |
| `ip_opportunities` | Reusable-IP observations with provenance and confidence. |
| `quality_notes` | Missing information, conflicts and assumptions remain explicit records. |
| `document_links` | Existing TechDeck document AND exact revision, classified as KB, runbook or command reference. No parallel publishing system. |
| `artifact_references` | Source references and descriptions only; no arbitrary URL fetch or attachment execution. |
| `tags` | Original/normalized tag, unique within tenant/incident/revision. |
| `search_documents` | Screened, versioned section projections, source pointer/hash, stored weighted `tsvector` and GIN index. No search endpoint yet. |
| `nodes`, `relationships` | Typed FixGraph nodes targeting real normalized rows and constrained relationship pairs; optional supporting evidence, score and algorithm version. |

Each child row includes tenant, incident, source revision, JSON Pointer, creator
and creation timestamp. Child provenance uses a composite FK to its immutable
source revision. Action, recovery, evidence and node links must match that same
tenant/incident/revision. The active incident revision is also a composite FK.
These FKs are deferred where insertion of source and children needs one atomic
transaction. No partially imported record may be committed by the future service.

Incident deletion cascades source revisions and their children. Retention/delete
authorization and audit belong to the later service; this release adds no delete
endpoint. A platform user deletion can clear creator attribution without rewriting
source evidence. All other updates to a raw export fail with SQLSTATE 23514.

## Export contract and complete source mapping

Canonical text is stored in `docs/prompts/MSP_RESOLUTION_CLOSEOUT_PROMPT.md` and
`MSP_RESOLUTION_CLOSEOUT_SHORTCUT.md`. Formal draft-07 JSON Schema lives beside
this document in `machine-evidence-export.schema.json`. The contract generator
packages the text/template for the compiled API and exports SDK schema/types.
Runtime code does not require the repository docs directory to be deployed.

Version `1.0` requires all 24 top-level sections. Nested fields are optional and
known scalars may be null; unavailable data stays unknown. No boolean or numeric
coercion is permitted. Confidence, outcome, risk and closure values are bounded
enums. Known arrays cap at 2,000 items, strings at 100,000 characters and objects
at 500 properties. Ingestion must additionally enforce byte/depth/aggregate limits
before parsing and after decoding. Database text caps are bytes, so ingestion
must report over-limit multibyte values rather than truncate them. Unknown fields
are preserved only in the screened source and must not become privileged metadata.

The following is the normalization contract for the next phase; a normalizer is
not implemented by this storage release. Every original field remains in raw text.

| Source section | Projection |
| --- | --- |
| `schema_version`, `export_type` | Raw envelope constraints; schema version on each revision. Export type must be `msp_incident_closeout`. |
| `incident` | Source/external IDs, labels, title, opened/closed times, status, severity and impact -> incident. Trusted tenant/creator/client/ticket links come from the authorized request, never these labels. |
| `affected_assets` | All observed identity/OS/address/role fields -> incident assets; extracted exact identifiers may also reference each source pointer. |
| `environment` | Domain/tenant/network/location and original arrays -> incident environment observation JSON; application/service/vendor arrays also become components. Source `tenant` never selects tenant authority. |
| `issue` | Summary and first observation -> incident; all three symptom lists -> their distinct symptom kinds; errors/events/messages -> identifiers; affected components -> components. |
| `evidence` | Every evidence item -> evidence links; source IDs remain labels; numeric values retain units and exact source text in the raw revision. |
| `diagnostics` | Each action -> diagnostic action with all supplied timing/purpose/results/outcome/risk; nonempty command -> incident command linked to that action. |
| `commands_scripts` | Exact script/language/type/sequence/purpose/result/success/risk flags -> commands; screened search projection kept separately. |
| `changes_made` | Each change -> changes; nulls stay unknown; scalar before/after textual projections preserve their typed originals in source. |
| `failed_actions` | Failed action plus reason/error/side-effect/lesson; no failure is dropped when a later action succeeds. |
| `successful_actions` | Successful action, actual result and source evidence text; a source success statement is not automatically a confirmed conclusion. |
| `side_effects` | Effect with source trigger/recovery labels and recovered flag; link normalized actions only when supported, otherwise retain unresolved labels. |
| `root_cause` | Summary/category/confidence -> primary cause and incident confidence; factors/secondary/not-proven -> separate cause kinds. Evidence statements -> evidence links and supported graph references. Not-proven remains unverified/hypothesis. |
| `resolution` | Summary/permanent fix/workaround -> incident; final actions -> final action records. |
| `validation` | Four arrays -> four distinct validation kinds. Pending is never converted to success. |
| `current_status` | All six closure/remediation/functionality/monitoring/follow-up fields -> incident; source YES/NO map to booleans only when explicitly present. |
| `follow_up` | Action/priority/owner/due -> followups; invalid/ambiguous dates keep source labels rather than fabricated timestamps. |
| `classification` | Category/subcategory/cause/recurrence/flags -> incident; platform/application/service/technology -> components; tags -> tags. |
| `automation_opportunity` | Candidate/name/trigger/estimate -> opportunity; inputs/logic/safe/approval/risk arrays -> distinct step kinds. Estimates are source claims, not measured technician time. |
| `knowledge` | KB title and one-line resolution -> incident; warnings, lessons, escalation and IP arrays -> their respective tables. Later generated documents use existing versioned document links. |
| `artifact_log_references` | All supplied fields -> artifact references. |
| `security` | Suspected incident/notes -> incident. Source credentials-present/redacted flags remain untrusted source assertions; they cannot set server screening success. |
| `data_quality` | Overall confidence -> incident; missing/conflicting/assumption lists -> distinct quality notes. |

## Trust, screening and access

`raw_text` is bounded to 1 MiB, validated as the versioned JSON envelope and
checksummed in PostgreSQL. Optional human text is also capped at 1 MiB. Ordinary
text columns cap at 100,000 bytes. Duplicate identity is unique per
`(tenant_id, fingerprint, normalizer_version)`; another tenant can independently
retain identical evidence. Reprocessing uses a new revision and normalizer
version instead of modifying the old source.

ADR-0013 prohibits ordinary credential storage. The future intake service must
screen the complete raw JSON, unknown extensions and optional human report, reject
secrets before persistence, then derive screened projections. Accepted input is
preserved untouched. `security_screened=true` is a required server attestation;
the database cannot detect arbitrary secrets and JSON Schema is not a scanner.
No import route is exposed in this phase, so there is no user-facing path that
can bypass an unimplemented scanner.

Imported text is untrusted data, never instructions to an AI or command runner.
Original command text is evidence, and safe-action labels are source claims.
The automation table cannot enable execution. Roles, tenant selection, module
entitlements, visibility changes and all audit events remain server-owned.

The existing application uses tenant-qualified services and guards rather than
per-request PostgreSQL RLS roles. This phase adds composite tenant constraints,
not a new RLS identity model. The database tests prove referential isolation;
they do not prove future route authorization. Before any API is exposed, enforce
tenant membership + TechDeck entitlement + read/write role and incident visibility
for every list/detail/raw/graph/search/document operation. Search must join the
current incident ACL and active revision; a stale projection must not widen access.

## FixGraph and search

Nodes have exactly one typed target in their own incident revision, except an
incident node whose owner is its target. FKs prevent dangling/wrong-type targets.
Edges constrain source/target pairs: `INDICATES`, `ASSOCIATED_WITH`, `RESOLVED`,
`FAILED_FOR`, `CAUSED_SIDE_EFFECT`, `FOLLOWED_BY`, `RECOVERED_BY`, `AFFECTS`,
`SIMILAR_TO`, `OCCURRED_ON`, `GENERATED`, `SUGGESTS_AUTOMATION`, `SUPPORTED_BY`.
Cross-incident relationships may target only the same tenant. Self-links fail.

Claims distinguish reported fact, supported conclusion, hypothesis, unverified
and pending validation. `CAUSED_SIDE_EFFECT` additionally requires a supporting
evidence link, supported-conclusion claim and HIGH or CONFIRMED confidence.
Observed succession uses `FOLLOWED_BY`. The CAM fixture records a temporal
service/Wi-Fi association on one synthetic endpoint, not a universal dependency.

Indexes cover recent/client/ticket histories, per-incident children, linked assets,
lowercased hostname, exact normalized identifiers, components/services, tags,
action outcome, document links and both graph endpoints. The search projection
weights title A and screened section content B using English PostgreSQL FTS; root
cause and other prose belong in section projections. Hex errors, paths and event
IDs use exact identifier lookup rather than relying on linguistic tokenization.

Vector storage/provider activation is deliberately deferred as specified in the
reviewed plan: no installed extension/provider contract was verified. This phase
does not add fake vectors, an embedding API or a semantic-search claim. Later
embedding rows must bind tenant, incident revision, screened content hash,
redactor version, provider/model, dimensions and authorization before indexing.

## Migration, rollback and verification

No new environment variable or third-party secret is required. Use the current
platform database configuration and supported apply flag. Both Replit development
and production databases must be reviewed/backed up and separately converged to
v64 before publication. Keep apply mode absent from the serving environment.
Reject any Replit proposal to drop the new schema. See
[the backup/restore runbook](../DATABASE_BACKUP_RESTORE.md).

The release adds tables, constraints, indexes and the source immutability trigger;
it does not modify existing customer rows. Reapplying preserves accepted sources.
The application can roll back to the prior code while additive tables remain.
Data rollback means restoring the reviewed pre-release backup into a new database,
verifying identity/tenant/billing/module counts and switching traffic after approval.
There is no destructive down script against the shared database.

The synthetic fixture `apps/api/test/fixtures/techdeck-resolution-cam-wal-v1.json`
contains no real customer/device identity and is used only by tests. It preserves
exact supplied file sizes, error codes, failed rename, temporal Wi-Fi side effect,
recovery, qualified warning and pending post-update validation. It invents no
command transcript, precise time or measured savings. It is not the later private
production incident import.

Tests cover canonical/generated drift, actual Drizzle metadata, null-heavy and
bounded schema validation, unknown/unicode fields, idempotent migration, two
tenants, duplicate rollback, composite FKs, immutable/checksummed source,
failed/recovery/causal graph constraints, nonexecuting automation, exact/FTS query
projections and read-only detection of missing schema objects. The dedicated
database tests are included in both the API inventory and required integration
apply/reapply gate. Exact commands, counts and release evidence are recorded in
[implementation status](../IMPLEMENTATION_STATUS.md).
