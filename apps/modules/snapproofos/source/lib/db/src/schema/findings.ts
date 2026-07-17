import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const findingsTable = pgTable("findings", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull(),
  issue: text("issue").notNull(),
  cause: text("cause"),
  resolution: text("resolution"),
  recommendation: text("recommendation"),
  severity: text("severity").notNull().default("medium"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFindingSchema = createInsertSchema(findingsTable).omit({ id: true, createdAt: true });
export type InsertFinding = z.infer<typeof insertFindingSchema>;
export type Finding = typeof findingsTable.$inferSelect;
