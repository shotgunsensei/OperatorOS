import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, personasTable } from "@workspace/db";
import { CreatePersonaBody, UpdatePersonaBody } from "@workspace/api-zod";
import { requireTenantAccess, parseTenantId } from "../lib/tenant-auth";

const router: IRouter = Router();

router.get("/tenants/:tenantId/personas", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  const personas = await db.select().from(personasTable).where(eq(personasTable.tenantId, tenantId));
  res.json(personas);
});

router.post("/tenants/:tenantId/personas", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  const parsed = CreatePersonaBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [persona] = await db.insert(personasTable).values({ ...parsed.data, tenantId }).returning();
  res.status(201).json(persona);
});

router.patch("/tenants/:tenantId/personas/:personaId", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  const personaId = parseInt(Array.isArray(req.params.personaId) ? req.params.personaId[0] : req.params.personaId, 10);
  const parsed = UpdatePersonaBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [persona] = await db.update(personasTable).set(parsed.data).where(and(eq(personasTable.id, personaId), eq(personasTable.tenantId, tenantId))).returning();
  if (!persona) { res.status(404).json({ error: "Persona not found" }); return; }
  res.json(persona);
});

router.delete("/tenants/:tenantId/personas/:personaId", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  const personaId = parseInt(Array.isArray(req.params.personaId) ? req.params.personaId[0] : req.params.personaId, 10);
  const [persona] = await db.delete(personasTable).where(and(eq(personasTable.id, personaId), eq(personasTable.tenantId, tenantId))).returning();
  if (!persona) { res.status(404).json({ error: "Persona not found" }); return; }
  res.sendStatus(204);
});

export default router;
