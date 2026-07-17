import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const creditPacksTable = pgTable("credit_packs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  credits: integer("credits").notNull(),
  creditsRemaining: integer("credits_remaining").notNull(),
  price: integer("price").notNull(),
  purchasedBy: text("purchased_by"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CreditPack = typeof creditPacksTable.$inferSelect;
