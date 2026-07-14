import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, findingsTable, notesTable, partsTable, laborTable, filesTable, usersTable } from "@workspace/db";
import {
  CreateFindingBody, UpdateFindingBody,
  CreateNoteBody, UpdateNoteBody,
  CreatePartBody, UpdatePartBody,
  CreateLaborBody, UpdateLaborBody,
  UploadFileBody, UpdateFileBody,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
}

router.get("/jobs/:jobId/findings", requireAuth, async (req, res): Promise<void> => {
  const jobId = parseId(req.params.jobId);
  const findings = await db.select().from(findingsTable).where(eq(findingsTable.jobId, jobId));
  res.json(findings);
});

router.post("/jobs/:jobId/findings", requireAuth, async (req, res): Promise<void> => {
  const jobId = parseId(req.params.jobId);
  const parsed = CreateFindingBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [finding] = await db.insert(findingsTable).values({
    jobId,
    issue: parsed.data.issue,
    cause: parsed.data.cause || null,
    resolution: parsed.data.resolution || null,
    recommendation: parsed.data.recommendation || null,
    severity: parsed.data.severity || "medium",
  }).returning();
  res.status(201).json(finding);
});

router.patch("/findings/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const parsed = UpdateFindingBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updates: any = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) updates[key] = value;
  }
  const [finding] = await db.update(findingsTable).set(updates).where(eq(findingsTable.id, id)).returning();
  if (!finding) { res.status(404).json({ error: "Finding not found" }); return; }
  res.json(finding);
});

router.delete("/findings/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const [f] = await db.delete(findingsTable).where(eq(findingsTable.id, id)).returning();
  if (!f) { res.status(404).json({ error: "Finding not found" }); return; }
  res.sendStatus(204);
});

router.get("/jobs/:jobId/notes", requireAuth, async (req, res): Promise<void> => {
  const jobId = parseId(req.params.jobId);
  const notes = await db.select().from(notesTable).where(eq(notesTable.jobId, jobId));
  res.json(notes);
});

router.post("/jobs/:jobId/notes", requireAuth, async (req, res): Promise<void> => {
  const jobId = parseId(req.params.jobId);
  const parsed = CreateNoteBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [note] = await db.insert(notesTable).values({
    jobId,
    content: parsed.data.content,
    noteType: parsed.data.noteType || "internal",
    isVoiceNote: parsed.data.isVoiceNote || false,
    audioUrl: parsed.data.audioUrl || null,
  }).returning();
  res.status(201).json(note);
});

router.patch("/notes/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const parsed = UpdateNoteBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updates: any = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) updates[key] = value;
  }
  const [note] = await db.update(notesTable).set(updates).where(eq(notesTable.id, id)).returning();
  if (!note) { res.status(404).json({ error: "Note not found" }); return; }
  res.json(note);
});

router.delete("/notes/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const [n] = await db.delete(notesTable).where(eq(notesTable.id, id)).returning();
  if (!n) { res.status(404).json({ error: "Note not found" }); return; }
  res.sendStatus(204);
});

router.get("/jobs/:jobId/parts", requireAuth, async (req, res): Promise<void> => {
  const jobId = parseId(req.params.jobId);
  const parts = await db.select().from(partsTable).where(eq(partsTable.jobId, jobId));
  res.json(parts.map(p => ({
    ...p,
    quantity: Number(p.quantity),
    unitPrice: Number(p.unitPrice),
    totalPrice: Number(p.quantity) * Number(p.unitPrice),
  })));
});

router.post("/jobs/:jobId/parts", requireAuth, async (req, res): Promise<void> => {
  const jobId = parseId(req.params.jobId);
  const parsed = CreatePartBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [part] = await db.insert(partsTable).values({
    jobId,
    name: parsed.data.name,
    partNumber: parsed.data.partNumber || null,
    quantity: String(parsed.data.quantity),
    unitPrice: String(parsed.data.unitPrice),
  }).returning();
  res.status(201).json({
    ...part,
    quantity: Number(part.quantity),
    unitPrice: Number(part.unitPrice),
    totalPrice: Number(part.quantity) * Number(part.unitPrice),
  });
});

router.patch("/parts/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const parsed = UpdatePartBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updates: any = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.partNumber !== undefined) updates.partNumber = parsed.data.partNumber;
  if (parsed.data.quantity !== undefined) updates.quantity = String(parsed.data.quantity);
  if (parsed.data.unitPrice !== undefined) updates.unitPrice = String(parsed.data.unitPrice);
  const [part] = await db.update(partsTable).set(updates).where(eq(partsTable.id, id)).returning();
  if (!part) { res.status(404).json({ error: "Part not found" }); return; }
  res.json({ ...part, quantity: Number(part.quantity), unitPrice: Number(part.unitPrice), totalPrice: Number(part.quantity) * Number(part.unitPrice) });
});

router.delete("/parts/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const [p] = await db.delete(partsTable).where(eq(partsTable.id, id)).returning();
  if (!p) { res.status(404).json({ error: "Part not found" }); return; }
  res.sendStatus(204);
});

router.get("/jobs/:jobId/labor", requireAuth, async (req, res): Promise<void> => {
  const jobId = parseId(req.params.jobId);
  const labor = await db.select().from(laborTable).where(eq(laborTable.jobId, jobId));
  const enriched = await Promise.all(labor.map(async (l) => {
    let technicianName: string | null = null;
    if (l.technicianId) {
      const [u] = await db.select().from(usersTable).where(eq(usersTable.id, l.technicianId));
      if (u) technicianName = `${u.firstName} ${u.lastName}`;
    }
    return { ...l, hours: Number(l.hours), rate: Number(l.rate), totalCost: Number(l.hours) * Number(l.rate), technicianName };
  }));
  res.json(enriched);
});

router.post("/jobs/:jobId/labor", requireAuth, async (req, res): Promise<void> => {
  const jobId = parseId(req.params.jobId);
  const parsed = CreateLaborBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [entry] = await db.insert(laborTable).values({
    jobId,
    description: parsed.data.description,
    hours: String(parsed.data.hours),
    rate: String(parsed.data.rate),
    technicianId: parsed.data.technicianId || null,
  }).returning();
  res.status(201).json({
    ...entry,
    hours: Number(entry.hours),
    rate: Number(entry.rate),
    totalCost: Number(entry.hours) * Number(entry.rate),
    technicianName: null,
  });
});

router.patch("/labor/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const parsed = UpdateLaborBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updates: any = {};
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.hours !== undefined) updates.hours = String(parsed.data.hours);
  if (parsed.data.rate !== undefined) updates.rate = String(parsed.data.rate);
  const [entry] = await db.update(laborTable).set(updates).where(eq(laborTable.id, id)).returning();
  if (!entry) { res.status(404).json({ error: "Labor entry not found" }); return; }
  res.json({ ...entry, hours: Number(entry.hours), rate: Number(entry.rate), totalCost: Number(entry.hours) * Number(entry.rate), technicianName: null });
});

router.delete("/labor/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const [l] = await db.delete(laborTable).where(eq(laborTable.id, id)).returning();
  if (!l) { res.status(404).json({ error: "Labor entry not found" }); return; }
  res.sendStatus(204);
});

router.get("/jobs/:jobId/files", requireAuth, async (req, res): Promise<void> => {
  const jobId = parseId(req.params.jobId);
  const files = await db.select().from(filesTable).where(eq(filesTable.jobId, jobId));
  res.json(files);
});

router.post("/jobs/:jobId/files", requireAuth, async (req, res): Promise<void> => {
  const jobId = parseId(req.params.jobId);
  const parsed = UploadFileBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [file] = await db.insert(filesTable).values({
    jobId,
    fileName: parsed.data.fileName,
    fileUrl: parsed.data.fileUrl,
    fileType: parsed.data.fileType,
    fileSize: parsed.data.fileSize,
    caption: parsed.data.caption || null,
  }).returning();
  res.status(201).json(file);
});

router.patch("/files/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const parsed = UpdateFileBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updates: any = {};
  if (parsed.data.caption !== undefined) updates.caption = parsed.data.caption;
  if (parsed.data.sortOrder !== undefined) updates.sortOrder = parsed.data.sortOrder;
  const [file] = await db.update(filesTable).set(updates).where(eq(filesTable.id, id)).returning();
  if (!file) { res.status(404).json({ error: "File not found" }); return; }
  res.json(file);
});

router.delete("/files/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const [f] = await db.delete(filesTable).where(eq(filesTable.id, id)).returning();
  if (!f) { res.status(404).json({ error: "File not found" }); return; }
  res.sendStatus(204);
});

export default router;
