import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const jobsTable = pgTable("jobs", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  title: text("title").notNull(),
  jobType: text("job_type").notNull(),
  status: text("status").notNull().default("draft"),
  description: text("description"),
  customerId: integer("customer_id"),
  siteAddress: text("site_address"),
  assignedToId: integer("assigned_to_id"),
  templateId: integer("template_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertJobSchema = createInsertSchema(jobsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobsTable.$inferSelect;
