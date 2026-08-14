# Phase 37 CallCommand MSP intake and Automation Fabric report

Date: 2026-08-13

Branch: `codex/callcommand-msp-intake`

Release: cumulative database contract v46, final step `callcommand_msp_automation_fabric_tables`

Status: **Phase 1 source/local implemented; release and live providers blocked**

## Outcome

CallCommand now has a paid-MSP intake product layered on the complete Phase 35 telephony product. The implemented Phase 1 associates calls through an exact signed Twilio boundary, an approved originating line, and a display-once SupportLink; creates a local case; queues one BMS operation; exposes a technician screen-pop; and records a hash-linked event ledger. Unrecognized callers can request a callback but cannot reach BMS or automation.

The schema and administration surfaces also establish a bounded MSP Automation Fabric for BMS, Datto RMM, Microsoft Graph, Twilio Verify, and a future on-premises AD broker. Those provider actions are deliberately unavailable until their phase-specific onboarding and security gates pass. Password-reset and Datto-action settings are forced off by the server in this delivery.

## Product surfaces

The authenticated CallCommand workspace now makes these MSP screens primary:

1. Operations: live call state, organization/contact association, assurance level, case reference, and provider exception counts.
2. Organizations: Directory-backed service profiles, support contract/tier, BMS account mapping, approved originating lines, line verification, cooldown, and last-four display.
3. Contacts: Directory contact mapping, support eligibility, BMS contact mapping, SupportLink issue/rotate, and display-once delivery.
4. Integrations: BMS/Datto/Graph/AD-broker/Verify onboarding, schema fingerprint, sealed credentials, health reason, circuit state, and kill switch.
5. Policy: A0-A4 assurance, prohibited actions, phased risk boundary, and action-catalog drafts.
6. Audit: recent hash-linked call events with no raw SupportLink or provider credential.
7. Onboarding: explicit production gates for telephony, customer mapping, BMS, Datto, actions, and identity reset.
8. Deterministic intake lab: real local classification/case/outbox behavior without fake live-provider success.

Legacy Phase 35 receptionist, flow, switchboard, intelligence, automation, work queue, and provider screens remain intact below the MSP command center.

## Runtime/API contract

### Authenticated MSP API

- `GET /v1/modules/callcommand-ai/product/msp/workspace`
- `PATCH /v1/modules/callcommand-ai/product/msp/settings`
- `POST /v1/modules/callcommand-ai/product/msp/organizations`
- `POST /v1/modules/callcommand-ai/product/msp/trusted-lines`
- `POST /v1/modules/callcommand-ai/product/msp/trusted-lines/:id/verify`
- `POST /v1/modules/callcommand-ai/product/msp/trusted-lines/:id/status`
- `POST /v1/modules/callcommand-ai/product/msp/contacts`
- `POST /v1/modules/callcommand-ai/product/msp/support-links`
- `POST /v1/modules/callcommand-ai/product/msp/support-links/:id/status`
- `POST /v1/modules/callcommand-ai/product/msp/integrations`
- `POST /v1/modules/callcommand-ai/product/msp/integrations/:id/kill-switch`
- `POST /v1/modules/callcommand-ai/product/msp/action-catalog`
- `POST /v1/modules/callcommand-ai/product/msp/policy/evaluate`
- `POST /v1/modules/callcommand-ai/product/msp/simulate/intake`

Read, write, and administrator mutations use the existing tenant/module guards. Tenant, user, role, plan, and entitlement values supplied in a body are rejected.

### Public provider API

- `POST /v1/modules/callcommand-ai/webhooks/twilio/voice/inbound`
- `POST /v1/modules/callcommand-ai/webhooks/twilio/voice/support-link`
- `POST /v1/modules/callcommand-ai/webhooks/twilio/voice/intent`
- `POST /v1/modules/callcommand-ai/webhooks/twilio/voice/unrecognized`

Every endpoint verifies the official Twilio signature against the canonical exact URL. Tenant selection occurs only on the inbound exact `To` number. Follow-up webhooks bind the Twilio Call SID to the existing call/context ID.

## Data contract

Release v46 adds:

- MSP settings and Directory-backed organization/contact profiles;
- Automation Fabric integration, Datto site/device, directory-account, and device-affinity records;
- encrypted/HMAC-indexed trusted lines and SupportLinks;
- verification methods/challenges;
- approved action catalog and tenant action policies;
- call contexts and hash-linked events;
- local cases and BMS ticket links;
- durable rate windows;
- action requests, policy decisions, approvals, and executions;
- secure reset-session records;
- integration outbox rows with retry/dead-letter vocabulary.

All relationship tables carry tenant IDs and use composite tenant foreign keys. Material uniqueness and idempotency rules include call/context, provider call, local case/context, BMS case/correlation, action request, execution attempt, SupportLink/line lookup, action key, and outbox kind/key.

Primary MSP tables have PostgreSQL row-level security enabled for defense in depth. Current enforcement remains the trusted server session, mandatory tenant predicates, and tenant composite foreign keys; this report does not claim a separate database role/policy rollout.

## Security behavior

- Forged Twilio requests fail with 403 before tenant state is mutated.
- Raw originating lines, SupportLinks, integration credentials, verification destinations, hostnames, and UPNs use the shared AES-256-GCM secret vault.
- Rotation revokes the previous secret reference.
- `publicConfig` recursively rejects credential-like keys.
- SupportLink is ten random digits including a Luhn check digit, displayed once, never placed in a URL, never spoken back, and absent from workspace/audit output.
- Line and SupportLink lookup indexes are HMAC-SHA-256 values under `CALLCOMMAND_ASSOCIATION_INDEX_KEY`; production fails closed when the key is absent or weak.
- SupportLink attempts use durable line and identifier windows and a per-call retry lock.
- Natural-language intake removes control bytes and redacts password/code, SSN, and payment-number patterns before persistence/classification evidence.
- A recognized line associates an organization but does not authenticate a contact.
- SupportLink produces A1 only. Later Datto or identity mutation requires independent A2 or stronger assurance.
- Cross-tenant targets, destructive/privilege actions, server actions, and privileged/service/shared/break-glass/unknown accounts are denied or manual-only.
- Provider success is never inferred from a queued row, returned HTTP status without accepted semantics, free-form output, or test fixture.

## Provider truth and external contracts

### Twilio

The server uses the official SDK signature validator. Production requires the primary `TWILIO_AUTH_TOKEN`; an API-key secret used for REST calls is not treated as the webhook signing token. The exact public base URL must match the Twilio webhook configuration.

### Kaseya BMS

The current code implements the exactly-once local case, outbox, ticket-link, mapping, schema-fingerprint, credential, health, kill-switch, and deterministic test-adapter boundaries. It intentionally does not invent a universal live request payload. A live worker remains blocked until the target tenant/region Swagger, authentication, queue/account/contact/type/status/priority mappings, rate-limit strategy, idempotency/reconciliation, and provider acceptance are reviewed.

### Datto RMM

Datto models and catalog controls exist for later phases. No live Datto read/action adapter is advertised. Current provider documentation supports API v2 and fixed quick-job submission, but current public documentation does not support claiming the generic result retrieval described in the initial product breakdown. Phase 2/3 must accept the target provider contract and preserve `UNKNOWN_RESULT` plus technician reconciliation when deterministic results are unavailable.

### Microsoft Graph and AD broker

Directory-account classification and reset-session persistence exist, but reset execution is absent and forced off. Graph permissions, secure browser reset, cloud-only standard-account proof, prohibited-account negatives, and identity-provider audit are Phase 4. The outbound-only AD broker is Phase 5 and requires a separate security review.

## Verification evidence

| Gate | Command | Result |
| --- | --- | --- |
| Focused domain/static/database | `corepack pnpm --dir apps/api exec tsx --test --test-concurrency=1 test/callcommand-msp-domain.test.ts test/callcommand-msp-static.test.ts test/callcommand-msp-db.test.ts` | PASS 14/14 on disposable PostgreSQL 16 |
| Complete CallCommand regression | `corepack pnpm --dir apps/api exec tsx --test --test-concurrency=1 test/callcommand-*.test.ts` | PASS 80/80 on disposable PostgreSQL 16 |
| Workspace typecheck | `corepack pnpm typecheck` | PASS across API, runner gateway, and web |
| Production build | `INTERNAL_API_URL=http://localhost:5001 corepack pnpm build:production` | PASS; release metadata, API, runner gateway, and optimized Next web artifacts built |
| Core preflight contract | `corepack pnpm preflight:production -- --core` | Expected initial FAIL with required production values absent; PASS after supplying isolated non-live fixture configuration. This proves validation behavior, not deployment readiness |
| Database plan/apply/reapply | `corepack pnpm db:plan`; `OPERATOROS_DATABASE_RELEASE_MODE=apply corepack pnpm db:apply` twice | PASS; v46/46, `destructive: false`, final MSP step; first apply/verify 5,598 ms and idempotent reapply/verify 2,565 ms on disposable PostgreSQL 16 |
| Cumulative release/identity regressions | targeted Node test runner for database-release, Phase 36 additive-order, and release-identity contracts | PASS 13/13 after advancing cumulative expectations to v46 |
| Full API aggregate | `corepack pnpm --dir apps/api test` | Exercised on an empty disposable database: 1,106 tests, 1,071 pass, 29 fail, 6 intentional HTTP-only skips in 582.6 seconds before the two v46-owned stale assertions were repaired. The two repaired contracts pass 13/13 targeted; the aggregate remains non-green because of 27 existing cross-product static/fixture/order-sensitive failures, so no broad pass is claimed |

The focused database journey proves:

- unauthenticated denial and tenant isolation;
- Directory-backed organization/contact mapping;
- encrypted line and SupportLink values with safe browser projections;
- server-forced-off privileged toggles;
- public-config secret rejection;
- signed and forged Twilio behavior;
- recognized call to A1 contact association;
- one local case, one BMS test link, and one outbox row under webhook replay;
- ordered hash-chain continuity;
- unrecognized A0 callback case with zero BMS outbox.

The test databases were isolated loopback PostgreSQL 16 containers containing
synthetic users, tenants, organizations, contacts, numbers, calls, cases, and
provider fixtures only. Both disposable containers were removed after the
final regression/build evidence was captured.

The invalid first aggregate diagnostic omitted the parent-process
`SESSION_SECRET`, causing a 63-failure import cascade, and is not acceptance
evidence. The corrected aggregate used an explicit non-production session
secret. Representative residual failures reproduce outside the Phase 37
tests: Ninjamation's isolated database test boots only its older base schema
while its route expects Phase 36 columns; the shared SSO suite passes 10/10
when isolated; and older product tests retain stale registry/snapshot/copy
assertions already documented by prior phases. Those unrelated failures were
not changed or converted to skips in this CallCommand delivery.

## Production environment contract

Required for Phase 1 deployment:

- `CALLCOMMAND_ASSOCIATION_INDEX_KEY`: at least 32 bytes, independent from the encryption key.
- `SHARED_SECRET_ENCRYPTION_KEY`: existing 32-byte shared secret-vault key.
- `SHARED_SECRET_ENCRYPTION_KEY_VERSION`: existing rotation version.
- `TWILIO_ACCOUNT_SID`: approved account.
- `TWILIO_AUTH_TOKEN`: primary token used for webhook verification and REST where applicable.
- `TWILIO_FROM_NUMBER`: approved voice number where required by existing telephony behavior.
- `TWILIO_PUBLIC_BASE_URL`: exact public base used in Twilio signature calculation.
- `TWILIO_VERIFY_SERVICE_SID`: required only when Phase 2+ A2 SMS verification is accepted.

Provider credentials are tenant records submitted to the encrypted vault; they are not repository environment examples or hardcoded price/secret values.

## Open release gates

1. Production backup, checksum, restore rehearsal, v46 apply/reapply, reconciliation, and rollback decision. The disposable v46 apply/reapply is local evidence only.
2. Deployed production build/start through the readiness-gated unified supervisor.
3. Exact-host authenticated desktop/mobile/accessibility acceptance of every new MSP screen.
4. Controlled real Twilio signed recognized/unrecognized/retry/status/transfer journey.
5. SupportLink delivery, rotation, loss, expiry, lock, and incident-response runbook approval.
6. Tenant-specific Kaseya BMS Swagger/auth/mapping review, worker, reconciliation, rate-limit and exactly-once live-ticket proof.
7. Alerting/operations for blocked/dead-letter outbox rows, integration circuit state, and kill-switch events.
8. Production data reconciliation for Directory organizations/contacts, lines, BMS IDs, and existing CallCommand channels.
9. OperatorOS pricing/tier/add-on metadata and checkout acceptance for the paid module.
10. Separate Phase 2-5 acceptance before any RMM or identity action is enabled.

No deployment, production mutation, provider activation, source-data import, merge, or state-5 promotion is authorized by this report.

## Rollback

Rollback the application artifact/traffic to the prior CallCommand release while retaining additive v46 tables and evidence. Disable the MSP channel or set tenant/global incident/manual mode before traffic rollback if required. Do not drop the v46 tables during an emergency rollback. Restore production data only from an approved verified backup into a new database, validate there, and switch traffic after acceptance.
