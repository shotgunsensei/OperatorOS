# Webhook diagnostic VM fixture dependency repair

Base: `acbeb7ddcef90f7587046aad244fa8c6522cd14f`, tree
`ea2e5e1e5843636048fe45bb711ce999b006df0c`.

The failed PR132 release run is retained as failed. Its API diagnostic test
reproduces locally on unchanged source: **4 tests, 3 passed, 1 failed**, at
`stripe-webhook-diagnostics.test.ts:124`, expecting HTTP 400 but receiving 503.

The test extracts the actual registered webhook route into a VM. The route now
calls `billingObservationResult(event.type)`, correctly imported by the runtime
module, but the diagnostic VM omitted that binding. Its resulting ReferenceError
is caught as an event-processing failure, returning retry 503 before the intended
`mark_processed` database fault can exercise bounded diagnostic HTTP 400. This
is fixture dependency drift; the original diagnostic assertion remains required.

Only the diagnostic test changes. It extracts the **actual production helper
declaration** from `billing-service.ts` with the TypeScript AST and compiles it
into the same VM as the actual route. An isolated `exports` object supports the
real exported declaration; the full billing service and its DB/environment
initialization are not imported. No helper logic is copied or replaced by a fake.

All existing response/status, signature, raw-byte, stage/category, redaction,
idempotency, disabled-provider and processing-retry assertions are preserved.
Additional signed `invoice.created` controls prove observation succeeds without
calling a deliberately failing settlement stub, and that its receipt-update
fault still returns the expected bounded 400 database diagnostic without private
fixture values. The real SDK HMAC verifier is retained and provider networking
remains explicitly blocked/counted.

The API-test VM inventory was searched for `runInNewContext`, `runInContext`,
`createContext` and `new Function`. Two fixtures execute the registered billing
webhook route body: this diagnostic fixture and
`billing-invoice-observation.test.ts`. The latter already compiles the actual
observation helper. Signature/service/retry/managed-number VM fixtures exercise
other selected functions; UI/runtime VM fixtures do not execute this route.
No second omitted route-helper binding was found in that search.

| Local check | Result |
| --- | --- |
| Unchanged exact-base diagnostic test | 3 passed, 1 reproduced failure, 0 skipped |
| Diagnostic + observation route + saved-receipt suites | 49 passed, 0 failed/skipped/cancelled/todo |
| Strict changed-test NodeNext TypeScript | Passed |
| Root zero-warning lint | Passed |
| `git diff --check` | Passed |

```powershell
node --import tsx --test --test-reporter=tap apps/api/test/stripe-webhook-diagnostics.test.ts apps/api/test/billing-invoice-observation.test.ts apps/api/test/billing-invoice-observation-retry.test.ts
node node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --esModuleInterop --skipLibCheck apps/api/test/stripe-webhook-diagnostics.test.ts
pnpm lint
```

Task logs, source receipts and VM inventory are under
`evidence/OperatorOS/next-pass/webhook-diagnostic-fixture/`. Existing dependencies
were reused; no package acquisition, real API server, DB/provider/customer
request, credential, payment, live replay or publication occurred.

This test-only repair does not alter runtime source, response policy or release
gates, and does not make the failed old-head workflow green. Independent review
and a new combined exact-head full release run remain required before merge.
