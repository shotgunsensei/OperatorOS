# Phase 20 Product Truth Report

- Assessment date: 2026-08-08
- Working branch: `codex/phase-20-product-truth-reset`
- Starting/current repository commit: `92214892769e1e3e54db4b13cf0635af1b5afb8b`
- Result: **baseline generated; Phase 20 and release parity are BLOCKED**
- Database migrations: none
- Production data, deployment, providers, and public traffic touched: no

## Decision

The repository now has one source-derived, executable product-truth baseline
for all 13 modules. It is intentionally not a completion certificate. The
baseline inventories 6,646 capabilities, assigns every record a deterministic
stable ID, permits only the four Phase 20 states, and leaves no unclassified
record. The Phase 23-25 regeneration exposes 6,129 blockers, so the release still
cannot be called complete.

The generated authority is:

- `docs/parity/source-manifest.json` for source provenance, tree fingerprints,
  module digests, and aggregate counts;
- `docs/parity/modules/<slug>.json` for every capability, source pointer,
  current target, automated evidence, state, and blocker;
- `docs/parity/OWNER_WAIVERS.yml` plus
  `docs/parity/OWNER_WAIVERS.schema.json` for exact owner exclusions;
- `scripts/phase20-product-truth.mjs` for deterministic generation and
  fail-closed verification.

Historical consolidation states, `PASS` labels, and "zero gap" ledgers remain
useful implementation evidence. They are not current parity truth when their
closure depended on retirement, a broad product-boundary decision, or an
unmapped source capability.

## Allowed state model

| State | Phase 20 meaning |
| --- | --- |
| `ACTIVE_NATIVE` | A current OperatorOS target exists and automated evidence maps the source capability to native runtime behavior. |
| `ACTIVE_SHARED_EQUIVALENT` | A current shared OperatorOS target preserves the source user outcome and automated compatibility evidence exists. |
| `OWNER_WAIVED` | The exact stable capability ID has complete owner approval metadata in `OWNER_WAIVERS.yml`. |
| `BLOCKED` | The capability is incomplete, unmapped, unproved, missing source authority, or pending individual review. |

No other state is accepted. `retired_security`,
`retired_product_boundary`, `planned`, `partial`, `represented`,
`documented`, and `dispositioned` are not completion states. The waiver file
starts empty, so there are zero explicit and zero implicit waivers.

## Repository and branch reconciliation

The initial working tree had one pre-existing user change,
`.codex/config.toml`. It remains untouched. No reset, clean, checkout-overwrite,
merge, cherry-pick, force push, or history rewrite was used.

| Input | Exact revision | Relationship to current HEAD | Disposition | Feature/truth consequence |
| --- | --- | --- | --- | --- |
| Starting `main` / `origin/main` | `92214892769e1e3e54db4b13cf0635af1b5afb8b` | Identical at assessment start | Retained as Phase 20 base; work moved to a scoped branch | Contains the later cumulative platform and module implementation evidence. |
| `origin/codex/phase-17-production-truth` | `05a3e45c24436fb86ab86a321e1e884dc7161f34` | The branch tip is its merge base with HEAD and is an ancestor of HEAD; merged by `30662d1` | No merge/cherry-pick; retained for evidence | Preserves the earlier TradeFlowKit restoration view with 57 explicit gaps. Later ledgers changed the dispositions, but do not erase this historical evidence. |
| `origin/codex/techdeck-zero-gap-restoration` | `a35daee7242a1610ba83c11a020015189f7b20cd` | The branch tip is its merge base with HEAD and is an ancestor of HEAD; merged by `c29cbca` | No merge/cherry-pick; retained for evidence | Its implementation and tests remain evidence. Its "zero gap" conclusion is superseded because retirement is no longer a completion state without an exact owner waiver. |
| Local user configuration | uncommitted `.codex/config.toml` | Predated Phase 20 | Preserved, excluded from Phase 20 changes | No product or parity inference is made from this file. |

## Source authority and fingerprints

The fingerprint algorithm is
`sha256(path NUL uint64be(size) content)` over all files in the imported source
root, sorted by normalized relative path. This pins content even when an old
source commit is no longer advertised by a remote.

| Module | Selected provenance | Imported files / bytes | Imported source tree SHA-256 |
| --- | --- | ---: | --- |
| BrandForgeOS | `BrandForge-OS` `main` at `5e78bc2ee6c8086ddd589bb7416f1d4560ffbb4e` | 273 / 1,265,564 | `20858dfed1553e65c2ee14bc7a76579212450ecf82fdbadadfc7cd1070047cff` |
| CallCommand AI | `Call-Command-AI` `main` at `d49434e1d641d62cc141591c7208539a7afbf11e` | 370 / 4,448,558 | `9d6b63239bf3e1e021ee38cbb0e1900bc5756b240e9b306ff203d26edae9f548` |
| FaultlineLab | `Faultline-Lab` `main` at `46877aae35565149ccf4f4988dd94627fc6bb92b` | 452 / 7,927,304 | `e003f51e460376ad96f42c14303d4928f3948af6faa62170811279d7cc0d86af` |
| Ninja Launch Kit | `Ninja-Launch-Kit` `main` at `30bd1abc05846926e97bc7b26c5b7d6625e8f161` | 257 / 1,184,335 | `59daef03f6dbaa1998793808294d2992c9d8a7c1bcf836057d4ab3dd3293a5ce` |
| Ninja Pool Hall | `Shotgun-ninja-pool-hall` `main` at `62439c4018ec551ce2891800351200c8ab2cb9e7` | 146 / 1,828,963 | `ef94c15839731bfa2881d7e95a703c1cfef950b18790109373c80a31efec0fa8` |
| Ninjamation | `AutomationPacks` application `master` at `cca75338d04ed35b89f28d614eb51559735aa32f` plus catalog `main` at `ca0e55fd086f6751a43964927166bfa69db012b6` | 185 / 2,867,510 | `4c50291fa06582d0b8a5ecdd86f294bec94bd9282ac4774a2ac6ae00dabb6e3b` |
| OutCall | Missing canonical source; imported boundary is only `apps/modules/outcall/source/README.md` | 1 / 639 | `c8dd9b90c2b2624a9b8b2ee17cbcd6cfd1f1de2cd8b6a82654ec341115a453ef` |
| PulseDesk | `PulseDesk` `main` at `937849471e489ed23db2a263d04160a388402740` | 211 / 7,663,743 | `37577ad5b07de3a9ffc65adc3a279ecd37e3498434bbaa3209b469da0c06b833` |
| SnapProofOS | `snapproof` `main` at `26bded38c13b5b6361d407462c68052b0c30613d` | 260 / 3,411,533 | `8b40d45e0b827310a8e2c5581d8694f179efe98519b554756884383e992353ea` |
| StudyForge AI | `Study-Forge` `main` at `a607a9f34442b1d0f6bfffbf0293609529494825` | 225 / 936,004 | `eb37ae3fb92f606d9a137657baa4d0fcb4988c6918eb7afd87b60814040156b3` |
| TechDeck | `Tech-Deck` `main` at `8125f8d89d8d39d60a50c8061a26133a0c917792` | 302 / 13,929,944 | `96346d2116e03349953771d7606dadf4b367338d2c87edd5950e6f8cb5071795` |
| TorqueShed | Imported `TorqueShed-Codex` snapshot at `c33ade5cef525d62d371a63946b814c58a72a4a7` | 149 / 7,946,844 | `babeb43df2beb6200c4afc68383ca51fdfbabdfb0d6c250dbb54959ba289e366` |
| TradeFlowKit | Imported restored snapshot at `37aa67f1da804fc3ac56f36e50e01362077d7a26`; the remote no longer advertises its former restoration ref | 321 / 7,881,072 | `81c63c362772b35a4c5f531591d5ed56f438fa0aa8161d41c399565ca9c97509` |

### Recovery investigation and candidates

- Remote heads were checked for each documented source repository. All
  selected commits still matched their documented branch except TradeFlowKit's
  removed restoration ref and TorqueShed's deliberately older imported
  snapshot.
- Local sibling repositories under `C:\Dev` were inspected read-only. Clean
  siblings corroborated the pinned BrandForgeOS, CallCommand, FaultlineLab,
  PulseDesk, Ninja Pool Hall, SnapProofOS, StudyForge, and TechDeck baselines.
- `C:\Dev\TorqueShed-Codex` is dirty at
  `68da4548f6650cfb11eb19ee133643a110ccf084` and contains substantial
  uncommitted product/security/mobile work. It is evidence, not deterministic
  authority. Remote `TorqueShed-Codex/main` at
  `508b384b6f66a1eacd3d4cd8d9c5edd4bf47fe75` is three commits and 34 files
  beyond the imported snapshot; the separate clean `C:\Dev\TorqueShed` at
  `a81ffcfc81cc87008e2fb531a99d55cbcfcfa9cc` is another `BLOCKED_REVIEW`
  authority candidate. None was copied blindly.
- `AutomationPacks` branch
  `codex/create-gui-for-script-selection-and-execution` at
  `1b8818afbc261f70e60584979e3e4efe550630c8` is an older 35-entry catalog-only
  tree with no common ancestor to the selected application baseline. It is
  retained as evidence, not selected as fuller application source.
- OutCall was searched in repository history/remotes, public owner repository
  names, all relevant `C:\Dev` siblings, and the available
  `C:\Dev\OperatorOS.zip` and `C:\Dev\TorqueShed.zip` archives. No launchable
  source application was recovered. The direct owner/OutCall repository probe
  returned repository-not-found. The exact `SOURCE_RECOVERY_REQUIRED` blocker
  is therefore the only honest baseline.

## Capability inventory

### Parity states by module

| Module | Total | ACTIVE_NATIVE | ACTIVE_SHARED_EQUIVALENT | OWNER_WAIVED | BLOCKED |
| --- | ---: | ---: | ---: | ---: | ---: |
| BrandForgeOS | 793 | 0 | 0 | 0 | 793 |
| CallCommand AI | 589 | 0 | 0 | 0 | 589 |
| FaultlineLab | 557 | 56 | 0 | 0 | 501 |
| Ninja Launch Kit | 336 | 0 | 0 | 0 | 336 |
| Ninja Pool Hall | 56 | 0 | 0 | 0 | 56 |
| Ninjamation | 189 | 0 | 0 | 0 | 189 |
| OutCall | 1 | 0 | 0 | 0 | 1 |
| PulseDesk | 889 | 65 | 60 | 0 | 764 |
| SnapProofOS | 341 | 0 | 0 | 0 | 341 |
| StudyForge AI | 317 | 0 | 0 | 0 | 317 |
| TechDeck | 1,337 | 73 | 101 | 0 | 1,163 |
| TorqueShed | 125 | 0 | 0 | 0 | 125 |
| TradeFlowKit | 1,116 | 142 | 20 | 0 | 954 |
| **Total** | **6,646** | **336** | **181** | **0** | **6,129** |

For modules without a pre-existing executable source ledger, Phase 20 does
not infer parity from broad module tests or a rendered shell. Their discovered
capabilities remain blocked until an exact current target and automated
source-compatibility evidence are mapped. A zero in the active columns is a
mapping/evidence result, not a claim that no code exists.

### Inventory categories by module

| Module | Pages | Routes | UI actions | APIs | Tables | Columns | Workers | Integrations |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| BrandForgeOS | 21 | 22 | 214 | 86 | 33 | 380 | 0 | 24 |
| CallCommand AI | 22 | 3 | 134 | 86 | 20 | 264 | 0 | 39 |
| FaultlineLab | 1 | 0 | 200 | 42 | 9 | 79 | 7 | 72 |
| Ninja Launch Kit | 18 | 17 | 107 | 44 | 9 | 60 | 0 | 39 |
| Ninja Pool Hall | 7 | 6 | 19 | 1 | 0 | 0 | 2 | 9 |
| Ninjamation | 10 | 9 | 67 | 29 | 3 | 26 | 1 | 32 |
| OutCall | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| PulseDesk | 0 | 23 | 238 | 183 | 50 | 308 | 8 | 45 |
| SnapProofOS | 17 | 16 | 46 | 63 | 16 | 140 | 0 | 12 |
| StudyForge AI | 19 | 18 | 119 | 33 | 11 | 83 | 1 | 20 |
| TechDeck | 0 | 65 | 448 | 221 | 45 | 438 | 5 | 46 |
| TorqueShed | 1 | 0 | 52 | 8 | 2 | 17 | 0 | 21 |
| TradeFlowKit | 0 | 35 | 432 | 194 | 40 | 321 | 0 | 8 |
| **Total** | **116** | **214** | **2,076** | **990** | **238** | **2,116** | **24** | **367** |

| Module | Imports | Exports | Public flows | Mobile/PWA | Assets | Source tests | Special records |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| BrandForgeOS | 0 | 5 | 5 | 1 | 2 | 0 | - |
| CallCommand AI | 16 | 0 | 0 | 0 | 5 | 0 | - |
| FaultlineLab | 1 | 3 | 0 | 2 | 61 | 24 | 56 playable cases |
| Ninja Launch Kit | 0 | 22 | 7 | 11 | 2 | 0 | - |
| Ninja Pool Hall | 0 | 0 | 0 | 2 | 8 | 2 | - |
| Ninjamation | 0 | 2 | 3 | 0 | 7 | 0 | - |
| OutCall | 0 | 0 | 0 | 0 | 0 | 0 | 1 source-recovery record |
| PulseDesk | 0 | 0 | 24 | 2 | 8 | 0 | - |
| SnapProofOS | 2 | 11 | 6 | 8 | 4 | 0 | - |
| StudyForge AI | 0 | 0 | 11 | 0 | 2 | 0 | - |
| TechDeck | 4 | 0 | 35 | 8 | 8 | 14 | - |
| TorqueShed | 0 | 0 | 3 | 3 | 17 | 0 | 1 native-mobile record |
| TradeFlowKit | 3 | 6 | 23 | 3 | 17 | 33 | 1 visual-contract record |
| **Total** | **26** | **49** | **117** | **40** | **141** | **73** | **59** |

Each source item can yield more than one capability facet. For example, a
public API route is both an API endpoint and a public flow; a mobile source
file may also be a page, action, asset, or test. Counts therefore describe
stable capability records, not unique files.

## Blocker analysis and corrected claims

| Blocker code | Count | Meaning / next evidence |
| --- | ---: | --- |
| `SOURCE_CAPABILITY_UNMAPPED` | 5,490 | A source-derived item has no exact current target plus automated compatibility mapping. |
| `BLOCKED_REVIEW` | 462 | A former security/product-boundary retirement facet requires an individual native/shared equivalent or exact owner waiver. Across this row and the missing-pointer row, 469 blocked facets carry former retirement labels: 400 original source-ledger entries plus 69 explicitly derived public-flow facets. |
| `SOURCE_IMPLEMENTATION_POINTER_MISSING` | 113 | An old ledger capability claims implementation paths absent from the pinned imported tree: 49 PulseDesk facets, 28 TechDeck facets, and 36 TradeFlowKit facets. These contain 115 missing path occurrences. |
| `MOBILE_OR_PWA_PARITY_UNPROVEN` | 40 | A source mobile/PWA surface or artifact lacks platform-specific equivalence evidence. |
| `MISSING_CURRENT_TARGET_OR_AUTOMATED_EVIDENCE` | 22 | A former active/shared ledger item lacks an existing target pointer or automated evidence under the stricter gate. |
| `SOURCE_RECOVERY_REQUIRED` | 1 | OutCall has no recovered canonical launchable source application. |
| `NATIVE_MOBILE_PARITY_REQUIRED` | 1 | TorqueShed's imported Expo iOS/Android product is not proved by web-only behavior. |
| **Total** | **6,129** | The release remains blocked. |

The strict pointer check changed 106 previously active/shared facets to blocked:
61 former active facets and 45 former shared-replacement facets. Seven former
retirement facets also use the more precise missing-pointer blocker instead of
`BLOCKED_REVIEW`. The missing claims are retained in each record's
`missingSourcePointers`; the old ledger JSON is kept as provenance and is not
mistaken for source implementation.

Specific corrections:

- **TradeFlowKit:** the Phase 17 production-truth branch is retained as exact
  evidence of 57 historical restoration gaps. The later current ledger has no
  `phase16_gap` label, but its 43 security and 31 product-boundary retirements
  do not become complete under Phase 20. Derived public-flow facets and the
  derived public-flow facets add further explicit records. Phase 23 closes the
  orange/navy visual-contract record with scoped tokens and automated evidence. There is no
  contradiction: the 57 number describes the earlier branch snapshot, while
  the generated ledger describes current HEAD under the stricter state model.
  Its old ledger also contains 36 capability facets referencing source paths
  absent from the pinned imported tree.
- **FaultlineLab:** Phase 25 compiler-discovers every authored `allCases`
  definition, records deterministic repairs, imports all valid output as
  published immutable versions, and maps every playable-case capability to a
  zero-exclusion database iteration. The earlier four-case restriction and
  "planned-only/non-playable" description are superseded.
- **TechDeck and PulseDesk:** prior tests and implementations remain valid
  evidence, but 48 + 134 TechDeck and 53 + 91 PulseDesk retired ledger entries
  require individual review. Derived public-flow facets inherit the same
  blocked state. Additionally, 28 TechDeck and 49 PulseDesk facets claim source
  paths absent from their pinned imports.
- **OutCall:** its current OperatorOS reconstruction may have tests and working
  behavior, but a README-only source boundary cannot prove full-product parity.
- **TorqueShed:** the imported source contains an Expo app and platform assets.
  A web workflow cannot prove iOS/Android navigation, SSO, behavior, visual
  fidelity, packaging, or platform acceptance.

## Generator behavior and reproducibility

The generator recursively fingerprints every imported source file and performs
TypeScript/JavaScript/JSX static discovery for pages/routes, UI actions, HTTP
routes, Drizzle tables/columns, workers, environment/provider references,
imports/exports, public flows, mobile/PWA surfaces, assets, and source tests.
The three existing executable source ledgers remain the page/API/table/provider
inventory inputs for TradeFlowKit, TechDeck, and PulseDesk; their source
pointers, current targets, and automated evidence are revalidated against the
working tree. A claimed implementation path absent from the pinned import is
preserved in `missingSourcePointers` and forced to
`SOURCE_IMPLEMENTATION_POINTER_MISSING`.

Stable IDs use:

`<module>.<type>.<first 16 hex characters of sha256(module|type|canonical source identity)>`

`verify:parity` regenerates in memory and compares every checked-in JSON byte
for byte. It also rejects unknown states, duplicate IDs, active capabilities
without current targets and automated tests, blockers without blocker codes,
malformed/duplicate waivers, unknown waived IDs, and owner-waived states that
do not match an exact waiver.

## Verification evidence

This table is updated with fresh commands from this branch. It does not reuse
historical pass counts as Phase 20 evidence.

| Command | Environment | Result |
| --- | --- | --- |
| Bundled pnpm `install --frozen-lockfile` with `CI=true` | First non-interactive attempt lacked `CI=true`; second sandboxed attempt could not fetch the signed pnpm package; approved registry retry used bundled Node on `PATH` | PASS on final retry: lockfile current, 683 packages installed, tracked lockfile unchanged. The two setup failures occurred before tests. |
| `node scripts/phase20-product-truth.mjs --write` | Bundled Node.js; repository root | Phase 23-25 regeneration PASS: 13 modules, 6,646 capabilities, 336 native, 181 shared-equivalent, 0 waivers, 6,129 blocked, 0 unclassified, and 0 failures. |
| `node --test scripts/phase20-product-truth.test.mjs` | Bundled Node.js | One interim run passed 4/5 and exposed an assertion that allowed only `BLOCKED_REVIEW`; after the stricter missing-source blocker was incorporated, final PASS 5, FAIL 0, SKIP 0, TODO 0. |
| `node scripts/public-launch-capability-matrix.mjs` | Existing historical regression | Initial FAIL 131: 2 omitted current routes and 129 stale placeholder line records. No referenced runtime source was modified by Phase 20. |
| `node scripts/public-launch-capability-matrix.mjs --write` then unchanged verifier | Supported deterministic refresh of the historical generated matrix | PASS: 13 modules, 30 capability groups, 1,144 discovered runtime artifacts, 1,163 classified placeholder occurrences, 0 `FIX_NOW`, 0 unclassified, 0 failures. |
| TradeFlowKit, TechDeck, and PulseDesk source-ledger verifier scripts | Direct bundled Node.js equivalents of `verify:public-launch` chain | PASS: TradeFlowKit 277/277 and 0 unclassified; TechDeck 382/382 and 0 unclassified; PulseDesk 309/309 and 0 unclassified. Their retirement labels remain Phase 20 blockers. |
| TypeScript `--noEmit` for `apps/api`, `apps/runner-gateway`, and `apps/web` | Direct execution of the same TypeScript compiler targets because the managed pnpm signature launcher required registry access | PASS 3 projects, FAIL 0. |
| Release metadata generation; SDK/API/runner TypeScript builds; `INTERNAL_API_URL=http://localhost:5001` Next production build | Build `9dedba087313eb724613e0f5`; Next.js 15.5.22 | PASS. The first Next attempt failed only because sandbox networking denied Google Font downloads; the approved retry compiled, generated 22/22 static pages, and completed. Type validation had already passed separately; Next reported its configured lint/type skips, so no Next-integrated lint/type pass is inferred. |
| `node scripts/production-env-preflight.mjs --core` | First empty environment then non-secret local production-contract fixture | Initial FAIL with 22 missing/invalid required settings; PASS after supplying the documented exact URLs, modes, trust proxy, and synthetic non-production secrets/DB URL. No connection was made. |
| `node node_modules/tsx/dist/cli.mjs apps/api/src/scripts/database-release.ts --plan` | Read-only; no database URL required | PASS: release v33, 33/33 ordered steps, `destructive=false`, no apply. |
| Focused TradeFlowKit shared-runtime lead contracts | Disposable PostgreSQL 16; synthetic test secrets | PASS 8/8 after updating one stale customer-copy assertion from `tenant leads` to the current `organization leads` text. No runtime behavior changed. |
| Full API PostgreSQL aggregate, first post-assertion clean run | Fresh disposable PostgreSQL 16; serial test files; synthetic test secrets | FAIL: 930 total, 923 pass, 1 fail, 6 skip. The Torque Assist final-debit concurrency test expected statuses `[200, 402]` but observed `[200, 200]`. |
| Focused Torque Assist final-debit concurrency workflow | Same isolated database class | The failure reproduced once immediately, then passed five consecutive isolated repeats after diagnostic instrumentation was removed. No Torque runtime diff was retained. This remains an intermittent-risk observation rather than a Phase 20 runtime fix. |
| Full API PostgreSQL aggregate, final clean run | Newly recreated disposable PostgreSQL 16; serial test files; synthetic test secrets | PASS: 930 total, 924 pass, 0 fail, 6 skip, 0 todo in 585,055.8112 ms. The disposable container was deleted after the run; no persistent/developer database was substituted. |
| `git diff --check` | Working tree | PASS with no whitespace errors. |

No repository lint or formatting command exists, so no lint/format pass is
claimed. The focused Phase 20 tests, legacy truth verifier, typechecks,
production build, preflight, read-only release plan, and final clean database
aggregate are fresh. The aggregate used only an isolated disposable PostgreSQL
URL and non-production test secrets. The container was removed after testing;
no persistent developer or production database was substituted.

## Architecture, migrations, and rollback

- The work changes product-truth tooling and documentation plus one static
  TradeFlowKit customer-copy test assertion. It adds no runtime route, schema
  object, release step, data migration, provider call, or deployment mutation.
- OperatorOS remains authoritative for identity/sessions, tenants/membership/
  roles, platform billing/entitlements, provider-secret custody, module launch,
  and cross-module audit. Phase 20 does not restore child authority.
- Rollback is deletion/reversion of the generated parity artifacts, generator,
  tests, package scripts, truth overlays, and the one static copy assertion.
  There is no database or external state to roll back. The pre-existing
  `.codex/config.toml` must remain untouched.

## Remaining blockers and next phase entry condition

Phase 20 remains open while any required record is `BLOCKED`. The next scoped
restoration phase may begin only after its module's source authority is agreed,
the relevant stable capability IDs are selected, and each selected item has
one of:

1. a tenant-scoped `ACTIVE_NATIVE` implementation with automated unit/API/DB/
   exact-host/visual evidence appropriate to its behavior;
2. an `ACTIVE_SHARED_EQUIVALENT` target with automated source-compatibility
   evidence preserving the same user outcome; or
3. an exact, consequence-aware, owner-approved waiver in
   `OWNER_WAIVERS.yml`.

Priority entry blockers are OutCall source recovery; the TorqueShed authority
decision and Expo parity; recovery/reconciliation of the 113 missing-source
facets; review of former retirement records; exact target and test mapping for
the 5,497 unmapped records. Broad feature work, deployment
promotion, and a parity-complete claim must wait for scoped evidence.
