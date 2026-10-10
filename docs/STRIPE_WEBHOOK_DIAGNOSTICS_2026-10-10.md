# Stripe webhook diagnostic review and deployment options

Date: 2026-10-10 UTC. Status: local source candidate, unpushed and unpublished.
Branch: `codex/stripe-webhook-diag-oct10`.
Base: `58cab0cf0f6f9232403dc15e8f5ee5836b9ad14c`.
Base tree: `42ba17257f30c8709da6367b4418d03460fe2e20`.
Current merged main separately observed at
`6db8dacc45cd197b85f5853bda9e3fc936813140`, tree
`8fd73a3ad066ff82626fc848ad9c028bddd064d8`.

## What the evidence establishes

The publisher's sanitized runtime receipt records 28 webhook POST 400s across
two existing deployments and 28 generic `WEBHOOK_REJECTED` log objects. It
does not distinguish verification from classification or a database claim.
The relevant route/provider/raw-body/routing sources are identical at the
observed deployed base and merged main. Local signed-byte probes distinguish
several causes that all return the same public 400. None establishes the cause
of the actual production failures or proves financial/customer impact.

This patch changes the existing outer catch's server log object to exactly:

```json
{"code":"WEBHOOK_REJECTED","stage":"event_claim","category":"database"}
```

That example is synthetic. `code` is fixed; the other two values are closed
enums. No identifier or correlation field is added. The helper does not read
exception messages, stacks, SQL, provider response bodies, payloads or accessors.
It recognizes a few known own type/name/code values internally, checks a bounded
own cause chain and emits only the category. Unknown inputs stay `unknown`.
The original arbitrary exception code is no longer copied to the failure log.

| Stage | Operation that had started when the outer catch was reached |
| --- | --- |
| `signature_verification` | Adapter verification of the original raw bytes |
| `credit_classification` | Torque-credit event classification |
| `credit_receipt` | Existing verified Torque event receipt/fulfillment path |
| `credit_dispatch_record` | Shared credit dispatch record |
| `event_classification` | Generic plan/add-on classification |
| `event_claim` | Existing generic event receipt claim |
| `event_processing` | Generic processor dispatch; its existing inner 503 catch remains unchanged |
| `event_status_update` | Recording processed/failed state |
| `unknown` | Defensive fallback |

Categories are `signature`, `database`, `provider_authentication`,
`provider_request`, `transport`, `billing_validation` and `unknown`. A stage
locates a failure; a category narrows it. Neither proves a signing-secret,
network, schema or provider-account root cause. Missing-header/raw-body and
disabled-adapter early returns, duplicate branches, generic processing retries,
and typed Torque error HTTP behavior retain their existing implementation.
No new client-visible diagnostic or error message is introduced.

## Local verification and limits

The new four-test suite executes the actual raw-buffer parser and webhook
handler extracted from checked-in source, transpiled in a VM with synthetic
provider/database seams. The official installed Stripe SDK signs/verifies
synthetic raw bytes; its HTTP client is blocked. Tests distinguish signature,
credit/generic classification, wrapped database claim and status-update errors;
assert redaction and bounded causes; and preserve disabled/missing-header,
byte mutation, typed Torque rejection, duplicate, retry and success responses.
This does not exercise a production secret, database claim transaction or
customer fulfillment. Existing commercial contracts retain verification-before-
claim/settlement ordering and tenant/payment boundaries.

Final offline suites pass 4 diagnostic + 17 existing billing + 12 security
tests, with zero failures/skips. Four workspace typechecks, standalone test
typecheck, zero-warning root lint and SDK/API build pass. The initial selection
that included a database-dependent add-on suite failed its blocked setup; that
17-pass/4-fail log remains available. It is not counted as final acceptance.
No full web production build, runtime/browser acceptance, fresh hosted CI or
registry advisory audit is claimed. The four inherited locally patched high
advisory exceptions remain disclosed and their installed-package regressions
pass; security/dependency inputs are unchanged.

## Safe release choices, pending review and authority

1. **Exact v65 diagnostic candidate.** Publish the independently reviewed
   diagnostic branch/tree based on deployed `58cab0cf`, using a supported
   exact-source release path. It leaves the v65 manifest, release contract,
   `.replit`, supervisor, routing, provider configuration and dependency graph
   unchanged and requires no schema migration. The publisher must verify the
   selected target remains v65-ready and bind the build/published artifact to
   the exact approved source, preserve existing checkout changes, retain the
   prior artifact, and run required exact-source release checks. Do not sync
   latest main and describe it as this v65 candidate. If the supported release
   path cannot select this source without a broader change, stop and return
   that concrete limitation to the coordinator. No account/security setting
   change or bypass is part of this option.
2. **Diagnostic code on merged main.** A separately reviewed code-only patch
   can be added to `6db8dacc`. This retains main's AI/v66 code and all its
   outstanding normal database gates: conclusive private execution-target
   binding, development recovery and production PITR/backup/restore-access
   receipts, and the approved current write-pause method/window before an
   ordinary reviewed v66 apply. Diagnostic urgency does not satisfy those
   gates. Earlier CI for main cannot certify the new diagnostic source.

Neither option is authorized for push, hosted workflow or publication by this
local engineering request. Independent review and the coordinator's explicit
release decision remain required. No payment, replay, credential change,
private Stripe-record read, DNS/provider change or production data mutation is
included. The existing account-wide zero-paid-usage evidence is the
coordinator's observation; this task changed no budgets or settings and
triggered no hosted work.

## Observation and rollback after an authorized release

The sole supported-extension publisher can inspect the new bounded fields on
future natural webhook delivery and compare HTTP status to the existing
operational receipt. Do not deliberately replay events, create payments or
collect exception text/payloads to validate this patch. Keep any further
diagnosis within the owner's authorized read scope. Signature-category evidence
alone does not justify a secret rotation or endpoint change; database-category
evidence alone does not authorize a migration or restore.

For the exact v65 option, restore the retained prior v65 artifact/source through
the existing reviewed release procedure if necessary; the database schema has
not changed, so this diagnostic rollback needs no schema downgrade or restore.
For main/v66, follow its established migration/forward-repair runbook. The v65
verifier previously accepted an additive v66 schema in a local read-only test;
there is no persisted release-version ledger, and full old-app acceptance is
unverified. Do not invent a ledger incompatibility or an automatic DB restore.

The external delivery receipt supplies final full commit/tree IDs, patch hashes,
test-log hashes and code-only application-check results. Local commits and
passing tests are implementation evidence, not deployment or real customer
acceptance.
