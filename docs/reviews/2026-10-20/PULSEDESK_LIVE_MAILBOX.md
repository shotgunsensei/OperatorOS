# PulseDesk delegated mailbox adapter checkpoint

Base: `520cc585b7efe887b0da06132b2981c2e5e576cf` (tree
`41a8ce76a9bfd7c4249a29b74b626c004933bab0`). This component is source work,
not a deployment, provider connection, entitlement grant, or production acceptance.
The parent integration owns PLANS, implementation status, module parity and shared
release notes. This checkpoint does not mark all-module parity complete.

## Problem and resulting behavior

The base returned unavailable for every live mailbox connector and poll. The
preserved PulseDesk source already establishes delegated Google Workspace and
Microsoft 365 OAuth over IMAP. This change retains both contracts and implements
the canonical OperatorOS path using maintained ImapFlow and Mailparser, the
existing tenant vault, durable jobs and transactional request ingestion.

Availability remains false unless the API owns the exact maintained dependency
pins, both complete modules load successfully and the existing shared vault has
live encryption configured. A tenant additionally needs its approved live OAuth
provider application, callback readiness and current module/manager authority.
There is no child-source, host-path, custom IMAP/MIME or deterministic-provider
fallback in the live adapter. Unsupported live SendGrid/generic IMAP remains 503.

## Source boundaries

- `pulsedesk-mailbox-adapter.ts`: exact established OAuth URLs/scopes and fixed
  TLS IMAP hosts; single-use-state/PKCE material, bounded token responses,
  refresh rotation, maintained client/parser integration and generic errors.
- `pulsedesk-mailbox-vault.ts`: provider tokens and pending PKCE material use
  bounded encrypted parts in the existing vault. Every manifest/part binds tenant,
  module, provider, connector and purpose. Public connector JSON and browser
  responses never contain tokens, client secrets, PKCE verifier or vault pointers.
  Its internal fixed module key is resolved server-side from the exact
  `pulsedesk` slug to the canonical UUID before any shared-vault operation.
  Missing/malformed registry identity fails closed. App configuration retains the
  existing tenant-global or exact PulseDesk UUID scopes; the selected config and
  its secret must have identical module scope, tenant and provider purpose.
- `pulsedesk-mailbox-service.ts`: actor-bound expiring OAuth claim, connector
  generation checks around provider awaits, provider-application binding,
  persisted per-connector poll lease, transactional ticket/dedup/cursor writes,
  replay-safe acknowledgement and scoped disconnect.
- `pulsedesk-literal-routes.ts`: existing HTTP guards remain. Queued live work
  requires its actual requestor and reuses `resolveTenantModuleAccess`, current
  membership and canonical role aliases. Missing/deleted/read-only/removed access
  cannot inherit connector-creator authority. Current authority is checked before
  provider work and after awaited provider operations before projection/ack.
  Both queue modes allocate the canonical module UUID; the worker binds that
  same UUID before looking up the tenant's connector. Central authorization and
  catalog calls retain their established slug contract.
- `PulseDeskConnectorConsole.tsx`: manager metadata-only setup, provider redirect,
  callback exchange once under StrictMode and immediate URL scrubbing. Browser
  continuation storage contains only connector ID and a bounded expiry. Queued
  import is explicitly presented as queued.

The central identity, entitlement resolver, provider configuration, vault
cryptography, schema/release 67, shared worker, catalog and billing policy are
unchanged. Source provenance is the preserved
`PulseDesk@937849471e489ed23db2a263d04160a388402740` Google/Microsoft connectors.

## Import and recovery contract

Each manual queued poll scans at most 100 UID positions and parses at most 20
unseen messages, with a 2 MiB declared/actual source limit and a 30-second deadline
per owned IMAP connection. TLS certificate validation remains enabled. No raw
MIME, body, attachment contents or provider headers enter the ticket projection.
Existing sensitive-subject and attachment quarantine rules remain; this is not
clinical-data classification, attachment scanning or a compliance certification.

The dedup ID binds connector, UIDVALIDITY and UID. Ticket, claim, sequence, cursor
and activity writes commit together. Only newly created tickets or already
processed duplicates are acknowledged. Rejected/quarantined duplicates remain
unacknowledged. Provider acknowledgement follows the database commit; failed ack
retains pending IDs for retry. A changed UIDVALIDITY cannot mark replacement
messages seen: stale pending ack/cursor is dropped before scanning the new epoch.

Provider/token operations are not database-rollbackable. A successful OAuth code
exchange or refresh followed by database failure may require explicit reconnect;
state is consumed before exchange to prevent replay. A poll failure records a
safe degraded code and preserves recoverable state. Oversized/invalid messages
fail closed rather than being silently skipped. No periodic polling scheduler
was added; existing jobs remain at least once, with local lease/dedup protection.

Disconnect revokes the connector's local encrypted references, state and lease.
It does not revoke the provider's account-wide OAuth grant or change its security
settings. In-flight authorization uses fresh checks at the stated boundaries;
this is not an atomic transaction with concurrent membership/entitlement changes
or an external provider revocation guarantee.

## Dependency provenance and gates

The API pins `imapflow: 1.3.1` and `mailparser: 3.9.8`. Source-only lock translation
uses the already installed original PulseDesk package metadata and npm lock:
46 saved package records, 70 installed edges, 31 newly needed canonical package
and snapshot records, 56 new snapshot edges. There are no new peers, optional
edges or install lifecycle scripts in this saved closure. Compatible existing
Pino transitive resolutions remain canonical (`process-warning 5.1.0`,
`thread-stream 4.2.0`); the preserved original installation uses 5.0.0/4.0.0.
All 2,520 existing lock mappings, security overrides and patches were verified
unchanged, including `follow-redirects 1.16.1`. No advisory exception was added.

This validates source-lock metadata, not a successful frozen install. No package
was acquired, installed, copied into the API or materialized from a cache. The
canonical host closure is absent: the compiled adapter reports unavailable with
both exact packages missing. An approved frozen installation/hosted CI and a
complete canonical runtime build remain gates. Existing host tooling retains
the separately disclosed unrelated follow-redirects 1.16.0 cache difference;
no exact full dependency-graph claim is made for local checks.

## Verification at this checkpoint

- New native controls plus existing PulseDesk static controls: **96 passed**, no
  failures/skips (79 new native cases, 17 existing static cases). Actual service
  and route/helper bodies run with synthetic SQL/vault/provider boundaries;
  Fastify uses actual in-memory HTTP injection. Network entry points are blocked
  and assert zero unexpected calls. This is not actual SQL or real authentication.
- Immutable base route proof: the same first six named HTTP controls produced
  **2 controls passed / 4 expected failures**. Live capability/setup/poll were
  unavailable, and an injected activity failure left the old ingestion's ticket,
  sequence and processed claim persisted. Candidate rollback + identical retry
  and duplicate behavior pass. The immutable source and failure log are retained.
- Maintained-library proof: **11 assertions passed**, actual Mailparser parses
  synthetic encoded MIME; actual ImapFlow constructors/connect reach two replaced
  TLS boundaries for the established hosts. **Zero underlying socket/DNS/fetch
  calls**. Successful IMAP protocol/authentication is not claimed.
- Actual component browser controls: **6 passed**, no retries/skips, cached
  Chromium 1228 / Playwright 1.61.1. Fully intercepted localhost page with a
  synthetic API, StrictMode callback replay, capability/manager gates, both
  providers, queue wording and 1280/390px setup. Screenshots inspected; no overflow
  or unusable controls observed. This does not exercise Next, real API/SSO or OAuth.
- Strict typing of all four new native test files, API typecheck, root lint with
  zero warnings and SDK/API build passed on existing tools. After linking only
  already-existing direct web tools and current SDK source inside the isolated
  task, canonical web typing and the full Next15.5.25 production build passed
  (39 static pages, zero network calls). No maintained mailbox package was linked.
  Complete canonical frozen installation and combined release CI remain gates.
- Actual guarded PostgreSQL acceptance: **7 passed**, no failures/skips, using
  the parent's existing loopback PG16.14 synthetic release67 fixture. Actual
  Fastify auth/tenant guards, encrypted vault, module/global config scopes,
  wrong-module/purpose/tenant denial, state replay/concurrent claim, ingestion
  fault rollback/identical retry/dedup, revoked authority and acknowledgement
  retry passed. A separate explicitly fake-ready route instance also allocates
  the actual shared job with canonical UUID/tenant/requestor/payload, and actual
  `processSharedJob` completes that individually claimed owned row. Wrong-module,
  wrong/missing-actor and foreign-tenant controls do no secret/provider work.
  Default actual HTTP capability remains false/live setup503 before and after.
  The test uses direct owned-row claims, not the global batch/scheduler. Test-only AES key
  and explicit fixture access grants do not prove live encryption, OAuth or paid
  entitlement activation. Owned rows were verified removed and pool closed.
  The canonical module row was read only, without module/schema changes.

The first SQL attempt's seven setup failures exposed the slug/UUID mismatch;
the actual FK failure was captured as sanitized SQLSTATE23503. This checkpoint
corrects that source boundary. A subsequent run passed6/7: its final assertion
reused a synthetic message ID across mailboxes and correctly hit existing dedup.
After mailbox-scoped fixture IDs, all7 passed. Failed receipts remain; earlier
17-file approval is historical and the corrected candidate requires fresh review.
Refreshed review also found the same slug/UUID error in queue allocation and
worker binding. The preserved v3 route with the expanded SQL proof passed6
controls and failed the actual shared-job insert (500 instead of202). The final
queue correction passes all7 expanded cases. Earlier direct-service SQL coverage
did not exercise live enqueue and must not be interpreted as proving that path.

Evidence, exact commands, environment failures and frozen raw/Git blob hashes:
`evidence/resume-oct20/PulseDesk/` in the parent task workspace. Failed preliminary
tool resolution/type annotations are recorded separately; no install was used to
resolve them. This source checkpoint remains uncommitted pending independent
review and the parent's integration/publication decision.

## Controlled acceptance and human gates

1. Review this exact source/lock candidate; run a permitted canonical frozen
   dependency install and full combined release gates. No production schema
   migration is introduced or authorized by this component.
2. Use an explicitly owned controlled workspace with existing PulseDesk access
   and manager authority, live shared-vault encryption and an approved Google or
   Microsoft provider application. Provider consent/verification, IMAP access,
   app callback registration and test-mailbox approval remain owner-controlled.
   The parent already coordinates that approval; this checkpoint makes no new ask.
3. Validate the registered HTTPS callback, current actor/tenant, rejected replay,
   wrong-tenant denial, redacted API/log/browser output and actual IMAP identity.
4. Import synthetic operational mail from the approved test mailbox. Confirm
   bounded batches, one request on replay, hashed sender/minimal summary, no raw
   message/attachment persistence, attachment quarantine, provider seen flags,
   refresh/reconnect, failed-ack retry and revoked queued authority.
5. Confirm disconnect and owner-approved recovery/rollback. A source revert keeps
   existing direct/protected intake available and adds no DDL, but persisted token
   references/provider grants require their normal controlled revocation policy;
   no data deletion or provider revocation is implied by reverting code.

No production/mailbox/provider/recipient operation, credential creation,
OAuth grant, deployment, settings change, acquisition, commit or publication was
performed in preparing this checkpoint. Real acceptance remains required before
advertising live mailbox import as operational. Database execution was limited to
the explicitly approved task-owned synthetic fixture and its scoped cleanup.
