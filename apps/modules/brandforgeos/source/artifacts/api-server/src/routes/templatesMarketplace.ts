import { Router, type IRouter } from "express";
import { eq, and, desc, or, isNull } from "drizzle-orm";
import { db, templatesTable } from "@workspace/db";
import { requireTenantAccess, parseTenantId, requireAuth } from "../lib/tenant-auth";

const router: IRouter = Router();

router.get("/templates", async (req, res): Promise<void> => {
  const category = req.query.category as string | undefined;
  const type = req.query.type as string | undefined;

  let query = db.select().from(templatesTable).where(
    or(eq(templatesTable.isGlobal, true), isNull(templatesTable.tenantId))
  ).orderBy(desc(templatesTable.createdAt));

  const templates = await query;
  let filtered = templates;
  if (category) filtered = filtered.filter(t => t.category === category);
  if (type) filtered = filtered.filter(t => t.templateType === type);

  res.json(filtered);
});

router.get("/tenants/:tenantId/templates", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;

  const global = await db.select().from(templatesTable).where(eq(templatesTable.isGlobal, true)).orderBy(desc(templatesTable.createdAt));
  const tenant = await db.select().from(templatesTable).where(eq(templatesTable.tenantId, tenantId)).orderBy(desc(templatesTable.createdAt));

  res.json([...global, ...tenant]);
});

router.get("/tenants/:tenantId/templates/:templateId", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  const templateId = parseInt(req.params.templateId as string, 10);

  const [template] = await db.select().from(templatesTable).where(
    and(eq(templatesTable.id, templateId), or(eq(templatesTable.tenantId, tenantId), eq(templatesTable.isGlobal, true)))
  );
  if (!template) { res.status(404).json({ error: "Template not found" }); return; }
  res.json(template);
});

router.post("/tenants/:tenantId/templates", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;

  const { name, description, category, templateType, content, tags } = req.body;
  const [template] = await db.insert(templatesTable).values({
    tenantId,
    name,
    description,
    category: category || "general",
    templateType: templateType || "campaign",
    content: typeof content === "string" ? content : JSON.stringify(content),
    tags: tags || [],
    isGlobal: false,
    isPremium: false,
  }).returning();

  res.status(201).json(template);
});

router.post("/tenants/:tenantId/templates/:templateId/use", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  const templateId = parseInt(req.params.templateId as string, 10);

  const [template] = await db.select().from(templatesTable).where(
    and(eq(templatesTable.id, templateId), or(eq(templatesTable.tenantId, tenantId), eq(templatesTable.isGlobal, true)))
  );
  if (!template) { res.status(404).json({ error: "Template not found" }); return; }

  await db.update(templatesTable).set({ usageCount: (template.usageCount || 0) + 1 }).where(eq(templatesTable.id, templateId));

  res.json({ success: true, template });
});

export default router;
