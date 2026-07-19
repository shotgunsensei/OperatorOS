import { createHash } from 'node:crypto';

export const TORQUESHED_VISIBILITIES = ['private', 'tenant', 'public_build'] as const;
export const TORQUESHED_BUILD_STATUSES = [
  'planning',
  'active',
  'paused',
  'completed',
  'canceled',
] as const;
export const TORQUESHED_TASK_STATUSES = [
  'open',
  'in_progress',
  'blocked',
  'completed',
  'canceled',
] as const;
export const TORQUESHED_REMINDER_STATUSES = ['open', 'snoozed', 'completed', 'dismissed'] as const;
export const TORQUESHED_DIAGNOSTIC_STATUSES = [
  'open',
  'testing',
  'repairing',
  'verified',
  'resolved',
  'archived',
] as const;
export const TORQUESHED_DIAGNOSTIC_ENTRY_KINDS = [
  'symptom',
  'condition',
  'inspection',
  'test',
  'measurement',
  'hypothesis',
  'confirmed_cause',
  'repair',
  'verification',
  'resolution',
] as const;

export class TorqueShedValidationError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly field?: string,
    readonly statusCode = 400,
  ) {
    super(message);
  }
}

export function torqueText(
  value: unknown,
  field: string,
  max: number,
  options: { required?: boolean; min?: number; singleLine?: boolean } = {},
): string | null {
  if (value === undefined || value === null || value === '') {
    if (options.required)
      throw new TorqueShedValidationError(
        `${field} is required`,
        'TORQUESHED_FIELD_REQUIRED',
        field,
      );
    return null;
  }
  if (typeof value !== 'string')
    throw new TorqueShedValidationError(`${field} must be text`, 'TORQUESHED_TEXT_INVALID', field);
  const normalized = value.trim();
  if (
    (options.singleLine && /[\r\n]/.test(normalized)) ||
    normalized.length < (options.min ?? 0) ||
    normalized.length > max
  ) {
    throw new TorqueShedValidationError(
      `${field} is outside the allowed length`,
      'TORQUESHED_TEXT_INVALID',
      field,
    );
  }
  return normalized;
}

export function torqueId(value: unknown, field: string, required = false): string | null {
  const parsed = torqueText(value, field, 36, {
    required,
    min: required ? 1 : 0,
    singleLine: true,
  });
  if (
    parsed &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed)
  ) {
    throw new TorqueShedValidationError(`${field} must be a UUID`, 'TORQUESHED_ID_INVALID', field);
  }
  return parsed;
}

export function torqueInteger(
  value: unknown,
  field: string,
  min: number,
  max: number,
  required = false,
): number | null {
  if (value === undefined || value === null || value === '') {
    if (required)
      throw new TorqueShedValidationError(
        `${field} is required`,
        'TORQUESHED_FIELD_REQUIRED',
        field,
      );
    return null;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new TorqueShedValidationError(
      `${field} must be an integer from ${min} to ${max}`,
      'TORQUESHED_INTEGER_INVALID',
      field,
    );
  }
  return parsed;
}

export function torqueNumber(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new TorqueShedValidationError(
      `${field} must be a number from ${min} to ${max}`,
      'TORQUESHED_NUMBER_INVALID',
      field,
    );
  }
  return parsed;
}

export function torqueEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
  fallback?: T,
): T {
  if ((value === undefined || value === null || value === '') && fallback !== undefined)
    return fallback;
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new TorqueShedValidationError(`${field} is invalid`, 'TORQUESHED_ENUM_INVALID', field);
  }
  return value as T;
}

export function torqueDate(value: unknown, field: string): Date | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string')
    throw new TorqueShedValidationError(
      `${field} must be an ISO date`,
      'TORQUESHED_DATE_INVALID',
      field,
    );
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new TorqueShedValidationError(
      `${field} must be an ISO date`,
      'TORQUESHED_DATE_INVALID',
      field,
    );
  return date;
}

export function normalizeVin(
  value: unknown,
): { hash: string; last6: string; masked: string } | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string')
    throw new TorqueShedValidationError('vin must be text', 'TORQUESHED_VIN_INVALID', 'vin');
  const vin = value.replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
    throw new TorqueShedValidationError(
      'vin must contain 17 valid VIN characters',
      'TORQUESHED_VIN_INVALID',
      'vin',
    );
  }
  const last6 = vin.slice(-6);
  return {
    hash: createHash('sha256').update(vin, 'utf8').digest('hex'),
    last6,
    masked: `${'*'.repeat(11)}${last6}`,
  };
}

export function maskVin(last6: unknown): string | null {
  return typeof last6 === 'string' && /^[A-HJ-NPR-Z0-9]{6}$/.test(last6)
    ? `${'*'.repeat(11)}${last6}`
    : null;
}

const DIAGNOSTIC_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  open: new Set(['testing', 'archived']),
  testing: new Set(['repairing', 'verified', 'resolved', 'archived']),
  repairing: new Set(['testing', 'verified', 'resolved', 'archived']),
  verified: new Set(['resolved', 'testing', 'archived']),
  resolved: new Set(['open', 'archived']),
  archived: new Set(['open']),
};

export function assertDiagnosticTransition(from: string, to: string): void {
  if (from === to) return;
  if (!DIAGNOSTIC_TRANSITIONS[from]?.has(to)) {
    throw new TorqueShedValidationError(
      `Diagnostic status cannot move from ${from} to ${to}`,
      'TORQUESHED_TRANSITION_INVALID',
      'status',
      409,
    );
  }
}

export function torquePage(query: Record<string, unknown>) {
  return {
    limit: torqueInteger(query.limit ?? 25, 'limit', 1, 100, true)!,
    offset: torqueInteger(query.offset ?? 0, 'offset', 0, 1_000_000, true)!,
    search: torqueText(query.search, 'search', 120, { singleLine: true }) ?? '',
  };
}
