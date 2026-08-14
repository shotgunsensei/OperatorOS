import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, organizationsTable, usersTable, brandingTable, teamMembersTable } from "@workspace/db";
import { CreateOrganizationBody, UpdateOrganizationBody } from "@workspace/api-zod";
import { requireAuth, generateToken } from "../lib/auth";

const router: IRouter = Router();

router.post("/organizations", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateOrganizationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = (req as any).userId;
  const { name, accentColor } = parsed.data;
  const slug = (parsed.data.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-")).replace(/(^-|-$)/g, "") || "org-" + Date.now();

  const [org] = await db.insert(organizationsTable).values({
    name,
    slug,
    accentColor: accentColor || "#dc2626",
  }).returning();

  await db.update(usersTable).set({ organizationId: org.id, hasCompletedOnboarding: true }).where(eq(usersTable.id, userId));

  await db.insert(teamMembersTable).values({
    organizationId: org.id,
    userId,
    role: "owner",
    status: "active",
  });

  await db.insert(brandingTable).values({
    organizationId: org.id,
    companyName: name,
    accentColor: accentColor || "#dc2626",
  });

  const token = generateToken({ userId, organizationId: org.id });
  const isProduction = process.env.NODE_ENV === "production";
  res.cookie("token", token, { httpOnly: true, secure: isProduction, sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000 });

  res.status(201).json({
    id: org.id,
    name: org.name,
    slug: org.slug,
    logoUrl: org.logoUrl,
    accentColor: org.accentColor,
    createdAt: org.createdAt,
  });
});

router.get("/organizations/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, id));
  if (!org) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }
  res.json({
    id: org.id,
    name: org.name,
    slug: org.slug,
    logoUrl: org.logoUrl,
    accentColor: org.accentColor,
    createdAt: org.createdAt,
  });
});

router.patch("/organizations/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = UpdateOrganizationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updates: any = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.accentColor !== undefined) updates.accentColor = parsed.data.accentColor;
  if (parsed.data.logoUrl !== undefined) updates.logoUrl = parsed.data.logoUrl;

  const [org] = await db.update(organizationsTable).set(updates).where(eq(organizationsTable.id, id)).returning();
  if (!org) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }
  res.json({
    id: org.id,
    name: org.name,
    slug: org.slug,
    logoUrl: org.logoUrl,
    accentColor: org.accentColor,
    createdAt: org.createdAt,
  });
});

export default router;
