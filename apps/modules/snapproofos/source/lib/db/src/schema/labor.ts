import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const laborTable = pgTable("labor", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull(),
  description: text("description").notNull(),
  hours: numeric("hours", { precision: 10, scale: 2 }).notNull().default("0"),
  rate: numeric("rate", { precision: 10, scale: 2 }).notNull().default("0"),
  technicianId: integer("technician_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLaborSchema = createInsertSchema(laborTable).omit({ id: true, createdAt: true });
export type InsertLabor = z.infer<typeof insertLaborSchema>;
export type Labor = typeof laborTable.$inferSelect;
