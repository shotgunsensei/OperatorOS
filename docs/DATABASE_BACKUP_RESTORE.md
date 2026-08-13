# OperatorOS database backup and restore runbook

OperatorOS and its consolidated modules share one PostgreSQL authority. A
backup protects identity, tenant membership, entitlements, billing state,
audit history, SSO replay state, and module workflows together. Never back up,
restore, or migrate one active module schema independently in production.

## Policy

- Use provider-managed encrypted backups plus scheduled logical backups.
- Initial operating targets are RPO 24 hours and RTO 4 hours; tighten them
  before paid SLA commitments.
- Retain daily backups for 30 days and monthly backups for 12 months, subject
  to approved customer and legal retention policy.
- Encrypt exports, restrict restore authority, audit every backup/restore, and
  never place database URLs, dumps, credentials, tokens, or customer data in
  Git or public object storage.
- Rehearse restore into an isolated non-production database at least quarterly
  and before any high-risk release.
- Production backup, release apply, traffic switch, and restore are separate
  human-authorized operations.

## Supported database release

OperatorOS exposes one root release contract:

```powershell
corepack pnpm db:plan
$env:OPERATOROS_DATABASE_RELEASE_MODE='apply'
corepack pnpm db:apply
```

`db:plan` is read-only and prints 40 ordered step identifiers without secrets
or a database connection. `db:apply` requires `DATABASE_URL` and the exact
release mode. The production supervisor executes the compiled apply before
Fastify starts and then verifies the required authority tables.

The release is idempotent and additive. Do not run imported child migrations,
`drizzle-kit push`, or an ad hoc SQL directory against OperatorOS. There is no
supported destructive down migration. Rollback means restore into a new
database and switch traffic after validation.

Release v35 appends `techdeck_literal_tables` after the prior v34 plan. Before
applying it, require a verified backup that covers the new TechDeck portal,
appointment, license, status, secure-intake, evidence-link, shared schedule,
shared API-token/webhook, and export records. Rollback remains restore-and-
switch; there is no destructive down migration.

## Deployment order

1. Identify the exact reviewed application commit and database engine version.
2. Run `corepack pnpm db:plan` and review the ordered release.
3. Capture a provider snapshot and a logical backup; verify its manifest and
   checksum before deployment.
4. Validate the production core environment with
   `corepack pnpm preflight:production -- --core`.
5. Build with `corepack pnpm build:production`.
6. Start through `node scripts/start-unified-runtime.mjs`. The supervisor must
   complete the database release and private `/readyz` before Next starts.
7. Require public root `/api/health`, `/readyz`, the 48-check read-only
   verifier, and
   authenticated browser acceptance before accepting traffic.
8. If any identity, tenant, entitlement, audit, persistence, SSO, or readiness
   gate fails, restore/switch according to the recovery procedure below.

## Logical backup

Run from a trusted operator environment with `DATABASE_URL` supplied by the
secret manager:

```powershell
pg_dump --format=custom --no-owner --no-acl --file operatoros.dump $env:DATABASE_URL
pg_restore --list operatoros.dump
Get-FileHash -Algorithm SHA256 -LiteralPath operatoros.dump
```

Record UTC time, application commit, release contract version, PostgreSQL
version, encrypted artifact location, checksum, byte size, duration, and
operator. A successful command without a readable TOC and checksum is not an
accepted backup.

## Restore rehearsal procedure

1. Provision an empty isolated PostgreSQL database with no production network
   access. Keep all provider integrations disabled.
2. Restore with:

   ```powershell
   pg_restore --clean --if-exists --exit-on-error --no-owner --no-acl --dbname $env:RESTORE_DATABASE_URL operatoros.dump
   ```

3. Compare source and target row counts for users, tenants, tenant membership,
   modules, tenant modules, entitlements, SSO handoffs, and audit rows.
4. Require zero unvalidated foreign keys and compare public table and foreign
   key counts.
5. Start the matching compiled OperatorOS release against the restored target.
   Permit only the supported idempotent release contract.
6. Require `/readyz`, database-backed auth/SSO/tenant/entitlement tests, and
   the production-host browser SSO gate. Do not send email, SMS, Stripe, AI, or
   webhook traffic.
7. Destroy the isolated database and securely delete the local dump after the
   evidence record is complete.

## Phase 1 rehearsal record

| Field | Recorded value |
| --- | --- |
| Rehearsal date | 2026-07-16 through 2026-07-17 |
| Candidate | Implementation commit `50d3b616ed2af8f50c983d29e161baf3c943130f` on `codex/phase-1-platform-deployment-gate` |
| Database | PostgreSQL 16.14 in isolated disposable Docker containers |
| Backup format | PostgreSQL custom archive; 435 TOC entries |
| Backup duration | 355 ms |
| Restore duration | 1,045 ms |
| Size | 196,552 bytes |
| SHA-256 | `6a1ab73c67a69a1bfe6a51d5f40b5df56f20302b779c9663e8002b408207932c` |
| Public tables | Source 61; restored target 61 |
| Foreign keys | Source 100; restored target 100 |
| Unvalidated foreign keys | Source 0; restored target 0 |
| Core row comparison | Exact match for users, tenants, tenant users, modules, tenant modules, tenant entitlements, SSO handoffs, and admin audit rows |
| Release on restored target | PASS; all 14 idempotent steps completed and required tables verified |
| Restored runtime readiness | PASS; Fastify and Next production artifacts reached ready state |
| Restored runtime SSO | PASS; 2/2 production-host browser scenarios |
| Aggregate regression | PASS; 675/675 on a separate clean disposable database |
| Provider traffic | None; Stripe, email, Twilio, and OpenAI disabled |

The dump was kept only under ignored `test-results` while evidence was being
captured. It is not a release artifact and must not be committed.

## Phase 10B additive release rehearsal

On 2026-07-22 the reviewed 22-step manifest, including
`ninja_pool_hall_tables`, was applied to a clean disposable PostgreSQL 16
database and immediately applied again. Both runs completed and verified all
22 steps. The compiled unified supervisor repeated the release successfully
before declaring Fastify/Next ready; canonical HTTPS `/healthz` and `/readyz`
then passed.

This was a schema/release rehearsal, not a backup/restore rehearsal and not a
production operation. No production snapshot, logical dump, restore, apply,
traffic switch, or source-data import occurred. Before deployment, execute the
full backup and restore procedure above against an authorized isolated target
and record the exact deployed revision and backup evidence.

## Phase 11E additive release rehearsal

On 2026-07-27 the reviewed 27-step manifest, including
`callcommand_tables`, was applied to a clean disposable PostgreSQL 16
database and immediately applied again. The clean apply completed in 10.169
seconds and the idempotent reapply in 1.618 seconds. The compiled unified
supervisor repeated all 27 steps before declaring Fastify, the shared worker
and Next ready; direct and web-proxied `/healthz` and `/readyz` then passed.

This was an additive schema/release rehearsal, not a production backup or
restore. No production data, standalone CallCommand export, provider traffic,
recording, source-data apply or traffic switch was authorized. Before
deployment, execute the full backup/restore procedure against an approved
isolated target and record the exact revision, consent/suppression
reconciliation and provider-jurisdiction review.

## Phase 2 schema-apply rehearsal

On 2026-07-17 the 15-step release, including `directory_tables`, applied twice
to a freshly reset disposable PostgreSQL 16 database and verified the shared
directory authority tables both times. The authoritative clean-database API
suite then passed 679/679 with no skips. This was an apply/idempotency rehearsal,
not a replacement backup/restore rehearsal. The later Phase 3 rehearsal below
includes the Phase 2 directory schema; deployed target validation remains a
release gate.

## Phase 3 backup/restore rehearsal

The 2026-07-18 rehearsal used PostgreSQL 16 in one local disposable Docker
container. The 16-step additive release, including `shared_service_tables`,
applied twice without drift before the source database was dumped and restored
to a newly created target database. No external provider traffic was enabled.

| Field | Recorded value |
| --- | --- |
| Candidate | Uncommitted Phase 3 source on `codex/phase-3-shared-services`, based on `bf7f4ff` |
| Backup format | PostgreSQL custom archive |
| Size | 297,545 bytes |
| SHA-256 | `b293127c835b2c6c6937cbae93a32916d038ad44f74a3ee700c5eda2fff2c0b1` |
| Public tables | Source 83; restored target 83 |
| Public constraints | Source 382; restored target 382 |
| Shared service tables | Source 10; restored target 10 |
| Critical vector | Exact source/restored match: `83|382|13|2|1|0|0|0|0` for public tables, public constraints, modules, tenants, users, outbox, jobs, usage, and activity |
| Release on source/restored target | PASS; all 16 idempotent steps completed and required shared tables verified |
| Restored runtime readiness | PASS; database, auth, SSO, module registry, and shared worker ready |
| Aggregate regression | PASS; 692 total, 686 passed, 0 failed, 6 HTTP-only skips on a separate clean database |
| Provider traffic | None; Stripe, email, Twilio, and OpenAI disabled |

This local dump and all rehearsal databases contained no production data and
were deleted with the disposable container after the evidence record was
completed.

## Phase 4 backup/restore rehearsal

The 2026-07-18 Phase 4 rehearsal used only disposable PostgreSQL 16. The
17-step release, including `tradeflowkit_tables`, applied idempotently before
backup. The custom archive was restored into a newly created database and the
restored database accepted the entire release again.

| Field | Recorded value |
| --- | --- |
| Candidate | Uncommitted Phase 4 source on `codex/phase-4-tradeflowkit-state-5`, based on `c969e0413192259318d8f8dacc513fdffededec5` |
| Backup format | PostgreSQL custom archive |
| Backup duration | 1.746 seconds |
| Restore duration | 3.570 seconds |
| SHA-256 | `d2df4f815a5fa678b058e1b602211fd7d8c878b32811807ed96e175130568c82` |
| Public tables | Source 94; restored target 94 |
| TradeFlowKit tables | Source 17; restored target 17 |
| Directory tables | Source 9; restored target 9 |
| Shared-service tables | Source 10; restored target 10 |
| Release on restored target | PASS; all 17 idempotent steps completed and required TradeFlowKit/shared tables verified in 2,418 ms |
| Provider traffic | None; Stripe, email, Twilio, and OpenAI disabled |

An initial post-restore query incorrectly assumed a persistent release-ledger
table. That query failed after the restore itself had completed. Verification
was corrected to compare the actual schema families and execute the supported
release apply; both passed. The dump and databases are disposable and removed
after final evidence capture.

## Phase 5 disposable release rehearsal

The 2026-07-18 Phase 5 rehearsal used only disposable PostgreSQL 16 databases.
The current 18-step release adds `techdeck_tables` after TradeFlowKit and before
shared services. It applied repeatedly without drift on clean databases and
through the compiled production supervisor; required TechDeck relationship,
document, and shared-service tables were verified. The complete API regression
used a separately created clean database.

No persistent or production database was migrated, so no new production-style
dump was necessary for this additive source rehearsal. The Phase 4 custom
archive above remains the latest restore evidence. Before any authorized
TechDeck production schema or standalone-data apply, take a fresh provider
snapshot and logical backup, verify the checksum, rehearse restore into a new
database, and require the matching 18-step release plus count/reference and
browser reconciliation. No Phase 5 apply or cutover has been authorized.

## Phase 14 backup/restore rehearsal

On 2026-07-27 a disposable PostgreSQL 16 source containing only synthetic test
data was archived in custom format and restored into a newly created database.
No archive left the local container and no provider traffic was enabled.

| Field | Recorded value |
| --- | --- |
| Candidate | Uncommitted `codex/phase-14-hardening` source based on Phase 13 commit `960c6f7` |
| Backup format | PostgreSQL custom archive; 2,019 TOC lines |
| Size | 1,061,361 bytes |
| SHA-256 | `7f9e35dfb6f06c6617cbe6016d14e7486dd92d8b64a2c5c7b373ddd451e0e918` |
| Public tables | Source/restored 228 |
| Foreign keys | Source/restored 712 |
| Unvalidated constraints | Source/restored 0 |
| Core vector after release | Exact match: `7 users | 7 tenants | 8 memberships | 13 modules | 21 tenant modules | 0 tenant entitlements | 0 SSO handoffs | 8 admin audit rows` |
| Release on source/restored | PASS; current 29-step release verified both targets |
| Restored runtime | Compiled API `/healthz` 200 and `/readyz` 200; database/auth/SSO/module registry/worker healthy |
| Provider traffic | None; Stripe, email, Twilio, OpenAI and scanners disabled |

This is current local restore evidence, not authorization to back up, restore,
or switch a production database.

## Phase 16A v31 additive release rehearsal

On 2026-08-01 the v31 release plan, clean apply, and idempotent reapply passed
against disposable PostgreSQL 16. The final step adds only
`tradeflowkit_lead_settings`, `tradeflowkit_lead_capture_forms`,
`tradeflowkit_lead_followups`, and `tradeflowkit_lead_source_events`; release
verification requires all four tables and reports v31/31 with
`tradeflowkit_lead_operations` last.

This rehearsal used synthetic data and did not touch a persistent or
production database, so it did not create a new backup/restore artifact. A
production apply still requires an approved fresh provider snapshot and
logical backup, checksum verification, restore into a new database, v31
release verification, row/reference reconciliation, authenticated browser
acceptance, and an explicit traffic-switch/rollback decision.

## Phase 27 v36 additive release rehearsal

On 2026-08-10 the 36-step release plan, apply, and immediate idempotent reapply
passed against the disposable loopback PostgreSQL 16 database retained from
the Phase 26 rehearsal. The final step, `pulsedesk_literal_tables`, follows the
Phase 26 `techdeck_literal_tables` step and verifies the tenant-scoped
connector, safe-event, inbound-message, and public-intake tables.

The focused Phase 27 database journey used synthetic users and messages only.
It verified four provider adapters, tenant isolation, OAuth state/revocation,
message replay protection, authenticity rejection, quarantine before ticket
creation, sender hashing, sensitive-summary rejection, and public intake. No
production database, standalone PulseDesk export, provider traffic, or
customer data was touched, so this additive source rehearsal did not create a
new backup artifact. Production apply still requires a fresh provider
snapshot and logical backup, checksum and restore verification, privacy-
reviewed reconciliation, real-provider acceptance, authenticated/public
browser acceptance, and an explicit cutover/rollback decision.

## Phase 28 v38 additive release rehearsal

On 2026-08-11 the 38-step production release applied to a new disposable
PostgreSQL database, verified every step, and passed an immediate idempotent
reapply before the compiled exact-host browser gate. The final
`torqueshed_web_api_tables` step adds only journal entries/parts, live-bay
state/membership/messages/rate windows, hashed share links, and user settings.

The focused product database tests used synthetic identities and records and
proved tenant/owner isolation, public projection limits, message ordering,
reconnect cursors, durable rate controls, idempotent client message IDs,
diagnostic reports, revocable shares, settings, and shared exports. No
production database, customer record, live provider, or standalone TorqueShed
export was read or changed, so this additive rehearsal did not create a
production backup artifact. Production apply still requires a fresh provider
snapshot and logical backup, checksum and restore verification, approved
source-data reconciliation, authenticated/deployed acceptance, and an explicit
cutover/rollback decision.

## Phase 30 v39 additive release rehearsal

On 2026-08-11 the 39-step production release plan, apply, and immediate
idempotent reapply passed against a new disposable loopback PostgreSQL 16
database. The final `ninja_pool_online_tables` step adds only the durable
tenant-scoped room, append-only event, and rate-limit tables used by
authenticated Ninja Pool Hall online matches. Direct catalog verification
confirmed `ninja_pool_online_rooms`, `ninja_pool_online_events`, and
`ninja_pool_online_rate_limits` after the reapply.

The focused multiplayer database journey used synthetic OperatorOS tenants,
users, entitlements, and match state only. It verified host/guest authority,
independent server shot simulation, sequence and idempotency controls,
cross-tenant denial, reconnect/rejoin, disconnect persistence, room expiry,
and durable abuse limits. No production database, customer data, or deployed
room was read or changed, so this rehearsal did not create a production backup
artifact. Production apply still requires a fresh provider snapshot and
logical backup, checksum and restore verification, authenticated exact-host
two-device acceptance, and an explicit cutover/rollback decision.

## Phase 31 v40 additive release rehearsal

On 2026-08-11 the 40-step production release applied to a disposable
loopback-only PostgreSQL 16 database and the complete BrandForgeOS database
journey passed with synthetic tenants and marketing records. The final
`brandforgeos_complete_product_tables` step adds offers, campaign production,
landing content, guided workflows, templates, provider projections and sync
history, recommendations, leads, reports, export jobs, and atomic credit
counters. It also adds copy favorites/scores and brand asset-reference fields;
it contains no destructive DDL.

The focused journey verified shared deterministic provider synchronization,
white-label persisted-fact reports, SHA-256 export integrity, background-job
completion, concurrent credit exhaustion and replay, viewer denial, restart
persistence, and cross-tenant non-enumeration. No production database, live
provider, customer data, or standalone BrandForgeOS export was read or changed,
so this rehearsal did not create a production backup artifact. Production apply
still requires a fresh logical backup, checksum and restore verification,
approved source-data reconciliation, authenticated exact-host/provider
acceptance, and an explicit cutover/rollback decision.

## Phase 32 v41 additive release rehearsal

On 2026-08-12 the 41-step release applied and immediately reapplied to a clean
disposable loopback PostgreSQL 16 database. The final
`snapproofos_complete_product_tables` step adds customers, templates, branding,
parts, labor, share links, public rate windows, complete field-job columns,
voice/file metadata, and persisted PDF/DOCX bytes. It contains no table drop or
truncate operation.

The synthetic journey verified customer/job/work/cost/file/report/share state,
logo and voice bytes, invalid-content rejection, scan state, export hashes,
approved history, cross-tenant/viewer denial, revocation, replay, and restart
persistence. No production database or source export was read or changed, so no
production backup artifact exists. Production v41 requires a fresh logical
backup, checksum and restore verification, scanner readiness, approved source
reconciliation, exact-host acceptance, and an explicit rollback decision.

## Phase 33 v42 additive release rehearsal

On 2026-08-12 the 42-step release applied and immediately reapplied to a clean
disposable loopback PostgreSQL 16 database. The final
`studyforge_complete_product_tables` step adds user preferences, folders,
complete study sets and short answers, exam countdowns, learning sessions,
card-review mutations, daily activity, and atomic usage counters. It extends
generation/review records additively and contains no drop or truncate.

The synthetic journey verified complete transactional generation, replay and
failure cleanup; flashcard/quiz/plan history; owner/role/tenant isolation;
Free/Pro/Tutor limit and export/countdown gates; concurrent credit exhaustion;
archive/restore/delete; streak/activity idempotency; and restart-visible
records. No production database, live AI provider, or standalone source export
was read or changed, so no production backup artifact exists. Production v42
requires a fresh logical backup with checksum and restore verification,
approved source reconciliation, live-provider and deployed exact-host
acceptance, and an explicit rollback decision.

## Production recovery

1. Freeze writes and preserve the failed database as read-only when safe.
2. Identify the last known-good application commit and backup before changing
   data or traffic.
3. Restore into a new database. Never overwrite the only recoverable copy.
4. Run the matching release contract and require schema/row/FK reconciliation,
   `/readyz`, auth/tenant/entitlement negatives, and authenticated smoke tests.
5. Switch traffic only after acceptance. Record the operator, timestamps,
   source/target database identifiers, checksum, and decision.
6. Roll traffic back if validation fails; investigate without weakening tenant,
   identity, SSO, audit, or persistence checks.
