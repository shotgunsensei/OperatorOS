# Browser authentication and organization response ownership

Base: `acbeb7ddcef90f7587046aad244fa8c6522cd14f`, tree
`ea2e5e1e5843636048fe45bb711ce999b006df0c`. The invoice follow-up source is
preserved. This repair changes client response ownership, not server authority.

## Reproduction and reachability

The immutable base's real bundled AuthProvider/TenantProvider, real React and
real `auth.ts` request wrapper were exercised with intercepted synthetic HTTP.
Seven diagnostic cases establish three controls (authenticated sign-out,
anonymous 401, successful organization-switch reload) and four provider-level
stale response interleavings. A delayed `/auth/me` response can restore A after
logout or replace B after a subsequent login. A delayed `/me/tenants` response
can restore A's names, owner role and cached tenant after logout or B's login;
the next actual request wrapper then sends A's tenant header with B's synthetic
session. These four cases call context methods directly; they are not four
whole-application customer journeys.

A separate actual invitation UI case proves a reachable authentication trigger:

1. Account A views an invitation for synthetic account B. The existing mismatch
   message offers **Sign in as B**.
2. Advance the existing 30-minute renewal interval; synthetic renewal returns
   401, causing the actual provider to request `/auth/me`. Hold its A response.
3. Click the real account-switch button (inline logout), fill the real sign-in
   form and submit. The decision panel says **Signed in as B** and cache is B.
4. Deliver the old A response. On the base, the actual page returns to the
   account-mismatch message and cached tenant becomes A.

That case uses one document navigation, no forced context method calls, zero
external requests and zero page errors. No invitation is accepted and no real
account, session, password, provider or database is touched. Next routing/image
presentation is synthetic; this is client component behavior, not SSR/SSO proof.

Relevant callers/lifetimes were traced explicitly:

- `AuthProvider` mounts its initial read and renews on visibility/30-minute
  interval. `SettingsPage` invokes refresh after profile/password/email saves.
- `invites/[token]/page.tsx` calls logout and login/MFA/invite registration in
  the same provider/document. Its account-switch callback does not reload.
- Console `/app` keeps TenantProvider outside AppContent, including signed-out
  states. Suspended-page logout and account-deletion logout can stay in that
  document. Ordinary SaaS menu logout, global logout and MFA-disable paths
  navigate; their navigation mitigation is retained.
- `TenantSettingsPage` refreshes organization context after rename;
  `TenantSwitcher` refreshes after a gone-tenant switch error. My Apps and the
  picker use `switchTenant`, whose successful server call hard-reloads.
- `/apps/[slug]` unmounts TenantProvider when authentication becomes null.
  TradeFlowKit waits for auth/tenant loading and consumes that context. These
  mitigations limit claims about direct stale-state reachability in the module.

The ordinary successful organization switch was a positive control: two
document navigations, B selected with its viewer role, and the held A response
cannot replace the new document's context. This pass does not attribute a
normal-switch defect to that existing reload path.

## Bounded implementation

AuthProvider separates latest refresh-read order from explicit sign-in/sign-out
order. Pending explicit transitions suppress incidental reads/renewals; a late
read or old renewal 401 cannot supersede the explicit intent. Success, error,
finally and unmount paths all check ownership. Failed global logout still
rejects and retains the current identity; local logout keeps its existing
client-clear behavior on API failure. MFA challenge/finish and invitation
personal-tenant fallback remain intact.

An internal `captureIdentity(candidate)` predicate binds tenant work to the
provider's synchronous accepted identity object and monotonic lifetime revision.
This rejects an old closure even before a tenant rerender and distinguishes a
fresh login with the same user ID. Failed explicit operations do not advance
that accepted-identity lifetime. TenantProvider also enforces latest read order,
masks prior identity memberships during replacement, and guards awaited switch
completion/unmount. Cleanup invalidates owned tickets without clearing a new
provider's shared tenant cache.

Server sessions, cookies, auth endpoints, memberships, module entitlements,
tenant selection policy, SSO and provider configuration are unchanged. Actual
`tenant-auth.ts` revalidates membership and module-session binding per request;
TradeFlowKit routes compose membership/module/read/write guards. Stale client
labels or headers are not evidence of a server authorization bypass. This
repair does not order or undo concurrent server-side cookie/session mutations.

## Verification and limits

`auth-tenant-lifetimes.spec.ts` bundles the actual providers/request wrapper and
invitation page with existing dependencies. Every HTTP request is intercepted;
unexpected external requests or page errors fail. Same-document held responses
must be delivered with successful body completion, and started context jobs
are awaited before final assertions. Only the explicitly asserted hard reload
control permits a cancelled old-document interception, recording its result.

The final 44 cases cover stale success/error across logout/login/MFA/invite,
current headers, latest reads and stale finally, pending explicit intents,
failed global/local logout and login, same-ID relogin/old closures, unmount,
cold loading, ordinary same-account refresh, MFA challenge, invitation fallback,
super-admin member/foreign roles, valid/failed/stale switch and actual invite UI.
They run without retries in the standalone config. The spec is included in the
canonical release browser scope; existing release retries/gates are unchanged.

| Local check | Result |
| --- | --- |
| Immutable diagnostic provider cases | 3 controls passed; 4 stale interleavings reproduced |
| Actual invitation UI on immutable base | Reproduced old account/cache restoration |
| Same final durable spec against immutable base (source-loader root only) | 3 controls passed; invitation regression failed as expected after old response was delivered |
| Final durable browser suite | 44 passed, 0 failed, 0 skipped; 27.2 seconds |
| Strict spec/config TypeScript | Passed |
| Root zero-warning lint | Passed |
| Full `build:production` | Passed: four workspace typechecks, API/runner/SDK compile, 38 Next pages |
| `git diff --check` | Passed |

Commands (existing Node/pinned pnpm and cached Playwright browser):

```powershell
pnpm --dir apps/web exec playwright test --config playwright.auth-lifetime.config.ts --reporter=line
node apps/web/node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution bundler --esModuleInterop --skipLibCheck --types node apps/web/e2e/auth-tenant-lifetimes.spec.ts apps/web/playwright.auth-lifetime.config.ts
pnpm lint
$env:INTERNAL_API_URL='http://127.0.0.1:56109'
$env:NEXT_TELEMETRY_DISABLED='1'
pnpm build:production
```

Task evidence is under `evidence/OperatorOS/next-pass/auth-tenant-lifetimes/`:
exact source hashes, seven-case baseline, actual invitation UI receipt/screenshots,
durable baseline, final browser/strict/lint/build logs and consumer inventory.
The inventory identifies consumers; only the named provider, auth-changing
caller, module-gate and server-guard paths received this focused trace.

Existing task dependency junctions/cached Chromium were reused. Sandbox native
Chromium launch was unavailable; the same isolated browser tests ran with the
existing approved native runtime. Initial harness setup issues (package lookup,
browser build-time environment) were fixed before any behavior result counted.
No new packages, real API server, customer/account creation, credential changes,
database operation, provider call, payment or publication occurred.

Independent review and a fresh combined exact-head hosted release gate remain
required before source merge. Controlled deployed auth/organization/TradeFlowKit
acceptance remains separate; these synthetic client tests do not establish it.
