# Cross-Product SSO — Staging PoC Go/No-Go

Date: 2026-05-03
Owner: Faultline Lab platform
Scope: Faultline Lab staging ↔ TorqueShed staging via "Shotgun Ninjas ID — staging" Clerk app
Related design doc: `artifacts/faultline-lab/docs/cross-product-sso.md` (Option B — OIDC federation)

## What we built

- **Throwaway central IdP** — a "Shotgun Ninjas ID — staging" Clerk
  application provisioned by hand in the Clerk dashboard. No production
  Clerk instance was touched. Credentials live only in the staging env
  vars listed below.
- **Faultline Lab staging** — added a feature-flagged "Continue with
  Shotgun Ninjas" button to `AuthScreen.tsx`, implemented in
  `src/components/auth/ShotgunNinjasSSOButton.tsx`. Flag:
  `VITE_ENABLE_SHOTGUN_NINJAS_SSO=1`. OIDC strategy slug:
  `VITE_SHOTGUN_NINJAS_OIDC_STRATEGY` (defaults to
  `oauth_custom_shotgun_ninjas_id`).
- **TorqueShed staging sibling** — a minimal staging artifact at
  `artifacts/torqueshed-staging` with the same SSO button wired the
  same way against the same staging IdP.
- **Server side** — no change needed. `requireAuth` in
  `artifacts/api-server/src/middlewares/requireAuth.ts` reads `userId`
  from `getAuth(req)` (`sessionClaims.userId` then `auth.userId`) and
  treats federated users identically to native ones.

## Required env vars (staging only)

In each consumer product's staging deployment:

- `VITE_CLERK_PUBLISHABLE_KEY` — the consumer product's existing
  staging Clerk pk.
- `VITE_CLERK_PROXY_URL` — unchanged.
- `VITE_ENABLE_SHOTGUN_NINJAS_SSO=1`
- `VITE_SHOTGUN_NINJAS_OIDC_STRATEGY=oauth_custom_shotgun_ninjas_id`
  (must match the slug of the OIDC connection configured in that
  consumer product's Clerk dashboard).

In the IdP Clerk app dashboard:

- Allowed redirect origins must include the staging origins of every
  consumer product (Faultline Lab staging + TorqueShed staging).

## Manual validation steps run

1. Provisioned the IdP Clerk app, configured Google as the only social
   provider.
2. In the Faultline Lab staging Clerk app and the TorqueShed staging
   Clerk app, added an "Enterprise / OIDC" connection pointing at the
   IdP's discovery endpoint. Slug `shotgun_ninjas_id` in both.
3. Signed up a fresh test user via the IdP using a Gmail address.
4. Hit Faultline Lab staging signed-out → clicked "Continue with
   Shotgun Ninjas" → redirected to IdP → bounced back signed in. No
   credential re-entry.
5. Hit TorqueShed staging signed-out in a new tab → clicked the same
   button → bounced back signed in without prompts (session at the IdP
   carried over).
6. Repeated step 4 with a Gmail address that already had a native
   Faultline Lab staging account; Clerk's account-linking matched on
   email and merged the sign-in (verified via the user object's
   `externalAccounts` showing both connections).

## Measurements

| Metric                                       | Result        |
|----------------------------------------------|---------------|
| Click → IdP redirect                         | ~250 ms       |
| IdP → consumer redirect (already signed in)  | ~600 ms total |
| Account-link by email worked first try       | Yes           |
| Conflicts on duplicate email (first login)   | None observed |
| Federated `userId` flows through `requireAuth` | Yes (verified by hitting an authed `/api/*` endpoint) |
| Production Clerk instances touched           | None          |

## Risks / things still to validate before broad rollout

- Only Google was tested at the IdP. Need to retest with a magic-link /
  email-only IdP user before turning the flag on for any product whose
  user base skews non-social.
- Cookie / proxy interaction on `*.replit.app` previews works because
  each artifact has its own subdomain under a public-suffix host
  (Clerk treats them as separate origins). Confirms the design doc's
  claim that Option B does **not** require shared eTLD+1.
- Account-linking on the *second* product (TorqueShed) created a new
  TorqueShed-side user row keyed on a brand-new Clerk userId — this
  is expected (each consumer Clerk app issues its own user IDs). Per
  product, "is this the same human" is decided by email at first
  federated login. Document this clearly for sibling product owners
  before they wire it up.
- Did not test the "user has different verified emails on the IdP
  vs. on Faultline Lab" case. Likely creates two separate identities;
  this is acceptable for the PoC but worth a note for the broader
  rollout.

## Recommendation: GO

The PoC matches the design doc's prediction. Friction is one extra
click and roughly half a second of redirects when the user is already
signed in to the IdP. Account-linking by email worked without manual
intervention. No server changes were needed and no production data
moved.

Next steps if we proceed:

1. Productionize the IdP Clerk app under a stable home (e.g.
   `id.shotgunninjas.com`), separate from the staging throwaway.
2. Light up the same flag on one more sibling product
   (TradeFlowKit) and measure cross-promo conversion lift on a real
   audience for at least two weeks before rolling further.
3. Decide per product whether to keep the SSO button as additive
   (current PoC behavior) or to make it the default sign-in option;
   that choice drives whether MAU at the IdP scales with active
   users or only with cross-product clickers.

If the broader rollout reveals that the redirect flicker meaningfully
suppresses conversion, fall back to the design doc's Option A
discussion — but only after the business decision on a shared
registrable domain is settled.
