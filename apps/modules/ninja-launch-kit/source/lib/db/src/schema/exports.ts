import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";

export const exportsTable = pgTable(
  "exports",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    kitId: integer("kit_id").notNull(),
    kitTitle: text("kit_title").notNull(),
    format: text("format").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: index("exports_user_id_idx").on(t.userId),
    userCreatedIdx: index("exports_user_created_idx").on(t.userId, t.createdAt),
  }),
);

export type ExportRow = typeof exportsTable.$inferSelect;
