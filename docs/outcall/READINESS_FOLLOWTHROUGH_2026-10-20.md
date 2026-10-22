# OutCall country preflight follow-through - 2026-10-20

Status: narrow source fix verified locally and independently reviewed. Source
delivery and full hosted results are recorded separately in its draft PR.
OutCall remains globally coming soon, with provider activation,
account resource approval and live acceptance open. The owner still requires
every module, including OutCall, at a working standard for the first release,
targeting Friday, October 23, Eastern; this check does not close that target.

## Scope and behavior

Worktree: `operatoros-outcall-readiness-oct20`, branch
`codex/outcall-readiness-oct20`, verified clean at base
`520cc585b7efe887b0da06132b2981c2e5e576cf` before changes. The separate frozen
FieldNode candidate was not edited.

The static OutCall preflight previously accepted any country list containing
US or CA. For example, `US,GB` passed its country check while the provider's
runtime configuration rejected the entire list. Preflight now uses the runtime
normalization: split commas, trim, uppercase, discard empty tokens and deduplicate.
The resulting set must be nonempty and every country must be US or CA.
US-only, CA-only, both countries, case/whitespace variations, duplicates and
empty separators retain their existing runtime behavior.

The worker changed only `scripts/production-env-preflight.mjs`, its focused test
file and this document. Parent delivery additionally updates implementation and
parity evidence; no additional runtime behavior changes. Provider code, destination validation, canonical host,
activation switches, production adapter denial, catalog/SSO availability,
tenant authority, approvals, budgets, prices, schema and dependency lock did
not change. No allowance or operational activation was granted.

## Verification

Windows PowerShell; existing Node **24.16.0**. The focused TypeScript file uses
Node builtins and imports the pure preflight script; Node's existing native
TypeScript support runs it without package resolution or installation.
All configuration supplied by these tests is synthetic. Test names referring
to configured/live profiles do not mean a provider was contacted.

| Check | Result |
| --- | --- |
| Unchanged original test file, `node --test apps/api/test/production-env-preflight.test.ts` | 12 passed, 0 failed/skipped/cancelled/todo |
| Four new regressions with original preflight implementation | 15 passed, 1 failed, no skips; mixed-list test fails at `US,GB` because `report.ok` is incorrectly true |
| Same complete focused file after the fix | 16 passed, 0 failed/skipped/cancelled/todo; exit 0 |
| `node --check scripts/production-env-preflight.mjs` | Pass |
| Strict standalone focused-test TypeScript check using cached TypeScript 5.6.3 | Pass; exit 0 |
| Scoped zero-warning lint using cached ESLint 10.8.1 and unchanged repository configuration | Pass; exit 0 |
| `git diff --check` | Pass |

New cases cover mixed supported/unsupported lists, unsupported-only lists,
supported normalization/duplicates/separators, missing/empty normalized lists,
and independent exact-host, explicit activation and production test-adapter
denial controls. The existing twelve tests continue to exercise core, revenue,
email, CallCommand, AI, secret-redaction and authority checks.

Exact additional validation commands from this worktree:

```powershell
$cachedRuntime = 'C:\Users\John Xodus\Documents\Codex\2026-10-19\task\operatoros-fieldnode-free-oct20'
node (Join-Path $cachedRuntime 'node_modules/typescript/bin/tsc') --noEmit --strict --allowJs --resolveJsonModule --target ES2022 --module NodeNext --moduleResolution NodeNext --esModuleInterop --skipLibCheck --typeRoots (Join-Path $cachedRuntime 'node_modules/@types') --types node apps/api/test/production-env-preflight.test.ts
node (Join-Path $cachedRuntime 'node_modules/eslint/bin/eslint.js') --config (Join-Path $cachedRuntime 'eslint.config.js') scripts/production-env-preflight.mjs apps/api/test/production-env-preflight.test.ts --max-warnings=0
```

The referenced ESLint configuration hashes identically to this worktree's
configuration. Existing dependency files were read by absolute path; no
junction, package download, acquisition, install or lifecycle script was used.
This is scoped lint and test typing, not a claim that root `pnpm lint`, the
full workspace typecheck/build or the full release gate ran on this candidate.

## Review freeze and remaining gates

Verified source SHA-256 values:

| Path | SHA-256 |
| --- | --- |
| `scripts/production-env-preflight.mjs` | `d1ceda5a0af3f9d9ec604ed0292099cbad612be9a7d6038ebd6de7c02619f6e9` |
| `apps/api/test/production-env-preflight.test.ts` | `bd295e4014fbd32a88aa445a6773046c6d681b70d1ccaaf436be6138be3efb5c` |

The parent receives the complete three-file manifest and tracked diff hash
after this document is written. No commit or publication is authorized by
this receipt. Parent-owned implementation/parity ledgers can incorporate the
reviewed verification before source delivery.

This fixes one readiness inconsistency. It does not verify existing provider
accounts, rates, owned numbers, secrets, approvals, real Verify/SMS/voice/DTMF,
carrier reconciliation, actual process death, deployed SSO or customer billing.
No database, browser, device, account, credential, provider, recipient, settings,
spend, merge or deployment action occurred. Existing acceptance requirements
remain in `RESOURCE_CONTROLS_V67_2026-10-14.md` and the all-module OutCall
reconciliation report. Rollback is a scoped source revert; no data rollback
or migration is introduced.
