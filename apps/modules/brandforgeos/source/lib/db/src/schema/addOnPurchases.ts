import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const addOnPurchasesTable = pgTable("add_on_purchases", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  addOnType: text("add_on_type").notNull(),
  name: text("name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: integer("unit_price").notNull(),
  status: text("status").notNull().default("active"),
  isRecurring: boolean("is_recurring").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  stripeItemId: text("stripe_item_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AddOnPurchase = typeof addOnPurchasesTable.$inferSelect;
