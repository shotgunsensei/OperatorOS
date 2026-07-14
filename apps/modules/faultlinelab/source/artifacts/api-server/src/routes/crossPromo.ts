import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { desc, gte, sql } from "drizzle-orm";
import { db, crossPromoClicksTable } from "@workspace/db";
import { optionalAuth, requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

const VALID_TIERS = new Set(["anonymous", "free", "pro"]);
const MAX_FIELD_LEN = 256;
const MAX_URL_LEN = 2048;

function isShortString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= MAX_FIELD_LEN;
}

router.post("/cross-promo/click", optionalAuth, async (req, res): Promise<void> => {
  const body = (req.body || {}) as Record<string, unknown>;
  const { placementId, targetProduct, targetUrl, route, userTier } = body;

  if (!isShortString(placementId)) {
    res.status(400).json({ error: "Invalid placementId" });
    return;
  }
  if (!isShortString(targetProduct)) {
    res.status(400).json({ error: "Invalid targetProduct" });
    return;
  }
  if (
    typeof targetUrl !== "string" ||
    targetUrl.length === 0 ||
    targetUrl.length > MAX_URL_LEN
  ) {
    res.status(400).json({ error: "Invalid targetUrl" });
    return;
  }
  if (route != null && (typeof route !== "string" || route.length > MAX_FIELD_LEN)) {
    res.status(400).json({ error: "Invalid route" });
    return;
  }
  const tier =
    typeof userTier === "string" && VALID_TIERS.has(userTier) ? userTier : null;
  if (!tier) {
    res.status(400).json({ error: "Invalid userTier" });
    return;
  }

  // requireAuth/optionalAuth resolves the local app user, exposed as
  // req.appUser. We pull both ids so analytics keeps the legacy `clerkId`
  // column populated for Clerk-backed sessions.
  const appUser = (req as any).appUser as { id: string; clerkId: string | null } | null;
  const userId: string | null = appUser?.id ?? null;
  const clerkId: string | null = appUser?.clerkId ?? null;

  try {
    await db.insert(crossPromoClicksTable).values({
      id: randomUUID(),
      placementId,
      targetProduct,
      targetUrl,
      route: typeof route === "string" ? route : null,
      userTier: tier,
      userId,
      clerkId,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to record cross-promo click");
    res.status(500).json({ error: "Failed to record click" });
    return;
  }

  res.status(202).json({ ok: true });
});

async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const adminUser = (req as any).appUser as { id: string; isAdmin?: boolean } | undefined;
  if (!adminUser || !adminUser.isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}

router.get(
  "/admin/cross-promo/clicks",
  requireAuth,
  requireAdmin,
  async (req, res): Promise<void> => {
    try {
      const now = Date.now();
      const since7 = new Date(now - 7 * 24 * 60 * 60 * 1000);
      const since30 = new Date(now - 30 * 24 * 60 * 60 * 1000);

      const countCol = sql<number>`count(*)::int`;

      const [
        topPlacements7d,
        topPlacements30d,
        topTargets7d,
        topTargets30d,
        recentRows,
        totals,
      ] = await Promise.all([
        db
          .select({ placementId: crossPromoClicksTable.placementId, clicks: countCol })
          .from(crossPromoClicksTable)
          .where(gte(crossPromoClicksTable.createdAt, since7))
          .groupBy(crossPromoClicksTable.placementId)
          .orderBy(desc(countCol))
          .limit(20),
        db
          .select({ placementId: crossPromoClicksTable.placementId, clicks: countCol })
          .from(crossPromoClicksTable)
          .where(gte(crossPromoClicksTable.createdAt, since30))
          .groupBy(crossPromoClicksTable.placementId)
          .orderBy(desc(countCol))
          .limit(20),
        db
          .select({ targetProduct: crossPromoClicksTable.targetProduct, clicks: countCol })
          .from(crossPromoClicksTable)
          .where(gte(crossPromoClicksTable.createdAt, since7))
          .groupBy(crossPromoClicksTable.targetProduct)
          .orderBy(desc(countCol))
          .limit(20),
        db
          .select({ targetProduct: crossPromoClicksTable.targetProduct, clicks: countCol })
          .from(crossPromoClicksTable)
          .where(gte(crossPromoClicksTable.createdAt, since30))
          .groupBy(crossPromoClicksTable.targetProduct)
          .orderBy(desc(countCol))
          .limit(20),
        db
          .select({
            id: crossPromoClicksTable.id,
            placementId: crossPromoClicksTable.placementId,
            targetProduct: crossPromoClicksTable.targetProduct,
            targetUrl: crossPromoClicksTable.targetUrl,
            route: crossPromoClicksTable.route,
            userTier: crossPromoClicksTable.userTier,
            createdAt: crossPromoClicksTable.createdAt,
          })
          .from(crossPromoClicksTable)
          .orderBy(desc(crossPromoClicksTable.createdAt))
          .limit(50),
        db
          .select({
            total7d: sql<number>`count(*) filter (where ${crossPromoClicksTable.createdAt} >= ${since7})::int`,
            total30d: sql<number>`count(*) filter (where ${crossPromoClicksTable.createdAt} >= ${since30})::int`,
          })
          .from(crossPromoClicksTable),
      ]);

      res.json({
        totals: totals[0] ?? { total7d: 0, total30d: 0 },
        topPlacements7d,
        topPlacements30d,
        topTargets7d,
        topTargets30d,
        recent: recentRows.map((r) => ({
          ...r,
          createdAt: r.createdAt?.toISOString?.() ?? null,
        })),
      });
    } catch (err) {
      req.log.error({ err }, "Failed to load cross-promo dashboard");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

const CSV_ROW_CAP = 10_000;
const WINDOW_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

const FORMULA_PREFIXES = new Set(["=", "+", "-", "@", "\t", "\r"]);

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  // Neutralize spreadsheet formula injection: any cell starting with a
  // formula trigger character is prefixed with a single quote so Excel /
  // Google Sheets treat it as literal text. Field values originate from
  // anonymous /cross-promo/click POSTs, so they must be considered untrusted.
  if (s.length > 0 && FORMULA_PREFIXES.has(s[0]!)) {
    s = `'${s}`;
  }
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

router.get(
  "/admin/cross-promo/clicks.csv",
  requireAuth,
  requireAdmin,
  async (req, res): Promise<void> => {
    const windowParam = typeof req.query.window === "string" ? req.query.window : "7d";
    const days = WINDOW_DAYS[windowParam];
    if (!days) {
      res.status(400).json({ error: "Invalid window. Use 7d, 30d, or 90d." });
      return;
    }
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    try {
      const rows = await db
        .select({
          createdAt: crossPromoClicksTable.createdAt,
          placementId: crossPromoClicksTable.placementId,
          targetProduct: crossPromoClicksTable.targetProduct,
          targetUrl: crossPromoClicksTable.targetUrl,
          route: crossPromoClicksTable.route,
          userTier: crossPromoClicksTable.userTier,
        })
        .from(crossPromoClicksTable)
        .where(gte(crossPromoClicksTable.createdAt, since))
        .orderBy(desc(crossPromoClicksTable.createdAt))
        .limit(CSV_ROW_CAP + 1);

      if (rows.length > CSV_ROW_CAP) {
        res.status(413).json({
          error: `Too many rows for export (over ${CSV_ROW_CAP}). Narrow the time window or contact engineering for a SQL export.`,
          cap: CSV_ROW_CAP,
        });
        return;
      }

      const header = "created_at,placement_id,target_product,target_url,route,user_tier";
      const lines = rows.map((r) =>
        [
          r.createdAt?.toISOString?.() ?? "",
          r.placementId,
          r.targetProduct,
          r.targetUrl,
          r.route ?? "",
          r.userTier,
        ]
          .map(csvEscape)
          .join(","),
      );
      const csv = [header, ...lines].join("\n") + "\n";

      const filename = `cross-promo-clicks-${windowParam}-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Cache-Control", "no-store");
      res.status(200).send(csv);
    } catch (err) {
      req.log.error({ err }, "Failed to export cross-promo clicks CSV");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
