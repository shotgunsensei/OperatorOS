import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, campaignsTable } from "@workspace/db";
import { CreateCampaignBody, UpdateCampaignBody } from "@workspace/api-zod";
import { requireTenantAccess, parseTenantId } from "../lib/tenant-auth";

const router: IRouter = Router();

router.get("/tenants/:tenantId/campaigns", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  
  let query = db.select().from(campaignsTable).where(eq(campaignsTable.tenantId, tenantId)).orderBy(campaignsTable.createdAt);
  const campaigns = await query;
  
  if (req.query.status && typeof req.query.status === "string") {
    res.json(campaigns.filter(c => c.status === req.query.status));
    return;
  }
  res.json(campaigns);
});

router.post("/tenants/:tenantId/campaigns", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  const parsed = CreateCampaignBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [campaign] = await db.insert(campaignsTable).values({ ...parsed.data, tenantId }).returning();
  res.status(201).json(campaign);
});

router.get("/tenants/:tenantId/campaigns/:campaignId", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  const campaignId = parseInt(Array.isArray(req.params.campaignId) ? req.params.campaignId[0] : req.params.campaignId, 10);
  const [campaign] = await db.select().from(campaignsTable).where(and(eq(campaignsTable.id, campaignId), eq(campaignsTable.tenantId, tenantId)));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  res.json(campaign);
});

router.patch("/tenants/:tenantId/campaigns/:campaignId", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  const campaignId = parseInt(Array.isArray(req.params.campaignId) ? req.params.campaignId[0] : req.params.campaignId, 10);
  const parsed = UpdateCampaignBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [campaign] = await db.update(campaignsTable).set(parsed.data).where(and(eq(campaignsTable.id, campaignId), eq(campaignsTable.tenantId, tenantId))).returning();
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  res.json(campaign);
});

router.delete("/tenants/:tenantId/campaigns/:campaignId", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  const campaignId = parseInt(Array.isArray(req.params.campaignId) ? req.params.campaignId[0] : req.params.campaignId, 10);
  const [campaign] = await db.delete(campaignsTable).where(and(eq(campaignsTable.id, campaignId), eq(campaignsTable.tenantId, tenantId))).returning();
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  res.sendStatus(204);
});

export default router;
