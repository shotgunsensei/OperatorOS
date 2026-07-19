import { createHash } from 'node:crypto';

type Row = Record<string, unknown>;
const INCLUDED = [
  'vehicles',
  'mileageEvents',
  'vendors',
  'serviceRecords',
  'parts',
  'builds',
  'buildStages',
  'buildTasks',
  'reminders',
  'diagnostics',
  'troubleCodes',
  'diagnosticEntries',
  'templates',
  'attachments',
] as const;
const AUTHORITY = [
  'users',
  'sessions',
  'memberships',
  'subscriptions',
  'billingEvents',
  'tokenLedger',
  'credentials',
] as const;
const TARGET: Record<(typeof INCLUDED)[number], string> = {
  vehicles: 'torqueshed_vehicles',
  mileageEvents: 'torqueshed_mileage_events',
  vendors: 'torqueshed_vendors',
  serviceRecords: 'torqueshed_service_records',
  parts: 'torqueshed_service_parts',
  builds: 'torqueshed_builds',
  buildStages: 'torqueshed_build_stages',
  buildTasks: 'torqueshed_build_tasks',
  reminders: 'torqueshed_service_reminders',
  diagnostics: 'torqueshed_diagnostic_sessions',
  troubleCodes: 'torqueshed_diagnostic_trouble_codes',
  diagnosticEntries: 'torqueshed_diagnostic_entries',
  templates: 'torqueshed_diagnostic_templates',
  attachments: 'shared_attachments',
};

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.entries(value as Row)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`)
    .join(',')}}`;
}
function hash(value: unknown): string {
  return createHash('sha256').update(stable(value)).digest('hex');
}
function list(input: Row, name: string, errors: string[]): Row[] {
  const value = input[name];
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    errors.push(`${name} must be an array`);
    return [];
  }
  return value.filter((row, index): row is Row => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      errors.push(`${name}[${index}] must be an object`);
      return false;
    }
    return true;
  });
}

export interface TorqueShedImportPlan {
  planVersion: 1;
  mode: 'dry-run';
  sourceFingerprint: string;
  sourceCommit: string | null;
  sourceCounts: Record<string, number>;
  plannedTargetCounts: Record<string, number>;
  excludedAuthority: Record<string, number>;
  identityMappings: number;
  mappings: Array<{ sourceType: string; sourceId: string; targetType: string; sourceHash: string }>;
  reconciliation: {
    referencesChecked: number;
    referencesResolved: number;
    referencesMissing: number;
    attachmentReferences: number;
    attachmentBytes: number;
    serviceCostMinor: number;
    partCostMinor: number;
  };
  warnings: string[];
  errors: string[];
  readyToApply: boolean;
}

export function planTorqueShedImport(raw: unknown): TorqueShedImportPlan {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('TorqueShed export must be a JSON object');
  const input = raw as Row;
  const errors: string[] = [];
  const warnings: string[] = [];
  if (input.exportVersion !== 1)
    errors.push(`Unsupported exportVersion ${String(input.exportVersion)}; expected 1`);
  const included = Object.fromEntries(
    INCLUDED.map((name) => [name, list(input, name, errors)]),
  ) as Record<(typeof INCLUDED)[number], Row[]>;
  const authority = Object.fromEntries(
    AUTHORITY.map((name) => [name, list(input, name, errors)]),
  ) as Record<(typeof AUTHORITY)[number], Row[]>;
  const identityMappings = list(input, 'identityMappings', errors);
  const mappedUsers = new Set<string>();
  identityMappings.forEach((mapping, index) => {
    if (
      typeof mapping.sourceUserId !== 'string' ||
      typeof mapping.operatorOsUserId !== 'string' ||
      !mapping.sourceUserId ||
      !mapping.operatorOsUserId
    )
      errors.push(`identityMappings[${index}] requires sourceUserId and operatorOsUserId`);
    else if (mappedUsers.has(mapping.sourceUserId))
      errors.push(`identityMappings duplicates ${mapping.sourceUserId}`);
    else mappedUsers.add(mapping.sourceUserId);
  });
  const ids = new Map<string, Set<string>>();
  const mappings: TorqueShedImportPlan['mappings'] = [];
  for (const table of INCLUDED) {
    const set = new Set<string>();
    included[table].forEach((row, index) => {
      if (typeof row.id !== 'string' || !row.id) {
        errors.push(`${table}[${index}].id is required`);
        return;
      }
      if (set.has(row.id)) errors.push(`${table} duplicates ${row.id}`);
      set.add(row.id);
      mappings.push({
        sourceType: table,
        sourceId: row.id,
        targetType: TARGET[table],
        sourceHash: hash(row),
      });
      if (typeof row.ownerUserId === 'string' && !mappedUsers.has(row.ownerUserId))
        errors.push(`${table}[${index}].ownerUserId has no OperatorOS identity mapping`);
    });
    ids.set(table, set);
  }
  let referencesChecked = 0,
    referencesResolved = 0,
    referencesMissing = 0;
  const ref = (
    table: (typeof INCLUDED)[number],
    index: number,
    field: string,
    target: (typeof INCLUDED)[number],
  ) => {
    const value = included[table][index]?.[field];
    if (value === undefined || value === null || value === '') return;
    referencesChecked++;
    if (typeof value === 'string' && ids.get(target)!.has(value)) referencesResolved++;
    else {
      referencesMissing++;
      errors.push(`${table}[${index}].${field} references missing ${target}`);
    }
  };
  included.mileageEvents.forEach((_, i) => ref('mileageEvents', i, 'vehicleId', 'vehicles'));
  included.serviceRecords.forEach((_, i) => {
    ref('serviceRecords', i, 'vehicleId', 'vehicles');
    ref('serviceRecords', i, 'vendorId', 'vendors');
  });
  included.parts.forEach((_, i) => {
    ref('parts', i, 'serviceRecordId', 'serviceRecords');
    ref('parts', i, 'vendorId', 'vendors');
  });
  included.builds.forEach((_, i) => ref('builds', i, 'vehicleId', 'vehicles'));
  included.buildStages.forEach((_, i) => ref('buildStages', i, 'buildId', 'builds'));
  included.buildTasks.forEach((_, i) => {
    ref('buildTasks', i, 'buildId', 'builds');
    ref('buildTasks', i, 'stageId', 'buildStages');
  });
  included.reminders.forEach((_, i) => ref('reminders', i, 'vehicleId', 'vehicles'));
  included.diagnostics.forEach((_, i) => ref('diagnostics', i, 'vehicleId', 'vehicles'));
  included.troubleCodes.forEach((_, i) => ref('troubleCodes', i, 'diagnosticId', 'diagnostics'));
  included.diagnosticEntries.forEach((_, i) =>
    ref('diagnosticEntries', i, 'diagnosticId', 'diagnostics'),
  );
  const attachmentTargets: Record<string, (typeof INCLUDED)[number]> = {
    vehicle: 'vehicles',
    service_record: 'serviceRecords',
    build: 'builds',
    diagnostic: 'diagnostics',
  };
  included.attachments.forEach((row, i) => {
    const target = attachmentTargets[String(row.objectType ?? '')];
    if (!target) errors.push(`attachments[${i}].objectType is unsupported`);
    else ref('attachments', i, 'objectId', target);
  });
  const integerCost = (row: Row, field: string, label: string) => {
    const value = row[field];
    if (value === undefined || value === null) return 0;
    if (!Number.isSafeInteger(value) || Number(value) < 0) {
      errors.push(`${label}.${field} must be a non-negative integer minor-unit value`);
      return 0;
    }
    return Number(value);
  };
  const serviceCostMinor = included.serviceRecords.reduce(
    (total, row, index) =>
      total +
      integerCost(row, 'laborCostMinor', `serviceRecords[${index}]`) +
      integerCost(row, 'partsCostMinor', `serviceRecords[${index}]`) +
      integerCost(row, 'otherCostMinor', `serviceRecords[${index}]`),
    0,
  );
  const partCostMinor = included.parts.reduce(
    (total, row, index) =>
      total + integerCost(row, 'unitCostMinor', `parts[${index}]`) * Number(row.quantity ?? 1),
    0,
  );
  let attachmentBytes = 0;
  included.attachments.forEach((row, index) => {
    const bytes = row.byteSize;
    if (!Number.isSafeInteger(bytes) || Number(bytes) < 0)
      errors.push(`attachments[${index}].byteSize must be a non-negative integer`);
    else attachmentBytes += Number(bytes);
  });
  const excludedAuthority = Object.fromEntries(
    AUTHORITY.map((name) => [name, authority[name].length]),
  );
  if (Object.values(excludedAuthority).some(Number))
    warnings.push(
      'Standalone users, sessions, memberships, credentials, usage tokens, subscriptions, and billing are excluded; OperatorOS remains authoritative.',
    );
  warnings.push(
    'Attachment metadata is reconciled only; bytes must enter through the OperatorOS shared attachment scanner during an approved apply.',
  );
  warnings.push(
    'VIN values will be normalized to a fingerprint and masked suffix; the plaintext VIN will not be retained.',
  );
  const plannedTargetCounts: Record<string, number> = {};
  for (const table of INCLUDED)
    plannedTargetCounts[TARGET[table]] =
      (plannedTargetCounts[TARGET[table]] ?? 0) + included[table].length;
  return {
    planVersion: 1,
    mode: 'dry-run',
    sourceFingerprint: hash(input),
    sourceCommit: typeof input.sourceCommit === 'string' ? input.sourceCommit : null,
    sourceCounts: Object.fromEntries(
      [...INCLUDED, ...AUTHORITY].map((name) => [
        name,
        (included as any)[name]?.length ?? (authority as any)[name]?.length ?? 0,
      ]),
    ),
    plannedTargetCounts,
    excludedAuthority,
    identityMappings: identityMappings.length,
    mappings,
    reconciliation: {
      referencesChecked,
      referencesResolved,
      referencesMissing,
      attachmentReferences: included.attachments.length,
      attachmentBytes,
      serviceCostMinor,
      partCostMinor,
    },
    warnings,
    errors: [...new Set(errors)],
    readyToApply: errors.length === 0,
  };
}
