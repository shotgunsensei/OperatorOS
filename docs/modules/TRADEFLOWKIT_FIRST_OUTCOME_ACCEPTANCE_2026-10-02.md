# TradeFlowKit first-outcome browser acceptance

Date: 2026-10-02 UTC. Status: **LOCAL ACCEPTANCE PASSED / RELEASE AND LIVE PAID ACCEPTANCE OPEN**.

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

This change adds two browser scenarios and includes their file in the existing
required release runner. Application code, database schema, provider settings,
billing prices/trials, lockfile, audit policy and parity capability counts are
unchanged. It also corrects the stale AGENTS assertion that root lint is absent;
the existing lint command and zero-warning gate were verified.

## Observed customer outcome

At both **1440px and 390px**, isolated Chromium completes the visible workflow:

1. Enter the module through its canonical auth/deep-link handoff and verify
   its independent Secure/HttpOnly/SameSite=Lax host-only session.
2. Save a customer, create a $250 quote through the real UI, record its sent
   and accepted statuses, and create the linked job from that accepted quote.
   The status dialogs explicitly distinguish internal records from delivery or
   independently proven customer acceptance.
3. Convert the accepted quote to an invoice, preserving customer/job/quote
   linkage and exact cents; record its sent status and an off-platform payment
   reference. No Stripe payment link or provider is called.
4. Reload the exact invoice URL; confirm Paid, zero balance and the stored
   reference, with no further Record payment control or horizontal overflow.
5. Sign in independently as a read-only teammate to the same private deep
   link; verify the shared record after reload, absent write controls and a
   direct attempted write rejected by the server with HTTP 403.
6. Independently query PostgreSQL: the linked invoice and job are paid, cents
   are exact, the reference is unchanged and exactly one first-class payment
   exists with no provider. The denied request adds no payment record.

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
| `pnpm lint` | PASS, zero warnings; repeated after the test correction |
| `pnpm typecheck` | PASS, all four workspaces after the test correction |
| `pnpm build:production` | PASS, including four typechecks and Next 38/38 |
| Root `pnpm db:apply`, isolated apply mode | PASS, v65/65 verified |
| From `apps/web`: `node node_modules/@playwright/test/cli.js test --retries=0 e2e/tradeflowkit-first-outcome.spec.ts` | 2/2 PASS, 30.1 seconds, zero skips/retries |
| `node scripts/parity/run-browser-tests.mjs --suite all` | 37/37 browser + 4/4 visual PASS, 11m31s total, zero failures/skips/retries/snapshot updates |

Initial local setup used a noncanonical internal URL and the library file
instead of the supported `db:apply` CLI; startup refused before browser cases
ran. The harness was corrected without changing application validators. The
first executed focused run reached paid/reloaded invoices in both cases but
failed its new console assertion on the login page's anonymous 401 probe.
Runtime timestamps confirmed the probe preceded canonical login. The assertion
was scoped to authenticated workflow; both focused cases and the full required
browser/visual suite then passed. These were harness/test corrections, not
product fixes or changes to the existing route crawler's error assertions.

Ignored evidence is retained in `test-results/workflow-acceptance/`: logs,
required-browser result, archived initial failure traces and generated browser
artifacts. The owned runtime/proxy/runner and disposable database were stopped;
unrelated services and shared Chrome were not disturbed.

## Release status and remaining owner acceptance

PR #111's final documentation head completed its
[exact-head release CI](https://github.com/shotgunsensei/OperatorOS/actions/runs/37026601653)
at **13/14**, with only unpatched node-forge advisory 1240912 blocking.
Its [vector CI](https://github.com/shotgunsensei/OperatorOS/actions/runs/37026602290)
and all three [native jobs](https://github.com/shotgunsensei/OperatorOS/actions/runs/37026601522)
pass. The 1,598 API/108 integration/52 unit baseline is earlier exact-head
evidence, not a new full API run for this test-only slice. The unchanged failing
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
or deployment occurred. Rollback is removal of the added test/inventory entry;
there is no application or database migration to undo.
