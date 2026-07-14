import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import {
  db,
  studySetsTable,
  quizQuestionsTable,
  quizAttemptsTable,
  studySessionsTable,
  usersTable,
} from "@workspace/db";
import { SubmitQuizAttemptBody, ToggleStudySessionBody } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { currentMonthKey, limitErrorBody, limitsFor, planOf } from "../lib/plans";
import { recordActivity } from "../lib/streakService";

const router: IRouter = Router();

router.get(
  "/study-sets/:id/quiz/attempts",
  requireAuth,
  async (req, res): Promise<void> => {
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
    const attempts = await db
      .select()
      .from(quizAttemptsTable)
      .where(and(eq(quizAttemptsTable.studySetId, id), eq(quizAttemptsTable.userId, user.id)))
      .orderBy(desc(quizAttemptsTable.completedAt));
    res.json(
      attempts.map((a) => ({
        id: a.id,
        studySetId: a.studySetId,
        score: a.score,
        correctCount: a.correctCount,
        totalCount: a.totalCount,
        completedAt: a.completedAt.toISOString(),
      })),
    );
  },
);

router.post(
  "/study-sets/:id/quiz/attempts",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = SubmitQuizAttemptBody.safeParse(req.body);
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
    const limits = limitsFor(user);
    const monthKey = currentMonthKey();
    let attemptsThisMonth =
      user.quizAttemptsMonthKey === monthKey ? user.quizAttemptsThisMonth : 0;
    if (
      limits.maxQuizAttemptsPerMonth !== null &&
      attemptsThisMonth >= limits.maxQuizAttemptsPerMonth
    ) {
      res.status(402).json(
        limitErrorBody(
          "quiz_attempts",
          planOf(user),
          "pro",
          `Free plan is limited to ${limits.maxQuizAttemptsPerMonth} quiz attempts per month. Upgrade to Pro for unlimited.`,
        ),
      );
      return;
    }

    const questions = await db
      .select()
      .from(quizQuestionsTable)
      .where(and(eq(quizQuestionsTable.studySetId, id), eq(quizQuestionsTable.type, "mcq")));
    const byId = new Map(questions.map((q) => [q.id, q]));
    const breakdown = parsed.data.answers.map((ans) => {
      const q = byId.get(ans.questionId);
      const isCorrect = q ? q.correctIndex === ans.selectedIndex : false;
      return {
        questionId: ans.questionId,
        question: q?.question ?? "",
        selectedIndex: ans.selectedIndex,
        correctIndex: q?.correctIndex ?? 0,
        isCorrect,
        explanation: q?.explanation ?? "",
        topic: q?.topic ?? "General",
      };
    });
    const correctCount = breakdown.filter((b) => b.isCorrect).length;
    const totalCount = breakdown.length;
    const score = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
    const wrongTopics = new Map<string, number>();
    for (const b of breakdown) {
      if (!b.isCorrect && b.topic) {
        wrongTopics.set(b.topic, (wrongTopics.get(b.topic) ?? 0) + 1);
      }
    }
    const weakTopics = [...wrongTopics.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([t]) => t)
      .slice(0, 3);

    const [attempt] = await db
      .insert(quizAttemptsTable)
      .values({
        userId: user.id,
        studySetId: id,
        score,
        correctCount,
        totalCount,
        answers: breakdown.map((b) => ({
          questionId: b.questionId,
          selectedIndex: b.selectedIndex,
          correctIndex: b.correctIndex,
          isCorrect: b.isCorrect,
          topic: b.topic,
        })),
      })
      .returning();

    attemptsThisMonth += 1;
    await db
      .update(usersTable)
      .set({
        quizAttemptsMonthKey: monthKey,
        quizAttemptsThisMonth: attemptsThisMonth,
      })
      .where(eq(usersTable.id, user.id));

    if (weakTopics.length > 0) {
      await db
        .update(studySetsTable)
        .set({ weakAreas: weakTopics })
        .where(eq(studySetsTable.id, id));
    }

    recordActivity(user.id).catch((err) => req.log.warn({ err }, "recordActivity failed"));

    res.status(201).json({
      attempt: {
        id: attempt.id,
        studySetId: attempt.studySetId,
        score: attempt.score,
        correctCount: attempt.correctCount,
        totalCount: attempt.totalCount,
        completedAt: attempt.completedAt.toISOString(),
      },
      breakdown,
      weakTopics,
    });
  },
);

router.patch(
  "/study-sets/:id/study-plan/sessions/:sessionId/complete",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const sessionId = Number(req.params.sessionId);
    if (Number.isNaN(id) || Number.isNaN(sessionId)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = ToggleStudySessionBody.safeParse(req.body);
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
      .update(studySessionsTable)
      .set({ completed: parsed.data.completed })
      .where(
        and(eq(studySessionsTable.id, sessionId), eq(studySessionsTable.studySetId, id)),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    if (parsed.data.completed) {
      recordActivity(user.id).catch((err) => req.log.warn({ err }, "recordActivity failed"));
    }
    res.json({
      id: updated.id,
      day: updated.day,
      date: typeof updated.date === "string" ? updated.date : new Date(updated.date).toISOString().slice(0, 10),
      topic: updated.topic,
      focus: updated.focus,
      estimatedMinutes: updated.estimatedMinutes,
      completed: updated.completed,
    });
  },
);

export default router;
