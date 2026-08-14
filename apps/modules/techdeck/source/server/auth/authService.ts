import bcrypt from "bcrypt";
import { generateSecret as otpGenerateSecret, generateURI, generateSync as otpGenerateToken, verifySync as otpVerifySync } from "otplib";
import crypto from "crypto";
import { db } from "../db";
import { users } from "@shared/models/auth";
import { pendingInvitations, tenantMembers } from "@shared/schema";
import { eq, and } from "drizzle-orm";

const SALT_ROUNDS = 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const RECOVERY_CODE_COUNT = 8;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateTOTPSecret(email: string): { secret: string; otpauthUrl: string } {
  const secret = otpGenerateSecret();
  const otpauthUrl = generateURI({
    strategy: "totp",
    label: email,
    secret,
    issuer: "Tech Deck",
  });
  return { secret, otpauthUrl };
}

export function verifyTOTPToken(token: string, secret: string): boolean {
  const result = otpVerifySync({ token, secret });
  return result.valid;
}

export function generateRecoveryCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    codes.push(crypto.randomBytes(4).toString("hex").toUpperCase());
  }
  return codes;
}

export async function registerUser(data: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}): Promise<{ id: string; email: string }> {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, data.email.toLowerCase()));

  if (existing.length > 0) {
    throw new Error("An account with this email already exists");
  }

  const passwordHash = await hashPassword(data.password);

  const [user] = await db
    .insert(users)
    .values({
      email: data.email.toLowerCase(),
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
    })
    .returning({ id: users.id, email: users.email });

  await processPendingInvitations(user.id, data.email.toLowerCase());

  return { id: user.id, email: user.email! };
}

export async function authenticateUser(email: string, password: string): Promise<{
  user: typeof users.$inferSelect;
  requiresMfa: boolean;
}> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()));

  if (!user) {
    throw new Error("Invalid email or password");
  }

  if (!user.passwordHash) {
    throw new Error("Invalid email or password");
  }

  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    const minutesLeft = Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60000);
    throw new Error(`Account is locked. Try again in ${minutesLeft} minute(s)`);
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const attempts = user.failedLoginAttempts + 1;
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      await db.update(users).set({
        failedLoginAttempts: 0,
        lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS),
      }).where(eq(users.id, user.id));
    } else {
      await db.update(users).set({
        failedLoginAttempts: attempts,
      }).where(eq(users.id, user.id));
    }
    throw new Error("Invalid email or password");
  }

  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await db
      .update(users)
      .set({ failedLoginAttempts: 0, lockedUntil: null })
      .where(eq(users.id, user.id));
  }

  return {
    user,
    requiresMfa: user.mfaEnabled,
  };
}

export async function getUser(id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user;
}

export async function upsertUser(userData: typeof users.$inferInsert) {
  const [user] = await db
    .insert(users)
    .values(userData)
    .onConflictDoUpdate({
      target: users.id,
      set: {
        ...userData,
        updatedAt: new Date(),
      },
    })
    .returning();
  return user;
}

export async function hashRecoveryCode(code: string): Promise<string> {
  return bcrypt.hash(code.toUpperCase(), 10);
}

export async function enableMfa(userId: string, secret: string, recoveryCodes: string[]): Promise<void> {
  const hashedCodes = await Promise.all(recoveryCodes.map(c => hashRecoveryCode(c)));
  await db
    .update(users)
    .set({
      mfaEnabled: true,
      mfaSecret: secret,
      mfaRecoveryCodes: hashedCodes,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export async function disableMfa(userId: string): Promise<void> {
  await db
    .update(users)
    .set({
      mfaEnabled: false,
      mfaSecret: null,
      mfaRecoveryCodes: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export async function useRecoveryCode(userId: string, code: string): Promise<boolean> {
  const user = await getUser(userId);
  if (!user || !user.mfaRecoveryCodes) return false;

  const upperCode = code.toUpperCase();

  for (let i = 0; i < user.mfaRecoveryCodes.length; i++) {
    const match = await bcrypt.compare(upperCode, user.mfaRecoveryCodes[i]);
    if (match) {
      const remaining = [...user.mfaRecoveryCodes];
      remaining.splice(i, 1);
      await db
        .update(users)
        .set({ mfaRecoveryCodes: remaining, updatedAt: new Date() })
        .where(eq(users.id, userId));
      return true;
    }
  }

  return false;
}

async function processPendingInvitations(userId: string, email: string) {
  if (!email) return;
  try {
    const invitations = await db
      .select()
      .from(pendingInvitations)
      .where(eq(pendingInvitations.email, email.toLowerCase()));

    for (const inv of invitations) {
      const existing = await db
        .select()
        .from(tenantMembers)
        .where(
          and(
            eq(tenantMembers.tenantId, inv.tenantId),
            eq(tenantMembers.userId, userId)
          )
        );

      if (existing.length === 0) {
        try {
          await db.insert(tenantMembers).values({
            tenantId: inv.tenantId,
            userId,
            role: inv.role,
          });
          console.log(`[auth] Auto-joined user ${email} to tenant ${inv.tenantId} as ${inv.role}`);
        } catch (insertErr: any) {
          if (!insertErr.message?.includes("duplicate")) {
            throw insertErr;
          }
        }
      }

      await db
        .delete(pendingInvitations)
        .where(eq(pendingInvitations.id, inv.id));
    }
  } catch (err) {
    console.error("[auth] Error processing pending invitations:", err);
  }
}
