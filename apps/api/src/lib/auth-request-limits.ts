import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';

/** Atomic counters shared by API instances. Only one-way hashes of rate keys
 * are persisted. A database failure does not grant another authentication try. */
export async function checkPersistentAuthRateLimit(key: string, max: number, windowMs: number) {
  if (!Number.isSafeInteger(max) || max < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1) throw new Error('Invalid authentication rate policy');
  const hash = createHash('sha256').update(key).digest('hex');
  const result = await db.execute(sql`
    INSERT INTO auth_request_limits(key_hash,request_count,resets_at)
    VALUES (${hash},1,NOW()+${windowMs}*INTERVAL '1 millisecond')
    ON CONFLICT (key_hash) DO UPDATE SET
      request_count=CASE WHEN auth_request_limits.resets_at<=NOW() THEN 1 ELSE LEAST(auth_request_limits.request_count+1,${max + 1}) END,
      resets_at=CASE WHEN auth_request_limits.resets_at<=NOW() THEN NOW()+${windowMs}*INTERVAL '1 millisecond' ELSE auth_request_limits.resets_at END
    RETURNING request_count
  `);
  // Bounded maintenance; an old rate key is never needed once its window ends.
  await db.execute(sql`DELETE FROM auth_request_limits WHERE key_hash IN
    (SELECT key_hash FROM auth_request_limits WHERE resets_at<NOW()-INTERVAL '1 day' ORDER BY resets_at LIMIT 100)`);
  return Number(result.rows[0]?.request_count) <= max;
}
