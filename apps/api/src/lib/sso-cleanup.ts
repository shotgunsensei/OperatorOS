import { db } from '../db.js';
import { revokedSessionTokens, ssoHandoffTokens } from '../schema.js';
import { and, lt, or, isNull, sql } from 'drizzle-orm';

const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;
let lastRunAt: Date | null = null;
let lastRunPruned: number | null = null;

export function getSsoCleanupHealth(): { lastRunAt: string | null; lastRunPruned: number | null; intervalMs: number } {
  return {
    lastRunAt: lastRunAt ? lastRunAt.toISOString() : null,
    lastRunPruned,
    intervalMs: CLEANUP_INTERVAL_MS,
  };
}

export async function cleanupExpiredSsoTokens(): Promise<number> {
  const now = Date.now();
  const expiresCutoff = new Date(now - RETENTION_MS);
  const consumedCutoff = new Date(now - RETENTION_MS);
  const result: any = await db.delete(ssoHandoffTokens)
    .where(and(
      lt(ssoHandoffTokens.expiresAt, expiresCutoff),
      or(
        isNull(ssoHandoffTokens.consumedAt),
        lt(ssoHandoffTokens.consumedAt, consumedCutoff),
      ),
    ));
  return result?.rowCount ?? 0;
}

export async function cleanupExpiredSessionRevocations(): Promise<number> {
  const result: any = await db.delete(revokedSessionTokens)
    .where(lt(revokedSessionTokens.expiresAt, new Date()));
  return result?.rowCount ?? 0;
}

export async function cleanupAccountSecurityRecords(): Promise<number> {
  const sessions = await db.execute(sql`DELETE FROM auth_browser_sessions WHERE id IN
    (SELECT id FROM auth_browser_sessions WHERE expires_at<NOW() ORDER BY expires_at LIMIT 1000)`);
  const changes = await db.execute(sql`DELETE FROM auth_pending_email_changes WHERE id IN
    (SELECT id FROM auth_pending_email_changes WHERE expires_at<NOW()-INTERVAL '7 days' ORDER BY expires_at LIMIT 1000)`);
  const limits = await db.execute(sql`DELETE FROM auth_request_limits WHERE key_hash IN
    (SELECT key_hash FROM auth_request_limits WHERE resets_at<NOW()-INTERVAL '1 day' ORDER BY resets_at LIMIT 1000)`);
  return (sessions.rowCount ?? 0) + (changes.rowCount ?? 0) + (limits.rowCount ?? 0);
}

function runOnce(label: string) {
  Promise.all([cleanupExpiredSsoTokens(), cleanupExpiredSessionRevocations(), cleanupAccountSecurityRecords()])
    .then(([handoffs, sessions, security]) => {
      lastRunAt = new Date();
      lastRunPruned = handoffs + sessions + security;
      console.log(`[sso-cleanup] ${label}: pruned ${handoffs} stale handoff token row(s) and ${sessions} expired session revocation row(s)`);
    })
    .catch(err => {
      lastRunAt = new Date();
      console.error(`[sso-cleanup] ${label} error:`, err);
    });
}

export function startSsoTokenCleanup() {
  if (timer) return;
  runOnce('boot');
  timer = setInterval(() => runOnce('interval'), CLEANUP_INTERVAL_MS);
  if (timer.unref) timer.unref();
}

export function stopSsoTokenCleanup() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
