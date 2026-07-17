/**
 * PulseDesk department-escalation request domain contract.
 *
 * This module deliberately contains no tenant, actor, status, audit, auth, or
 * billing authority. Route handlers must derive those values from the active
 * OperatorOS request context. The only free-text fields accepted by this first
 * slice are a short operational summary and a short operational location.
 */

export const PULSEDESK_REQUEST_PRIORITIES = [
  'critical',
  'high',
  'normal',
  'low',
] as const;

export type PulseDeskRequestPriority = (typeof PULSEDESK_REQUEST_PRIORITIES)[number];

export const PULSEDESK_REQUEST_STATUSES = [
  'new',
  'triage',
  'assigned',
  'waiting_department',
  'waiting_vendor',
  'in_progress',
  'escalated',
  'resolved',
  'closed',
] as const;

export type PulseDeskRequestStatus = (typeof PULSEDESK_REQUEST_STATUSES)[number];

export const PULSEDESK_REQUEST_CATEGORIES = [
  'it_infrastructure',
  'medical_equipment',
  'supplies_inventory',
  'facilities_building',
  'housekeeping_environmental',
  'safety_compliance',
  'vendor_external',
  'administrative',
  'hr_staff',
  'other',
] as const;

export type PulseDeskRequestCategory = (typeof PULSEDESK_REQUEST_CATEGORIES)[number];

/** Structured reasons replace a free-form escalation note in the PHI-safe MVP. */
export const PULSEDESK_ESCALATION_REASON_CODES = [
  'patient_care_risk',
  'safety_risk',
  'department_nonresponse',
  'sla_breach',
  'resource_blocked',
  'other',
] as const;

export type PulseDeskEscalationReasonCode = (typeof PULSEDESK_ESCALATION_REASON_CODES)[number];

export const PULSEDESK_REQUEST_EVENT_TYPES = [
  'created',
  'updated',
  'department_changed',
  'assignee_changed',
  'priority_changed',
  'status_changed',
  'escalated',
] as const;

export type PulseDeskRequestEventType = (typeof PULSEDESK_REQUEST_EVENT_TYPES)[number];

export const PULSEDESK_SUMMARY_MIN_LENGTH = 5;
export const PULSEDESK_SUMMARY_MAX_LENGTH = 160;
export const PULSEDESK_LOCATION_MAX_LENGTH = 120;
export const PULSEDESK_DEPARTMENT_NAME_MIN_LENGTH = 2;
export const PULSEDESK_DEPARTMENT_NAME_MAX_LENGTH = 80;
export const PULSEDESK_SEARCH_MAX_LENGTH = 100;
export const PULSEDESK_LIST_DEFAULT_LIMIT = 50;
export const PULSEDESK_LIST_MAX_LIMIT = 100;

/** Exact SLA policy imported from PulseDesk's ticketSla service. */
export const PULSEDESK_SLA_BASE_HOURS: Readonly<Record<PulseDeskRequestPriority, number>> = {
  critical: 4,
  high: 24,
  normal: 72,
  low: 168,
};

export const PULSEDESK_PHI_WARNING =
  'Operational information only. Do not enter patient names, MRNs, dates of birth, diagnoses, or clinical notes.';

export const PULSEDESK_PHI_ACKNOWLEDGEMENT =
  'I confirm this request contains operational information only and no patient-identifying or clinical information.';

const PRIORITY_SET = new Set<string>(PULSEDESK_REQUEST_PRIORITIES);
const STATUS_SET = new Set<string>(PULSEDESK_REQUEST_STATUSES);
const CATEGORY_SET = new Set<string>(PULSEDESK_REQUEST_CATEGORIES);
const ESCALATION_REASON_SET = new Set<string>(PULSEDESK_ESCALATION_REASON_CODES);

export type PulseDeskValidationCode =
  | 'INVALID_PULSEDESK_REQUEST_INPUT'
  | 'PHI_ACKNOWLEDGEMENT_REQUIRED';

export class PulseDeskRequestValidationError extends Error {
  readonly statusCode = 400;

  constructor(
    message: string,
    readonly field?: string,
    readonly code: PulseDeskValidationCode = 'INVALID_PULSEDESK_REQUEST_INPUT',
  ) {
    super(message);
    this.name = 'PulseDeskRequestValidationError';
  }
}

export class PulseDeskStatusTransitionError extends Error {
  readonly statusCode = 409;
  readonly code = 'INVALID_STATUS_TRANSITION';

  constructor(
    readonly fromStatus: PulseDeskRequestStatus,
    readonly toStatus: PulseDeskRequestStatus,
    readonly allowedStatuses: readonly PulseDeskRequestStatus[],
  ) {
    super(`PulseDesk request cannot transition from ${fromStatus} to ${toStatus}`);
    this.name = 'PulseDeskStatusTransitionError';
  }
}

export class PulseDeskVersionConflictError extends Error {
  readonly statusCode = 409;
  readonly code = 'REQUEST_VERSION_CONFLICT';

  constructor(
    readonly expectedVersion: number,
    readonly actualVersion: number,
  ) {
    super(`PulseDesk request version ${expectedVersion} is stale; current version is ${actualVersion}`);
    this.name = 'PulseDeskVersionConflictError';
  }
}

export const PULSEDESK_STATUS_TRANSITIONS: Readonly<
  Record<PulseDeskRequestStatus, readonly PulseDeskRequestStatus[]>
> = {
  new: ['triage', 'assigned', 'escalated'],
  triage: ['assigned', 'waiting_department', 'waiting_vendor', 'in_progress', 'escalated', 'resolved'],
  assigned: ['in_progress', 'waiting_department', 'waiting_vendor', 'escalated', 'resolved'],
  waiting_department: ['assigned', 'in_progress', 'escalated', 'resolved'],
  waiting_vendor: ['assigned', 'in_progress', 'escalated', 'resolved'],
  in_progress: ['waiting_department', 'waiting_vendor', 'escalated', 'resolved'],
  escalated: ['assigned', 'in_progress', 'waiting_department', 'waiting_vendor', 'resolved'],
  resolved: ['closed', 'triage'],
  closed: [],
};

export interface PulseDeskRequestCreateInput {
  summary: string;
  category: PulseDeskRequestCategory;
  priority: PulseDeskRequestPriority;
  departmentId: string | null;
  locationLabel: string | null;
  isPatientImpacting: boolean;
}

export type PulseDeskRequestEditableFields = PulseDeskRequestCreateInput & {
  assignedToUserId: string | null;
};

export interface PulseDeskRequestPatchInput {
  expectedVersion: number;
  changes: Partial<PulseDeskRequestEditableFields>;
}

export interface PulseDeskRequestTransitionInput {
  expectedVersion: number;
  toStatus: PulseDeskRequestStatus;
  reasonCode: PulseDeskEscalationReasonCode | null;
}

export interface PulseDeskRequestListQuery {
  status?: PulseDeskRequestStatus;
  priority?: PulseDeskRequestPriority;
  category?: PulseDeskRequestCategory;
  departmentId?: string;
  assignedToUserId?: string;
  isPatientImpacting?: boolean;
  search?: string;
  limit: number;
}

export interface PulseDeskDepartmentCreateInput {
  name: string;
}

export interface PulseDeskDepartmentPatchInput {
  name?: string;
  active?: boolean;
}

export interface PulseDeskDepartmentListQuery {
  includeInactive: boolean;
}

const CREATE_FIELDS = new Set([
  'summary',
  'category',
  'priority',
  'departmentId',
  'locationLabel',
  'isPatientImpacting',
  'phiAcknowledged',
]);

const PATCH_FIELDS = new Set([
  'expectedVersion',
  'summary',
  'category',
  'priority',
  'departmentId',
  'assignedToUserId',
  'locationLabel',
  'isPatientImpacting',
  'phiAcknowledged',
]);

const TRANSITION_FIELDS = new Set(['expectedVersion', 'toStatus', 'reasonCode']);
const LIST_FIELDS = new Set([
  'status',
  'priority',
  'category',
  'departmentId',
  'assignedToUserId',
  'isPatientImpacting',
  'search',
  'limit',
]);
const DEPARTMENT_CREATE_FIELDS = new Set(['name']);
const DEPARTMENT_PATCH_FIELDS = new Set(['name', 'active']);
const DEPARTMENT_LIST_FIELDS = new Set(['includeInactive']);

function bodyRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new PulseDeskRequestValidationError('Request body must be an object');
  }
  return input as Record<string, unknown>;
}

function assertKnownFields(body: Record<string, unknown>, allowed: ReadonlySet<string>): void {
  for (const field of Object.keys(body)) {
    if (!allowed.has(field)) {
      throw new PulseDeskRequestValidationError(
        `${field} is not accepted by the PulseDesk request contract`,
        field,
      );
    }
  }
}

function normalizedSingleLineText(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== 'string') {
    throw new PulseDeskRequestValidationError(`${field} is required`, field);
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw new PulseDeskRequestValidationError(`${field} must be a single line`, field);
  }
  const normalized = value.trim().replace(/ {2,}/g, ' ');
  if (normalized.length < min) {
    throw new PulseDeskRequestValidationError(
      `${field} must be at least ${min} characters`,
      field,
    );
  }
  if (normalized.length > max) {
    throw new PulseDeskRequestValidationError(
      `${field} must be ${max} characters or fewer`,
      field,
    );
  }
  return normalized;
}

function optionalSingleLineText(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new PulseDeskRequestValidationError(`${field} must be text`, field);
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw new PulseDeskRequestValidationError(`${field} must be a single line`, field);
  }
  const normalized = value.trim().replace(/ {2,}/g, ' ');
  if (!normalized) return null;
  if (normalized.length > max) {
    throw new PulseDeskRequestValidationError(
      `${field} must be ${max} characters or fewer`,
      field,
    );
  }
  return normalized;
}

function optionalIdentifier(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new PulseDeskRequestValidationError(`${field} must be an identifier`, field);
  }
  const normalized = value.trim();
  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(normalized)) {
    throw new PulseDeskRequestValidationError(
      `${field} must be a canonical UUID`,
      field,
    );
  }
  return normalized;
}

function requiredEnum<T extends string>(
  value: unknown,
  field: string,
  values: readonly T[],
  allowed: ReadonlySet<string>,
): T {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!allowed.has(normalized)) {
    throw new PulseDeskRequestValidationError(
      `${field} must be one of: ${values.join(', ')}`,
      field,
    );
  }
  return normalized as T;
}

function category(value: unknown): PulseDeskRequestCategory {
  return requiredEnum(value, 'category', PULSEDESK_REQUEST_CATEGORIES, CATEGORY_SET);
}

function priority(value: unknown): PulseDeskRequestPriority {
  return requiredEnum(value, 'priority', PULSEDESK_REQUEST_PRIORITIES, PRIORITY_SET);
}

function status(value: unknown, field = 'status'): PulseDeskRequestStatus {
  return requiredEnum(value, field, PULSEDESK_REQUEST_STATUSES, STATUS_SET);
}

function escalationReason(value: unknown): PulseDeskEscalationReasonCode {
  return requiredEnum(
    value,
    'reasonCode',
    PULSEDESK_ESCALATION_REASON_CODES,
    ESCALATION_REASON_SET,
  );
}

function optionalBoolean(value: unknown, field: string, defaultValue: boolean): boolean {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value !== 'boolean') {
    throw new PulseDeskRequestValidationError(`${field} must be true or false`, field);
  }
  return value;
}

function queryBoolean(value: unknown, field: string): boolean {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw new PulseDeskRequestValidationError(`${field} must be true or false`, field);
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new PulseDeskRequestValidationError(`${field} must be true or false`, field);
  }
  return value;
}

function requirePhiAcknowledgement(body: Record<string, unknown>): void {
  if (body.phiAcknowledged !== true) {
    throw new PulseDeskRequestValidationError(
      `${PULSEDESK_PHI_WARNING} Confirm phiAcknowledged before submitting operational text.`,
      'phiAcknowledged',
      'PHI_ACKNOWLEDGEMENT_REQUIRED',
    );
  }
}

export function parsePulseDeskExpectedVersion(value: unknown): number {
  let parsed: number;
  if (typeof value === 'number') {
    parsed = value;
  } else if (typeof value === 'string') {
    const match = value.trim().match(/^(?:W\/)?"?(\d+)"?$/);
    parsed = match ? Number(match[1]) : Number.NaN;
  } else {
    parsed = Number.NaN;
  }

  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 2_147_483_647) {
    throw new PulseDeskRequestValidationError(
      'expectedVersion must be a positive whole number',
      'expectedVersion',
    );
  }
  return parsed;
}

export function assertPulseDeskVersionMatch(expectedVersion: number, actualVersion: number): void {
  const expected = parsePulseDeskExpectedVersion(expectedVersion);
  const actual = parsePulseDeskExpectedVersion(actualVersion);
  if (expected !== actual) {
    throw new PulseDeskVersionConflictError(expected, actual);
  }
}

export function getPulseDeskSlaTargetHours(
  priorityValue: PulseDeskRequestPriority,
  isPatientImpacting: boolean,
): number {
  const baseHours = PULSEDESK_SLA_BASE_HOURS[priorityValue];
  if (!baseHours) {
    throw new PulseDeskRequestValidationError(
      `priority must be one of: ${PULSEDESK_REQUEST_PRIORITIES.join(', ')}`,
      'priority',
    );
  }
  if (typeof isPatientImpacting !== 'boolean') {
    throw new PulseDeskRequestValidationError(
      'isPatientImpacting must be true or false',
      'isPatientImpacting',
    );
  }
  if (!isPatientImpacting) return baseHours;
  return Math.min(baseHours, priorityValue === 'low' ? 48 : 12);
}

export function calculatePulseDeskDueAt(
  priorityValue: PulseDeskRequestPriority,
  isPatientImpacting: boolean,
  clock: Date,
): Date {
  if (!(clock instanceof Date) || !Number.isFinite(clock.getTime())) {
    throw new PulseDeskRequestValidationError('clock must be a valid Date', 'clock');
  }
  const targetHours = getPulseDeskSlaTargetHours(priorityValue, isPatientImpacting);
  return new Date(clock.getTime() + targetHours * 60 * 60 * 1_000);
}

export function parsePulseDeskRequestCreate(input: unknown): PulseDeskRequestCreateInput {
  const body = bodyRecord(input);
  assertKnownFields(body, CREATE_FIELDS);
  requirePhiAcknowledgement(body);

  return {
    summary: normalizedSingleLineText(
      body.summary,
      'summary',
      PULSEDESK_SUMMARY_MIN_LENGTH,
      PULSEDESK_SUMMARY_MAX_LENGTH,
    ),
    category: category(body.category),
    priority: priority(body.priority),
    departmentId: optionalIdentifier(body.departmentId, 'departmentId'),
    locationLabel: optionalSingleLineText(
      body.locationLabel,
      'locationLabel',
      PULSEDESK_LOCATION_MAX_LENGTH,
    ),
    isPatientImpacting: optionalBoolean(body.isPatientImpacting, 'isPatientImpacting', false),
  };
}

export function parsePulseDeskRequestPatch(input: unknown): PulseDeskRequestPatchInput {
  const body = bodyRecord(input);
  assertKnownFields(body, PATCH_FIELDS);
  const changes: Partial<PulseDeskRequestEditableFields> = {};

  const changesOperationalText = 'summary' in body || 'locationLabel' in body;
  if (changesOperationalText) requirePhiAcknowledgement(body);

  if ('summary' in body) {
    changes.summary = normalizedSingleLineText(
      body.summary,
      'summary',
      PULSEDESK_SUMMARY_MIN_LENGTH,
      PULSEDESK_SUMMARY_MAX_LENGTH,
    );
  }
  if ('category' in body) changes.category = category(body.category);
  if ('priority' in body) changes.priority = priority(body.priority);
  if ('departmentId' in body) {
    changes.departmentId = optionalIdentifier(body.departmentId, 'departmentId');
  }
  if ('assignedToUserId' in body) {
    changes.assignedToUserId = optionalIdentifier(body.assignedToUserId, 'assignedToUserId');
  }
  if ('locationLabel' in body) {
    changes.locationLabel = optionalSingleLineText(
      body.locationLabel,
      'locationLabel',
      PULSEDESK_LOCATION_MAX_LENGTH,
    );
  }
  if ('isPatientImpacting' in body) {
    changes.isPatientImpacting = optionalBoolean(
      body.isPatientImpacting,
      'isPatientImpacting',
      false,
    );
  }
  if (Object.keys(changes).length === 0) {
    throw new PulseDeskRequestValidationError('At least one editable request field is required');
  }

  return {
    expectedVersion: parsePulseDeskExpectedVersion(body.expectedVersion),
    changes,
  };
}

export function parsePulseDeskRequestTransition(input: unknown): PulseDeskRequestTransitionInput {
  const body = bodyRecord(input);
  assertKnownFields(body, TRANSITION_FIELDS);
  const toStatus = status(body.toStatus, 'toStatus');

  let reasonCode: PulseDeskEscalationReasonCode | null = null;
  if (toStatus === 'escalated') {
    reasonCode = escalationReason(body.reasonCode);
  } else if (body.reasonCode !== undefined && body.reasonCode !== null && body.reasonCode !== '') {
    throw new PulseDeskRequestValidationError(
      'reasonCode is only accepted when escalating a request',
      'reasonCode',
    );
  }

  return {
    expectedVersion: parsePulseDeskExpectedVersion(body.expectedVersion),
    toStatus,
    reasonCode,
  };
}

export function assertPulseDeskStatusTransition(
  fromStatus: PulseDeskRequestStatus,
  toStatus: PulseDeskRequestStatus,
): void {
  const allowedStatuses = PULSEDESK_STATUS_TRANSITIONS[fromStatus];
  if (!allowedStatuses.includes(toStatus)) {
    throw new PulseDeskStatusTransitionError(fromStatus, toStatus, allowedStatuses);
  }
}

function parseListLimit(value: unknown): number {
  if (value === undefined || value === null || value === '') return PULSEDESK_LIST_DEFAULT_LIMIT;
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^\d+$/.test(value.trim())
      ? Number(value.trim())
      : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > PULSEDESK_LIST_MAX_LIMIT) {
    throw new PulseDeskRequestValidationError(
      `limit must be a whole number from 1 to ${PULSEDESK_LIST_MAX_LIMIT}`,
      'limit',
    );
  }
  return parsed;
}

export function parsePulseDeskRequestListQuery(input: unknown): PulseDeskRequestListQuery {
  if (input === undefined || input === null || input === '') {
    return { limit: PULSEDESK_LIST_DEFAULT_LIMIT };
  }
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new PulseDeskRequestValidationError('Query must be an object');
  }
  const query = input as Record<string, unknown>;
  assertKnownFields(query, LIST_FIELDS);
  const parsed: PulseDeskRequestListQuery = { limit: parseListLimit(query.limit) };

  if (query.status !== undefined && query.status !== '') parsed.status = status(query.status);
  if (query.priority !== undefined && query.priority !== '') parsed.priority = priority(query.priority);
  if (query.category !== undefined && query.category !== '') parsed.category = category(query.category);
  if (query.departmentId !== undefined && query.departmentId !== '') {
    parsed.departmentId = optionalIdentifier(query.departmentId, 'departmentId')!;
  }
  if (query.assignedToUserId !== undefined && query.assignedToUserId !== '') {
    parsed.assignedToUserId = optionalIdentifier(query.assignedToUserId, 'assignedToUserId')!;
  }
  if (query.isPatientImpacting !== undefined && query.isPatientImpacting !== '') {
    parsed.isPatientImpacting = queryBoolean(query.isPatientImpacting, 'isPatientImpacting');
  }
  if (query.search !== undefined && query.search !== '') {
    parsed.search = normalizedSingleLineText(
      query.search,
      'search',
      1,
      PULSEDESK_SEARCH_MAX_LENGTH,
    );
  }
  return parsed;
}

export function parsePulseDeskDepartmentCreate(input: unknown): PulseDeskDepartmentCreateInput {
  const body = bodyRecord(input);
  assertKnownFields(body, DEPARTMENT_CREATE_FIELDS);
  return {
    name: normalizedSingleLineText(
      body.name,
      'name',
      PULSEDESK_DEPARTMENT_NAME_MIN_LENGTH,
      PULSEDESK_DEPARTMENT_NAME_MAX_LENGTH,
    ),
  };
}

export function parsePulseDeskDepartmentPatch(input: unknown): PulseDeskDepartmentPatchInput {
  const body = bodyRecord(input);
  assertKnownFields(body, DEPARTMENT_PATCH_FIELDS);
  const patch: PulseDeskDepartmentPatchInput = {};
  if ('name' in body) {
    patch.name = normalizedSingleLineText(
      body.name,
      'name',
      PULSEDESK_DEPARTMENT_NAME_MIN_LENGTH,
      PULSEDESK_DEPARTMENT_NAME_MAX_LENGTH,
    );
  }
  if ('active' in body) patch.active = requiredBoolean(body.active, 'active');
  if (Object.keys(patch).length === 0) {
    throw new PulseDeskRequestValidationError('At least one editable department field is required');
  }
  return patch;
}

export function parsePulseDeskDepartmentListQuery(input: unknown): PulseDeskDepartmentListQuery {
  if (input === undefined || input === null || input === '') return { includeInactive: false };
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new PulseDeskRequestValidationError('Query must be an object');
  }
  const query = input as Record<string, unknown>;
  assertKnownFields(query, DEPARTMENT_LIST_FIELDS);
  return {
    includeInactive: query.includeInactive === undefined || query.includeInactive === ''
      ? false
      : queryBoolean(query.includeInactive, 'includeInactive'),
  };
}
