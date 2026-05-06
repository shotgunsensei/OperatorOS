import crypto from 'node:crypto';
import { db } from '../src/db.js';
import { users, modules, addonSubscriptions, billingEvents, ssoHandoffTokens } from '../src/schema.js';
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

export async function createTestUser() {
  const email = `${uniqueId('billing-test')}@test.local`;
  const [u] = await db.insert(users).values({
    email,
    passwordHash: 'x',
    name: 'Test User',
    role: 'user',
    status: 'active',
  }).returning();
  return u;
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
  try { await db.delete(addonSubscriptions).where(eq(addonSubscriptions.userId, userId)); } catch {}
  try { await db.delete(billingEvents).where(eq(billingEvents.userId, userId)); } catch {}
  try { await db.delete(ssoHandoffTokens).where(eq(ssoHandoffTokens.userId, userId)); } catch {}
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
