# Resolution Intelligence semantic search

Phase 5 / remaining Prompt 5. OpenAI is the first supported provider, as selected
by the owner on 2026-09-29. **Provider activation remains disabled.** This guide
describes implemented behavior; it does not establish live embedding quality,
provider acceptance, production database capability, or publication.

## Technician workflow

Exact identifier and text search work without semantic setup. Search also reports
matching components, supporting evidence links, warnings and failed attempts.
Exact identifiers always outrank results without an exact match. A similarity
score describes wording similarity; it is not confidence that a repair will work.

After operator setup, an organization administrator can open **Semantic search
availability**, review provider/data-sharing terms, set a daily request limit and
enable the organization. This is separate from incident review. Each incident's
**Semantic index for this incident** panel provides a complete bounded preview of
the exact excerpts to send. Review every excerpt, correct/reprocess the source if
private details remain, and confirm before queueing. Preview itself is local.

Indexing runs in the existing shared job worker. Refresh the incident status to
see pending, ready, failed or stale chunks. Provider failures retry up to three
attempts. After the last failure, correct the cause and review/queue the incident
again. Already ready or active chunks are not requeued. Changing the source,
review/access version, embedding identity, screening version or organization
settings requires renewed indexing. Turning the organization off immediately
excludes its semantic results. Imported evidence is preserved in all cases.

Search uses semantic matching only when the technician explicitly selects
**Include semantic matches**. The submitted query is then screened and sent to
the configured provider, subject to the same organization limit. Ordinary search
does not make a provider request. Large diagnostic text remains usable for exact
and full-text search; queries above 6,000 UTF-8 bytes do not leave for embeddings.

## Configuration and activation boundaries

The operator must separately review provider data processing/retention, cost and
the selected model/dimensions. There is no automatic provider activation from a
saved completion key. Serving settings are:

| Variable | Meaning |
| --- | --- |
| `OPENAI_API_KEY` | Existing server-only OpenAI credential; configure securely, never in client code or chat |
| `TECHDECK_EMBEDDINGS_ENABLED` | Defaults off; only the exact value `1` permits a configured adapter |
| `TECHDECK_EMBEDDING_MODEL` | Explicit `text-embedding-3-small` or `text-embedding-3-large`; no default |
| `TECHDECK_EMBEDDING_DIMENSIONS` | Explicit integer, 256–1536 for small or 256–3072 for large; no default |

One bounded excerpt or query is one provider request, with a 10-second timeout.
The tenant cap is 1–1,000 attempts per UTC day (default 100). An atomic reservation
in the shared usage ledger precedes network I/O; concurrent requests cannot
exceed it. Failed/uncertain attempts still count. Reported input tokens are stored
separately. The cap is a request allowance, **not a currency guarantee**. Review
current provider pricing before setting it. There is no model discovery, arbitrary
provider URL, browser credential, or provider call inside an incident transaction.

For model request parameters, consult the
[OpenAI embeddings API](https://developers.openai.com/api/reference/resources/embeddings/methods/create).
No live provider request was made for this implementation.

## Database release and vector capability

Root release **v65/65** appends `techdeck_resolution_semantic_tables` after the
immutable v64 manifest. Two additive tables store organization settings and
source-bound embedding chunks. Each chunk binds tenant, incident, source revision
and version, search document, chunk offset, original projection hash, screened
input hash, redactor, provider, model, dimensions, settings version and queue
generation. A composite FK prevents foreign-tenant or foreign-revision references.
Uniqueness, dimension/finite-value checks and a tenant/revision index are included.
The SQL release and Drizzle declarations describe the same storage.

The vector array is stored as PostgreSQL `real[]` and explicitly cast to
`public.vector` only within enabled retrieval. This deliberate refinement of the
phase plan makes the root release portable to plain PostgreSQL. The supported
release/startup path **never installs an extension**. It does not require pgvector
for ordinary search or startup. An already installed pgvector extension in the
public schema is required to activate semantic search. Read-only capability
checks inspect server version, `pg_available_extensions`, `pg_extension`, database
CREATE permission and role privilege before any disposable test extension DDL.

The separate vector CI job uses pgvector 0.8.2 / PostgreSQL 16, pinned to
`pgvector/pgvector@sha256:00ba258a66dac104fd5171074a0084462a64a1369d8513f3d0a634e2f24d15bc`.
The full release gate retains plain `postgres:16-alpine`. These are different
acceptance environments. Extension provisioning on a Replit database requires
its own capability review and authorization, and was not attempted here.

Follow [the backup/release runbook](../DATABASE_BACKUP_RESTORE.md): backup, root
`db:plan`, separately authorized `db:apply`, unset apply mode, then `db:verify` on
each target database. Publish only after v65/65 verification and exact revision
CI. Rollback is restore into a new database and validated traffic switch; there
is no destructive down migration. Disabling the feature requires no data loss.

## Access, privacy and stale data

Native platform session, tenant, module entitlement and write guards remain in
force. Organization configuration and incident indexing require administrator
or owner access; the incident's own minimum role still applies. Portal users and
headless import tokens cannot use semantic settings/indexing. Jobs reload current
membership, active account/tenant/module access, portal exclusion and incident
access before provider use and again before storing a result. A revoked query
actor receives denial after a pending provider call, not stale authorized results.

Source acceptance screening is repeated over the complete selected projection
before chunking. Basic egress masking covers known client/organization/technician
labels and hostnames, email addresses, URLs, user-profile paths and IPv4-shaped
strings. It is **not comprehensive de-identification**; reviewed excerpts may
still contain other personal or customer information. IPv4-shaped Windows build
identifiers can be masked in semantic input; their exact search remains intact.
Raw JSON, human reports, unknown fields, separate command records and artifact
references are excluded. Text inside an action description may still quote a
command, visible in the preview; it is inert and never executed.

Jobs contain only embedding ID and generation. Queries/excerpts/provider response
bodies are absent from audit and job metadata. Safe failure codes are visible;
provider errors cannot reflect submitted evidence or credentials. Chunks contain
no second copy of excerpt text. No imported evidence is automatically sent,
including after reprocessing. Concurrent retries are at-least-once provider
attempts, conservatively charged to the cap; this is not a provider exactly-once
delivery guarantee.

## Retrieval policy `hybrid_v2_exact_first`

1. Materialize the authorized current-revision incident set, including client,
   device, review and validation filters, before all scoring and graph expansion.
2. Find typed exact identifiers and existing full-text matches. Component names
   provide structured overlap. Supported graph edges add a small bounded signal;
   the target incident must also be visible/current.
3. For an explicitly requested, available semantic query, consider only current,
   hash-matching, compatible, ready chunks under active organization settings.
   Search is exact cosine distance with no HNSW/IVFFlat index. Collections over
   2,000 eligible chunks fall back with `narrow_filters` before query egress; the
   retrieval statement also bounds its candidate set against concurrent growth.
4. Sort exact matches first, then descending exact-match count. Within that tier,
   score = `text/(1+text) + 0.25*max(0,cosine) + 0.02*min(components,3)
   + 0.01*min(supportedEdges,3)`, then stable creation time and ID tie-breaks.
   Semantic-only candidates require cosine at least 0.55. These initial policy
   weights and cutoff require live judged evaluation before production activation.
5. Return component scores, exact/component explanations and page-scoped groups
   for best matches, exact errors, similar incidents, known fixes, failures and
   warnings. A known fix requires completed remediation and validation, no pending
   follow-up, at least one recorded successful validation and no failed/pending
   validation. No inference turns the CAM WAL case into a fully validated fix.

Provider disabled/unavailable, missing vectors, incompatible models, daily cap,
oversized query and absent pgvector all retain exact/text search with explicit
status. There is no embedding/query cache and each requested page can consume
another query request. Linked knowledge keeps the existing permission-aware
document routes; documents are not a second independent vector corpus in Phase 5.

Exact search and filtered-recall tradeoffs follow the
[pgvector search documentation](https://github.com/pgvector/pgvector#querying).
The CI fixture uses labeled synthetic vectors to verify mechanics and judgments
(exact-error priority, warning preservation, no pending case promoted to known
fix). It does not establish real model recall, relevance or production latency.

## Native API additions

All paths below are relative to `/v1/modules/techdeck/resolution-intelligence`.
The existing authenticated web proxy uses `/api/modules/...`.

| Method/path | Contract |
| --- | --- |
| `GET /semantic` | Provider identity/state, organization enablement, current version and request/candidate limits; no credentials |
| `PUT /semantic` | Admin/owner: `enabled`, `dailyRequestLimit`, `expectedVersion`; enabling also requires `egressReviewed: true` |
| `GET /incidents/:id/semantic` | Visible incident's current chunk counts and safe failure codes |
| `POST /incidents/:id/semantic/preview` | Admin/owner: `expectedVersion`; returns exact excerpts, provider, count and preview checksum; local only |
| `POST /incidents/:id/semantic/index` | Admin/owner: `expectedVersion`, `previewSha256`, `privacyReviewed: true`; queues reviewed chunks atomically |
| Existing `GET/POST /search` | Optional `semantic: "1"` explicitly permits a query embedding; POST is preferred for diagnostic text |

Unknown fields fail closed. Cross-tenant/hidden incidents are not enumerated.
Existing read-only viewers retain short exact/text queries in the UI. Native API
read access can explicitly request semantic matching subject to all existing
tenant/role and usage checks. There is no headless semantic or provider-config API.
