# Stripe webhook bounded diagnostic guidance

The diagnostic code in this main integration is identical to independently
reviewed v65 commit `9f485444e34ce214982ea61e456c4a4c1ca3ecb7`.
The coordinator reports that v65 is Replit Live at 20:29:54 UTC on October 10,
deployment build `dc29f272-1a7a-4684-bca5-1284e5961fab`. Replit's clean local
checkpoint is `55f7959aeea84a21418ac89048c109b795410433`, tree
`cc0505a9c440a515eff843b0c8fa3f505f0e6935`, identical to reviewed `9f485444`.
These runtime observations belong to the sole supported-extension publisher;
this source integration did not access the deployment or publish main.

Main integration is additive from
`6db8dacc45cd197b85f5853bda9e3fc936813140`. It preserves AI, checkout and
budget changes and manifest v66. Main/v66 publication and migration remain
outside this task and retain their existing target/recovery/write-pause gates.
The diagnostic does not fix the underlying incident or establish customer
acceptance. Unknown category is intentionally non-discriminating.

## Safe result to return from a natural retry

Return only the observed deployment/release identity, UTC timestamp, HTTP
status and the exact three diagnostic fields. No new error text, stack, SQL,
event/customer/tenant IDs, payload, signature, URL with credentials or secret
value is needed. Examples below are synthetic, not observations:

```json
{"code":"WEBHOOK_REJECTED","stage":"signature_verification","category":"signature"}
{"code":"WEBHOOK_REJECTED","stage":"credit_classification","category":"provider_authentication"}
{"code":"WEBHOOK_REJECTED","stage":"event_claim","category":"database"}
{"code":"WEBHOOK_REJECTED","stage":"event_status_update","category":"database"}
```

Only the existing outer catch emits this object. Missing-header/raw-body,
disabled-provider and duplicate early returns retain their existing responses.
An inner processing failure or `handled=false` still returns the existing 503
retry code without this new outer-catch object when recording failed status
succeeds. Fixed log `code` does not replace the public HTTP body/status; typed
Torque errors keep their existing status/code. Do not infer that every 400/503
must emit this object, or that a 200 duplicate proves new fulfillment.

## From stage to concrete next check/fix

| Observed stage/category | What returned before failure | Next bounded investigation and conditional fix |
| --- | --- | --- |
| `signature_verification` / `signature` | No classification, claim or fulfillment | Owner privately compares the intended existing endpoint signing secret to the deployed binding, returning equality/presence only. If mismatch is confirmed and correction authorized, owner saves the existing correct secret privately and reloads the release; agents never receive it. If bindings match, check signature timestamp/clock and raw-byte preservation through the existing topology. Do not weaken verification or rotate a key from this enum alone. |
| `signature_verification` / `unknown` | Adapter verification has not returned | Check non-secret configured booleans and compiled Stripe SDK resolution on the exact artifact. A missing SDK module needs a tested packaging repair; a confirmed missing existing binding needs the owner-private correction. No network request or credential exposure is necessary for an offline SDK-load reproduction. |
| `credit_classification` / `provider_authentication`, `provider_request` or `transport` | Signature verification returned | Classification may resolve existing payment metadata. Inspect approved account/mode/permission or connectivity metadata; private Stripe records still require their own authorized scope. Reproduce the identified classification/provider branch with synthetic input before a narrowly reviewed adapter/binding repair. An auth category alone does not identify which binding is wrong. |
| `credit_classification` or `event_classification` / `unknown` | Signature verification returned; generic claim has not started | Use the stage to isolate the pure classifier and reproduce the relevant type/metadata-shape case with sanitized synthetic input. Fix only the confirmed classifier defect. Existing generic `checkout.session.expired` handling can return a retryable 503; its name alone does not explain the earlier outer-catch 400. |
| `event_claim` / `database` | Signature and both classification steps returned | Check `billing_events` columns, usable unique-index inference on `stripe_event_id`, app-role read/insert/update grants, and any attributed `users` lookup in the actual published DB context. If a missing index/column/grant is proven, prepare the exact reviewed v65-compatible repair and establish target/recovery/write-pause gates before a write. Do not apply main's v66 merely to repair this v65 receipt path. |
| `event_claim` / `transport` | Verification/classification returned | Check existing published database connectivity and role/target binding; this stage makes a DB transport failure plausible rather than a signature failure. Preserve connection values privately. Fix only the proven connectivity/binding problem under its authority. |
| `credit_receipt` / `billing_validation` | Signature and credit classification returned | Follow the unchanged public Torque validation code and reproduce its domain boundary with synthetic data. Reject malformed authority/amount/currency rather than granting credits. No metadata or tenant bypass is permitted. |
| `credit_receipt` / `database` | A verified credit event entered the shared receipt path | Check the shared receipt/credit schema, constraints and app-role grants in the published context. Preserve existing receipt and credit ledgers; a retry is not permission to delete or re-credit. A schema repair needs the ordinary DB gates. |
| `credit_dispatch_record` / `database` | Shared receipt returned; fulfillment may already have committed | Check `billing_events` recording (including tenant/metadata columns and event uniqueness). Repair the recording defect after review; preserve shared exactly-once state and do not force fulfillment again. |
| `event_status_update` / `database` | A claimed event reached processed/failed recording; processing may have committed or failed | Check ledger update grants/columns/constraints. Fix the recording defect with a reviewed bounded repair; do not delete, unclaim or replay the event as a diagnostic shortcut. |
| Any stage / `unknown` | The stage locates the attempted operation only | Keep root cause open. If existing safe metadata cannot isolate it, propose another bounded diagnostic or synthetic reproduction for review; do not collect raw exception/payload text. |

Categories are closed labels, not SQLSTATE/provider details. `database` can
represent different constraint, permission or connection errors. The same
category at different stages refers to different operations. A confirmed
catalogue mismatch on a differently bound SQL-console role/target does not
prove the published app has that mismatch.

## Optional read-only receipt-schema signals

Run only in an already authorized, privately bound execution context matching
the published application's target/role. These SELECT-only catalogue probes
return schema/grant signals, not customer rows or connection values. They are
not a replacement for the supported full release verifier or target mapping,
and no probe was executed against production by this source task.

```sql
SELECT
  to_regclass('public.billing_events') IS NOT NULL AS billing_events_present,
  to_regclass('public.users') IS NOT NULL AS attributed_users_table_present,
  has_table_privilege(current_user, to_regclass('public.billing_events'), 'INSERT') AS ledger_insert,
  has_table_privilege(current_user, to_regclass('public.billing_events'), 'SELECT') AS ledger_read,
  has_table_privilege(current_user, to_regclass('public.billing_events'), 'UPDATE') AS ledger_update,
  has_table_privilege(current_user, to_regclass('public.users'), 'SELECT') AS attributed_users_read;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='billing_events'
  AND column_name IN ('id','user_id','tenant_id','event_type','stripe_event_id',
    'payload_hash','metadata','processed_at','error_message')
ORDER BY column_name;

SELECT EXISTS (
  SELECT 1 FROM pg_index i
  JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=i.indkey[0]
  WHERE i.indrelid=to_regclass('public.billing_events')
    AND a.attname='stripe_event_id' AND NOT a.attisdropped
    AND i.indisunique AND i.indisvalid AND i.indisready AND i.indimmediate
    AND i.indnkeyatts=1
    AND (i.indpred IS NULL OR
      pg_get_expr(i.indpred,i.indrelid)='(stripe_event_id IS NOT NULL)')
) AS stripe_event_unique_index_candidate_present;
```

The index signal accepts the existing simple partial or unconditional unique
index form. Expression formatting or other equivalent predicates can produce
a false signal; SQL inference and full source-contract verification still need
review. It is diagnostic metadata, not a readiness/repair authorization.

## Observation and action boundaries

The publisher observes future natural retries using existing supported
operational surfaces. This source thread does not use a browser, query runtime
APIs around a browser/client block, replay events, read private provider records,
make payments/calls, change credentials/settings, or mutate production data.
The next fix must follow actual stage evidence and retain signature, tenant,
billing, reservation and idempotency authority. Main integration does not
grant permission to publish its v66 candidate.
