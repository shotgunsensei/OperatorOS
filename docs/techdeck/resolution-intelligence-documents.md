# Evidence-derived TechDeck documents

Phase 4 / deterministic Prompt 7, 2026-09-27. This is the local candidate on
`codex/techdeck-evidence-documents`; local verification passes and deployment
acceptance remains separate. See the [completed review](resolution-intelligence-phase4-review.md).
The feature reuses existing versioned documents and review/approve/publish.
Storage remains v64/64.

## Technician workflow

1. Open an incident and review warnings, validation, failed attempts and side effects.
2. Select Knowledge base or Runbook under **Turn evidence into a reviewed
   document**, then **Preview evidence draft**. Preview persists nothing.
3. Inspect the actual text, citations and customer details. This internal draft
   is not de-identified. Confirm the audience acknowledgement and save it.
4. Open the document editor, edit with a revision note, then submit for review.
   Administrator/owner approval and publication retain the existing guards.
   Edits and workflow transitions each append a document revision and audit.
5. **Linked knowledge**, at `/resolution-intelligence/kb`, shows documents,
   review states and source references. The embedded equivalent starts with
   `/modules/techdeck`. Source changes never overwrite a document.

**Link this incident to an existing draft** adds another attributed source and
a document revision without replacing technician edits or claiming that the
incident proves the guidance. The document must be a writable KB/runbook draft
with an audience at least as restrictive as the new source. The picker lists
the first 100 accessible linked documents; the library provides pagination.
The API also supports a known authorized manual KB/runbook draft.

## Source and access behavior

- Assembly uses allowlisted normalized evidence, never raw-source download or
  an external model. Warnings, validation, missing/conflicting information,
  side effects, symptoms, root-cause claims, observed actions, rollback evidence,
  inert commands, observations, follow-ups, escalation and lessons have source
  revision/JSON-pointer citations. Unknowns say **Not recorded**. Reported
  success does not confer approval or establish causation.
- Preview includes up to 25 records per section and 1,200 characters per field,
  with a bounded content budget. Shortened excerpts and omitted records are
  labelled. Source HTML delimiters are neutralized in the derived text; accepted
  source remains unchanged. Commands are never executed or fetched.
- Creation requires a current incident version, exact preview hash, explicit
  acknowledgement and actor-scoped idempotency key. A source row lock serializes
  concurrent creation across API instances. Duplicate revision/type requests
  return the existing document and preserve its edits.
- Audience initially inherits the source minimum role. Generic document list,
  detail, workspace, reference, link and attachment authorization paths enforce
  access to **every** linked source. Portal assignments do not grant internal
  evidence access. Source restriction applies immediately; source archive makes
  the document unavailable through these APIs.
- Document role changes cannot widen below a source. Revision reads filter
  stored revision roles. Document-to-document links filter the other endpoint
  before returning its ID/label.
- Old source and document versions remain linked after reprocessing. Authorized
  readers see a stale-source warning. Review/approval/publication is blocked
  until a new document is prepared from current evidence; old content remains.
- Publication stays inside the tenant and retains source authorization. Public
  libraries, AI, embeddings and execution are not enabled.
- Tenant-wide compliance ZIPs exclude incident-linked documents and their
  document activity because the exporter lacks per-source reader authority.
  Its manifest declares the exclusion. Other export categories retain their
  existing policy. No incident content is added to shared platform search.

## API contract

Paths share `/v1/modules/techdeck/resolution-intelligence`; the browser uses the
same-origin `/api/modules/techdeck/resolution-intelligence` proxy. Reads require
internal membership, module entitlement/access and source/document visibility.
Mutations require module write access and existing persistent rate limits.
Headless import tokens receive no document permissions. Responses use no-store.

| Endpoint | Input | Result |
| --- | --- | --- |
| `POST /incidents/:id/document-drafts/preview` | `{kind,expectedVersion}`, kind `knowledge_base` or `runbook` | Content, citations, inherited role, source revision/version, generator, abbreviation flag and preview SHA-256; no persistence |
| `POST /incidents/:id/document-drafts` | `{kind,expectedVersion,previewSha256,privacyReviewed:true}` plus `Idempotency-Key` | 201 new draft or 200 duplicate/replay receipt |
| `POST /incidents/:id/document-links` | `{documentId,expectedVersion,expectedDocumentVersion}` | Additional source reference/document revision, or existing-link receipt |
| `GET /documents` | Optional `incidentId`, `limit` 1–100 (default 20), response `cursor` | Authorized items, source-current flag/provenance and nextCursor; stable ID order |

Editing and transitions remain under `/v1/modules/techdeck/documents/:id`.
PATCH, review, approve and publish use expectedVersion and existing role/state
guards. Source audience and freshness are checked with the write. Creation
atomically saves document, revision, tenant-composite link, platform activity
and idempotency receipt. Additional linking atomically saves attribution,
revision, source link and activity. Audit metadata contains IDs/revisions/hashes,
not source bodies.

## Verification and rollback

[Implementation status](../IMPLEMENTATION_STATUS.md) records exact commands,
environment, counts and blockers. Regressions cover nonpersistent preview,
source fidelity, concurrent dedupe, role/portal/foreign denial, generic routes,
approval, stale sources, many-to-one links, export exclusions and bounded output.
Browser tests use synthetic data, the compiled supervisor and loopback TLS.

There is no schema migration or destructive down migration. Keep v64 storage
and accepted evidence. **Do not revert to an API lacking the linked-source
guards while these documents remain accessible.** Retain/backport the guards
and export exclusion, or separately review a restriction of affected documents.
Production data restore follows the full backup/restore runbook and requires
human approval; it is outside this implementation.
