# TradeFlowKit cutover runbook

Status: not authorized and not scheduled.

## Preconditions

1. Merge the reviewed cumulative branch and deploy that exact commit through
   the canonical `.replit` supervisor path.
2. Pass public 48/48 platform verification, deployed exact-host SSO, return,
   refresh, local/global logout, entitlement denial, and tenant isolation.
3. Decide whether production customer payment processing is disabled at
   launch or backed by an approved centralized adapter. Test mode is forbidden
   outside `NODE_ENV=test`.
4. Produce an approved standalone export with no secrets/customer data copied
   into Git, run the dry-run plan twice, and sign off counts/fingerprints and
   all financial totals.
5. Create and verify an OperatorOS database backup under
   `docs/DATABASE_BACKUP_RESTORE.md`.

## Window

1. Put only the standalone TradeFlowKit workload into read-only/write-freeze
   mode. OperatorOS identity and other modules remain available.
2. Capture the final export and dry-run reconciliation.
3. Apply the separately reviewed importer to the exact destination tenant.
4. Re-run target counts, customer/job links, quote/invoice line totals,
   payment totals/balances, source mapping uniqueness, and audit counts.
5. Start the compiled unified runtime and require `/readyz`.
6. Smoke lead conversion, task completion, quote public accept/decline,
   idempotent invoice conversion, manual payment retry, portal, attachment,
   notification, CSV export, deep-link refresh, SSO return, and logout on
   `tradeflowkit.operatoros.net`.
7. Enable traffic only after all gates pass. Keep the standalone workload
   frozen for the rollback observation window; do not run dual writes.

## Abort and rollback

Abort on any missing/duplicate mapping, financial mismatch, cross-tenant
reference, readiness failure, provider ambiguity, or browser failure. Restore
the verified pre-cutover backup into a new database, switch the runtime to it,
verify readiness and the critical vector, then reopen standalone writes. Do
not repair a failed cutover by deleting target rows manually.

## Evidence to retain

- exact OperatorOS commit and deployment ID;
- export SHA-256 and planner output;
- backup SHA-256 and restore proof;
- source/target counts and financial totals;
- provider configuration state without secret values;
- browser/E2E reports, pass/fail/skip counts, timestamps, and operators;
- explicit go/no-go decision.
