import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, copyAssetsTable } from "@workspace/db";
import { CreateCopyAssetBody, UpdateCopyAssetBody } from "@workspace/api-zod";
import { requireTenantAccess, parseTenantId } from "../lib/tenant-auth";

const router: IRouter = Router();

router.get("/tenants/:tenantId/copy-assets", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  let assets = await db.select().from(copyAssetsTable).where(eq(copyAssetsTable.tenantId, tenantId)).orderBy(copyAssetsTable.createdAt);
  if (req.query.type && typeof req.query.type === "string") {
    assets = assets.filter(a => a.copyType === req.query.type);
  }
  if (req.query.campaignId) {
    const cid = parseInt(req.query.campaignId as string, 10);
    assets = assets.filter(a => a.campaignId === cid);
  }
  res.json(assets);
});

router.post("/tenants/:tenantId/copy-assets", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  const parsed = CreateCopyAssetBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [asset] = await db.insert(copyAssetsTable).values({ ...parsed.data, tenantId }).returning();
  res.status(201).json(asset);
});

router.patch("/tenants/:tenantId/copy-assets/:copyAssetId", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  const copyAssetId = parseInt(Array.isArray(req.params.copyAssetId) ? req.params.copyAssetId[0] : req.params.copyAssetId, 10);
  const parsed = UpdateCopyAssetBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [asset] = await db.update(copyAssetsTable).set(parsed.data).where(and(eq(copyAssetsTable.id, copyAssetId), eq(copyAssetsTable.tenantId, tenantId))).returning();
  if (!asset) { res.status(404).json({ error: "Copy asset not found" }); return; }
  res.json(asset);
});

router.delete("/tenants/:tenantId/copy-assets/:copyAssetId", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  const copyAssetId = parseInt(Array.isArray(req.params.copyAssetId) ? req.params.copyAssetId[0] : req.params.copyAssetId, 10);
  const [asset] = await db.delete(copyAssetsTable).where(and(eq(copyAssetsTable.id, copyAssetId), eq(copyAssetsTable.tenantId, tenantId))).returning();
  if (!asset) { res.status(404).json({ error: "Copy asset not found" }); return; }
  res.sendStatus(204);
});

export default router;
