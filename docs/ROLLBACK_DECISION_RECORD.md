# OperatorOS Phase 15 rollback decision record

- Decision date: 2026-07-27
- Current decision: **NO ROLLBACK REQUIRED FOR DEPLOYMENT ITERATION 1**

## Decision

Replit deployment `0a34bd3d-5706-434d-87ee-fffd3bf6e5cd`, build
`c49eeb9c-5f0b-40b3-9f31-44813446124c`, failed during the platform's automatic
`npm install` with `EINVALIDTAGNAME`. The repository build command, runtime
supervisor, readiness gate, and database release did not run. The prior public
deployment remained active, so rolling back application or database state
would add risk without changing the outcome.

## Next-deployment rollback triggers

Stop promotion and roll application traffic back to the previously identified
healthy release if any of these occur:

- readiness is non-200 or reports missing/mismatched commit/build identity;
- the 48-check public verifier regresses;
- authentication loops, return-path loss, cookie weakening, or coordinated
  logout failure appears;
- tenant or authorization negatives expose or enumerate foreign resources;
- data reconciliation differs from the approved preview;
- error rate, latency, database saturation, or provider failures breach the
  approved release thresholds.

## Procedure boundary

Before an approved database apply, capture and verify the provider-managed
backup and record the prior application commit/build ID. Application rollback
uses the deployment provider's immutable prior revision. Database restore is a
separate destructive operation and follows `docs/DATABASE_BACKUP_RESTORE.md`;
it requires explicit human approval and must not be inferred from an
application rollback.

After rollback, verify prior `/healthz` and `/readyz`, run the public verifier,
perform a read-only tenant/data reconciliation, and preserve deployment,
request, response, and server-log evidence in the production acceptance
report.
