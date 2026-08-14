import { Router, type IRouter } from "express";
import { eq, desc, sql, gte } from "drizzle-orm";
import { db, tenantsTable, brandsTable, campaignsTable, copyAssetsTable, calendarItemsTable, auditLogsTable } from "@workspace/db";
import { requireTenantAccess, parseTenantId } from "../lib/tenant-auth";

const router: IRouter = Router();

router.get("/tenants/:tenantId/dashboard", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  
  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId));
  const brands = await db.select().from(brandsTable).where(eq(brandsTable.tenantId, tenantId));
  const campaigns = await db.select().from(campaignsTable).where(eq(campaignsTable.tenantId, tenantId));
  const copyAssets = await db.select().from(copyAssetsTable).where(eq(copyAssetsTable.tenantId, tenantId)).orderBy(desc(copyAssetsTable.createdAt)).limit(5);
  const calendarItems = await db.select().from(calendarItemsTable).where(eq(calendarItemsTable.tenantId, tenantId)).orderBy(calendarItemsTable.scheduledDate).limit(5);
  
  const statusCounts: Record<string, number> = {};
  campaigns.forEach(c => {
    statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;
  });
  
  res.json({
    totalBrands: brands.length,
    totalCampaigns: campaigns.length,
    totalCopyAssets: (await db.select({ count: sql<number>`count(*)` }).from(copyAssetsTable).where(eq(copyAssetsTable.tenantId, tenantId)))[0]?.count || 0,
    totalCalendarItems: (await db.select({ count: sql<number>`count(*)` }).from(calendarItemsTable).where(eq(calendarItemsTable.tenantId, tenantId)))[0]?.count || 0,
    activeCampaigns: campaigns.filter(c => c.status === "active").length,
    aiCreditsUsed: tenant?.aiCreditsUsed || 0,
    aiCreditsLimit: tenant?.aiCreditsLimit || 50,
    campaignsByStatus: Object.entries(statusCounts).map(([status, count]) => ({ status, count })),
    recentCopyAssets: copyAssets,
    upcomingCalendarItems: calendarItems,
  });
});

router.get("/tenants/:tenantId/activity", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  
  const limit = parseInt(req.query.limit as string || "20", 10);
  const logs = await db.select().from(auditLogsTable).where(eq(auditLogsTable.tenantId, tenantId)).orderBy(desc(auditLogsTable.createdAt)).limit(limit);
  
  res.json(logs.map(l => ({
    id: l.id,
    action: l.action,
    entityType: l.entityType,
    entityName: l.entityName,
    userId: l.userId,
    userName: l.userName,
    timestamp: l.createdAt.toISOString(),
  })));
});

router.get("/tenants/:tenantId/analytics", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  
  const now = new Date();
  const contentOutput = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    contentOutput.push({
      date: d.toISOString().split("T")[0],
      value: Math.floor(Math.random() * 8) + 1,
    });
  }
  
  const campaigns = await db.select().from(campaignsTable).where(eq(campaignsTable.tenantId, tenantId));
  const campaignPerformance = campaigns.slice(0, 5).map(c => ({
    name: c.name,
    impressions: Math.floor(Math.random() * 10000) + 1000,
    clicks: Math.floor(Math.random() * 500) + 50,
    conversions: Math.floor(Math.random() * 50) + 5,
  }));
  
  const channelBreakdown = [
    { channel: "Social", count: Math.floor(Math.random() * 30) + 10 },
    { channel: "Email", count: Math.floor(Math.random() * 20) + 5 },
    { channel: "Ads", count: Math.floor(Math.random() * 15) + 3 },
    { channel: "SEO", count: Math.floor(Math.random() * 10) + 2 },
    { channel: "Content", count: Math.floor(Math.random() * 25) + 8 },
  ];
  
  const aiUsageTrend = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    aiUsageTrend.push({
      date: d.toISOString().split("T")[0],
      value: Math.floor(Math.random() * 5),
    });
  }
  
  res.json({ contentOutput, campaignPerformance, channelBreakdown, aiUsageTrend });
});

export default router;
