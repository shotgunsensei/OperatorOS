import crypto from 'node:crypto';
import { db } from '../src/db.js';
import {
  users, modules, addonSubscriptions, billingEvents, ssoHandoffTokens,
  tenants, tenantUsers, tenantModules, tenantUserModuleAccess,
  tenantEntitlements,
  saasWorkspaces, saasProjects, saasTasks, notes, activityFeed,
  usageTracking, aiActionsLog, aiPromptTemplates,
} from '../src/schema.js';
import { eq } from 'drizzle-orm';

export const TEST_TAG = 'test-billing-regression';

export async function ensureSchemaReady() {
  const { ensureExtendedTables } = await import('../src/lib/db-init.js');
  const { ensureSaasTables, ensureTenantTables } = await import('../src/lib/saas-db-init.js');
  await ensureExtendedTables();
  await ensureSaasTables();
  // Gate 1: tenant DDL must run before any code path that selects from
  // `users` (Drizzle's implicit SELECT * needs the new columns).
  await ensureTenantTables();
}

export function uniqueId(prefix: string) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

// Gate 2: every user lives in a tenant. createTestUser provisions a
// personal tenant + owner membership and points current_tenant_id at it,
// so any test that exercises a tenant-scoped route resolves a real
// tenantId through `users.current_tenant_id` without extra wiring.
export async function createTestUser() {
  const email = `${uniqueId('billing-test')}@test.local`;
  const [u] = await db.insert(users).values({
    email,
    passwordHash: 'x',
    name: 'Test User',
    role: 'user',
    status: 'active',
  }).returning();
  const [tenant] = await db.insert(tenants).values({
    name: 'Personal',
    slug: `personal-${u.id}`,
    type: 'personal',
    ownerUserId: u.id,
  }).returning();
  await db.insert(tenantUsers).values({ tenantId: tenant.id, userId: u.id, role: 'owner' });
  await db.update(users).set({ currentTenantId: tenant.id, updatedAt: new Date() }).where(eq(users.id, u.id));
  return { ...u, currentTenantId: tenant.id };
}

export async function createTestModule(slug?: string) {
  const s = slug ?? uniqueId('test-mod');
  const [m] = await db.insert(modules).values({
    slug: s,
    name: 'Test Module',
    description: 'fixture',
    baseUrl: 'https://example.test',
    status: 'live',
    planMin: 'starter',
    ord: 0,
  }).returning();
  return m;
}

export async function cleanupUser(userId: string) {
  // Order matters: child rows first, then membership rows, then the
  // personal tenant the user owns, then the user. Each step is wrapped
  // in try/catch so a missing optional table (older schema) doesn't
  // abort the rest of the cleanup.
  try { await db.delete(aiActionsLog).where(eq(aiActionsLog.userId, userId)); } catch {}
  try { await db.delete(aiPromptTemplates).where(eq(aiPromptTemplates.userId, userId)); } catch {}
  try { await db.delete(usageTracking).where(eq(usageTracking.userId, userId)); } catch {}
  try { await db.delete(activityFeed).where(eq(activityFeed.userId, userId)); } catch {}
  try { await db.delete(notes).where(eq(notes.userId, userId)); } catch {}
  try { await db.delete(saasTasks).where(eq(saasTasks.userId, userId)); } catch {}
  try { await db.delete(saasProjects).where(eq(saasProjects.userId, userId)); } catch {}
  try { await db.delete(saasWorkspaces).where(eq(saasWorkspaces.ownerId, userId)); } catch {}
  try { await db.delete(addonSubscriptions).where(eq(addonSubscriptions.userId, userId)); } catch {}
  try { await db.delete(billingEvents).where(eq(billingEvents.userId, userId)); } catch {}
  try { await db.delete(ssoHandoffTokens).where(eq(ssoHandoffTokens.userId, userId)); } catch {}
  try { await db.delete(tenantUserModuleAccess).where(eq(tenantUserModuleAccess.userId, userId)); } catch {}
  try { await db.delete(tenantUsers).where(eq(tenantUsers.userId, userId)); } catch {}
  try {
    // Drop any tenants this user owns (the personal tenant + any leftover
    // company tenants the test forgot to clean). Cascade child rows first.
    const owned = await db.select().from(tenants).where(eq(tenants.ownerUserId, userId));
    for (const t of owned) {
      try { await db.delete(tenantUserModuleAccess).where(eq(tenantUserModuleAccess.tenantId, t.id)); } catch {}
      try { await db.delete(tenantEntitlements).where(eq(tenantEntitlements.tenantId, t.id)); } catch {}
      try { await db.delete(tenantModules).where(eq(tenantModules.tenantId, t.id)); } catch {}
      try { await db.delete(tenantUsers).where(eq(tenantUsers.tenantId, t.id)); } catch {}
      try { await db.delete(tenants).where(eq(tenants.id, t.id)); } catch {}
    }
  } catch {}
  try { await db.delete(users).where(eq(users.id, userId)); } catch {}
}

export async function cleanupModule(moduleId: string) {
  try { await db.delete(addonSubscriptions).where(eq(addonSubscriptions.moduleId, moduleId)); } catch {}
  try { await db.delete(modules).where(eq(modules.id, moduleId)); } catch {}
}

export interface CapturedLog { stream: 'log' | 'warn' | 'error'; line: string }

export function captureConsole(): { logs: CapturedLog[]; restore: () => void } {
  const logs: CapturedLog[] = [];
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;
  console.log = (...a: unknown[]) => { logs.push({ stream: 'log', line: a.map(String).join(' ') }); };
  console.warn = (...a: unknown[]) => { logs.push({ stream: 'warn', line: a.map(String).join(' ') }); };
  console.error = (...a: unknown[]) => { logs.push({ stream: 'error', line: a.map(String).join(' ') }); };
  return {
    logs,
    restore() {
      console.log = origLog;
      console.warn = origWarn;
      console.error = origError;
    },
  };
}

export function buildAddonCheckoutEvent(opts: {
  userId: string;
  moduleSlug: string;
  eventId?: string;
  stripeSubId?: string;
  customerId?: string;
}) {
  const eventId = opts.eventId ?? uniqueId('evt');
  return {
    id: eventId,
    type: 'checkout.session.completed' as const,
    data: {
      object: {
        id: uniqueId('cs'),
        subscription: opts.stripeSubId ?? uniqueId('sub'),
        customer: opts.customerId ?? uniqueId('cus'),
        amount_total: 1500,
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        metadata: {
          type: 'addon',
          kind: 'addon',
          user_id: opts.userId,
          userId: opts.userId,
          module_slug: opts.moduleSlug,
          moduleSlug: opts.moduleSlug,
        },
      },
    },
  };
}
