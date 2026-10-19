# Billing reads must distinguish unavailable from free

Base: `2db76299da96cdae82ddd0f596c16c1c81f73c57`, source tree
`b5acd3c98c451be322a2784484696bfbe08389fc`. This isolated change is limited
to the two billing views, their focused browser regressions/configuration, and
inclusion of those regressions in the existing release browser runner.

## Reproduced customer failure

Both views caught an unsuccessful Application Stack read and replaced it with
`null`. When tenant identity and other reads succeeded, a subscription outage
therefore rendered a free-account/no-paid-subscription claim and offered the
owner a new checkout. The absence of a successful subscription read does not
establish that there is no contract.

Before any component edit, actual React components from the immutable base
were bundled with existing esbuild and mounted in an isolated Chromium page.
Twelve desktop baseline cases produced **10 passing positive controls and two
expected failures**: both unavailable-state assertions failed, and screenshots
showed the false free-account state and new-checkout controls. Original product
SHA-256 values were:

| Component | Baseline SHA-256 |
| --- | --- |
| BillingPage | `186435CD8F68049E8ED25BCEEF4E53C50C02ECD03687B7A6ACE51B27E144B914` |
| TenantBillingPage | `8ABEC24DC16DB7E2454D821516A2FDB70136FB55B958447A9CE423236CA9685B` |

The first harness run and an accidental unchanged rerun each also contained
two exact-label selector failures. Those are retained separately; switching
the test locator to the actual combobox role resolved them before the final
baseline. They are not counted as product defects.

## Corrected behavior

`BillingPage` now requires a successful, non-null stack response and reuses its
existing unavailable/reload view when that required read fails.
`TenantBillingPage` records a required-read failure, clears stale contract and
usage presentation, and shows an accessible unavailable state with a reload
button. Only a successful required refresh clears that failure. Optional usage
can still be absent without erasing a verified subscription.

The failure branch omits contract/free claims and checkout, portal, and
companion controls. A failed read after a successful companion operation shows
that current details are unavailable; it does not show the former contract as
current or claim that the preceding operation was reverted. Retry performs
reads only. The existing valid free, paid, pending, ended, legacy and role
presentation branches remain unchanged, as do all API, Stripe, authentication,
tenant and entitlement semantics.

## Fresh verification

- Final focused actual-component browser run: **52 passed**, zero failures or
  skips, **43.3s**, covering 26 cases at 1280px and 390px. The preceding
  44-case run also passed before four durable legacy controls were added.
- Coverage: required stack rejection and null response; repeated failed retry;
  successful recovery; verified free/active/incomplete/canceled/checkout-failed
  contracts; grandfathered legacy-plan and individual-add-on positive controls
  in both views; owner/admin controls; BillingPage viewer denial without reads;
  provider-portal rejection; optional usage failure; and failed post-companion
  refresh followed by read-only recovery with exactly one original mutation.
- Strict typing of the new browser spec/config: pass.
- Root zero-warning lint on the frozen source/harness: pass.
- Pure pending-cart regressions: **3 passed**, zero failures/skips.
- Production build: **pass**, including all four workspace typechecks,
  API/runner/SDK compilation and all **38/38** generated Next pages.
  The initial sandbox run passed types and API/runner compilation, then Next
  failed creating its generated `types/app/tradeflowkit.webmanifest` directory
  with EPERM. The otherwise identical build passed outside that sandbox using
  only existing dependencies. The original failure log is retained; no source
  workaround or dependency installation was used.

The canonical release browser runner includes the new spec, so its 26 default
desktop fixtures join the next complete release gate. That combined exact-head
gate and independent source review are still required. The component fixtures
prove presentation behavior only. They substitute synthetic API/session
boundaries, use the actual components, primitives and SDK catalog, fulfill
loopback requests locally and block external requests. No API server,
database, provider account, payment, credential or user browser session is used.
The fixture does not load the full application's global CSS; screenshots were
inspected for the relevant state and reachable retry, not full-app visual parity.

Commands, using already present tools/dependencies:

```powershell
# From apps/web; the explicit cache path avoids sandbox LOCALAPPDATA redirection.
$env:PLAYWRIGHT_BROWSERS_PATH = 'C:\Users\John Xodus\AppData\Local\ms-playwright'
node node_modules/@playwright/test/cli.js test --config playwright.billing-read.config.ts

# From the repository root; pnpm is the existing pinned 10.34.5 runtime.
node node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution bundler --esModuleInterop --skipLibCheck apps/web/e2e/billing-read-truth.spec.ts apps/web/playwright.billing-read.config.ts
node --import tsx --test apps/api/test/application-stack-checkout-recovery.test.ts
pnpm lint
$env:INTERNAL_API_URL = 'http://127.0.0.1:5001'
$env:NEXT_TELEMETRY_DISABLED = '1'
pnpm build:production
```

Task receipts retain the immutable baseline hashes/logs/screenshots/traces and
candidate logs/screenshots under `evidence/OperatorOS/next-pass/`. No package,
lockfile or browser acquisition occurred; Chromium1228 was already cached.
No source publication or production action occurred in this change.

## Release boundary

Implementation verification does not establish deployed acceptance. The parent
read-only public observation on October19 identifies source `2db76299` and
runtime release **67/67**; the older v65 observation is historical and is not a
current runtime blocker. Exact protected database identity, recoverable backup,
paid-provider/customer acceptance and the release decision remain separate
evidence gates owned by the parent. This change adds no schema step, financial
transition, provider configuration, production write or publication authority.
Root coordinates the combined source release and reconciles implementation and
parity status after independent review and the full release gate.
