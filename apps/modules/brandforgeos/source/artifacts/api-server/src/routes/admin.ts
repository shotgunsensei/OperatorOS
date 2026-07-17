import { Router, type IRouter } from "express";
import { eq, desc, sql, count, and } from "drizzle-orm";
import { db, tenantsTable, usersTable, membershipsTable, subscriptionsTable, featureFlagsTable, usageRecordsTable, integrationsTable, brandsTable, campaignsTable, copyAssetsTable, calendarItemsTable, auditLogsTable } from "@workspace/db";
import { requirePlatformAdmin } from "../lib/tenant-auth";
import { getPlanLimits } from "../lib/plan-limits";

const router: IRouter = Router();

router.get("/admin/overview", async (req, res): Promise<void> => {
  if (!(await requirePlatformAdmin(req, res))) return;

  const tenants = await db.select().from(tenantsTable).orderBy(desc(tenantsTable.createdAt));
  const users = await db.select().from(usersTable);
  const [{ total: totalUsage }] = await db.select({ total: sql<number>`coalesce(sum(${usageRecordsTable.credits}), 0)` }).from(usageRecordsTable);

  const planDistribution: Record<string, number> = {};
  const statusDistribution: Record<string, number> = {};
  tenants.forEach(t => {
    planDistribution[t.plan] = (planDistribution[t.plan] || 0) + 1;
    statusDistribution[t.billingStatus] = (statusDistribution[t.billingStatus] || 0) + 1;
  });

  const recentTenants = tenants.slice(0, 10).map(t => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    plan: t.plan,
    billingStatus: t.billingStatus,
    aiCreditsUsed: t.aiCreditsUsed,
    aiCreditsLimit: t.aiCreditsLimit,
    onboardingCompleted: t.onboardingCompleted,
    activationScore: t.activationScore,
    createdAt: t.createdAt.toISOString(),
  }));

  res.json({
    totalTenants: tenants.length,
    totalUsers: users.length,
    totalAiCreditsUsed: totalUsage,
    planDistribution: Object.entries(planDistribution).map(([plan, count]) => ({ plan, count })),
    statusDistribution: Object.entries(statusDistribution).map(([status, count]) => ({ status, count })),
    recentTenants,
    metrics: {
      activeTenants: tenants.filter(t => t.billingStatus === "active").length,
      trialTenants: tenants.filter(t => t.trialEndsAt && t.trialEndsAt > new Date()).length,
      onboardedTenants: tenants.filter(t => t.onboardingCompleted).length,
      paidTenants: tenants.filter(t => t.plan !== "free").length,
    },
  });
});

router.get("/admin/tenants", async (req, res): Promise<void> => {
  if (!(await requirePlatformAdmin(req, res))) return;

  const tenants = await db.select().from(tenantsTable).orderBy(desc(tenantsTable.createdAt));
  res.json(tenants.map(t => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    plan: t.plan,
    billingStatus: t.billingStatus,
    aiCreditsUsed: t.aiCreditsUsed,
    aiCreditsLimit: t.aiCreditsLimit,
    storageUsedMb: t.storageUsedMb,
    storageLimitMb: t.storageLimitMb,
    onboardingCompleted: t.onboardingCompleted,
    activationScore: t.activationScore,
    trialEndsAt: t.trialEndsAt?.toISOString() || null,
    createdAt: t.createdAt.toISOString(),
  })));
});

router.get("/admin/feature-flags", async (req, res): Promise<void> => {
  if (!(await requirePlatformAdmin(req, res))) return;
  const flags = await db.select().from(featureFlagsTable).orderBy(featureFlagsTable.key);
  res.json(flags);
});

router.put("/admin/feature-flags/:key", async (req, res): Promise<void> => {
  if (!(await requirePlatformAdmin(req, res))) return;
  const key = req.params.key as string;
  const { isEnabled, targetPlans } = req.body;

  const [existing] = await db.select().from(featureFlagsTable).where(eq(featureFlagsTable.key, key)).limit(1);

  if (existing) {
    const [flag] = await db.update(featureFlagsTable).set({
      isEnabled: isEnabled !== undefined ? isEnabled : existing.isEnabled,
      targetPlans: targetPlans || existing.targetPlans,
    }).where(eq(featureFlagsTable.id, existing.id)).returning();
    res.json(flag);
  } else {
    const [flag] = await db.insert(featureFlagsTable).values({
      key,
      name: req.body.name || key,
      description: req.body.description || "",
      isEnabled: isEnabled || false,
      targetPlans: targetPlans || [],
    }).returning();
    res.json(flag);
  }
});

router.get("/admin/tenants/:tenantId", async (req, res): Promise<void> => {
  if (!(await requirePlatformAdmin(req, res))) return;
  const tenantId = parseInt(req.params.tenantId as string, 10);

  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId));
  if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }

  const members = await db.select({
    id: membershipsTable.id,
    userId: membershipsTable.userId,
    role: membershipsTable.role,
    email: usersTable.email,
    firstName: usersTable.firstName,
    lastName: usersTable.lastName,
  }).from(membershipsTable)
    .leftJoin(usersTable, eq(membershipsTable.userId, usersTable.id))
    .where(eq(membershipsTable.tenantId, tenantId));

  const [sub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.tenantId, tenantId)).limit(1);
  const brands = await db.select({ id: brandsTable.id }).from(brandsTable).where(eq(brandsTable.tenantId, tenantId));
  const campaigns = await db.select({ id: campaignsTable.id }).from(campaignsTable).where(eq(campaignsTable.tenantId, tenantId));

  res.json({
    ...tenant,
    createdAt: tenant.createdAt.toISOString(),
    updatedAt: tenant.updatedAt.toISOString(),
    trialEndsAt: tenant.trialEndsAt?.toISOString() || null,
    members,
    subscription: sub ? {
      ...sub,
      currentPeriodStart: sub.currentPeriodStart?.toISOString() || null,
      currentPeriodEnd: sub.currentPeriodEnd?.toISOString() || null,
      trialEndsAt: sub.trialEndsAt?.toISOString() || null,
      cancelledAt: sub.cancelledAt?.toISOString() || null,
      createdAt: sub.createdAt.toISOString(),
    } : null,
    stats: { brands: brands.length, campaigns: campaigns.length, members: members.length },
  });
});

router.put("/admin/tenants/:tenantId", async (req, res): Promise<void> => {
  if (!(await requirePlatformAdmin(req, res))) return;
  const tenantId = parseInt(req.params.tenantId as string, 10);
  if (!Number.isFinite(tenantId)) { res.status(400).json({ error: "Invalid tenant ID" }); return; }

  const { name, slug, billingStatus } = req.body;
  const validStatuses = ["active", "suspended", "cancelled", "past_due"];
  const updates: Record<string, any> = {};
  if (name && typeof name === "string" && name.trim()) updates.name = name.trim();
  if (slug && typeof slug === "string" && /^[a-z0-9-]+$/.test(slug)) updates.slug = slug;
  if (billingStatus && validStatuses.includes(billingStatus)) updates.billingStatus = billingStatus;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" }); return;
  }

  const [updated] = await db.update(tenantsTable).set(updates).where(eq(tenantsTable.id, tenantId)).returning();
  if (!updated) { res.status(404).json({ error: "Tenant not found" }); return; }
  res.json({ success: true, tenant: updated });
});

router.put("/admin/tenants/:tenantId/plan", async (req, res): Promise<void> => {
  if (!(await requirePlatformAdmin(req, res))) return;
  const tenantId = parseInt(req.params.tenantId as string, 10);
  if (!Number.isFinite(tenantId)) { res.status(400).json({ error: "Invalid tenant ID" }); return; }

  const { plan, billingCycle } = req.body;
  if (!plan || !["free", "starter", "growth", "agency", "enterprise"].includes(plan)) {
    res.status(400).json({ error: "Invalid plan. Must be: free, starter, growth, agency, or enterprise" }); return;
  }

  const limits = getPlanLimits(plan);
  const now = new Date();
  const periodEnd = new Date(now);
  const cycle = billingCycle && ["monthly", "annual"].includes(billingCycle) ? billingCycle : "monthly";
  periodEnd.setMonth(periodEnd.getMonth() + (cycle === "annual" ? 12 : 1));

  const [existing] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.tenantId, tenantId)).limit(1);

  if (existing) {
    await db.update(subscriptionsTable).set({
      plan,
      billingCycle: cycle,
      status: "active",
      monthlyPrice: limits.monthlyPrice,
      annualPrice: limits.annualPrice,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelledAt: null,
    }).where(eq(subscriptionsTable.id, existing.id));
  } else {
    await db.insert(subscriptionsTable).values({
      tenantId,
      plan,
      billingCycle: cycle,
      status: "active",
      monthlyPrice: limits.monthlyPrice,
      annualPrice: limits.annualPrice,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    });
  }

  const [tenant] = await db.update(tenantsTable).set({
    plan,
    aiCreditsLimit: limits.aiCredits,
    storageLimitMb: limits.storageMb,
    exportsLimit: limits.exports === -1 ? 999999 : limits.exports,
    publishedPagesLimit: limits.publishedPages === -1 ? 999999 : limits.publishedPages,
    billingStatus: "active",
  }).where(eq(tenantsTable.id, tenantId)).returning();

  if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }
  res.json({ success: true, tenant, limits });
});

router.delete("/admin/tenants/:tenantId", async (req, res): Promise<void> => {
  if (!(await requirePlatformAdmin(req, res))) return;
  const tenantId = parseInt(req.params.tenantId as string, 10);
  if (!Number.isFinite(tenantId)) { res.status(400).json({ error: "Invalid tenant ID" }); return; }

  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId));
  if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }

  await db.delete(membershipsTable).where(eq(membershipsTable.tenantId, tenantId));
  await db.delete(subscriptionsTable).where(eq(subscriptionsTable.tenantId, tenantId));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));

  res.json({ success: true, message: `Tenant "${tenant.name}" deleted` });
});

router.put("/admin/tenants/:tenantId/credits", async (req, res): Promise<void> => {
  if (!(await requirePlatformAdmin(req, res))) return;
  const tenantId = parseInt(req.params.tenantId as string, 10);
  if (!Number.isFinite(tenantId)) { res.status(400).json({ error: "Invalid tenant ID" }); return; }

  const { aiCreditsUsed, aiCreditsLimit } = req.body;
  const updates: Record<string, any> = {};
  if (aiCreditsUsed !== undefined && Number.isFinite(Number(aiCreditsUsed)) && Number(aiCreditsUsed) >= 0) updates.aiCreditsUsed = Number(aiCreditsUsed);
  if (aiCreditsLimit !== undefined && Number.isFinite(Number(aiCreditsLimit)) && Number(aiCreditsLimit) >= 0) updates.aiCreditsLimit = Number(aiCreditsLimit);

  const [updated] = await db.update(tenantsTable).set(updates).where(eq(tenantsTable.id, tenantId)).returning();
  if (!updated) { res.status(404).json({ error: "Tenant not found" }); return; }
  res.json({ success: true, tenant: updated });
});

router.get("/admin/integrations-health", async (req, res): Promise<void> => {
  if (!(await requirePlatformAdmin(req, res))) return;

  const integrations = await db.select().from(integrationsTable);
  const providerCounts: Record<string, { connected: number; errored: number; total: number }> = {};
  integrations.forEach(i => {
    if (!providerCounts[i.provider]) providerCounts[i.provider] = { connected: 0, errored: 0, total: 0 };
    providerCounts[i.provider].total++;
    if (i.status === "connected") providerCounts[i.provider].connected++;
    if (i.status === "error") providerCounts[i.provider].errored++;
  });

  res.json(Object.entries(providerCounts).map(([provider, counts]) => ({ provider, ...counts })));
});

export default router;
