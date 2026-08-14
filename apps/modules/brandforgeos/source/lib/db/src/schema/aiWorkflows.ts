import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const aiWorkflowsTable = pgTable("ai_workflows", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  userId: text("user_id"),
  workflowType: text("workflow_type").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull().default("pending"),
  inputs: text("inputs").notNull().default("{}"),
  outputs: text("outputs"),
  linkedEntityType: text("linked_entity_type"),
  linkedEntityId: integer("linked_entity_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});
