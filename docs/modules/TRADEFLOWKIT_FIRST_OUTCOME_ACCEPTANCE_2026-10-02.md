# TradeFlowKit first-outcome browser acceptance

Date: 2026-10-02 UTC. Status: **PAYMENT CANCEL FIX AND LOCAL ACCEPTANCE PASSED / RELEASE AND LIVE PAID ACCEPTANCE OPEN**.

## Selected phase and source boundary

Continue the existing TradeFlowKit first-customer phase rather than introducing
a module or requiring the unpublished AI enhancements. The required browser
suite previously covered TradeFlowKit routes, visuals and public invoice
presentation, but did not complete its first customer revenue workflow.

Isolated branch `codex/tradeflowkit-workflow-acceptance` is based on PR #111 head
`7a3a92703740491cb7dbb0d09fb5ab1a3054a340`. Canonical `C:\Dev\OperatorOS` remains
on `codex/openai-module-enablement` at `797ffffd`; its unrelated presentations
and all other worktrees are preserved. That AI candidate's 27 provider/62
focused checks are documented prior evidence, not rerun or combined here.
TechDeck Phase 5 is already published on v65; provider activation and its later
real-model/grounded-research acceptance remain separate work.

The workflow review reproduced a payment-recording bug at both viewport widths:
dismissing the optional reference prompt still posted `/invoices/:id/pay`,
returned HTTP 200 and persisted a paid $250 invoice with one payment. The prompt
handler now returns on Cancel. Approving an empty reference retains the existing
optional-reference behavior. This records an off-platform payment; it does not
charge a card or contact a payment provider.

This change adds two browser scenarios and includes their file in the existing
required release runner. Database schema, provider settings, billing prices/trials,
lockfile, audit policy and parity capability counts are unchanged. It also
corrects the stale AGENTS assertion that root lint is absent; the existing lint
command and zero-warning gate were verified.

## Observed customer outcome

At both **1440px and 390px**, isolated Chromium completes the visible workflow:

1. Enter the module through its canonical auth/deep-link handoff and verify
   its independent Secure/HttpOnly/SameSite=Lax host-only session.
2. Save a customer, create a $250 quote through the real UI, record its sent
   and accepted statuses, and create the linked job from that accepted quote.
   The status dialogs explicitly distinguish internal records from delivery or
   independently proven customer acceptance.
3. Convert the accepted quote to an invoice, preserving customer/job/quote
   linkage and exact cents; record its sent status. Cancel Record payment and
   verify no payment write occurs and the invoice stays sent/unpaid in PostgreSQL.
   Then approve an off-platform payment with a reference on desktop and a blank
   optional reference on mobile. No Stripe payment link or provider is called.
4. Reload the exact invoice URL; confirm Paid, zero balance and the stored
   reference when supplied, with no further Record payment control or horizontal
   overflow.
5. Sign in independently as a read-only teammate to the same private deep
   link; verify the shared record after reload, absent write controls and a
   direct attempted write rejected by the server with HTTP 403.
6. Independently query PostgreSQL: the linked invoice and job are paid, cents
   are exact, the reference matches the supplied value or null and exactly one
   first-class payment exists with no provider. Cancellation and the denied
   request add no payment record.

Existing disposable parity fixtures pregrant legacy access and explicitly seed
the teammate membership/viewer grant. They do not prove a new subscription
purchase, live settlement, email delivery or production access configuration.
No business record is seeded directly; workflow writes go through the UI/API.
Login's initial anonymous `/auth/me` probe is expected to return 401. Page-error
checks cover the whole scenario; console checks cover the settled authenticated
workflow before the intentional HTTP 403 authorization probe.

## Fresh verification

Windows/Node 24.16.0, pinned pnpm 10.34.5, frozen offline dependencies, fresh
temporary loopback PostgreSQL 16 at port 55484, v65/65 verified. External provider
credentials and activation flags are stripped. Browser canonical hosts map to
loopback with the existing TLS proxy; this is not the owner's Chrome session.

| Command / check | Result |
| --- | --- |
| `pnpm lint` | PASS after the application fix, zero warnings, 23.2 seconds |
| `pnpm typecheck` (within `build:production`) | PASS after the application fix, all four workspaces |
| `pnpm build:production` | PASS after the application fix, including four typechecks and Next 38/38, 72.0 seconds |
| Root `pnpm db:apply`, isolated apply mode | PASS, v65/65 verified |
| From `apps/web`: `node node_modules/@playwright/test/cli.js test --retries=0 e2e/tradeflowkit-first-outcome.spec.ts` | 2/2 PASS after the fix, 26.4 seconds, zero skips/retries; cancellation and approved blank/reference behavior covered |
| `node scripts/parity/run-browser-tests.mjs --suite all` | After fix: 37/37 browser + 4/4 visual PASS, 10m17s total, zero failures/skips/retries/snapshot updates |

Before the application fix, both new cancellation assertions failed because a
payment write occurred. Independent database reads confirmed both canceled
invoices were paid, each with exactly one $250 payment. Reproduction logs and
traces are archived separately from the corrected run. Existing route-crawler
assertions and production environment validators remain intact.

Ignored evidence is retained in `test-results/workflow-acceptance/`: logs,
`required-browser-cancel-result.json` (exit 0, 617,540ms), verified source hashes,
archived cancellation failure traces, earlier run evidence and generated browser
artifacts. Local tests exercised the application/test working-tree content before
the final evidence commit; exact-head GitHub CI remains separate evidence.
Generated tracked screenshots were archived and restored without changing
snapshot baselines. The owned runtime/proxy/runner and disposable database were stopped;
unrelated services and shared Chrome were not disturbed.

## Read-only deployed pricing check

At 16:52 UTC, a fresh unauthenticated Chromium context opened the public
[pricing page](https://operatoros.net/pricing). TradeFlowKit rendered
**$149/month** and selecting its local Stack option rendered **$149/month** as
the total, with zero `Price unavailable` labels after hydration. Five included
seats, one included companion, $29 additional companions and $15 additional
seats were visible. The deployed unauthenticated control reads `Sign In to
Continue`; no direct `/register` links were present on that page. PR #111's
signup handoff remains an unpublished change.

All non-GET/HEAD browser requests were blocked; none were attempted. No checkout
control was clicked. This was not the owner's Chrome, and its temporary browser
was closed. Public runtime price rendering is verified; actual Stripe Price
account/mode, checkout configuration and signed settlement are not. JSON and a
full-page screenshot are retained in workspace `output/`.

## Release status and remaining owner acceptance

PR #111's final documentation head completed its
[exact-head release CI](https://github.com/shotgunsensei/OperatorOS/actions/runs/37026601653)
at **13/14**, with only unpatched node-forge advisory 1240912 blocking.
Its [vector CI](https://github.com/shotgunsensei/OperatorOS/actions/runs/37026602290)
and all three [native jobs](https://github.com/shotgunsensei/OperatorOS/actions/runs/37026601522)
pass. PR #112's initial test-only head `7901890c` also completed its
[full exact-head release CI](https://github.com/shotgunsensei/OperatorOS/actions/runs/37033272116)
at **13/14**: 1,598 API, 108 integration, 52 unit, 37 browser and four visual
checks pass, with only the same advisory failing. This predates the prompt fix
and is not CI validation of it. Those API counts are earlier exact-head evidence,
not a new local full API run for the client-handler slice. The unchanged failing
whole-workspace audit was not repeatedly rerun locally; the affected required
browser/visual suite was run completely. Fresh branch CI is separate evidence.

Merge/publication remains blocked until the required security gate passes.
No audit waiver or used native-tooling removal is included. See the
[release continuation and supported options](../REVENUE_RELEASE_CONTINUATION_2026-10-02.md).

The first offering remains the existing **$149/month TradeFlowKit guided pilot**,
five seats and one eligible companion. Local workflow acceptance does not close
authenticated Stripe Price/account verification, actual subscription settlement
and entitlements, deployed second-user/role/logout checks, delivery or recovery
rehearsal. Merchant Stripe Connect is distinct from OperatorOS subscriptions.
No purchase, new terms, production customer write, secret/access change, merge
or deployment occurred. Rollback is reverting the prompt guard and added
test/inventory entry; there is no database migration to undo.
