# OperatorOS incident and rollback runbook

Effective date: 2026-08-14 (Phase 39 refresh)

## Immediate response

1. Assign incident commander, operations lead, security lead, and recorder.
2. Preserve request IDs, deployment commit, sanitized logs, provider event IDs,
   database release fingerprint, and the last known-good backup checksum.
3. Freeze risky writes. Disable the affected provider or module through an
   existing fail-closed gate; do not bypass auth, tenant, entitlement, audit,
   signature, or readiness controls to restore service.
4. For suspected session or SSO compromise, rotate/revoke through OperatorOS,
   invalidate token versions and handoffs, and coordinate logout. Never pass a
   replacement token through a URL or chat.
5. For tenant exposure, preserve evidence, stop the affected route/module, and
   assess notification obligations with legal/privacy owners.

## Application rollback

1. Identify the exact last-known-good reviewed commit and its matching database
   release contract.
2. If the current database remains compatible, deploy that artifact through
   the readiness-gated supervisor and require health, auth, tenant,
   entitlement, billing, deep-link, and logout smoke tests before traffic.
3. Do not force-push, rewrite history, run child migrations, or improvise a
   destructive down migration.

## Database recovery

1. Preserve the failed database read-only when safe and capture an authorized
   provider snapshot plus logical archive.
2. Restore the last-known-good archive into a new database. Never overwrite
   the only recoverable copy.
3. Verify checksum/TOC, public table and foreign-key counts, zero unvalidated
   constraints, and core authority/module row vectors.
4. Apply only the matching ordered idempotent OperatorOS release.
5. Start the matching compiled artifact with external providers disabled.
   Require `/readyz`, tenant/RBAC/entitlement negatives, SSO exchange/replay,
   persistence, and authenticated browser smoke.
6. Switch traffic only after an explicit incident commander and data owner
   decision. Retain the former database until the approved retention window
   closes.

## Restart and provider recovery

- The API shutdown path stops the shared worker before closing the bounded
  PostgreSQL pool. The Linux supervisor sends SIGTERM, waits, and escalates
  only after its grace period.
- Re-enable Stripe/Twilio/email/AI/scanner providers one at a time. Reconcile
  provider events and idempotency claims before retrying; never replay raw
  callbacks without signature verification.
- For job recovery, inspect leases and dead-letter state, classify retryable
  errors, and cap replay batches to prevent retry storms.
- A stale/missing worker heartbeat or ready item older than five minutes makes
  `/readyz` fail. Drain traffic before lease repair; replay by durable ID and
  confirm the destination idempotency claim/provenance record before closing.
- Never enable `RUNNER_MODE=local` in production to restore workspace
  execution. Keep execution routes truthfully unavailable until the separately
  isolated runner gateway, signing and approval policy are operational.
- For dependency exception incidents, reproduce the malicious fixture, verify
  the exact patch hash and GHSA allowlist, replace the exception when an
  upstream fixed version becomes compatible, regenerate the SBOM, then rerun
  the complete hardening/release gates.

## Closure

Record timeline, customer/tenant impact, root cause, evidence location,
recovery point/time, data reconciliation, security/privacy decision, follow-up
owner/deadline, and the exact acceptance commands. Update the threat model,
tests, runbooks, and release gate before normal releases resume.
