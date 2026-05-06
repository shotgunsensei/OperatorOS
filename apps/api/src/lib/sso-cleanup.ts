import { db } from '../db.js';
import { ssoHandoffTokens } from '../schema.js';
import { and, lt, or, isNull } from 'drizzle-orm';

const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;

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

function runOnce(label: string) {
  cleanupExpiredSsoTokens()
    .then(n => console.log(`[sso-cleanup] ${label}: pruned ${n} stale handoff token row(s)`))
    .catch(err => console.error(`[sso-cleanup] ${label} error:`, err));
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
