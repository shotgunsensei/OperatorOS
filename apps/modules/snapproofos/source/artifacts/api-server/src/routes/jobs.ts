import { Router, type IRouter } from "express";
import { eq, and, sql, ilike, desc } from "drizzle-orm";
import { db, jobsTable, customersTable, usersTable, findingsTable, notesTable, partsTable, laborTable, filesTable, reportsTable } from "@workspace/db";
import { CreateJobBody, UpdateJobBody } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { logActivity } from "../lib/activity";

const router: IRouter = Router();

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
}

router.get("/jobs", requireAuth, async (req, res): Promise<void> => {
  const orgId = (req as any).organizationId;
  if (!orgId) { res.json({ jobs: [], total: 0 }); return; }

  const status = req.query.status as string | undefined;
  const search = req.query.search as string | undefined;
  const limit = parseInt((req.query.limit as string) || "50", 10);
  const offset = parseInt((req.query.offset as string) || "0", 10);

  let conditions = [eq(jobsTable.organizationId, orgId)];
  if (status) conditions.push(eq(jobsTable.status, status));
  if (search) conditions.push(ilike(jobsTable.title, `%${search}%`));

  const where = conditions.length === 1 ? conditions[0] : and(...conditions);

  const jobs = await db.select().from(jobsTable).where(where!).orderBy(desc(jobsTable.createdAt)).limit(limit).offset(offset);

  const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(jobsTable).where(where!);

  const enriched = await Promise.all(jobs.map(async (job) => {
    let customerName: string | null = null;
    let assignedToName: string | null = null;
    if (job.customerId) {
      const [c] = await db.select().from(customersTable).where(eq(customersTable.id, job.customerId));
      if (c) customerName = c.name;
    }
    if (job.assignedToId) {
      const [u] = await db.select().from(usersTable).where(eq(usersTable.id, job.assignedToId));
      if (u) assignedToName = `${u.firstName} ${u.lastName}`;
    }
    const [nc] = await db.select({ count: sql<number>`count(*)::int` }).from(notesTable).where(eq(notesTable.jobId, job.id));
    const [fc] = await db.select({ count: sql<number>`count(*)::int` }).from(findingsTable).where(eq(findingsTable.jobId, job.id));
    const [flc] = await db.select({ count: sql<number>`count(*)::int` }).from(filesTable).where(eq(filesTable.jobId, job.id));
    const [rc] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(eq(reportsTable.jobId, job.id));

    return {
      ...job,
      customerName,
      assignedToName,
      notesCount: nc.count,
      findingsCount: fc.count,
      filesCount: flc.count,
      reportsCount: rc.count,
    };
  }));

  res.json({ jobs: enriched, total: countResult.count });
});

router.post("/jobs", requireAuth, async (req, res): Promise<void> => {
  const orgId = (req as any).organizationId;
  const userId = (req as any).userId;
  if (!orgId) { res.status(400).json({ error: "No organization" }); return; }

  const parsed = CreateJobBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [job] = await db.insert(jobsTable).values({
    organizationId: orgId,
    title: parsed.data.title,
    jobType: parsed.data.jobType,
    description: parsed.data.description || null,
    customerId: parsed.data.customerId || null,
    siteAddress: parsed.data.siteAddress || null,
    assignedToId: parsed.data.assignedToId || userId,
    templateId: parsed.data.templateId || null,
  }).returning();

  await logActivity(db, orgId, userId, "created", "job", job.id, job.title);

  res.status(201).json({
    ...job,
    customerName: null,
    assignedToName: null,
    notesCount: 0,
    findingsCount: 0,
    filesCount: 0,
    reportsCount: 0,
  });
});

router.get("/jobs/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const orgId = (req as any).organizationId;
  const [job] = await db.select().from(jobsTable).where(and(eq(jobsTable.id, id), eq(jobsTable.organizationId, orgId)));
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }

  let customerName: string | null = null;
  let assignedToName: string | null = null;
  if (job.customerId) {
    const [c] = await db.select().from(customersTable).where(eq(customersTable.id, job.customerId));
    if (c) customerName = c.name;
  }
  if (job.assignedToId) {
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, job.assignedToId));
    if (u) assignedToName = `${u.firstName} ${u.lastName}`;
  }

  const findings = await db.select().from(findingsTable).where(eq(findingsTable.jobId, id));
  const notes = await db.select().from(notesTable).where(eq(notesTable.jobId, id));
  const parts = await db.select().from(partsTable).where(eq(partsTable.jobId, id));
  const labor = await db.select().from(laborTable).where(eq(laborTable.jobId, id));
  const files = await db.select().from(filesTable).where(eq(filesTable.jobId, id));
  const reports = await db.select().from(reportsTable).where(eq(reportsTable.jobId, id));

  res.json({
    ...job,
    customerName,
    assignedToName,
    findings,
    notes: notes.map(n => ({ ...n, isVoiceNote: n.isVoiceNote })),
    parts: parts.map(p => ({ ...p, quantity: Number(p.quantity), unitPrice: Number(p.unitPrice), totalPrice: Number(p.quantity) * Number(p.unitPrice) })),
    labor: labor.map(l => {
      let technicianName: string | null = null;
      return { ...l, hours: Number(l.hours), rate: Number(l.rate), totalCost: Number(l.hours) * Number(l.rate), technicianId: l.technicianId, technicianName };
    }),
    files: files.map(f => ({ ...f })),
    reports: reports.map(r => ({ ...r })),
  });
});

router.patch("/jobs/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const orgId = (req as any).organizationId;
  const parsed = UpdateJobBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: any = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) updates[key] = value;
  }

  const [job] = await db.update(jobsTable).set(updates).where(and(eq(jobsTable.id, id), eq(jobsTable.organizationId, orgId))).returning();
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }

  res.json({
    ...job,
    customerName: null,
    assignedToName: null,
    notesCount: 0,
    findingsCount: 0,
    filesCount: 0,
    reportsCount: 0,
  });
});

router.delete("/jobs/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const orgId = (req as any).organizationId;
  const [job] = await db.delete(jobsTable).where(and(eq(jobsTable.id, id), eq(jobsTable.organizationId, orgId))).returning();
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }
  res.sendStatus(204);
});

export default router;
