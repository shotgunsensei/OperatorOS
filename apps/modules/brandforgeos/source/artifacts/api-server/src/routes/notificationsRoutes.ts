import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, notificationsTable, recommendationsTable, leadSubmissionsTable } from "@workspace/db";
import { requireTenantAccess, parseTenantId } from "../lib/tenant-auth";

const router: IRouter = Router();

router.get("/tenants/:tenantId/notifications", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;

  const notifications = await db.select().from(notificationsTable)
    .where(and(eq(notificationsTable.tenantId, tenantId), eq(notificationsTable.userId, req.user?.id || "")))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);

  res.json(notifications.map(n => ({
    ...n,
    createdAt: n.createdAt.toISOString(),
  })));
});

router.post("/tenants/:tenantId/notifications/:id/read", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  const id = parseInt(req.params.id as string, 10);

  await db.update(notificationsTable).set({ isRead: true }).where(and(eq(notificationsTable.id, id), eq(notificationsTable.tenantId, tenantId), eq(notificationsTable.userId, req.user?.id || "")));
  res.json({ success: true });
});

router.post("/tenants/:tenantId/notifications/read-all", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;

  await db.update(notificationsTable).set({ isRead: true })
    .where(and(eq(notificationsTable.tenantId, tenantId), eq(notificationsTable.userId, req.user?.id || "")));
  res.json({ success: true });
});

router.get("/tenants/:tenantId/recommendations", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;

  const recs = await db.select().from(recommendationsTable)
    .where(and(eq(recommendationsTable.tenantId, tenantId), eq(recommendationsTable.isDismissed, false)))
    .orderBy(desc(recommendationsTable.createdAt))
    .limit(20);

  res.json(recs.map(r => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
  })));
});

router.post("/tenants/:tenantId/recommendations/:id/dismiss", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  const id = parseInt(req.params.id as string, 10);

  await db.update(recommendationsTable).set({ isDismissed: true }).where(and(eq(recommendationsTable.id, id), eq(recommendationsTable.tenantId, tenantId)));
  res.json({ success: true });
});

router.get("/tenants/:tenantId/lead-submissions", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;

  const leads = await db.select().from(leadSubmissionsTable)
    .where(eq(leadSubmissionsTable.tenantId, tenantId))
    .orderBy(desc(leadSubmissionsTable.createdAt))
    .limit(100);

  res.json(leads.map(l => ({
    ...l,
    createdAt: l.createdAt.toISOString(),
  })));
});

export default router;
