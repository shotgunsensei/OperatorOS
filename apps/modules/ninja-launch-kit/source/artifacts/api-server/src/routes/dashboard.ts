import { Router, type IRouter } from "express";
import { eq, and, desc, sql, isNull } from "drizzle-orm";
import { db, launchKitsTable, exportsTable, brandProfilesTable } from "@workspace/db";
import { GetDashboardSummaryResponse, GetRecentActivityResponse } from "@workspace/api-zod";
import { requireUser } from "../lib/session";

const router: IRouter = Router();

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const user = await requireUser(req, res);
  const allKits = await db.select().from(launchKitsTable).where(and(eq(launchKitsTable.userId, user.id), isNull(launchKitsTable.deletedAt)));
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);
  const kitsThisMonth = allKits.filter((k) => k.createdAt >= startOfMonth).length;

  const exportRows = await db.select().from(exportsTable).where(eq(exportsTable.userId, user.id));
  const brandRows = await db.select().from(brandProfilesTable).where(and(eq(brandProfilesTable.userId, user.id), isNull(brandProfilesTable.deletedAt)));

  const counts = new Map<string, number>();
  for (const k of allKits) counts.set(k.businessType, (counts.get(k.businessType) ?? 0) + 1);

  const data = {
    totalKits: allKits.length,
    kitsThisMonth,
    monthlyLimit: user.plan === "free" ? 2 : null,
    totalExports: exportRows.length,
    brandProfileCount: brandRows.length,
    plan: user.plan,
    kitsByType: Array.from(counts.entries()).map(([businessType, count]) => ({
      businessType,
      count,
    })),
  };
  res.json(GetDashboardSummaryResponse.parse(data));
});

router.get("/dashboard/recent-activity", async (req, res): Promise<void> => {
  const user = await requireUser(req, res);
  const kits = await db
    .select()
    .from(launchKitsTable)
    .where(and(eq(launchKitsTable.userId, user.id), isNull(launchKitsTable.deletedAt)))
    .orderBy(desc(launchKitsTable.updatedAt))
    .limit(10);
  const exportsList = await db
    .select()
    .from(exportsTable)
    .where(eq(exportsTable.userId, user.id))
    .orderBy(desc(exportsTable.createdAt))
    .limit(10);

  type Item = { id: number; kind: "created" | "updated" | "exported" | "duplicated"; kitId: number; kitTitle: string; timestamp: Date };
  const items: Item[] = [];
  for (const k of kits) {
    const wasUpdated = k.updatedAt.getTime() - k.createdAt.getTime() > 1500;
    items.push({
      id: k.id * 10,
      kind: wasUpdated ? "updated" : "created",
      kitId: k.id,
      kitTitle: k.title,
      timestamp: k.updatedAt,
    });
  }
  for (const e of exportsList) {
    items.push({
      id: e.id * 10 + 1,
      kind: "exported",
      kitId: e.kitId,
      kitTitle: e.kitTitle,
      timestamp: e.createdAt,
    });
  }
  items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  res.json(GetRecentActivityResponse.parse(items.slice(0, 15)));
});

void sql;

export default router;
