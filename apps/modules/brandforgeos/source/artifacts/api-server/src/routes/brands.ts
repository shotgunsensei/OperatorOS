import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, brandsTable } from "@workspace/db";
import {
  CreateBrandBody,
  UpdateBrandBody,
} from "@workspace/api-zod";
import { requireTenantAccess, parseTenantId } from "../lib/tenant-auth";

const router: IRouter = Router();

router.get("/tenants/:tenantId/brands", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  
  const brands = await db.select().from(brandsTable).where(eq(brandsTable.tenantId, tenantId)).orderBy(brandsTable.createdAt);
  res.json(brands);
});

router.post("/tenants/:tenantId/brands", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  
  const parsed = CreateBrandBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  
  const [brand] = await db.insert(brandsTable).values({ ...parsed.data, tenantId }).returning();
  res.status(201).json(brand);
});

router.get("/tenants/:tenantId/brands/:brandId", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  
  const brandId = parseInt(Array.isArray(req.params.brandId) ? req.params.brandId[0] : req.params.brandId, 10);
  const [brand] = await db.select().from(brandsTable).where(and(eq(brandsTable.id, brandId), eq(brandsTable.tenantId, tenantId)));
  if (!brand) {
    res.status(404).json({ error: "Brand not found" });
    return;
  }
  res.json(brand);
});

router.patch("/tenants/:tenantId/brands/:brandId", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  
  const brandId = parseInt(Array.isArray(req.params.brandId) ? req.params.brandId[0] : req.params.brandId, 10);
  const parsed = UpdateBrandBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  
  const [brand] = await db.update(brandsTable).set(parsed.data).where(and(eq(brandsTable.id, brandId), eq(brandsTable.tenantId, tenantId))).returning();
  if (!brand) {
    res.status(404).json({ error: "Brand not found" });
    return;
  }
  res.json(brand);
});

router.delete("/tenants/:tenantId/brands/:brandId", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  
  const brandId = parseInt(Array.isArray(req.params.brandId) ? req.params.brandId[0] : req.params.brandId, 10);
  const [brand] = await db.delete(brandsTable).where(and(eq(brandsTable.id, brandId), eq(brandsTable.tenantId, tenantId))).returning();
  if (!brand) {
    res.status(404).json({ error: "Brand not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
