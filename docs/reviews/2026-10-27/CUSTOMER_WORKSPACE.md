# Customer Workspace: local implementation checkpoint

This phase extends immutable quality base `beaaf1dbccd2261bf57139e32104bf45d078627d` on the separate `codex/customer-workspace-oct27` branch. Its verification is separate from the original quality pass. It is not deployed or production accepted.

## Customer outcome and existing contracts

The shared shell opens `/app?page=customer-workspace`. A currently authorized TradeFlow user selects an existing Business Directory organization, optionally its associated contact/site, and an existing linked TradeFlow job. A reviewed action requests field-job/report drafts through the existing `tradeflowkit.job_to_snapproof` data-fabric workflow. The result is ready only after delivery is confirmed and the existing SnapProof result route is verified.

This is a view and handoff over existing Directory/native records. It introduces no master database, project/asset schema, importer, entitlement, pricing, credential, migration or automatic message/billing/device action. Lunch Break and other existing module access are unchanged.

## Authority and preservation

- Every new read chains existing tenant membership and current TradeFlow module access before querying data. Writes also require existing write authority; the fabric revalidates source and destination authority. A selector or requested tenant ID never grants access.
- Qualified organization/contact/site IDs and a revision digest fence the handoff. Foreign, archived, stale and ambiguous records fail closed. The adapter reuses an exact active tenant/organization/site/contact customer, without name matching or automatic merges. It does not rewrite existing native customer facts, reports or billing records.
- Delivery uses the existing signed envelope, current-authority checks and idempotency policy. Repeated unchanged intents resolve the existing run. A different Directory revision at the same source-job version requires reconciliation; changing the retry key does not bypass the conflict.
- List/detail/action generations, identity capture and aborts fence stale responses after tenant/user/selection changes. Browser navigation contains qualified IDs only; search text/contact details are not placed in history. Optional retry storage is scoped to tenant/user/job/version/context revision and contains only the intent key/run ID, not credentials.
- Unknown action outcomes keep the same intent. HTTP202 is displayed as queued, not delivered. Stale-context retries require refreshed review, and ambiguous/conflicting operations point to the original job for reconciliation. Destination links accept only existing SnapProof job/report routes with native UUIDs.

## Verified local evidence

The root combined check executed actual helper/registered-route/adapter/publisher code with synthetic SQL, storage and authority fixtures: **58/58 passed**, zero skips. This is a single combined run, not a sum of overlapping earlier runs. Full API and web TypeScript, API emitted compilation and the production Next build passed on the same 20 changed source/test paths. Changed API/web lint passed with zero warnings.

The actual-component/client browser suite passed **17/17**, zero skips. Cases include viewer/source/destination restrictions, late tenant/user responses, repeated/unknown action outcomes, changed-context reconciliation, back/forward navigation, bounded-list references, keyboard controls, and desktop/390/320 layouts. Six pure client/history cases passed earlier. Screenshots are local synthetic previews; the built-Next shell smoke is recorded separately in the external final manifest when complete.

Commands and immutable source hashes are retained in `evidence/customer-workspace-oct27` in the task evidence, including `API_FINAL_MANIFEST.json`, `web/WEB_MANIFEST.json` and `combined/*`. Toolchain reuses the installed graph (Node24.16.0 / Next15.5.25); no package acquisition or ambient provider/database credential was used. Next's configured build skips lint/types, so those checks were run separately.

## Limits, acceptance and recovery

The SQL fixture is not PostgreSQL parsing, foreign-key, lock scheduling, rollback or transaction-isolation proof. Its mutex models serialization only. Advisory coordination covers this adapter path; it is not a universal unique constraint for unrelated writers. Existing ambiguous native rows require explicit reconciliation. Capped lists are not exhaustive customer inventories.

Before production acceptance, prove lock/race/rollback behavior on a specifically authorized disposable PostgreSQL database, then real signed-session free/paid tenant, viewer/write, cross-tenant and exact-host flows on the exact candidate/build. No real login, provider, paid operation, production data, migration or deployment was performed. Full hosted release CI remains separate and must not execute the held SSO fixture by an alternate route. This branch inherits the frozen base's specific source-publication hold; it must not be published as a workaround.

Code rollback returns to the reviewed quality base; no new schema/data backfill is needed. Once used, created drafts remain durable records: do not delete customer/report data to roll back presentation code. Preserve fabric run/replay history, reconcile ambiguous outcomes and use the existing application/database recovery runbook for separately approved recovery. This phase does not establish historical financial-identity snapshots across the platform.
