# Grounded technician research — Prompt 6

Status: **implementation candidate; synthetic verification only; deployment unverified**.
This continues the original AI Technician Research Assistant specification without
starting a new module or changing the canonical closeout/export contract.

## Technician workflow

Open **Resolution Intelligence → Grounded research**, on the TechDeck host or
the embedded `/modules/techdeck/resolution-intelligence/research` route. Enter a
problem, notes, error, event log, command output or observations. The 6,000-byte
input remains in the POST body. Credentials are rejected.

1. Retrieve a local preview. Existing exact-first hybrid search extracts technical
   identifiers and ranks exact, full-text, component and authorized FixGraph
   evidence. No provider call occurs during preview. The top five incidents and
   up to five current, readable linked KB/runbook records form the evidence set.
   Optional semantic query egress remains the separately approved search flow.
2. Inspect the query, source versions, identifiers and every normalized excerpt.
   Client/organization/technician/device labels, email, IP and user-path masking
   reuse the existing egress redactor. Masking is heuristic and does not establish
   deidentification. Raw exports and unknown extensions are excluded. Commands
   remain inert evidence. Exceeding a row, excerpt or 64,000-byte evidence limit
   rejects the preview instead of silently removing warnings. Narrow to a specific
   incident ID or query when necessary.
3. Approve that preview explicitly, then synthesize. A hash binds the reviewed
   query/evidence, versions, actor, tenant, role, account token version, provider
   selection, contract/redactor and organization settings. Changed evidence or
   permissions require a new review.
4. Review all ten original response sections and open the cited incident or KB.
   Failed approaches, dangerous action flags, side effects, root-cause qualifiers,
   validation/follow-up, and missing/conflicting quality notes are retained by
   the server even when omitted by the model. Temporal association remains an
   association. Pending post-update DISM/SFC is never promoted to a proven fix.

The four labels are **CONFIRMED FROM INTERNAL EVIDENCE**, **SUPPORTED INFERENCE**,
**GENERAL TECHNICAL SUGGESTION**, and **UNKNOWN**. Confirmed output is restricted
to an exact complete source-fact quote: it confirms what the record says, not
independent causation or applicability. Inferences must include exact supporting
quotes and authorized citations. The server validates structure, source identity
and quote membership; it cannot establish the semantic correctness of an inference.
A technician must assess applicability. Proven-fix entries additionally require
the existing validated known-fix predicate and a positive, non-destructive action
without conflicting failure indicators. Draft KBs never grant proven-fix status.
Invalid/unsupported output is withheld. No evidence returns all ten sections as
UNKNOWN without consulting model memory or calling a provider.

Source/query instructions are untrusted data in a fixed system prompt. No tools,
command execution, HTML rendering, arbitrary navigation, production writes or
automatic document publication are available. Results are ephemeral and not
cached or persisted. Refresh/back navigation and edits clear approval/results.
Cancellation stops display of a late response; an already started provider attempt
can still count against the limit.

## Authority, configuration and cost

Native OperatorOS session, current tenant membership, internal technician
audience, module entitlement, write permission and minimum-role visibility are
required. Portals, tenant/module viewers and headless tokens cannot research.
After delayed synthesis the service rechecks account, role, entitlement, portal
assignment, source versions/audiences, provider kill switch and consent. The HTTP
boundary reauthenticates the exact session, including expiry and local logout.
There is no tenant/global evidence cache.

Research uses the central shared AI completion adapter. Operator flag
`TECHDECK_RESEARCH_ENABLED=true` and an available shared adapter are necessary
for real synthesis; the flag defaults off. It does not activate semantic indexing
or change provider credentials. An admin/owner separately approves organization
research egress and a daily request limit (default 20, range 1–100), with optimistic
settings versions. Every request still requires preview approval. This is not a
fixed dollar budget. Before any live enablement, the owner must approve provider
data handling, retention and actual spending/model limits. This branch does not
enable real providers or create new costs.

Attempt reservation locks that tenant's settings row in a short transaction and
records `resolution.research.attempt` before network I/O. Failed/time-out/canceled
attempts consume the cap. Network I/O occurs outside the transaction, is bounded
by the shared adapter's 30-second timeout and 6,000 output-token request limit,
and never retries automatically. Successful validated output records aggregate
token usage and an audit containing hashes/counts/provider, not diagnostic text.

## API and migration

All endpoints are below `/v1/modules/techdeck/resolution-intelligence`:

| Method/path | Body/result |
| --- | --- |
| `GET /research` | Availability, settings version, UTC daily attempt usage; no source evidence |
| `PUT /research` | Admin/owner: `enabled`, `dailyRequestLimit`, `expectedVersion`, `egressReviewed` |
| `POST /research/preview` | `q`, optional `incidentId`; normalized evidence, identifiers, provider and `previewSha256`; no egress |
| `POST /research/synthesize` | Same query/filter plus `previewSha256`, `privacyReviewed:true`; ten validated sections and safe source IDs |

Requests are rate-limited and responses are no-store. Safe errors distinguish
unavailable setup, exhausted daily cap, oversized evidence, stale preview, failed
provider and rejected grounding. Query/evidence are not placed in URLs or logs.

Ordered additive v66 appends `techdeck_resolution_research_tables`, one tenant-PK
settings table with tenant/user foreign keys, positive version and bounded limit
constraints. No historical release step or v65 storage changes. Root `pnpm db:apply`
and current verification include the table; clean apply/reapply is mandatory.
Rollback leaves the additive disabled table in place, disables the operator flag,
and restores the previous compatible app build. Follow the repository backup and
restore procedure before any approved deployment. No production migration or
restore was performed for this candidate.

## Acceptance and limits

Focused synthetic API tests cover local retrieval/private projection, role/tenant
gates, no-evidence/no-call behavior, settings/daily concurrency, quote/citation
rejection, source and authority changes, pending versus proven fixes, provider
failure, prompt-injection-shaped source data and exact-session logout. Playwright
uses isolated Chromium, local TLS exact hosts, synthetic accounts/data and the
strict deterministic provider path. Browser acceptance includes citations,
mobile/desktop accessibility, embedded host, refresh/back and cancellation.

Synthetic checks establish implementation mechanics, not real model quality,
prompt-injection robustness of a live model, real credentials, production costs,
deployed acceptance, or completion of later prompts. See the [prompt ledger](resolution-intelligence-prompt-ledger.md)
for current CI/release evidence and remaining work. AI KB generation (Prompt 7),
mining/analytics (8–9) and the private first-real-incident acceptance (12) remain
separate. TradeFlowKit's paid pilot remains the first-revenue priority.
