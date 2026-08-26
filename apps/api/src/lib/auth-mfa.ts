import bcrypt from 'bcryptjs';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { sql } from 'drizzle-orm';
import QRCode from 'qrcode';
import { db } from '../db.js';
import { decryptServerSecret, encryptServerSecret } from './shared-secret-vault.js';

type Executor = Pick<typeof db, 'execute'>;

export const MFA_CHALLENGE_COOKIE_NAME = 'operatoros_mfa_challenge';
export const MFA_CHALLENGE_TTL_SECONDS = 5 * 60;
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const MAX_CHALLENGE_FAILURES = 5;
const RECOVERY_CODE_COUNT = 10;

export class AuthMfaError extends Error {
  constructor(message: string, public readonly code: string, public readonly statusCode = 400) {
    super(message);
  }
}

function base32Encode(value: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let accumulator = 0;
  let output = '';
  for (const byte of value) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(accumulator >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(accumulator << (5 - bits)) & 31];
  return output;
}

function base32Decode(value: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const normalized = value.toUpperCase().replace(/=+$/u, '').replace(/\s+/gu, '');
  let bits = 0;
  let accumulator = 0;
  const output: number[] = [];
  for (const character of normalized) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new AuthMfaError('Authenticator secret is invalid', 'MFA_SECRET_INVALID', 500);
    accumulator = (accumulator << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((accumulator >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function hotp(secret: string, counter: number): string {
  const input = Buffer.alloc(8);
  input.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', base32Decode(secret)).update(input).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = ((digest[offset]! & 0x7f) << 24)
    | ((digest[offset + 1]! & 0xff) << 16)
    | ((digest[offset + 2]! & 0xff) << 8)
    | (digest[offset + 3]! & 0xff);
  return String(binary % (10 ** TOTP_DIGITS)).padStart(TOTP_DIGITS, '0');
}

export function verifyTotp(code: string, secret: string, nowMs = Date.now()): boolean {
  const normalized = code.replace(/[\s-]/gu, '');
  if (!/^\d{6}$/u.test(normalized)) return false;
  const counter = Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
  const supplied = Buffer.from(normalized);
  for (const drift of [-1, 0, 1]) {
    const expected = Buffer.from(hotp(secret, counter + drift));
    if (expected.length === supplied.length && timingSafeEqual(expected, supplied)) return true;
  }
  return false;
}

export function generateTotpForTest(secret: string, nowMs = Date.now()): string {
  return hotp(secret, Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS));
}

function challengeHash(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function normalizeRecoveryCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/gu, '');
}

function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const value = randomBytes(5).toString('hex').toUpperCase();
    return `${value.slice(0, 5)}-${value.slice(5)}`;
  });
}

async function loadTotp(userId: string, executor: Executor = db) {
  const result = await executor.execute(sql`
    SELECT ciphertext, iv, auth_tag, key_version, enabled_at, pending_at
    FROM auth_mfa_totp WHERE user_id = ${userId} LIMIT 1
  `);
  const row = result.rows[0] as any;
  if (!row) return null;
  return {
    secret: decryptServerSecret({
      ciphertext: row.ciphertext,
      iv: row.iv,
      authTag: row.auth_tag,
      keyVersion: String(row.key_version),
    }),
    enabledAt: row.enabled_at ? new Date(row.enabled_at) : null,
    pendingAt: new Date(row.pending_at),
  };
}

export async function getAuthMfaStatus(userId: string) {
  const result = await db.execute(sql`
    SELECT m.enabled_at, m.pending_at,
      COUNT(r.id) FILTER (WHERE r.used_at IS NULL)::integer AS recovery_codes_remaining
    FROM auth_mfa_totp m
    LEFT JOIN auth_mfa_recovery_codes r ON r.user_id = m.user_id
    WHERE m.user_id = ${userId}
    GROUP BY m.user_id, m.enabled_at, m.pending_at
  `);
  const row = result.rows[0] as any;
  return {
    enabled: Boolean(row?.enabled_at),
    enabledAt: row?.enabled_at ? new Date(row.enabled_at).toISOString() : null,
    pendingSetup: Boolean(row && !row.enabled_at),
    recoveryCodesRemaining: Number(row?.recovery_codes_remaining ?? 0),
  };
}

export async function beginAuthMfaEnrollment(input: { userId: string; email: string }) {
  const current = await getAuthMfaStatus(input.userId);
  if (current.enabled) throw new AuthMfaError('Multi-factor authentication is already enabled', 'MFA_ALREADY_ENABLED', 409);
  const secret = base32Encode(randomBytes(20));
  const encrypted = encryptServerSecret(secret);
  await db.execute(sql`
    INSERT INTO auth_mfa_totp (user_id, ciphertext, iv, auth_tag, key_version, enabled_at, pending_at, updated_at)
    VALUES (${input.userId}, ${encrypted.ciphertext}, ${encrypted.iv}, ${encrypted.authTag}, ${encrypted.keyVersion}, NULL, NOW(), NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      ciphertext = EXCLUDED.ciphertext,
      iv = EXCLUDED.iv,
      auth_tag = EXCLUDED.auth_tag,
      key_version = EXCLUDED.key_version,
      enabled_at = NULL,
      pending_at = NOW(),
      updated_at = NOW()
  `);
  await db.execute(sql`DELETE FROM auth_mfa_recovery_codes WHERE user_id = ${input.userId}`);
  const issuer = 'OperatorOS';
  const label = encodeURIComponent(`${issuer}:${input.email}`);
  const otpauthUrl = `otpauth://totp/${label}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SECONDS}`;
  return {
    secret,
    otpauthUrl,
    qrDataUrl: await QRCode.toDataURL(otpauthUrl, { errorCorrectionLevel: 'M', margin: 1, width: 240 }),
  };
}

export async function confirmAuthMfaEnrollment(input: { userId: string; code: string }) {
  const totp = await loadTotp(input.userId);
  if (!totp || totp.enabledAt) throw new AuthMfaError('No pending MFA enrollment was found', 'MFA_ENROLLMENT_NOT_PENDING', 409);
  if (!verifyTotp(input.code, totp.secret)) throw new AuthMfaError('The authenticator code is invalid', 'MFA_CODE_INVALID', 401);
  const recoveryCodes = generateRecoveryCodes();
  const hashes = await Promise.all(recoveryCodes.map(code => bcrypt.hash(normalizeRecoveryCode(code), 12)));
  await db.transaction(async tx => {
    await tx.execute(sql`
      UPDATE auth_mfa_totp SET enabled_at = NOW(), updated_at = NOW()
      WHERE user_id = ${input.userId} AND enabled_at IS NULL
    `);
    await tx.execute(sql`DELETE FROM auth_mfa_recovery_codes WHERE user_id = ${input.userId}`);
    for (const hash of hashes) {
      await tx.execute(sql`INSERT INTO auth_mfa_recovery_codes (user_id, code_hash) VALUES (${input.userId}, ${hash})`);
    }
  });
  return { ok: true, recoveryCodes };
}

async function verifyMfaCredential(input: {
  userId: string;
  code?: string;
  recoveryCode?: string;
  consumeRecoveryCode: boolean;
}, executor: Executor): Promise<boolean> {
  const totp = await loadTotp(input.userId, executor);
  if (!totp?.enabledAt) return false;
  if (input.code && verifyTotp(input.code, totp.secret)) return true;
  if (!input.recoveryCode) return false;
  const rows = await executor.execute(sql`
    SELECT id, code_hash FROM auth_mfa_recovery_codes
    WHERE user_id = ${input.userId} AND used_at IS NULL
    ORDER BY created_at ASC FOR UPDATE
  `);
  const normalized = normalizeRecoveryCode(input.recoveryCode);
  for (const row of rows.rows as any[]) {
    if (await bcrypt.compare(normalized, String(row.code_hash))) {
      if (input.consumeRecoveryCode) {
        await executor.execute(sql`
          UPDATE auth_mfa_recovery_codes SET used_at = NOW()
          WHERE id = ${String(row.id)} AND user_id = ${input.userId} AND used_at IS NULL
        `);
      }
      return true;
    }
  }
  return false;
}

export async function createAuthMfaLoginChallenge(userId: string) {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = challengeHash(token);
  await db.transaction(async tx => {
    await tx.execute(sql`
      UPDATE auth_mfa_login_challenges SET used_at = COALESCE(used_at, NOW())
      WHERE user_id = ${userId} AND used_at IS NULL
    `);
    await tx.execute(sql`
      INSERT INTO auth_mfa_login_challenges (user_id, token_hash, expires_at)
      VALUES (${userId}, ${tokenHash}, NOW() + INTERVAL '5 minutes')
    `);
  });
  return token;
}

export async function consumeAuthMfaLoginChallenge(input: { challengeToken: string; code?: string; recoveryCode?: string }) {
  const tokenHash = challengeHash(input.challengeToken);
  return db.transaction(async tx => {
    const result = await tx.execute(sql`
      SELECT id, user_id, failed_attempts FROM auth_mfa_login_challenges
      WHERE token_hash = ${tokenHash} AND used_at IS NULL AND expires_at > NOW()
      FOR UPDATE
    `);
    const challenge = result.rows[0] as any;
    if (!challenge || Number(challenge.failed_attempts) >= MAX_CHALLENGE_FAILURES) {
      throw new AuthMfaError('The MFA login challenge is invalid or expired', 'MFA_CHALLENGE_INVALID', 401);
    }
    const verified = await verifyMfaCredential({
      userId: String(challenge.user_id),
      code: input.code,
      recoveryCode: input.recoveryCode,
      consumeRecoveryCode: true,
    }, tx);
    if (!verified) {
      const failures = Number(challenge.failed_attempts) + 1;
      await tx.execute(sql`
        UPDATE auth_mfa_login_challenges
        SET failed_attempts = ${failures}, used_at = CASE WHEN ${failures} >= ${MAX_CHALLENGE_FAILURES} THEN NOW() ELSE used_at END
        WHERE id = ${String(challenge.id)}
      `);
      return { verified: false as const, attemptsRemaining: Math.max(0, MAX_CHALLENGE_FAILURES - failures) };
    }
    await tx.execute(sql`UPDATE auth_mfa_login_challenges SET used_at = NOW() WHERE id = ${String(challenge.id)}`);
    return { verified: true as const, userId: String(challenge.user_id) };
  });
}

export async function disableAuthMfa(input: { userId: string; code?: string; recoveryCode?: string }) {
  const verified = await db.transaction(tx => verifyMfaCredential({
    userId: input.userId,
    code: input.code,
    recoveryCode: input.recoveryCode,
    consumeRecoveryCode: true,
  }, tx));
  if (!verified) throw new AuthMfaError('The authenticator or recovery code is invalid', 'MFA_CODE_INVALID', 401);
  await db.transaction(async tx => {
    await tx.execute(sql`DELETE FROM auth_mfa_login_challenges WHERE user_id = ${input.userId}`);
    await tx.execute(sql`DELETE FROM auth_mfa_recovery_codes WHERE user_id = ${input.userId}`);
    await tx.execute(sql`DELETE FROM auth_mfa_totp WHERE user_id = ${input.userId}`);
  });
  return { ok: true };
}

export async function regenerateAuthMfaRecoveryCodes(input: { userId: string; code?: string; recoveryCode?: string }) {
  const recoveryCodes = generateRecoveryCodes();
  const hashes = await Promise.all(recoveryCodes.map(code => bcrypt.hash(normalizeRecoveryCode(code), 12)));
  await db.transaction(async tx => {
    const verified = await verifyMfaCredential({ ...input, consumeRecoveryCode: true }, tx);
    if (!verified) throw new AuthMfaError('The authenticator or recovery code is invalid', 'MFA_CODE_INVALID', 401);
    await tx.execute(sql`DELETE FROM auth_mfa_recovery_codes WHERE user_id = ${input.userId}`);
    for (const hash of hashes) {
      await tx.execute(sql`INSERT INTO auth_mfa_recovery_codes (user_id, code_hash) VALUES (${input.userId}, ${hash})`);
    }
  });
  return { ok: true, recoveryCodes };
}
