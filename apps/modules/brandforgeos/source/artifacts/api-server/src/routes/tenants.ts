import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, tenantsTable, membershipsTable } from "@workspace/db";
import {
  CreateTenantBody,
  GetTenantParams,
  UpdateTenantParams,
  UpdateTenantBody,
  GetOnboardingParams,
  CompleteOnboardingParams,
  CompleteOnboardingBody,
} from "@workspace/api-zod";
import { requireAuth, requireTenantAccess, parseTenantId } from "../lib/tenant-auth";

const router: IRouter = Router();

router.get("/tenants", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  
  const memberships = await db
    .select({ tenantId: membershipsTable.tenantId, role: membershipsTable.role })
    .from(membershipsTable)
    .where(eq(membershipsTable.userId, req.user!.id));
  
  if (memberships.length === 0) {
    res.json([]);
    return;
  }
  
  const tenantIds = memberships.map(m => m.tenantId);
  const tenants = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantIds[0]));
  
  for (let i = 1; i < tenantIds.length; i++) {
    const more = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantIds[i]));
    tenants.push(...more);
  }
  
  res.json(tenants);
});

router.post("/tenants", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  
  const parsed = CreateTenantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  
  const slug = parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  
  const [tenant] = await db.insert(tenantsTable).values({
    name: parsed.data.name,
    slug: slug + "-" + Date.now(),
    industry: parsed.data.industry,
    businessType: parsed.data.businessType,
  }).returning();
  
  await db.insert(membershipsTable).values({
    userId: req.user!.id,
    tenantId: tenant.id,
    role: "owner",
  });
  
  res.status(201).json(tenant);
});

router.get("/tenants/:tenantId", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  
  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId));
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  res.json(tenant);
});

router.patch("/tenants/:tenantId", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  
  const parsed = UpdateTenantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  
  const [tenant] = await db.update(tenantsTable).set(parsed.data).where(eq(tenantsTable.id, tenantId)).returning();
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  res.json(tenant);
});

router.get("/tenants/:tenantId/onboarding", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  
  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId));
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  
  const data = tenant.onboardingData ? JSON.parse(tenant.onboardingData) : {};
  res.json({
    completed: tenant.onboardingCompleted,
    businessName: data.businessName || tenant.name,
    industry: data.industry || tenant.industry,
    businessType: data.businessType || tenant.businessType,
    products: data.products || null,
    idealCustomer: data.idealCustomer || null,
    geoMarket: data.geoMarket || null,
    tone: data.tone || null,
    competitors: data.competitors || null,
    goals: data.goals || [],
    channels: data.channels || [],
    brandColors: data.brandColors || [],
    brandSummary: data.brandSummary || null,
    icpSummary: data.icpSummary || null,
    messagingPillars: data.messagingPillars || [],
    recommendedCampaign: data.recommendedCampaign || null,
  });
});

router.post("/tenants/:tenantId/onboarding", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  
  const parsed = CompleteOnboardingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  
  const onboardingData = JSON.stringify(parsed.data);
  
  await db.update(tenantsTable).set({
    name: parsed.data.businessName,
    industry: parsed.data.industry,
    businessType: parsed.data.businessType,
    onboardingCompleted: true,
    onboardingData,
  }).where(eq(tenantsTable.id, tenantId));
  
  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId));
  const data = JSON.parse(tenant.onboardingData || "{}");
  
  res.json({
    completed: true,
    businessName: data.businessName,
    industry: data.industry,
    businessType: data.businessType,
    products: data.products || null,
    idealCustomer: data.idealCustomer || null,
    geoMarket: data.geoMarket || null,
    tone: data.tone || null,
    competitors: data.competitors || null,
    goals: data.goals || [],
    channels: data.channels || [],
    brandColors: data.brandColors || [],
    brandSummary: data.brandSummary || null,
    icpSummary: data.icpSummary || null,
    messagingPillars: data.messagingPillars || [],
    recommendedCampaign: data.recommendedCampaign || null,
  });
});

router.get("/tenants/:tenantId/members", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  
  const members = await db
    .select()
    .from(membershipsTable)
    .where(eq(membershipsTable.tenantId, tenantId));
  
  res.json(members.map(m => ({
    id: m.id,
    userId: m.userId,
    tenantId: m.tenantId,
    role: m.role,
    userName: null,
    userEmail: null,
    userImage: null,
    createdAt: m.createdAt.toISOString(),
  })));
});

router.get("/tenants/:tenantId/usage", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  
  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId));
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  
  const { usageRecordsTable } = await import("@workspace/db");
  const records = await db
    .select()
    .from(usageRecordsTable)
    .where(eq(usageRecordsTable.tenantId, tenantId))
    .orderBy(usageRecordsTable.createdAt)
    .limit(50);
  
  res.json({
    creditsUsed: tenant.aiCreditsUsed,
    creditsLimit: tenant.aiCreditsLimit,
    plan: tenant.plan,
    usageHistory: records.map(r => ({
      date: r.createdAt.toISOString(),
      credits: r.credits,
      action: r.action,
    })),
  });
});

export default router;
