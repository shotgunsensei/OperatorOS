import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { adminAuditLogs } from '../schema.js';
import type { JWTPayload } from './auth.js';

function deviceLabel(agent: string) {
  const browser = /Edg\//.test(agent) ? 'Edge' : /Firefox\//.test(agent) ? 'Firefox' : /Chrome\//.test(agent) ? 'Chrome' : /Safari\//.test(agent) ? 'Safari' : 'Browser';
  const system = /Android/.test(agent) ? 'Android' : /iPhone|iPad/.test(agent) ? 'iPhone or iPad' : /Windows/.test(agent) ? 'Windows' : /Macintosh/.test(agent) ? 'Mac' : /Linux/.test(agent) ? 'Linux' : 'another device';
  return `${browser} on ${system}`;
}

export async function observeBrowserSession(tokenHash: string, payload: JWTPayload, userAgent: string) {
  if (!payload.exp) return;
  await db.execute(sql`INSERT INTO auth_browser_sessions(user_id,token_hash,token_version,session_type,module_slug,device_label,expires_at)
    VALUES (${payload.userId},${tokenHash},${payload.tokenVersion ?? 0},${payload.sessionType},${payload.moduleId ?? null},${deviceLabel(userAgent)},${new Date(payload.exp * 1000)})
    ON CONFLICT (token_hash) DO UPDATE SET last_seen_at=NOW()
      WHERE auth_browser_sessions.last_seen_at<NOW()-INTERVAL '1 minute'`);
}

export async function listBrowserSessions(userId: string, tokenVersion: number, currentHash: string) {
  const result = await db.execute(sql`SELECT s.id,s.device_label AS "deviceLabel",s.session_type AS "sessionType",s.module_slug AS "moduleSlug",
    s.first_seen_at AS "firstSeenAt",s.last_seen_at AS "lastSeenAt",s.expires_at AS "expiresAt",(s.token_hash=${currentHash}) AS current
    FROM auth_browser_sessions s
    WHERE s.user_id=${userId} AND s.token_version=${tokenVersion} AND s.expires_at>NOW()
      AND NOT EXISTS (SELECT 1 FROM revoked_session_tokens r WHERE r.token_hash=s.token_hash AND r.user_id=s.user_id)
    ORDER BY s.last_seen_at DESC,s.id LIMIT 100`);
  return result.rows;
}

export async function revokeBrowserSession(userId: string, id: string, currentHash: string) {
  return db.transaction(async tx => {
    const result = await tx.execute(sql`SELECT * FROM auth_browser_sessions WHERE user_id=${userId} AND id=${id} AND expires_at>NOW() FOR UPDATE`);
    const session = result.rows[0];
    if (!session) return null;
    await tx.execute(sql`INSERT INTO revoked_session_tokens(token_hash,user_id,session_type,module_id,expires_at,reason)
      VALUES (${String(session.token_hash)},${userId},${String(session.session_type)},${session.module_slug ? String(session.module_slug) : null},${new Date(String(session.expires_at))},'user_session_revocation') ON CONFLICT DO NOTHING`);
    await tx.insert(adminAuditLogs).values({ adminId: userId, action: 'browser_session_revoked', targetUserId: userId, details: { sessionId: id } });
    return { revoked: true, currentSessionRevoked: session.token_hash === currentHash };
  });
}
