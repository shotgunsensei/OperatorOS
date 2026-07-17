import { pgTable, serial, text, integer, index } from "drizzle-orm/pg-core";

export const flashcardsTable = pgTable(
  "flashcards",
  {
    id: serial("id").primaryKey(),
    studySetId: integer("study_set_id").notNull(),
    position: integer("position").notNull().default(0),
    front: text("front").notNull(),
    back: text("back").notNull(),
    status: text("status").notNull().default("new"),
  },
  (t) => ({
    setIdx: index("flashcards_study_set_id_idx").on(t.studySetId),
  }),
);

export type FlashcardRow = typeof flashcardsTable.$inferSelect;
