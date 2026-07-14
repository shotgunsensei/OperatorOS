import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const brandingTable = pgTable("branding", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().unique(),
  logoUrl: text("logo_url"),
  accentColor: text("accent_color").notNull().default("#dc2626"),
  companyName: text("company_name").notNull(),
  footerText: text("footer_text"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  website: text("website"),
  headerHtml: text("header_html"),
  footerHtml: text("footer_html"),
});

export const insertBrandingSchema = createInsertSchema(brandingTable).omit({ id: true });
export type InsertBranding = z.infer<typeof insertBrandingSchema>;
export type Branding = typeof brandingTable.$inferSelect;
