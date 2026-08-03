# Phase 20 public-launch functional closure

## Declaration

SOURCE/LOCAL PUBLIC-LAUNCH FUNCTIONAL CLOSURE: HOLD

This is a source/local hold. No public deployment, production database, DNS,
Replit deployment, provider account, or real payment path was touched.

## Executive result

The phase established an executable root capability matrix and corrected the
initial platform, TradeFlowKit, and TorqueShed defects. The resumed bounded
acceptance loop then exposed two additional customer-shell contracts in
TechDeck and PulseDesk. The second valid continuation aggregate remains red,
so later gates were not run and no completion claim is allowed.

Root capability counts at HOLD:

| Status | Count |
| --- | ---: |
| ACTIVE_AND_PROVEN | 18 |
| SHARED_OPERATOROS_REPLACEMENT | 241 source-ledger entries |
| APPROVED_SECURITY_RETIREMENT | 144 source-ledger entries |
| APPROVED_PRODUCT_BOUNDARY | 256 source-ledger entries plus 221 placeholder-audit classifications |
| HUMAN_PHASE18 | 10 |
| FIX_NOW | 2 |
| UNCLASSIFIED | 0 |

The mature source-ledger counts above are TradeFlowKit, TechDeck, and PulseDesk
aggregates. Their executable verifiers remain green with zero restoration gaps.

## Functional corrections completed

- Customer acquisition: registration now commits account, personal
  organization, owner membership, current selection, and free-account grants
  in one transaction. A provisioning failure no longer leaves a successful
  orphan account.
- Organization recovery: `POST /v1/me/tenant/ensure` provides an authenticated,
  rate-limited, idempotent, audited, server-derived repair path. The client no
  longer sends a user with no organization to an external contact page.
- Provider-disabled behavior: `/v1/publish/explain` now returns a recoverable
  `503 AI_PROVIDER_DISABLED` response instead of presenting missing provider
  configuration as HTTP 501 unfinished functionality.
- Module navigation: TradeFlowKit again exposes a canonical Return to My Apps
  action and a deliberate empty organization state.
- Module-shell truth: the unused MVP/not-implemented banner was removed and a
  missing canonical launch URL now reads Launch unavailable instead of
  advertising an active module as coming soon.
- TorqueShed privacy and billing truth: the garage now states that VINs are
  protected and shown only as a masked suffix, and Torque Assist labels its
  displayed credits as a ledger-computed balance. The combined focused
  contracts pass 7/7.

## Executable inventory

`corepack pnpm verify:public-launch` verifies the root matrix, the active
catalog, exact source artifacts, placeholder classifications, and all three
mature source ledgers. The refreshed inventory proves:

- 13 active catalog modules;
- 30 platform/module/human capabilities;
- 827 API route declarations;
- 23 web routes;
- 133 database objects;
- 3 discovered background-job enqueue declarations;
- 141 provider/configuration variables;
- 16 billing products;
- 1,162 exact placeholder/dead-control occurrences;
- zero unclassified occurrences.

The matrix deliberately reports two `FIX_NOW` items, so the verification
command fails until the TechDeck and PulseDesk shell contracts are corrected.

## Commerce boundaries

| Purchase type | Authority | Settlement/effect | Cancellation/refund boundary | Current Phase 20 result |
| --- | --- | --- | --- | --- |
| Account Starter/Pro/Elite plan | OperatorOS Stripe account and catalog env keys | Signed, idempotent OperatorOS webhook changes account-plan entitlement | Existing plan reduction, cancel/reactivate, portal, history, duplicate and out-of-order tests | Source tests present; final aggregate blocked |
| Organization add-on | OperatorOS Stripe account and module catalog add-on keys | Signed metadata-bound webhook changes tenant add-on entitlement | Tenant owner/admin cancellation and DLQ/replay contracts | Source tests present; final aggregate blocked |
| TradeFlowKit invoice payment | Tenant business Stripe Connect account | Signed Connect webhook settles tenant invoice/payment records only | Business refund/cancellation remains provider/business boundary, never platform entitlement | Source tests present; final aggregate blocked |
| TorqueShed Torque Assist credits | OperatorOS purchase-intent/credit boundary | Signed webhook appends exactly one credit; assist appends bounded debit | Duplicate/mode mismatch fail closed; refunds require the documented ledger/provider path | Source tests present; final aggregate blocked |

No successful redirect grants entitlement, payment credit, or invoice
settlement in any boundary.

## Verification evidence

Final passing runs:

- `corepack pnpm typecheck` - API, runner-gateway, and web pass.
- `corepack pnpm db:plan` - v33, 33 ordered non-destructive steps.
- `corepack pnpm db:apply` on fresh PostgreSQL 16 - pass.
- idempotent `corepack pnpm db:apply` reapply - pass.
- focused auth/tenant database tests - 12/12 pass.
- focused customer/free-account/TradeFlowKit static tests - 18/18 pass in the
  final focused rerun.
- focused TradeFlowKit source contract after correction - 5/5 pass.
- combined TorqueShed foundation and Torque Assist static contracts after
  correction - 7/7 pass.
- three module source-ledger verifiers - zero gaps/unclassified.
- `git diff --check` - pass at the final HOLD checkpoint.

Rejected or failing evidence:

- The first aggregate used the release-applied database and was rejected as an
  invalid harness run because canonical seeded module rows collided with
  test-owned fixtures.
- Clean aggregate round 1 failed the TradeFlowKit return/empty-state contract;
  the product was corrected and the focused test is green.
- Clean aggregate round 2 failed the TorqueShed VIN privacy contract. The
  resumed first valid aggregate exposed the adjacent Torque Assist balance
  label contract; both are now green in the 7/7 focused run.
- The second valid continuation aggregate on fresh
  `operatoros_phase20_api4` remains red. Focused confirmation passes 9 and
  fails 2: PulseDesk lacks `pulsedesk-empty-state`, and TechDeck lacks
  `techdeck-return-command-center`. These are the current blockers.

Not run because the authoritative API aggregate remains red:

- backup/restore/reconciliation;
- production build and compiled runtime health/readiness;
- all thirteen independent Chromium module workflows;
- route/control sweep, screenshots, accessibility, and load/reliability final
  acceptance.

## Exact continuation

The machine-readable continuation is `docs/PHASE20_CONTINUATION.json`.
Source/local work remains. The Phase 18 human guide must not be started yet.
