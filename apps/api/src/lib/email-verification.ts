import crypto from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { emailVerificationTokens, users } from '../schema.js';

export const EMAIL_VERIFICATION_TTL_HOURS = 24;

function hashVerificationToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function fingerprintEmail(email: string): string {
  return crypto.createHash('sha256').update(email.trim().toLowerCase(), 'utf8').digest('hex');
}

export async function issueEmailVerificationToken(
  userId: string,
  requestedIp: string | null,
): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = await db.transaction(async tx => {
    const lockedUser = await tx.execute(sql<{
      email: string;
      status: string;
    }>`SELECT email,status FROM users WHERE id = ${userId} FOR UPDATE`);
    const user = lockedUser.rows[0] as { email: string; status: string } | undefined;
    if (!user || user.status !== 'active') throw new Error('Active user is required for email verification');
    await tx.update(emailVerificationTokens).set({ usedAt: new Date() }).where(and(
      eq(emailVerificationTokens.userId, userId),
      isNull(emailVerificationTokens.usedAt),
    ));
    const [inserted] = await tx.insert(emailVerificationTokens).values({
      userId,
      tokenHash: hashVerificationToken(token),
      emailFingerprint: fingerprintEmail(user.email),
      expiresAt: sql`NOW() + (${EMAIL_VERIFICATION_TTL_HOURS} * INTERVAL '1 hour')`,
      requestedIp,
    }).returning({ expiresAt: emailVerificationTokens.expiresAt });
    return inserted!.expiresAt;
  });

  return { token, expiresAt };
}

export async function confirmEmailVerificationToken(token: string): Promise<{
  userId: string;
  email: string;
  verifiedAt: Date;
} | null> {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{40,100}$/.test(token)) return null;
  const tokenHash = hashVerificationToken(token);

  return db.transaction(async tx => {
    const lockedVerification = await tx.execute(sql<{
      id: string;
      user_id: string;
      email_fingerprint: string;
    }>`SELECT id,user_id,email_fingerprint
        FROM email_verification_tokens
        WHERE token_hash = ${tokenHash}
          AND used_at IS NULL
          AND expires_at > NOW()
        FOR UPDATE`);
    const verification = lockedVerification.rows[0] as {
      id: string;
      user_id: string;
      email_fingerprint: string;
    } | undefined;
    if (!verification) return null;

    const lockedUser = await tx.execute(sql<{
      id: string;
      email: string;
      status: string;
    }>`SELECT id,email,status FROM users WHERE id = ${verification.user_id} FOR UPDATE`);
    const currentUser = lockedUser.rows[0] as { id: string; email: string; status: string } | undefined;
    if (
      !currentUser
      || currentUser.status !== 'active'
      || fingerprintEmail(currentUser.email) !== verification.email_fingerprint
    ) {
      await tx.update(emailVerificationTokens).set({ usedAt: sql`NOW()` })
        .where(eq(emailVerificationTokens.id, verification.id));
      return null;
    }

    const [user] = await tx.update(users).set({
      emailVerifiedAt: sql`NOW()`,
      updatedAt: sql`NOW()`,
    }).where(eq(users.id, currentUser.id))
      .returning({ id: users.id, email: users.email, emailVerifiedAt: users.emailVerifiedAt });
    if (!user?.emailVerifiedAt) return null;

    // A successful proof invalidates every other outstanding link for this
    // account. The consumed row remains auditable but can never be replayed.
    await tx.update(emailVerificationTokens).set({ usedAt: sql`NOW()` }).where(and(
      eq(emailVerificationTokens.userId, user.id),
      isNull(emailVerificationTokens.usedAt),
    ));
    return { userId: user.id, email: user.email, verifiedAt: user.emailVerifiedAt };
  });
}

export async function invalidateEmailVerificationTokens(userId: string): Promise<void> {
  await db.update(emailVerificationTokens).set({ usedAt: new Date() }).where(and(
    eq(emailVerificationTokens.userId, userId),
    isNull(emailVerificationTokens.usedAt),
  ));
}
