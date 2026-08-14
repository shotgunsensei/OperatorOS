/**
 * TechDeck technician ticket queue contract.
 *
 * Client/site/configuration-item links resolve through shared OperatorOS
 * records. Tenant and actor authority always come from the validated request
 * context; local auth and billing remain excluded.
 */

export const TECHDECK_TICKET_PRIORITIES = [
  'critical',
  'high',
  'medium',
  'low',
] as const;

export type TechDeckTicketPriority = (typeof TECHDECK_TICKET_PRIORITIES)[number];

export const TECHDECK_TICKET_STATUSES = [
  'open',
  'in_progress',
  'waiting_on_client',
  'resolved',
  'closed',
] as const;

export type TechDeckTicketStatus = (typeof TECHDECK_TICKET_STATUSES)[number];

export type TechDeckTicketAssignmentFilter = 'mine' | 'unassigned';

const PRIORITY_SET = new Set<string>(TECHDECK_TICKET_PRIORITIES);
const STATUS_SET = new Set<string>(TECHDECK_TICKET_STATUSES);
const ASSIGNMENT_SET = new Set<string>(['mine', 'unassigned']);
const EDITABLE_FIELDS = new Set([
  'title',
  'description',
  'priority',
  'assignedToUserId',
  'responseDeadline',
  'resolutionDeadline',
  'directoryOrganizationId',
  'directorySiteId',
  'configurationItemId',
]);
const STATUS_FIELDS = new Set(['status']);
const LIST_FIELDS = new Set(['status', 'priority', 'assignment', 'search']);

export class TechDeckTicketValidationError extends Error {
  readonly code = 'INVALID_TICKET_INPUT';

  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'TechDeckTicketValidationError';
  }
}

export interface TechDeckTicketCreateInput {
  title: string;
  description: string | null;
  priority: TechDeckTicketPriority;
  assignedToUserId: string | null;
  responseDeadline: Date | null;
  resolutionDeadline: Date | null;
  directoryOrganizationId: string | null;
  directorySiteId: string | null;
  configurationItemId: string | null;
}

export type TechDeckTicketPatchInput = Partial<TechDeckTicketCreateInput>;

export interface TechDeckTicketListQuery {
  status?: TechDeckTicketStatus;
  priority?: TechDeckTicketPriority;
  assignment?: TechDeckTicketAssignmentFilter;
  search?: string;
}

function bodyRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TechDeckTicketValidationError('Request body must be an object');
  }
  return input as Record<string, unknown>;
}

function assertKnownFields(body: Record<string, unknown>, allowed: ReadonlySet<string>): void {
  for (const field of Object.keys(body)) {
    if (!allowed.has(field)) {
      throw new TechDeckTicketValidationError(
        `${field} is not accepted by the TechDeck ticket contract`,
        field,
      );
    }
  }
}

function requiredText(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') {
    throw new TechDeckTicketValidationError(`${field} is required`, field);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new TechDeckTicketValidationError(`${field} is required`, field);
  }
  if (trimmed.length > max) {
    throw new TechDeckTicketValidationError(`${field} must be ${max} characters or fewer`, field);
  }
  return trimmed;
}

function optionalText(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new TechDeckTicketValidationError(`${field} must be text`, field);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) {
    throw new TechDeckTicketValidationError(`${field} must be ${max} characters or fewer`, field);
  }
  return trimmed;
}

function priority(value: unknown): TechDeckTicketPriority {
  if (value === undefined || value === null || value === '') return 'medium';
  if (typeof value !== 'string' || !PRIORITY_SET.has(value)) {
    throw new TechDeckTicketValidationError(
      `priority must be one of: ${TECHDECK_TICKET_PRIORITIES.join(', ')}`,
      'priority',
    );
  }
  return value as TechDeckTicketPriority;
}

function status(value: unknown): TechDeckTicketStatus {
  if (typeof value !== 'string' || !STATUS_SET.has(value)) {
    throw new TechDeckTicketValidationError(
      `status must be one of: ${TECHDECK_TICKET_STATUSES.join(', ')}`,
      'status',
    );
  }
  return value as TechDeckTicketStatus;
}

function optionalUserId(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (
    typeof value !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new TechDeckTicketValidationError('assignedToUserId must be a valid user id', 'assignedToUserId');
  }
  return value;
}

function optionalResourceId(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new TechDeckTicketValidationError(`${field} must be a valid id`, field);
  }
  return value;
}

function optionalDate(value: unknown, field: 'responseDeadline' | 'resolutionDeadline'): Date | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' && !(value instanceof Date)) {
    throw new TechDeckTicketValidationError(
      `${field} must be an ISO date`,
      field,
    );
  }
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new TechDeckTicketValidationError(
      `${field} must be an ISO date`,
      field,
    );
  }
  return parsed;
}

export function parseTechDeckTicketCreate(input: unknown): TechDeckTicketCreateInput {
  const body = bodyRecord(input);
  assertKnownFields(body, EDITABLE_FIELDS);
  return {
    title: requiredText(body.title, 'title', 180),
    description: optionalText(body.description, 'description', 6_000),
    priority: priority(body.priority),
    assignedToUserId: optionalUserId(body.assignedToUserId),
    responseDeadline: optionalDate(body.responseDeadline, 'responseDeadline'),
    resolutionDeadline: optionalDate(body.resolutionDeadline, 'resolutionDeadline'),
    directoryOrganizationId: optionalResourceId(body.directoryOrganizationId, 'directoryOrganizationId'),
    directorySiteId: optionalResourceId(body.directorySiteId, 'directorySiteId'),
    configurationItemId: optionalResourceId(body.configurationItemId, 'configurationItemId'),
  };
}

export function parseTechDeckTicketPatch(input: unknown): TechDeckTicketPatchInput {
  const body = bodyRecord(input);
  assertKnownFields(body, EDITABLE_FIELDS);
  const patch: TechDeckTicketPatchInput = {};

  if ('title' in body) patch.title = requiredText(body.title, 'title', 180);
  if ('description' in body) patch.description = optionalText(body.description, 'description', 6_000);
  if ('priority' in body) patch.priority = priority(body.priority);
  if ('assignedToUserId' in body) patch.assignedToUserId = optionalUserId(body.assignedToUserId);
  if ('responseDeadline' in body) patch.responseDeadline = optionalDate(body.responseDeadline, 'responseDeadline');
  if ('resolutionDeadline' in body) patch.resolutionDeadline = optionalDate(body.resolutionDeadline, 'resolutionDeadline');
  if ('directoryOrganizationId' in body) patch.directoryOrganizationId = optionalResourceId(body.directoryOrganizationId, 'directoryOrganizationId');
  if ('directorySiteId' in body) patch.directorySiteId = optionalResourceId(body.directorySiteId, 'directorySiteId');
  if ('configurationItemId' in body) patch.configurationItemId = optionalResourceId(body.configurationItemId, 'configurationItemId');

  if (Object.keys(patch).length === 0) {
    throw new TechDeckTicketValidationError('At least one editable ticket field is required');
  }
  return patch;
}

export function parseTechDeckTicketStatus(input: unknown): TechDeckTicketStatus {
  const body = bodyRecord(input);
  assertKnownFields(body, STATUS_FIELDS);
  return status(body.status);
}

export function parseTechDeckTicketListQuery(input: unknown): TechDeckTicketListQuery {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const query = input as Record<string, unknown>;
  assertKnownFields(query, LIST_FIELDS);
  const parsed: TechDeckTicketListQuery = {};

  if (query.status !== undefined && query.status !== '') parsed.status = status(query.status);
  if (query.priority !== undefined && query.priority !== '') parsed.priority = priority(query.priority);
  if (query.assignment !== undefined && query.assignment !== '') {
    if (typeof query.assignment !== 'string' || !ASSIGNMENT_SET.has(query.assignment)) {
      throw new TechDeckTicketValidationError('assignment must be one of: mine, unassigned', 'assignment');
    }
    parsed.assignment = query.assignment as TechDeckTicketAssignmentFilter;
  }
  if (query.search !== undefined && query.search !== '') {
    parsed.search = requiredText(query.search, 'search', 100);
  }
  return parsed;
}
