# Local all-module integration candidate - October 22, 2026

This source candidate starts from published OperatorOS
`49b68ed638da1716545f056473a8f46fb593e3fd`. It preserves that commit's public
free Lunch Break hub, artwork, navigation, exact-host restrictions, startup
supervisor, native CI guard and dependency patches. It has not been published,
merged or deployed. The fourteen-module release target includes Outcall;
the existing production deployment and this local candidate are distinct.

## Bounded component provenance

| Component | Reviewed source head | Selection |
| --- | --- | --- |
| FieldNode central identity and managed gateway | `f6f3e8e67d00b641b80c8255eb95c8acd1fc14f3` | Delta from `677bdb6f`, excluding held SSO test |
| Combined Outcall, PulseDesk and BrandForge source | `2a4b5c5d631c548c2b6294280661fcb199847483` | Delta from FieldNode component |
| Independent tool foundation | `e81f327524d1e56833dbc14ebfdef82993e78adb` | Only tool delta after old hub; old hub commit omitted |
| Catalog browser fixture | `2fc611e177719dc65c22605de07401952c9161ff` | One bounded test-fixture delta |
| Disabled purchase and fulfillment | `c19098d76fc0222b39189e6e3b97d2c5fa566350` | Delta from tool foundation fixture |
| Scoped linking notice fixture | `b305feeea7d84794fcbc9cdda166f030f07345b1` | One bounded browser-fixture delta |
| Complete OfficeExit tenant grant | `24f831bd5d885987af1155cbff935ed6cb196a1e` | Complete product and policy regression delta |
| BrandForge execution serialization | `e33e2057daa895111149959c0329628ffd4e20e9` | Only four reviewed follow-on files |

All component branches remain preserved. No old integration ancestry was merged
into the published branch. Seven shared hub-delta files require additive hunk
composition; twenty-six remain exact published blobs. The native CI workflow,
supervisor, public hub components/assets, browser runner and workspace overrides
remain unchanged from the published base. The lock keeps published patched
entries and adds only the earlier reviewed mailbox closure.

The held `apps/web/e2e/sso-v1.spec.ts` remains published blob
`d70ad8be4887a8e9400abb06f1a949f1c16aec47`, distinct from stopped local blob
`16ec7474082de6612d8e9fb4d4e6342e9d3d0593`. It was excluded from every component
patch and never executed, edited or published. Its all-module expectation and
specific publication gate remain unresolved. No complete SSO/release pass is
claimed.

## Integration-only test corrections

The first combined run reproduced two fixture-composition seams, without
demonstrating a production authorization defect:

- FieldNode's VM extracts the current entitlement function but lacked its new
  `isIndependentToolModuleSlug` dependency. It now binds the actual SDK helper;
  all identity, role-race and denial assertions remain.
- FieldNode's original release67 assertion predates commerce's reviewed release68.
  The test preserves free-grant checks, asserts exactly68 ordered steps, preserves
  the prior67th Outcall step, requires final `tool_purchase_ledger`, and asserts
  there is no FieldNode DDL step.

The corrected two-file group passes72/72. Earlier failed runs remain recorded:
initial surface226/233, then232/233 after helper and loopback execution; these
are not relabeled as a fresh full233-case pass. Initial tool140/141 failed only
at sandbox junction creation; the unchanged141-case group passed with scoped
temporary-junction execution. Initial module regression180/194 with8 failures
and6 skips lacked the disposable SQL declaration; its correctly scoped rerun
passed189 of195 with no failures and six optional marketing HTTP skips.

## Local checks and their limits

- SDK build and all four workspace typechecks passed before the bounded
  BrandForge overlay. BrandForge's own exact-head types/strict/lint proof is
  retained; a new combined production build remains a separate gate.
- Corrected composition72/72, tool policy/provider/fulfillment/artifact141/141,
  actual PostgreSQL purchase/store/commerce41/41 and root zero-warning lint pass.
- Module regression on the new PostgreSQL16.14 fixture passes189/195, with six
  marketing HTTP cases skipped because no Next server was running. These require
  the built local server with `WEB_BASE_URL`, not provider access or SQL approval.
- Review-only schema68 applied successfully to the new task-owned empty tmpfs
  PostgreSQL fixture on numeric loopback only. It was not applied elsewhere.
- An additional integration-gate process did not start: automatic approval
  review failed during session initialization with a thread-store metadata
  recovery deadline. The tool explicitly reported no execution and no safety
  determination. That command was stopped, not retried or moved to another route.

Existing cache versions include Next15.5.25, React18.3.1, ws8.21.3,
libphonenumber-js1.13.15, ajv8.20.0, OpenAI6.49.0 and TypeScript5.6.3. Vite is
7.3.6 versus locked7.3.7, and Twilio's existing follow-redirects is1.16.0 versus
locked1.16.1. The known separate hub cache has those same two older versions.
Canonical ImapFlow1.3.1/Mailparser3.9.8 remain absent and their acquisition hold
is unchanged. No package installation, acquisition or lock weakening occurred.
This is existing-cache verification, not a pristine frozen install or complete
patched-runtime acceptance.

Production build, built HTTP/browser results and final cleanup are recorded in
the external immutable candidate manifest after source freezing. A pending stage
is not a pass. No live account, OAuth/mailbox, provider, paid call, device, checkout,
recipient delivery or protected production-data acceptance follows from these
local checks.

## Product and release gates

Lunch Break stays public and free. Pool Hall retains standalone access. FieldNode
is free for free and paid accounts; management still requires validated tenant
identity, local authority and explicit device grants. Its appliance repository
was not edited. Outcall's source activation grants no new commercial product,
pricing or telephony spend. BrandForge live adapters remain unavailable.

OfficeExit2026 and VendorTrust365 remain independent USD99 one-time purchases for
the entire tenant, eligible for free and paid accounts. OfficeExit includes all
ten current capabilities through its internal MSP Pro compatibility alias.
There is no new count cap, recurring charge or future-major-version promise.
Checkout, fulfillment activation, trust and artifact offers remain disabled.

This candidate requires reviewed schema68 and must not be served on current
production schema67. Exact database identity, recoverable backup/write pause and
explicit application approval remain required. The held SSO test, canonical
dependency installation, applicable exact-tree CI and controlled account/provider/
hardware acceptance remain release gates. No source publication, migration,
security setting, credential, provider, production deployment or hub overwrite
was performed.

Rollback retains the published source/build and current database until approved
promotion. Do not delete purchase provenance or mappings to force a downgrade.
Any later deployment must preserve compatible fulfillment/revocation processing,
disable new checkout during withdrawal and follow the approved database recovery
and artifact rollback procedure. This local worktree alone changes no live state.
