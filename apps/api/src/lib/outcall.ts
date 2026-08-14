import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { normalizeE164, maskPhone } from './callcommand.js';

export class OutCallValidationError extends Error {
  constructor(
    message: string,
    public readonly code = 'OUTCALL_VALIDATION',
    public readonly field?: string,
    public readonly statusCode = 400,
  ) {
    super(message);
  }
}

function body(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new OutCallValidationError('Request body must be an object');
  }
  const value = input as Record<string, unknown>;
  if ('tenantId' in value || 'userId' in value || 'destination' in value) {
    throw new OutCallValidationError('Server-owned identity or destination fields are not accepted', 'OUTCALL_SERVER_FIELD', 'tenantId');
  }
  return value;
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new OutCallValidationError(`${field} must contain 1-${max} characters`, 'OUTCALL_VALIDATION', field);
  }
  return value.trim();
}

function secret(name: string): Buffer {
  const configured = process.env[name];
  if (configured) {
    const decoded = /^[A-Za-z0-9_-]{43,44}$/.test(configured)
      ? Buffer.from(configured, 'base64url')
      : Buffer.from(configured, 'utf8');
    if (decoded.length >= 32) return createHmac('sha256', decoded).update(`outcall:${name}:v1`).digest();
  }
  if (process.env.APP_ENV === 'test' && process.env.NODE_ENV === 'test') {
    return createHmac('sha256', 'operatoros-outcall-isolated-test-key').update(name).digest();
  }
  throw new OutCallValidationError(
    'OutCall privacy protection is not configured',
    'OUTCALL_PROTECTION_NOT_CONFIGURED',
    undefined,
    503,
  );
}

export function protect(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secret('OUTCALL_FIELD_ENCRYPTION_KEY'), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function unprotect(value: string): string {
  const [version, iv, tag, encrypted] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !encrypted) throw new Error('OUTCALL_CIPHERTEXT_INVALID');
  const decipher = createDecipheriv('aes-256-gcm', secret('OUTCALL_FIELD_ENCRYPTION_KEY'), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
}

export function fingerprint(value: string): string {
  return createHmac('sha256', secret('OUTCALL_LOOKUP_HMAC_KEY')).update(value).digest('hex');
}

export function normalizeTrigger(value: unknown): string {
  return text(value, 'phrase', 120).normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export function parsePhoneVerification(input: unknown) {
  const value = body(input);
  const phone = normalizeE164(value.phone, 'phone');
  const verificationCode = text(value.verificationCode, 'verificationCode', 12);
  return { phone, verificationCode, masked: maskPhone(phone) };
}
export function parsePhoneVerificationStart(input: unknown) {
  const value = body(input);
  const phone = normalizeE164(value.phone, 'phone');
  return { phone, masked: maskPhone(phone) };
}

const IMPERSONATION = /\b(911|police|sheriff|fbi|government|hospital|doctor|nurse|school|emergency services?)\b/i;

export function parseProfile(input: unknown) {
  const value = body(input);
  const message = text(value.message, 'message', 800);
  if (IMPERSONATION.test(message)) {
    throw new OutCallValidationError(
      'Rescue messages may not impersonate emergency, government, healthcare, or school services',
      'OUTCALL_MESSAGE_POLICY',
      'message',
    );
  }
  return {
    name: text(value.name, 'name', 120),
    message,
    voice: value.voice == null ? 'alice' : text(value.voice, 'voice', 40),
    language: value.language == null ? 'en-US' : text(value.language, 'language', 16),
  };
}

export function parseTrigger(input: unknown) {
  const value = body(input);
  const normalized = normalizeTrigger(value.phrase);
  const profileId = text(value.profileId, 'profileId', 36);
  const delaySeconds = value.delaySeconds == null ? 0 : Number(value.delaySeconds);
  if (!Number.isInteger(delaySeconds) || delaySeconds < 0 || delaySeconds > 86_400) {
    throw new OutCallValidationError('delaySeconds must be an integer from 0 to 86400', 'OUTCALL_DELAY_INVALID', 'delaySeconds');
  }
  return {
    normalized,
    profileId,
    digest: fingerprint(`trigger:${normalized}`),
    ciphertext: protect(normalized),
    neutralReply: value.neutralReply == null ? 'Request received.' : text(value.neutralReply, 'neutralReply', 80),
    delaySeconds,
  };
}

export function parseSchedule(input: unknown) {
  const value = body(input);
  const profileId = text(value.profileId, 'profileId', 36);
  const idempotencyKey = text(value.idempotencyKey, 'idempotencyKey', 120);
  const runAt = value.runAt == null ? new Date() : new Date(String(value.runAt));
  if (Number.isNaN(runAt.getTime()) || runAt.getTime() < Date.now() - 5_000 || runAt.getTime() > Date.now() + 31 * 86_400_000) {
    throw new OutCallValidationError('runAt must be between now and 31 days from now', 'OUTCALL_RUN_AT_INVALID', 'runAt');
  }
  return { profileId, idempotencyKey, runAt };
}

export function parseOutCallReauthentication(input: unknown, deletion = false) {
  const value = body(input);
  const password = text(value.password, 'password', 256);
  const confirmation = deletion ? text(value.confirmation, 'confirmation', 40) : null;
  if (deletion && confirmation !== 'DELETE OUTCALL') {
    throw new OutCallValidationError(
      'Type DELETE OUTCALL to confirm removal of this module data',
      'OUTCALL_DELETION_CONFIRMATION_REQUIRED',
      'confirmation',
    );
  }
  return { password, confirmation };
}
