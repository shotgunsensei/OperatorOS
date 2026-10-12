# Generic checkout expiration regression

The source checkpoint is a clean isolated worktree on
`codex/checkout-expired-oct12`, based on main
`210482a380b4cf663315c3cece17c3787dd86682`, tree
`b5a01a2420354bd60e45455f93953f9f2457c260`. The original canonical checkout
is not changed. No dependency, lockfile, migration or provider configuration
changes belong to this patch.

After strict verification, a generic `checkout.session.expired` event previously
fell through the unsupported-event branch. The canonical route persisted a
failed receipt and returned 503, causing unnecessary redelivery. The canonical route, after its existing Torque classification and generic
claim, returns `checkout_expired_ignored` with propagation disabled. The route still
records successful processing and rejects concurrent/changed-payload claims.
Stack retry already checks an expired provider session before replacing its
incomplete purchase intent; this event does not mutate that cart or grant access.

The acknowledgment is restricted to canonical live dispatch after full Torque
classification. The exported generic processor and saved-event admin replay keep
their existing unsupported-expiry behavior. An actual DB replay regression found
that placing success in the generic processor could falsely resolve an older
plan-classified Torque receipt without settlement; the canonical placement avoids
both that path and indirect payment-metadata classification bypass. Generic failed
expiry can still be reclaimed and acknowledged through provider redelivery.

Torque classification occurs before generic dispatch. Its real shared receipt
continues to close the exact unpaid purchase with `CHECKOUT_EXPIRED`, without
crediting it. Add-on/feature-specific processing and unsupported generic event
types are not broadened into success. The existing signature incident occurs
before this branch and cannot be corrected by this change.

## Focused source checkpoint on 2026-10-12

Node 24.19.0; pinned pnpm 10.34.5 frozen-lockfile install; PostgreSQL 16 in a
task-owned Docker container with a tmpfs data directory, loopback binding and
synthetic test credentials. No `.env` file or inherited application credentials
is loaded. External provider networking is blocked; the dependency audit child
may read the npm registry. Logs and hashed command receipts are retained outside
the checkout in the task's `real-release-evidence` directory.

```powershell
corepack pnpm --dir apps/api exec tsx --test --test-concurrency=1 test/checkout-expiration-webhook-db.test.ts test/addon-billing-dlq.test.ts test/commerce-forward-model-db.test.ts test/stripe-webhook-diagnostics.test.ts test/torqueshed-settlement-reconciliation.test.ts test/callcommand-lane-settlement-db.test.ts
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm --dir apps/api exec tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --esModuleInterop --skipLibCheck test/checkout-expiration-webhook-db.test.ts
```

The focused command passes **42/42**, zero failure/cancel/skip/todo, in
the retained final command log. The twelve new tests use the actual registered Fastify route,
configured Stripe SDK HMAC-verification branch and PostgreSQL receipt tables.
They prove one receipt under twelve simultaneous deliveries, unchanged later
duplicates, active/expired processing leases, same-row failed-delivery recovery,
payload mismatch rejection, existing cart/authority preservation, wrong/old/
modified/missing signatures, absent raw body, supported/unsupported distinctions,
separate add-on dispatch and real Torque expiry plus invalid-scope rejection.
Two admin-retry controls prove failed legacy Torque remains visible with its
unpaid purchase unchanged, while generic expiry retains replay failure until
canonical redelivery. The existing diagnostic fault-injection fixture now uses
recognized checkout completion so its processing-failure assertions still exercise
the generic processor instead of the new explicit expiry acknowledgment.
No Stripe HTTP request occurs. All four workspace typechecks, root zero-warning
lint and strict new-test typechecking complete successfully.

The retained base run has five passes and four expected failures. An additional
case subsequently covers expired leases. One final-harness attempt had forty
passing assertions but six file failures because the local egress wrapper rejected
tsx's documented `\\?\pipe\` Windows IPC path. The wrapper now permits both local
Windows pipe forms while blocking nonloopback providers. A standalone test-type
attempt omitted the repository's strict compiler setting and failed on unchanged
discriminated unions; rerunning with `--strict` passes. These were harness issues,
not changes to production safeguards or weakened assertions.

## Remaining release gates

Independent review and the full exact-candidate release contract are required
before merge. Later verification must identify its exact commit and artifact;
these focused results are not a production build or deployment claim. Keep the
existing zero-dollar Actions stop-usage guard and inherited patched advisory
integrity checks intact.

Publication remains blocked on supported browser runtime, exact source/settings/
generation inspection, production signing-binding evidence and the established
database target/recovery/current write-pause gates for main/v66. The owner reports
he almost certainly did not submit the last outer Republish. This is qualified
evidence of possible nonactivation, not proof of secret correctness, persistence
of a panel or permission to submit credentials. Do not reload a pending panel,
re-enter values, change account-wide secrets, or replay without fresh authority.

The change adds no schema or business-state mutation. An application revert
restores the previous retry behavior; already processed expiry receipts remain
processed and must not be deleted. A v66 database still requires a compatible
v66 application for recovery; the older v65 artifact is not its rollback target.
