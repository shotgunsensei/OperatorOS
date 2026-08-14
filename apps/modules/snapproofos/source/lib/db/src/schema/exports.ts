import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const exportsTable = pgTable("exports", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull(),
  organizationId: integer("organization_id").notNull(),
  format: text("format").notNull().default("pdf"),
  fileUrl: text("file_url"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertExportSchema = createInsertSchema(exportsTable).omit({ id: true, createdAt: true });
export type InsertExport = z.infer<typeof insertExportSchema>;
export type ExportRecord = typeof exportsTable.$inferSelect;
