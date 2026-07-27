import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const scriptsTable = pgTable("scripts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  content: text("content").notNull(),
  fileName: text("file_name").notNull(),
  format: text("format").notNull(),
  category: text("category").notNull().default("general"),
  source: text("source").notNull().default("github"),
  githubPath: text("github_path"),
  downloadCount: integer("download_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertScriptSchema = createInsertSchema(scriptsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertScript = z.infer<typeof insertScriptSchema>;
export type Script = typeof scriptsTable.$inferSelect;
