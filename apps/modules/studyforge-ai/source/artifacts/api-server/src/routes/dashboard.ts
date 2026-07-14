import { Router, type IRouter } from "express";
import { eq, desc, inArray, sql } from "drizzle-orm";
import {
  db,
  studySetsTable,
  flashcardsTable,
  quizQuestionsTable,
  quizAttemptsTable,
  studySessionsTable,
  examCountdownsTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { currentMonthKey, limitsFor, planOf } from "../lib/plans";
import { studySetRowToSummary } from "../lib/studySetService";
import { getStreakAndActivity } from "../lib/streakService";

const router: IRouter = Router();

function dateString(d: Date | string): string {
  if (typeof d === "string") return d;
  return d.toISOString().slice(0, 10);
}

router.get("/dashboard", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  const sets = await db
    .select()
    .from(studySetsTable)
    .where(eq(studySetsTable.userId, user.id))
    .orderBy(desc(studySetsTable.updatedAt));

  const setIds = sets.map((s) => s.id);

  // SQL aggregate counts — no in-memory N+1 walk.
  const cardCountRows = setIds.length
    ? await db
        .select({
          studySetId: flashcardsTable.studySetId,
          count: sql<number>`count(*)::int`,
        })
        .from(flashcardsTable)
        .where(inArray(flashcardsTable.studySetId, setIds))
        .groupBy(flashcardsTable.studySetId)
    : [];
  const quizCountRows = setIds.length
    ? await db
        .select({
          studySetId: quizQuestionsTable.studySetId,
          count: sql<number>`count(*)::int`,
        })
        .from(quizQuestionsTable)
        .where(inArray(quizQuestionsTable.studySetId, setIds))
        .groupBy(quizQuestionsTable.studySetId)
    : [];
  const cardCounts = new Map(cardCountRows.map((r) => [r.studySetId, Number(r.count)]));
  const quizCounts = new Map(quizCountRows.map((r) => [r.studySetId, Number(r.count)]));
  const flashcardsCount = [...cardCounts.values()].reduce((a, b) => a + b, 0);

  const recent = sets
    .slice(0, 6)
    .map((s) => studySetRowToSummary(s, cardCounts.get(s.id) ?? 0, quizCounts.get(s.id) ?? 0));

  const attempts = await db
    .select()
    .from(quizAttemptsTable)
    .where(eq(quizAttemptsTable.userId, user.id));
  const quizAttemptsCount = attempts.length;
  const averageQuizScore =
    quizAttemptsCount > 0
      ? Math.round((attempts.reduce((sum, a) => sum + a.score, 0) / quizAttemptsCount) * 10) / 10
      : 0;

  // weak areas: aggregate from attempt answers
  const wrongByTopic = new Map<string, { wrong: number; total: number; setId: number; setTitle: string }>();
  const setTitleById = new Map(sets.map((s) => [s.id, s.title]));
  for (const att of attempts) {
    for (const ans of att.answers) {
      if (!ans.topic) continue;
      const key = `${att.studySetId}|${ans.topic}`;
      const existing = wrongByTopic.get(key) ?? {
        wrong: 0,
        total: 0,
        setId: att.studySetId,
        setTitle: setTitleById.get(att.studySetId) ?? "Study set",
      };
      existing.total += 1;
      if (!ans.isCorrect) existing.wrong += 1;
      wrongByTopic.set(key, existing);
    }
  }
  const weakAreas = [...wrongByTopic.entries()]
    .filter(([, v]) => v.total > 0 && v.wrong / v.total >= 0.3)
    .map(([key, v]) => ({
      topic: key.split("|")[1],
      accuracy: Math.round(((v.total - v.wrong) / v.total) * 100),
      studySetId: v.setId,
      studySetTitle: v.setTitle,
    }))
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 5);

  const exams = await db
    .select()
    .from(examCountdownsTable)
    .where(eq(examCountdownsTable.userId, user.id));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcomingExams = exams
    .map((r) => {
      const examDate = dateString(r.examDate);
      const target = new Date(examDate);
      target.setHours(0, 0, 0, 0);
      const days = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      let risk: "on-track" | "needs-attention" | "cram-mode" = "on-track";
      if (days <= 3) risk = "cram-mode";
      else if (days <= 10) risk = "needs-attention";
      let recommended = 30;
      if (days <= 3) recommended = 120;
      else if (days <= 7) recommended = 75;
      else if (days <= 14) recommended = 45;
      return {
        id: r.id,
        examName: r.examName,
        examDate,
        daysRemaining: days,
        recommendedDailyMinutes: recommended,
        riskStatus: risk,
        studySetId: r.studySetId ?? null,
      };
    })
    .filter((e) => e.daysRemaining >= 0)
    .sort((a, b) => a.daysRemaining - b.daysRemaining)
    .slice(0, 5);

  // Today's sessions
  const todayStr = today.toISOString().slice(0, 10);
  const allSessions = setIds.length > 0
    ? await db.select().from(studySessionsTable).where(inArray(studySessionsTable.studySetId, setIds))
    : [];
  const todaySessions = allSessions
    .filter((s) => dateString(s.date) === todayStr)
    .map((s) => ({
      sessionId: s.id,
      studySetId: s.studySetId,
      studySetTitle: setTitleById.get(s.studySetId) ?? "Study set",
      topic: s.topic,
      estimatedMinutes: s.estimatedMinutes,
      completed: s.completed,
    }));

  const limits = limitsFor(user);
  const monthKey = currentMonthKey();
  const quizThisMonth =
    user.quizAttemptsMonthKey === monthKey ? user.quizAttemptsThisMonth : 0;

  const { streak, activity, scoreHistory } = await getStreakAndActivity(user.id);

  res.json({
    studySetsCount: sets.length,
    flashcardsCount,
    quizAttemptsCount,
    averageQuizScore,
    upcomingExams,
    todaySessions,
    recentStudySets: recent,
    weakAreas,
    plan: planOf(user),
    planUsage: {
      studySetsUsed: sets.length,
      studySetsLimit: limits.maxStudySets,
      quizAttemptsThisMonth: quizThisMonth,
      quizAttemptsLimit: limits.maxQuizAttemptsPerMonth,
    },
    streak,
    activity,
    scoreHistory,
  });
});

export default router;
