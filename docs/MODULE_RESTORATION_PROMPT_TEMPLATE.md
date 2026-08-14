# OperatorOS module restoration prompt template

Use this prompt when an OperatorOS module is present but incomplete, degraded,
placeholder-driven, or behind its recoverable standalone product.

The target outcome is a fully functional approved-scope module as quickly as
possible. “Fully functional” means every inventoried source capability is
implemented, replaced by an existing OperatorOS service, or explicitly retired
by an accepted security/product boundary. It does not mean reproducing unsafe
legacy architecture.

## Before using the prompt

Replace the values below when known. Leave a value as `DISCOVER` when the agent
must determine it from the repository; discovery must not become a reason to
stop unless the answer would materially change product ownership or security.

| Input | Value |
| --- | --- |
| Module name | `[MODULE_NAME]` |
| Canonical slug | `[MODULE_SLUG]` |
| Canonical host | `[MODULE_HOST]` |
| Commercial class | `[CORE_OR_ADD_ON_OR_FREE]` |
| Product purpose | `[ONE_SENTENCE_PRODUCT_BOUNDARY]` |
| Canonical OperatorOS repository | `C:\Dev\OperatorOS` |
| Best standalone/source repository | `[SOURCE_REPOSITORY_OR_DISCOVER]` |
| Expected source revision | `[SOURCE_COMMIT_OR_DISCOVER]` |
| Primary user workflow | `[SHORTEST_REVENUE_OR_VALUE_WORKFLOW]` |
| Sensitive-data classification | `[NONE_OR_BUSINESS_OR_PHI_OR_SECURITY]` |
| Expected live providers | `[PROVIDERS_OR_NONE_OR_DISCOVER]` |
| Existing ADRs | `[ADR_NUMBERS_OR_DISCOVER]` |

## Copy/paste prompt

```text
Restore [MODULE_NAME] (`[MODULE_SLUG]`) inside the canonical OperatorOS
repository at `C:\Dev\OperatorOS` to complete approved-scope source/local
functionality. Work continuously through the restoration; do not stop after a
shell, dashboard, one vertical slice, or a list of remaining gaps. The intended
product boundary is:

[ONE_SENTENCE_PRODUCT_BOUNDARY]

The shortest user-value workflow that must work end to end is:

[SHORTEST_REVENUE_OR_VALUE_WORKFLOW]

Use `[SOURCE_REPOSITORY_OR_DISCOVER]` as read-only restoration evidence and pin
the exact reviewed commit. The canonical active implementation must remain in
OperatorOS. Do not run the imported source server, install its dependencies,
apply its migrations, or create a second production runtime/database/auth
system.

Your completion target is:

1. Every source page, API route, table/domain concept, provider/config
   reference, background process, and important user action is inventoried.
2. Every inventoried item has exactly one evidence-backed disposition:
   - active in OperatorOS;
   - replaced by an existing shared OperatorOS capability;
   - retired for security/compliance;
   - retired by an accepted product boundary; or
   - a restoration gap that you will implement before finishing.
3. The final executable ledger has zero unclassified items and zero restoration
   gaps.
4. The approved module runs as a real persistent product through compiled
   production artifacts and exact-host browser acceptance.
5. The only unfinished items are values/actions that genuinely require a human
   deployment gate: Replit secrets, live-provider accounts/approval, DNS,
   production backup/export/apply, traffic cutover, or release authorization.

Do not interpret “restore every function” as permission to restore duplicate
identity, billing, tenancy, unsafe automation, obsolete infrastructure, or an
unapproved product. Those items need explicit retirement/shared-replacement
dispositions, not hidden omission.

Operating rules

- Read `AGENTS.md` and the current authoritative OperatorOS documents before
  editing:
  - `docs/auth/OPERATOROS_SSO_CONTRACT_V1.md`
  - `docs/OPERATOROS_ECOSYSTEM_INTEGRATION_CONTRACT.md`
  - `docs/MODULE_CONSOLIDATION_STATUS.md`
  - `docs/IMPLEMENTATION_STATUS.md`
  - `docs/modules/MODULE_PARITY_INDEX.md`
  - `docs/FINAL_E2E_ACCEPTANCE_REPORT.md`
  - `docs/CROSS_MODULE_READINESS_REPORT.md`
  - `docs/DATABASE_BACKUP_RESTORE.md`
  - `docs/adr/README.md`
  - `PLANS.md`
- Inspect branch, status, recent history, routes, schemas, release contract,
  tests, module shell, navigation, imported source, source history, migrations,
  env examples, docs, and deployment files before changing code.
- Preserve unrelated user work. Use a scoped `codex/<module>-restoration`
  branch and surgical commits.
- Make reasonable in-scope decisions without repeatedly asking for
  confirmation. Stop only when a missing decision would materially expand the
  approved product/security boundary or requires production mutation.
- Prefer restoring/extending existing domain entities and services over adding
  parallel models. Recover the real product, not the most recent placeholder
  checkpoint.
- Keep a short execution plan, but spend the work on implementation and proof.
  Update the plan as gates close; do not repeatedly summarize incomplete work.

OperatorOS authority boundaries

- OperatorOS remains the sole authority for users, credentials, sessions,
  tenants, memberships, platform roles, module access, entitlements,
  subscription/add-on billing, module registry, launch policy, and platform
  audit.
- Use exact-host SSO v1 with opaque, short-lived, single-use codes bound to the
  exact client/callback, state, nonce, PKCE S256, environment, tenant, module,
  entitlement, and relative return path.
- Use host-only `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/` cookies. Never
  add parent-domain cookies, URL/localStorage bearer tokens, module-local
  passwords, auth bypasses, or arbitrary redirects.
- Resolve tenant, role, module, and entitlement from the validated server
  session. A client tenant header is only a requested selection and must be
  revalidated.
- Every module query, mutation, transaction, uniqueness rule, import,
  background job, file access, and audit event must include the trusted tenant
  ID. Foreign resources must return non-enumerating denial.
- A module may narrow OperatorOS roles but never widen them. UI hiding is not
  authorization.
- OperatorOS owns platform Stripe billing. Keep legitimate module business
  payments explicitly separate and idempotent.
- Use shared Directory, attachments/scanning, notifications/outbox, provider,
  usage, activity, AI, and idempotency services when they already own the
  capability.
- Never commit secrets, `.env` files, credentials, customer data, private
  dumps, or production tokens.

Fast restoration method

Phase A — recover the product boundary

1. Inspect all Git branches/history and identify the best product-bearing
   source revision, not merely the latest deployment checkpoint.
2. Compare the active OperatorOS module, quarantined snapshot, and clean source
   repository. Hash/pin the reviewed source.
3. Identify the module’s real user, commercial purpose, primary workflow,
   record ownership, role model, providers, and sensitive-data constraints.
4. Reuse or write an ADR for ambiguous ownership. Do not begin broad
   implementation while a security/product boundary is unresolved.
5. Create or update a machine-verifiable source ledger. Inventory at minimum:
   - client routes/pages and important controls;
   - API routes and public callbacks;
   - database tables/entities and background jobs;
   - imports/exports, search, saved views, bulk actions, retention, settings,
     analytics, and public/portal flows;
   - providers, required environment names, auth, billing, and tenant surfaces.
6. Record a disposition and rationale for every item. Make the verifier fail on
   an unclassified item or a restoration gap at closure.

Phase B — close the shortest complete workflow

1. Select the smallest end-to-end workflow that proves real product value. It
   must include authenticated launch, tenant-scoped persistence, meaningful
   create/read/update/lifecycle behavior, deep-link refresh, return navigation,
   and logout.
2. Build vertically: ordered schema/release step, server validation and
   authorization, transaction/service logic, API contracts, responsive UI,
   activity/audit, focused database tests, then exact-host browser proof.
3. Use real PostgreSQL persistence. No in-memory production data, static
   counters, fake CRUD, mock-only dashboards, dead controls, placeholder cards,
   or “coming soon” entries in primary navigation.
4. Include loading, empty, error, stale-version/conflict, permission-denied, and
   mobile states. Primary actions must be discoverable and actually execute.
5. Prefer additive changes and existing component/service patterns. Avoid
   framework or dependency rewrites unless the active architecture is
   demonstrably broken.

Phase C — eliminate the ledger efficiently

Process remaining items by shared implementation cluster rather than
source-file order:

1. Core records and lifecycle:
   CRUD, status transitions, relationships, comments/activity, deep links,
   archive/restore, and dependency rules.
2. Operator productivity:
   bounded search/filter, durable per-user saved views, safe bounded bulk
   actions, imports/exports, settings, and useful record-derived analytics.
3. Collaboration and shared services:
   Directory identities, attachments, notification/outbox, provider adapters,
   usage/metering, and audit.
4. Public/provider flows:
   signed callbacks, token-hash public documents, consent/suppression,
   idempotency/replay protection, and fail-closed configuration.
5. Legacy data:
   read-only commit-pinned export/dry run first; guarded atomic apply only with
   explicit mapping, fingerprint, backup reference, environment gate,
   advisory lock, idempotent references, reconciliation, and human approval.

For each cluster:

- implement the shared server primitive once;
- expose complete responsive UI;
- add focused validation/security/persistence tests;
- update ledger classifications immediately;
- continue to the next cluster without asking for routine confirmation.

Safe implementation requirements

- Validate all request and CSV/import data server-side; client parsing is not a
  trust boundary.
- Bound list sizes, upload sizes, import rows, field lengths, pagination, and
  expensive queries.
- Use database constraints, tenant-composite references, indexes, integer
  money, audit timestamps/actors, and transactions.
- Use optimistic versions for editable records and idempotency keys for
  retryable create/convert/import/provider actions.
- Serialize same-tenant imports or other collision-prone workflows when needed.
- Do not enumerate foreign records or leak stack traces, secrets, PHI, or
  provider payloads.
- Verify webhook/provider signatures and replay behavior. Keep a provider
  unavailable when its complete reviewed configuration is absent; never report
  fake delivery/success.
- Retention must preserve financial/audit history and dependency integrity.
  Permanent or destructive bulk mutation requires an explicit accepted
  product/security decision.
- Do not weaken an assertion, auth contract, or production gate merely to make
  a test pass. Fix product defects or clearly identified test-harness defects.

Database and release rules

- Use only a new isolated disposable PostgreSQL database for tests.
- Add schema through the ordered idempotent release manifest in
  `apps/api/src/lib/database-release-contract.ts`.
- Do not run imported child migrations or `drizzle-kit push`.
- Include constraints, tenant predicates, indexes, transaction boundaries,
  audit fields, clean-database coverage, idempotent reapply, and rollback notes.
- Never apply to production or persistent developer data without explicit
  approval and a verified backup.

Verification gates

Run focused checks after each behavior cluster, then finish with the broadest
relevant gates. Use the repository’s actual commands and record exact
pass/fail/skip counts.

Minimum closure evidence:

1. Ledger verifier: zero gaps and zero unclassified items.
2. Focused parser/static/unit tests.
3. Isolated PostgreSQL workflow proving:
   - create/read/update/lifecycle and restart persistence;
   - viewer/read-only denial;
   - tenant-admin/operator role behavior;
   - foreign-tenant non-enumeration;
   - stale-version rejection;
   - exact idempotent replay and changed-body/key rejection where applicable;
   - transaction rollback and financial/reference reconciliation.
4. Clean and idempotent database release apply.
5. Workspace typecheck.
6. Production build for API, runner gateway, SDK, and web.
7. Configured production preflight.
8. Readiness-gated compiled supervisor start plus `/healthz` and `/readyz`.
9. Exact-host browser E2E through production artifacts proving:
   - OperatorOS login and exact PKCE return;
   - entitlement and role enforcement;
   - primary value workflow with real persisted data;
   - deep-link refresh and reopen from My Apps;
   - return navigation and global/local logout behavior;
   - no credentials in URLs or browser storage;
   - desktop and 390-pixel mobile usability/no horizontal overflow.
10. Cleanup: remove test users/data, generated bundles/reports, listeners,
    proxies, and disposable containers. Leave a clean working tree.

Use these authoritative root commands where applicable:

```powershell
$env:CI='true'; corepack pnpm install --frozen-lockfile
corepack pnpm typecheck

# Use only a disposable PostgreSQL URL and non-production test secrets.
$env:APP_ENV='test'; $env:NODE_ENV='test'
corepack pnpm --dir apps/api test

$env:INTERNAL_API_URL='http://localhost:5001'
corepack pnpm build:production
corepack pnpm preflight:production -- --core
corepack pnpm db:plan

# Apply only to the disposable database.
$env:OPERATOROS_DATABASE_RELEASE_MODE='apply'
corepack pnpm db:apply
corepack pnpm db:apply

node scripts/start-unified-runtime.mjs
corepack pnpm --dir apps/web test:e2e:sso:proxy
$env:E2E_PRODUCTION_HOSTS='1'
corepack pnpm --dir apps/web test:e2e:sso
```

Add and run a focused `[MODULE_SLUG]` browser workflow rather than relying only
on the shared SSO suite. Do not claim lint or formatting passed because this
repository currently defines neither as a release gate.

Secrets and Replit handoff

- Do not wait for or invent secrets to finish source/local functionality.
- Add only environment variable names, purpose, required/optional status, and
  fail-closed behavior to `.env.example` and the environment documentation.
- Leave real values for Replit Publishing secrets.
- Core secrets normally include `DATABASE_URL`, `SESSION_SECRET`, and
  `SSO_CODE_ENCRYPTION_SECRET`; seed/provider/billing/AI secrets are conditional
  on the reviewed module and release configuration.
- Non-secret canonical URLs and mode flags must still be documented and pass
  preflight with disposable values.
- Live-provider acceptance, deployed SSO/workflow, production backup/export/
  apply, DNS, and traffic cutover remain explicit human gates.

Documentation and delivery

Before committing, update:

- `docs/IMPLEMENTATION_STATUS.md`
- `docs/MODULE_CONSOLIDATION_STATUS.md`
- `docs/modules/MODULE_PARITY_INDEX.md`
- `docs/modules/[MODULE_SLUG]/PARITY_MATRIX.md`
- the module source ledger and verifier
- `docs/CROSS_MODULE_READINESS_REPORT.md`
- `docs/FINAL_E2E_ACCEPTANCE_REPORT.md`
- `PLANS.md`
- env/migration/cutover documentation when affected

Record:

- source path and exact commit;
- inventory and final disposition counts;
- active workflows and accepted exclusions;
- tables/release steps, routes, UI surfaces, and provider boundaries;
- exact commands, environment type, pass/fail/skip counts, and runtime/browser
  results;
- deployment secrets by name only;
- remaining human gates and rollback/cutover risks.

Commit only after code, ledger, documentation, and fresh evidence agree. Do not
push, deploy, publish, mutate production data, or promote the module to state 5
without explicit authorization.

Definition of done

Do not return a completion claim until all statements below are true:

- The best recoverable product source is commit-pinned and fully inventoried.
- The executable ledger reports zero gaps and zero unclassified items.
- Every omitted legacy capability has a documented accepted disposition.
- The shortest value workflow and every approved supporting surface are real,
  tenant-scoped, persistent, authorized, responsive, and non-placeholder.
- Clean database release, focused security/persistence tests, typecheck,
  production build, configured preflight, compiled health/readiness, and
  exact-host module browser acceptance pass.
- Required environment names and fail-closed behavior are documented without
  secret values.
- Temporary data, processes, containers, and generated artifacts are removed.
- Status/parity evidence matches the implementation.
- The final response clearly separates:
  1. completed source/local functionality;
  2. intentionally excluded capabilities;
  3. Replit secrets/provider setup;
  4. deployment/cutover gates.

If a real blocker remains, exhaust safe in-scope alternatives first. Report a
blocker only when it genuinely requires a product-owner decision, external
provider state, production authority, or a change outside the approved module
boundary.
```

## Recommended module order

Apply the template to the highest-value incomplete module first, using the
current parity index rather than assumptions. A practical default is:

1. Core paid modules with incomplete source/local functionality.
2. Add-ons with clear source provenance and direct monetization value.
3. Free/community modules that improve ecosystem acquisition.
4. Provider-dependent modules after their safe local/test adapter workflow is
   complete.

Do not run concurrent schema restoration phases against the shared database
release manifest. Read-only archaeology may happen in parallel, but land and
verify one module’s schema/runtime changes at a time.
