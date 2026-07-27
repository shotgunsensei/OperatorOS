import { createHash, timingSafeEqual } from 'node:crypto';

export const CALLCOMMAND_SOURCE_COMMIT = 'd49434e1d641d62cc141591c7208539a7afbf11e';
export const CALLCOMMAND_PROFILE_MODES = ['receptionist', 'intake', 'dispatcher'] as const;
export const CALLCOMMAND_CONSENT_PURPOSES = ['service_callback', 'appointment', 'support'] as const;
export const CALLCOMMAND_DISPOSITIONS = [
  'resolved',
  'follow_up_required',
  'transferred',
  'no_action',
  'unreachable',
] as const;

export class CallCommandValidationError extends Error {
  constructor(
    message: string,
    public readonly code = 'CALLCOMMAND_VALIDATION',
    public readonly field?: string,
    public readonly statusCode = 400,
  ) {
    super(message);
  }
}

function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new CallCommandValidationError('Request body must be an object');
  }
  return input as Record<string, unknown>;
}

function text(value: unknown, field: string, max: number, required = true): string | null {
  if (value == null && !required) return null;
  if (typeof value !== 'string') throw new CallCommandValidationError(`${field} must be text`, 'CALLCOMMAND_VALIDATION', field);
  const result = value.trim();
  if ((required && !result) || result.length > max) {
    throw new CallCommandValidationError(`${field} must contain ${required ? `1-${max}` : `at most ${max}`} characters`, 'CALLCOMMAND_VALIDATION', field);
  }
  return result || null;
}

export function normalizeE164(value: unknown, field = 'phone'): string {
  if (typeof value !== 'string') throw new CallCommandValidationError(`${field} must be an E.164 phone number`, 'CALLCOMMAND_PHONE_INVALID', field);
  const normalized = value.trim().replace(/[\s().-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new CallCommandValidationError(`${field} must be an E.164 phone number`, 'CALLCOMMAND_PHONE_INVALID', field);
  }
  return normalized;
}

export function phoneFingerprint(value: string): string {
  return createHash('sha256').update(`callcommand-phone-v1:${value}`).digest('hex');
}

export function maskPhone(value: string): string {
  return value.length < 6 ? '••••' : `${value.slice(0, 3)}••••${value.slice(-4)}`;
}

export function parseChannel(input: unknown) {
  const body = record(input);
  if (body.recordingEnabled === true) {
    throw new CallCommandValidationError(
      'Recording remains disabled until a jurisdiction-specific consent policy is approved',
      'CALLCOMMAND_RECORDING_REVIEW_REQUIRED',
      'recordingEnabled',
    );
  }
  const timezone = text(body.timezone, 'timezone', 80) as string;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    throw new CallCommandValidationError('timezone must be an IANA time zone', 'CALLCOMMAND_TIMEZONE_INVALID', 'timezone');
  }
  return {
    name: text(body.name, 'name', 120) as string,
    phone: normalizeE164(body.phone),
    timezone,
    consentScript: text(body.consentScript, 'consentScript', 1000) as string,
    recordingEnabled: false,
  };
}

export function parseProfile(input: unknown) {
  const body = record(input);
  const mode = text(body.mode, 'mode', 30) as (typeof CALLCOMMAND_PROFILE_MODES)[number];
  if (!CALLCOMMAND_PROFILE_MODES.includes(mode)) {
    throw new CallCommandValidationError('mode is not supported', 'CALLCOMMAND_PROFILE_MODE_INVALID', 'mode');
  }
  const fields = Array.isArray(body.intakeFields)
    ? body.intakeFields.map((value, index) => text(value, `intakeFields[${index}]`, 80) as string)
    : [];
  if (fields.length > 12 || new Set(fields).size !== fields.length) {
    throw new CallCommandValidationError('intakeFields must contain at most 12 unique labels', 'CALLCOMMAND_INTAKE_FIELDS_INVALID', 'intakeFields');
  }
  return {
    name: text(body.name, 'name', 120) as string,
    mode,
    greeting: text(body.greeting, 'greeting', 1000) as string,
    intakeFields: fields,
  };
}

export function parseTransferTarget(input: unknown) {
  const body = record(input);
  const kind = text(body.kind, 'kind', 20) as string;
  if (!['external', 'voicemail'].includes(kind)) {
    throw new CallCommandValidationError('Only external and voicemail targets are supported', 'CALLCOMMAND_TRANSFER_KIND_INVALID', 'kind');
  }
  return {
    label: text(body.label, 'label', 120) as string,
    kind,
    phone: kind === 'external' ? normalizeE164(body.phone) : null,
  };
}

export function parseConsent(input: unknown) {
  const body = record(input);
  const purpose = text(body.purpose, 'purpose', 40) as (typeof CALLCOMMAND_CONSENT_PURPOSES)[number];
  if (!CALLCOMMAND_CONSENT_PURPOSES.includes(purpose)) {
    throw new CallCommandValidationError('purpose is not supported', 'CALLCOMMAND_CONSENT_PURPOSE_INVALID', 'purpose');
  }
  return {
    phone: normalizeE164(body.phone),
    subjectName: text(body.subjectName, 'subjectName', 160, false),
    purpose,
    source: text(body.source, 'source', 160) as string,
    evidence: text(body.evidence, 'evidence', 1000) as string,
    expiresAt: body.expiresAt == null ? null : new Date(String(body.expiresAt)),
  };
}

export function parseSuppression(input: unknown) {
  const body = record(input);
  return {
    phone: normalizeE164(body.phone),
    reason: text(body.reason, 'reason', 500) as string,
  };
}

export function parseCall(input: unknown) {
  const body = record(input);
  return {
    phone: normalizeE164(body.phone),
    subjectName: text(body.subjectName, 'subjectName', 160, false),
    purpose: text(body.purpose, 'purpose', 40) as string,
    profileId: text(body.profileId, 'profileId', 36) as string,
    channelId: text(body.channelId, 'channelId', 36) as string,
    idempotencyKey: text(body.idempotencyKey, 'idempotencyKey', 160) as string,
  };
}

export function parseDisposition(input: unknown) {
  const body = record(input);
  const disposition = text(body.disposition, 'disposition', 40) as (typeof CALLCOMMAND_DISPOSITIONS)[number];
  if (!CALLCOMMAND_DISPOSITIONS.includes(disposition)) {
    throw new CallCommandValidationError(
      'disposition is not supported',
      'CALLCOMMAND_DISPOSITION_INVALID',
      'disposition',
    );
  }
  return {
    disposition,
    note: text(body.note, 'note', 500, false),
  };
}

export function parseTwilioCallSid(value: unknown): string {
  if (typeof value !== 'string' || !/^CA[A-Za-z0-9]{20,62}$/.test(value)) {
    throw new CallCommandValidationError(
      'Twilio call identifier is invalid',
      'CALLCOMMAND_PROVIDER_IDENTIFIER_INVALID',
    );
  }
  return value;
}

export function safeProviderError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';
  return /^[A-Za-z0-9_.:-]{1,80}$/.test(code)
    ? code
    : 'PROVIDER_REQUEST_FAILED';
}

export function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
