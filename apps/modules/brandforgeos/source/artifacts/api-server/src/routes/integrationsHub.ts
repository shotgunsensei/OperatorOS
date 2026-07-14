import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, integrationsTable, syncJobsTable } from "@workspace/db";
import { requireTenantAccess, parseTenantId } from "../lib/tenant-auth";

const router: IRouter = Router();

const INTEGRATION_CATALOG = [
  { provider: "meta_ads", name: "Meta Ads", description: "Facebook & Instagram advertising", category: "advertising", icon: "meta", requiredPlan: "starter" },
  { provider: "google_ads", name: "Google Ads", description: "Search & display campaigns", category: "advertising", icon: "google", requiredPlan: "starter" },
  { provider: "linkedin", name: "LinkedIn", description: "Professional network ads & organic posts", category: "social", icon: "linkedin", requiredPlan: "growth" },
  { provider: "tiktok", name: "TikTok", description: "Short-form video advertising", category: "social", icon: "tiktok", requiredPlan: "growth" },
  { provider: "mailchimp", name: "Mailchimp", description: "Email marketing automation", category: "email", icon: "mailchimp", requiredPlan: "starter" },
  { provider: "smtp", name: "SMTP / Email", description: "Generic email provider via SMTP", category: "email", icon: "mail", requiredPlan: "starter" },
  { provider: "webhooks", name: "Webhooks", description: "Custom webhook endpoints for events", category: "developer", icon: "webhook", requiredPlan: "growth" },
  { provider: "hubspot", name: "HubSpot", description: "CRM & marketing automation", category: "crm", icon: "hubspot", requiredPlan: "growth" },
  { provider: "salesforce", name: "Salesforce", description: "Enterprise CRM integration", category: "crm", icon: "salesforce", requiredPlan: "agency" },
  { provider: "google_analytics", name: "Google Analytics", description: "Website analytics tracking", category: "analytics", icon: "analytics", requiredPlan: "starter" },
  { provider: "slack", name: "Slack", description: "Team notifications & alerts", category: "communication", icon: "slack", requiredPlan: "growth" },
  { provider: "zapier", name: "Zapier", description: "Connect with 5,000+ apps", category: "developer", icon: "zapier", requiredPlan: "growth" },
];

router.get("/tenants/:tenantId/integrations", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;

  const connected = await db.select().from(integrationsTable).where(eq(integrationsTable.tenantId, tenantId));
  const connectedMap = new Map(connected.map(c => [c.provider, c]));

  const result = INTEGRATION_CATALOG.map(cat => {
    const conn = connectedMap.get(cat.provider);
    return {
      ...cat,
      id: conn?.id || null,
      status: conn?.status || "disconnected",
      accountName: conn?.accountName || null,
      accountId: conn?.accountId || null,
      lastSyncAt: conn?.lastSyncAt?.toISOString() || null,
      isEnabled: conn?.isEnabled || false,
      errorMessage: conn?.errorMessage || null,
      connectedAt: conn?.connectedAt?.toISOString() || null,
    };
  });

  res.json(result);
});

router.post("/tenants/:tenantId/integrations/:provider/connect", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  const provider = req.params.provider as string;

  const [existing] = await db.select().from(integrationsTable).where(and(eq(integrationsTable.tenantId, tenantId), eq(integrationsTable.provider, provider))).limit(1);

  if (existing) {
    const [updated] = await db.update(integrationsTable).set({
      status: "connected",
      isEnabled: true,
      accountName: `${provider} Account`,
      accountId: `${provider}_${tenantId}_${Date.now()}`,
      connectedAt: new Date(),
      errorMessage: null,
    }).where(eq(integrationsTable.id, existing.id)).returning();
    res.json(updated);
  } else {
    const [created] = await db.insert(integrationsTable).values({
      tenantId,
      provider,
      status: "connected",
      isEnabled: true,
      accountName: `${provider} Account`,
      accountId: `${provider}_${tenantId}_${Date.now()}`,
      connectedAt: new Date(),
    }).returning();
    res.json(created);
  }
});

router.post("/tenants/:tenantId/integrations/:provider/disconnect", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  const provider = req.params.provider as string;

  await db.update(integrationsTable).set({
    status: "disconnected",
    isEnabled: false,
    accountName: null,
    accountId: null,
    connectedAt: null,
  }).where(and(eq(integrationsTable.tenantId, tenantId), eq(integrationsTable.provider, provider)));

  res.json({ success: true });
});

router.post("/tenants/:tenantId/integrations/:provider/sync", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  const provider = req.params.provider as string;

  const [integration] = await db.select().from(integrationsTable).where(and(eq(integrationsTable.tenantId, tenantId), eq(integrationsTable.provider, provider))).limit(1);

  if (!integration || integration.status !== "connected") {
    res.status(400).json({ error: "Integration not connected" });
    return;
  }

  const [job] = await db.insert(syncJobsTable).values({
    tenantId,
    integrationId: integration.id,
    jobType: `sync_${provider}`,
    status: "completed",
    progress: 100,
    totalItems: Math.floor(Math.random() * 50) + 10,
    processedItems: Math.floor(Math.random() * 50) + 10,
    startedAt: new Date(),
    completedAt: new Date(),
  }).returning();

  await db.update(integrationsTable).set({ lastSyncAt: new Date() }).where(eq(integrationsTable.id, integration.id));

  res.json({ success: true, job });
});

router.get("/tenants/:tenantId/integrations/:provider/sync-history", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;

  const [integration] = await db.select().from(integrationsTable).where(and(eq(integrationsTable.tenantId, tenantId), eq(integrationsTable.provider, req.params.provider as string))).limit(1);

  if (!integration) { res.json([]); return; }

  const jobs = await db.select().from(syncJobsTable).where(eq(syncJobsTable.integrationId, integration.id)).orderBy(syncJobsTable.createdAt).limit(20);
  res.json(jobs.map(j => ({
    ...j,
    startedAt: j.startedAt?.toISOString() || null,
    completedAt: j.completedAt?.toISOString() || null,
    createdAt: j.createdAt.toISOString(),
  })));
});

export default router;
