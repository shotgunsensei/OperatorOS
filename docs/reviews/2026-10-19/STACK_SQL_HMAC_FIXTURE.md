# Stack SQL fixture: exercise the actual HMAC adapter

Base: `7a92b10a76effb014804a5d8fcf440556475d790` (PR 133 candidate).
This component changes tests and this receipt only; runtime billing, provider
safety, signature verification, tenant authority and database schema are unchanged.

The ten-case Stack PostgreSQL fixture generated real SDK HMAC signatures while
running in `APP_ENV=test` and `NODE_ENV=test`. Ordinary test mode selects the
deterministic payment adapter regardless of the production-artifact flag being
`0`. That adapter accepts its synthetic signature literal, so the fixture's SDK
signatures failed before receipts and commercial handlers could run.

The fixture now follows the existing checkout-expiration SQL fixture: validate
the captured disposable database and create the isolated tenant first, then
select development/development with the deterministic opt-in disabled, before
importing billing. It explicitly requires the configured Stripe adapter. All
provider credentials, signatures and provider responses remain synthetic; the
SDK HTTP client and external fetch remain blocked. The application server is
not started. The existing ten HMAC, receipt, generation, tenant, projection,
rollback and real row-lock cases retain their assertions.

`stack-webhook-adapter.test.ts` evaluates the actual safety, binding, adapter
factory and signing-helper source in a VM without application/database imports.
Eight controls distinguish deterministic and real-HMAC branches and preserve
wrong-key, changed-byte, stale-signature and missing-binding rejection. A ninth
test derives the effective environment from the actual SQL fixture before its
billing import, proves real-HMAC selection follows the schema guard, and verifies
that the SDK signature succeeds while the deterministic literal fails.

## Evidence

- The parent executor ran the unchanged base's ten SQL cases against an existing
  cached PostgreSQL 16 container: **1 pass / 9 fail**, no skips, 42.151 seconds.
  The failures showed signature-verification rejection and concurrency gates
  timing out before provider/SQL behavior could be exercised.
- The completed original PR 133 release run `39332436621` failed its API scope:
  2056 tests / 2047 pass / 9 fail, no skips. All nine failing case names match
  the local unchanged-head reproduction. Its archived log confirms the same
  signature rejection and unreachable concurrency gates. The old head remains
  failed and unmerged; the run was not manually retried or waived.
- The parent executor ran the corrected exact SQL fixture against the same guarded
  disposable loopback database: **10/10 pass**, no skips/cancellations, 7.082 seconds
  (`2026-10-19T22:34:27.935Z`). Its sterile child environment inherited no credentials;
  the network guard permitted only the selected loopback PostgreSQL connection
  and local tool IPC. No packages were acquired or production action performed.
- This worker ran the same new nine source tests against immutable base source:
  **8 pass / 1 expected failure** (the actual SQL fixture selected deterministic).
  Corrected source: **9/9 pass**, zero skips/cancellations, zero provider HTTP calls.
- Strict NodeNext TypeScript checking of both changed test files and the root
  zero-warning lint command passed using existing installed dependencies.

The task evidence directory retains `pr133-original-terminal-ci-receipt.json`,
`pr133-original-release-job.log`, `pr133-oldhead-local-sql-connected.log`,
`pr133-corrected-local-sql.log`, their execution receipts, the baseline/candidate
native logs, strict/lint logs and frozen file hashes. Local SQL and hosted CI
evidence remain separately attributed. A fresh exact-head full release gate
remains required. No workflow was rerun by this
component and the old failed candidate/evidence remains preserved.

These results establish isolated source/SQL acceptance for this correction, not
live Stripe delivery, payment collection, production database or deployment
acceptance. Independent source review and final combined-head release checks
must bind the exact committed blobs before merge.
