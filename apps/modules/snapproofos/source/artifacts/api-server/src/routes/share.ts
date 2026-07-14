import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { db, shareLinksTable, reportsTable, jobsTable, organizationsTable, findingsTable, partsTable, laborTable, filesTable, usersTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
}

router.post("/reports/:reportId/share", requireAuth, async (req, res): Promise<void> => {
  const reportId = parseId(req.params.reportId);
  const orgId = (req as any).organizationId;
  const [report] = await db.select().from(reportsTable).where(eq(reportsTable.id, reportId));
  if (!report) { res.status(404).json({ error: "Report not found" }); return; }

  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, report.jobId));
  if (!job || job.organizationId !== orgId) { res.status(404).json({ error: "Report not found" }); return; }

  const token = crypto.randomBytes(32).toString("hex");
  const [link] = await db.insert(shareLinksTable).values({
    reportId,
    token,
  }).returning();

  res.status(201).json({
    id: link.id,
    reportId: link.reportId,
    token: link.token,
    url: `/share/${link.token}`,
    expiresAt: link.expiresAt,
    createdAt: link.createdAt,
  });
});

router.get("/share/:token", async (req, res): Promise<void> => {
  const token = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
  const [link] = await db.select().from(shareLinksTable).where(eq(shareLinksTable.token, token));
  if (!link) { res.status(404).json({ error: "Share link not found" }); return; }

  if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
    res.status(404).json({ error: "Share link expired" });
    return;
  }

  const [report] = await db.select().from(reportsTable).where(eq(reportsTable.id, link.reportId));
  if (!report) { res.status(404).json({ error: "Report not found" }); return; }

  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, report.jobId));
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }

  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, job.organizationId));
  let customerName: string | null = null;
  let technicianName: string | null = null;

  if (job.assignedToId) {
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, job.assignedToId));
    if (u) technicianName = `${u.firstName} ${u.lastName}`;
  }

  const findings = await db.select().from(findingsTable).where(eq(findingsTable.jobId, job.id));
  const parts = await db.select().from(partsTable).where(eq(partsTable.jobId, job.id));
  const labor = await db.select().from(laborTable).where(eq(laborTable.jobId, job.id));
  const files = await db.select().from(filesTable).where(eq(filesTable.jobId, job.id));

  res.json({
    organizationName: org?.name || "Unknown",
    organizationLogo: org?.logoUrl || null,
    accentColor: org?.accentColor || "#dc2626",
    reportTitle: report.title,
    jobTitle: job.title,
    customerName,
    siteAddress: job.siteAddress,
    technicianName,
    content: report.content,
    findings,
    parts: parts.map(p => ({ ...p, quantity: Number(p.quantity), unitPrice: Number(p.unitPrice), totalPrice: Number(p.quantity) * Number(p.unitPrice) })),
    labor: labor.map(l => ({ ...l, hours: Number(l.hours), rate: Number(l.rate), totalCost: Number(l.hours) * Number(l.rate), technicianName: null })),
    files,
    createdAt: report.createdAt,
  });
});

export default router;
