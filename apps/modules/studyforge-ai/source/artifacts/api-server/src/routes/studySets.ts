import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import {
  db,
  studySetsTable,
  flashcardsTable,
  quizQuestionsTable,
  quizAttemptsTable,
  studySessionsTable,
  examCountdownsTable,
} from "@workspace/db";
import {
  CreateStudySetBody,
  UpdateStudySetBody,
  UpdateFlashcardStatusBody,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { generateMaterials } from "../lib/generator";
import { generateMaterialsAi } from "../lib/aiGenerator";
import { limitsFor, planOf, limitErrorBody } from "../lib/plans";
import {
  applyMaterialsToSet,
  buildStudySetResponse,
  flashcardRowToApi,
  listSetsForUser,
  regenerateForSet,
} from "../lib/studySetService";
import { recordActivity } from "../lib/streakService";

const router: IRouter = Router();

router.get("/study-sets", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const subject = typeof req.query.subject === "string" ? req.query.subject : undefined;
  let folderId: number | null | undefined;
  if (typeof req.query.folderId === "string" && req.query.folderId !== "") {
    const n = Number(req.query.folderId);
    folderId = Number.isNaN(n) ? undefined : n;
  }
  const sets = await listSetsForUser(user.id, { search, subject, folderId });
  res.json(sets);
});

router.post("/study-sets", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  const parsed = CreateStudySetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const limits = limitsFor(user);
  // Cheap COUNT instead of SELECT *.
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(studySetsTable)
    .where(eq(studySetsTable.userId, user.id));
  const existingCount = Number(count);
  if (limits.maxStudySets !== null && existingCount >= limits.maxStudySets) {
    res.status(402).json(
      limitErrorBody(
        "study_sets",
        planOf(user),
        "pro",
        `Free plan is limited to ${limits.maxStudySets} study sets. Upgrade to Pro for unlimited.`,
      ),
    );
    return;
  }

  const body = parsed.data;
  const examDate = body.examDate && body.examDate.length > 0 ? body.examDate : null;

  const generateOpts = {
    notes: body.notes,
    title: body.title,
    subject: body.subject,
    difficulty: body.difficulty,
    examDate,
    maxFlashcards: limits.maxFlashcardsPerSet ?? undefined,
  };
  // Generate materials BEFORE the transaction so a slow AI call doesn't hold
  // a DB transaction open.
  const materials = (await generateMaterialsAi(generateOpts)) ?? generateMaterials(generateOpts);

  // Atomic write: study set + materials + exam countdown all succeed or none do.
  const setId = await db.transaction(async (tx) => {
    const [set] = await tx
      .insert(studySetsTable)
      .values({
        userId: user.id,
        title: body.title,
        subject: body.subject,
        course: body.course ?? null,
        difficulty: body.difficulty,
        learningGoal: body.learningGoal ?? null,
        examDate,
        notes: body.notes,
      })
      .returning();
    await applyMaterialsToSet(set.id, materials, tx);
    if (examDate) {
      await tx.insert(examCountdownsTable).values({
        userId: user.id,
        studySetId: set.id,
        examName: body.title,
        examDate,
      });
    }
    return set.id;
  });

  // Activity tracking — fire-and-forget so a streak hiccup never blocks the
  // user-visible response.
  recordActivity(user.id).catch((err) => req.log.warn({ err }, "recordActivity failed"));

  const full = await buildStudySetResponse(setId);
  res.status(201).json(full);
});

router.get("/study-sets/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const user = req.user!;
  const [set] = await db
    .select()
    .from(studySetsTable)
    .where(and(eq(studySetsTable.id, id), eq(studySetsTable.userId, user.id)));
  if (!set) {
    res.status(404).json({ error: "Study set not found" });
    return;
  }
  const full = await buildStudySetResponse(id);
  res.json(full);
});

router.patch("/study-sets/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const user = req.user!;
  const parsed = UpdateStudySetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const [set] = await db
    .select()
    .from(studySetsTable)
    .where(and(eq(studySetsTable.id, id), eq(studySetsTable.userId, user.id)));
  if (!set) {
    res.status(404).json({ error: "Study set not found" });
    return;
  }
  const updates: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.subject !== undefined) updates.subject = parsed.data.subject;
  if (parsed.data.course !== undefined) updates.course = parsed.data.course;
  if (parsed.data.difficulty !== undefined) updates.difficulty = parsed.data.difficulty;
  if (parsed.data.learningGoal !== undefined) updates.learningGoal = parsed.data.learningGoal;
  if (parsed.data.examDate !== undefined) updates.examDate = parsed.data.examDate;
  if (parsed.data.folderId !== undefined) updates.folderId = parsed.data.folderId;

  const titleChanged = parsed.data.title !== undefined && parsed.data.title !== set.title;
  const examChanged = parsed.data.examDate !== undefined && parsed.data.examDate !== set.examDate;
  const newTitle = (parsed.data.title ?? set.title) as string;
  const newExamDate = (parsed.data.examDate !== undefined ? parsed.data.examDate : set.examDate) as
    | string
    | null;

  await db.transaction(async (tx) => {
    await tx.update(studySetsTable).set(updates).where(eq(studySetsTable.id, id));
    if (titleChanged || examChanged) {
      // Keep exam_countdowns in sync with the study set's metadata.
      await tx.delete(examCountdownsTable).where(eq(examCountdownsTable.studySetId, id));
      if (newExamDate) {
        await tx.insert(examCountdownsTable).values({
          userId: user.id,
          studySetId: id,
          examName: newTitle,
          examDate: newExamDate,
        });
      }
    }
  });
  const full = await buildStudySetResponse(id);
  res.json(full);
});

router.delete("/study-sets/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const user = req.user!;
  const [set] = await db
    .select()
    .from(studySetsTable)
    .where(and(eq(studySetsTable.id, id), eq(studySetsTable.userId, user.id)));
  if (!set) {
    res.status(404).json({ error: "Study set not found" });
    return;
  }
  await db.transaction(async (tx) => {
    await tx.delete(flashcardsTable).where(eq(flashcardsTable.studySetId, id));
    await tx.delete(quizQuestionsTable).where(eq(quizQuestionsTable.studySetId, id));
    await tx.delete(quizAttemptsTable).where(eq(quizAttemptsTable.studySetId, id));
    await tx.delete(studySessionsTable).where(eq(studySessionsTable.studySetId, id));
    await tx.delete(examCountdownsTable).where(eq(examCountdownsTable.studySetId, id));
    await tx.delete(studySetsTable).where(eq(studySetsTable.id, id));
  });
  res.json({ ok: true });
});

router.post("/study-sets/:id/duplicate", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const user = req.user!;
  const limits = limitsFor(user);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(studySetsTable)
    .where(eq(studySetsTable.userId, user.id));
  const existingCount = Number(count);
  if (limits.maxStudySets !== null && existingCount >= limits.maxStudySets) {
    res.status(402).json(
      limitErrorBody(
        "study_sets",
        planOf(user),
        "pro",
        `Free plan is limited to ${limits.maxStudySets} study sets. Upgrade to Pro to duplicate.`,
      ),
    );
    return;
  }
  const [set] = await db
    .select()
    .from(studySetsTable)
    .where(and(eq(studySetsTable.id, id), eq(studySetsTable.userId, user.id)));
  if (!set) {
    res.status(404).json({ error: "Study set not found" });
    return;
  }
  const copyId = await db.transaction(async (tx) => {
    const [copy] = await tx
      .insert(studySetsTable)
      .values({
        userId: user.id,
        folderId: set.folderId ?? null,
        title: `${set.title} (Copy)`,
        subject: set.subject,
        course: set.course ?? null,
        difficulty: set.difficulty,
        learningGoal: set.learningGoal ?? null,
        examDate: set.examDate,
        notes: set.notes,
        summary: set.summary,
        keyTerms: set.keyTerms,
        reviewSheet: set.reviewSheet,
        weakAreas: set.weakAreas,
        qualityScore: set.qualityScore,
      })
      .returning();
    const cards = await tx.select().from(flashcardsTable).where(eq(flashcardsTable.studySetId, id));
    if (cards.length > 0) {
      await tx.insert(flashcardsTable).values(
        cards.map((c) => ({
          studySetId: copy.id,
          position: c.position,
          front: c.front,
          back: c.back,
          status: "new",
        })),
      );
    }
    const quiz = await tx.select().from(quizQuestionsTable).where(eq(quizQuestionsTable.studySetId, id));
    if (quiz.length > 0) {
      await tx.insert(quizQuestionsTable).values(
        quiz.map((q) => ({
          studySetId: copy.id,
          position: q.position,
          type: q.type,
          question: q.question,
          choices: q.choices,
          correctIndex: q.correctIndex,
          answer: q.answer,
          explanation: q.explanation,
          topic: q.topic,
        })),
      );
    }
    const sessions = await tx.select().from(studySessionsTable).where(eq(studySessionsTable.studySetId, id));
    if (sessions.length > 0) {
      await tx.insert(studySessionsTable).values(
        sessions.map((s) => ({
          studySetId: copy.id,
          day: s.day,
          date: s.date,
          topic: s.topic,
          focus: s.focus,
          estimatedMinutes: s.estimatedMinutes,
          completed: false,
        })),
      );
    }
    return copy.id;
  });
  const full = await buildStudySetResponse(copyId);
  res.status(201).json(full);
});

router.post("/study-sets/:id/regenerate", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const user = req.user!;
  const [set] = await db
    .select()
    .from(studySetsTable)
    .where(and(eq(studySetsTable.id, id), eq(studySetsTable.userId, user.id)));
  if (!set) {
    res.status(404).json({ error: "Study set not found" });
    return;
  }
  await regenerateForSet(id, user);
  const full = await buildStudySetResponse(id);
  res.json(full);
});

router.patch(
  "/study-sets/:id/flashcards/:cardId/status",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const cardId = Number(req.params.cardId);
    if (Number.isNaN(id) || Number.isNaN(cardId)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = UpdateFlashcardStatusBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const user = req.user!;
    const [set] = await db
      .select()
      .from(studySetsTable)
      .where(and(eq(studySetsTable.id, id), eq(studySetsTable.userId, user.id)));
    if (!set) {
      res.status(404).json({ error: "Study set not found" });
      return;
    }
    const [updated] = await db
      .update(flashcardsTable)
      .set({ status: parsed.data.status })
      .where(and(eq(flashcardsTable.id, cardId), eq(flashcardsTable.studySetId, id)))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Flashcard not found" });
      return;
    }
    recordActivity(user.id).catch((err) => req.log.warn({ err }, "recordActivity failed"));
    res.json(flashcardRowToApi(updated));
  },
);

export default router;
