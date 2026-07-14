import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, exportsTable, reportsTable, jobsTable } from "@workspace/db";
import { CreateExportBody } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { logActivity } from "../lib/activity";

const router: IRouter = Router();

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
}

router.get("/exports", requireAuth, async (req, res): Promise<void> => {
  const orgId = (req as any).organizationId;
  if (!orgId) { res.json([]); return; }

  const limit = parseInt((req.query.limit as string) || "50", 10);
  const offset = parseInt((req.query.offset as string) || "0", 10);

  const exports = await db.select().from(exportsTable).where(eq(exportsTable.organizationId, orgId)).orderBy(desc(exportsTable.createdAt)).limit(limit).offset(offset);

  const enriched = await Promise.all(exports.map(async (e) => {
    const [report] = await db.select().from(reportsTable).where(eq(reportsTable.id, e.reportId));
    let jobTitle = "Unknown";
    if (report) {
      const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, report.jobId));
      if (job) jobTitle = job.title;
    }
    return { ...e, jobTitle };
  }));

  res.json(enriched);
});

router.post("/reports/:reportId/export", requireAuth, async (req, res): Promise<void> => {
  const reportId = parseId(req.params.reportId);
  const orgId = (req as any).organizationId;
  const userId = (req as any).userId;
  if (!orgId) { res.status(400).json({ error: "No organization" }); return; }

  const parsed = CreateExportBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [report] = await db.select().from(reportsTable).where(eq(reportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Report not found" }); return; }

  const [exp] = await db.insert(exportsTable).values({
    reportId,
    organizationId: orgId,
    format: parsed.data.format,
    status: "completed",
    fileUrl: `/api/exports/${Date.now()}.${parsed.data.format}`,
  }).returning();

  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, report.jobId));
  await logActivity(db, orgId, userId, "exported", "report", report.id, report.title);

  res.status(201).json({ ...exp, jobTitle: job?.title || "Unknown" });
});

export default router;
