import { createHash } from 'node:crypto';

export class SnapProofValidationError extends Error {
  readonly code = 'SNAPPROOF_VALIDATION_FAILED';
}

type JsonObject = Record<string, unknown>;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const SECRET_KEY = /(authorization|cookie|password|secret|token|api[_-]?key|private[_-]?key)/i;
const CLIENT_AUTHORITY_KEYS = ['tenantId', 'tenant_id', 'userId', 'user_id', 'moduleId', 'module_id', 'role', 'entitlement'];

function object(value: unknown, label = 'body'): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SnapProofValidationError(`${label} must be an object`);
  }
  return value as JsonObject;
}

function rejectClientAuthority(input: JsonObject): void {
  const supplied = CLIENT_AUTHORITY_KEYS.find(key => key in input);
  if (supplied) throw new SnapProofValidationError(`${supplied} is resolved from the trusted OperatorOS session`);
}

function text(value: unknown, label: string, max: number, required = false): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new SnapProofValidationError(`${label} is required`);
    return null;
  }
  if (typeof value !== 'string') throw new SnapProofValidationError(`${label} must be text`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max || CONTROL.test(normalized)) {
    throw new SnapProofValidationError(`${label} must contain 1-${max} safe characters`);
  }
  return normalized;
}

function oneOf<T extends string>(value: unknown, label: string, allowed: readonly T[], fallback?: T): T {
  const candidate = value ?? fallback;
  if (typeof candidate !== 'string' || !allowed.includes(candidate as T)) {
    throw new SnapProofValidationError(`${label} must be one of: ${allowed.join(', ')}`);
  }
  return candidate as T;
}

function timestamp(value: unknown, label: string, fallback?: Date): Date {
  if (value === undefined && fallback) return fallback;
  if (typeof value !== 'string') throw new SnapProofValidationError(`${label} must be an ISO timestamp`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.getTime() > Date.now() + 5 * 60_000) {
    throw new SnapProofValidationError(`${label} must be a valid timestamp that is not in the future`);
  }
  return parsed;
}

export function sanitizeContext(value: unknown, label: string): JsonObject {
  if (value === undefined || value === null) return {};
  const source = object(value, label);
  const serialized = JSON.stringify(source);
  if (serialized.length > 8_000) throw new SnapProofValidationError(`${label} is too large`);
  const walk = (input: unknown, depth: number): unknown => {
    if (depth > 4) throw new SnapProofValidationError(`${label} is too deeply nested`);
    if (Array.isArray(input)) {
      if (input.length > 40) throw new SnapProofValidationError(`${label} contains too many values`);
      return input.map(item => walk(item, depth + 1));
    }
    if (input && typeof input === 'object') {
      const entries = Object.entries(input as JsonObject);
      if (entries.length > 40) throw new SnapProofValidationError(`${label} contains too many fields`);
      return Object.fromEntries(entries.map(([key, item]) => {
        if (SECRET_KEY.test(key)) throw new SnapProofValidationError(`${label} cannot contain secret-bearing fields`);
        return [key, walk(item, depth + 1)];
      }));
    }
    if (typeof input === 'string') {
      if (input.length > 1_000 || CONTROL.test(input)) throw new SnapProofValidationError(`${label} contains unsafe text`);
      return input;
    }
    if (typeof input === 'number' && !Number.isFinite(input)) {
      throw new SnapProofValidationError(`${label} contains an invalid number`);
    }
    if (['string', 'number', 'boolean'].includes(typeof input) || input === null) return input;
    throw new SnapProofValidationError(`${label} contains an unsupported value`);
  };
  return walk(source, 0) as JsonObject;
}

export const CASE_STATUSES = ['draft', 'collecting', 'in_review', 'approved', 'rejected', 'archived'] as const;
export const EVIDENCE_STATUSES = ['captured', 'in_review', 'verified', 'rejected', 'archived'] as const;
export const EVIDENCE_TYPES = ['photo', 'document', 'screenshot', 'log', 'note'] as const;

export function parseCaseInput(value: unknown) {
  const input = object(value);
  rejectClientAuthority(input);
  return {
    reference: text(input.reference, 'reference', 80, true)!,
    title: text(input.title, 'title', 200, true)!,
    description: text(input.description, 'description', 10_000),
    caseType: text(input.caseType, 'caseType', 60) ?? 'proof_of_work',
    sourceContext: sanitizeContext(input.sourceContext, 'sourceContext'),
    assignedToUserId: text(input.assignedToUserId, 'assignedToUserId', 36),
  };
}

export function parseCasePatch(value: unknown) {
  const input = object(value);
  rejectClientAuthority(input);
  const expectedVersion = Number(input.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new SnapProofValidationError('expectedVersion must be a positive integer');
  }
  const changes: JsonObject = {};
  if ('title' in input) changes.title = text(input.title, 'title', 200, true);
  if ('description' in input) changes.description = text(input.description, 'description', 10_000);
  if ('caseType' in input) changes.caseType = text(input.caseType, 'caseType', 60, true);
  if ('sourceContext' in input) changes.sourceContext = sanitizeContext(input.sourceContext, 'sourceContext');
  if ('assignedToUserId' in input) changes.assignedToUserId = text(input.assignedToUserId, 'assignedToUserId', 36);
  if (Object.keys(changes).length === 0) throw new SnapProofValidationError('At least one editable field is required');
  return { expectedVersion, changes };
}

export function parseEvidenceInput(value: unknown) {
  const input = object(value);
  rejectClientAuthority(input);
  const evidenceType = oneOf(input.evidenceType, 'evidenceType', EVIDENCE_TYPES);
  const contentBase64 = text(input.contentBase64, 'contentBase64', 35_000_000);
  if (evidenceType === 'note' && contentBase64) {
    throw new SnapProofValidationError('Note evidence cannot include a file');
  }
  if (evidenceType !== 'note' && !contentBase64) {
    throw new SnapProofValidationError('File evidence requires contentBase64');
  }
  let content: Buffer | null = null;
  if (contentBase64) {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(contentBase64) || contentBase64.length % 4 !== 0) {
      throw new SnapProofValidationError('contentBase64 must be canonical base64');
    }
    content = Buffer.from(contentBase64, 'base64');
    if (content.toString('base64') !== contentBase64) {
      throw new SnapProofValidationError('contentBase64 must be canonical base64');
    }
  }
  return {
    title: text(input.title, 'title', 200, true)!,
    evidenceType,
    description: text(input.description, 'description', 10_000),
    capturedAt: timestamp(input.capturedAt, 'capturedAt', new Date()),
    sourceType: text(input.sourceType, 'sourceType', 40, true)!,
    sourceReference: text(input.sourceReference, 'sourceReference', 240),
    captureContext: sanitizeContext(input.captureContext, 'captureContext'),
    originalName: evidenceType === 'note' ? null : text(input.originalName, 'originalName', 240, true)!,
    declaredMimeType: evidenceType === 'note' ? null : text(input.declaredMimeType, 'declaredMimeType', 120, true)!,
    content,
  };
}

export function parseFindingInput(value: unknown) {
  const input = object(value);
  rejectClientAuthority(input);
  return {
    evidenceId: text(input.evidenceId, 'evidenceId', 36),
    title: text(input.title, 'title', 200, true)!,
    description: text(input.description, 'description', 10_000, true)!,
    recommendation: text(input.recommendation, 'recommendation', 10_000),
    category: text(input.category, 'category', 60),
    severity: oneOf(input.severity, 'severity', ['info', 'low', 'medium', 'high', 'critical'] as const, 'medium'),
  };
}

export function parseCommentInput(value: unknown) {
  const input = object(value);
  rejectClientAuthority(input);
  return {
    evidenceId: text(input.evidenceId, 'evidenceId', 36),
    commentType: oneOf(input.commentType, 'commentType', ['internal', 'review', 'decision'] as const, 'internal'),
    body: text(input.body, 'body', 5_000, true)!,
  };
}

export function parseDecisionInput(value: unknown) {
  const input = object(value);
  rejectClientAuthority(input);
  const expectedVersion = Number(input.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new SnapProofValidationError('expectedVersion must be a positive integer');
  }
  return {
    expectedVersion,
    decision: oneOf(input.decision, 'decision', ['approve', 'reject'] as const),
    reason: text(input.reason, 'reason', 2_000),
  };
}

export function parseRetentionInput(value: unknown) {
  const input = object(value);
  rejectClientAuthority(input);
  const expectedVersion = Number(input.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new SnapProofValidationError('expectedVersion must be a positive integer');
  }
  const legalHold = typeof input.legalHold === 'boolean' ? input.legalHold : undefined;
  let retentionUntil: Date | null | undefined;
  if ('retentionUntil' in input) {
    if (input.retentionUntil === null) {
      retentionUntil = null;
    } else {
      if (typeof input.retentionUntil !== 'string') throw new SnapProofValidationError('retentionUntil must be an ISO timestamp');
      const parsed = new Date(input.retentionUntil);
      if (!Number.isFinite(parsed.getTime())) throw new SnapProofValidationError('retentionUntil must be a valid ISO timestamp');
      retentionUntil = parsed;
    }
  }
  if (legalHold === undefined && retentionUntil === undefined) {
    throw new SnapProofValidationError('legalHold or retentionUntil is required');
  }
  return { expectedVersion, legalHold, retentionUntil };
}

export function parseListQuery(value: unknown) {
  const input = object(value ?? {}, 'query');
  const limit = input.limit === undefined ? 25 : Number(input.limit);
  const offset = input.offset === undefined ? 0 : Number(input.offset);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new SnapProofValidationError('limit must be 1-100');
  if (!Number.isInteger(offset) || offset < 0 || offset > 100_000) throw new SnapProofValidationError('offset must be 0-100000');
  return {
    limit,
    offset,
    search: text(input.search, 'search', 120),
    status: text(input.status, 'status', 24),
  };
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as JsonObject).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256Json(value: unknown): string {
  return createHash('sha256').update(stable(value)).digest('hex');
}

export function createCustodyHash(input: {
  tenantId: string;
  caseId: string;
  evidenceId: string | null;
  actorUserId: string | null;
  sequenceNumber: number;
  eventType: string;
  previousHash: string | null;
  payload: JsonObject;
  createdAt: string;
}): string {
  return sha256Json(input);
}

export function csvCell(value: unknown): string {
  const stringValue = value === null || value === undefined ? '' : String(value);
  return `"${stringValue.replaceAll('"', '""')}"`;
}
