import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";

export const brandProfilesTable = pgTable(
  "brand_profiles",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    name: text("name").notNull(),
    primaryColor: text("primary_color").notNull(),
    accentColor: text("accent_color").notNull(),
    logoText: text("logo_text").notNull(),
    voice: text("voice").notNull(),
    tagline: text("tagline").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: index("brand_profiles_user_id_idx").on(t.userId),
  }),
);

export type BrandProfile = typeof brandProfilesTable.$inferSelect;
