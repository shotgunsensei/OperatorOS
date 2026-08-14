import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, examCountdownsTable } from "@workspace/db";
import { CreateExamCountdownBody } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { limitsFor, planOf, limitErrorBody } from "../lib/plans";

const router: IRouter = Router();

function daysBetween(targetIso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(targetIso);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function riskFor(days: number): "on-track" | "needs-attention" | "cram-mode" {
  if (days <= 3) return "cram-mode";
  if (days <= 10) return "needs-attention";
  return "on-track";
}

function recommendedDaily(days: number): number {
  if (days <= 0) return 120;
  if (days <= 3) return 120;
  if (days <= 7) return 75;
  if (days <= 14) return 45;
  return 30;
}

function dateString(d: Date | string): string {
  if (typeof d === "string") return d;
  return d.toISOString().slice(0, 10);
}

router.get("/exam-countdowns", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  const rows = await db
    .select()
    .from(examCountdownsTable)
    .where(eq(examCountdownsTable.userId, user.id));
  const out = rows
    .map((r) => {
      const examDate = dateString(r.examDate);
      const days = daysBetween(examDate);
      return {
        id: r.id,
        examName: r.examName,
        examDate,
        daysRemaining: days,
        recommendedDailyMinutes: recommendedDaily(days),
        riskStatus: riskFor(days),
        studySetId: r.studySetId ?? null,
      };
    })
    .sort((a, b) => a.daysRemaining - b.daysRemaining);
  res.json(out);
});

router.post("/exam-countdowns", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  const parsed = CreateExamCountdownBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const limits = limitsFor(user);
  if (!limits.examCountdowns) {
    res.status(402).json(
      limitErrorBody(
        "exam_countdowns",
        planOf(user),
        "pro",
        "Exam countdowns are a Pro feature. Upgrade to add custom exam countdowns.",
      ),
    );
    return;
  }
  const [row] = await db
    .insert(examCountdownsTable)
    .values({
      userId: user.id,
      examName: parsed.data.examName,
      examDate: parsed.data.examDate,
      studySetId: parsed.data.studySetId ?? null,
    })
    .returning();
  const days = daysBetween(parsed.data.examDate);
  res.status(201).json({
    id: row.id,
    examName: row.examName,
    examDate: dateString(row.examDate),
    daysRemaining: days,
    recommendedDailyMinutes: recommendedDaily(days),
    riskStatus: riskFor(days),
    studySetId: row.studySetId ?? null,
  });
});

router.delete("/exam-countdowns/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const user = req.user!;
  const [row] = await db
    .select()
    .from(examCountdownsTable)
    .where(and(eq(examCountdownsTable.id, id), eq(examCountdownsTable.userId, user.id)));
  if (!row) {
    res.status(404).json({ error: "Exam countdown not found" });
    return;
  }
  await db.delete(examCountdownsTable).where(eq(examCountdownsTable.id, id));
  res.json({ ok: true });
});

export default router;
