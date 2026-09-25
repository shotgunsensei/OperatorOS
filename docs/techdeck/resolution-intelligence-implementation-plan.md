# TechDeck Resolution Intelligence implementation plan

Status: **PLAN COMPLETE; PHASE 1 STORAGE IMPLEMENTED; WORKFLOW PHASES OPEN**

Phase 1 continuation (2026-09-25): the user's review/continue instruction authorized
Prompt 2. The formal export contract, typed storage and FixGraph foundation are
implemented in release v64. See [the implemented data model](resolution-intelligence-data-model.md)
and [fresh verification](../IMPLEMENTATION_STATUS.md). The audit below records the
v63 starting state; its proposals are not claims that ingestion, UI, search or AI
are available. Vector work remains deferred as described below.

Prepared: 2026-09-25. Repository inspected: `C:\Dev\OperatorOS`, clean starting
`main` at `994308311c702d67b6e4047748e07ccb3d7c6fbd` (PR #103 merge).
Working branch: `codex/techdeck-resolution-intelligence-plan`.

The original audit delivered Prompt 1 of the supplied sequence. Prompt 1 says **“Do not
implement yet.”** Prompt 2 begins **“After reviewing Prompt 1's plan.”** The
canonical prompt and shortcut are saved now; database, API, UI, provider, and
real-incident work below are proposals for subsequent phases. No production
database, provider, customer record, or deployment was accessed for this audit.

Public product name: **Resolution Intelligence**. Internal engine: **FixGraph**.
OperatorOS continues to own identity, tenant authority, subscriptions,
entitlements, audit, and provider configuration. Resolution Intelligence is a
TechDeck subsystem, not another application or separately billed module.

## 1. Recommended production-quality V1

Deliver one complete technician workflow: **validate an incident export, review
the import, save it, search it, inspect its evidence and warnings, and create a
linked draft procedure**. A second authorized technician in the same tenant can
retrieve it; another tenant and unauthorized roles cannot.

V1 includes:

- The canonical prompt, memory shortcut, downloadable template, formal schema
  version 1.0, and a working TechDeck AI Integration page.
- Paste/API ingestion with bounded validation, secret screening, duplicate
  handling, immutable accepted source, normalized records, and transactional audit.
- Exact identifiers, PostgreSQL full-text search, structured filters, deterministic
  match explanations, and simple evidence-backed FixGraph relationships.
- Incident detail with source attribution, chronology, successful and failed
  actions, adverse effects and recovery, warnings, confidence, commands, pending
  validation, escalation, and reusable-IP/automation notes.
- Links to existing clients, devices, tickets, and versioned TechDeck documents.
  Unmatched names remain source observations until an authorized technician links
  them; import never silently creates a customer, device, or user.
- A deterministic closeout view and draft KB/runbook assembled from supplied
  evidence, using existing document review/publication. Missing sections remain
  explicitly unknown. No AI conclusion is invented during import.
- Recent incidents, actual counts, and filters that also provide client/device
  histories. A synthetic CAM WAL fixture proves failure-intelligence retrieval.

Semantic search, grounded AI synthesis, multi-incident automation mining, and
advanced analytics follow this usable foundation. They remain required later
phases, not capabilities claimed by V1. V1 must work when every AI provider is
disabled. There is no remote execution, automatic remediation, automatic public
sharing, email parsing, or PSA/RMM connector activation in V1.

Commercial recommendation: include the core research workflow under existing
TechDeck access. Meter later paid AI activity through OperatorOS usage controls;
do not add a price, subscription, or unlimited AI allowance in module code.

## 2. Repository architecture analysis

The audit covered root tooling/deployment, active applications/packages, platform
contracts, TechDeck persistence/routes/UI, shared services, and test orchestration.
Imported child source was treated as read-only migration evidence, not a runtime
or migration authority. This is a subsystem design audit, not a line-by-line
security review of every unrelated module.

| Area | Observed source and consequence |
| --- | --- |
| Workspace | pnpm `10.34.5`, `pnpm-workspace.yaml` includes `apps/*` and `packages/*`. `apps/modules/*/source` is outside the active workspace. Root legacy Express/Vite dependencies do not identify the active runtime. |
| Web | Next.js App Router (`^15.5.24`), React 18, TypeScript; `apps/web/src/app`, host-aware `middleware.ts`, and shared module shells. |
| API | Fastify 5 in `apps/api/src/index.ts`; TechDeck registration is composed through `routes/module-shell-routes.ts`. Parameterized Drizzle/SQL services are the existing convention. |
| Database | PostgreSQL through `pg` Pool and Drizzle in `apps/api/src/db.ts`; tables/types in `apps/api/src/schema.ts`; ordered idempotent SQL initializer functions. CI provisions PostgreSQL 16. Actual provider extension availability was not queried. |
| Supabase | No active Supabase client, auth authority, or migration path found. Supabase references in the publish subsystem detect other projects; they are not OperatorOS persistence. Do not introduce Supabase auth or a second database. |
| Auth | `lib/auth.ts`, `tenant-auth.ts`, `tenant-entitlements.ts`, platform RBAC, and SSO v1. Central credentials, host-only sessions, exact-host opaque one-use PKCE handoffs; no module login. |
| Tenancy | `tenants`, `tenant_users`, `tenant_modules`, `tenant_user_module_access`; resolved request context is authority. Source tenant roles include `viewer`, `member`, `admin`, `owner`; module grants include `viewer`, `user`, `manager`. Platform authority is explicit. |
| Client identity | Shared `directory_organizations`, sites, contacts and `techdeck_managed_client_profiles`; `shared-customers.ts` projects the directory. A managed client is not a second security tenant. |
| Authorization | TechDeck `readGuards = [requireTenantMember, requireTenantModuleAccess('techdeck')]`; write adds `requireTenantModuleWriteAccess`; admin adds `requireTenantAdmin`. Viewer tenant access permits GET/HEAD only. Use these guards plus record visibility, not browser labels. |
| Audit | Existing `activity_feed`, `lib/audit.ts`, and shared `recordActivity` / activity-event services. Existing document mutations write audit in transactions. Reuse platform audit infrastructure. |
| API shape | Native `/v1/modules/techdeck/*`; browser same-origin `/api/modules/techdeck/*`; errors expose safe codes/fields, not stack traces. Foreign record IDs return 404. Mutations use versions/idempotency where needed. |
| Headless API | `shared_service_identities` / hashed scoped tokens already exist; TechDeck has `/v1/headless/techdeck/tickets` and `/evidence`. Extend central scopes for import instead of inventing module API credentials. |
| AI | `ai-provider.ts` implements completion providers; `shared-provider-adapters.ts` wraps status and completion. Existing `/itops/query` is documentation-only guidance, not incident retrieval or a grounded research engine. |
| Search | `shared-platform-control-plane.ts` indexes title/summary/reference/deep-link data and performs bounded `ILIKE`; this is neither PostgreSQL FTS nor semantic search. No active `tsvector`, embedding generation, pgvector/HNSW/IVFFlat integration was found in the audited runtime. |
| Jobs | `shared-background-jobs.ts`, `shared-service-worker.ts`: durable tenant/module jobs, deduplication, leases, retries and dead-letter state. Suitable for embedding and later AI jobs. |
| UI | `TechDeckShell.tsx`, `TechDeckRoute.contract.ts`, `ModuleApplicationShell`, dark compact cyan theme, `TechDeckOperations`, `TechDeckTicketQueue`, `TechDeckLiteralConsole`, shared customer selection. |
| Tests | Node `node:test`/assert with `tsx`, DB-backed Fastify injection suites, source contracts, Playwright exact-host/browser/visual/accessibility checks. Root release orchestration and Linux Node 20 CI already exist. |
| Deployment | `.replit`: public Next port 5000, private API port 5001, readiness-gated `scripts/start-unified-runtime.mjs`. Autoscale serving verifies the database; approved release apply is separate. Standalone runner is not the public application. |

### Authority and documentation reconciliation

Read the current SSO/integration contracts, consolidation/status/parity reports,
acceptance/readiness reports, `PLANS.md`, database backup/restore guide, release
gate, ADR index, and TechDeck credential/remote-action ADRs. Their older snapshots
have different evidence dates. Current source has **release v63, 63 steps**, ending
in `auth_security_controls`; older v29/v35/v60 records are historical.
`docs/CURRENT_RELEASE_GATE.md` records v63 production evidence dated September 22;
this audit did not re-verify production. Local main includes PR #103; that fact is
not live deployment evidence.

One documentation mismatch must remain explicit: `AGENTS.md` says no lint script
exists, but current `package.json` defines `lint`, `eslint.config.js` defines its
limited syntax/safety rules, and `run-release-gate.mjs` calls it. Use the observed
command and report its actual result; do not imply full framework lint coverage
or a formatting pass. No repository formatting script was found.

## 3. Reuse map and boundaries

| Existing asset | Intended reuse | Required extension or limitation |
| --- | --- | --- |
| `schema.ts`: users/tenants/membership/grants | Actor and security context | Imported technician/organization strings are source labels, never trusted authority. |
| Directory organizations/sites/contacts and managed-client profiles | Client history and picker | Tenant-composite FKs and active-reference checks; no second clients table. |
| `techdeck_assets` | Device link and history | Many assets per incident via a join; retain incident-time observations independently of today's asset values. |
| `techdeck_tickets` and comments | Optional ticket link | Imported external ticket IDs are separate from native ticket IDs. Do not auto-close a ticket on import. |
| `techdeck_documents`, revisions and document links | KB/runbook content, review/approval/publication | Add incident-document provenance links. Existing `pageType` supports knowledge/procedures; no parallel KB editor or publishing store. |
| `techdeck_runbooks` | Existing command/runbook references | Preserve compatibility. The current operations UI uses document workflows for runbooks; new incident procedures should use versioned documents. |
| `techdeck_evidence`, attachment/file-link services | Evidence observations and authorized files | Add incident-source mapping and typed measurement/provenance fields where needed. Do not fetch arbitrary imported URLs/paths. |
| Configuration relationships | Existing device topology | Keep separate from new incident reasoning edges; one does not replace the other. |
| Shared activity, usage, jobs, flags | Audit, future costs, retries, rollout | Pass trusted tenant/module/actor context; job payloads carry IDs, not raw incident text. |
| Shared search | Possible future platform discovery | Current query receives tenant but not record-role visibility. Do not publish sensitive incident titles/snippets into it until equivalent module/record authorization is enforced. V1 uses its own authorized search projection. |
| Shared AI completion adapter | Later research/KB assistance | Add a distinct embedding interface; completion availability does not prove embedding capability. |
| `shared-secret-vault.ts` | Existing server encryption knowledge | Its secret-reference API is bounded to 2,000 characters and has a specific key lifecycle. It is not a general raw-evidence vault; do not repurpose it without a reviewed design. |
| `sanitizeSharedMetadata` and `techdeck-ops.ts` | Safe audit metadata and existing input rules | Key-name filtering/HTML sanitization does not detect all secrets in arbitrary logs or commands. Add incident-specific recursive value scanning and safe projections. |
| Shell route helper `hrefFor` | Links on canonical host and local fallback | Never hardcode `/techdeck/...` or bypass the existing deep-link allowlist. |

## 4. Canonical export and ingestion contract

The exact supplied prompt is [MSP_RESOLUTION_CLOSEOUT_PROMPT.md](../prompts/MSP_RESOLUTION_CLOSEOUT_PROMPT.md).
The exact shortcut is [MSP_RESOLUTION_CLOSEOUT_SHORTCUT.md](../prompts/MSP_RESOLUTION_CLOSEOUT_SHORTCUT.md).
Neither document grants an external AI access to tickets or stores a memory in
another service. They are reusable instructions that the user can copy.

### Formal schema work required

The supplied JSON is a versioned example payload, not an executable JSON Schema.
Phase 1 must define the formal contract without silently editing the canonical
prompt. Use schema version `1.0`, export type `msp_incident_closeout`, typed
nullable scalars, bounded arrays/strings/objects, and the specified confidence,
outcome and risk vocabulary. Unknown additional fields are retained only in the
screened raw source and reported as warnings; normalization uses explicit fields.

- Require the envelope and the documented object/array sections. Missing identity
  or timestamps may be null; missing required structure is an actionable error.
  Missing optional nested fields become null/empty with a data-quality warning.
- The example contains null-only array objects. Preserve raw content, warn and
  omit empty placeholders from normalized facts; do not create fake assets/actions.
- Preserve exact strings alongside normalized identifier values. Parse only
  supported numeric/size/time representations and keep original units/text.
  Reject ambiguous duplicate JSON keys, excessive depth, invalid Unicode/NUL and
  unsafe numeric values rather than silently changing evidence.
- Do not turn `destructive: false` in an AI-generated export into a safety
  approval. Imported assertions and reviewer decisions are separate fields.
- Root-cause confidence and claim type are different: store confidence plus
  `reported_fact`, `supported_conclusion`, `hypothesis`, `unverified`, or
  `pending_validation`. A supplied `CONFIRMED` is an attributed source assertion,
  not an independent platform certification.
- Free-text side-effect/action references do not guarantee identity. Link only
  unambiguous source references; preserve unresolved edges with warnings for
  review. Never use an LLM or fuzzy matching to assert causation during import.

### Original source versus secret redaction

ADR-0013 forbids storing ordinary credential values in TechDeck. V1 therefore
screens **all** input, including unknown keys, before any persistent write,
request logging, search indexing, job enqueueing, or provider call. A detected
password/token/private key/recovery key/credentialed URL/connection string causes
a safe validation rejection. Return field paths, expected type, severity and a
redacted value preview; never echo a detected secret. The technician redacts and
resubmits. Accepted input is the untouched original of that accepted submission;
the rejected credential-bearing input is never archived. This decision is a
deliberate V1 constraint for review, not a claim that regexes guarantee detection.

Persist accepted raw UTF-8 bytes (or exact decoded text) and a byte checksum
separately from parsed query data. PostgreSQL `jsonb` changes formatting/order
and loses duplicate keys, so it alone cannot satisfy untouched source retention.
See [PostgreSQL JSON storage behavior](https://www.postgresql.org/docs/16/datatype-json.html).
Use restricted, audited raw download; raw is excluded from default list/detail,
general search, analytics, provider prompts and embeddings. A future requirement
to retain secret-bearing evidence needs a separate approved storage/key-custody,
retention, reveal-audit and incident-response ADR. The existing reference vault
does not by itself resolve that requirement.

Build separate redacted projections for display/search and a more restrictive
embedding projection that replaces customer/person/device identifiers where not
needed for meaning. The raw checksum, normalization version, redactor version
and source JSON pointer tie every extracted record to its origin. Raw retention
and backup access must be reviewed before real customer import.

### Transaction and idempotency

1. Authenticate, resolve tenant/module, check write access and ingestion limits.
2. Bound input; scan/parse/validate/version-check; return safe preview with no write.
3. Revalidate on import; do not trust a browser-generated preview or counts.
4. In one database transaction write accepted raw source, incident revision,
   normalized rows, explicit relationships, safe search document and audit event.
5. Where enabled later, enqueue a shared embedding job in the same transaction.
   Import success and embedding availability are separate results.

An optional human closeout report can accompany the machine export in the import
envelope. Apply the same limits, secret checks and source retention rules; keep it
distinct from the machine JSON. V1 does not extract new facts from that prose.
The generated 17-section closeout view identifies whether text was supplied,
assembled from structured evidence, or is unknown.

Keep a semantic fingerprint over canonicalized validated input (including
unknown fields) plus a separate original-byte checksum. Use a tenant-scoped
unique fingerprint to prevent concurrent duplicate incidents; do not return
whether another tenant has the same content. Keep idempotency-key/body binding:
same key with a changed body returns 409. Preserve sequence/array order when
fingerprinting. External ticket ID alone is not a unique incident identity.

An explicit reprocess request supplies the existing incident and expected
version. Append a raw/revision record; never overwrite the historical raw source
or reviewed KB. Activate the new normalized revision atomically and invalidate
old search/embedding revisions. Readers see one coherent revision. Retried jobs
reload the active revision and authorization; deleted/restricted records cannot
reappear through delayed indexing.

## 5. Required database changes and FixGraph foundation

All names below are **proposed**. Use the `techdeck_resolution_` prefix to make
ownership explicit. Match existing varchar(36) IDs, tenant keys, server actor
references and version fields; new event timestamps use `TIMESTAMPTZ`.

| Proposed table(s) | Queryable information and references |
| --- | --- |
| `techdeck_resolution_incidents` | Tenant, native ticket/client/site refs, source external ticket ID, title, severity, impact, opened/closed times, source status, platform review status, summary, one-line resolution, closure/validation states, confidence, minimum role, active revision, archive/version/audit fields. Imported dates stay nullable. |
| `techdeck_resolution_raw_exports` | Incident and revision, immutable accepted bytes, parsed JSON where valid, checksums/fingerprint, schema/source/normalizer versions, importing actor, timestamp and validation/redaction report without secrets. |
| `techdeck_resolution_incident_assets` | Many-to-many links to existing assets, with original incident-time device observations; no duplicate asset identity table. |
| `techdeck_resolution_symptoms`, `techdeck_resolution_identifiers`, `techdeck_resolution_components` | Reported vs observed symptoms; typed original/normalized error codes, event IDs, ports, paths, registry paths, hosts, OS builds, applications/services/vendors; component/version context. `identifiers` is the logical `resolution_errors` equivalent. |
| `techdeck_resolution_root_causes` | Primary/contributing/secondary/not-proven claims, confidence and supporting evidence pointers, separately attributable inferences. |
| `techdeck_resolution_actions` | Diagnostics, successful/failed remediation and recovery: source sequence/time, purpose, expected/actual results, outcome, diagnostic/corrective type, source safety assertions and reviewer risk assessment. Preserve source distinctions even when actions look similar. |
| `techdeck_resolution_commands` | Exact accepted command, language, source action, diagnostic/corrective label, result, elevation, destructive/risk flags and sanitized search version. Imported command versus recommended future command is explicit. |
| `techdeck_resolution_side_effects` | Observed effect, severity, recovery status, optional verified triggering/recovery action refs, temporal association vs supported causation. |
| `techdeck_resolution_evidence_links` | Existing `techdeck_evidence` observation refs plus incident revision, original evidence ID, JSON pointer, typed value/units/path/confidence. Existing evidence/attachments remain the storage authority for reusable records/files. |
| `techdeck_resolution_changes`, `techdeck_resolution_validations`, `techdeck_resolution_followups` | Before/after, reversibility/rollback; performed/successful/failed/pending validations; action/priority/owner/due with unknowns preserved. |
| `techdeck_resolution_warnings`, `techdeck_resolution_lessons`, `techdeck_resolution_escalation_conditions` | First-class searchable failure intelligence, warnings and escalation guidance with source attribution. |
| `techdeck_resolution_automation_opportunities`, `techdeck_resolution_ip_opportunities` | Submitted ideas, safe diagnostic suggestions vs approval-required actions, risks, evidence, nullable time estimates and later draft-spec status. No executable payload dispatch. |
| `techdeck_resolution_document_links` | Many incidents to existing versioned KB/runbook documents; source revision and document version. Replaces a redundant `resolution_kb_articles` content table. |
| `techdeck_resolution_artifact_references`, `techdeck_resolution_tags` | Bounded non-secret external references and normalized tags. Never dereference submitted network/file paths automatically. |
| `techdeck_resolution_search_documents` | Sanitized revision-bound overview and section chunks, weighted `tsvector`, authorization attributes, freshness/version. Not a second incident source of truth. |
| `techdeck_resolution_nodes`, `techdeck_resolution_relationships` | Tenant-scoped typed node references and directed edges with provenance, relationship type, confidence, claim status, source revision and creator. |
| Later: `techdeck_resolution_embeddings` | Chunk/revision FK, provider/model/dimensions, redactor version, input hash, vector, lifecycle state, safe error and timestamps. Add vector-specific DDL only after capability verification. |

Do not hide important actions, failures, warnings or confidence solely inside
unindexed JSON. Bounded source snapshots/extensions may use JSON alongside these
typed rows. Environment and data-quality collections also need queryable entries
(use typed components/claims/warnings plus bounded incident metadata); the mapping
must account for **every** top-level field in the v1 export.

### Constraints, relationships and indexes

- Every child has `tenant_id`, `incident_id` and source revision; composite
  `(tenant_id, incident_id)` and revision FKs must reject cross-tenant references
  independently of route code. Create referenced unique constraints first.
- Asset/client/site/ticket/document/evidence links use tenant-composite FKs.
  Where both client and site are selected, enforce their shared parent. Validate
  actor membership at write time while preserving attribution after staff leave.
- Raw exports are append-only in application paths. Human review changes use an
  optimistic version and an audit transaction, not in-place source edits.
- Enforce confidence/outcome/risk/claim-state enums, valid sizes/ports/sequence,
  required provenance, bounded array counts and timestamps. Unknown remains
  unknown; no inferred duration from import time.
- Index tenant + incident/revision, created time + stable ID for pagination,
  client/device/date, normalized identifier type/value and tags. Index both edge
  directions and active revision lookups; use a unique key for repeated edges.
- Full-text GIN indexes belong on sanitized search projections; exact identifiers
  use B-tree keys, preserving punctuation and Windows paths. PostgreSQL recommends
  GIN for text search; see [PostgreSQL text indexes](https://www.postgresql.org/docs/16/textsearch-indexes.html).
- Every graph node must resolve through a typed same-tenant FK or a checked
  reference table with database-enforced target integrity. An arbitrary
  `entity_type/entity_id` string pair is insufficient. A practical node registry
  uses nullable typed reference columns with a one-target CHECK and composite
  FKs; relationship endpoints reference `(tenant_id, node_id)`.

Supported edge vocabulary begins with `INDICATES`, `ASSOCIATED_WITH`, `RESOLVED`,
`FAILED_FOR`, `CAUSED_SIDE_EFFECT`, `RECOVERED_BY`, `AFFECTS`, `SIMILAR_TO`,
`OCCURRED_ON`, `GENERATED`, `SUGGESTS_AUTOMATION`. Add `FOLLOWED_BY` for observed
temporal associations so an importer is not forced to assert causation. Inferred
similarity edges retain algorithm/version/score and never become confirmed causal
edges. Do not auto-create `RESOLVED` when source validation is pending.

### Row isolation

Current TechDeck isolation uses server-derived predicates, parameterized SQL and
tenant-composite constraints. It has no general transaction-local tenant RLS
context. Some CallCommand tables enable RLS; that does not establish an existing
TechDeck RLS policy. Preserve and test current isolation for V1. If adding RLS,
first design a non-owner application role and transaction-local tenant setting,
including jobs and pool reuse, then prove deny-by-default and missing-context
behavior. Table owners and privileged roles can bypass ordinary RLS, so merely
enabling it is not acceptance evidence. See [PostgreSQL row security](https://www.postgresql.org/docs/16/ddl-rowsecurity.html).

## 6. Required API changes

Add `routes/techdeck-resolution-routes.ts`, registered by the existing module
route composition. Proposed base: `/v1/modules/techdeck/resolution-intelligence`
(browser: `/api/modules/techdeck/resolution-intelligence`). Use the same
application session and trusted tenant context throughout.

| Method/path relative to base | Purpose | Authority |
| --- | --- | --- |
| `GET /prompt`, `/shortcut`, `/schema?version=1.0` | Canonical assets and supported schema versions | Existing TechDeck read access |
| `POST /exports/validate` | Bounded schema/redaction preview; no incident write | Existing TechDeck write access; viewer GET-only policy remains intact |
| `POST /exports` | Atomic import, optional native reference mapping, idempotency key | Write access; mapping revalidated server-side |
| `GET /incidents` | Cursor-paginated authorized list and client/device filters | Read + record visibility |
| `GET /incidents/:id` | Safe current incident and section counts | Read + record visibility |
| `GET /incidents/:id/sections/:section` | Paginated timeline/evidence/commands/relationships | Same record guard; allowlisted sections |
| `GET /incidents/:id/raw/:revisionId` | Exact accepted source download, no-store, attachment disposition | Tenant admin/owner or explicit platform authority, plus audit |
| `PATCH /incidents/:id` | Reviewed metadata/link corrections, expected version | Write; cannot overwrite raw or server-owned fields |
| `POST /incidents/:id/reprocess` | Explicit append/new normalized revision | Admin + expected version + idempotency |
| `POST /incidents/:id/archive` | Remove from retrieval, invalidate queued projections | Admin + expected version + audit |
| `GET /search` | Short exact/keyword queries, bounded filters and grouped matches | Read + identical record visibility across all signals |
| `POST /search` | Larger diagnostic text without placing it in URL logs/history | Write under existing POST policy; do not widen viewer guards |
| `GET /incidents/:id/related` | Authorized related incidents with reasons | Read + same filtering before ranking |
| `POST /incidents/:id/document-drafts` | Idempotent evidence-derived KB/runbook draft | Write; existing review/approval/publication guards apply later |
| `GET /summary` | Real counts and recent authorized records | Read; every metric shares the incident filter |
| Later: `POST /research`, `/incidents/:id/ai-drafts` | Grounded AI research/drafts | Write + entitlement/usage + provider readiness |
| Later: `/automation-opportunities`, `/analytics` | Grouped backlog and evidence drilldowns | Read/write/admin by action, not UI hiding |

Headless import belongs in `/v1/headless/techdeck/resolution-intelligence/*`,
using existing central service identities and a new narrow import scope. Reuse
the native service logic. Token tenant/module scope must be checked alongside
current tenant/module status and entitlement; do not assume the older headless
helper proves every new guard. No raw export/research/KB publication scope is
implicitly granted by import permission. Inbound webhooks/connectors remain later.

Responses include incident ID, `imported`/`duplicate`, safe validation warnings,
normalized counts, active revision, relationship count, and truthful embedding
state (`not_enabled`, `queued`, `ready`, `failed`, `stale`). Pagination counts and
filter facets are computed only within authorized records. Foreign/missing IDs
share 404 behavior. Use 400 for malformed JSON, 413 for size, 422 for schema/semantic
validation, 409 for conflicts, 429 for limits and 503 for unavailable optional AI.

Proposed starting limits, to verify with large-incident tests: 1 MiB raw JSON,
depth 20, 2,000 aggregate array entries, 100,000 characters per prose/command field,
20 default / 100 maximum results. These are design limits, not current settings.
Rate-limit by trusted tenant/actor/service identity; avoid raw diagnostic text in
access logs, telemetry, URLs or audit metadata.

## 7. Required frontend routes and technician workflow

Canonical-host routes are relative to `https://techdeck.operatoros.net`:

| Proposed route | Working surface |
| --- | --- |
| `/resolution-intelligence` | Search, recent saved incidents, real counts and import CTA |
| `/resolution-intelligence/search` | Results, exact matches, failures/warnings, filters and reasons |
| `/resolution-intelligence/import` | Paste, validate, inspect/redact, link client/assets/ticket, confirm import |
| `/resolution-intelligence/incidents/:id` | Complete incident detail, paginated source-linked sections |
| `/resolution-intelligence/kb` | Existing KB documents linked to incidents and their review states |
| `/resolution-intelligence/automation-opportunities` | Later non-executing backlog with supporting incidents |
| `/settings/ai-integration/ticket-completion-prompt` | Canonical full prompt, shortcut, schema/template, version and downloads |
| `/resolution-intelligence/ai-integration/ticket-completion-prompt` | Alias to the same settings surface, satisfying Prompt 10's second entry path |

The local/embedded equivalents use `/modules/techdeck/...` through `hrefFor`.
Update both `TechDeckRoute.contract.ts` **and** the existing catch-all `route-map.ts`
allowlist/dynamic-ID resolver. Otherwise a new detail/settings deep link can land
in recovery/overview instead of the intended screen. Keep SSO return-path, My Apps,
legacy KB routes and logout behavior.

Add a Resolution Intelligence entry under “Knowledge and evidence.” Reuse the
compact dark theme, `ModuleApplicationShell`, customer picker and existing
API error handling. Load the new workspace dynamically rather than inflating
every TechDeck page. Client/device histories can be filtered incident views
linked from current asset/client screens.

The detail page leads with status/confidence/remaining validation, then the known
resolution and **failed attempts / side effects**. Show the CAM warning near the
top and alongside relevant commands; a long incident must not bury it below
collapsed raw JSON. Each claim links to source revision/pointer/evidence.
Commands render as inert text with copy, language, elevation, risk and actual
result. Copy does not mean approved to run. Source strings must not become HTML,
executable code, shell actions or automatically opened local/network links.

Provide loading, no-results, empty-workspace, partial-import, duplicate, permission,
provider-disabled and retry states; keyboard focus/error summary/live status;
390px/mobile and desktop layouts; bounded rendering for large timelines. No
dummy search cards, fake confidence percentages or inactive feature buttons.

Canonical assets should be packaged deterministically into the API build from
the checked-in prompt/schema files and checked for drift. Do not rely on the
runtime working directory, `docs` being deployed by Replit, or a second hand-edited
prompt string. Display “Copy JSON template” separately from “Copy JSON Schema”
so technicians and integrators receive the correct artifact.

## 8. Search, AI services and configuration

### V1 retrieval

Authorize candidate records **before** each retrieval signal, facet count,
ranking, graph expansion and snippet. Preserve tenant plus minimum-role/review
visibility on every projection, not only the final detail endpoint.

1. Extract typed identifiers deterministically: hex error code, named service,
   basename/full path, hostname, OS build, contextual event ID and port. Bare
   `1000` is ambiguous; do not declare it an Event ID without context.
2. Search normalized identifiers with exact B-tree matches and original-string
   display. `0x800f0915` cannot be diluted into unrelated token matches.
3. Search weighted safe text using PostgreSQL FTS; index natural prose separately
   from identifiers. Include failed actions/warnings/lessons as well as fixes.
4. Apply structured filters and bounded, supported graph signals.
5. Combine deterministic ranking tiers: exact identifier first, then text/metadata
   overlap and supporting graph evidence, with stable date/ID tie-breaking.

Return component scores and plain match reasons. Do not label relevance a
probability of successful repair. “Known fix” requires positive resolution and
supporting validation; a pending validation case remains visibly pending. Group
best matches, exact errors, similar incidents, proven fixes, failed approaches,
warnings and related KBs from the same authorized candidate set.

### Later semantic retrieval

Add a provider-neutral `embed()` service using existing server configuration and
provider states. Select model and dimensions after the provider/retention/cost
review; there is no current embedding model setting to reuse. Track model,
dimensions, input hash, redactor version and incident revision per chunk. Never
compare vectors from incompatible models or dimensions.

Generate embeddings asynchronously through shared leased jobs, with idempotency,
retry limits, stale-content checks, tenant usage controls and visible failures.
Never call the provider within an open incident-write transaction. A failure must
not lose an imported incident or break exact/full-text retrieval.

Read-only checks of `pg_available_extensions`, `pg_extension`, server version and
database-role privileges must precede pgvector DDL. The current CI service image
is plain `postgres:16-alpine`; vector acceptance needs a separately reviewed,
pinned image/environment with pgvector plus a no-vector degradation suite.
Do not issue `CREATE EXTENSION` against a live database during an audit.

Start with exact vector search over bounded authorized data if suitable; benchmark
before selecting HNSW/IVFFlat. Approximate indexes can under-return after filters,
so test tenant/visibility filters, recall and fallback, not just latency. Apply
authorization inside retrieval SQL and recheck returned source records before
synthesis. See [pgvector's search and filtering guidance](https://github.com/pgvector/pgvector).

Later hybrid fusion combines exact/FTS/vector/structured/graph signals with a
versioned ranking policy and judged fixture set. Exact matches and warnings must
remain available when embeddings are absent. No fake deterministic vector adapter
counts as live semantic acceptance.

### Later grounded AI and generation

Reuse `getSharedAiProviderAdapter()` for completion, but create an evidence-bound
service above it. Retrieve authorized sources first; pass source IDs and safe
content as **untrusted data**, never as system/developer instructions. Disable
tools and remote execution. Validate response shape and citation IDs against
retrieved evidence; a citation to an unrelated source is not sufficient support.
Recheck current access/revisions before delivering a cached or delayed result.

Require the labels `CONFIRMED FROM INTERNAL EVIDENCE`, `SUPPORTED INFERENCE`,
`GENERAL TECHNICAL SUGGESTION`, `UNKNOWN`; source attribution, contradictory
incidents, prior failures, dangerous effects and pending validation remain visible.
No evidence means an explicit no-evidence response. Keep generated proposals
separate from accepted incident facts. Unsupported output is withheld or returned
as a failed draft, never promoted into confirmed root cause.

AI-generated KB/runbook content is a new draft in existing documents, with source
incident versions, generalized names/paths and a privacy preview. Publication
remains the current review/approval workflow. Private-incident KB visibility needs
enforcement at **all existing document routes**, not only the Resolution
Intelligence screen; until implemented, create only documents whose permitted
audience matches their source. Shared MSP-library distribution is disabled until
an explicit separate scope, de-identification review and publication design exists.

Automation mining groups recurring observed work into non-executing specifications.
Store unknown effort as null; never fabricate technician time from prose. A safe
diagnostic candidate may alert/collect evidence; active WAL deletion, service
disablement, ACL changes and other destructive actions remain technician-reviewed
recommendations. No existing Script Ops approval authorizes remote execution.

### Environment and cost boundary

Existing configuration: `DATABASE_URL`, `SESSION_SECRET`,
`SSO_CODE_ENCRYPTION_SECRET`, `APP_ENV`, `NODE_ENV`, `INTERNAL_API_URL`,
`TRUST_PROXY`, canonical module URLs, and `RUNNER_MODE`. Existing completion
selection uses `OPENAI_API_KEY` and reads `OPENAI_MODEL` in source. The example
environment documents the key but not a full embedding contract.

V1 introduces no external provider requirement and needs no new production secret.
Later embedding provider/model/dimension/enablement settings are **to be designed
and documented**, not existing environment variables. Reuse central credentials
without exposing them in the frontend; add tenant opt-in, limits, retention review,
usage attribution and a kill switch before sending real incident content. Any
pricing change remains an OperatorOS commercial decision.

## 9. Security and operational considerations

- Tenant is the MSP organization boundary; directory clients within it are managed
  customers. Do not interpret a JSON `organization` or `environment.tenant` as an
  authorization claim. V1 is internal-technician access; existing client portal
  assignments do not imply access to this new knowledge store.
- Apply current module entitlement and record-role visibility to detail, raw,
  search, exports, graph edges, counts, histories, jobs, cache keys and citations.
  Cache keys include tenant, effective access, revision and policy versions.
- Reject browser-supplied actor, reviewer, tenant, approval, normalization status
  and provider readiness fields. Linking requires trusted scoped lookups.
- Scan arbitrary prose/commands and unknown nested fields, not only obvious key
  names. Shared metadata redaction remains a final defensive layer. Review and
  add synthetic secret-detection cases without placing real credentials in Git.
- Treat ticket text as prompt-injection data. Retrieved text may contain malicious
  instructions or fabricated command outcomes; neither is an instruction to the
  application or a reason to raise confidence.
- Shared jobs only receive record/revision IDs and safe status metadata. Reload
  authorization and data at execution; apply egress redaction to queries as well
  as incident chunks and scan generated output before saving/indexing.
- Audit import/reimport/correction/archive, raw read, document draft/publication,
  visibility changes, AI usage and automation-draft generation using existing
  platform services. Logs record IDs/counts/reason codes, not incident payloads.
- Retention and deletion cascade through raw sources, normalized children,
  projections, embeddings, relationship edges and queued work under explicit
  policy. Preserve necessary safe audit attribution; respect legal retention
  requirements established by the organization. Restore testing includes raw and
  derived records. Archived data must not reappear from stale jobs/caches.
- Do not store PHI or other sensitive customer data on the assumption that MSP
  labeling makes it compliant. Real incident import requires correct tenant,
  least-privilege access, retention and source authorization.

## 10. Migration strategy

Use `apps/api/src/lib/database-release-contract.ts` and its executor in
`database-release.ts`. Proposed next step: `techdeck_resolution_intelligence_tables`
after the observed v63 manifest. Allocate the version against the then-current
branch; do not assume v64 is still free when implementation starts.

1. Add typed schema and a dedicated idempotent initializer. Preserve earlier steps,
   seeds and existing business data; no imported child migrations or `drizzle-kit push`.
2. Create parent/tenant unique keys before composite FKs, then normalized children,
   search projections and relationship integrity constraints. Extend release
   verification to inspect required tables, columns, constraints and indexes.
3. Clean apply, immediate reapply, independent verify, v63-to-new upgrade and
   failure/retry tests run only on explicitly disposable databases. Compare
   existing users/tenants/grants/subscriptions and TechDeck entity counts.
4. Deploy code only after separately authorized backup and one-shot release apply.
   Routine Autoscale startup stays verify-only; missing schema fails readiness.
5. Add optional vector support as a separate reviewed additive step when available.
   No live extension install, bulk embedding backfill or real incident seed belongs
   in schema startup. Jobs perform bounded resumable backfill outside DDL locks.

The supplied later prompt asks for reversible migrations, but the current
repository explicitly has **no supported destructive down migration**. Satisfy
rollback through compatible additive schema retention plus application rollback,
or validated restore into a new database and traffic switch as documented in
`docs/DATABASE_BACKUP_RESTORE.md`. Do not invent DROP-based down scripts. Record
backup/restore, apply, source build and deployed identity evidence separately.

## 11. Testing and acceptance strategy

| Layer | Required evidence before feature acceptance |
| --- | --- |
| Contract | Exact prompt/shortcut preservation; machine example parses; formal schema handles nulls, empty arrays, unknown fields and version negotiation; generated build assets cannot drift. |
| Parsing/redaction | Malformed/oversized/deep JSON, duplicate keys, Unicode/NUL, quotes/newlines, numeric bounds, null-heavy exports, secrets in commands/nested extras, safe validation error paths and no secret logs. |
| Persistence | Entire normalized transaction plus audit succeeds or rolls back; concurrent duplicate imports create one incident; explicit reprocess keeps raw revisions and coherent search; retry/deletion races are safe. |
| Database | Clean apply/reapply/verify, v63 upgrade, invalid FK/check rejection, tenant uniqueness, graph endpoint integrity, index verification, rollback rehearsal into a new disposable database. RLS tests only if genuinely implemented. |
| Authorization | Two tenants with identical terms; owner/admin/member/viewer and module viewer/user/manager; missing/revoked entitlement, suspended tenant, forged selectors, foreign raw/asset/ticket/KB/edge IDs, portal users and headless token scopes/revocation. |
| Search | Exact errors/service/path/build; ambiguous numeric identifiers, phrase/keyword/no-result queries, filters/facets, stable pagination, warning prominence, explainable rank, hidden sources never affecting snippets/counts. |
| KB/runbook | Existing review/approve/publish/version workflow remains; no private-source leakage through generic docs API; stale source versions cannot silently overwrite guidance; sanitized previews and many-to-one links. |
| AI later | Provider disabled/timeout/quota/malformed output; no-evidence, contradictions, fabricated citations, source-claim mismatch, malicious imported instructions; tenant-safe query/embedding/cache retrieval; model/dimension/redactor changes. |
| UI | Import through reload, second authorized user retrieval, detail deep links through SSO, copy/download, warnings near commands, large incidents, permission/loading/empty/error states, keyboard and mobile layout, My Apps and logout. |
| Performance | Representative synthetic volumes, bounded database calls, `EXPLAIN (ANALYZE, BUFFERS)` in disposable DB, tenant-leading filters and GIN usage, no per-result N+1, paginated sections, graph depth limits and later filtered-vector recall. |
| Release | Focused checks first, root typecheck/lint/build and relevant aggregate suites; actual compiled supervisor and exact-host browser acceptance; production evidence only after deployment and authorized live validation. |

Existing baselines to extend: `techdeck-ops-workflows.test.ts`,
`techdeck-shared-runtime-tickets.test.ts`, `techdeck-literal-product.test.ts`,
tenant isolation/module-access tests, `shared-queue-tenant-scope.test.ts`,
`database-release-contract.test.ts`, `database-publish-constraint-order.test.ts`,
and `apps/web/e2e/phase50-techdeck-routes.spec.ts`.

Planned implementation verification, with the existing disposable-database and
provider-isolation harness configured before any DB-backed command:

```powershell
corepack pnpm db:plan
$env:APP_ENV='test'; $env:NODE_ENV='test'
# Run new focused resolution tests using the API workspace's tsx runner first.
corepack pnpm --dir apps/api test
corepack pnpm test:unit
corepack pnpm test:integration
corepack pnpm lint
$env:INTERNAL_API_URL='http://localhost:5001'
corepack pnpm build:production
# Compiled production-artifact harness and exact-host SSO/Resolution journeys next.
# The configured clean-checkout aggregate remains: corepack pnpm verify:release
```

Do not run these DB-backed commands against a persistent development or production
URL. Do not mark missing infrastructure as a passed/skipped security test. CI uses
Node 20; local Node 24 results require separate CI confirmation.

## 12. Implementation phases and exit criteria

| Phase | Supplied prompt mapping | Concrete output and exit gate |
| --- | --- | --- |
| 0 — This audit | 0 document preservation + 1 | Exact prompt/shortcut and this source-grounded plan. No feature claim. |
| 1 — Contract and storage | 2 | Formal v1 schema, complete field-to-table map, tenant-safe normalized model and graph, immutable accepted source, constraints/indexes, synthetic fixture, clean upgrade/apply/reapply tests and data-model guide. Review the raw-secret and rollback decisions first. |
| 2 — Ingestion | 3 | Validate/preview/import/reprocess service and native/headless API; atomic audit/dedupe, safe errors, source provenance, no AI inference. |
| 3 — Technician V1 | 4 + exact/FTS portions of 5 + 10 | Working import/detail/search/history and prompt settings routes on both routing forms; copy/download/schema examples; warning-first UI; complete browser journey. |
| 4 — Evidence-derived documents | Deterministic portion of 7 | Linked versioned KB/runbook drafts and existing approval/publish flow; no private/public visibility bypass. This completes recommended V1 after hardening. |
| 5 — Semantic retrieval | Remaining 5 | Verified pgvector environment/provider, safe embedding jobs, judged hybrid ranking and degraded-mode tests. |
| 6 — Grounded research | 6 + AI portion of 7 | Authorized evidence synthesis, citation validation, contradictory evidence handling and reviewed AI drafts. |
| 7 — Intelligence expansion | 8 + 9 | Non-executing automation backlog and real drilldown analytics; no invented time or causal relationships. |
| 8 — Release acceptance | 11, applied throughout | Admin/technician/API/security/search guides, full regression/build, restore/rollback evidence and separately authorized production deployment. |
| 9 — Real incident | 12 | Private tenant-targeted import of the supplied CAM WAL case after source review; authorized real provider/embedding processing if enabled, five requested searches and warning evidence. No startup or public fixture seed. |

Every phase updates `docs/IMPLEMENTATION_STATUS.md` and the relevant TechDeck
parity evidence without changing historical migration parity into an unsupported
claim about this new subsystem.

## 13. Exact files likely to be added or modified

These are **proposed paths**, not a claim that they already exist or were added.
Keep services focused and avoid extending the already large route/UI files with
the entire subsystem.

| Phase | Proposed new files |
| --- | --- |
| Contract | `packages/sdk/src/techdeck-resolution.ts`; `docs/techdeck/machine-evidence-export.schema.json`; `scripts/techdeck/generate-resolution-contract.mjs`; generated `apps/api/src/generated/techdeck-resolution-contract.ts` |
| Storage | `apps/api/src/lib/techdeck-resolution-db-init.ts`; `docs/techdeck/resolution-intelligence-data-model.md` |
| Ingestion | `apps/api/src/lib/techdeck-resolution-validation.ts`; `techdeck-resolution-redaction.ts`; `techdeck-resolution-ingestion.ts`; `techdeck-resolution-graph.ts` in that same `lib` directory; `apps/api/src/routes/techdeck-resolution-routes.ts` |
| Search | `apps/api/src/lib/techdeck-resolution-search.ts`; `docs/techdeck/resolution-intelligence-search.md` |
| Web | `apps/web/src/components/module-shells/TechDeckResolutionWorkspace.tsx`; `TechDeckResolutionImport.tsx`; `TechDeckResolutionDetail.tsx`; `TechDeckResolutionSearch.tsx`; `TechDeckTicketCompletionPrompt.tsx`; `TechDeckResolution.module.css` in the same directory; `apps/web/src/lib/techdeck-resolution-api.ts` |
| Document drafts | `apps/api/src/lib/techdeck-resolution-documents.ts` |
| Embeddings/AI later | `apps/api/src/lib/embedding-provider.ts`; `techdeck-resolution-embeddings.ts`; `techdeck-resolution-research.ts` in that directory |
| Expansion later | `apps/api/src/lib/techdeck-resolution-automation.ts`; `techdeck-resolution-analytics.ts` in that directory |
| Tests | `apps/api/test/techdeck-resolution-contract.test.ts`; `techdeck-resolution-ingestion.test.ts`; `techdeck-resolution-search.test.ts`; `techdeck-resolution-authorization.test.ts`; `techdeck-resolution-database.test.ts`; `techdeck-resolution-ai.test.ts` in that directory; `apps/api/test/fixtures/techdeck-resolution-cam-wal-v1.json`; `apps/web/e2e/techdeck-resolution-intelligence.spec.ts` |
| User/operator docs | `docs/techdeck/resolution-intelligence-admin-guide.md`; `resolution-intelligence-technician-guide.md`; `resolution-intelligence-api.md`; `resolution-intelligence-security.md` in that directory |

Existing files likely to change:

- `apps/api/src/schema.ts`, `lib/database-release-contract.ts`,
  `lib/database-release.ts`: schema exports, ordered step and verifier.
- `apps/api/src/routes/module-shell-routes.ts`: new route registration.
- `apps/api/src/routes/techdeck-routes.ts`: extract/reuse document creation and
  permission-aware workflow services where required; keep existing behavior.
- `apps/api/src/lib/shared-platform-control-plane.ts`: central narrow headless
  scope registration; do not broadly expose incident search as a shortcut.
- `apps/api/src/lib/shared-service-worker.ts`, `shared-provider-adapters.ts`:
  later job registration and provider capability, without activating providers.
- `packages/sdk/src/index.ts` and `packages/sdk/package.json` if needed for the
  SDK's existing export/build convention; inspect that convention before editing.
- `apps/web/src/components/module-shells/TechDeckShell.tsx`,
  `TechDeckRoute.contract.ts`, `TechDeckOperations.tsx`, `TechDeckTicketQueue.tsx`:
  section, settings entry and existing-record links.
- `apps/web/src/app/modules/[slug]/[...path]/route-map.ts`: allowlisted new routes
  and dynamic incident IDs. Preserve the generic catch-all and middleware policy.
- `apps/web/src/lib/auth.ts`: reuse/export existing authenticated request helper
  if needed by the small new API client, not a second token store.
- `apps/web/src/lib/help/index.ts`: technician first task, import outcomes and recovery.
- `package.json`, `.env.example`, `.github/workflows/release-gate.yml`, relevant
  `scripts/parity` test inventories: artifact freshness, future documented config,
  real vector CI when introduced, and inclusion of new browser/regression gates.
- `docs/IMPLEMENTATION_STATUS.md`, `docs/modules/MODULE_PARITY_INDEX.md`,
  `docs/modules/techdeck/VERIFICATION.md`, `docs/DATABASE_BACKUP_RESTORE.md`:
  scoped evidence, release/rollback notes. Update ADR index only when a new ADR is
  actually written and reviewed; do not invent an accepted ADR number now.

No edits are planned in imported child `source` trees, auth/SSO protocol, Stripe
catalog or existing customer identity ownership merely to add this subsystem.

## 14. Risks, unknowns and required decisions

| Item | Resolved from repository / proposed decision | Remaining gate |
| --- | --- | --- |
| Untouched raw exports with secrets | Existing TechDeck credential prohibition applies; V1 rejects detected secrets before storing accepted exact source | Review policy/retention and detection limits; encrypted secret-bearing evidence would be a separate design |
| Example versus validation schema | Versioned example exists in supplied prompt; formal validator does not | Agree nullable/type/size and compatibility rules; verify complete field mapping |
| Tenant versus managed client | Tenant is authority; directory organization is customer context | Real incident requires an explicitly selected authorized tenant/client/device mapping |
| Record access | Existing roles/grants and document minimum role are reusable | New private incident/document visibility must be enforced in generic APIs and search, not just the new page |
| Search authorization | Shared search is tenant-filtered but lacks record-visibility input | Keep incident corpus out until safe integration; test all facets/snippets and job/cache paths |
| Vector availability | No active implementation found; plain Postgres CI | Read-only provider capability/privilege check; no extension install assumed |
| AI provider/cost/retention | Completion adapter exists, embedding adapter does not | Model/dimensions, tenant budget, data egress/retention and live acceptance remain unverified |
| Knowledge reuse | Versioned documents and approval workflow exist | Generalization and shared-library scope need explicit review; sharing remains off |
| Generic graph integrity | Existing asset graph is insufficient for incident reasoning | Typed nodes/FKs, unambiguous edge extraction, and provenance tests before activation |
| Migration reversibility | Additive manifest and restore-to-new-database are current authority | No destructive down script; backup/apply/redeploy remain separate approved operations |
| Deployment packaging | `docs` cannot be assumed at runtime | Generate/package canonical assets and prove production artifact copy/download equality |
| Source documentation drift | Root lint command exists despite older guidance; source v63 supersedes older manifests | Report observed checks, update scoped evidence and preserve historical records |
| Actual incident completeness | Supplied case summary includes measurements and chronology, not full command transcripts or validation logs | Do not manufacture commands, timestamps, technician time, client identity or completed DISM/SFC |

### CAM WAL acceptance case

Shared tests use a synthetic hostname/client and the supplied technical pattern;
customer-identifying source text and the real hostname do not enter fixtures or
startup seeds. The real named case is imported only in its authorized private
tenant after platform acceptance.

Preserve the supplied build `10.0.26100.8457`, errors `0x800f0915` and
`0xe0000008`, the CapabilityAccessManager WAL path and exact byte measurements in
the private source where permitted. Synthetic fixtures can retain non-identifying
technical values. Do not assert that the WAL caused every observed error or that
the origin of WAL growth is proven. Reclaimed space and restored access are
reported observations; post-update DISM/SFC validation remains pending.

The required warning is:

> Disabling camsvc was followed by loss of Wi-Fi network discovery after reboot on this endpoint. Do not treat permanent camsvc disablement as a routine remediation, especially on remote Wi-Fi-dependent endpoints.

This qualified wording takes precedence over the earlier illustrative “caused
Wi-Fi loss” phrasing in the staged prompts. Represent a temporal association and
the observed recovery, without claiming a universal Windows dependency.

Required later search acceptance queries: `0x800f0915`, `Windows 11 disk keeps
filling`, `CapabilityAccessManager.db-wal`, `WebView crashes low disk`, and `WiFi
gone after disabling camsvc`. Record rank, matched signals, source links and
warning visibility. Do not claim these searches passed during this planning task.

## 15. Verification for this planning change

The change contains documentation only. No schema, route, component, dependency,
provider setting, auth/billing gate or release manifest was modified. Canonical
prompt and shortcut are extracted directly from the supplied attachment, with
their original text preserved. Source-pointer and content checks, the read-only
database plan, and baseline build/lint results are recorded in
`docs/IMPLEMENTATION_STATUS.md` for this change.

Baseline build/test success is evidence about existing OperatorOS source, not
acceptance of the proposed Resolution Intelligence functionality. DB-backed,
browser, semantic/provider, migration and real-incident acceptance for the new
subsystem remain future work under the phases above.
