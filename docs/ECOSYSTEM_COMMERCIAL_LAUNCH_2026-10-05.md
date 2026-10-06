# Ecosystem commercial launch acceptance - 2026-10-05

October 6 continuation: authenticated live Stripe setup and production credit
catalog binding are now verified in
[the current configuration record](ECOSYSTEM_STRIPE_CONFIGURATION_2026-10-06.md).
Historical unavailable-access/no-provider-mutation statements in this dated
record describe October 5. Release publication and full paid-tenant/module
acceptance remain open.

Status: **SOURCE CANDIDATE / LOCAL SCOPES PASSED / LIVE COMMERCIAL ACCEPTANCE OPEN**.

Candidate branch: `codex/ecosystem-commercial-launch`, based on
`62fb640c64bd5477a8e5752301c17cb108ab6d2e`. No push, publication, production
database mutation, real payment, number purchase or outbound message has been
performed for this candidate. Database release remains v65/65.

## Current published evidence

Read-only public inspection on October 5 confirms:

- `https://operatoros.net/readyz`: HTTP 200, ready, serving commit
  `62fb640c64bd5477a8e5752301c17cb108ab6d2e`, build
  `dbca1e6f06bbb7aa9bb2de15`, built `2026-10-02T20:21:26.699Z`, deployed
  `2026-10-04T17:43:38.847Z`, database v65/65 ending in
  `techdeck_resolution_semantic_tables`.
- `https://operatoros.net/api/billing/catalog`: the three flagship prices,
  companion and seat prices below match source. All five primary price
  configuration flags are true. A present configuration flag does not validate
  the actual Stripe Price, Product, account, webhook or successful settlement.
- Public runtime verifier: **47 passed, zero failed** against that exact
  published commit. This covers public routing, release identity, health and
  callback reachability. It does not prove authenticated writes or payments.
- The Replit connector independently reports the canonical OperatorOS
  deployment as published/success at `https://operatoros.net`; deployment ID
  `0a34bd3d-5706-434d-87ee-fffd3bf6e5cd`. No publication was triggered here.
- Exact deployed-commit GitHub release run
  [37059840248](https://github.com/shotgunsensei/OperatorOS/actions/runs/37059840248)
  failed dependency hardening. The candidate repairs those findings locally;
  fresh candidate CI remains required. Separate deployed-commit vector run
  [37059840247](https://github.com/shotgunsensei/OperatorOS/actions/runs/37059840247)
  passed.

## Every forward-sales price and payment path

OperatorOS account creation and the three free companions do not need paid
Stripe Prices. One flagship subscription includes five seats and one eligible
paid companion. Additional eligible companions share the $29 monthly Price;
selection and quantity stay in the trusted tenant subscription stack. These are
monthly USD products; no annual product or revived legacy tier is introduced.

| Item | Published/default price | Provider binding | Authenticated payment path |
| --- | --- | --- | --- |
| TradeFlowKit | $149/month | `STRIPE_PRICE_TRADEFLOWKIT_MONTHLY` | `POST /v1/billing/stack/checkout` |
| PulseDesk | $149/month | `STRIPE_PRICE_PULSEDESK_MONTHLY` | `POST /v1/billing/stack/checkout` |
| TechDeck | $99/month | `STRIPE_PRICE_TECHDECK_MONTHLY` | `POST /v1/billing/stack/checkout` |
| Additional eligible companion | $29/month each | `STRIPE_PRICE_COMPANION_MODULE_MONTHLY` | `POST /v1/billing/stack/checkout` |
| Additional team seat | $15/month each | `STRIPE_PRICE_ADDITIONAL_SEAT_MONTHLY` | `POST /v1/billing/stack/checkout` |
| CallCommand additional concurrent lane | $49/month each | `STRIPE_PRICE_CALLCOMMAND_CONCURRENT_LANE_MONTHLY` | `POST /v1/modules/callcommand-ai/product/commercial/lane-checkout` |
| CallCommand additional local number | $5/month each | `STRIPE_PRICE_CALLCOMMAND_ADDITIONAL_LOCAL_NUMBER_MONTHLY` | `POST /v1/modules/callcommand-ai/product/commercial/numbers/billing` |
| CallCommand toll-free number | $8/month each | `STRIPE_PRICE_CALLCOMMAND_TOLL_FREE_NUMBER_MONTHLY` | `POST /v1/modules/callcommand-ai/product/commercial/numbers/billing` |
| Torque Assist Roadside, 25,000 credits | $5 once | `operatoros_torqueshed_roadside_25000_v1` lookup + durable catalog mapping | `POST /v1/modules/torqueshed/token-purchases/checkout` |
| Torque Assist Workshop, 100,000 credits | $15 once | `operatoros_torqueshed_workshop_100000_v1` lookup + durable catalog mapping | `POST /v1/modules/torqueshed/token-purchases/checkout` |
| Torque Assist Fleet, 500,000 credits | $50 once | `operatoros_torqueshed_fleet_500000_v1` lookup + durable catalog mapping | `POST /v1/modules/torqueshed/token-purchases/checkout` |

CallCommand amounts retain existing bounded deployment overrides:
`CALLCOMMAND_LANE_PRICE_CENTS`, `CALLCOMMAND_LOCAL_NUMBER_PRICE_CENTS` and
`CALLCOMMAND_TOLL_FREE_NUMBER_PRICE_CENTS`. Provider inspection uses the
configured amount. One base lane and the first active local number remain
included; usage and carrier/provider charges remain separate from licensed
capacity. A number is not purchased merely because Checkout was opened.

The API paths above are canonical backend paths. Browser same-origin `/api/*`
proxy requests omit the `/v1` segment. The single signed settlement endpoint
remains `https://api.operatoros.net/v1/billing/webhook`.

## Module activation truth

| Modules | Current commercial/launch state | Required target acceptance |
| --- | --- | --- |
| TradeFlowKit, PulseDesk, TechDeck | Three paid flagship products; registered runtime enabled | New tenant checkout, signed settlement, role/tenant isolation, persistent core workflow, deep link, return and logout |
| TorqueShed, FaultlineLab, Operator Pool Hall | Free companions; registered runtime enabled | New tenant SSO and persistent workflows; Torque Assist additionally needs its separate credit/AI gate |
| SnapProofOS, BrandForgeOS, StudyForge AI, Deploy Ops, CallCommand AI, Script Ops | Six eligible paid companions; registered runtime enabled | Included/paid selection, entitlement settlement, tenant writes and each relevant provider workflow |
| OutCall | Globally `coming_soon`; launch and sales remain disabled | Explicit commercial/activation policy, verified Twilio configuration, consent/verification, real controlled call and target acceptance before activation |

OutCall's owner-authorized reconstruction supersedes its historical missing
source blocker for source/local parity. That reconstruction does not establish
provider or public activation acceptance. See
[OutCall's current parity record](modules/outcall/PARITY_MATRIX.md).

## Candidate changes

- A shared commercial manifest enumerates all eight recurring and three
  one-time forward-sales SKUs without creating new pricing policy.
- All recurring purchase flows validate exact Price ID, active state, mode,
  currency, monthly licensed cadence, amount and untransformed per-unit
  quantity. Pending stack Checkout resumes revalidate current bindings before
  returning a saved payment link. CallCommand lane validation happens before
  any customer, Checkout or subscription mutation.
- A read-only provider audit validates the expected Stripe account, all eleven
  Prices and active Products, account payment/payout readiness in live mode,
  restrictive Billing Portal and the exact enabled canonical webhook with all
  required settlement/refund/dispute events. It prints no secrets or customer
  data and never creates or changes Stripe resources.
- TorqueShed catalog provisioning checks the expected account before any
  creation or persistence. Live CLI operation requires the expected account.
- Stripe setup now covers the full catalog/event set and correctly states that
  test mode supports real sandbox Checkout/webhooks. The older example comments
  incorrectly described test mode as disabling all provider calls.
- Dependency upgrades and installed-package patches repair the deployed CI
  hardening failure. Four high advisories remain disclosed with reviewed
  local-patch exceptions; the scanner has zero unresolved advisories and zero
  critical advisories. Do not describe the raw advisory count as zero.

## Local verification

Environment: Windows, Node 24.16.0, pinned pnpm 10.34.5, PostgreSQL 16 Alpine in
an isolated loopback Docker container. Test commands remove provider credentials
and use synthetic non-production session/SSO keys. No test uses either Replit
database. The release suite may reset only this disposable database.

| Check | Result |
| --- | --- |
| `CI=true corepack pnpm install --frozen-lockfile` | PASS |
| Root `db:apply` with temporary `OPERATOROS_DATABASE_RELEASE_MODE=apply` on disposable PostgreSQL | PASS, v65/65 |
| Five focused billing/catalog/settlement suites | 48 passed, 0 failed, 0 skipped, 0 todo; 35,077.9861 ms |
| Installed braces/forge exploit regression fixtures | 2 passed, 0 failed, 0 skipped |
| `node scripts/phase39/security-scan.mjs` | PASS; 0 findings, 0 unresolved advisories, 4 disclosed high exceptions, 0 critical |
| `corepack pnpm stripe:plan:ecosystem` | PASS, 8 recurring + 3 one-time products |
| First complete API stage | 1,604 passed, 1 failed, 0 skipped; sole failure was a static assertion referencing the validator's previous location |
| Corrected `forward-commerce-contract-static.test.ts` | 8 passed, 0 failed/skipped; assertions follow shared validator and billing-service delegation |
| Fresh root `corepack pnpm lint` after correction | PASS |
| First `corepack pnpm verify:release` | 13/14 stages passed; only API failed on the corrected static-location assertion; original failure evidence retained |
| Fresh `corepack pnpm test:api` after correction | PASS, 1,605 passed, 0 failed/cancelled/skipped/todo; 857,190.41 ms |
| Unit / integration / production build / core preflight | 52 unit and 108 integration passed, 0 failed/skipped; production build and core preflight PASS |
| Compiled exact-host browser and visual suites | 32 browser + 4 visual passed, 0 failed/skipped, no browser retry reported; 608,028 ms combined runtime/browser stage |
| Published exact-commit runtime verifier | 47 passed, 0 failed; published build only |
| Live `stripe:verify:ecosystem`, hosted payment, authenticated target tenant/provider workflows | NOT RUN: authenticated provider/application access unavailable |

All fourteen local scopes have passing current evidence across the complete
first release run and the corrected full API rerun. The original root command's
13/14 failure artifact is preserved; it is not described as a clean 14/14
invocation. Fresh exact-commit GitHub CI remains required before publication.

Focused command from the root with the isolated test environment:

```powershell
corepack pnpm --dir apps/api exec tsx --test --test-concurrency=1 test/ecosystem-stripe-audit.test.ts test/commerce-forward-model-db.test.ts test/callcommand-lane-settlement-db.test.ts test/callcommand-guided-setup.test.ts test/torqueshed-stripe-catalog.test.ts
```

Ignored local evidence: `build/launch/billing-focused-final.log`,
`build/launch/full-release.log`, `build/launch/api-final.log`,
`build/launch/initial-api-test-summary.json`,
`build/launch/initial-release-gate-results.json`,
`build/launch/live-runtime-verification.log`,
`build/phase39/security-scan.json` and `build/parity/release-gate-results.json`.
Do not commit the ignored disposable database password/environment helper.

## Complete the remaining launch acceptance

1. In a trusted server environment, configure the existing Stripe secret,
   mode, expected account, eight recurring Price IDs, restrictive portal ID and
   canonical endpoint signing secret. Enter credentials through the provider's
   secret controls, never chat, source files or command history.
2. Run `corepack pnpm stripe:plan:ecosystem`, then
   `corepack pnpm stripe:verify:ecosystem`. Validation is read-only. A green
   report establishes provider configuration only. Provision/persist the three
   TorqueShed catalog mappings through the existing approved catalog workflow
   and satisfy its exact-release activation contract before enabling purchase.
3. Use a separate staging runtime and disposable database with Stripe sandbox
   credentials. Exercise actual hosted Checkout with a new test tenant: each
   flagship, included and extra companions, extra seats, each
   CallCommand capacity item, each Torque credit pack. Confirm signed payment
   settlement, entitlement/capacity/credit activation, duplicate delivery,
   failed payment, refund and cancellation using the trusted tenant. Never
   grant access from a success URL alone.
4. Complete target SSO and persistent workflow acceptance for all thirteen
   modules, including owner/non-owner and foreign-tenant negative checks,
   return navigation, deep links, mobile and logout. Provider-dependent
   surfaces require real provider acceptance: OpenAI generation/realtime,
   Twilio call/recording/transfer/number lifecycle, email/invites, Script Ops
   runner, Deploy Ops adviser and TradeFlowKit Connect if sold.
5. Review the candidate, run fresh exact-commit CI, authorize push/publication,
   inspect Replit secret precedence, preserve backup/verify-only serving
   startup, publish and prove serving source/build/database identity. No new
   database release is introduced here.
6. Perform a specifically authorized low-value live payment and refund, then
   verify access reconciliation, receipt, ledger and payout readiness. Open
   OutCall only after its provider, commercial and target acceptance passes.

Those actions are separate evidence scopes. The current public readiness
response and local fixtures cannot substitute for them. Application/Stripe
browser sign-in was requested during this work; no credential, MFA code or
private payment information is needed in chat.

## Rollback

Revert this focused candidate and restore its matching lockfile together. No
schema/data rollback is necessary. Keep existing payment/activation gates
closed until actual acceptance; do not restore an unverified Price or weaken
settlement authority to make a checkout work. Preserve signed event, audit and
credit history. Existing deployed subscriptions are not migrated or repriced
by this candidate.

## Changed-file inventory

| Scope | Files |
| --- | --- |
| Shared commercial catalog | `packages/sdk/src/commercial-prices.ts`, `packages/sdk/src/index.ts`, `apps/api/src/lib/torqueshed-credit-catalog.ts` |
| Purchase and resume validation | `apps/api/src/lib/stripe-price-contract.ts`, `apps/api/src/lib/billing-service.ts`, `apps/api/src/lib/callcommand-lane-billing.ts`, `apps/api/src/lib/callcommand-number-billing.ts` |
| Read-only ecosystem audit | `apps/api/src/lib/ecosystem-stripe-audit.ts`, `apps/api/src/scripts/ecosystem-stripe-audit.ts`, `package.json` |
| Account-bound TorqueShed provisioner | `apps/api/src/lib/torqueshed-stripe-catalog-provisioner.ts`, `apps/api/src/scripts/torqueshed-stripe-catalog.ts` |
| Billing/catalog regression tests | `apps/api/test/ecosystem-stripe-audit.test.ts`, `apps/api/test/commerce-forward-model-db.test.ts`, `apps/api/test/callcommand-lane-settlement-db.test.ts`, `apps/api/test/callcommand-guided-setup.test.ts`, `apps/api/test/torqueshed-stripe-catalog.test.ts`, `apps/api/test/forward-commerce-contract-static.test.ts` |
| Dependency remediation | `.gitattributes`, `apps/api/package.json`, `apps/runner-gateway/package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `patches/node-forge@1.4.0.patch`, `patches/braces@3.0.3.patch`, `scripts/phase39/security-scan.mjs`, `scripts/phase39/launch-dependency-regression.test.mjs`, `docs/phase-39/OPERATOROS-SBOM.cdx.json` |
| Setup and evidence | `.env.example`, `README.md`, `docs/stripe-setup.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/modules/MODULE_PARITY_INDEX.md`, `docs/CURRENT_RELEASE_GATE.md`, this record |

Unrelated untracked sales presentations are preserved. Browser-generated
investigation captures are verification outputs and are excluded from the
source candidate. Disposable environment helpers and logs remain ignored.

The two new pnpm patch files retain generated unified-diff context markers;
`.gitattributes` preserves LF bytes and handles those format-required spaces.
The staged diff check passes with that file-specific policy. After verification,
the owned disposable container/volume and synthetic database password file were
removed; no persistent database was changed.
