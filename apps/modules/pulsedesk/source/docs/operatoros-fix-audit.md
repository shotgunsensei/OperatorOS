# OperatorOS Launch-Fix Audit (Task #66)

Snapshot of every surface this pass had to touch and the *exact* defect /
gap each one was fixing. Use as a forensic record when verifying the
post-merge state.

## Plans (`apps/api/src/lib/plans.ts`)

| Plan    | Old price (cents) | New price (cents) | Notes |
| ------- | ----------------- | ----------------- | ----- |
| starter | 0                 | 4_900             | Was free; promoted to paid floor. |
| pro     | 2_900             | 14_900            | |
| elite   | 9_900             | 29_900            | |

`PLAN_CONFIGS` is the single source of truth — `subscription_plans.price`
is back-filled from it on each boot via `launchFixPostSeed()`.

## Stripe price IDs

- The retired package Price variables were replaced by the finalized
  core-product, companion-module, and additional-seat Price variables.
  treated as the **monthly** fallback.
- New `STRIPE_PRICE_<PLAN>_MONTHLY` and `STRIPE_PRICE_<PLAN>_ANNUAL` env
  keys are picked up first.
- `subscription_plans.stripe_price_id_annual` column added (idempotent
  `ADD COLUMN IF NOT EXISTS`); back-filled from env on boot.
- `createCheckoutSession(userId, planSlug, interval)` now takes a third
  `'month' | 'year'` argument; defaults to `'month'`.

## Stripe SDK detection (`billing-service.ts`)

The previous `getStripe()` used bare `require('stripe')` inside an
ES-module file (`apps/api` is `"type":"module"`), so `require` was
undefined and every checkout call threw `"Stripe SDK is not installed"`
even though the package was hoisted into `node_modules`.

Fix: replaced with `createRequire(import.meta.url)` from `node:module`
+ a cached singleton. No `package.json` edits required.

## Module catalog (`saas-db-init.ts` + new `packages/sdk/src/catalog.ts`)

| Slug             | Status before | Status after | Internal MVP shell? |
| ---------------- | ------------- | ------------ | ------------------- |
| tradeflowkit     | live          | live         | no |
| torqueshed       | live          | live         | no |
| techdeck         | live          | live         | no |
| pulsedesk        | live          | live         | no |
| faultlinelab     | live          | live         | no |
| **bf-os**        | live          | **renamed → `brandforgeos`** | no |
| snapproofos      | live          | live         | no |
| **studyforge-ai**    | coming_soon | **live**  | yes |
| **ninja-launch-kit** | coming_soon | **live**  | yes |
| **callcommand-ai**   | coming_soon | **live**  | yes |
| **ninjamation**      | coming_soon | **live**  | yes |

`bf-os → brandforgeos`: idempotent `UPDATE modules SET slug='brandforgeos'
WHERE slug='bf-os'` runs in `launchFixPreSeed()` *before* `seedModules`.
All FKs reference `modules.id`, so plan_modules / tenant_modules /
addon_subscriptions / etc. are preserved automatically.

Env-key fallbacks (so live secrets keep working until the rename
propagates everywhere):
- `BRANDFORGEOS_URL` → falls back to `BF_OS_URL`
- `STRIPE_PRICE_ADDON_BRANDFORGEOS` → falls back to `STRIPE_PRICE_ADDON_BF_OS`

`internal: true` modules with no `*_URL` env get `baseUrl = "/apps/<slug>"`
and stay `live` instead of being demoted to `coming_soon`.

## Entitlement default-enabled (`entitlement-service.ts`)

When a tenant has no `tenant_modules` row at all (NOT the explicit
`disabled` / `archived` case — those still deny), the runtime now checks
plan inclusion via `plan_modules` and grants with `source: 'plan'`.
`launchFixPostSeed()` also back-fills `tenant_modules` rows on John's
tenant for every plan-included live module so the data layer matches
the new runtime contract.

## John's tenant (Shotgun Ninjas Productions)

Targeted by the bootstrap super-admin's email
(`OPERATOROS_BOOTSTRAP_SUPER_ADMIN_EMAIL` → falls back to `ADMIN_EMAIL`
→ `john@shotgunninjas.com`):

- `name` → `"Shotgun Ninjas Productions"`
- `type` → `'company'` (was `'personal'`)
- `tenant_modules` back-filled for every Elite-plan-included live module,
  `allow_all_members = true`, `source = 'included'`.
- `tenant_user_module_access` granted `manager` access for John on each
  back-filled module (mirrors Demo Co pattern).

All updates are guarded by `WHERE name <> 'Shotgun Ninjas Productions'
OR type <> 'company'` so a re-boot is a no-op.

## Top-right tenant dropdown live-refresh

`TenantSettingsPage.save()` now calls `useTenant().refresh()` after a
successful rename, so the dropdown in the top-right header updates
immediately without requiring a page reload.

## Internal `/apps/<slug>` routes

New Next.js dynamic route at `apps/web/src/app/apps/[slug]/page.tsx`
handles the complete module catalog. The newly-live MVP modules render polished
shells (`apps/web/src/components/module-shells/*Shell.tsx`); the other 7
render a simple launcher card that hands off to the external `baseUrl`.

## Resend invite delivery

`email-service.ts.getFromAddress()` now resolves
`EMAIL_FROM ?? INVITE_FROM_EMAIL ?? default`. New
`OPERATOROS_BASE_URL` env joins the existing chain in
`buildInviteAcceptUrl()`.

New `GET /v1/tenants/:tenantId/invites/:inviteId/link` endpoint returns
the acceptUrl so the new "Copy link" button on `TenantUsersPage` can
clipboard-paste it without needing a network round-trip via "resend".

## `/admin/health` super-admin page

`/v1/platform/health` extended with launch-fix booleans (NO secret
values surfaced):

- `emailFrom: { configured, provider }`
- `modules: { liveCount, comingSoonCount, totalCount, brandForgeOsRenamed }`
- `plans: { count, pricesMatchConfig }`
- `shotgunTenant: { configured }`
- `bootstrapSuperAdmin: { emailConfigured }`

## Tests added

`apps/api/test/launch-fix-entitlement.test.ts` covers six paths:
1. Plan-included module grants without a `tenant_modules` row.
2. Explicit `disabled` `tenant_modules` row still denies.
3. Explicit `archived` `tenant_modules` row still denies.
4. `accessLevel = 'none'` deny still wins over plan inclusion.
5. Module not in plan + no `tenant_modules` row → denied.
6. Super-admin always granted regardless of plan / tenant_modules.
