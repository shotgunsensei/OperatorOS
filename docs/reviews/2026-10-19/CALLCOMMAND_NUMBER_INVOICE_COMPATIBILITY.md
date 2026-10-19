# CallCommand managed-number invoice reference compatibility

Base: `7c077cce8ba6c6471014ffe264b85ab95ddd3735`, tree
`4a9e4fb6f4770522c8c78d80d1ab490f0dee2a42`.

## Reproduced behavior and bounded repair

The managed-number handler already reads modern invoice parent metadata, but
its subscription extractor accepts only a string at that location. An expanded
`parent.subscription_details.subscription` object therefore reaches the
unmatched-invoice/failure result without retrieving the bound subscription.
The stored quantity/grace projection remains unchanged. This source evidence
does not establish which payload version a production endpoint receives.

Only `callcommand-number-billing.ts` changes: invoice references now pass once
through the existing `stripeInvoiceSubscriptionId` normalizer. Both string and
expanded modern references work. Conflicting valid legacy and discriminated
modern IDs return null and reach the existing unmatched path; no later fallback
can revive them. Subscription lifecycle and checkout extraction are unchanged.

Historical direct `subscription_details.subscription` and undiscriminated
`parent.subscription_details.subscription` forms remain explicit legacy
fallbacks, before normalization. The latter is already used by the existing
guided-setup SQL regression. This compatibility exception belongs to this
handler; the shared normalizer's strict discriminator contract is unchanged.
An explicitly unrelated parent discriminator does not provide an invoice ID.

There are no changes to feature classification, tenant/customer/subscription
binding, transaction/advisory lock, event ordering, quantity limits, current
provider invoice checks, pending-upgrade checks, grace duration or expiry,
channel release/provisioning, checkout, pricing, signature/receipt processing,
schema, environment, or provider configuration.

## Evidence and verification

The new `callcommand-number-invoice-subscription.test.ts` extracts the actual
handler/helper declarations from source, transpiles them with existing
TypeScript and runs them with native test/VM APIs. Drizzle renders the actual
SQL; execution and provider retrieval are synthetic and separately recorded.
No database module/environment initialization or provider network occurs.

The immutable baseline runner reads the exact base Git blob
`52d5c15e0212835e44b907b274fd18d2731ca0db`. It runs the final same test source,
changing only its source-loader URL to the frozen baseline file. Result:
**62 tests, 32 passed, 30 failed, 0 skipped**. The modern expanded reference
fails in all three invoice event types; legacy/string controls pass. Other
failures cover conflicting references and guards that cannot reach their
provider phase until expanded-reference extraction succeeds. They are not
30 independent product defects.

On the candidate, all **62** new controls pass. These cover legacy IDs/expanded
top-level objects, direct details, undiscriminated parent strings/expanded objects, modern
strings/expanded objects, matching and conflicting dual references, invalid
references/discriminators, parent-only metadata, current local binding,
duplicate/older events, provider latest-paid invoice/tenant/customer/feature,
pending upgrades, provider failure, authoritative quantities, invalid quantity,
grace preservation, stale-write channel suppression and lifecycle controls.

| Completed local check | Result |
| --- | --- |
| New handler test + existing invoice-normalizer/dispatcher and binding tests | 183 passed; 0 failed, skipped, cancelled or todo |
| Strict NodeNext TypeScript check of the new test | Passed |
| Root `pnpm lint` | Passed, zero warnings |
| Root `pnpm typecheck` | Passed, all four selected workspaces |
| `pnpm --dir apps/api build` | Passed, including SDK compilation |

Commands, with the existing pinned pnpm shim/Node on PATH:

```powershell
node --import tsx --test apps/api/test/callcommand-number-invoice-subscription.test.ts apps/api/test/billing-invoice-subscription.test.ts apps/api/test/billing-webhook-binding.test.ts
node node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --esModuleInterop --skipLibCheck apps/api/test/callcommand-number-invoice-subscription.test.ts
pnpm lint
pnpm typecheck
pnpm --dir apps/api build
```

Existing dependency directories are reused through task-owned junctions; no
dependency acquisition or host install occurred. Detailed logs and immutable
baseline/source receipts are in the task evidence directory
`evidence/OperatorOS/next-pass/callcommand-invoice/`.

These source-body tests prove reference/control-flow behavior and rendered
query parameters. They do not prove real SQL execution, provider/HTTP/signature
acceptance, transaction rollback or deployed paid-number functionality.
Existing guarded PostgreSQL guided-setup/managed-number tests and the full
combined-head hosted release gate remain required; no disposable local
PostgreSQL fixture was confirmed. Independent review read the three changed
paths and surrounding binding/provider/SQL controls, independently repeated all
183 selected tests at the frozen source/test hashes, and approved this bounded
source change. Combined exact-head CI and deployed acceptance remain open.

## Lane compatibility deferred

`callcommand-lane-billing.ts` was examined but is unchanged. Its metadata scan
omits modern parent metadata. Simply adding that location would widen a paid
settlement branch that updates by tenant metadata and event time, can fall back
to metadata quantity, and does not first apply the managed-number handler's
stored binding/provider-current-invoice checks. The shared normalizer may also
return null on conflict, while that branch can still issue its update with a
null subscription ID. A separate authority repair needs positive legacy and
provider/binding regression evidence before broader payload support is safe.
This pass does not claim lane billing is repaired or accepted for launch.

Examined paths include both CallCommand billing files' metadata/extraction and
webhook settlement flows and checkout guard entries; `stripe-invoice-subscription.ts`;
the live and saved-event feature dispatch sections of `billing-routes.ts` and
`billing-service.ts`; the lane-settlement, guided-setup and shared invoice/binding
regressions; and current repository/release/tenant/database instructions.

No feature/provider was enabled, no calls/numbers were bought or released, and
no payment, live event replay, production database or publication action was
performed. This is source compatibility work; production acceptance remains a
separate owner gate.
