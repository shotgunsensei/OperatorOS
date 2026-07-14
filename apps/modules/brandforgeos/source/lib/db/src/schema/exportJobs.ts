import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const exportJobsTable = pgTable("export_jobs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  exportType: text("export_type").notNull(),
  format: text("format").notNull().default("pdf"),
  status: text("status").notNull().default("pending"),
  fileName: text("file_name"),
  fileUrl: text("file_url"),
  entityType: text("entity_type"),
  entityId: integer("entity_id"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export type ExportJob = typeof exportJobsTable.$inferSelect;
