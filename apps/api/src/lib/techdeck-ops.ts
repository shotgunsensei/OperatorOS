export class TechDeckOpsValidationError extends Error {
  constructor(public code: string, public field?: string) {
    super(code);
  }
}

const ASSET_TYPES = new Set(['endpoint', 'server', 'network', 'printer', 'mobile', 'other']);
const ASSET_HEALTH = new Set(['unknown', 'healthy', 'warning', 'critical', 'offline']);
const RUNBOOK_PLATFORMS = new Set(['powershell', 'bash', 'network', 'generic']);
const RUNBOOK_RISK = new Set(['low', 'medium', 'high']);

function object(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TechDeckOpsValidationError('BODY_INVALID');
  }
  return raw as Record<string, unknown>;
}

function rejectServerOwned(body: Record<string, unknown>, fields: readonly string[]) {
  for (const field of fields) {
    if (field in body) throw new TechDeckOpsValidationError('SERVER_OWNED_FIELD', field);
  }
}

function text(
  value: unknown,
  field: string,
  max: number,
  options: { required?: boolean; nullable?: boolean } = {},
): string | null | undefined {
  if (value === undefined) {
    if (options.required) throw new TechDeckOpsValidationError('FIELD_REQUIRED', field);
    return undefined;
  }
  if (value === null) {
    if (options.nullable) return null;
    if (options.required) throw new TechDeckOpsValidationError('FIELD_REQUIRED', field);
    return undefined;
  }
  if (typeof value !== 'string') throw new TechDeckOpsValidationError('FIELD_INVALID', field);
  const normalized = value.trim();
  if (!normalized && options.required) throw new TechDeckOpsValidationError('FIELD_REQUIRED', field);
  if (normalized.length > max) throw new TechDeckOpsValidationError('FIELD_TOO_LONG', field);
  return normalized || (options.nullable ? null : undefined);
}

function enumValue(value: unknown, field: string, allowed: Set<string>, fallback?: string): string {
  const normalized = value === undefined ? fallback : value;
  if (typeof normalized !== 'string' || !allowed.has(normalized)) {
    throw new TechDeckOpsValidationError('FIELD_INVALID', field);
  }
  return normalized;
}

function date(value: unknown, field: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw new TechDeckOpsValidationError('DATE_INVALID', field);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new TechDeckOpsValidationError('DATE_INVALID', field);
  return parsed;
}

function expectedVersion(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new TechDeckOpsValidationError('EXPECTED_VERSION_REQUIRED', 'expectedVersion');
  }
  return value as number;
}

export function parseTechDeckAssetCreate(raw: unknown) {
  const body = object(raw);
  rejectServerOwned(body, ['id', 'tenantId', 'createdByUserId', 'version', 'createdAt', 'updatedAt', 'deletedAt']);
  return {
    name: text(body.name, 'name', 160, { required: true })!,
    type: enumValue(body.type, 'type', ASSET_TYPES, 'endpoint'),
    hostname: text(body.hostname, 'hostname', 255, { nullable: true }) ?? null,
    ipAddress: text(body.ipAddress, 'ipAddress', 64, { nullable: true }) ?? null,
    operatingSystem: text(body.operatingSystem, 'operatingSystem', 160, { nullable: true }) ?? null,
    health: enumValue(body.health, 'health', ASSET_HEALTH, 'unknown'),
    lastSeenAt: date(body.lastSeenAt, 'lastSeenAt') ?? null,
    notes: text(body.notes, 'notes', 4_000, { nullable: true }) ?? null,
  };
}

export function parseTechDeckAssetPatch(raw: unknown) {
  const body = object(raw);
  rejectServerOwned(body, ['id', 'tenantId', 'createdByUserId', 'createdAt', 'updatedAt', 'deletedAt']);
  const patch: Record<string, unknown> = {};
  if ('name' in body) patch.name = text(body.name, 'name', 160, { required: true });
  if ('type' in body) patch.type = enumValue(body.type, 'type', ASSET_TYPES);
  if ('hostname' in body) patch.hostname = text(body.hostname, 'hostname', 255, { nullable: true });
  if ('ipAddress' in body) patch.ipAddress = text(body.ipAddress, 'ipAddress', 64, { nullable: true });
  if ('operatingSystem' in body) patch.operatingSystem = text(body.operatingSystem, 'operatingSystem', 160, { nullable: true });
  if ('health' in body) patch.health = enumValue(body.health, 'health', ASSET_HEALTH);
  if ('lastSeenAt' in body) patch.lastSeenAt = date(body.lastSeenAt, 'lastSeenAt');
  if ('notes' in body) patch.notes = text(body.notes, 'notes', 4_000, { nullable: true });
  if (Object.keys(patch).length === 0) throw new TechDeckOpsValidationError('PATCH_EMPTY');
  return { patch, expectedVersion: expectedVersion(body.expectedVersion) };
}

export function parseTechDeckRunbookCreate(raw: unknown) {
  const body = object(raw);
  rejectServerOwned(body, [
    'id', 'tenantId', 'createdByUserId', 'approvedByUserId', 'approvedAt',
    'status', 'version', 'createdAt', 'updatedAt', 'deletedAt',
  ]);
  return {
    name: text(body.name, 'name', 160, { required: true })!,
    platform: enumValue(body.platform, 'platform', RUNBOOK_PLATFORMS),
    purpose: text(body.purpose, 'purpose', 1_000, { required: true })!,
    scriptText: text(body.scriptText, 'scriptText', 50_000, { required: true })!,
    riskLevel: enumValue(body.riskLevel, 'riskLevel', RUNBOOK_RISK, 'medium'),
  };
}

export function parseTechDeckVersion(raw: unknown) {
  return { expectedVersion: expectedVersion(object(raw).expectedVersion) };
}
