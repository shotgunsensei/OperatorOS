# Faultline Lab

## Overview

Faultline Lab is a cinematic browser-based troubleshooting simulator for technical minds. Users investigate broken systems across IT infrastructure, networking, automotive diagnostics, and smart electronics. The app is a fully interactive simulation with optional authentication, cloud sync, and purchasable content packs.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + Tailwind CSS v4
- **State management**: Zustand
- **Animations**: Framer Motion
- **Charts**: Recharts
- **Persistence**: localStorage (guest mode) + PostgreSQL cloud sync (signed-in users)
- **Auth**: Clerk (optional, gated by `VITE_CLERK_PUBLISHABLE_KEY`)
- **API framework**: Express 5 (api-server handles profile sync, entitlements, Stripe)
- **Payments**: Stripe (via Replit connector + stripe-replit-sync)
- **Icons**: Lucide React
- **Toasts**: Sonner
- **PWA**: Service worker + manifest.json (prod-only registration)

## Architecture

### Dual-mode operation
- **Guest mode**: Full game logic runs client-side with localStorage persistence. No auth required.
- **Signed-in mode**: Clerk auth enables cloud sync (profile, settings, case states), entitlement management, and Stripe purchases.

### Key Directories
- `artifacts/faultline-lab/src/types/` — TypeScript domain model
- `artifacts/faultline-lab/src/data/cases/` — Case definitions (4 MVP cases, all authored via the framework) + typed `registry.ts` (`CASE_DEFINITIONS` map)
- `artifacts/faultline-lab/src/data/cases/authoring/` — Case Authoring Framework (schema, helpers, validation, per-domain templates)
- `artifacts/faultline-lab/src/data/caseCatalog/` — Catalog spine: 56 entries with status/access/source-product mapping, validation, and selectors
- `artifacts/faultline-lab/scripts/generate-og.ts` — Build-time per-case OG image + share-stub generator (runs as `prebuild`). Emits `public/og/case-<slug>.png` and `public/case/<slug>/index.html` with full OG/Twitter meta + redirect to the SPA. Generated dirs are gitignored.
- `artifacts/faultline-lab/src/data/catalog.ts` — Product catalog (14 products: tiers, packs, upgrades, bundles)
- `artifacts/faultline-lab/src/lib/simulation.ts` — Simulation engine
- `artifacts/faultline-lab/src/lib/persistence.ts` — localStorage persistence layer
- `artifacts/faultline-lab/src/lib/entitlements.ts` — Entitlement engine (isCaseAccessible, hasFeature, hasEntitlement)
- `artifacts/faultline-lab/src/lib/api.ts` — API client for cloud sync/entitlements
- `artifacts/faultline-lab/src/stores/useAppStore.ts` — Zustand store
- `artifacts/faultline-lab/src/components/` — UI components
- `artifacts/faultline-lab/src/components/CloudSyncProvider.tsx` — Cloud sync with debounced saves and caseState merge
- `artifacts/api-server/src/` — Express API server
- `artifacts/api-server/src/routes/profile.ts` — Profile CRUD + entitlements endpoint
- `artifacts/api-server/src/routes/stripe.ts` — Stripe checkout, products, subscription endpoints
- `artifacts/api-server/src/stripeClient.ts` — Stripe client via Replit connector
- `artifacts/api-server/src/stripeStorage.ts` — Stripe data queries from stripe-replit-sync schema
- `artifacts/api-server/src/webhookHandlers.ts` — Stripe webhook processing
- `artifacts/api-server/src/lib/subscriptionRenewalNotices.ts` — Daily job that
  emails subscribers a few days before `current_period_end` (T-5 renewal heads-up
  for auto-renewing subs, T-3 and T-1 expiration warnings when
  `cancel_at_period_end` is true). Idempotent via the
  `subscription_renewal_notices` table (unique on `subscriptionId + periodEnd + kind`);
  failed sends release the claimed slot so the next scan retries.
- `artifacts/api-server/src/lib/email.ts` — Tiny Resend-based transactional
  email sender. Requires `RESEND_API_KEY` (and optional `RESEND_FROM_EMAIL`)
  to actually deliver; otherwise logs and reports `delivered: false` so the
  renewal job releases the slot for a later retry.
- `lib/db/` — Shared Drizzle ORM package (@workspace/db)
- `lib/db/src/schema/users.ts` — Users, profiles, entitlements, purchases tables
- `scripts/src/seed-products.ts` — Script to create Stripe products from catalog

### Entitlement System
- **OperatorOS-owned for signed-in users.** When `authSource === "operatoros"`,
  entitlements are sourced from the SSO token snapshot
  (`users.entitlement_snapshot_json`) and refreshed via
  `POST /api/operatoros/entitlements/sync`. The `/store` and `/pricing`
  screens render `ManagedByOperatorOS` instead of any local checkout UI.
  `users.local_role` is derived from the snapshot:
  `module_admin → admin`, `module_user → standard`, `viewer → read-only`,
  `none` / disabled module / `access_level=denied` → `deny`. `deny` users
  hit HTTP 403 on protected routes and are routed to `AccessDeniedScreen`.
- **Guest / Clerk legacy path** still uses the local catalog below.
- `FREE_CASE_IDS`: the four built-in starter case IDs (`case-windows-ad-001`,
  `case-networking-vpn-001`, `case-automotive-001`, `case-electronics-001`).
  As real pack-exclusive cases are authored, they go into the corresponding
  pack's `includedCaseIds` instead of this list.
- `base-free` product owned by all users
- Content packs, feature upgrades, and bundles are `coming-soon` in catalog
- `isCaseAccessible()` is **fail-closed**: a case is accessible only if it's
  in `FREE_CASE_IDS`, the user has Pro, or it's listed in `includedCaseIds`
  on a product the user owns (directly or via bundle). Unknown / unmapped
  cases are locked.
- `getReadyCaseCount(product)` and `getCaseCountLabel(product)` derive
  case-count copy from the actual `includedCaseIds.length`. Storefront shows
  honest copy like "1 of 5 ready" or "5 cases planned" instead of advertising
  inventory that doesn't exist.
- Locked cases show Lock icon with amber styling on IncidentBoard, redirect to Store
- **Mock billing**: the dev-mode local-grant fallback in `StoreScreen` only
  fires when both `import.meta.env.DEV` *and* `VITE_MOCK_BILLING=1`. It never
  runs in production builds, and it no longer fires on transient checkout
  errors when Stripe is genuinely configured.

### Admin & Super Admin
- Two roles on the `users` table: `is_admin` (catalog overrides + entitlement
  grants/revokes) and `is_super_admin` (everything admin can do, plus
  promote/demote other users and delete users).
- Bootstrap: emails listed in `BOOTSTRAP_SUPER_ADMIN_EMAILS` (hardcoded in
  `artifacts/api-server/src/lib/userSync.ts`) are auto-promoted to super admin
  on row creation OR on the first request where their email becomes known
  (Clerk lookup) AND they have never been promoted before. After that the
  role is fully mutable — a super admin can demote a bootstrap account and
  the demotion will stick. To add another bootstrap email, edit that constant
  and redeploy. Existing super admins can also promote others through the UI
  with no code change.
- The user row + email + role bootstrap runs lazily inside `ensureUserRow()`
  on every `/api/profile` PUT and `/api/entitlements` GET. Email is fetched
  from Clerk via `clerkClient.users.getUser`. If the Clerk lookup fails the
  request still succeeds (with email still null) — bootstrap retries on the
  next request.
- Self-protection: a super admin cannot demote or delete themselves. They can
  demote/delete any other user. Admin demotion automatically revokes super
  admin (you can't be super without being admin).
- Routes: `PATCH /api/admin/users/:id/role { isAdmin?, isSuperAdmin? }` and
  `DELETE /api/admin/users/:id`, both gated by `requireSuperAdmin`. Deletes
  cascade to user_profiles, user_entitlements, and purchases via FK.

### OperatorOS SSO
- Faultline Lab is launchable as a child app inside OperatorOS. The api-server
  owns `GET /sso?token=<JWT>&returnTo=...` (artifact.toml routes `/sso` to
  api-server alongside `/api`). On success the user gets an HMAC-signed
  `fl_session` cookie and is redirected to `?sso=ok`; on failure to
  `?sso=error&reason=<code>`.
- HS256 verification (`lib/operatorOsSso.ts`) enforces alg, iss, aud
  (lowercased), `module_slug` (lowercased; must equal both `aud` and the
  configured audience), env, iat freshness in **both** directions
  (max 90s old, max 5s future), exp, jti/sub presence, then performs a
  **mandatory** `POST {OPERATOROS_API_URL}/v1/modules/sso/consume` for
  single-use enforcement. Network/5xx → HTTP 502.
- Required env: `MODULE_SSO_SECRET` (≥16 chars), `OPERATOROS_BASE_URL`,
  `OPERATOROS_SSO_AUDIENCE` (= `faultlinelab`), `OPERATOROS_SSO_ENV`,
  `OPERATOROS_API_URL`. Hard-fails on boot in production when missing; in
  dev `/sso` returns 503 with a warning.
- Coexists with Clerk: `requireAuth` / `optionalAuth` resolve `req.appUser`
  from either the `fl_session` cookie OR Clerk, and set `req.userId` to the
  local `users.id`. Routes (`profile`, `entitlements`, `admin`, `stripe`,
  `crossPromo`) now query users by app id, not `clerkId`.
- New `users` columns: `operator_identity_id` (unique, = JWT `sub`),
  `operator_plan_slug`, `operator_organization_id`, `operator_role`,
  `operator_last_launch_at`. `ensureOperatorOsUserRow` upserts on relaunch.
- Client surface: `GET /api/me`, `POST /api/logout`,
  `lib/ssoLanding.ts` consumes `?sso=` query and shows a Sonner toast.
  Bootstrap super-admin emails apply to OperatorOS users too.
- Reference: `artifacts/faultline-lab/docs/operatoros-sso.md`.
- Tests: `artifacts/api-server/src/routes/sso.test.ts` (18 cases — happy
  path, missing token, wrong secret, alg=none, expired, future iat, wrong
  issuer/audience/module/env, replay, 502 unavailable, full consume API
  matrix, relaunch upsert).

### Account Linking (Clerk ↔ OperatorOS)
- A single human who signs in via both methods can unify their two `users`
  rows into one shared account with merged entitlements, profile, and
  purchases.
- Server: `mergeUserRows(primary, other)` in `userSync.ts` runs in a single
  DB transaction — nulls unique identity cols on `other`, copies missing
  identity fields onto `primary`, ORs admin flags, picks the profile with
  the newer `lastActiveAt`, reassigns entitlements (dropping active
  duplicates by `(entitlementType, productId)`), reassigns all purchases,
  then deletes `other`.
- New routes (`artifacts/api-server/src/routes/account.ts`, mounted under
  `/api`):
  - `GET /api/account/identities` — returns linkage state for the current
    account.
  - `POST /api/account/link` — if the request also carries a Clerk session
    that resolves to a different local row, merges the Clerk row into the
    currently-authenticated row. Returns 409 if a different Clerk login is
    already linked.
  - `POST /api/account/unlink { identity }` — nulls the `clerk_id` or all
    `operator_*` columns. Refuses when only one identity is linked or when
    you'd unlink the identity you're currently signed in with. Unlinking
    OperatorOS also clears the `fl_session` cookie.
- The `/sso` landing route now also performs link-on-arrival: if a Clerk
  session is present when an OperatorOS launch lands, the freshly-ensured
  OperatorOS row is folded into the Clerk row before the session cookie is
  set. This is the inverse direction (OperatorOS → Clerk) of the
  `/api/account/link` endpoint.
- Client: `AccountScreen` shows a "Linked Sign-In Methods" section with
  per-method link/unlink buttons. Linking Clerk pops the Clerk modal and
  then polls `/api/account/link`; linking OperatorOS is done by launching
  Faultline Lab from the OperatorOS shell while signed in here. The button
  for the currently-active identity is disabled to prevent self-lockout.

### Cloud Sync
- CloudSyncProvider wraps app content when Clerk is available
- On sign-in: fetches profile, settings, caseStates from cloud; merges with local (newer wins by lastActiveAt)
- On changes: debounced 2s save to cloud
- On sign-out: resets entitlements to free defaults

### Case Structure
Each case has terminal commands, event logs, ticket history, evidence items, 4-tier hints, root cause evaluation, score breakdown, and full debrief.

### Case Catalog
- `data/caseCatalog/entries.ts` is the single source of truth for every case the app advertises (56 entries: 4 playable, 52 planned).
- Each `CaseCatalogEntry` carries `sourceProductId`, `requiredEntitlements`, `status` (`playable` / `planned`), `accessModel`, and preview metadata used by IncidentBoard, StoreScreen, and ProfileScreen.
- `data/caseCatalog/validation.ts` runs at app boot (via `App.tsx`) and asserts FREE_CASE_IDS ↔ `isStarter` sync, product-case derivation invariants, and that every playable entry resolves to a `CaseDefinition`.
- `data/cases/registry.ts` exports `CASE_DEFINITIONS`, the typed map keyed by case id that resolves catalog entries to runnable game logic.

### Case Authoring Framework
The framework lives at `data/cases/authoring/` and is the supported way to add new cases.

- `schema.ts` defines `CaseDraft` (author-facing shape — like `CaseDefinition` but with author-time defaults) and `AuthoringIssue` / `AuthoringResult` (validator output).
- `helpers.ts` exports composition helpers (`symptom`, `rootCause`, `evidence`, `command`, `eventLog`, `ticket`, `hintLadder`) plus `composeCase(draft)` which validates and lifts a draft into a `CaseDefinition` (or throws with actionable issues).
- `validate.ts` enforces: required identity fields, ≥2 symptoms, ≥4 evidence items, exactly 4 hint tiers with strictly increasing penalties, all `revealsEvidence` ids point at real evidence, every clue/critical evidence is reachable from at least one command/event/ticket, tool variety on advanced/expert cases, `maxScore === 100`.
- `templates.ts` exports `createTemplate(domain, opts)` for seven domains: `windows-ad`, `networking`, `servers`, `automotive`, `electronics`, `mixed`, `healthcare-imaging`. Each template returns a draft that already passes the validator with placeholder content so authors get green-on-load.

#### Reference case
All four MVP cases (`windows-ad-case.ts`, `networking-vpn-case.ts`, `automotive-case.ts`, `electronics-sensor-case.ts`) are authored through `createTemplate` + `composeCase` — no raw `CaseDefinition` literals remain in the repo. **`windows-ad-case.ts` is the canonical reference**: it shows the spread-and-override pattern, full evidence/command/event/ticket cross-referencing, and a 4-tier hint ladder. Copy it verbatim when bootstrapping a new case.

#### How to add a new case
1. Pick a catalog entry from `data/caseCatalog/entries.ts` (or add one) and note its `id` and `sourceProductId`.
2. Create a new file under `data/cases/`, e.g. `data/cases/networking-bgp-flap-case.ts`.
3. Start from a template:
   ```ts
   import { composeCase, createTemplate } from './authoring';

   const draft = createTemplate('networking', {
     id: 'case-networking-bgp-flap-001',
     slug: 'bgp-flap',
     title: 'Phantom BGP Flap',
     difficulty: 'advanced',
   });
   // Replace placeholder content on draft.symptoms / evidence / commands / etc.
   export const bgpFlapCase = composeCase(draft);
   ```
4. Register the case in `data/cases/registry.ts` so the engine can resolve it.
5. Update the catalog entry's `status` from `planned` → `playable` and set `implementationRef` to the case id.
6. The boot-time validator in `App.tsx` will fail loudly if anything is misaligned.

### MVP Cases
1. **Domain Authentication Failure** (Windows/AD) — Kerberos time skew
2. **Phantom VPN Tunnel** (Networking) — Phase 2 proxy ID mismatch
3. **Unstable Idle Ghost** (Automotive) — Failing alternator voltage regulator
4. **Mesh Network Phantom** (Electronics) — Firmware bug + degraded capacitor

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/faultline-lab run dev` — run Faultline Lab dev server
- `pnpm --filter @workspace/api-server run dev` — run API server
- `pnpm --filter @workspace/db run push` — push DB schema changes
- `bash scripts/run-stripe-e2e.sh` — runs `test-stripe-flow` end-to-end against the test-mode Stripe Connector. Probes api-server health, re-seeds Stripe products (idempotent), then runs the test. Also invoked automatically from `scripts/post-merge.sh` on every task merge (with `POST_MERGE=1`, which makes it exit 0 with a warning when the API Server workflow is down so paused dev workspaces never block a merge). Refuses to run in production deployments. The api-server's dev env in `artifacts/api-server/.replit-artifact/artifact.toml` sets `ENABLE_E2E_AUTH_BYPASS=1` so the bypass token is written on boot with no operator setup.

## Design System
- Dark background: `#0a0e14`
- Accent: cyan-400 (`#22d3ee`)
- Font: JetBrains Mono (monospace terminal aesthetic)
- No emojis in UI
- Mobile-first responsive (breakpoints: sm, lg for sidebar collapse)
- Minimum 40x40px touch targets on mobile
- Terminal font default: 16px (prevents iOS auto-zoom)
