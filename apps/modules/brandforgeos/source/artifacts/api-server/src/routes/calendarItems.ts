import { Router, type IRouter } from "express";
import { eq, and, gte, lte } from "drizzle-orm";
import { db, calendarItemsTable } from "@workspace/db";
import { CreateCalendarItemBody, UpdateCalendarItemBody } from "@workspace/api-zod";
import { requireTenantAccess, parseTenantId } from "../lib/tenant-auth";

const router: IRouter = Router();

router.get("/tenants/:tenantId/calendar-items", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  let items = await db.select().from(calendarItemsTable).where(eq(calendarItemsTable.tenantId, tenantId)).orderBy(calendarItemsTable.scheduledDate);
  if (req.query.status && typeof req.query.status === "string") {
    items = items.filter(i => i.status === req.query.status);
  }
  res.json(items);
});

router.post("/tenants/:tenantId/calendar-items", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  const parsed = CreateCalendarItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [item] = await db.insert(calendarItemsTable).values({ ...parsed.data, tenantId }).returning();
  res.status(201).json(item);
});

router.patch("/tenants/:tenantId/calendar-items/:itemId", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  const itemId = parseInt(Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId, 10);
  const parsed = UpdateCalendarItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [item] = await db.update(calendarItemsTable).set(parsed.data).where(and(eq(calendarItemsTable.id, itemId), eq(calendarItemsTable.tenantId, tenantId))).returning();
  if (!item) { res.status(404).json({ error: "Calendar item not found" }); return; }
  res.json(item);
});

router.delete("/tenants/:tenantId/calendar-items/:itemId", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  const itemId = parseInt(Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId, 10);
  const [item] = await db.delete(calendarItemsTable).where(and(eq(calendarItemsTable.id, itemId), eq(calendarItemsTable.tenantId, tenantId))).returning();
  if (!item) { res.status(404).json({ error: "Calendar item not found" }); return; }
  res.sendStatus(204);
});

export default router;
