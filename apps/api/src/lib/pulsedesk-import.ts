import { createHash } from 'node:crypto';
import { assertNoProhibitedPhi, PulseDeskServiceDeskError } from './pulsedesk-service-desk.js';

type JsonRecord = Record<string, unknown>;

const INCLUDED = [
  'clients', 'sites', 'contacts', 'departments', 'queues', 'teams', 'teamMembers',
  'ticketOptions', 'slaPolicies', 'assets', 'tickets', 'messages', 'assignments',
  'slaEvents', 'timeEntries', 'vendors', 'vendorEngagements', 'supplyRequests',
  'facilityRequests', 'knowledgeArticles', 'tags', 'ticketTags', 'savedViews',
  'notificationPreferences',
] as const;
const AUTHORITY = [
  'users', 'orgs', 'memberships', 'inviteCodes', 'sessions', 'subscriptions',
  'billingEvents', 'operatorOsEntitlementSnapshots', 'authAuditLog',
] as const;
const PROVIDER_OR_SENSITIVE = [
  'orgAuthConfig', 'orgRoleMappings', 'emailSettings', 'inboundEmailLog',
  'ticketEmailMetadata', 'mailConnectors', 'connectorEvents', 'oauthTokens',
  'credentials', 'secrets', 'attachmentBytes',
] as const;

export interface PulseDeskImportPlan {
  planVersion: 1;
  mode: 'dry-run';
  sourceFingerprint: string;
  sourceCounts: Record<string, number>;
  plannedTargetCounts: Record<string, number>;
  excludedAuthority: Record<string, number>;
  excludedProviderOrSensitive: Record<string, number>;
  mappings: Array<{ sourceType: string; sourceId: string; targetType: string; sourceHash: string }>;
  reconciliation: {
    referencesChecked: number;
    referencesResolved: number;
    referencesMissing: number;
    prohibitedFieldsRejected: number;
  };
  privacyFindings: Array<{ sourceType: string; sourceId: string; field: string; code: string }>;
  warnings: string[];
  errors: string[];
  readyToApply: boolean;
}

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

export function planPulseDeskImport(raw: unknown): PulseDeskImportPlan {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('PulseDesk export must be a JSON object');
  const input = raw as JsonRecord;
  const errors: string[] = [];
  const warnings: string[] = [];
  if (input.exportVersion !== undefined && input.exportVersion !== 1) errors.push(`Unsupported exportVersion ${String(input.exportVersion)}; expected 1`);

  const included = Object.fromEntries(INCLUDED.map(name => [name, rows(input[name], name, errors)])) as Record<typeof INCLUDED[number], JsonRecord[]>;
  const authority = Object.fromEntries(AUTHORITY.map(name => [name, rows(input[name], name, errors)])) as Record<typeof AUTHORITY[number], JsonRecord[]>;
  const provider = Object.fromEntries(PROVIDER_OR_SENSITIVE.map(name => [name, rows(input[name], name, errors)])) as Record<typeof PROVIDER_OR_SENSITIVE[number], JsonRecord[]>;
  const sourceCounts = Object.fromEntries([...INCLUDED, ...AUTHORITY, ...PROVIDER_OR_SENSITIVE].map(name => [name, (included as any)[name]?.length ?? (authority as any)[name]?.length ?? (provider as any)[name]?.length ?? 0]));

  const ids = new Map<string, Set<string>>();
  const privacyFindings: PulseDeskImportPlan['privacyFindings'] = [];
  for (const table of INCLUDED) {
    const set = new Set<string>();
    included[table].forEach((row, index) => {
      const id = sourceId(row, table, index, errors);
      if (!id) return;
      if (set.has(id)) errors.push(`${table} contains duplicate source id ${id}`);
      set.add(id);
      try { assertNoProhibitedPhi(row, `${table}[${index}]`); }
      catch (error) {
        if (error instanceof PulseDeskServiceDeskError) {
          privacyFindings.push({ sourceType: table, sourceId: id, field: error.field ?? table, code: error.code });
          errors.push(`${table}[${index}] failed prohibited/sensitive field review (${error.code})`);
        } else throw error;
      }
    });
    ids.set(table, set);
  }

  const target: Record<typeof INCLUDED[number], string> = {
    clients: 'directory_organizations', sites: 'directory_sites', contacts: 'directory_contacts',
    departments: 'pulsedesk_departments', queues: 'pulsedesk_queues', teams: 'pulsedesk_teams', teamMembers: 'pulsedesk_team_members',
    ticketOptions: 'pulsedesk_ticket_options', slaPolicies: 'pulsedesk_sla_policies', assets: 'pulsedesk_assets', tickets: 'pulsedesk_requests',
    messages: 'pulsedesk_ticket_messages', assignments: 'pulsedesk_ticket_assignments', slaEvents: 'pulsedesk_sla_events', timeEntries: 'pulsedesk_time_entries',
    vendors: 'directory_organizations', vendorEngagements: 'pulsedesk_vendor_engagements', supplyRequests: 'pulsedesk_supply_requests',
    facilityRequests: 'pulsedesk_facility_requests', knowledgeArticles: 'pulsedesk_knowledge_articles', tags: 'pulsedesk_tags',
    ticketTags: 'pulsedesk_ticket_tags', savedViews: 'pulsedesk_saved_views', notificationPreferences: 'pulsedesk_notification_preferences',
  };
  const mappings: PulseDeskImportPlan['mappings'] = [];
  for (const table of INCLUDED) included[table].forEach((row, index) => {
    const id = sourceId(row, table, index, errors);
    if (id) mappings.push({ sourceType: table, sourceId: id, targetType: target[table], sourceHash: hash(row) });
  });

  let referencesChecked = 0;
  let referencesResolved = 0;
  let referencesMissing = 0;
  const reference = (table: typeof INCLUDED[number], index: number, field: string, targetTable: typeof INCLUDED[number]) => {
    const value = included[table][index]?.[field];
    if (value === undefined || value === null || value === '') return;
    referencesChecked++;
    if (typeof value === 'string' && ids.get(targetTable)!.has(value)) referencesResolved++;
    else { referencesMissing++; errors.push(`${table}[${index}].${field} references a missing ${targetTable} record`); }
  };
  included.sites.forEach((_, i) => reference('sites', i, 'clientId', 'clients'));
  included.contacts.forEach((_, i) => { reference('contacts', i, 'clientId', 'clients'); reference('contacts', i, 'siteId', 'sites'); });
  included.departments.forEach((_, i) => { reference('departments', i, 'clientId', 'clients'); reference('departments', i, 'siteId', 'sites'); });
  included.teams.forEach((_, i) => reference('teams', i, 'queueId', 'queues'));
  included.teamMembers.forEach((_, i) => reference('teamMembers', i, 'teamId', 'teams'));
  included.assets.forEach((_, i) => { reference('assets', i, 'clientId', 'clients'); reference('assets', i, 'siteId', 'sites'); reference('assets', i, 'departmentId', 'departments'); });
  included.tickets.forEach((_, i) => {
    for (const [field, targetTable] of [['clientId', 'clients'], ['siteId', 'sites'], ['contactId', 'contacts'], ['departmentId', 'departments'], ['assetId', 'assets'], ['queueId', 'queues'], ['teamId', 'teams'], ['slaPolicyId', 'slaPolicies']] as const) reference('tickets', i, field, targetTable);
  });
  for (const table of ['messages', 'assignments', 'slaEvents', 'timeEntries', 'vendorEngagements', 'ticketTags'] as const) included[table].forEach((_, i) => reference(table, i, 'ticketId', 'tickets'));
  included.assignments.forEach((_, i) => { reference('assignments', i, 'queueId', 'queues'); reference('assignments', i, 'teamId', 'teams'); });
  included.slaEvents.forEach((_, i) => reference('slaEvents', i, 'slaPolicyId', 'slaPolicies'));
  included.vendorEngagements.forEach((_, i) => reference('vendorEngagements', i, 'vendorId', 'vendors'));
  included.supplyRequests.forEach((_, i) => { reference('supplyRequests', i, 'ticketId', 'tickets'); reference('supplyRequests', i, 'departmentId', 'departments'); });
  included.facilityRequests.forEach((_, i) => { reference('facilityRequests', i, 'ticketId', 'tickets'); reference('facilityRequests', i, 'siteId', 'sites'); reference('facilityRequests', i, 'departmentId', 'departments'); });
  included.ticketTags.forEach((_, i) => reference('ticketTags', i, 'tagId', 'tags'));

  const excludedAuthority = Object.fromEntries(AUTHORITY.map(name => [name, authority[name].length]));
  const excludedProviderOrSensitive = Object.fromEntries(PROVIDER_OR_SENSITIVE.map(name => [name, provider[name].length]));
  if (Object.values(excludedAuthority).some(Number)) warnings.push('Standalone identity, tenants, sessions, entitlements, and billing are excluded; OperatorOS remains authoritative.');
  if (Object.values(excludedProviderOrSensitive).some(Number)) warnings.push('Credentials, connectors, raw email, provider events, and attachment bytes are excluded pending shared-service review.');
  warnings.push('Automated prohibited-field checks are guardrails; a human privacy review is mandatory before any apply design.');

  const plannedTargetCounts: Record<string, number> = {};
  for (const table of INCLUDED) {
    plannedTargetCounts[target[table]] = (plannedTargetCounts[target[table]] ?? 0) + included[table].length;
  }

  return {
    planVersion: 1,
    mode: 'dry-run',
    sourceFingerprint: hash(input),
    sourceCounts,
    plannedTargetCounts,
    excludedAuthority,
    excludedProviderOrSensitive,
    mappings,
    reconciliation: { referencesChecked, referencesResolved, referencesMissing, prohibitedFieldsRejected: privacyFindings.length },
    privacyFindings,
    warnings,
    errors: [...new Set(errors)],
    readyToApply: errors.length === 0,
  };
}
