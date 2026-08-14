import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const syncJobsTable = pgTable("sync_jobs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  integrationId: integer("integration_id"),
  jobType: text("job_type").notNull(),
  status: text("status").notNull().default("pending"),
  progress: integer("progress").notNull().default(0),
  totalItems: integer("total_items"),
  processedItems: integer("processed_items").notNull().default(0),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SyncJob = typeof syncJobsTable.$inferSelect;
