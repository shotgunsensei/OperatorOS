import { pgTable, serial, text, boolean } from "drizzle-orm/pg-core";

export const adminSettingsTable = pgTable("admin_settings", {
  id: serial("id").primaryKey(),
  demoMode: boolean("demo_mode").notNull().default(true),
  signupOpen: boolean("signup_open").notNull().default(true),
  announcement: text("announcement").notNull().default(""),
});

export type AdminSettingsRow = typeof adminSettingsTable.$inferSelect;
