import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const billingProfilesTable = pgTable("billing_profiles", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  email: text("email"),
  companyName: text("company_name"),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  state: text("state"),
  postalCode: text("postal_code"),
  country: text("country"),
  taxId: text("tax_id"),
  paymentMethodLast4: text("payment_method_last4"),
  paymentMethodBrand: text("payment_method_brand"),
  paymentMethodExpiry: text("payment_method_expiry"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type BillingProfile = typeof billingProfilesTable.$inferSelect;
