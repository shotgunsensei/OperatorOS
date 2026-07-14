import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, reportsTable, jobsTable, findingsTable, notesTable, partsTable, laborTable } from "@workspace/db";
import { GenerateReportBody, UpdateReportBody } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { logActivity } from "../lib/activity";

const router: IRouter = Router();

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
}

function generateReportContent(job: any, findings: any[], notes: any[], parts: any[], labor: any[], reportType: string, tone: string) {
  const customerFacing = notes.filter(n => n.noteType === "customer_facing").map(n => n.content);
  const internalNotes = notes.filter(n => n.noteType === "internal").map(n => n.content);

  const findingsSummary = findings.map(f => ({
    issue: f.issue,
    cause: f.cause || "Under investigation",
    resolution: f.resolution || "Pending",
    recommendation: f.recommendation || "",
    severity: f.severity,
  }));

  const partsUsed = parts.map(p => ({
    name: p.name,
    partNumber: p.partNumber,
    quantity: Number(p.quantity),
    unitPrice: Number(p.unitPrice),
    total: Number(p.quantity) * Number(p.unitPrice),
  }));

  const laborEntries = labor.map(l => ({
    description: l.description,
    hours: Number(l.hours),
    rate: Number(l.rate),
    total: Number(l.hours) * Number(l.rate),
  }));

  const totalParts = partsUsed.reduce((sum, p) => sum + p.total, 0);
  const totalLabor = laborEntries.reduce((sum, l) => sum + l.total, 0);

  const content: any = {
    summary: `Service visit for ${job.title}. ${findings.length} finding(s) documented, ${parts.length} part(s) used, ${labor.length} labor entry(ies) recorded.`,
    findings: findingsSummary,
    notes: customerFacing.length > 0 ? customerFacing : ["Service completed as documented."],
    recommendations: findings.filter(f => f.recommendation).map(f => f.recommendation),
    partsUsed,
    laborEntries,
    totals: {
      partsTotal: totalParts,
      laborTotal: totalLabor,
      grandTotal: totalParts + totalLabor,
    },
  };

  if (reportType === "executive_summary") {
    content.executiveSummary = `This report summarizes the service engagement for ${job.title}. Our team identified ${findings.length} issue(s) and completed the necessary remediation work. Total investment: $${(totalParts + totalLabor).toFixed(2)}.`;
  }

  if (reportType === "estimate" || reportType === "change_order") {
    content.estimateNote = `This ${reportType === "change_order" ? "change order" : "estimate"} reflects the current scope of work based on findings from the site visit.`;
  }

  if (tone === "technical") {
    content.technicalDetails = internalNotes.length > 0 ? internalNotes : ["Technical details are documented in the findings section."];
  }

  return content;
}

router.get("/jobs/:jobId/reports", requireAuth, async (req, res): Promise<void> => {
  const jobId = parseId(req.params.jobId);
  const reports = await db.select().from(reportsTable).where(eq(reportsTable.jobId, jobId));
  res.json(reports);
});

router.post("/jobs/:jobId/generate-report", requireAuth, async (req, res): Promise<void> => {
  const jobId = parseId(req.params.jobId);
  const userId = (req as any).userId;
  const orgId = (req as any).organizationId;
  const parsed = GenerateReportBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }

  const findings = await db.select().from(findingsTable).where(eq(findingsTable.jobId, jobId));
  const notes = await db.select().from(notesTable).where(eq(notesTable.jobId, jobId));
  const parts = await db.select().from(partsTable).where(eq(partsTable.jobId, jobId));
  const labor = await db.select().from(laborTable).where(eq(laborTable.jobId, jobId));

  const content = generateReportContent(job, findings, notes, parts, labor, parsed.data.reportType, parsed.data.tone);

  const typeLabels: Record<string, string> = {
    client_summary: "Client Summary",
    technical_summary: "Technical Summary",
    estimate: "Estimate",
    change_order: "Change Order",
    executive_summary: "Executive Summary",
    full_report: "Full Report",
  };

  const [report] = await db.insert(reportsTable).values({
    jobId,
    title: `${typeLabels[parsed.data.reportType] || "Report"} - ${job.title}`,
    reportType: parsed.data.reportType,
    tone: parsed.data.tone,
    content,
    status: "draft",
    version: 1,
  }).returning();

  if (orgId) {
    await logActivity(db, orgId, userId, "generated", "report", report.id, report.title);
  }

  res.status(201).json(report);
});

router.get("/reports/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const [report] = await db.select().from(reportsTable).where(eq(reportsTable.id, id));
  if (!report) { res.status(404).json({ error: "Report not found" }); return; }
  res.json(report);
});

router.patch("/reports/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const parsed = UpdateReportBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updates: any = {};
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.content !== undefined) updates.content = parsed.data.content;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  const [report] = await db.update(reportsTable).set(updates).where(eq(reportsTable.id, id)).returning();
  if (!report) { res.status(404).json({ error: "Report not found" }); return; }
  res.json(report);
});

export default router;
