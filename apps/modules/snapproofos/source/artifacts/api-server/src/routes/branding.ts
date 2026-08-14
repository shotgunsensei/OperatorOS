import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, brandingTable } from "@workspace/db";
import { UpdateBrandingBody } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { logActivity } from "../lib/activity";

const router: IRouter = Router();

router.get("/branding", requireAuth, async (req, res): Promise<void> => {
  const orgId = (req as any).organizationId;
  if (!orgId) { res.status(404).json({ error: "No organization" }); return; }

  const [branding] = await db.select().from(brandingTable).where(eq(brandingTable.organizationId, orgId));
  if (!branding) {
    res.json({
      id: 0,
      organizationId: orgId,
      logoUrl: null,
      accentColor: "#dc2626",
      companyName: "My Company",
      footerText: null,
      contactEmail: null,
      contactPhone: null,
      website: null,
      headerHtml: null,
      footerHtml: null,
    });
    return;
  }
  res.json(branding);
});

router.patch("/branding", requireAuth, async (req, res): Promise<void> => {
  const orgId = (req as any).organizationId;
  const userId = (req as any).userId;
  if (!orgId) { res.status(400).json({ error: "No organization" }); return; }

  const parsed = UpdateBrandingBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updates: any = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) updates[key] = value;
  }

  const [existing] = await db.select().from(brandingTable).where(eq(brandingTable.organizationId, orgId));
  if (!existing) {
    const [branding] = await db.insert(brandingTable).values({
      organizationId: orgId,
      companyName: updates.companyName || "My Company",
      ...updates,
    }).returning();
    res.json(branding);
    return;
  }

  const [branding] = await db.update(brandingTable).set(updates).where(eq(brandingTable.organizationId, orgId)).returning();
  await logActivity(db, orgId, userId, "updated", "branding", branding.id, "Branding");
  res.json(branding);
});

export default router;
