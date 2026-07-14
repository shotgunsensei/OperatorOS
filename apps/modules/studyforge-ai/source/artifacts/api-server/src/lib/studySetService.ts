import { eq, and, inArray, sql } from "drizzle-orm";
import {
  db,
  studySetsTable,
  flashcardsTable,
  quizQuestionsTable,
  studySessionsTable,
  type StudySetRow,
  type FlashcardRow,
  type QuizQuestionRow,
  type StudySessionRow,
} from "@workspace/db";

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
import { generateMaterials, type GeneratedMaterials } from "./generator";
import { generateMaterialsAi } from "./aiGenerator";
import { limitsFor } from "./plans";
import type { User } from "@workspace/db";

function dateToString(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === "string") return d;
  return d.toISOString().slice(0, 10);
}

export function flashcardRowToApi(row: FlashcardRow) {
  return {
    id: row.id,
    front: row.front,
    back: row.back,
    status: (row.status === "known" || row.status === "review") ? row.status : "new",
  };
}

export function studySetRowToSummary(row: StudySetRow, flashcardCount: number, quizCount: number) {
  return {
    id: row.id,
    title: row.title,
    subject: row.subject,
    course: row.course ?? null,
    difficulty: row.difficulty,
    examDate: dateToString(row.examDate),
    flashcardCount,
    quizQuestionCount: quizCount,
    folderId: row.folderId ?? null,
    updatedAt: row.updatedAt.toISOString(),
    qualityScore: row.qualityScore,
  };
}

export async function buildStudySetResponse(setId: number) {
  const [set] = await db.select().from(studySetsTable).where(eq(studySetsTable.id, setId));
  if (!set) return null;
  const flashcards = await db
    .select()
    .from(flashcardsTable)
    .where(eq(flashcardsTable.studySetId, setId))
    .orderBy(flashcardsTable.position);
  const quiz = await db
    .select()
    .from(quizQuestionsTable)
    .where(eq(quizQuestionsTable.studySetId, setId))
    .orderBy(quizQuestionsTable.position);
  const sessions = await db
    .select()
    .from(studySessionsTable)
    .where(eq(studySessionsTable.studySetId, setId))
    .orderBy(studySessionsTable.day);

  const mcqs = quiz
    .filter((q: QuizQuestionRow) => q.type === "mcq")
    .map((q: QuizQuestionRow) => ({
      id: q.id,
      question: q.question,
      choices: q.choices ?? [],
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      topic: q.topic,
    }));
  const shorts = quiz
    .filter((q: QuizQuestionRow) => q.type === "short")
    .map((q: QuizQuestionRow) => ({
      id: q.id,
      question: q.question,
      answer: q.answer,
      topic: q.topic,
    }));

  return {
    id: set.id,
    title: set.title,
    subject: set.subject,
    course: set.course ?? null,
    difficulty: set.difficulty,
    learningGoal: set.learningGoal ?? null,
    examDate: dateToString(set.examDate),
    notes: set.notes,
    summary: set.summary,
    keyTerms: set.keyTerms,
    flashcards: flashcards.map(flashcardRowToApi),
    quizQuestions: mcqs,
    shortAnswerQuestions: shorts,
    reviewSheet: set.reviewSheet,
    studyPlan: sessions.map((s: StudySessionRow) => ({
      id: s.id,
      day: s.day,
      date: dateToString(s.date) ?? new Date().toISOString().slice(0, 10),
      topic: s.topic,
      focus: s.focus,
      estimatedMinutes: s.estimatedMinutes,
      completed: s.completed,
    })),
    weakAreas: set.weakAreas,
    qualityScore: set.qualityScore,
    folderId: set.folderId ?? null,
    createdAt: set.createdAt.toISOString(),
    updatedAt: set.updatedAt.toISOString(),
  };
}

export async function regenerateForSet(setId: number, user: User): Promise<void> {
  const [set] = await db.select().from(studySetsTable).where(eq(studySetsTable.id, setId));
  if (!set) return;
  const limits = limitsFor(user);
  const opts = {
    notes: set.notes,
    title: set.title,
    subject: set.subject,
    difficulty: set.difficulty,
    examDate: dateToString(set.examDate),
    maxFlashcards: limits.maxFlashcardsPerSet ?? undefined,
  };
  const materials = (await generateMaterialsAi(opts)) ?? generateMaterials(opts);
  await applyMaterialsToSet(setId, materials);
}

export async function applyMaterialsToSet(
  setId: number,
  materials: GeneratedMaterials,
  conn: DbOrTx = db,
): Promise<void> {
  await conn.delete(flashcardsTable).where(eq(flashcardsTable.studySetId, setId));
  await conn.delete(quizQuestionsTable).where(eq(quizQuestionsTable.studySetId, setId));
  await conn.delete(studySessionsTable).where(eq(studySessionsTable.studySetId, setId));

  if (materials.flashcards.length > 0) {
    await conn.insert(flashcardsTable).values(
      materials.flashcards.map((f, i) => ({
        studySetId: setId,
        position: i,
        front: f.front,
        back: f.back,
        status: "new",
      })),
    );
  }
  const quizRows = [
    ...materials.mcqs.map((q, i) => ({
      studySetId: setId,
      position: i,
      type: "mcq",
      question: q.question,
      choices: q.choices,
      correctIndex: q.correctIndex,
      answer: "",
      explanation: q.explanation,
      topic: q.topic,
    })),
    ...materials.shortAnswers.map((q, i) => ({
      studySetId: setId,
      position: 1000 + i,
      type: "short",
      question: q.question,
      choices: [],
      correctIndex: 0,
      answer: q.answer,
      explanation: "",
      topic: q.topic,
    })),
  ];
  if (quizRows.length > 0) {
    await conn.insert(quizQuestionsTable).values(quizRows);
  }
  if (materials.studyPlan.length > 0) {
    await conn.insert(studySessionsTable).values(
      materials.studyPlan.map((p) => ({
        studySetId: setId,
        day: p.day,
        date: p.date,
        topic: p.topic,
        focus: p.focus,
        estimatedMinutes: p.estimatedMinutes,
        completed: false,
      })),
    );
  }
  await conn
    .update(studySetsTable)
    .set({
      summary: materials.summary,
      keyTerms: materials.keyTerms,
      reviewSheet: materials.reviewSheet,
      weakAreas: materials.weakAreas,
      qualityScore: materials.qualityScore,
    })
    .where(eq(studySetsTable.id, setId));
}

export async function listSetsForUser(
  userId: number,
  filters: { search?: string; subject?: string; folderId?: number | null },
) {
  const conditions = [eq(studySetsTable.userId, userId)];
  if (filters.subject) conditions.push(eq(studySetsTable.subject, filters.subject));
  if (filters.folderId !== undefined && filters.folderId !== null) {
    conditions.push(eq(studySetsTable.folderId, filters.folderId));
  }
  const rows = await db
    .select()
    .from(studySetsTable)
    .where(and(...conditions));
  let filtered = rows;
  if (filters.search) {
    const q = filters.search.toLowerCase();
    filtered = rows.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.subject.toLowerCase().includes(q) ||
        (r.course?.toLowerCase().includes(q) ?? false),
    );
  }
  if (filtered.length === 0) return [];
  const setIds = filtered.map((r) => r.id);
  // SQL aggregate counts — no in-memory N+1 walk.
  const cardRows = await db
    .select({
      studySetId: flashcardsTable.studySetId,
      count: sql<number>`count(*)::int`,
    })
    .from(flashcardsTable)
    .where(inArray(flashcardsTable.studySetId, setIds))
    .groupBy(flashcardsTable.studySetId);
  const quizRows = await db
    .select({
      studySetId: quizQuestionsTable.studySetId,
      count: sql<number>`count(*)::int`,
    })
    .from(quizQuestionsTable)
    .where(inArray(quizQuestionsTable.studySetId, setIds))
    .groupBy(quizQuestionsTable.studySetId);
  const cardCounts = new Map(cardRows.map((r) => [r.studySetId, Number(r.count)]));
  const quizCounts = new Map(quizRows.map((r) => [r.studySetId, Number(r.count)]));
  return filtered
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .map((r) => studySetRowToSummary(r, cardCounts.get(r.id) ?? 0, quizCounts.get(r.id) ?? 0));
}
