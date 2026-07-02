# OperatorOS Launch-Fix Verification Checklist

Run after Task #66 lands. Each check has an automated probe (where
possible) and a manual smoke step.

## 1. Bootstrap order (logs)

Tail `Start application` logs and confirm this exact sequence:

```
[seed] Created subscription plans ...        ← seedPlansAndAdmin
[launch-fix:pre]  ...                         ← launchFixPreSeed
[seed] Modules: 11 seeded/updated             ← seedModules
[seed] plan_modules mapping refreshed ...
[bootstrap] Promoted ... to platform super_admin   (OR quiet no-op)
[seed] Created Demo Co tenant                 (first boot only)
[launch-fix:post] ...                         ← launchFixPostSeed
```

If any line is out of order, the post-merge setup script needs review.

## 2. Plan prices (DB)

```sql
SELECT slug, price FROM subscription_plans ORDER BY price;
-- expected: starter=4900, pro=14900, elite=29900
```

## 3. Module status + slug rename (DB)

```sql
SELECT slug, status FROM modules ORDER BY ord;
-- 11 rows, no 'bf-os' row, brandforgeos present.
-- studyforge-ai, ninja-launch-kit, callcommand-ai, ninjamation = 'live'.

SELECT COUNT(*) FROM modules WHERE slug = 'bf-os';   -- 0
SELECT COUNT(*) FROM modules WHERE slug = 'brandforgeos'; -- 1
```

## 4. John's tenant

```sql
SELECT name, type FROM tenants
WHERE id = (SELECT current_tenant_id FROM users
            WHERE email = COALESCE(
              current_setting('app.bootstrap_email', true),
              'john@shotgunninjas.com'));
-- expected: ('Shotgun Ninjas Productions', 'company')
```

## 5. Tenant_modules backfill for John

```sql
SELECT m.slug, tm.status, tm.allow_all_members, tm.source
FROM tenant_modules tm
JOIN modules m ON m.id = tm.module_id
WHERE tm.tenant_id = '<john-tenant-id>'
ORDER BY m.ord;
-- expected: 11 rows, status='enabled', allow_all_members=true, source='included'
```

## 6. /admin/health super-admin page

Sign in as super-admin, hit `/admin/health`. Every boolean should be
`true` for a healthy prod boot:
- `db.ok`
- `auth.sessionSecretConfigured`
- `emailFrom.configured`
- `plans.pricesMatchConfig`
- `modules.brandForgeOsRenamed`
- `modules.liveCount === 11`
- `shotgunTenant.configured`
- `bootstrapSuperAdmin.emailConfigured`

## 7. Tenant dropdown live-refresh

1. Sign in as John.
2. Open Tenant Settings → rename to a temporary name → Save.
3. Top-right dropdown should re-render with the new name within ~1s
   (no page reload required).
4. Rename back to "Shotgun Ninjas Productions".

## 8. Internal `/apps/<slug>` routes

Visit each of the 11 routes; none should 404:
- `/apps/tradeflowkit`, `/apps/torqueshed`, `/apps/techdeck`,
  `/apps/pulsedesk`, `/apps/faultlinelab`, `/apps/brandforgeos`,
  `/apps/snapproofos`, `/apps/studyforge-ai`, `/apps/ninja-launch-kit`,
  `/apps/callcommand-ai`, `/apps/ninjamation`

The 4 newly-live ones render polished MVP shells; the other 7 render
the launcher card with a "Launch <module>" CTA.

## 9. Stripe checkout (live mode only)

1. Set `STRIPE_MODE=live` and configure `STRIPE_PRICE_PRO_MONTHLY` /
   `STRIPE_PRICE_PRO_ANNUAL`.
2. Hit `POST /v1/billing/checkout?plan=pro&interval=year` → expect a
   `checkout.stripe.com` URL, NOT `Stripe SDK is not installed`.
3. Hit same with `interval=month` → succeeds via the `_MONTHLY` env.

## 10. Resend invite + copy-link

1. Set `RESEND_API_KEY` + `EMAIL_FROM`.
2. Tenant Users → invite a member by email.
3. Recipient should receive an email from the configured FROM address
   within ~30s.
4. On the pending-invite row, click "Copy link" → clipboard now holds
   `<OPERATOROS_BASE_URL>/invites/<token>`.

## 11. Tests

```
pnpm --filter @operatoros/api test test/launch-fix-entitlement.test.ts
```

All 6 cases must pass.
