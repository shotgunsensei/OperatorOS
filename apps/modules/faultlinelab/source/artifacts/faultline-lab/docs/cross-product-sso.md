# Cross-Product Clerk SSO — Design Exploration

Status: Exploratory (no code changes proposed in this doc)
Owner: Faultline Lab platform
Last updated: 2026-05-03

## 1. Background

The Shotgun Ninjas family of products currently authenticates users
independently:

- TorqueShed
- TradeFlowKit
- TechDeck
- PulseDesk
- ShotgunNinjas
- ShotgunNinjaVillage
- Faultline Lab (this app)

Each product has its own sign-in surface. A user who already pays for, say,
TradeFlowKit must create a fresh account on Faultline Lab before they can
even click around. Cross-promo links are essentially "create another
account" funnels, which is a meaningful drag on conversion.

Faultline Lab's auth today (relevant code):

- `artifacts/api-server/src/middlewares/requireAuth.ts` — server-side
  Clerk session check via `@clerk/express` `getAuth(req)`. Pulls
  `userId` out of `sessionClaims.userId` (custom claim) or falls back
  to `auth.userId`.
- `artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts` —
  proxies the Clerk Frontend API at `/api/__clerk` so Clerk works on
  `*.replit.app` and custom domains without DNS changes. Active only
  when `NODE_ENV === "production"` and `CLERK_SECRET_KEY` is set.
- `artifacts/faultline-lab/src/lib/entitlements.ts` — local entitlement
  state (Pro flag, owned product IDs, admin flags). Hydrated per
  signed-in user; not coupled to Clerk's identity model except via the
  `userId` it's keyed under.
- React surfaces using Clerk: `App.tsx`, `AuthScreen.tsx`,
  `SettingsScreen.tsx`, `IncidentBoard.tsx`, `AdminPanel.tsx`,
  `admin/UsersTab.tsx`, `store/ProductDetail.tsx`.

We assume the sibling products are in similar shape: Clerk-based,
each with its own Clerk application instance, each with its own user
table keyed on a Clerk user ID.

## 2. Goal

Make signing into one Shotgun Ninjas product transparently sign the
user into the others, so cross-promo links land on a logged-in
experience instead of a sign-up wall — without merging product data
or losing per-product entitlements.

Non-goals (this doc):

- Implementing the change.
- Touching production Clerk instances.
- Unifying billing or entitlement models across products.

## 3. Options considered

We evaluated the three Clerk-supported patterns that can yield SSO
across multiple apps.

### Option A — Single shared Clerk application across all products

All seven products point at the **same** Clerk application
(`pk_live_…` / `sk_live_…`). Each product is a separate web origin but
shares the Clerk session because Clerk's session cookie is set on a
shared parent domain.

How it works:

- One Clerk application. One user directory. One set of social
  connections (Google, GitHub, Apple…) configured once.
- Clerk session cookie scoped to a shared eTLD+1 (e.g.
  `.shotgunninjas.com`) — possibly via the existing Clerk frontend
  proxy on each product's own subdomain.
- Each product still has its own backend, its own user-profile row,
  its own entitlement state, all keyed on the shared Clerk `userId`.

Pros:

- Cleanest UX. Sign in once, you're in everywhere. No redirect dance.
- Cheapest to operate: one set of OAuth credentials, one branding
  surface, one place to manage abuse / bans.
- Server middleware (`requireAuth`) needs no real change — the
  `userId` from `getAuth(req)` is already the same identity the user
  uses on TorqueShed, etc.
- Plays well with the existing `clerkProxyMiddleware` model: each
  product keeps proxying Clerk FAPI through its own `/api/__clerk`
  path, but the cookie is set on the shared parent domain.

Cons / risks:

- **Requires all products to live under one shared registrable
  domain** (e.g. `*.shotgunninjas.com`). Products on bespoke domains
  (`faultlinelab.com`, `tradeflowkit.io`) would need to move to a
  subdomain *or* keep separate auth. Cookies cannot legally span
  unrelated eTLD+1s.
- One Clerk MAU pool. Pricing tier jumps apply across the whole
  family, not per product. Pricing model needs review (see §6).
- One blast radius for security incidents (compromised social
  connection, leaked secret key, etc.).
- Migration: existing Faultline Lab users in the *Faultline Lab Clerk
  app* must be exported and re-imported into the shared app, or
  reconciled by email at first login. User IDs change → every row
  keyed by `clerk_user_id` in our DB needs a remap step.
- Per-product user metadata (Pro flag, admin flag) lives in our DB,
  not Clerk, so it has to be remapped during the user-ID migration.
  This is doable but requires a one-time backfill per sibling product
  that opts in.

### Option B — Shared Clerk **organization** + per-product apps via OIDC

Each product keeps its own Clerk application, but they federate via
OIDC. One product (or a dedicated "Shotgun Ninjas ID" Clerk app)
becomes the identity provider; the others register it as an OIDC
connection and present "Continue with Shotgun Ninjas".

How it works:

- Identity provider = central Clerk app at e.g. `id.shotgunninjas.com`.
- Each consumer product adds an "Enterprise / OIDC" connection
  pointing at the IdP.
- Sign-in flow: user clicks "Continue with Shotgun Ninjas" →
  redirects to IdP → if signed in there, returns immediately with a
  token → consumer Clerk app provisions or links a local user.

Pros:

- No requirement that products share a domain. Faultline Lab can stay
  on its own domain; only the IdP needs a stable home.
- Each product keeps its own MAU bucket and its own Clerk admin
  surface. Independent blast radius.
- Migration is incremental. Existing Faultline Lab accounts can be
  preserved; "Continue with Shotgun Ninjas" is added as a new social
  connection alongside email/Google. Users can link accounts on next
  login (Clerk supports email-based account linking).

Cons / risks:

- Worse UX than Option A. Even when "already signed in to the IdP",
  the user sees a redirect flicker. The cross-promo "you're already
  in" magic only really lands if the user clicks the SSO button.
- More moving parts: an extra Clerk app to maintain, plus seven OIDC
  connections to keep in sync.
- Cost: the IdP burns its own MAU on every login redirect, on top of
  the consumer app's MAU.
- "Continue with Shotgun Ninjas" requires a sibling product to
  already exist for the user. New users gain nothing.

### Option C — Shared application via Clerk Organizations

Use one Clerk app, and represent each product as a **Clerk
Organization**. Users belong to multiple orgs; the active org gates
which product they're "in".

Pros:

- Native Clerk concept. RBAC / billing per-org is a thing.

Cons:

- Orgs are designed for B2B tenancy, not for "this user owns these
  consumer products." We'd be smuggling per-product entitlements
  into org membership, which our entitlements layer
  (`entitlements.ts`) is not modeled for.
- Still requires shared-domain cookie strategy from Option A to be
  *seamless*; otherwise it degrades to Option B.
- All the cons of Option A (shared MAU, shared blast radius) plus
  conceptual mismatch.

We do not recommend Option C. It is listed for completeness.

## 4. DNS & cookie implications

This is the load-bearing constraint.

- A browser cookie can be scoped to an eTLD+1 (`shotgunninjas.com`)
  and shared by all subdomains (`faultline.shotgunninjas.com`,
  `torque.shotgunninjas.com`, …). It **cannot** be shared with
  `tradeflowkit.io`.
- Clerk's session cookie behavior is configured per Clerk
  application. With Clerk's frontend proxy (already in use here, see
  `clerkProxyMiddleware.ts`), the cookie is set on the apex of
  whatever domain the proxy is mounted on.
- Replit dev: every artifact lives under `*.replit.dev` /
  `*.replit.app`. Those *do* share an eTLD+1, but it's a public
  suffix-list domain — browsers refuse to set cookies on it. So
  cross-product SSO cannot be tested end-to-end on raw Replit
  preview URLs; it requires the products to be deployed on a shared
  custom domain.

Implication for Option A: it is gated on the business decision to
park all seven products under one shared registrable domain
(typically `*.shotgunninjas.com`). If that decision is "no", Option B
is the only path.

## 5. Migration path for existing Faultline Lab users

Two scenarios.

### 5a. If we adopt Option A (shared Clerk application)

1. Stand up the shared Clerk application in **staging**. Configure
   the same social providers Faultline Lab uses today.
2. Export Faultline Lab's current Clerk users (Clerk dashboard /
   Backend API → users.list). Re-import into the shared app. Clerk
   preserves email, but issues new `user_xxx` IDs.
3. Build a one-time mapping table `old_clerk_id → new_clerk_id`
   keyed on email. For every table in our DB that references a
   Clerk user ID (profile rows, Stripe customer mapping, owned
   products, admin flags), run a backfill that swaps the IDs.
4. Cut over: switch `CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY`
   env vars in production to the shared application. Re-deploy
   `api-server` and `faultline-lab`.
5. On first login post-cutover, users see the same email/social
   options and land on the same data. Sessions established under
   the old app are invalidated; users sign in once.

Risks:

- Email collisions across sibling products (a user has the same
  email on TorqueShed and Faultline Lab) → in the shared app they
  become one identity, but each product's DB still has its own
  profile row. This is what we want, but the merge has to be
  explicit.
- Users who signed up via "magic link only" need a working email at
  cutover.
- Stripe customer IDs are unaffected (they're keyed on our DB row,
  not directly on Clerk ID), but the Stripe ↔ user mapping must be
  refreshed during the backfill.

### 5b. If we adopt Option B (OIDC federation)

1. Stand up the central "Shotgun Ninjas ID" Clerk app.
2. In the Faultline Lab Clerk app, add an OIDC connection pointing
   at the IdP. Enable it as a sign-in option.
3. Users continue to sign in with their existing email/password or
   social. New "Continue with Shotgun Ninjas" button appears.
4. When a user signs in via the IdP using an email that already
   exists in Faultline Lab, Clerk's account-linking links them; no
   data migration needed.
5. No DB backfill is required because Faultline Lab keeps its
   existing `clerk_user_id` values.

Risk: lower adoption of the SSO path because it's opt-in per login
unless we make it the only sign-in option.

## 6. Rough effort estimate per sibling product

Assumes each sibling product has a Clerk-based auth surface roughly
similar to Faultline Lab's.

| Product           | Option A effort | Option B effort |
|-------------------|-----------------|-----------------|
| TorqueShed        | M (~1 wk)       | S (~2 days)     |
| TradeFlowKit      | M (~1 wk)       | S (~2 days)     |
| TechDeck          | M (~1 wk)       | S (~2 days)     |
| PulseDesk         | M (~1 wk)       | S (~2 days)     |
| ShotgunNinjas     | M (~1 wk)       | S (~2 days)     |
| ShotgunNinjaVillage | M (~1 wk)     | S (~2 days)     |
| Faultline Lab     | M (~1 wk)       | S (~2 days)     |

Plus shared/one-time work:

- Option A: ~1 week for the shared Clerk app setup + the
  ID-remapping backfill tooling, then a coordinated cutover window.
  Adds shared-domain DNS work that may be larger than the code work.
- Option B: ~3–5 days to stand up the IdP Clerk app, plus a small
  shared "Continue with Shotgun Ninjas" branding kit.

Sizes are deliberately rough; the real cost is the per-product DB
backfill (Option A) or the per-product UX of the SSO button (Option
B).

## 7. Recommendation

**Recommended: Option B (OIDC federation via a central Shotgun
Ninjas ID Clerk app).**

Reasoning:

- It does not require all products to live under one registrable
  domain. Several siblings already have their own brand domains,
  and forcing them under `*.shotgunninjas.com` is a marketing /
  business decision that shouldn't be blocked on auth.
- Migration is non-destructive. We don't have to remap Clerk user
  IDs in any product's DB. Existing Faultline Lab users keep their
  accounts; the SSO button is purely additive.
- It scales product-by-product. We can light it up on Faultline Lab
  + one sibling first, measure cross-promo conversion lift, and
  decide whether to roll it to the rest.
- If we later decide we *do* want the seamless single-cookie UX of
  Option A, Option B is not a dead end — the central Clerk app
  becomes the obvious candidate to graduate into the shared
  application.

Option A is strictly better UX, but it's gated on a domain decision
and on a DB-backfill migration in every sibling product. That's a
larger commitment than this exploratory phase warrants.

## 8. Next concrete step to validate the recommendation

Build a **non-production proof of concept** of Option B between
Faultline Lab staging and one sibling product (suggest TorqueShed,
since it's the largest cross-promo target):

1. Create a throwaway "Shotgun Ninjas ID — staging" Clerk
   application.
2. In Faultline Lab's *staging* Clerk application, add it as an OIDC
   connection. Add a "Continue with Shotgun Ninjas" button to
   `AuthScreen.tsx` behind a feature flag.
3. Do the same in TorqueShed staging.
4. Manually verify: sign in to TorqueShed staging with a fresh
   email; click the Faultline Lab cross-promo link; confirm the
   "Continue with Shotgun Ninjas" button signs you in without
   re-entering credentials and that account-linking works on the
   Faultline Lab side.
5. Measure friction (clicks, redirect time, account-link conflicts)
   and write up a go/no-go.

Production Clerk instances are not touched at any point in this
validation step.
