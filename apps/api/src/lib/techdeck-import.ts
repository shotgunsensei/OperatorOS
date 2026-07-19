import { createHash } from 'node:crypto';

type JsonRecord = Record<string, unknown>;

export interface TechDeckImportPlan {
  planVersion: 1;
  mode: 'dry-run';
  sourceFingerprint: string;
  sourceCounts: Record<string, number>;
  plannedTargetCounts: Record<string, number>;
  excludedAuthority: Record<string, number>;
  excludedUnsafeCapabilities: Record<string, number>;
  mappings: Array<{ sourceType: string; sourceId: string; targetType: string; sourceHash: string }>;
  reconciliation: { referencesChecked: number; referencesResolved: number; referencesMissing: number; secretShapedFieldsRejected: number };
  warnings: string[];
  errors: string[];
  readyToApply: boolean;
}

const INCLUDED = ['clients', 'sites', 'configurationItems', 'relationships', 'folders', 'documents', 'revisions', 'documentLinks', 'evidence', 'tickets', 'comments', 'timeEntries'] as const;
const AUTHORITY = ['users', 'memberships', 'sessions', 'subscriptions', 'billingEvents', 'apiTokens', 'passwordResetTokens'] as const;
const UNSAFE = ['credentials', 'secrets', 'scriptResponses', 'remoteActions', 'agentCommands', 'webhooks', 'licenseKeys'] as const;
const SECRET_KEY = /(password|passphrase|secret|token|private.?key|api.?key|credential.?value|connection.?string|recovery.?code)/i;

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.entries(value as JsonRecord).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`).join(',')}}`;
}

function hash(value: unknown): string {
  return createHash('sha256').update(stable(value)).digest('hex');
}

function rows(value: unknown, table: string, errors: string[]): JsonRecord[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) { errors.push(`${table} must be an array`); return []; }
  return value.filter((entry, index): entry is JsonRecord => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) { errors.push(`${table}[${index}] must be an object`); return false; }
    return true;
  });
}

function sourceId(row: JsonRecord, table: string, index: number, errors: string[]): string | null {
  if (typeof row.id !== 'string' || !row.id.trim() || row.id.length > 200) {
    errors.push(`${table}[${index}].id must be a non-empty string of at most 200 characters`);
    return null;
  }
  return row.id;
}

function secretPaths(value: unknown, path: string, output: string[]): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) { value.forEach((entry, index) => secretPaths(entry, `${path}[${index}]`, output)); return; }
  for (const [key, nested] of Object.entries(value as JsonRecord)) {
    const next = `${path}.${key}`;
    if (SECRET_KEY.test(key) && !/^(externalVaultReference|credentialReference)$/i.test(key)) output.push(next);
    secretPaths(nested, next, output);
  }
}

export function planTechDeckImport(raw: unknown): TechDeckImportPlan {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('TechDeck export must be a JSON object');
  const input = raw as JsonRecord;
  const errors: string[] = [];
  const warnings: string[] = [];
  if (input.exportVersion !== undefined && input.exportVersion !== 1) errors.push(`Unsupported exportVersion ${String(input.exportVersion)}; expected 1`);

  const included = Object.fromEntries(INCLUDED.map(name => [name, rows(input[name], name, errors)])) as Record<typeof INCLUDED[number], JsonRecord[]>;
  const authority = Object.fromEntries(AUTHORITY.map(name => [name, rows(input[name], name, errors)])) as Record<typeof AUTHORITY[number], JsonRecord[]>;
  const unsafe = Object.fromEntries(UNSAFE.map(name => [name, rows(input[name], name, errors)])) as Record<typeof UNSAFE[number], JsonRecord[]>;
  const sourceCounts = Object.fromEntries([...INCLUDED, ...AUTHORITY, ...UNSAFE].map(name => [name, (included as any)[name]?.length ?? (authority as any)[name]?.length ?? (unsafe as any)[name]?.length ?? 0]));

  const ids = new Map<string, Set<string>>();
  for (const table of INCLUDED) {
    const set = new Set<string>();
    included[table].forEach((row, index) => {
      const id = sourceId(row, table, index, errors);
      if (!id) return;
      if (set.has(id)) errors.push(`${table} contains duplicate source id ${id}`);
      set.add(id);
    });
    ids.set(table, set);
  }

  const secretFields: string[] = [];
  for (const table of ['configurationItems', 'documents', 'evidence'] as const) {
    included[table].forEach((row, index) => secretPaths(row, `${table}[${index}]`, secretFields));
  }
  secretFields.forEach(path => errors.push(`${path} is secret-shaped; only an external vault reference may be imported`));

  const target: Record<typeof INCLUDED[number], string> = {
    clients: 'directory_organizations', sites: 'directory_sites', configurationItems: 'techdeck_assets',
    relationships: 'techdeck_configuration_relationships', folders: 'techdeck_document_folders', documents: 'techdeck_documents',
    revisions: 'techdeck_document_revisions', documentLinks: 'techdeck_document_links', evidence: 'techdeck_evidence',
    tickets: 'techdeck_tickets', comments: 'techdeck_ticket_comments', timeEntries: 'techdeck_time_entries',
  };
  const mappings: TechDeckImportPlan['mappings'] = [];
  for (const table of INCLUDED) {
    included[table].forEach((row, index) => {
      const id = sourceId(row, table, index, errors);
      if (id) mappings.push({ sourceType: table, sourceId: id, targetType: target[table], sourceHash: hash(row) });
    });
  }

  let referencesChecked = 0;
  let referencesResolved = 0;
  let referencesMissing = 0;
  const reference = (table: typeof INCLUDED[number], index: number, field: string, targetTable: typeof INCLUDED[number]) => {
    const value = included[table][index]?.[field];
    if (value === undefined || value === null || value === '') return;
    referencesChecked++;
    if (typeof value === 'string' && ids.get(targetTable)!.has(value)) referencesResolved++;
    else { referencesMissing++; errors.push(`${table}[${index}].${field} references missing ${targetTable} record ${String(value)}`); }
  };
  included.sites.forEach((_, index) => reference('sites', index, 'clientId', 'clients'));
  included.configurationItems.forEach((_, index) => { reference('configurationItems', index, 'clientId', 'clients'); reference('configurationItems', index, 'siteId', 'sites'); });
  included.relationships.forEach((_, index) => { reference('relationships', index, 'sourceId', 'configurationItems'); reference('relationships', index, 'targetId', 'configurationItems'); });
  included.folders.forEach((_, index) => { reference('folders', index, 'clientId', 'clients'); reference('folders', index, 'parentId', 'folders'); });
  included.documents.forEach((_, index) => { reference('documents', index, 'clientId', 'clients'); reference('documents', index, 'siteId', 'sites'); reference('documents', index, 'folderId', 'folders'); });
  included.revisions.forEach((_, index) => reference('revisions', index, 'documentId', 'documents'));
  included.documentLinks.forEach((_, index) => { reference('documentLinks', index, 'sourceDocumentId', 'documents'); reference('documentLinks', index, 'targetDocumentId', 'documents'); });
  included.comments.forEach((_, index) => reference('comments', index, 'ticketId', 'tickets'));
  included.timeEntries.forEach((_, index) => { reference('timeEntries', index, 'ticketId', 'tickets'); reference('timeEntries', index, 'configurationItemId', 'configurationItems'); });

  const excludedAuthority = Object.fromEntries(AUTHORITY.map(name => [name, authority[name].length]));
  const excludedUnsafeCapabilities = Object.fromEntries(UNSAFE.map(name => [name, unsafe[name].length]));
  if (Object.values(excludedAuthority).some(Number)) warnings.push('Standalone identity, sessions, subscriptions, billing, and API tokens are excluded; OperatorOS remains authoritative.');
  if (Object.values(excludedUnsafeCapabilities).some(Number)) warnings.push('Secrets, license material, webhooks, scripts, and remote actions are excluded; runbooks remain documentation-only.');

  return {
    planVersion: 1,
    mode: 'dry-run',
    sourceFingerprint: hash(input),
    sourceCounts,
    plannedTargetCounts: {
      directoryOrganizations: included.clients.length, directorySites: included.sites.length,
      configurationItems: included.configurationItems.length, relationships: included.relationships.length,
      folders: included.folders.length, documents: included.documents.length, revisions: included.revisions.length,
      documentLinks: included.documentLinks.length, evidence: included.evidence.length, tickets: included.tickets.length,
      comments: included.comments.length, timeEntries: included.timeEntries.length, migrationRefs: mappings.length,
    },
    excludedAuthority,
    excludedUnsafeCapabilities,
    mappings,
    reconciliation: { referencesChecked, referencesResolved, referencesMissing, secretShapedFieldsRejected: secretFields.length },
    warnings,
    errors: [...new Set(errors)],
    readyToApply: errors.length === 0,
  };
}
