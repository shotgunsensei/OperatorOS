import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const integrationsTable = pgTable("integrations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  status: text("status").notNull().default("disconnected"),
  config: text("config"),
  accountName: text("account_name"),
  accountId: text("account_id"),
  permissions: text("permissions"),
  errorMessage: text("error_message"),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  isEnabled: boolean("is_enabled").notNull().default(false),
  connectedAt: timestamp("connected_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Integration = typeof integrationsTable.$inferSelect;
