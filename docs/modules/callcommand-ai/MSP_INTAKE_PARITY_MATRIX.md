# CallCommand AI MSP intake and Automation Fabric matrix

## Local SupportLink email-intake follow-on — 2026-10-28

Branch `codex/callcommand-supportlink-intake-oct28` follows preserved `c86af167f33a6c691517b5b9c4ce9dd865e24151`. First-contact AI offers optional SupportLink or unverified first/last name/company/contact and incident details. Exactly two failed guesses per call then manual fallback; retries/reconnects preserve the bound. Code-resolved Directory details are server-only for email composition, never voice readback/authentication or privileged access. Eight-digit display-once issuance reuses the existing encrypted SupportLink storage, defaults disabled, preserves active legacy ten-digit codes and does not count as A1 readiness.

Intended mailbox is user-confirmed `support@xodus-is.com`, not a live-delivery proof. The authenticated service sender is preserved. Stable CallCommandAI/call-ID subjects support only server-mapped company routing tags; manual or ambiguous cases are UNVERIFIED. No caller From/Reply-To spoofing, magic BMS fields, direct-adapter activation, automatic Contact association or ticket-created claim. Actual BMS sender/account/contract/SLA/Unknown/workflow behavior requires controlled acceptance.

Final local proof: **113 tests passed, zero failed/skipped across ten DB-free files**; strict test compilation including three PostgreSQL files, API emitted compilation, zero-warning backend lint, focused web TypeScript and web lint pass. Existing installed modules/framework declarations were reused offline; no acquisition, canonical lockfile/full-Next-build or browser acceptance claim. PostgreSQL files are **typechecked, NOT RUN** under the retained engine-access hold. No real codes, credentials, mail/calls, configuration, production data, migration, PR approval, push/CI/merge/deployment. Existing source-publication/PR136 and other holds remain.

See `docs/callcommand/SUPPORTLINK_EMAIL_INTAKE_2026-10-28.md` and `evidence/callcommand-supportlink-oct28/CANDIDATE.json` outside the source checkout for exact source/checks and remaining activation/live gates. Earlier documents remain historical evidence for their own frozen candidates.

## Local first-contact MSP voice follow-on — 2026-10-28

Branch `codex/callcommand-first-contact-oct28` follows preserved associated-MSP candidate `b1848f2e0910d7a22ccb3b34ef7b5cbf7b4c1351`. Unknown, parseable-number callers can enter bounded A0 AI intake without SupportLink after signed carrier/exact-line routing and required consent. Exact-line allowlist is absent by default; no live activation occurred. No identity/customer association, private knowledge, CRM/BMS/device/account authority or generic post-call automation is granted. One unassociated local request and optional existing unambiguous support mailbox notification remain explicitly unverified/manual-association work. Existing A1 route is preserved.

Final local evidence: **103 passed, zero failed/skipped** across nine DB-free files, strict test compilation including both prepared PostgreSQL journeys, API emitted compilation and zero-warning scoped lint. Checked runtime/test hashes are unchanged. Existing modules were reused with all network blocked and no provider credentials inherited; no install or full frozen-lockfile/monorepo/live acceptance claim. The new actual-PostgreSQL journey is **typechecked, not run** because the retained Docker engine access block remains held. Real voice quality, carrier/consent/transfer behavior, mailbox/PSA receipt and target production schema/recovery remain unverified. No push/PR/approval/CI/deployment, credentials, production data or migrations.

See `docs/callcommand/UNVERIFIED_FIRST_CONTACT_2026-10-28.md` for complete scope, source controls, provider truth and exact remaining gates. The prior source-publication refusal and PR136 hold are unchanged. This section supersedes earlier A0 source-availability statements only for the disabled local candidate, not for production.

## 2026-10-28 — Associated MSP Realtime intake, not production acceptance

The local follow-on retains the signed trusted-line/SupportLink association and
uses existing realtime, managed-number, module, billing, capacity and consent
gates before SIP. Confirmed intake records one local MSP case and queues the
configured support email. It does not also invoke BMS or offer device/identity
actions. General calls retain their existing action/intake behavior. Unrecognized
A0 callers remain in the existing restricted callback/manual-support flow.

DB-free 93/93, no skips; exact-head compilation/lint receipts are external.
The prepared actual-PostgreSQL journey is unrun. No parity-count promotion,
mailbox/PSA acknowledgement, real human connection or deployed acceptance is inferred.
[Contract and precise outstanding gates](../../callcommand/MSP_REALTIME_INTAKE_2026-10-28.md).

Date: 2026-08-13

Authority: the owner-supplied CallCommand MSP breakdown, ADR-0040, the OperatorOS SSO/ecosystem contracts, and the cumulative OperatorOS release contract.

Status vocabulary:

- `ACTIVE_NATIVE`: executable in the current source/local product.
- `ACTIVE_SHARED_EQUIVALENT`: executable through an authoritative shared OperatorOS capability.
- `GATED_PROVIDER`: code/data boundary exists, but a provider-specific live acceptance gate is open.
- `GATED_SECURITY_PHASE`: deliberately unavailable until the listed security phase is implemented and accepted.

| ID | Required outcome | Current outcome | Status | Executable evidence | Remaining gate |
| --- | --- | --- | --- | --- | --- |
| CC-MSP-001 | OperatorOS remains identity, session, tenant, role, entitlement, billing, registry, launch, and audit authority | MSP routes use trusted tenant/module/admin guards and platform audit; no child login/billing/role path exists | ACTIVE_SHARED_EQUIVALENT | `tenant-auth.ts`, `audit.ts`, `callcommand-msp-routes.ts` | Deployed exact-host acceptance |
| CC-MSP-002 | Paid MSP module with ticket-first safe default | MSP settings default to `TICKET_ONLY`; privileged toggles are server-forced off | ACTIVE_NATIVE | `callcommand_msp_settings`, settings route/UI | Final price/tier metadata and checkout acceptance |
| CC-MSP-003 | Dedicated Twilio MSP intake number | Exact active channel with `product_mode='msp'` is required | ACTIVE_NATIVE | inbound route and `callcommand_channels` | Provision reviewed production number |
| CC-MSP-004 | Reject forged Twilio callbacks | Official SDK validates signature over exact public URL/query and all form fields before tenant mutation | ACTIVE_NATIVE | `verifyTwilioSignature`, signed/forged tests | Real provider fixture in target deployment |
| CC-MSP-005 | Resolve tenant only from exact destination number | Global exact active-channel `To` match; body/header tenant values are ignored | ACTIVE_NATIVE | inbound SQL and tenant-override rejection | Deployed multi-number negative test |
| CC-MSP-006 | Associate organization from approved originating line | E.164 line sealed in vault and indexed by tenant HMAC; admin verification/cooldown/status are persisted | ACTIVE_NATIVE | trusted-line routes/tables/tests | Carrier/PBX evidence per customer |
| CC-MSP-007 | Limit unrecognized callers to callback/human/general information | A0 unrecognized path creates a local callback case only; no BMS outbox or automation | ACTIVE_NATIVE | unrecognized route and DB test | Deployed transfer/callback operating procedure |
| CC-MSP-008 | Associate eligible contact with SupportLink | Active SupportLink must match tenant, organization, contact profile, Directory contact, expiry, lock, and status | ACTIVE_NATIVE | support-link route and DB test | Approved delivery/rotation procedure |
| CC-MSP-009 | Ten-digit checksum, rate limits, display once, rotate/revoke | Random Luhn ID, keyed lookup, encrypted secret, 10/5 per 15 minutes, three-attempt call lock, transactional rotation | ACTIVE_NATIVE | domain/service/routes/tests | Operational rotation drill |
| CC-MSP-010 | Reuse Business Directory contacts/organizations | CallCommand extension profiles use composite tenant FKs; Directory remains canonical | ACTIVE_SHARED_EQUIVALENT | Directory FKs and workspace selectors | Production data reconciliation |
| CC-MSP-011 | Assurance levels A0-A4 | Persisted assurance plus policy ranking/reason codes; SupportLink produces A1 only | ACTIVE_NATIVE | domain policy and context schema | A2-A4 verification/approval implementation |
| CC-MSP-012 | Capture and classify natural-language issue safely | Deterministic bounded classification redacts passwords/codes/SSNs/payment-like numbers; security language escalates | ACTIVE_NATIVE | `classifyMspIntake`, domain tests | Optional reviewed AI enrichment, not required for correctness |
| CC-MSP-013 | Create durable local case before provider work | Exactly one tenant-scoped case and human-safe reference per call context | ACTIVE_NATIVE | `createLocalCase`, unique context/reference constraints | Deployed persistence/restart acceptance |
| CC-MSP-014 | Create Kaseya BMS ticket exactly once | Idempotent BMS outbox and ticket link; deterministic test adapter records `TEST_RECORDED`; live remains blocked | GATED_PROVIDER | BMS outbox/link tables and DB replay test | Tenant Swagger/auth/mappings/worker/reconciliation/live acceptance |
| CC-MSP-015 | Technician screen-pop | Workspace lists live organization/contact/assurance/state/case context with masked caller data | ACTIVE_NATIVE | MSP Operations UI/workspace query | Deployed workstation/mobile operator acceptance |
| CC-MSP-016 | Tamper-evident call audit | Monotonic previous-hash-linked call ledger plus platform audit for admin mutations | ACTIVE_NATIVE | `appendMspCallEvent`, hash-chain DB test | Monitoring/export/retention operations acceptance |
| CC-MSP-017 | Central allow/deny/challenge/approval policy | Deterministic policy covers tenant equality, line/contact, assurance, target class/affinity, health, incident mode, approval, risk | ACTIVE_NATIVE | `evaluateMspPolicy`, policy tests/UI | Provider-backed A2/A3 execution journey |
| CC-MSP-018 | BMS, Datto, Graph, AD broker, and Verify onboarding | Tenant/org-scoped integration records, sealed credentials, schema fingerprints, health reasons, circuit/kill switches | ACTIVE_NATIVE | integration routes/tables/UI | Each provider stays gated until its acceptance matrix passes |
| CC-MSP-019 | Read-only Datto health after verification/device affinity | Datto site/device/affinity model and R0 catalog vocabulary exist; no read adapter is advertised | GATED_PROVIDER | Automation Fabric schema and Phase 2 onboarding UI | Datto API v2 sync, rate limits, A2 and target-affinity acceptance |
| CC-MSP-020 | Fixed reversible RMM action catalog | Strict versioned manifest, fixed component UID, system-only parameters, risk/OS/device/expiry/result contracts; drafts only | GATED_SECURITY_PHASE | manifest validator/catalog table/admin route | Phase 3 provider submission/result/reconciliation/approval |
| CC-MSP-021 | Secure cloud identity reset | Account classification and opaque reset-session schema exist; settings force reset off | GATED_SECURITY_PHASE | directory-account/reset-session tables and UI gate | Phase 4 secure browser flow, Graph permissions/audit, prohibited-account tests |
| CC-MSP-022 | Outbound-only on-prem AD broker | Integration type/outbox response vocabulary exists; no broker request is emitted | GATED_SECURITY_PHASE | integration/outbox schema and onboarding gate | Phase 5 broker design, signatures, protected groups, expiry/replay and security review |
| CC-MSP-023 | Durable idempotency/outbox/reconciliation | Call, webhook, local-case, BMS, action-request, execution, and outbox uniqueness contracts are tenant scoped | ACTIVE_NATIVE | database constraints/service/tests | Live worker lease/retry/dead-letter operations acceptance |
| CC-MSP-024 | Rate limits, circuit breakers, incident and provider kill switches | Durable SupportLink rate windows, incident/manual mode, per-integration circuit fields and kill switch | ACTIVE_NATIVE | schema/routes/UI/tests | Deployed alarm and kill-switch drill |
| CC-MSP-025 | Operations, organizations, contacts, integrations, action catalog/policy, audit, onboarding UI | Responsive dark MSP command center exposes all requested product surfaces and honest states | ACTIVE_NATIVE | `CallCommandMspWorkspace.tsx`, route map/static tests | Compiled/deployed desktop/mobile/accessibility acceptance |
| CC-MSP-026 | Production onboarding checklist | Six explicit gate groups cover telephony, customer mapping, BMS, Datto, privileged action, and identity reset | ACTIVE_NATIVE | onboarding UI and Phase 37 report | Human evidence for each target environment |
| CC-MSP-027 | Test forged/replay/cross-tenant/rate/policy/provider-truth behavior | Domain/static/database journeys cover signed/forged calls, A1, unrecognized A0, exactly-once BMS test ticket, hash chain, isolation, secret rejection | ACTIVE_NATIVE | `callcommand-msp-*.test.ts`; focused 14/14 and CallCommand 80/80 | Full broad/build/release/browser evidence recorded separately |

## Current classification

- Active native outcomes: 19.
- Active shared-equivalent outcomes: 2.
- Provider-gated outcomes: 2.
- Security-phase-gated outcomes: 3.
- One outcome combines active local test/idempotency behavior with a live provider gate: CC-MSP-014.
- No later-phase provider action is classified as live or production-ready.

This is an owner-spec capability matrix, not a replacement for the Phase 35 compiler-derived source parity ledger. Phase 35 proves preservation of the existing CallCommand product; this matrix proves deliberate implementation and gating of the new MSP product contract.
