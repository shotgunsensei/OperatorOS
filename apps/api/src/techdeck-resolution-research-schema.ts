import { pgTable, varchar, boolean, integer, timestamp, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants, users } from './schema.js';
export const techdeckResolutionResearchSettings = pgTable('techdeck_resolution_research_settings', {
  tenantId: varchar('tenant_id', { length: 36 }).primaryKey().references(() => tenants.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(false),
  dailyRequestLimit: integer('daily_request_limit').notNull().default(20),
  version: integer('version').notNull().default(1),
  updatedByUserId: varchar('updated_by_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [check('tdri_research_limit_ck', sql`${table.dailyRequestLimit} BETWEEN 1 AND 100`), check('tdri_research_version_ck', sql`${table.version} > 0`)]);
