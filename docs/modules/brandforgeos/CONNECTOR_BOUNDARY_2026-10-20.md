## Awaited execution serialization follow-on - 2026-10-22

The historical overlapping-adapter limitation below is addressed by a bounded
local follow-on: non-waiting per-process admission, a database advisory fence,
independent current-authority transactions and stable retry identity. Canonical
focused37/37, actual PostgreSQL pool-three14/14 and actual pool-one/two capacity
cases pass. Production connectors remain unavailable and provider-side
idempotency/reconciliation is still required. See
[exact implementation, evidence and limits](SYNC_SERIALIZATION_2026-10-22.md).

## Subsequent real PostgreSQL verification - 2026-10-20 22:18 UTC

Unchanged runtime source at commit26dd663e6d9078702f0c2c77e097f98a8aee797e
passed11/11 bounded real PostgreSQL16.14 cases,0failed, after the earlier
model-only checkpoint below. Actual pg8.23.0/Drizzle0.45.2 and canonical
tenant/module/entitlement/feature functions executed; only the awaited adapter
was synthetic and non-delivering. Three concurrent identical requests allocated
one job/run; conflicting provider/requester intent did not orphan a run. A real
tenant-filtered trigger proved rollback then identical retry. Tenant isolation,
eight preflight authority/configuration revocations, missing membership despite
platform-admin status, and revoke/cancel/feature loss during await all passed.

The task-only disposable target was127.0.0.1:55486/operatoros_phase21_outcall_test;
captured Pool URL and socket guards rejected other targets. All owned rows across
ten tables and the owned trigger/function were verified absent afterward; the
canonical module row was unchanged and the pool closed. No schema apply, real
provider, vault, recipient, service or production action occurred. Initial loader
preparation failures and sandbox EACCES remain separately recorded; the permitted
bounded run succeeded without changing application source.

Exact task evidence: evidence/resume-oct20/all-module-release/brandforge-real-pg/
README.md, result-b84ffce84c42421196.json and final-evidence.json. The commands are
`node evidence/resume-oct20/all-module-release/brandforge-real-pg/run.cjs --prepare`
and the explicitly cleared `--run-cleared` mode; no package acquisition occurred.
This adds actual driver/transaction/concurrency proof to the earlier23 helper/
route,13 policy and4 domain passes. It does not prove HTTP/session, generic job
leasing, browser, live provider or deployment acceptance. Overlapping workers may
still enter the synchronous deterministic adapter; async/live effects require
reviewed fencing and provider idempotency. Production connector capability remains
unavailable; no provider/event/receiver product choice has been made.

# BrandForge connector boundary — source candidate, 2026-10-20

## Sync replay and queued authority follow-through

This uncommitted delta is based on `6f86b5f700a99a52c770a6c89b99c24aca5fc667`
(tree `a1c6e16a6086bb7ea7eedbb5d3d29e04bf6490c1`). It corrects the two inherited
sync-safety limits documented by the independent boundary review. The earlier
policy-component evidence below is preserved; it is not live-provider acceptance.

`brandforgeos-sync.ts` reserves the shared unique job before allocating its
business sync run, inside one transaction. The payload binds requester, exact
provider, integration ID/version, tenant/module-scoped configuration ID/version,
mode and direction. Matching retries return the original business run and job;
a same-key provider/requester/configuration collision returns 409 without another
business row. A missing key generates a distinct operation. A failed insertion
rolls back the reservation. Existing queued jobs without the new intent binding
fail closed; this source change does not migrate, resume or dispatch them.

The registered BrandForge worker reloads the run, integration, configuration,
active account, active tenant and actual tenant owner/admin membership. It checks
the shared-job requester/module binding, current canonical module write access,
and current integration feature immediately before the awaited test adapter and
again before committing completion. Connection revocation/rebinding, disabled
configuration, changed versions, lost role/membership/module/feature and mismatched
authority deny execution or completion. Current real membership is required even
when the requester has platform administrator authority. Failure persistence is
also tenant/module/job/requester-bound and does not overwrite completed/cancelled
runs. The existing shared queue and authorization resolvers are unchanged.

Verification of this delta uses existing cached packages only, explicit fake SQL
boundaries and no real database or provider. Desired-behavior probes against the
unchanged `6f86b5f` route fail **2/2**, reproducing the original duplicate business
run and revoked-connection completion. The corrected actual-source suite passes
**23/23**: 17 helper cases plus six route/registered-worker wiring cases. These
include modeled concurrent replay/collision, transaction rollback, 20 authority
or configuration changes before and during awaited work, and production denial.
The SQL fake serializes transactions and models the existing unique constraint;
this does not prove PostgreSQL isolation, locking, driver behavior or rollback.
The unchanged policy **13/13** and domain **4/4** suites also pass separately.

The first helper run was **15/16**: a mismatched job module could cause failure
status persistence. The corrected catch path now validates the persisted shared
job/module/requester before changing a business row. That failure receipt remains.
The first broader compiler attempt also failed cache type resolution and caught
strict errors in the test fixture. Installed declaration paths and fixture typing
were corrected without changing dependencies. Cached-path full API source types,
strict helper/policy test types and zero-warning scoped lint pass. API emit is
recorded separately in the frozen evidence receipt; it is not the normal root
production build, startup or release gate. Harnesses, exact commands, initial
failures, final receipts and source hashes are under `build/brandforge-connector/`.

Production capability remains false/unavailable. No provider was selected or
activated; no account, credential, grant, endpoint, external dispatch, schema
application, database migration, service, browser, commit, publication or deployment
occurred in this delta. Schema/release remains67. Real PostgreSQL concurrency,
HTTP/session and tenant acceptance, a chosen live provider contract, purpose-bound
vault/destination enforcement, provider/recipient acceptance, normal release gates
and deployment are still required before live activation. Future external effects
also require provider idempotency and uncertain-outcome recovery; these checks do
not establish exactly-once external delivery. Independent review reproduced two
overlapping worker invocations entering the adapter before final completion.
The current synchronous deterministic adapter performs no external action. A
future asynchronous/live adapter must add lease fencing and prove provider
idempotency; accepting a processing run here is not that proof. Rollback is a reviewed scoped source
revert; no database downgrade or automatic job replay is proposed.

## Initial policy component evidence

Base: `520cc585b7efe887b0da06132b2981c2e5e576cf`, tree `41a8ce76a9bfd7c4249a29b74b626c004933bab0`.
Branch: `codex/brandforge-live-connector-oct20` in its own worktree.

**Provider-neutral policy/validation implemented; live connect/sync remains unavailable.** No provider, account, OAuth grant, credential, destination, external campaign or delivery was created or selected by this change. It is not a completed live connector or a production acceptance claim.

## Decision returned to the release owner

The current catalog has twelve distinct candidates: Meta Ads, Google Ads, LinkedIn, TikTok, Mailchimp, SMTP/Email, Webhooks, HubSpot, Salesforce, Google Analytics, Slack and Zapier (`brandforgeos-phase31.ts:20-33`). The UI submits empty public configuration and no callback acceptance. No examined source contract or current instruction selects the first vendor, external object/event, receiving system or OAuth scope.

**Recommended first choice: the existing catalog `webhooks` contract**, after owner selection of the receiving system and the approved campaign/report event and payload. OperatorOS already has HMAC signing, tenant/module-bound endpoints, durable delivery/idempotency/retry and SSRF-safe transport in `shared-outbound-webhooks.ts` / `public-webhook-http.ts`. Reuse that contract; do not invent a second egress or vault system. This recommendation does not register or activate it.

The precise decision is whether `webhooks` is the first BrandForge live connector and which receiving system/event/payload it must support, or which one alternate named provider should be first. This is a provider/product-contract decision, not another request for test-account/mailbox approval. Credentials and endpoint/security setup remain separate private actions after the contract is selected. A catalog row or a saved credential reference does not choose a vendor or prove acceptance.

## Bounded source delivered

- `brandforgeos-connector-policy.ts` defines a typed decision for known catalog providers: deterministic test execution or explicit unavailable, always `externalDelivery:false`. Production has no registered adapter. Unsupported names receive a bounded 404; recognized but unimplemented live providers retain `PROVIDER_ADAPTER_UNAVAILABLE`/503 and report `BRANDFORGE_PROVIDER_CONTRACT_REQUIRED`.
- Product-contract and integrations responses use this same policy. Connect, sync and the existing synthetic sync worker enforce it. No new route, global connector/catalog, network transport, migration, index or billing behavior was added.
- A mixed production/test flag alone no longer makes BrandForge's fixture connector appear available. Production-artifact fixtures must satisfy the existing shared deterministic/disposable/CI gate and the existing test flag. Ordinary isolated unit fixtures continue to work. This changes BrandForge policy only; shared environment helpers are unchanged.
- Public configuration must be JSON with bounded depth, collection counts, keys, values and 16KiB serialized size; credential/prototype fields removed by the existing shared metadata policy are rejected rather than silently persisted. Validation occurs before schema parsing so a parser cannot strip an unsafe key and then report acceptance. This validates structure and field names, not a guarantee that arbitrary text contains no secret.
- Live mode cannot be saved through the test-only connector. A browser `callbackReady` claim is normalized to false; it is not callback/provider proof. The existing server-side encrypted secret-input mechanism is unchanged and no real value is read or created by this task.
- Sync accepts only its bounded optional idempotency key; the server keeps ownership of tenant/actor/provider/destination. A missing key retains the existing server-generated fallback. This does not add or prove business-row sync replay semantics beyond the existing job behavior.

The existing auth → module/write/admin guards and integration-feature check remain in place. Disconnect and history retain their existing tenant predicates. No support/admin shortcut, tenant override, provider-selected URL or raw credential field was added.

## Verification actually run

No package acquisition, DB command/migration, provider request, OAuth flow, server or browser was used. Child commands inherit a small OS allowlist plus explicit synthetic test flags; no provider credentials or production database URL are inherited.

| Check | Recorded result | Boundary |
| --- | --- | --- |
| New policy suite | **13/13 pass, zero fail/skip/TODO** | Actual new helper, existing schema/shared safety and committed test source transpiled with cached TypeScript, executed as CommonJS with explicit cached Zod/Node bindings; no reimplementation of policy |
| Existing Phase31 domain suite | **4/4 pass, zero fail/skip/TODO** | Actual unchanged catalog/scoring/schema/export regression source through the same bounded compile harness |
| Strict TypeScript | **PASS** | New helper/test and imported schema/safety graph, `strict`, cached Zod and Node types resolved by an ignored temporary paths-mapped configuration |
| Scoped ESLint | **PASS, zero warnings** | Changed helper/routes/test, using the unchanged repository ESLint configuration with cached parser/engine |
| Git whitespace check | **PASS** | Working source diff |

The initial new suite was **12/13**: unsafe object-key filtering by schema parsing prevented the intended explicit rejection. Pre-parse validation corrected that behavior; the initial receipt/log are retained. A wrapper's Unicode console-output failure happened after that failing test receipt was saved; it did not execute the subsequent strict command. Outcomes were checked before continuing. Later strict and focused commands completed independently.

Normal dependency junction creation returned OS `Access is denied`; both paths were checked absent afterward and the operation was not retried. Verification instead used existing readable packages, with no install, symlink or configuration/credential copy. Harnesses and raw receipts are under ignored `build/brandforge-connector/` in this worktree. This is not a normal package-runner execution, full API/build/release gate, real route/DB integration or live connector acceptance. Those remain parent integration/review gates, without manufacturing a pass or skip.

## Next implementation and acceptance

After the first provider/event contract is selected, implement only its concrete adapter and registration. Keep trusted tenant/module/actor and intended integration entitlement server-owned. A real worker must revalidate current actor/membership/module/connection authority, purpose-bound tenant vault access, provider account/environment and exact approved destination before each side effect. Reuse shared DNS/redirect/SSRF controls and bounded transport; do not send arbitrary `publicConfig` as an external payload.

Distinguish configuration, queued intent, provider acceptance and actual recipient/result acceptance. Bind external and business idempotency to the exact reviewed operation and handle uncertain results without blind resend. Tests must cover denied/disabled/revoked authority, foreign secret/destination, malformed/provider-rejected responses, timeout/redirect/retry, callback forgery/replay and current configuration changes, followed by approved synthetic target acceptance. Never label the existing deterministic fixture receipt as external delivery.

No database release change is proposed; the existing schema/release remains67. There was no commit, remote write, deployment or activation. The frozen file/hash manifest supplied to the parent binds this uncommitted candidate. Rollback of this boundary is a scoped source revert on a compatible reviewed artifact; no DB downgrade, credential rotation or provider-setting rollback is invented.
