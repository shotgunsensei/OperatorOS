import { db } from '../db.js';
import { ssoHandoffTokens } from '../schema.js';
import { lt } from 'drizzle-orm';

// Spec cadence: run cleanup every 5 minutes, deleting any handoff token
// whose `issued_at` is older than 15 minutes. Tokens have a 90-second TTL
// so by the 15-minute mark they're long expired AND past the forensic
// retention window for replay-detection.
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const CLEANUP_AGE_MS = 15 * 60 * 1000;     // 15 minutes

let timer: NodeJS.Timeout | null = null;

export async function cleanupExpiredSsoTokens(): Promise<number> {
  const cutoff = new Date(Date.now() - CLEANUP_AGE_MS);
  const result: any = await db.delete(ssoHandoffTokens)
    .where(lt(ssoHandoffTokens.issuedAt, cutoff));
  return result?.rowCount ?? 0;
}

export function startSsoTokenCleanup() {
  if (timer) return;
  // Run once at startup, then every 5 minutes.
  cleanupExpiredSsoTokens()
    .then(n => { if (n > 0) console.log(`[sso-cleanup] removed ${n} stale tokens at boot`); })
    .catch(err => console.error('[sso-cleanup] boot error:', err));

  timer = setInterval(() => {
    cleanupExpiredSsoTokens()
      .then(n => { if (n > 0) console.log(`[sso-cleanup] removed ${n} stale tokens (>15min old)`); })
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
