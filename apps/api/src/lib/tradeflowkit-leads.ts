/**
 * TradeFlowKit manual lead intake contract.
 *
 * Tenant and actor identifiers are never accepted here; route handlers derive
 * both from OperatorOS request context. Conversion is exposed through its own
 * transactional/idempotent endpoint and cannot be forged through PATCH.
 */

export const TRADEFLOWKIT_LEAD_STATUSES = [
  'new',
  'contacted',
  'qualified',
  'follow_up',
  'converted',
  'lost',
] as const;

export type TradeFlowKitLeadStatus = (typeof TRADEFLOWKIT_LEAD_STATUSES)[number];

export const TRADEFLOWKIT_LEAD_URGENCIES = ['normal', 'urgent', 'emergency'] as const;
export type TradeFlowKitLeadUrgency = (typeof TRADEFLOWKIT_LEAD_URGENCIES)[number];

const STATUS_SET = new Set<string>(TRADEFLOWKIT_LEAD_STATUSES);
const URGENCY_SET = new Set<string>(TRADEFLOWKIT_LEAD_URGENCIES);
const CREATE_FIELDS = new Set([
  'name',
  'phone',
  'email',
  'serviceType',
  'description',
  'urgency',
  'estimatedValueCents',
  'nextFollowUpAt',
]);
const PATCH_FIELDS = new Set([...CREATE_FIELDS, 'status']);
const LIST_FIELDS = new Set(['status', 'search']);

export class TradeFlowKitLeadValidationError extends Error {
  readonly code = 'INVALID_LEAD_INPUT';

  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'TradeFlowKitLeadValidationError';
  }
}

export interface TradeFlowKitLeadCreateInput {
  name: string;
  phone: string | null;
  email: string | null;
  serviceType: string | null;
  description: string | null;
  urgency: TradeFlowKitLeadUrgency;
  estimatedValueCents: number | null;
  nextFollowUpAt: Date | null;
}

export type TradeFlowKitLeadPatchInput = Partial<
  TradeFlowKitLeadCreateInput & { status: TradeFlowKitLeadStatus }
>;

function bodyRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TradeFlowKitLeadValidationError('Request body must be an object');
  }
  return input as Record<string, unknown>;
}

function assertKnownFields(body: Record<string, unknown>, allowed: ReadonlySet<string>): void {
  for (const field of Object.keys(body)) {
    if (!allowed.has(field)) {
      throw new TradeFlowKitLeadValidationError(
        `${field} is not accepted by the TradeFlowKit lead contract`,
        field,
      );
    }
  }
}

function requiredText(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') {
    throw new TradeFlowKitLeadValidationError(`${field} is required`, field);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new TradeFlowKitLeadValidationError(`${field} is required`, field);
  }
  if (trimmed.length > max) {
    throw new TradeFlowKitLeadValidationError(`${field} must be ${max} characters or fewer`, field);
  }
  return trimmed;
}

function optionalText(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new TradeFlowKitLeadValidationError(`${field} must be text`, field);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) {
    throw new TradeFlowKitLeadValidationError(`${field} must be ${max} characters or fewer`, field);
  }
  return trimmed;
}

function optionalEmail(value: unknown): string | null {
  const email = optionalText(value, 'email', 254)?.toLowerCase() ?? null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new TradeFlowKitLeadValidationError('email must be a valid address', 'email');
  }
  return email;
}

function optionalPhone(value: unknown): string | null {
  const phone = optionalText(value, 'phone', 40);
  if (!phone) return null;
  const digitCount = phone.replace(/\D/g, '').length;
  if (digitCount < 7 || digitCount > 15 || !/^[0-9+().\-\s]+$/.test(phone)) {
    throw new TradeFlowKitLeadValidationError('phone must contain 7 to 15 digits', 'phone');
  }
  return phone;
}

function optionalMoneyCents(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000) {
    throw new TradeFlowKitLeadValidationError(
      'estimatedValueCents must be a whole number from 0 to 1000000000',
      'estimatedValueCents',
    );
  }
  return value;
}

function optionalDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' && !(value instanceof Date)) {
    throw new TradeFlowKitLeadValidationError('nextFollowUpAt must be an ISO date', 'nextFollowUpAt');
  }
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new TradeFlowKitLeadValidationError('nextFollowUpAt must be an ISO date', 'nextFollowUpAt');
  }
  return parsed;
}

function urgency(value: unknown): TradeFlowKitLeadUrgency {
  if (value === undefined || value === null || value === '') return 'normal';
  if (typeof value !== 'string' || !URGENCY_SET.has(value)) {
    throw new TradeFlowKitLeadValidationError(
      `urgency must be one of: ${TRADEFLOWKIT_LEAD_URGENCIES.join(', ')}`,
      'urgency',
    );
  }
  return value as TradeFlowKitLeadUrgency;
}

function status(value: unknown): TradeFlowKitLeadStatus {
  if (typeof value !== 'string' || !STATUS_SET.has(value)) {
    throw new TradeFlowKitLeadValidationError(
      `status must be one of: ${TRADEFLOWKIT_LEAD_STATUSES.join(', ')}`,
      'status',
    );
  }
  return value as TradeFlowKitLeadStatus;
}

export function parseTradeFlowKitLeadCreate(input: unknown): TradeFlowKitLeadCreateInput {
  const body = bodyRecord(input);
  assertKnownFields(body, CREATE_FIELDS);
  return {
    name: requiredText(body.name, 'name', 120),
    phone: optionalPhone(body.phone),
    email: optionalEmail(body.email),
    serviceType: optionalText(body.serviceType, 'serviceType', 160),
    description: optionalText(body.description, 'description', 4_000),
    urgency: urgency(body.urgency),
    estimatedValueCents: optionalMoneyCents(body.estimatedValueCents),
    nextFollowUpAt: optionalDate(body.nextFollowUpAt),
  };
}

export function parseTradeFlowKitLeadPatch(input: unknown): TradeFlowKitLeadPatchInput {
  const body = bodyRecord(input);
  assertKnownFields(body, PATCH_FIELDS);
  const patch: TradeFlowKitLeadPatchInput = {};

  if ('name' in body) patch.name = requiredText(body.name, 'name', 120);
  if ('phone' in body) patch.phone = optionalPhone(body.phone);
  if ('email' in body) patch.email = optionalEmail(body.email);
  if ('serviceType' in body) patch.serviceType = optionalText(body.serviceType, 'serviceType', 160);
  if ('description' in body) patch.description = optionalText(body.description, 'description', 4_000);
  if ('urgency' in body) patch.urgency = urgency(body.urgency);
  if ('estimatedValueCents' in body) patch.estimatedValueCents = optionalMoneyCents(body.estimatedValueCents);
  if ('nextFollowUpAt' in body) patch.nextFollowUpAt = optionalDate(body.nextFollowUpAt);
  if ('status' in body) {
    const nextStatus = status(body.status);
    if (nextStatus === 'converted') {
      throw new TradeFlowKitLeadValidationError('converted status requires the conversion endpoint', 'status');
    }
    patch.status = nextStatus;
  }

  if (Object.keys(patch).length === 0) {
    throw new TradeFlowKitLeadValidationError('At least one editable lead field is required');
  }
  return patch;
}

export interface TradeFlowKitLeadListQuery {
  status?: TradeFlowKitLeadStatus;
  search?: string;
}

export function parseTradeFlowKitLeadListQuery(input: unknown): TradeFlowKitLeadListQuery {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const query = input as Record<string, unknown>;
  assertKnownFields(query, LIST_FIELDS);
  const parsed: TradeFlowKitLeadListQuery = {};

  if (query.status !== undefined && query.status !== '') parsed.status = status(query.status);
  if (query.search !== undefined && query.search !== '') {
    parsed.search = requiredText(query.search, 'search', 100);
  }
  return parsed;
}
