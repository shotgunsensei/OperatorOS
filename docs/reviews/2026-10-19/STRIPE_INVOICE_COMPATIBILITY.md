# Application Stack invoice subscription compatibility

Baseline: `2db76299da96cdae82ddd0f596c16c1c81f73c57`, tree
`b5acd3c98c451be322a2784484696bfbe08389fc`.

The canonical invoice paid/failed handlers previously read only the legacy
`invoice.subscription` field. Stripe's Basil change moved that reference to
`invoice.parent.subscription_details.subscription`, discriminated by
`parent.type === 'subscription_details'`. Consequently all three supported
invoice event types could return `handled: false` for current-shaped payloads,
leaving their receipt retryable. Other subscription lifecycle events may still
reconcile state; this is not evidence that a real purchase lost access.

References: [Stripe Basil change](https://docs.stripe.com/changelog/basil/2025-03-31/adds-new-parent-field-to-invoicing-objects),
[Invoice object](https://docs.stripe.com/api/invoices/object).
The configured SDK version does not establish the webhook endpoint's event API
version. Production impact remains conditional on its delivered event shape.

## Bounded behavior change

- A pure `stripeInvoiceSubscriptionId` normalizer accepts legacy and modern
  string or expanded-object references, including matching dual references.
  Invalid or unrelated parent objects supply no subscription ID. A valid legacy
  reference remains usable when an unrelated parent is present. Conflicting
  valid IDs fail closed.
- Both canonical paid/failed handlers and their post-event propagation use this
  normalizer. Invoice IDs are never substituted for subscription IDs. Propagation
  resolves the exact bound Application Stack tenant for modern and expanded
  references.
- Provider retrieval, customer/tenant binding, item validation, generation and
  terminal-state checks, entitlement rules, signature verification and receipt
  claim/retry/idempotency behavior remain in their existing paths. Invoice paid
  or failed status is not subscription lifecycle authority.
- No changes to refunds, add-on/feature handlers, checkout/prices, schema,
  environment settings, provider configuration or deployment.

## Verification on the candidate

Existing installed dependencies were reused through task-local junctions;
no package acquisition or installation was performed.

| Check | Result |
| --- | --- |
| Actual public dispatcher + paid/failed source-body baseline, native synthetic DB/provider/lifecycle stubs | 4 controls passed; 6 current-shaped invoice cases reproduced failure |
| Same dispatcher/handler reproduction on patched source | 10 passed, 0 failed |
| New pure normalizer and actual dispatcher tests | 76 passed, 0 failed |
| New tests plus existing dedicated webhook binding regressions | 121 passed, 0 failed, 0 skipped |
| `pnpm lint` | Passed, zero warnings |
| `pnpm --dir apps/api typecheck` | Passed |
| Strict NodeNext TypeScript check of both changed test files | Passed |
| `git diff --check` | Passed |
| Added Fastify/disposable-DB commerce regression | **Not run locally**: no existing disposable PostgreSQL fixture confirmed |

Commands (existing pinned `pnpm` shim and Node must be on `PATH`):

```powershell
pnpm --dir apps/api exec tsx --test --test-concurrency=1 test/billing-invoice-subscription.test.ts test/billing-webhook-binding.test.ts
pnpm lint
pnpm --dir apps/api typecheck
pnpm --dir apps/api exec tsc --noEmit --strict --allowJs --resolveJsonModule --target ES2022 --module NodeNext --moduleResolution NodeNext --esModuleInterop --skipLibCheck test/billing-invoice-subscription.test.ts test/commerce-forward-model-db.test.ts
```

The source-body tests execute unchanged selected dispatcher/handler functions
with native dependency stubs. They prove normalization and control flow, not
real HTTP/signature/SQL/entitlement/provider acceptance. The added commerce test
uses the existing actual Fastify route, deterministic test payment adapter,
provider stubs and guarded disposable SQL fixture. It covers all three event
types across five shapes, processed receipt replay, invalid/conflicting
references, provider-item quarantine and corrected-provider recovery. It must
pass on the combined exact head in the existing hosted release workflow.

## Remaining release gates

Fresh independent review and the combined-head hosted release CI, including
disposable PostgreSQL acceptance, remain required before merge. This source
change neither deploys nor configures Stripe. The owner must separately verify
the endpoint's version/events, exact dedicated signing binding, catalog and
tenant/customer configuration, and approved test/live purchase/cancel/reconcile
acceptance. No real provider request, event replay, payment, database mutation or
production configuration change was performed in this pass.
