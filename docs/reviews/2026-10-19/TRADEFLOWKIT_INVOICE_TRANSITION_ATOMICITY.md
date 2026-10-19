# TradeFlowKit invoice transition and activity commit together

Base: `1eb0115b68c8ad99d66231db68f33148d459316d`. This is a bounded
source-correctness component, not provider, deployment or production acceptance.

An authorized invoice transition previously committed its optimistic status
update before inserting the activity row. If that later insert failed, the
request returned500 but the invoice retained the new status, timestamp and
incremented version without its activity entry. Repeating the same request then
returned409 `INVOICE_TRANSITION_INVALID`; an allowed next transition carrying the
old version returned409 `INVOICE_VERSION_CONFLICT`. A transient activity write
failure after a successful update is the condition; no production occurrence
was queried or established.

Only `/v1/modules/tradeflowkit/invoices/:id/transition` changes. Its existing
tenant/version/status/deleted-at conditional update and activity insert now use
the same `db.transaction` executor. Empty update returns without an activity
write. An insert failure escapes the callback so the transaction rolls back;
success returns the same invoice after commit. The quote transition already
used this contract and is unchanged. Status choices, role/tenant guards, error
codes, version increments and response shape are preserved. Recording `sent`
still only updates shared state; this change sends no document, makes no payment
and changes no commercial policy or schema.

## Verification

The existing installed toolchain and source-compatible locked dependency cache
were reused; no packages or tools were acquired. Node24.16.0 and TypeScript5.6.3
were used locally. Node version differs from the canonical hosted release pin;
fresh combined-head CI remains required.

- Preserved actual-source observed-bad proof: seven checks passed, including
  the invoice500/committed-state/same-request409 behavior and quote rollback.
- The final desired-state native regression on unchanged1eb runtime: **7 pass,
  1 expected failure**, no skips. Same exact assertions on candidate: **8/8
  pass**, no skips/cancellations. The tests extract actual route/validation
  bodies, use real Fastify injection, synthetic pre-authorized context and an
  explicitly modeled Drizzle-shaped database. They block network calls and
  import no application/database/provider code. Quote linked-job rollback,
  happy response/activity, foreign404, validation400, stale version and a
  competing transition after pre-read remain positive controls.
- Strict standalone NodeNext checking of both test files passed, with the
  existing `node` and `@fastify/websocket` ambient declarations. The first
  attempt identified a test closure-narrowing issue (corrected) and omitted
  existing WebSocket augmentation; its failed log is retained separately.
- `pnpm lint` passed with zero warnings; `pnpm --dir apps/api typecheck` and
  `pnpm --dir apps/api build` (including SDK build) passed.
- A guarded SQL fault case is added to the existing document-mutation suite.
  It revalidates the database pool's captured disposable URL before temporary
  DDL, then installs a generated-name trigger scoped to exactly one synthetic
  invoice/tenant/activity type/action. Foreign access404 and an unaffected owned
  invoice200 prove the fault is narrow. It checks complete invoice/activity
  rollback after500, removes the trigger, retries the identical request200,
  verifies exactly one activity and checks duplicate409/no changes. Trigger and
  function cleanup runs in `finally`. The worker did **not** execute SQL.
  The parent separately ran the exact same frozen SQL test against unchanged1eb
  runtime: **3 existing cases pass / 1 new expected failure**, no skips,
  17.640 seconds at `2026-10-19T23:11:46.661Z`. The new assertion failed because
  invoice status/timestamps/version survived the activity error. Patched runtime
  on the same guarded disposable PostgreSQL16 target: **4/4 pass**, no skips,
  10.632 seconds at `2026-10-19T23:12:28.908Z`. Existing cases remained green.
  No production data or provider was used. Parent execution logs/receipts are
  `invoice-transition-baseline-sql.*` and `invoice-transition-candidate-sql.*`
  under the task launch evidence. Full combined release CI remains a separate
  gate, not inferred from the in-memory or local SQL results.

Commands from the component root, with the existing pnpm/Node PATH:

```text
pnpm --dir apps/api exec tsx --test test/tradeflowkit-transition-atomicity.test.ts
pnpm --dir apps/api exec tsc --noEmit --strict --allowJs --resolveJsonModule --target ES2022 --module NodeNext --moduleResolution NodeNext --esModuleInterop --skipLibCheck --types node,@fastify/websocket test/tradeflowkit-transition-atomicity.test.ts test/tradeflowkit-document-mutations.test.ts
pnpm lint
pnpm --dir apps/api typecheck
pnpm --dir apps/api build
```

For the unchanged native baseline only,
`TRADEFLOWKIT_TRANSITION_SOURCE_ROOT` points to a clean immutable1eb checkout.
Parent SQL execution uses the same frozen SQL test against separate unchanged
and patched runtime worktrees and an explicitly guarded disposable database.
The author does not run that command against any database. No failure is waived
or converted into a skip.

## Authority and limits

AGENTS, the current PLANS/status/contract/readiness/backup documents and the
ADR index were consulted. ADR0008 requires related writes and activity/audit to
be transactional; ADR0009 keeps scoped activity inside authorized transactions;
ADR0011 preserves manual customer-payment and shared authority boundaries.
Historical broad readiness claims do not override exact source/runtime gates.
Root owns shared status-document integration; this component changes only this
receipt, the one runtime handler and its two focused test files.

An unacknowledged database commit remains a general distributed failure case;
this patch addresses the demonstrated separate-statement status/activity gap.
It does not claim all database/network failures are retryable or repair existing
missing activity rows. No production reads/writes, real customer actions,
provider calls, billing/settings changes, credentials, publication or deployment
were performed. Retain independent review, exact committed-blob identity and
fresh complete combined release CI before source merge. Deployed owned-account
acceptance and recovery/support gates remain separate.
