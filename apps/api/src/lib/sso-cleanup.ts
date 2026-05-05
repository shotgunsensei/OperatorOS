import { db } from '../db.js';
import { ssoHandoffTokens } from '../schema.js';
import { lt, or, isNotNull, and } from 'drizzle-orm';

const CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

let timer: NodeJS.Timeout | null = null;

export async function cleanupExpiredSsoTokens(): Promise<number> {
  // Aggressive cleanup: delete tokens that are either expired OR already consumed.
  // Even consumed tokens are kept only briefly so the table stays bounded.
  const cutoff = new Date(Date.now() - 60 * 1000); // keep recent for forensic 1min
  const result: any = await db.delete(ssoHandoffTokens)
    .where(or(
      lt(ssoHandoffTokens.expiresAt, new Date()),
      and(isNotNull(ssoHandoffTokens.consumedAt), lt(ssoHandoffTokens.consumedAt, cutoff)),
    ));
  return result?.rowCount ?? 0;
}

export function startSsoTokenCleanup() {
  if (timer) return;
  // Run once at startup, then every 15 minutes.
  cleanupExpiredSsoTokens()
    .then(n => { if (n > 0) console.log(`[sso-cleanup] removed ${n} expired/consumed tokens at boot`); })
    .catch(err => console.error('[sso-cleanup] boot error:', err));

  timer = setInterval(() => {
    cleanupExpiredSsoTokens()
      .then(n => { if (n > 0) console.log(`[sso-cleanup] removed ${n} expired/consumed tokens`); })
      .catch(err => console.error('[sso-cleanup] interval error:', err));
  }, CLEANUP_INTERVAL_MS);
  // Don't keep the event loop alive just for cleanup
  if (timer.unref) timer.unref();
}

export function stopSsoTokenCleanup() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
