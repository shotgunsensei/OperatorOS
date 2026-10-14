# OutCall resource controls and v67 release candidate

Status: implemented and locally verified; not published, deployed, enabled or
live accepted. This continuation preserves candidate `2f943eed8a55522b987b4d83f5f91e8535b2ed8b`
and CallCommand `31b00596f7163a50d6b9880cde70f747cea3b5c3` on
`codex/production-outcall-readiness-oct14`. The original v66 candidate and its
handoff bundle remain historical evidence. No provider, production database,
credential or GitHub mutation was performed.

OutCall remains verified-self personal exit assistance with neutral profiles,
private SMS triggers and requested calls to the user's own verified mobile.
It is not a campaign dialer. The catalog/registry remain coming soon and
disabled. Source guards do not constitute permission to call anyone.

## Bounded changes

| Result | Source/local evidence | Remotely merged | Deployed | Live accepted |
| --- | --- | --- | --- | --- |
| Exact configured country boundary | Pinned `libphonenumber-js` 1.13.15 maximum metadata; valid canonical E.164, explicit country and mobile-capable type required before Verify/check/voice. A US-only policy rejects Canada and other +1 territories; unsupported configured countries fail closed | No | No | No |
| Shared account budget, quotas and capacity | Account approval row lock serializes reservations across tenants, including queued, submitting, active and unknown work. Voice, verification and app SMS replies consume approved ceilings/quotas before submission | No | No | No |
| Configuration cannot approve spend | Exact account/configuration hash plus current approval by an active platform super-admin required; expired/revoked approval, changed policy or changed country/service/caller configuration blocks new submissions | No | No | No |
| One submission per reservation | Actor, tenant, account, operation and call binding; atomic queued-to-submitting transition. Voice time limit is the stored approved duration. Lost outcomes retain capacity/money and are never redialed automatically | No | No | No |
| Cancellation, recovery and privacy agree with accounting | Unsent cancellation releases the hold; bounded recovery releases expired queues and marks stale submission/active leases unknown. Privacy deletion locks owned calls, releases queued resources and removes user links; submitted/unknown/spent accounting remains | No | No | No |
| Additive v67 storage | Two tables and three indexes; immutable first 66 manifest steps. Clean apply/reapply/verify and populated v66 rehearsal preserve selected authority/profile/call snapshots and create zero approvals | No | No | No |

## Exact configuration and approval requirements

Nothing in this section was configured on a live account. There are no default
production budgets and no seeded approval. Synthetic test values are not
recommended allowances.

The existing provider requires `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` for
signature verification, `TWILIO_VERIFY_SERVICE_SID`, `TWILIO_PHONE_NUMBER`,
`TWILIO_ALLOWED_COUNTRIES` and canonical `OUTCALL_PUBLIC_URL` equal to
`https://outcall.operatoros.net`. Optional REST authentication uses the paired
`TWILIO_API_KEY_SID`/`TWILIO_API_KEY_SECRET`; otherwise it uses the account
credential. Preserve CallCommand's independent configuration and acceptance.
Existing privacy protection requires owner-managed `OUTCALL_FIELD_ENCRYPTION_KEY`
and `OUTCALL_LOOKUP_HMAC_KEY`; never print or copy credentials into this ledger.
The only supported launch-country set is a nonempty subset of `US,CA`.
Metadata can reject numbering territory/type but cannot prove ownership or
reachability; successful controlled Verify remains necessary.

`OUTCALL_RESOURCE_POLICY_JSON` must contain exactly these 12 properties:

| Property | Required meaning and validation |
| --- | --- |
| `currency` | Exactly `USD` |
| `dailyMicros`, `monthlyMicros` | Positive safe integer USD micro-units, at most 1,000,000,000,000 each; daily cannot exceed monthly. One USD = 1,000,000 micro-units |
| `voiceCeilingMicros` | Approved worst-case ceiling for one bounded voice request, including relevant fees; positive integer no greater than daily limit |
| `verificationCeilingMicros` | Approved worst-case ceiling for each Verify start **and each check**, each separately counted; same numeric bounds |
| `smsCeilingMicros` | Approved worst-case ceiling for one app-generated SMS reply; same numeric bounds |
| `dailyVoiceRequests` | Positive integer at most 10,000 |
| `dailyVerificationRequests` | Combined daily Verify starts/checks; positive integer at most 10,000 |
| `dailySmsReplies` | Daily app-generated replies; positive integer at most 10,000 |
| `maxOutstanding` | Account-wide queued/submitting/active/unknown operations, including future scheduled work; positive integer at most 10,000 |
| `maxCallSeconds` | Positive integer at most 300; passed as Twilio `TimeLimit`, with a 30-second ringing timeout |
| `maxQueueLatenessSeconds` | Positive integer at most 600; unsent reservation expires this long after its due time |

All ceilings must be derived from independently verified account rates and
worst-case operation costs, including duration and fees, then specifically
approved by the owner. The ledger conservatively debits the full ceiling; it
does not measure actual Twilio billing. It cannot guarantee a carrier invoice
cap if an approved ceiling understates costs. It covers OutCall-managed
operations across tenants on this account, not CallCommand/other services,
inbound or fixed provider fees. Provider-side permissions/limits and ongoing
invoice reconciliation remain separate requirements.

The approval row in `outcall_account_approvals` must have:

- `account_key`: SHA-256 of `outcall:twilio:<exact TWILIO_ACCOUNT_SID>` using
  `outCallAccountKey()` from the reviewed source.
- `policy_hash`: `outCallPolicyHash()` over sorted policy entries, normalized
  deduplicated countries, exact Verify service SID and exact caller number.
  Use the canonical functions with the selected runtime configuration; never
  hand-construct a hash or print credential values.
- `approval_reference`: a real approval/audit reference, 1–200 characters;
  `approved_by_user_id`: an existing **active platform super-admin**, not a
  tenant manager; `approved_at <= database NOW()`; `expires_at > NOW()` and
  after approval; `revoked_at IS NULL`.

There is no public approval endpoint or automatic privileged seed. A future
operator must obtain specific approval for the exact account, rates, fields,
expiry and test allowance, then perform a separately reviewed privileged
transaction and preserve its audit receipt. Changing limits, countries, service
or caller invalidates the approval hash; replacing credentials requires separate
credential acceptance even though secrets are excluded from the hash. Revocation
or approver deactivation blocks new reservations and queued submissions. It does
not cancel a call already accepted by the carrier.

The static `preflight:production -- --outcall-ready` check remains only a partial
configuration check. It does not validate this new policy/approval or prove
country permissions, delivery or paid entitlement. Runtime `outCallReadyState()`
additionally requires matching durable approval. Its `ready=true` means these
source prerequisites pass, not that a live acceptance sequence was completed.
Module availability/entitlement and any future `OUTCALL_LIVE_PROVIDER` activation
must be separately reviewed; `OUTCALL_TEST_ADAPTER` stays disabled in production.

## Reservation and failure semantics

Account locking includes reserve, begin, settle, cancellation and recovery.
All held ceilings count against both current UTC day and month even if created
earlier or scheduled for later. Spent ceilings count by settlement time; released
unsent work consumes no monetary allowance. Unknown work never becomes free
merely because a day/month or timer elapsed. The same held/spent rules apply to
daily operation quotas. Existing per-user abuse rates remain in force.

Submission gets a 120-second lease; accepted voice gets its stored duration
plus 120 seconds. Each worker cycle recovers at most 50 expired reservations.
Queued expiry releases and cancels unsent calls. Expired submitting/active work
becomes unknown, retaining money and capacity. Signed terminal voice callbacks
settle once; late callbacks cannot reopen spent/released resources. HTTP 4xx
voice rejection conservatively spends the ceiling; uncertain responses retain
the hold. Verification uncertainty has no terminal voice callback and requires
independent carrier reconciliation. No arbitrary hold-release/retry API is added.

Legacy Twilio scheduled/processing calls without reservations block new grants
until independently reconciled; migration never invents allowances for them.
Accounting rows contain no raw phone, message or credentials. Module privacy
deletion removes user links while retaining account-level financial/recovery
records; unknown holds remain. Audit/retention policy and provider-side records
must still be reviewed for production. Advanced Opt-Out/provider-generated SMS
behavior and charges require controlled acceptance; app suppression remains active.

## v67 migration and rollback

The 67th ordered step is `outcall_resource_tables` after v66
`shared_ai_budget_tables`. The first 66 steps have SHA-256
`fb53873a03fc3cb82ee622fc8424e00731c9a4daf17b6ab0643484e1f3e70115`.
New `outcall_account_approvals` stores account-bound time-limited privileged
approval. New `outcall_resource_reservations` stores tenant/actor/call bindings,
request uniqueness, bounded money/duration, lifecycle and audit timestamps.
Validated checks/FKs and call/account/recovery indexes are verified. There is
no approval seed, spend grant, automatic backfill, provider call or destructive
operation in this new step.

Production was last anonymously observed at v65/65, commit `7c212305...`,
build `ef276f880c39aa41fc661dca` at 14:43 UTC on October 14. That is a historical
checkpoint, not a fresh production/recovery receipt. Promotion must reconcile
Replit divergence without reset, identify both selected deployment databases,
obtain recoverable snapshot/logical-backup/restore receipts and specific apply
approval, then use the supported root ordered `db:apply` and independent
`db:verify` to require **v67/67**. A v65 target also needs the preserved v66 step.
Keep Replit automatic database copy/apply off and serving apply authority unset.

Never drop these tables or their holds to make an older app ready. v65/v66 apps
cannot be assumed compatible with the v67 ledger. Application rollback needs a
reviewed compatible artifact/forward repair; data rollback restores the approved
whole-platform backup to a new database, reconciles identity/billing/queues and
switches traffic only with authorization. See [the shared recovery runbook](../DATABASE_BACKUP_RESTORE.md).

## Verification and remaining gates

On Xodus-John, clean child environments excluded inherited GitHub/provider
credentials. PostgreSQL 16 was task-owned and loopback-only with explicitly
disposable synthetic databases. Final focused OutCall/schema/provider-isolation
checks pass **37/37**, no failures/skips/canceled/todo. Selected CallCommand
compatibility passes **39/39**. Four workspace typechecks, strict typing of all
changed resource/provider/migration tests, zero-warning lint and production
build pass. Final committed-artifact supervisor smoke and build identity are
recorded in the separate handoff receipts.

Exact focused API command: `corepack pnpm --dir apps/api exec tsx --test
--test-concurrency=1 test/outcall-adapter.test.ts test/outcall-provider.test.ts
test/outcall-phase12b-db.test.ts test/outcall-phase50-routes.test.ts
test/outcall-resources.test.ts test/database-release-contract.test.ts
test/provider-isolation-production-artifact.test.ts`.
Also run `corepack pnpm typecheck`, `corepack pnpm lint`,
`corepack pnpm build:production`. Strict standalone test compilation uses
ES2022/NodeNext, JSON resolution and `--strict`; exact commands/receipts are in
the local handoff. The unchanged earlier platform 45 and component-browser 5
passes belong to `2f943eed...`, not a new deployed acceptance claim.

Clean v67 apply/reapply/verify and populated v66-to-v67 apply/reapply/verify pass
only on disposable loopback targets. The populated rehearsal snapshots one
synthetic user, tenant, membership, profile and scheduled call; it proves those
rows unchanged, not an exhaustive production row comparison. Both rehearsals
create zero approvals. Initial focused attempts exposed stale release-version,
phone-mask fixtures and leftover synthetic STOP state; fixtures were corrected,
no authorization guard weakened. Final checks supersede those failed attempts.
No full repository release matrix, hosted CI, exhaustive security scan, live
carrier process-death or deployed authenticated E2E is claimed.

Remaining owner actions: clear the PAT hold with verified safe authentication;
reconcile Replit and approve backed-up v67 migration; verify Stripe signature
recovery/retry deadline; approve exact provider/account configuration and cost
policy; review canonical module availability/commerce; approve a personally
owned OutCall test recipient and maximum verification/SMS/voice cost; capture
controlled delivery, suppression, cancellation, outage/process-death recovery
and deployed non-admin signup/login/SSO/entitlement/mobile acceptance. The
CallCommand test targets are not OutCall approval. This candidate sets none of
these approvals, credentials, limits or activation flags.
