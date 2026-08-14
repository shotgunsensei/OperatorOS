import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const notesTable = pgTable("notes", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull(),
  content: text("content").notNull(),
  noteType: text("note_type").notNull().default("internal"),
  isVoiceNote: boolean("is_voice_note").notNull().default(false),
  audioUrl: text("audio_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertNoteSchema = createInsertSchema(notesTable).omit({ id: true, createdAt: true });
export type InsertNote = z.infer<typeof insertNoteSchema>;
export type Note = typeof notesTable.$inferSelect;
