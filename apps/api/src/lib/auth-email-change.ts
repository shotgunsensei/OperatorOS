import { createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { adminAuditLogs } from '../schema.js';

const PREFIX = 'change_email_';
const fingerprint = (value: string) => createHash('sha256').update(value).digest('hex');
export const isEmailChangeToken = (token: unknown): token is string => typeof token === 'string' && /^change_email_[A-Za-z0-9_-]{43}$/.test(token);

export async function issueEmailChange(userId: string, newEmail: string) {
  const token = PREFIX + randomBytes(32).toString('base64url');
  const row = await db.transaction(async tx => {
    const current = await tx.execute(sql`SELECT email,token_version,status FROM users WHERE id=${userId} FOR UPDATE`);
    const user = current.rows[0];
    if (!user || user.status !== 'active' || user.email === newEmail) throw new Error('Email change unavailable');
    await tx.execute(sql`UPDATE auth_pending_email_changes SET used_at=NOW() WHERE user_id=${userId} AND used_at IS NULL`);
    const inserted = await tx.execute(sql`INSERT INTO auth_pending_email_changes(user_id,old_email,new_email,token_hash,user_token_version,expires_at)
      VALUES (${userId},${String(user.email)},${newEmail},${fingerprint(token)},${Number(user.token_version)},NOW()+INTERVAL '1 hour') RETURNING id,expires_at`);
    await tx.insert(adminAuditLogs).values({ adminId: userId, action: 'email_change_requested', targetUserId: userId, details: {} });
    return inserted.rows[0];
  });
  return { token, id: String(row.id), expiresAt: new Date(String(row.expires_at)) };
}

export async function cancelEmailChange(userId: string, id: string) {
  await db.execute(sql`UPDATE auth_pending_email_changes SET used_at=NOW() WHERE user_id=${userId} AND id=${id} AND used_at IS NULL`);
}

export async function confirmEmailChange(token: string) {
  if (!isEmailChangeToken(token)) return null;
  try {
    return await db.transaction(async tx => {
      const pending = await tx.execute(sql`SELECT user_id FROM auth_pending_email_changes WHERE token_hash=${fingerprint(token)} AND used_at IS NULL AND expires_at>NOW()`);
      if (!pending.rows[0]) return null;
      const userId = String(pending.rows[0].user_id);
      // Same user-first lock order as issuing a replacement link.
      const current = await tx.execute(sql`SELECT email,token_version,status FROM users WHERE id=${userId} FOR UPDATE`);
      const user = current.rows[0];
      const locked = await tx.execute(sql`SELECT * FROM auth_pending_email_changes WHERE token_hash=${fingerprint(token)} AND used_at IS NULL AND expires_at>NOW() FOR UPDATE`);
      const change = locked.rows[0];
      if (!user || !change || user.status !== 'active' || user.email !== change.old_email || Number(user.token_version) !== Number(change.user_token_version)) return null;
      const conflict = await tx.execute(sql`SELECT 1 FROM users WHERE lower(email)=lower(${String(change.new_email)}) AND id<>${userId}`);
      if (conflict.rows.length) return null;
      const updated = await tx.execute(sql`UPDATE users SET email=${String(change.new_email)},email_verified_at=NOW(),token_version=token_version+1,updated_at=NOW() WHERE id=${userId} RETURNING email_verified_at`);
      await tx.execute(sql`UPDATE auth_pending_email_changes SET used_at=NOW() WHERE user_id=${userId} AND used_at IS NULL`);
      await tx.execute(sql`UPDATE email_verification_tokens SET used_at=NOW() WHERE user_id=${userId} AND used_at IS NULL`);
      await tx.insert(adminAuditLogs).values({ adminId: userId, action: 'email_changed', targetUserId: userId, details: { verifiedNewAddress: true, revokedAllSessions: true } });
      return { userId, oldEmail: String(change.old_email), verifiedAt: new Date(String(updated.rows[0].email_verified_at)) };
    });
  } catch (error) {
    const code = (error as any)?.code ?? (error as any)?.cause?.code;
    if (code === '23505') return null;
    throw error;
  }
}
