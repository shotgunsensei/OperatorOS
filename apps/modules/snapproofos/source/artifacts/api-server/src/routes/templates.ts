import { Router, type IRouter } from "express";
import { eq, or, isNull } from "drizzle-orm";
import { db, templatesTable } from "@workspace/db";
import { CreateTemplateBody } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
}

router.get("/templates", requireAuth, async (req, res): Promise<void> => {
  const orgId = (req as any).organizationId;
  const templates = await db.select().from(templatesTable).where(
    or(eq(templatesTable.isSystem, true), orgId ? eq(templatesTable.organizationId, String(orgId)) : isNull(templatesTable.organizationId))
  );
  res.json(templates);
});

router.post("/templates", requireAuth, async (req, res): Promise<void> => {
  const orgId = (req as any).organizationId;
  const parsed = CreateTemplateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [template] = await db.insert(templatesTable).values({
    organizationId: orgId ? String(orgId) : null,
    name: parsed.data.name,
    description: parsed.data.description || null,
    industry: parsed.data.industry,
    icon: parsed.data.icon || "clipboard",
    defaultJobType: parsed.data.defaultJobType,
    sections: parsed.data.sections || [],
    isSystem: false,
  }).returning();
  res.status(201).json(template);
});

router.get("/templates/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const [template] = await db.select().from(templatesTable).where(eq(templatesTable.id, id));
  if (!template) { res.status(404).json({ error: "Template not found" }); return; }
  res.json(template);
});

export default router;
