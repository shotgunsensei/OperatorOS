# ADR-0040: CallCommand MSP intake and bounded Automation Fabric

- Status: Accepted for source/local Phase 1 implementation; later automation phases remain gated
- Date: 2026-08-13
- Decision owners: OperatorOS product, MSP operations, security, and platform owners
- Extends: ADR-0025 and ADR-0039
- Does not supersede: OperatorOS identity, tenant, entitlement, billing, provider, and audit authority

## Context

CallCommand must become a paid managed-service intake product rather than a generic voice assistant. The requested product associates a caller with a managed organization and an eligible support contact, captures a plain-language issue, creates a durable local case, submits a ticket to an accepted Kaseya BMS adapter exactly once, presents an operator screen-pop, and eventually permits a deliberately small set of Datto RMM and identity actions.

Telephone caller ID and a reusable customer identifier are useful association signals, but neither is sufficient authentication for device or identity mutation. The product must withstand forged webhooks, spoofed or reassigned originating numbers, SupportLink guessing, cross-customer resource selection, provider retry, action replay, partial provider failure, and unknown execution outcomes. It must never accept a hostname, username, arbitrary command, component UID, password, one-time code, or privileged target directly from caller speech as authoritative execution input.

The existing OperatorOS runtime already owns exact-host sessions, tenant and module access, the Business Directory, encrypted secret references, provider control-plane records, shared audit/activity, call configuration, Twilio callbacks, persistent call records, and the cumulative database release. Duplicating those systems inside CallCommand would weaken the ecosystem boundary.

Provider contracts are not interchangeable or safely inferable. Twilio signs the exact webhook URL and all posted fields. Kaseya BMS exposes tenant- and region-specific API/Swagger contracts and mappings. Datto RMM API v2 has explicit OAuth, permission, and rate-limit behavior; current public documentation does not justify claiming arbitrary quick-job result retrieval. Microsoft Graph password mutation requires separately approved application permissions and a secure browser flow. On-premises Active Directory requires a separately deployed, outbound-only broker. Missing provider acceptance must therefore remain a visible unavailable state rather than a simulated success.

## Decision

### 1. Product and authority boundary

CallCommand owns MSP call intake, organization/contact association, local case state, policy evaluation, approved action requests, provider execution evidence, and technician-facing MSP workflow. OperatorOS remains the sole authority for:

- user identity, credentials, sessions, tenants, memberships, platform roles, and module entitlements;
- the canonical Business Directory organizations, contacts, sites, and relationships;
- subscription and add-on billing;
- module registry, launch, exact-host SSO, and return navigation;
- shared encrypted secret storage and platform audit;
- provider onboarding authority and production release state.

CallCommand profile tables extend Directory records by composite tenant foreign key. They do not create a second customer, contact, login, role, billing, or entitlement system.

### 2. Phased capability contract

The product is delivered in five explicit phases:

1. **Paid MSP intake** — signed Twilio intake, exact destination-to-tenant routing, approved-line organization association, SupportLink contact association, deterministic issue classification, local case creation, BMS outbox, operator screen-pop, and hash-linked evidence.
2. **Read-only device health** — independently synchronized Datto sites/devices, confirmed contact-to-device affinity, A2 verification, and approved read-only catalog entries. This phase is onboarding-gated.
3. **Reversible workstation action** — expiring requests, exact target binding, explicit caller confirmation, policy decision, optional technician approval, approved fixed components, idempotent execution, and unknown-result handling. This phase is provider-gated.
4. **Cloud identity reset** — standard cloud-only account, A2 or stronger verification, secure short-lived browser reset session, prohibited-account checks, and Microsoft Graph audit. This phase is security-review-gated.
5. **On-premises AD broker** — outbound-only broker, signed and expiring requests, allowlisted actions, protected-group checks, replay defense, and broker result reconciliation. This phase is broker-gated.

Phase 1 is the only capability activated by this decision. Later-phase persistence, configuration screens, policy vocabulary, and onboarding gates may exist so the architecture does not require a rewrite, but no later provider action may be presented as available until its acceptance gates pass.

### 3. Call state machine

Each inbound MSP call owns one `callcommand_msp_call_contexts` row and a monotonic event ledger. The Phase 1 recognized path is:

`RECEIVED -> PROVIDER_VERIFIED -> TENANT_RESOLVED -> ORIGINATING_LINE_EVALUATED -> ORGANIZATION_MATCHED -> SUPPORT_ID_REQUESTED -> CONTACT_ASSOCIATED -> INTENT_CAPTURED -> LOCAL_CASE_CREATED -> BMS_TICKET_QUEUED -> COMPLETED`

The unrecognized path is:

`RECEIVED -> PROVIDER_VERIFIED -> TENANT_RESOLVED -> ORIGINATING_LINE_EVALUATED -> UNRECOGNIZED_LINE -> CALLBACK_REQUESTED -> LOCAL_CASE_CREATED -> COMPLETED`

An unrecognized caller receives callback, general-information, or human-support options only. That path remains A0, has no organization/contact association, and never queues BMS or an automation action.

Invalid SupportLink attempts transition through `SUPPORT_ID_INVALID`; retry exhaustion or a rate-limit block transitions to `LOCKED`. The server validates every state transition and rejects state skipping. Provider retries are deduplicated before external work.

### 4. Telephony and association controls

- Every public MSP webhook validates `X-Twilio-Signature` with the official Twilio SDK before resolving or mutating tenant state.
- The canonical signature URL uses the configured public base URL and the exact request path/query.
- Tenant selection comes only from an exact active CallCommand channel `To` number with `product_mode='msp'`.
- The `From` number is normalized, stored through the shared encrypted secret vault, and indexed by a tenant-scoped HMAC. Browser responses contain only the last four digits.
- A recognized number associates an organization; it does not authenticate a contact and the IVR does not announce the organization name before contact association.
- New or rotated lines enter a 24-hour cooldown and require documented administrator verification. Intake association may operate after verification, while later automation policy still treats an incomplete cooldown as manual-only.

### 5. SupportLink contract

SupportLink is a random ten-digit, Luhn-checksummed contact-association identifier. It is:

- generated server-side;
- displayed once at issuance;
- encrypted in the shared secret vault;
- looked up through a keyed HMAC, never a plaintext or fast unhashed database value;
- bound to one tenant, organization, active Directory contact, and active CallCommand contact profile;
- rotatable, expiring, revocable, suspendable, and temporarily lockable;
- excluded from URLs, call transcripts, audit evidence, browser workspaces, and speech playback.

Issuing a replacement revokes the previous SupportLink row and its encrypted secret reference in the same database transaction. The retry policy is at most ten line attempts and five identifier attempts per fifteen minutes, with the call locked after three failed attempts. Generic failure language prevents organization/contact enumeration.

Successful SupportLink association establishes A1 only.

### 6. Assurance and policy

The assurance levels are:

- **A0** — provider-signed call and tenant resolution only;
- **A1** — trusted organization line plus active SupportLink/contact association;
- **A2** — A1 plus an independent challenge to a previously registered destination or authenticator;
- **A3** — A2 plus required manager/technician approval for the requested action;
- **A4** — security-administrator oversight for high-impact security administration; not a caller self-service level.

Ticket-first intake is available at A1 for recognized customers. Any Datto or identity mutation requires at least A2. Policy evaluates trusted line state/cooldown, contact eligibility, organization equality, action risk, device class and online state, device affinity, account classification, integration health, incident mode, approvals, confirmation, and request expiry.

Cross-tenant targets are denied. Privileged, service, shared, break-glass, terminated, or unknown accounts are manual-only or denied. Caller-triggered server actions are manual-only. R4 destructive/privilege actions are denied. Incident mode and provider kill switches narrow the system to ticket/manual behavior.

### 7. Approved action catalog

No request may contain arbitrary executable content. An action must be an administrator-reviewed, versioned catalog record with:

- a stable action key, provider, component UID where applicable, component version, and source commit;
- a risk class and minimum assurance;
- allowed device classes and operating systems;
- online/offline behavior, expiry, maximum runtime, confirmation, and approval requirements;
- a strict result contract;
- only system-owned component parameters: `ExecutionId` and `NotAfterUtc`.

Action keys containing arbitrary-command, endpoint-security-disable, BitLocker, wipe, or local-admin semantics are rejected. Catalog writes produce drafts only in this phase; no route activates or executes them.

### 8. Cases, BMS, outbox, and provider truth

A local case is created before any BMS request and has a human-safe correlation reference. The BMS operation is keyed by call context and stored in `callcommand_integration_outbox`, so retries cannot create a second local case, outbox record, or ticket link.

`TEST` mode is permitted only in `APP_ENV=test` and records a deterministic `TEST_RECORDED` ticket link. It does not claim a live Kaseya ticket. `LIVE` mode remains `DEGRADED` or `BLOCKED` until the tenant Swagger fingerprint, credentials, mappings, scopes, idempotency, reconciliation, and worker acceptance pass. No synthetic live ticket number is returned.

The same truth rule applies to Datto, Graph, and the AD broker: queued, unknown, expired, failed, and blocked are first-class outcomes. Success requires provider-confirmed evidence.

### 9. Secret and integration configuration

Raw trusted numbers, SupportLink IDs, verification destinations, hostnames, UPNs, and provider credentials use the shared encrypted secret vault. Rotation revokes the prior secret reference. Integration browser responses omit secret-reference IDs and secret data.

`publicConfig` is bounded and recursively rejects credential-like keys. Credentials may only enter the sealed `credentials` field. Tenant Swagger documents are hashed for drift detection and not stored as credentials or returned as readiness proof.

### 10. Evidence and audit

Each call event stores sequence, actor, outcome, policy version, safe evidence, correlation IDs, the previous event hash, and the current SHA-256 event hash. Provider payloads and SupportLink values are not copied into the evidence ledger. Administrator mutations also use the OperatorOS platform audit writer.

The hash chain is tamper-evident application evidence, not a claim of an external notarization service. Row-level security is enabled on the primary MSP tables as defense in depth; server-side tenant predicates and composite tenant foreign keys remain the enforced application boundary.

### 11. User experience

The CallCommand workspace makes the MSP product primary and exposes:

- live intake operations and screen-pop;
- organization support profiles and trusted lines;
- Directory contact mappings and SupportLink issuance/rotation;
- integration onboarding, health reason codes, and kill switches;
- assurance/action policy and explicit prohibited actions;
- deterministic intake lab without fake provider success;
- hash-linked call evidence;
- production onboarding gates for every later phase.

Unavailable capability language is explicit. The interface never presents an inactive action, disconnected provider, test fixture, or queued result as a successful live automation.

## Consequences

### Positive

- The paid Phase 1 intake path is useful without waiting for privileged automation.
- The data model supports later phases without creating a second identity, billing, tenant, directory, secret, or audit system.
- Association, assurance, action selection, provider execution, and result evidence are separate boundaries.
- Provider retries and partial failures cannot silently duplicate tickets or actions.
- Customers and technicians see concrete onboarding gaps instead of deceptive green states.

### Costs and constraints

- Production BMS, Datto, Graph, Twilio Verify, and AD-broker work requires provider- and tenant-specific acceptance rather than generic configuration alone.
- A telephone call plus SupportLink remains insufficient for privileged action; users must complete a separate challenge.
- Operations must maintain line ownership evidence, SupportLink delivery/rotation, contact eligibility, target mappings, approved catalog entries, kill-switch drills, and reconciliation queues.
- Hash-linked application evidence improves tamper detection but does not replace database backups, restricted database access, or external monitoring.

## Data migration and rollback

Database release v46 adds the MSP and Automation Fabric tables after the existing v45 cumulative release. It contains no table drop, truncate, broad update, or imported child migration. Directory, existing CallCommand, and shared platform rows are preserved.

Application rollback is traffic/release rollback to the previous artifact while retaining v46 tables. Newly created Phase 1 records remain dormant and auditable. Production schema removal is not an automatic rollback path; any later removal requires a separately reviewed retention/export/destructive migration decision.

Before production apply, operators must perform a fresh logical backup, checksum it, restore it into an isolated database, apply v46 there, validate counts/FKs/readiness, and record the rollback decision. Production provider activation and data reconciliation are separate human gates.

## Required acceptance before widening capability

- **Phase 1 live:** deployed exact-host SSO, signed real Twilio fixture, exact `To` routing, recognized/unrecognized paths, SupportLink retry/rotation, BMS accepted schema/mappings, exactly-once ticket proof, screen-pop, logout, backup/apply/restore, and rollback drill.
- **Phase 2:** Datto API v2 read-only onboarding, site/device sync, rate-limit/circuit behavior, A2 challenge, and device-affinity proof.
- **Phase 3:** approved fixed components, confirmation and approval, expiry/replay, provider submission, unknown-result, reconciliation, incident mode, and rollback proof.
- **Phase 4:** Graph permission review, cloud-only standard-account classification, secure browser reset, prohibited-account negative matrix, and identity-provider audit.
- **Phase 5:** signed outbound-only broker, protected-group checks, expiry/replay, broker isolation, reconciliation, emergency disable, and independent security review.

No later-phase toggle may be enabled merely because its table or screen exists.
