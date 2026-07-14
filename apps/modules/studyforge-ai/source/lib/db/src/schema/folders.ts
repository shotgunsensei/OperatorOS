import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";

export const foldersTable = pgTable(
  "folders",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    name: text("name").notNull(),
    color: text("color").notNull().default("#7c3aed"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("folders_user_id_idx").on(t.userId),
  }),
);

export type Folder = typeof foldersTable.$inferSelect;
