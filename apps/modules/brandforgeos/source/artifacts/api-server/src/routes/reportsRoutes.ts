import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, reportsTable, exportJobsTable } from "@workspace/db";
import { requireTenantAccess, parseTenantId } from "../lib/tenant-auth";

const router: IRouter = Router();

router.get("/tenants/:tenantId/reports", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;

  const reports = await db.select().from(reportsTable).where(eq(reportsTable.tenantId, tenantId)).orderBy(desc(reportsTable.createdAt));
  res.json(reports.map(r => ({
    ...r,
    generatedAt: r.generatedAt?.toISOString() || null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  })));
});

router.post("/tenants/:tenantId/reports", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;

  const { name, reportType, dateRange, brandId, campaignId, sections, isWhiteLabel, brandingLogo, brandingColor, brandingCompanyName } = req.body;

  const [report] = await db.insert(reportsTable).values({
    tenantId,
    name: name || "Untitled Report",
    reportType: reportType || "campaign_summary",
    dateRange,
    brandId,
    campaignId,
    sections: typeof sections === "string" ? sections : JSON.stringify(sections || []),
    isWhiteLabel: isWhiteLabel || false,
    brandingLogo,
    brandingColor,
    brandingCompanyName,
  }).returning();

  res.status(201).json({
    ...report,
    generatedAt: report.generatedAt?.toISOString() || null,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
  });
});

router.get("/tenants/:tenantId/reports/:reportId", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  const reportId = parseInt(req.params.reportId as string, 10);

  const [report] = await db.select().from(reportsTable).where(and(eq(reportsTable.id, reportId), eq(reportsTable.tenantId, tenantId)));
  if (!report) { res.status(404).json({ error: "Report not found" }); return; }
  res.json({
    ...report,
    generatedAt: report.generatedAt?.toISOString() || null,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
  });
});

router.post("/tenants/:tenantId/reports/:reportId/generate", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;
  const reportId = parseInt(req.params.reportId as string, 10);

  await db.update(reportsTable).set({ status: "generated", generatedAt: new Date() }).where(and(eq(reportsTable.id, reportId), eq(reportsTable.tenantId, tenantId)));
  const [report] = await db.select().from(reportsTable).where(and(eq(reportsTable.id, reportId), eq(reportsTable.tenantId, tenantId)));

  res.json({
    ...report,
    generatedAt: report.generatedAt?.toISOString() || null,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
  });
});

router.get("/tenants/:tenantId/exports", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;

  const exports = await db.select().from(exportJobsTable).where(eq(exportJobsTable.tenantId, tenantId)).orderBy(desc(exportJobsTable.createdAt)).limit(50);
  res.json(exports.map(e => ({
    ...e,
    createdAt: e.createdAt.toISOString(),
    completedAt: e.completedAt?.toISOString() || null,
  })));
});

router.post("/tenants/:tenantId/exports", async (req, res): Promise<void> => {
  const tenantId = parseTenantId(req);
  if (!(await requireTenantAccess(req, res, tenantId))) return;

  const { exportType, format, entityType, entityId } = req.body;

  const [job] = await db.insert(exportJobsTable).values({
    tenantId,
    exportType: exportType || "report",
    format: format || "pdf",
    status: "completed",
    entityType,
    entityId,
    fileName: `export_${Date.now()}.${format || "pdf"}`,
    completedAt: new Date(),
  }).returning();

  res.json({
    ...job,
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt?.toISOString() || null,
  });
});

export default router;
