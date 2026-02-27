import { pgTable, text, varchar, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const workspaces = pgTable('workspaces', {
  id: varchar('id', { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  gitUrl: text('git_url').notNull(),
  gitRef: text('git_ref').notNull().default('main'),
  profileId: text('profile_id').notNull().default('node20'),
  status: text('status', {
    enum: ['pending', 'provisioning', 'running', 'stopped', 'error'],
  }).notNull().default('pending'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type WorkspaceRow = typeof workspaces.$inferSelect;
export type InsertWorkspace = typeof workspaces.$inferInsert;
