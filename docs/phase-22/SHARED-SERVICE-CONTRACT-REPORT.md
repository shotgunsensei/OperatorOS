# Phase 22 shared service contract report

- Date: 2026-08-08
- Branch: `codex/phase-22-shared-platform-services`
- Database contract: v34, 34 ordered steps, additive/idempotent
- Implementation status: **implemented and source/local verified**
- Release status: **blocked by the existing Phase 20/21 product-parity gate**
- Production mutation: none

## Outcome

Phase 22 extends the existing OperatorOS shared-service foundation into a
typed, tenant-scoped control plane. Later module work can now preserve provider
setup, notification, attachment, webhook, background-job, export, API-token,
usage/credit, feature-readiness, search, and legacy-reference workflows without
activating child-local identity, credential, billing, tenant, worker, or
provider authority.

The implementation is a complete local vertical slice:

1. an additive PostgreSQL v34 contract;
2. transport-neutral SDK contracts;
3. encrypted server services and compatibility adapters;
4. role-gated, audited tenant APIs;
5. a real organization Shared Services console;
6. durable workers, retries, dead letters, exports, and signed retrieval;
7. database/route/static tests and a generated shared-equivalent contract.

This phase does **not** change the current release truth. Phase 21 still finds
6,189 required blocked source capabilities plus route/schema/visual/control
failures. Phase 22 supplies safer shared foundations for restoring those
workflows; it does not waive or relabel them.

## Authority and contract map

| Capability | Existing or Phase 22 authority | Executable implementation | Principal evidence |
| --- | --- | --- | --- |
| Identity/session and exact-host SSO | OperatorOS auth and SSO v1 | `apps/api/src/routes/auth-routes.ts`, `apps/api/src/routes/sso-routes.ts` | `P22-ADAPTER-SSO-001`, local-session revocation test |
| Tenant, membership, RBAC, module access | OperatorOS tenant/entitlement resolvers | existing tenant/admin/module routes and `tenant-auth.ts` | `P22-RBAC-001` owner/admin/member/viewer/platform-admin matrix |
| Billing, plan, seat, credit, entitlement | OperatorOS billing and entitlement authority | existing billing/entitlement/credit services | unchanged authority contract plus usage adapter tests |
| Directory organizations/sites/contacts/requesters | shared Business Directory | existing Directory schema/services/routes | `P22-ADAPTER-DIRECTORY-001` |
| Audit/activity with provenance | platform audit plus append-only shared activity | `audit.ts`, `shared-usage-activity.ts` | mutation audit assertions and Phase 3 service tests |
| Provider configuration and secret references | Phase 22 encrypted control plane | `shared-secret-vault.ts`, `shared-platform-control-plane.ts` | `P22-SECRET-001`, `P22-PROVIDER-001`, route redaction test |
| Object storage, attachments, scan, retention, signed retrieval | ADR-0009 attachment service plus Phase 22 grants | `shared-attachments.ts`, `shared_download_grants` | `P22-ADAPTER-ATTACHMENT-001`, `P22-NEGATIVE-001` |
| Notifications, templates, suppression, retry, delivery state | shared templates/outbox/suppression/attempt ledger | `shared-notification-outbox.ts` | `P22-NOTIFICATION-001`, Phase 3 outbox tests |
| Outbound webhooks | Phase 22 HTTPS/HMAC dispatcher | `shared-outbound-webhooks.ts` | `P22-WEBHOOK-001`, `P22-ROUTE-SSRF-001` |
| Jobs, schedules, leases, idempotency, dead letters | shared jobs plus Phase 22 schedules | `shared-background-jobs.ts`, `shared-schedules-exports.ts` | `P22-JOB-001`, stale-lease tests |
| Exports/reports | registered asynchronous exporters and shared attachments | `shared-schedules-exports.ts` | real control-plane history exporter, job/attachment tests |
| API tokens/scopes/service identities/revocation | Phase 22 hash-only credentials | `shared-platform-control-plane.ts` | `P22-TOKEN-001`, `P22-ROUTE-TOKEN-001` |
| Usage and AI-credit accounting | append-only shared usage plus existing OperatorOS credit ledger | `shared-usage-activity.ts` and module credit services | `P22-ADAPTER-USAGE-001` |
| Feature flags and provider readiness | Phase 22 versioned flags plus computed readiness | provider/flag services and admin routes | `P22-FLAG-001`, `P22-PROVIDER-001` |
| Global search and deep links | tenant-filtered shared search references | search service and member route | `P22-ADAPTER-SEARCH-001` |
| Legacy identifiers and imported references | explicit compatibility adapter registry | `shared-compatibility-adapters.ts` | legacy alias/reference portion of `P22-ADAPTER-SEARCH-001` |

The SDK contract is `packages/sdk/src/shared-platform.ts`. It carries trusted
tenant/module/actor context, readiness and delivery states, attachment/export
descriptors, token scopes, usage provenance, feature flags, search results, and
legacy reference types. It deliberately has no child password, tenant
selection, provider-secret return, billing mutation, lease-owner, storage-key,
or raw-token persistence contract.

## Additive database release

`shared_platform_tables` follows `shared_service_tables` in release v34. It
adds:

- `shared_secret_references`;
- `shared_provider_configs`;
- `shared_notification_suppressions`;
- `shared_delivery_attempts`;
- `shared_webhook_endpoints` and `shared_webhook_deliveries`;
- `shared_schedules`;
- `shared_exports`;
- `shared_service_identities` and `shared_api_tokens`;
- `shared_feature_flags`;
- `shared_search_documents`;
- `shared_legacy_references`;
- `shared_download_grants`.

All new time columns are `TIMESTAMPTZ`. The initial disposable-database test
found and corrected a timestamp-without-time-zone portability error before the
final clean apply: a UTC database initially treated an Eastern host's future
schedule as already due. The final DDL is timezone-stable and the regression
asserts the database-side due predicate.

No child migration, destructive down migration, production database, or
persistent developer database was used. Rollback remains backup, restore into
a new database, verify, then switch traffic.

## Secret and token boundary

Provider references are encrypted with AES-256-GCM using
`SHARED_SECRET_ENCRYPTION_KEY`, which must decode to exactly 32 bytes. The key
version is recorded separately. Production secret writes fail closed when the
key is missing or malformed. Tests use a fixed test-only key and readiness
remains `test`, never live.

The browser may submit a provider credential/reference over the authenticated
tenant-admin route, but responses expose only `hasSecretReference` and a
SHA-256 fingerprint. Raw reference, ciphertext, IV, authentication tag, and
decrypted value are excluded from route projections and audits.

API tokens use 256 bits of random material with an `oos_` prefix. The raw token
is returned once at creation. At rest OperatorOS stores only its SHA-256 hash,
display prefix, scopes, tenant/service identity, expiration, last use, and
revocation. Authentication checks tenant, scope, identity status, expiration,
and revocation before returning a server-side service context.

## Truthful adapters and outage behavior

Deterministic adapters exist for email, SMS/Twilio, AI, storage, outbound
webhooks, and OAuth connector payloads. They sanitize/capture the requested
payload and return:

```json
{
  "accepted": true,
  "externalDelivery": false,
  "adapter": "deterministic-test",
  "state": "recorded_not_delivered"
}
```

Email/SMS outbox rows now become `recorded`, not `delivered`, under the test
adapter. Outbound webhook rows do the same. Disabled providers, missing live
credentials/callbacks, suppressed destinations, transient failures,
dead-letter exhaustion, pending scans, infection, and worker outages retain
distinct non-success states.

Live provider readiness rules are:

- `disabled` -> `blocked`, no external delivery;
- `test` -> `degraded`, deterministic record only;
- `live` without an encrypted credential reference -> `blocked`;
- live OAuth/webhook without a verified callback -> `blocked`;
- live with required references/callback -> `ready`.

## Outbound webhook threat boundary

Endpoint creation and live delivery both enforce the outbound network policy:

- HTTPS only;
- no URL username/password;
- standard TLS port;
- no localhost, `.local`, `.internal`, loopback, link-local, RFC1918, reserved,
  multicast, or unique-local IPv6 destinations;
- live DNS resolution immediately before send;
- no redirects;
- 15-second timeout;
- `sha256=<hex>` HMAC over `timestamp.payload`;
- delivery ID, event type, and timestamp headers;
- bounded retries, leases, safe errors, attempt logs, and dead letter.

Only redacted safe payload projections enter the shared delivery table.

## Operator and tenant-admin surfaces

The new **Organization -> Shared services** console is available only to
tenant owners/admins and platform super-admins. It is backed by live APIs and
durable tables. It provides:

- provider setup and computed health;
- links to the existing team and module-access authority surfaces;
- worker/queue/dead-letter health and audited recovery;
- attachment scan/quarantine status;
- outbound webhook creation and status;
- service-identity/API-token creation, one-time display, listing, and
  revocation;
- usage and credit history;
- asynchronous control-plane export request and signed download.

All mutation routes use `requireTenantAdmin`, validate module ownership where
applicable, and write allowlisted audit details. Foreign-tenant attempts
collapse to `TENANT_NOT_FOUND`. Ordinary members and viewers receive 403.

## Compatibility adapters and executable mapping

`scripts/phase22-shared-equivalent-contract.mjs` reads the generated Phase 20
module manifests; it does not use a manually maintained total. It derives
`docs/parity/shared-equivalent-adapters.json`, currently **181 mappings** with
digest `a2cbd2b380705f71b4d34c0e643c265abe1fb5e990ad3181df3d5122f920e59e`.

Every mapping contains:

- capability ID and module;
- original source-visible user outcome;
- compatibility assertion;
- named adapter;
- exact executable test ID and path;
- the existing Phase 20 automated evidence.

The verifier fails on a stale generated file, duplicate capability ID, missing
outcome/assertion, missing adapter, missing test path, or absent test ID. Root
`verify:parity` runs this contract before the Phase 21 strict parity compiler.

## Verification performed

Environment: Windows PowerShell, bundled Node runtime, repository workspace,
disposable `postgres:16-alpine` on loopback database `operatoros_test`. The
container was created only for this phase, carried no persistent volume, and
was stopped and auto-removed after the final verification run.

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` with bundled Node added to process PATH and `CI=true` | PASS; lockfile supply-chain policy passed; 683 packages linked |
| `pnpm typecheck` | PASS; API, runner, web 3/3 |
| `pnpm lint` | PASS; zero warnings/errors |
| `pnpm db:plan` | PASS; release v34, 34 steps, non-destructive |
| `pnpm test:unit` | PASS; 33/33, 0 fail/skip/todo |
| `pnpm test:integration` against a newly recreated disposable database | PASS; release v34 clean apply in 14,526 ms, idempotent reapply in 3,392 ms, then 28/28 tests with 0 fail/skip/todo |
| focused Phase 22 data suite | PASS; 9/9, 0 fail/skip/todo |
| Phase 22 route suite | PASS; 5/5 across owner/admin/member/viewer/platform-admin, secrets, tokens, SSRF, and flags |
| Shared Services UI static contract | PASS; 2/2 real controls/role denial, 0 fail/skip/todo |
| unchanged shared service and route suites | PASS; 13/13, 0 fail/skip/todo |
| shared-equivalent generator/verifier/tests | PASS; 181/181 mappings, 2/2 tests |
| `pnpm build:production` | PASS; release build `2b8c99fd90d1652027d7bd4e` |
| synthetic `pnpm preflight:production -- --core` | PASS, including the 32-byte shared-secret key contract; no value printed |
| `pnpm verify:parity` | EXPECTED FAIL-CLOSED; 6,289 current failures (6,189 blocked required, 61 missing target routes, 39 missing target schemas) |
| complete `pnpm --dir apps/api test` aggregate | INCOMPLETE; it continued making progress but did not emit a final summary within the 604.1-second execution bound, so it is not reported as pass or fail |

The final verification section below is updated only from commands actually
run; no skipped browser or live-provider result is promoted to pass.

The Phase 21 process launcher was also corrected for Windows Node 24: `.cmd`
shims are now invoked through an explicit `cmd.exe /d /s /c` process while
native Node/executable launches remain shell-free. This removes the earlier
pre-test `spawn EINVAL` and allowed the root integration gate above to execute.

## Controlled failure demonstrations

| Failure class | Controlled fixture | Expected fail-closed result |
| --- | --- | --- |
| Missing secret encryption | production-mode vault without a valid 32-byte key | `SHARED_SECRET_ENCRYPTION_UNAVAILABLE` or invalid; no write |
| Missing live provider credential | live email config without secret reference | provider `blocked`, no external delivery |
| Deterministic adapter | email/SMS/AI/storage/webhook/OAuth test request | `recorded_not_delivered`, `externalDelivery=false` |
| Suppressed recipient | tenant A hashed email suppression | outbox `cancelled`; tenant B remains independent |
| SSRF | loopback HTTP/HTTPS webhook URL | 422; endpoint and HMAC secret transaction rolled back |
| Duplicate webhook | same tenant/module/endpoint idempotency key | existing delivery returned; no second row |
| Dead letter | terminal tenant A job | tenant B recovery returns no row; tenant A audited retry succeeds |
| Token overreach | valid token missing requested scope or using foreign tenant | authentication returns null |
| Revoked token | formerly valid token after revoke | authentication returns null |
| Cross-tenant search/reference | tenant B queries tenant A object | empty/not found |
| Stale flag version | update with wrong expected version | 409 `FEATURE_FLAG_VERSION_CONFLICT` |
| Pending attachment | signed grant requested before clean/unavailable scan result | `ATTACHMENT_DOWNLOAD_UNAVAILABLE` |
| Stale compatibility output | generated mapping differs from source ledgers | non-zero verifier |
| Duplicate/untested compatibility mapping | controlled in-memory negative fixture | contract test rejects shape |

## Remaining release gates

Phase 22 itself is source/local verified, but the repository is not
release-eligible:

1. Phase 21 strict parity remains intentionally red for current source gaps.
2. Source-faithful visual/control contracts remain red as recorded in the
   Phase 21 report.
3. Live provider credentials, callbacks, malware scanner policy, and external
   delivery acceptance were not supplied and therefore remain not ready.
4. Deployed exact-host browser acceptance was not rerun for this source-only
   control-plane phase; existing exact-host unit/local-session boundaries pass,
   but deployed SSO must not be inferred.
5. The full API aggregate needs an unbounded/CI rerun because the bounded local
   invocation produced no final telemetry after 604.1 seconds. Focused Phase 22
   and adjacent shared-service suites are green, but they do not replace that
   repository-wide gate.
6. No production data migration, backup, deployment, cutover, push, or release
   was authorized or performed.

## Migration strategy for later modules

For each child workflow:

1. inventory the source-visible outcome and stable capability ID;
2. authorize the caller through OperatorOS session, tenant, module, and role;
3. normalize the legacy module/source identifier;
4. resolve Directory and imported reference mappings;
5. invoke the typed shared service inside the module's authorized transaction;
6. persist an idempotency key, provenance/correlation ID, and audit/activity;
7. surface the honest queued/recorded/retry/blocked/delivered state;
8. bind the shared-equivalent ledger row to its exact adapter behavior test;
9. run strict parity and the full release gate;
10. perform source-data cutover only under an approved migration plan and
    backup/restore gate.

Module-local passwords, sessions, tenants, memberships, billing, provider
secrets, token stores, workers, object stores, and mutable usage balances stay
retired as authority. Their user outcomes migrate through the shared adapters;
their authority implementations do not.
