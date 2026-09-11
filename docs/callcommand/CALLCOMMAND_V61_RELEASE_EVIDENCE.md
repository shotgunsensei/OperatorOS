# CallCommand v61 release evidence

Verified 2026-09-11. Publication authority includes commit, PR to main, Replit
GitHub pull, publication, and the required backed-up additive database release.

## Current delivery state

**Source merged, Replit published, exact live release verified, both databases
current at v61/61, and authenticated three-step setup verified. Actual AI-call
and hosted Stripe acceptance remain open.**

- Implementation PR: [#98](https://github.com/shotgunsensei/OperatorOS/pull/98).
- Reviewed head: `cd13d6a20d58a7e1488f8bbaa972be0a445bd41c`.
- Merge: `cb47800fc1476825949a9476c7f3a5fe1a9e9312`, merged
  `2026-09-11T04:52:58Z`. Its tree equals the reviewed head's tree.
- Replit clean `main` pulled that merge with `git pull --ff-only origin main`.
  `CI=true corepack pnpm install --frozen-lockfile` passed with pnpm 10.34.5.
- Canonical local `main` matches the merge. Unrelated interface/help/security
  work remains uncommitted and was excluded from the implementation PR.
- Replit added empty post-publication commit `915b0cd6b9470c6c098225a4a11cbf780d4f9d97`
  after the build. Its tree equals the reviewed merge. Its branch was preserved
  as `codex/replit-v61-publish-marker`, and a clean GitHub-tracking `main` was
  restored without deleting the marker or rewriting any commit.
- This evidence is a subsequent documentation-only change. The live runtime's
  code commit remains the explicitly identified merge above.

## Exact-source verification

[PR release run 34562492707](https://github.com/shotgunsensei/OperatorOS/actions/runs/34562492707)
passed all 14 required stages on Ubuntu, Node 20, pnpm 10.34.5, and disposable
PostgreSQL 16 with deterministic provider fixtures:

| Verification | Result |
| --- | --- |
| API tests | 1,467 passed; zero failed, skipped, canceled, or todo |
| Unit tests | 52 passed; zero failed/skipped |
| Clean database apply, reapply, verification and integration | 32 passed; zero failed/skipped |
| Main exact-host browser journeys | 24 passed |
| Visual/accessibility browser cases | 4 passed |
| Frozen install, typecheck, repository lint, production build, parity, core preflight | Passed |
| Phase 39 hardening | Passed; zero unresolved dependency advisories/critical findings; two pre-existing patched high records remain disclosed |

[PR native run 34562492720](https://github.com/shotgunsensei/OperatorOS/actions/runs/34562492720)
passed contracts, Android build/deep links, and iOS simulator build/deep links.
The merge's native run
[34563858982](https://github.com/shotgunsensei/OperatorOS/actions/runs/34563858982)
also passed. Merge release run
[34563859024](https://github.com/shotgunsensei/OperatorOS/actions/runs/34563859024)
passed all 14 stages on the exact merge, including the same 1,467 API and 32
integration checks. Both PR and merge verification are terminal green.

The preceding PR run correctly failed on fixture catalog cleanup and a browser
journey that had not opened the new Advanced setup disclosure. Both defects were
fixed, and the fresh passing run retains the Starter entitlement denial,
forwarding, persisted workflow, and reauthentication assertions. No gate was
skipped or relaxed. Earlier focused Windows and guided desktop/mobile evidence
remains in the [investigation](CALLCOMMAND_TENANT_SETUP_INVESTIGATION_2026-09-10.md).

## Recovery and database release

Replit production point-in-time recovery was on with seven days of history and
restore access available. Scheduled backups remained off. Private encrypted
custom-format logical backups were created outside Git for development and
production. Each was fully decrypted into a restricted temporary file for
`pg_restore --list`; that plaintext verification file was then removed.
This proves a readable restore catalog, not a full restore rehearsal.

| Snapshot | UTC | Encrypted bytes | Readable TOC entries |
| --- | --- | ---: | ---: |
| Development before apply | 2026-09-11T04:43:59Z | 2,171,360 | 3,517 |
| Production, with traffic paused | 2026-09-11T04:55:43Z | 2,252,464 | 3,526 |

Private recovery paths, checksums, and keys remain in the authorized Replit
workspace outside Git; no connection string, database dump, key, or customer
record is in this report. Temporary workspace snapshots supplement provider
recovery and are not a durable off-site backup policy.

The merged source's `corepack pnpm db:plan` ended in
`callcommand_guided_setup`. The supported root apply used
`OPERATOROS_DATABASE_RELEASE_MODE=apply` only on its one-shot process. Production
was explicitly selected separately from development; no test suite ran against
either persistent database. Independent `db:verify` followed each apply.

| Database | Apply | Independent verify | Result |
| --- | ---: | ---: | --- |
| Development | 6,093 ms | 411 ms | v61/61 |
| Production | 12,841 ms | 582 ms | v61/61; all three new tenant-composite foreign keys validated |

Production before/after reconciliation was unchanged: 12 tenants, 5 subscriptions,
all 5 active/trialing and grandfathered, zero Stripe-linked subscriptions, zero
Application Stack rows, 75 module grants all active, and zero open/retry/processing/
dead-letter webhook deliveries. The new setup-order table and three validated
foreign keys are present. No existing business rows were replaced or removed.

## Published application and live verification

Production was paused for the backed-up database apply. The publish form kept
development-data overwrite unchecked. No Stripe sandbox-to-live synchronization,
account activation, catalog creation, phone purchase, or charge was performed.

The connector could not finish its schema-change check, so publication used the
workspace UI. During an extended preparation delay, the prior application was
resumed successfully to restore access. Replit subsequently completed security
scan, production build, bundle, and Autoscale promotion. The intermediate Stripe
connection guidance did not require a new sign-in or permission grant to publish;
the earlier sign-in handoff was withdrawn. No billing connection was changed.

| Live release identity | Verified value |
| --- | --- |
| Code commit | `cb47800fc1476825949a9476c7f3a5fe1a9e9312` |
| Immutable application build | `9c9632bb7f9a1a34945bc028` |
| Built at | `2026-09-11T05:12:19.218Z` |
| Deployed at | `2026-09-11T05:20:01.487Z` |
| Lockfile SHA-256 | `969322c9ed0b3712109cacc767dc513e63adb41321b9b11601a02360e240def6` |
| Database contract | v61/61, last step `callcommand_guided_setup` |
| Replit build | `53f152aa-5492-4ef4-956a-f8d8840dc419` |

Public `/readyz` returned HTTP 200 with that exact identity. With
`OPERATOROS_EXPECTED_RELEASE_COMMIT=cb47800fc1476825949a9476c7f3a5fe1a9e9312`,
`node scripts/verify-production-runtime.mjs` passed **47/47** checks: platform
health and API readiness, auth headers, registered-host diagnostics, exact-host
PKCE redirects, callback reachability, and the existing OutCall activation lock.
No test credentials, production writes, or provider calls were used by that check.

The existing authenticated owner session reached
`https://callcommand-ai.operatoros.net/setup` on the new release. The page showed
the three steps, business form, automatically prepared voice/instructions text,
and collapsed Advanced setup disclosure. Empty required fields correctly kept
the first action disabled. No profile, number, workflow, checkout, or tenant
business record was created or edited during live inspection. The browser tab
was retained as a deliverable.

The temporary production connection was cleared and persistent release apply
authority verified absent. A complete provider-originated AI call, hosted Stripe
purchase, signed payment webhook, authenticated owner/member workflow matrix,
and restore rehearsal are separate acceptance scopes and are not claimed here.

## Remaining CallCommand launch configuration

The inspected production settings did not contain:

- `OPENAI_PROJECT_ID`
- `OPENAI_WEBHOOK_SECRET`
- `CALLCOMMAND_SIP_ROUTE_SECRET`
- `CALLCOMMAND_REALTIME_MODEL`
- `STRIPE_PRICE_CALLCOMMAND_CONCURRENT_LANE_MONTHLY`
- `STRIPE_PRICE_CALLCOMMAND_ADDITIONAL_LOCAL_NUMBER_MONTHLY`
- `STRIPE_PRICE_CALLCOMMAND_TOLL_FREE_NUMBER_MONTHLY`

The existing authenticated production setup page reported incomplete OpenAI
Realtime configuration and no receptionist/line for the inspected organization.
No tenant configuration was changed during this release inspection. Configure
these platform-owned inputs securely and validate approved prices before a
controlled real-call and signed-payment acceptance run. Tenants should not
supply provider accounts, model settings, keys, SIP routes, or webhook URLs.

The investigation retains the remaining product gaps: fully automatic usage
invoicing and an approved allowance/overage policy; unified invoice/anniversary
behavior; unattended setup after all browser tabs close; expired-checkout
recovery; and long-call operation on the deployment platform. Repository
defaults of one included local number, $5 per additional local number, $8 per
toll-free number, and $49 per additional concurrent lane are not proof of an
approved, active live Stripe catalog.
