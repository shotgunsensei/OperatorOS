import { pgTable, serial, text, integer, jsonb, index } from "drizzle-orm/pg-core";

export const quizQuestionsTable = pgTable(
  "quiz_questions",
  {
    id: serial("id").primaryKey(),
    studySetId: integer("study_set_id").notNull(),
    position: integer("position").notNull().default(0),
    type: text("type").notNull().default("mcq"),
    question: text("question").notNull(),
    choices: jsonb("choices").$type<string[]>().notNull().default([]),
    correctIndex: integer("correct_index").notNull().default(0),
    answer: text("answer").notNull().default(""),
    explanation: text("explanation").notNull().default(""),
    topic: text("topic").notNull().default(""),
  },
  (t) => ({
    setIdx: index("quiz_questions_study_set_id_idx").on(t.studySetId),
  }),
);

export type QuizQuestionRow = typeof quizQuestionsTable.$inferSelect;
