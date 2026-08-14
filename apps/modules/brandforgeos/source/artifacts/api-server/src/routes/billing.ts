import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, tenantsTable, subscriptionsTable, billingProfilesTable, invoicesTable, addOnPurchasesTable, creditPacksTable, brandsTable, campaignsTable, membershipsTable } from "@workspace/db";
import { requireTenantAccess, parseTenantId } from "../lib/tenant-auth";
import { requireAuth } from "../lib/tenant-auth";
import { getPlanLimits, ADD_ON_CATALOG } from "../lib/plan-limits";

const router: IRouter = Router();

router.get("/tenants/:tenantId/subscription", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;

  const [sub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.tenantId, tenantId)).limit(1);
  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId));

  if (!sub) {
    const limits = getPlanLimits(tenant?.plan || "free");
    res.json({
      plan: tenant?.plan || "free",
      status: "active",
      billingCycle: "monthly",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      trialEndsAt: tenant?.trialEndsAt?.toISOString() || null,
      cancelledAt: null,
      monthlyPrice: limits.monthlyPrice,
      annualPrice: limits.annualPrice,
      limits,
    });
    return;
  }

  const limits = getPlanLimits(sub.plan);
  res.json({
    id: sub.id,
    plan: sub.plan,
    status: sub.status,
    billingCycle: sub.billingCycle,
    currentPeriodStart: sub.currentPeriodStart?.toISOString() || null,
    currentPeriodEnd: sub.currentPeriodEnd?.toISOString() || null,
    trialEndsAt: sub.trialEndsAt?.toISOString() || null,
    cancelledAt: sub.cancelledAt?.toISOString() || null,
    monthlyPrice: sub.monthlyPrice,
    annualPrice: sub.annualPrice,
    limits,
  });
});

router.post("/tenants/:tenantId/subscription/change", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;

  const { plan, billingCycle } = req.body;
  if (!plan || !["free", "starter", "growth", "agency", "enterprise"].includes(plan)) {
    res.status(400).json({ error: "Invalid plan" });
    return;
  }

  const limits = getPlanLimits(plan);
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + (billingCycle === "annual" ? 12 : 1));

  const [existing] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.tenantId, tenantId)).limit(1);

  if (existing) {
    await db.update(subscriptionsTable).set({
      plan,
      billingCycle: billingCycle || "monthly",
      status: plan === "free" ? "active" : "active",
      monthlyPrice: limits.monthlyPrice,
      annualPrice: limits.annualPrice,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    }).where(eq(subscriptionsTable.id, existing.id));
  } else {
    await db.insert(subscriptionsTable).values({
      tenantId,
      plan,
      billingCycle: billingCycle || "monthly",
      status: "active",
      monthlyPrice: limits.monthlyPrice,
      annualPrice: limits.annualPrice,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      trialEndsAt: plan !== "free" ? new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000) : null,
    });
  }

  await db.update(tenantsTable).set({
    plan,
    aiCreditsLimit: limits.aiCredits,
    storageLimitMb: limits.storageMb,
    exportsLimit: limits.exports === -1 ? 999999 : limits.exports,
    publishedPagesLimit: limits.publishedPages === -1 ? 999999 : limits.publishedPages,
    billingStatus: "active",
  }).where(eq(tenantsTable.id, tenantId));

  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId));
  res.json({ success: true, tenant, limits });
});

router.post("/tenants/:tenantId/subscription/cancel", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;

  const [sub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.tenantId, tenantId)).limit(1);
  if (sub) {
    await db.update(subscriptionsTable).set({ status: "cancelled", cancelledAt: new Date() }).where(eq(subscriptionsTable.id, sub.id));
  }
  res.json({ success: true, message: "Subscription will be cancelled at end of billing period" });
});

router.post("/tenants/:tenantId/subscription/reactivate", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;

  const [sub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.tenantId, tenantId)).limit(1);
  if (sub) {
    await db.update(subscriptionsTable).set({ status: "active", cancelledAt: null }).where(eq(subscriptionsTable.id, sub.id));
  }
  res.json({ success: true });
});

router.get("/tenants/:tenantId/billing-profile", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;

  const [profile] = await db.select().from(billingProfilesTable).where(eq(billingProfilesTable.tenantId, tenantId)).limit(1);
  res.json(profile || { tenantId, email: null, companyName: null });
});

router.put("/tenants/:tenantId/billing-profile", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;

  const [existing] = await db.select().from(billingProfilesTable).where(eq(billingProfilesTable.tenantId, tenantId)).limit(1);
  const data = { ...req.body, tenantId };

  if (existing) {
    const [profile] = await db.update(billingProfilesTable).set(data).where(eq(billingProfilesTable.id, existing.id)).returning();
    res.json(profile);
  } else {
    const [profile] = await db.insert(billingProfilesTable).values(data).returning();
    res.json(profile);
  }
});

router.get("/tenants/:tenantId/invoices", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;

  const invoices = await db.select().from(invoicesTable).where(eq(invoicesTable.tenantId, tenantId)).orderBy(desc(invoicesTable.createdAt)).limit(50);
  res.json(invoices.map(inv => ({
    ...inv,
    periodStart: inv.periodStart?.toISOString() || null,
    periodEnd: inv.periodEnd?.toISOString() || null,
    paidAt: inv.paidAt?.toISOString() || null,
    createdAt: inv.createdAt.toISOString(),
  })));
});

router.get("/tenants/:tenantId/add-ons", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;

  const purchases = await db.select().from(addOnPurchasesTable).where(eq(addOnPurchasesTable.tenantId, tenantId)).orderBy(desc(addOnPurchasesTable.createdAt));
  res.json({
    catalog: ADD_ON_CATALOG,
    purchases: purchases.map(p => ({
      ...p,
      expiresAt: p.expiresAt?.toISOString() || null,
      createdAt: p.createdAt.toISOString(),
    })),
  });
});

router.post("/tenants/:tenantId/add-ons/purchase", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;

  const { addOnId } = req.body;
  const addOn = ADD_ON_CATALOG.find(a => a.id === addOnId);
  if (!addOn) { res.status(400).json({ error: "Invalid add-on" }); return; }

  const [purchase] = await db.insert(addOnPurchasesTable).values({
    tenantId,
    addOnType: addOn.type,
    name: addOn.name,
    unitPrice: addOn.price,
    isRecurring: !!(addOn as any).recurring,
  }).returning();

  if (addOn.type === "ai_credits") {
    await db.insert(creditPacksTable).values({
      tenantId,
      credits: (addOn as any).credits || 0,
      creditsRemaining: (addOn as any).credits || 0,
      price: addOn.price,
      purchasedBy: req.user?.id,
    });
    const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId));
    if (tenant) {
      await db.update(tenantsTable).set({
        aiCreditsLimit: tenant.aiCreditsLimit + ((addOn as any).credits || 0),
      }).where(eq(tenantsTable.id, tenantId));
    }
  }

  res.json({ success: true, purchase });
});

router.get("/tenants/:tenantId/credit-packs", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;

  const packs = await db.select().from(creditPacksTable).where(eq(creditPacksTable.tenantId, tenantId)).orderBy(desc(creditPacksTable.createdAt));
  res.json(packs.map(p => ({
    ...p,
    expiresAt: p.expiresAt?.toISOString() || null,
    createdAt: p.createdAt.toISOString(),
  })));
});

router.get("/tenants/:tenantId/usage-summary", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;

  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId));
  if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }

  const limits = getPlanLimits(tenant.plan);
  const brands = await db.select().from(brandsTable).where(eq(brandsTable.tenantId, tenantId));
  const campaigns = await db.select().from(campaignsTable).where(eq(campaignsTable.tenantId, tenantId));
  const members = await db.select().from(membershipsTable).where(eq(membershipsTable.tenantId, tenantId));

  res.json({
    plan: tenant.plan,
    billingStatus: tenant.billingStatus,
    usage: {
      aiCredits: { used: tenant.aiCreditsUsed, limit: tenant.aiCreditsLimit, percentage: tenant.aiCreditsLimit > 0 ? Math.round((tenant.aiCreditsUsed / tenant.aiCreditsLimit) * 100) : 0 },
      brands: { used: brands.length, limit: limits.brands, percentage: limits.brands > 0 ? Math.round((brands.length / limits.brands) * 100) : 0 },
      campaigns: { used: campaigns.length, limit: limits.campaigns, percentage: limits.campaigns === -1 ? 0 : limits.campaigns > 0 ? Math.round((campaigns.length / limits.campaigns) * 100) : 0 },
      seats: { used: members.length, limit: limits.seats, percentage: limits.seats > 0 ? Math.round((members.length / limits.seats) * 100) : 0 },
      storage: { used: tenant.storageUsedMb, limit: tenant.storageLimitMb, percentage: tenant.storageLimitMb > 0 ? Math.round((tenant.storageUsedMb / tenant.storageLimitMb) * 100) : 0 },
      exports: { used: tenant.exportsUsed, limit: tenant.exportsLimit, percentage: tenant.exportsLimit > 0 ? Math.round((tenant.exportsUsed / tenant.exportsLimit) * 100) : 0 },
      publishedPages: { used: tenant.publishedPagesUsed, limit: tenant.publishedPagesLimit, percentage: tenant.publishedPagesLimit > 0 ? Math.round((tenant.publishedPagesUsed / tenant.publishedPagesLimit) * 100) : 0 },
    },
    activationScore: tenant.activationScore,
    trialEndsAt: tenant.trialEndsAt?.toISOString() || null,
  });
});

export default router;
