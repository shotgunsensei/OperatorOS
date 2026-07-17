# Testing Checklist

A repeatable manual smoke-test for every NinjaLaunchKit surface. Run this:

- After every significant code change before merging
- Before every deploy
- After every deploy, against the live URL

Estimated full-pass time: **~15 minutes**.

> Tip: open the app in a fresh **incognito window** for each pass — the anonymous account auto-provision means a new browser session = a new test user with isolated data.

---

## 1. Public marketing pages

- [ ] `/` (landing) loads. Hero headline reads "Generate a full launch campaign in minutes".
- [ ] Hero "INITIALIZE DEPLOYMENT" CTA → `/signup`.
- [ ] Hero "BROWSE 20 TEMPLATES" CTA → `/templates`.
- [ ] Three mock-browser product preview cards render below the hero.
- [ ] "The Payload" grid shows 9 feature tiles.
- [ ] Use-case grid shows 10 industry tiles. Each tile is hover-elevated and clickable through to /templates via the bottom CTA.
- [ ] Pricing teaser shows three cards (Free, Pro, Agency). Pro is highlighted "MOST POPULAR".
- [ ] Testimonials block shows 3 placeholder cards with 5-star rows.
- [ ] FAQ accordion: first item is open by default, others toggle on click.
- [ ] Final CTA section renders. Both buttons route correctly.
- [ ] `/pricing` loads — three plan cards render. "Demo mode" banner shows iff Stripe is not configured.
- [ ] `/contact`, `/terms`, `/privacy` all load with no errors.

## 2. SEO / discoverability

- [ ] `<title>` contains "NinjaLaunchKit" and "Generate a full launch campaign in minutes".
- [ ] `<meta name="description">` is populated.
- [ ] `<meta property="og:image">` resolves to `/opengraph.jpg` and the file loads (200, not 404).
- [ ] `/robots.txt` resolves and disallows `/admin`, `/dashboard`, `/api/`.
- [ ] `/sitemap.xml` resolves and lists `/`, `/pricing`, `/templates`, `/signup`, `/login`, `/contact`, `/terms`, `/privacy`.
- [ ] JSON-LD `<script type="application/ld+json">` block parses as valid JSON.
- [ ] OG card preview looks correct in [https://www.opengraph.xyz](https://www.opengraph.xyz) (post-deploy).

## 3. Anonymous demo session

- [ ] Visit `/` in incognito. No login required.
- [ ] Click "INITIALIZE DEPLOYMENT" → arrives at `/signup`. Backing out and visiting `/dashboard` directly works (anonymous account is auto-provisioned).
- [ ] `/dashboard` shows: Command Center heading, NEW LAUNCH KIT button, the amber "Free plan" upgrade banner, four stat cards (Total Kits / This Month / Exports / Current Plan = "free"), and "Recommended Templates" with at least one tile.

## 4. Builder + kit generation

- [ ] `/builder` loads with the form.
- [ ] Fill: Business name "Mainline Auto", Type "Auto Repair", Target "drivers 25-65", Pain "dealership prices", Action "book inspection", Tone "friendly", Offer "$29 inspection".
- [ ] Click PREVIEW — preview output renders without saving a row.
- [ ] Click GENERATE_AND_SAVE — navigates to `/kits/<id>` within ~3s.
- [ ] Kit detail page renders. Title editable. Watermark badge visible (Free plan).
- [ ] Six content tabs: Landing Page · Ads · Social & SMS · Email Seq. · FAQ · Extras · Visual Promo.
- [ ] Each tab's content renders. Copy-button on hover works (clipboard + toast).
- [ ] Export TXT works → file downloads. Export MD/JSON should be **blocked on Free** with an upgrade toast.

## 5. Visual Promo Kit (per-kit tab)

- [ ] "Visual Promo" tab loads. Plan badge reads "free plan". Locked-count badge reads "8 LOCKED".
- [ ] Brand-palette swatches render (3 hex colors).
- [ ] `facebook-ad` brief is unlocked, copy button works, brief begins "FACEBOOK / META FEED AD IMAGE".
- [ ] Other 8 briefs show locked cards with "UPGRADE_TO_UNLOCK" buttons.
- [ ] REGENERATE button → success toast.
- [ ] EXPORT_ALL TXT → file downloads.
- [ ] EXPORT_ALL MD → upgrade toast (blocked on Free).
- [ ] Click any UPGRADE button → navigates to `/pricing`.

## 6. Templates browser

- [ ] `/templates` loads with at least 20 cards.
- [ ] Each card has a tier badge (Free / Pro / Agency) and a category.
- [ ] Search "fitness" → narrows to Fitness Coach.
- [ ] Category filter "Home Services" → narrows to Home Services cards.
- [ ] Tier filter "Pro" → narrows to Pro-tier cards.
- [ ] "Reset" / "ALL" buttons restore the full list.
- [ ] Click PREVIEW on a Free template → `/templates/<slug>`.
- [ ] Detail page shows Recommended Offer, Suggested Audience, Ad Angle, Landing Page Structure, Launch Checklist, Social Hooks.
- [ ] On a Free template, "USE THIS TEMPLATE" → `/builder?template=<slug>` and the form is pre-filled.
- [ ] On a Pro/Agency template (as Free user), "UPGRADE" routes to `/pricing` and the locked banner is visible on the detail page.

## 7. Brand profiles

- [ ] `/brands` loads. Free user sees 0 / 0 limit. Add → blocked with upgrade toast.
- [ ] After upgrading to Pro, can create up to 5 brand profiles. Editing and deleting work.
- [ ] Builder dropdown to "link a brand" populates with the user's brands.

## 8. Billing

### Demo mode (Stripe secrets absent)

- [ ] `/pricing` shows the "DEMO_MODE" banner.
- [ ] Click "GO PRO" → toast "Demo upgrade applied: PRO" and navigates to `/account`.
- [ ] `/account` shows plan = pro. `/dashboard` upgrade banner is gone.
- [ ] Stat cards now show "UNLIMITED" for "This Month" instead of "x / 2".
- [ ] All 9 visual briefs unlock on the kit detail page. Markdown export now works.

### Live mode (all 5 Stripe secrets set)

- [ ] `/pricing` does NOT show the demo banner.
- [ ] Click "GO PRO" → redirects to a real `checkout.stripe.com` URL.
- [ ] Complete checkout with `4242 4242 4242 4242` (test mode).
- [ ] Stripe dashboard webhook attempt for `checkout.session.completed` returns `200 OK`.
- [ ] Returning to `/account` shows plan = pro.
- [ ] `/account` "Manage billing" → routes through `/api/billing/portal` to Stripe-hosted portal.

## 9. Saved kits & exports

- [ ] `/kits` lists every kit with title, business type, created date.
- [ ] Search by title narrows the list.
- [ ] Click a kit → detail page.
- [ ] Duplicate a kit → new copy with "(copy)" suffix.
- [ ] Regenerate kit → content visibly changes, watermark intact for Free.
- [ ] `/exports` lists download history rows.

## 10. Account & admin

- [ ] `/account` shows email, plan, member-since date.
- [ ] Sign out clears the session and routes home.
- [ ] If signed in as the seeded admin user, `/admin` loads with user/kits/exports counts.

## 11. Errors / edge cases

- [ ] Unknown URL → 404 page renders with "RETURN_TO_BASE" link.
- [ ] `/templates/does-not-exist` → "Template not found" message.
- [ ] `/kits/99999` → "Payload Not Found" page with "RETURN_TO_DATABASE" link.
- [ ] `/builder?template=cybersecurity-service` as a Free user → toast "requires the AGENCY plan", form fields stay empty.

## 12. Build / type / lint

```bash
pnpm install
pnpm run typecheck
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/ninjalaunchkit run build
```

All four must pass with zero errors. If `typecheck` fails after editing `lib/api-spec/openapi.yaml`:

```bash
pnpm --filter @workspace/api-spec run codegen
```
