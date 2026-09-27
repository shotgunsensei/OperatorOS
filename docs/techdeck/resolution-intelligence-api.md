# Resolution Intelligence ingestion API

Phase 2 / supplied Prompt 3, 2026-09-27 UTC. This implements ingestion on the
existing v64 storage release. Technician pages, source downloads, incident
reads/search, history UI and prompt settings are Phase 3. Document generation,
embeddings, research, analytics and command execution are not enabled here.

## Endpoints and authority

All paths below are API paths. Browser clients replace the leading `/v1` with
the existing same-origin `/api` proxy, using the host-only session and origin
protections. OperatorOS remains the
only identity, tenant, module and entitlement authority.

| Method and path | Required authority | Effect |
| --- | --- | --- |
| `POST /v1/modules/techdeck/resolution-intelligence/exports/validate` | Internal tenant member/admin/owner with TechDeck write access | Validate, screen, normalize and return safe counts/warnings; no incident, source, audit or idempotency write |
| `POST /v1/modules/techdeck/resolution-intelligence/exports` | Same native authority, plus `Idempotency-Key` | Atomically import accepted evidence or return a duplicate/replay receipt |
| `POST /v1/modules/techdeck/resolution-intelligence/incidents/:id/reprocess` | Internal tenant admin/owner with TechDeck write access; visible incident; `Idempotency-Key` and `expectedVersion` | Append a screened immutable revision and replace the active projection |
| `POST /v1/headless/techdeck/resolution-intelligence/exports/validate` | OperatorOS service token with `techdeck:resolution:import` | Same safe preview |
| `POST /v1/headless/techdeck/resolution-intelligence/exports` | Same service token, plus `Idempotency-Key` | Import with effective record role `member` |

Native guards authorize before JSON body parsing. Viewers, module read-only
grants, customer portal assignments, suspended tenants, disabled modules and
missing entitlements are denied. `X-Tenant-Id` is a revalidated requested
selection, never source authority. A module session cannot select another module
or tenant. Reprocessing also enforces the incident's current minimum role.

Headless tokens are created and revoked through the existing OperatorOS shared
platform API: tenant administrators use
`POST /v1/tenants/:tenantId/shared-platform/service-identities` with the TechDeck
module ID, identity/token names, a suitable expiry and the narrow scope above.
The existing central service stores the token hash and returns the secret once.
Keep it in a server-side secret store and send it only as an `Authorization:
Bearer ...` header. No new credential store or browser token persistence is added.
The settings scope picker is not extended in this API phase.

Every headless request rechecks token/identity revocation, expiry, TechDeck module
binding, the creator's current membership and module grant, active tenant,
entitlement and portal exclusion. A conflicting tenant header fails. The import
scope does not grant raw reads, search, cross-tenant operations or reprocessing.

## Request envelope

Use `Content-Type: application/json`. `rawText` is the complete UTF-8 machine
export serialized as a JSON string, not a parsed object. It must satisfy
[schema 1.0](machine-evidence-export.schema.json). The canonical prompt and
template remain packaged by the Phase 1 generated-contract build check.

```json
{
  "rawText": "<complete schema 1.0 JSON text>",
  "humanReport": "Optional redacted human closeout report",
  "links": {
    "directoryOrganizationId": "existing-organization-id",
    "directorySiteId": "existing-site-id",
    "ticketId": "existing-ticket-id",
    "assets": [{ "index": 0, "assetId": "existing-asset-id" }]
  }
}
```

The example demonstrates the envelope; replace the angle-bracket placeholder
with a complete export. `humanReport` and `links` may be omitted; the report may
be `null`. Each link is optional. A site requires its organization. Asset indices
refer to `affected_assets` and must identify a nonempty normalized observation.
At most 100 asset mappings are accepted. IDs must identify active, nondeleted
resources in the validated tenant; missing and foreign resources share a 404.
Labels in the source never silently select or create organizations, users,
assets, sites or tickets.

Reprocessing takes the same envelope plus a positive integer `expectedVersion`
from the last receipt. It requires the caller to resubmit the desired source;
this phase has no raw-export retrieval endpoint. It appends a new revision,
retains prior source and normalized children, and returns a new version.
Unspecified parent client/site/ticket links are retained. Per-asset mappings
must be supplied for the new revision. Changing the parent organization without
a site clears the old site. No mapping-clearing or visibility-edit API is added.

Server-owned fields such as `tenantId`, actor, role, `securityScreened`, review
status and version outside the documented reprocess field are rejected. Unknown
envelope/link fields are errors; unknown machine-export extensions are screened,
retained only in immutable source, included in the fingerprint and reported as
warnings. They do not enter normalized facts, graph or search content.

## Receipts, duplicates and transactions

A successful preview returns `valid: true`, `warnings`, per-table `counts`,
`relationshipCount` and `embeddingState: "not_enabled"`. It does not return
source text, credentials, normalized text or generated record IDs. Shared abuse
counters and service-token last-use metadata can still be updated.

A successful import returns HTTP 201 with `incidentId`, `status: "imported"`,
`activeRevision`, optimistic `version`, warnings/counts, relationship count and
the same embedding state. A duplicate returns HTTP 200 and `status:
"duplicate"`. A successful idempotency replay returns HTTP 200, the original
receipt and `replayed: true`. These are import receipts, not a certification of
source claims or current search results.

`Idempotency-Key` must match `[A-Za-z0-9_.:-]{8,160}`. Scope binds tenant, module
and authenticated user or token. Reuse with different exact raw bytes, report,
links or reprocess target/version returns 409. Matching replay rechecks current
visibility and archive state. Callers should keep one key per intended operation
and inspect the receipt before retrying after a connection failure.

Semantic deduplication hashes canonical sorted object keys while preserving
array order, unknown source extensions and the optional report. Whitespace and
object property ordering do not create a second incident. The exact original
bytes receive a separate SHA-256. Dedupe is tenant-bound and normalizer-version
bound; it does not overwrite source or change existing links. To change evidence
use the admin reprocess operation. A historical inactive fingerprint or an
inaccessible/archived duplicate returns a generic conflict without disclosing
an incident ID. Reprocessing identical active evidence is a duplicate, not a
new revision; a stale expected version returns 409.

One PostgreSQL transaction performs reference checks, duplicate/revision
decisions, source persistence, normalized facts, typed graph, search projections,
active-version update, platform audit and idempotency completion. A tenant-scoped
transaction advisory lock serializes duplicate/revision decisions across API
instances. Inserts follow the compiled storage dependency order in batches of
100. Any failure rolls back the whole import, including the idempotency claim.
Only IDs, counts and a static summary enter audit metadata; it records the
actual platform actor and, for headless imports, the API token ID.

## Validation and resource bounds

| Limit | Bound |
| --- | --- |
| HTTP JSON envelope | 4 MiB |
| Machine source / optional human report | 1 MiB each |
| Individual machine-export string | 100,000 UTF-8 bytes |
| JSON depth / aggregate array entries / values | 20 / 2,000 / 12,000 |
| Object properties / property-name bytes | 500 per object / 256 |
| Numeric literal length | 128 characters; finite, within safe magnitude, decimal value must survive parsing unchanged |
| Indexed identifier / component / tag | 2,000 / 512 / 160 UTF-8 bytes |
| Generated rows / serialized projection | 15,000 / 8 MiB |
| Safe warning list / secret issue list | 100 / 30 |
| Persistent tenant / actor-or-token rate | 120 / 30 requests per minute, shared across preview/import/reprocess |

Invalid UTF-8, NUL, lone UTF-16 surrogates, decoded duplicate keys, prototype
property names, malformed JSON, trailing input, unsafe numbers, numeric underflow
and rounding are rejected before storage. Schema validation performs no type
coercion, default filling or removal of source fields. Ordinary exactly preserved
fractional/scientific values remain valid.

Dates require an explicit valid ISO timestamp with timezone and a normalized UTC
year from 0001 through 9999. Unresolved source
dates remain in raw evidence with a warning and a null normalized timestamp.
Opening/closing chronology cannot be reversed. Empty template placeholders do
not become facts. Missing values remain unknown; partial statements without the
necessary text remain in source with a warning.

## Screening and source attribution

Screening version `screen-v1` traverses all keys and values, including unknown
extensions, commands and the human report. It rejects credential-like property
names with nonredacted values, common credential assignments, bearer/basic tokens,
private-key markers, recognized token formats, JWT-like strings, credentialed
URLs and recovery-key patterns. Only the exact source security boolean flags
receive their narrow type-aware exception. A source flag claiming redaction
never bypasses scanning. Known redacted placeholders are accepted.

This is a conservative heuristic, with false-positive and false-negative limits.
`security_screened=true` records that this version ran successfully; it is not a
guarantee that arbitrary prose is secret-free. The caller must review and redact
source first. Rejected content is never persisted by the import service or echoed
in errors/audit/logging. No sanitizer silently rewrites accepted evidence; accepted
source and human report remain exact. Existing TechDeck credential-storage policy
continues to apply.

Normalizer `normalize-v1` preserves failures, temporal side effects, recovery,
warnings, root-cause uncertainty, assumptions and pending validation. Source
confidence is an attributed claim. Exact unambiguous action/evidence references
can create typed links; ambiguous references remain text with warnings. An action
reported successful is not automatically proof of incident resolution. Temporal
association does not become a causal assertion. No AI infers facts or relationships.

Search documents contain only screened, allowlisted normalized text. The title is
weighted once per incident; raw export, human report and extensions are excluded.
All projections retain source pointers/revisions. Future reads/search must select
the active revision and apply tenant/record visibility before returning any
snippet, facet, count, edge or linked document. This phase exposes no search API.
Imported commands remain evidence; paths/URLs are never fetched or executed.

## Errors and operational limits

Errors use a stable `code` and generic message, with bounded safe issue paths and
expectations where useful. Unknown extension names are masked and detected-secret
previews are always `[REDACTED]`. Authentication guard responses retain the existing
platform contract. Intake responses use `Cache-Control: no-store`.

| HTTP | Meaning |
| --- | --- |
| 400 | Invalid JSON/envelope/key, unsafe or precision-losing number, missing expected version or idempotency key |
| 401 / 403 | Missing/rejected session/token or insufficient current authority |
| 404 | Foreign/missing native reference or unavailable reprocess/replay incident |
| 409 | Idempotency, duplicate/history, in-progress or optimistic-version conflict |
| 413 | Envelope/source/field complexity or generated projection exceeds limits |
| 415 | JSON content type required |
| 422 | Schema, credential/redaction, mapping, chronology or indexed-field validation failure |
| 429 | Persistent abuse limit; `Retry-After: 60` |
| 500 | Import transaction failed; no SQL/source details returned |

No database release is added: use the existing supported v64 root manifest and
[backup/restore procedure](../DATABASE_BACKUP_RESTORE.md). To roll back this API
phase, deploy the preceding compatible application artifact and preserve all v64
tables and immutable revisions. Do not remove source rows or run a destructive
down migration. Publishing/deployment, production backup/apply and real customer
incident ingestion remain separately authorized operations.

See [the phase map](resolution-intelligence-implementation-plan.md#12-implementation-phases-and-exit-criteria),
[the storage contract](resolution-intelligence-data-model.md) and
[current verification](../IMPLEMENTATION_STATUS.md) for scope and evidence.
