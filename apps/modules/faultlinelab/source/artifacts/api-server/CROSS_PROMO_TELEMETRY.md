# Cross-promo click telemetry

The `cross_promo_clicks` table records every click on a cross-promo link in
faultline-lab (footer grid, "Built by" footer link, and Debrief
cross-promo cards). Inserts happen via `POST /api/cross-promo/click` from
the frontend, fired non-blockingly so a failed event never prevents
navigation to the destination.

## Schema

`lib/db/src/schema/crossPromoClicks.ts` — table `cross_promo_clicks`:

| Column          | Type        | Notes                                                  |
| --------------- | ----------- | ------------------------------------------------------ |
| id              | text PK     | uuid                                                   |
| placement_id    | text        | e.g. `footer-grid-techdeck`, `debrief-automotive-techdeck` |
| target_product  | text        | short product slug (`techdeck`, `torqueshed`, ...)    |
| target_url      | text        | absolute href                                          |
| route           | text NULL   | `window.location.pathname + search` at click time      |
| user_tier       | text        | `anonymous` \| `free` \| `pro`                         |
| user_id         | text NULL   | internal users.id when signed in                       |
| clerk_id        | text NULL   | Clerk session userId when signed in                    |
| created_at      | timestamptz | defaults to now                                        |

Indexed on `(placement_id, created_at)` and `(target_product, created_at)`.

## Ad-hoc analysis

Open a psql shell against `DATABASE_URL` (use the database skill for the
production database).

Top placements over the last 7 days:

```sql
SELECT placement_id, COUNT(*) AS clicks
FROM cross_promo_clicks
WHERE created_at > now() - interval '7 days'
GROUP BY placement_id
ORDER BY clicks DESC;
```

Clicks per target product, split by user tier:

```sql
SELECT target_product, user_tier, COUNT(*) AS clicks
FROM cross_promo_clicks
WHERE created_at > now() - interval '30 days'
GROUP BY target_product, user_tier
ORDER BY target_product, clicks DESC;
```

Which routes drive the most ecosystem traffic:

```sql
SELECT route, COUNT(*) AS clicks
FROM cross_promo_clicks
WHERE created_at > now() - interval '30 days'
GROUP BY route
ORDER BY clicks DESC
LIMIT 20;
```

Recent activity stream:

```sql
SELECT created_at, placement_id, target_product, user_tier, route
FROM cross_promo_clicks
ORDER BY created_at DESC
LIMIT 50;
```

## Outbound URL tagging (conversion attribution)

Click telemetry above tells us which placements get *tapped*. To attribute
sign-ups and purchases on the destination products back to a specific
placement on faultline-lab, every outbound cross-promo URL is decorated
with a stable set of query params before it is rendered or sent to
telemetry.

Helper: `decorateCrossPromoUrl(url, placementId)` in
`artifacts/faultline-lab/src/lib/crossPromoTelemetry.ts`.

Params appended (existing values on the URL are preserved):

| Param          | Value                  | Notes                                              |
| -------------- | ---------------------- | -------------------------------------------------- |
| `ref`          | `faultlinelab`         | Short source slug (`CROSS_PROMO_SOURCE` constant). |
| `placement`    | `<placementId>`        | Matches `cross_promo_clicks.placement_id` exactly. |
| `utm_source`   | `faultlinelab`         | Standard UTM, same as `ref`.                       |
| `utm_medium`   | `cross-promo`          | Constant across all placements.                    |
| `utm_campaign` | `<placementId>`        | Same placement id, in UTM-standard slot.           |

Example: the footer grid link to TechDeck (placement `footer-grid-techdeck`)
renders as:

```
https://techdeck.app/?ref=faultlinelab&placement=footer-grid-techdeck&utm_source=faultlinelab&utm_medium=cross-promo&utm_campaign=footer-grid-techdeck
```

Sibling Shotgun Ninjas products should persist `ref` / `placement` (or the
UTM equivalents) on landing, attach them to any resulting sign-up or order
record, and join back to `cross_promo_clicks.placement_id` for end-to-end
funnel analysis.

## Retention

To keep the table small and ad-hoc queries fast, the api-server runs a
background prune job that deletes rows older than **180 days** from
`cross_promo_clicks`. The job is started by
`startCrossPromoRetentionJob()` in `artifacts/api-server/src/index.ts`
(implementation in `artifacts/api-server/src/lib/crossPromoRetention.ts`).
It runs once at server boot and then every 24 hours.

If you need a different retention window, update
`CROSS_PROMO_RETENTION_DAYS` in
`artifacts/api-server/src/lib/crossPromoRetention.ts` and this doc.

## Adding a new cross-promo placement

1. Render the link in faultline-lab and import `trackCrossPromoClick` and
   `decorateCrossPromoUrl` from `@/lib/crossPromoTelemetry`.
2. Choose a stable, unique `placementId` (kebab-case, scoped by surface —
   e.g. `pricing-hero-techdeck`).
3. Compute `const decoratedHref = decorateCrossPromoUrl(href, placementId)`
   and use it for **both** the anchor's `href` and the `targetUrl` passed
   to `trackCrossPromoClick`. This keeps the click row and the destination
   URL pointing at the same attribution string.
4. No backend change is required; the endpoint accepts any short string.
