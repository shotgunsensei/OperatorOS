import { pgTable, serial, integer, real, jsonb, timestamp, index } from "drizzle-orm/pg-core";

export type AttemptAnswerJson = {
  questionId: number;
  selectedIndex: number;
  correctIndex: number;
  isCorrect: boolean;
  topic: string;
};

export const quizAttemptsTable = pgTable(
  "quiz_attempts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    studySetId: integer("study_set_id").notNull(),
    score: real("score").notNull().default(0),
    correctCount: integer("correct_count").notNull().default(0),
    totalCount: integer("total_count").notNull().default(0),
    answers: jsonb("answers").$type<AttemptAnswerJson[]>().notNull().default([]),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("quiz_attempts_user_id_idx").on(t.userId),
    setIdx: index("quiz_attempts_study_set_id_idx").on(t.studySetId),
  }),
);

export type QuizAttemptRow = typeof quizAttemptsTable.$inferSelect;
