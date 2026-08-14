import { z } from 'zod';

export const PULSEDESK_TICKET_STATUSES = [
  'new', 'triage', 'assigned', 'waiting_department', 'waiting_vendor',
  'in_progress', 'escalated', 'resolved', 'closed',
] as const;
export const PULSEDESK_TICKET_PRIORITIES = ['critical', 'high', 'normal', 'low'] as const;
export const PULSEDESK_TICKET_CATEGORIES = [
  'it_infrastructure', 'medical_equipment', 'supplies_inventory',
  'facilities_building', 'housekeeping_environmental', 'safety_compliance',
  'vendor_external', 'administrative', 'hr_staff', 'other',
] as const;
export const PULSEDESK_TICKET_TYPES = [
  'service_request', 'incident', 'problem', 'maintenance', 'supply', 'facility',
] as const;

export type PulseDeskTicketStatus = (typeof PULSEDESK_TICKET_STATUSES)[number];
export type PulseDeskTicketPriority = (typeof PULSEDESK_TICKET_PRIORITIES)[number];

export class PulseDeskServiceDeskError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly field?: string,
    public readonly statusCode = 422,
  ) {
    super(message);
  }
}

const PROHIBITED_KEYS = new Set([
  'patient', 'patientid', 'patientname', 'patientfirstname', 'patientlastname',
  'mrn', 'medicalrecord', 'medicalrecordnumber', 'dateofbirth', 'dob', 'ssn',
  'diagnosis', 'diagnoses', 'treatment', 'treatmentplan', 'medication',
  'medications', 'prescription', 'insurance', 'insuranceid', 'memberid',
  'policynumber', 'clinicalnote', 'clinicalnotes', 'chiefcomplaint',
]);
const PROHIBITED_TEXT = [
  /\b(?:MRN|medical record number|date of birth|DOB|SSN|insurance member(?: id)?|diagnosis|treatment plan)\s*[:#]/i,
  /\b\d{3}-\d{2}-\d{4}\b/,
];
const HTML_TAG = /<\/?[a-z][^>]*>/i;
const SECRET_KEY = /(?:password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key|connection[_-]?string)/i;

function normalizedKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

/**
 * Guardrail for prohibited patient/clinical fields. It deliberately returns
 * only a stable field path/code and never includes the rejected value.
 */
export function assertNoProhibitedPhi(value: unknown, field = 'body'): void {
  if (typeof value === 'string') {
    if (PROHIBITED_TEXT.some(pattern => pattern.test(value))) {
      throw new PulseDeskServiceDeskError(
        'PulseDesk accepts operational information only; remove patient or clinical data',
        'PULSEDESK_PHI_PROHIBITED',
        field,
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoProhibitedPhi(entry, `${field}.${index}`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const normalized = normalizedKey(key);
    if (PROHIBITED_KEYS.has(normalized)) {
      throw new PulseDeskServiceDeskError(
        'PulseDesk does not accept patient or clinical fields',
        'PULSEDESK_PHI_FIELD_PROHIBITED',
        `${field}.${key}`,
      );
    }
    if (SECRET_KEY.test(key)) {
      throw new PulseDeskServiceDeskError(
        'PulseDesk does not accept credential or secret fields',
        'PULSEDESK_SECRET_FIELD_PROHIBITED',
        `${field}.${key}`,
      );
    }
    assertNoProhibitedPhi(entry, `${field}.${key}`);
  }
}

export function pulseDeskObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PulseDeskServiceDeskError('Request body must be an object', 'PULSEDESK_BODY_INVALID', 'body');
  }
  assertNoProhibitedPhi(value);
  return value as Record<string, unknown>;
}

export function pulseDeskText(
  value: unknown,
  field: string,
  max: number,
  options: { required?: boolean; nullable?: boolean; singleLine?: boolean; min?: number } = {},
): string | null {
  if (value === undefined || value === null || value === '') {
    if (options.required) throw new PulseDeskServiceDeskError(`${field} is required`, 'PULSEDESK_FIELD_REQUIRED', field);
    return options.nullable ? null : '';
  }
  if (typeof value !== 'string') throw new PulseDeskServiceDeskError(`${field} must be text`, 'PULSEDESK_FIELD_INVALID', field);
  assertNoProhibitedPhi(value, field);
  if (HTML_TAG.test(value)) throw new PulseDeskServiceDeskError('Rich HTML is not accepted; use plain text', 'PULSEDESK_HTML_PROHIBITED', field);
  if (/[^\S\r\n]*[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    throw new PulseDeskServiceDeskError(`${field} contains unsupported control characters`, 'PULSEDESK_TEXT_INVALID', field);
  }
  let normalized = value.replace(/\r\n?/g, '\n').trim();
  normalized = options.singleLine
    ? normalized.replace(/\s+/g, ' ')
    : normalized.split('\n').map(line => line.trimEnd()).join('\n').replace(/\n{4,}/g, '\n\n\n');
  if (options.required && normalized.length < (options.min ?? 1)) {
    throw new PulseDeskServiceDeskError(`${field} is too short`, 'PULSEDESK_FIELD_TOO_SHORT', field);
  }
  if (normalized.length > max) throw new PulseDeskServiceDeskError(`${field} is too long`, 'PULSEDESK_FIELD_TOO_LONG', field);
  return normalized || (options.nullable ? null : '');
}

export function pulseDeskId(value: unknown, field: string, nullable = true): string | null {
  const text = pulseDeskText(value, field, 36, { nullable, singleLine: true });
  if (!text) return null;
  if (!z.string().uuid().safeParse(text).success) {
    throw new PulseDeskServiceDeskError(`${field} must be a UUID`, 'PULSEDESK_ID_INVALID', field);
  }
  return text;
}

export function pulseDeskBoolean(value: unknown, field: string, fallback = false): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new PulseDeskServiceDeskError(`${field} must be true or false`, 'PULSEDESK_FIELD_INVALID', field);
  return value;
}

export function pulseDeskInteger(value: unknown, field: string, min: number, max: number): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw new PulseDeskServiceDeskError(`${field} is outside its allowed range`, 'PULSEDESK_FIELD_INVALID', field);
  }
  return value as number;
}

export function pulseDeskEnum<T extends string>(value: unknown, field: string, values: readonly T[], fallback?: T): T {
  if ((value === undefined || value === null || value === '') && fallback) return fallback;
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw new PulseDeskServiceDeskError(`${field} is invalid`, 'PULSEDESK_FIELD_INVALID', field);
  }
  return value as T;
}

export function requireNoPhiAcknowledgement(body: Record<string, unknown>): void {
  if (body.phiAcknowledged !== true) {
    throw new PulseDeskServiceDeskError(
      'Confirm that the content contains no patient data or unnecessary PHI',
      'PULSEDESK_PHI_ACKNOWLEDGEMENT_REQUIRED',
      'phiAcknowledged',
    );
  }
}

export function pulseDeskIdempotencyKey(value: unknown): string {
  if (Array.isArray(value)) value = value[0];
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(value)) {
    throw new PulseDeskServiceDeskError(
      'A valid Idempotency-Key header is required',
      'PULSEDESK_IDEMPOTENCY_KEY_REQUIRED',
      'Idempotency-Key',
      400,
    );
  }
  return value;
}

const TRANSITIONS: Record<PulseDeskTicketStatus, readonly PulseDeskTicketStatus[]> = {
  new: ['triage', 'assigned', 'in_progress', 'resolved'],
  triage: ['assigned', 'waiting_department', 'waiting_vendor', 'in_progress', 'escalated', 'resolved'],
  assigned: ['triage', 'waiting_department', 'waiting_vendor', 'in_progress', 'escalated', 'resolved'],
  waiting_department: ['triage', 'assigned', 'in_progress', 'escalated', 'resolved'],
  waiting_vendor: ['triage', 'assigned', 'in_progress', 'escalated', 'resolved'],
  in_progress: ['assigned', 'waiting_department', 'waiting_vendor', 'escalated', 'resolved'],
  escalated: ['assigned', 'waiting_department', 'waiting_vendor', 'in_progress', 'resolved'],
  resolved: ['closed', 'triage'],
  closed: ['triage'],
};

export function assertPulseDeskTicketTransition(from: string, to: string): asserts to is PulseDeskTicketStatus {
  if (!PULSEDESK_TICKET_STATUSES.includes(from as PulseDeskTicketStatus)
    || !PULSEDESK_TICKET_STATUSES.includes(to as PulseDeskTicketStatus)
    || !TRANSITIONS[from as PulseDeskTicketStatus].includes(to as PulseDeskTicketStatus)) {
    throw new PulseDeskServiceDeskError(
      'Ticket status transition is not allowed',
      'PULSEDESK_STATUS_TRANSITION_INVALID',
      'status',
      409,
    );
  }
}

export function pulseDeskHumanId(number: number): string {
  return `PD-${String(number).padStart(6, '0')}`;
}

export function calculatePulseDeskSlaTargets(createdAt: Date, responseMinutes: number, resolutionMinutes: number) {
  return {
    responseDueAt: new Date(createdAt.getTime() + responseMinutes * 60_000),
    resolutionDueAt: new Date(createdAt.getTime() + resolutionMinutes * 60_000),
  };
}

export function pulseDeskSlaProjection(input: {
  now?: Date;
  responseDueAt?: Date | null;
  resolutionDueAt?: Date | null;
  firstRespondedAt?: Date | null;
  resolvedAt?: Date | null;
  status: string;
  createdAt: Date;
  atRiskPercent?: number;
}) {
  const now = input.now ?? new Date();
  const terminal = input.status === 'resolved' || input.status === 'closed';
  const responseOverdue = Boolean(!input.firstRespondedAt && input.responseDueAt && input.responseDueAt <= now);
  const resolutionOverdue = Boolean(!terminal && input.resolutionDueAt && input.resolutionDueAt <= now);
  const riskPercent = input.atRiskPercent ?? 80;
  const responseRiskAt = input.responseDueAt
    ? new Date(input.createdAt.getTime() + (input.responseDueAt.getTime() - input.createdAt.getTime()) * riskPercent / 100)
    : null;
  const resolutionRiskAt = input.resolutionDueAt
    ? new Date(input.createdAt.getTime() + (input.resolutionDueAt.getTime() - input.createdAt.getTime()) * riskPercent / 100)
    : null;
  const atRisk = !responseOverdue && !resolutionOverdue && (
    Boolean(!input.firstRespondedAt && responseRiskAt && responseRiskAt <= now)
    || Boolean(!terminal && resolutionRiskAt && resolutionRiskAt <= now)
  );
  return {
    state: responseOverdue || resolutionOverdue ? 'overdue' : atRisk ? 'at_risk' : terminal ? 'met' : 'due',
    responseOverdue,
    resolutionOverdue,
    responseDueAt: input.responseDueAt ?? null,
    resolutionDueAt: input.resolutionDueAt ?? null,
  } as const;
}

export function pulseDeskSafeSlug(value: unknown, field = 'slug'): string {
  const text = pulseDeskText(value, field, 120, { required: true, singleLine: true, min: 2 })!;
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!/^[a-z0-9][a-z0-9-]{1,119}$/.test(slug)) {
    throw new PulseDeskServiceDeskError(`${field} is invalid`, 'PULSEDESK_FIELD_INVALID', field);
  }
  return slug;
}

export const PULSEDESK_SAFE_BULK_ACTIONS = ['assign', 'status', 'archive'] as const;
