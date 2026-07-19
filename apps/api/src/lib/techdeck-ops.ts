import { isIP } from 'node:net';

export class TechDeckOpsValidationError extends Error {
  constructor(public code: string, public field?: string) {
    super(code);
  }
}

export const TECHDECK_ASSET_TYPES = new Set([
  'endpoint', 'server', 'workstation', 'network', 'network_device', 'firewall', 'switch',
  'access_point', 'printer', 'mobile', 'application', 'domain', 'dns_record', 'dhcp_scope',
  'vlan', 'subnet', 'ip_address', 'public_ip', 'isp', 'circuit', 'vendor', 'license',
  'certificate', 'warranty', 'port_mapping', 'configuration_item', 'credential_reference', 'other',
]);
export const TECHDECK_ASSET_HEALTH = new Set(['unknown', 'healthy', 'warning', 'critical', 'offline']);
export const TECHDECK_ASSET_STATUS = new Set(['active', 'inactive', 'planned', 'retired']);
export const TECHDECK_RELATIONSHIP_TYPES = new Set(['depends_on', 'connects_to', 'hosts', 'runs', 'protects', 'routes_to', 'assigned_to', 'documents', 'other']);
export const TECHDECK_DOCUMENT_TYPES = new Set(['documentation', 'runbook', 'knowledge_base', 'procedure', 'network_diagram', 'configuration_standard']);
export const TECHDECK_DOCUMENT_ROLES = new Set(['member', 'admin', 'owner']);
export const TECHDECK_EVIDENCE_TYPES = new Set(['observation', 'configuration_snapshot', 'test_result', 'photo', 'document', 'other']);
export const TECHDECK_REPORT_TYPES = new Set(['asset_inventory', 'network_inventory', 'lifecycle', 'ticket_summary', 'evidence_register', 'time_summary']);
const RUNBOOK_PLATFORMS = new Set(['powershell', 'bash', 'network', 'generic']);
const RUNBOOK_RISK = new Set(['low', 'medium', 'high']);
const SECRET_FIELD = /(password|passphrase|secret|token|private.?key|api.?key|credential.?value|connection.?string|recovery.?code)/i;

export function techDeckObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TechDeckOpsValidationError('BODY_INVALID');
  return raw as Record<string, unknown>;
}

export function rejectTechDeckServerOwned(body: Record<string, unknown>, fields: readonly string[]) {
  for (const field of fields) if (field in body) throw new TechDeckOpsValidationError('SERVER_OWNED_FIELD', field);
}

export function rejectSecretShapedFields(value: unknown, path = 'details'): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectSecretShapedFields(entry, `${path}.${index}`));
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const fieldPath = `${path}.${key}`;
    if (SECRET_FIELD.test(key)) throw new TechDeckOpsValidationError('SECRET_VALUE_FORBIDDEN', fieldPath);
    rejectSecretShapedFields(entry, fieldPath);
  }
}

export function techDeckText(value: unknown, field: string, max: number, options: { required?: boolean; nullable?: boolean } = {}): string | null | undefined {
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
  const normalized = value.replace(/\u0000/g, '').trim();
  if (!normalized && options.required) throw new TechDeckOpsValidationError('FIELD_REQUIRED', field);
  if (normalized.length > max) throw new TechDeckOpsValidationError('FIELD_TOO_LONG', field);
  return normalized || (options.nullable ? null : undefined);
}

export function techDeckEnum(value: unknown, field: string, allowed: Set<string>, fallback?: string): string {
  const normalized = value === undefined ? fallback : value;
  if (typeof normalized !== 'string' || !allowed.has(normalized)) throw new TechDeckOpsValidationError('FIELD_INVALID', field);
  return normalized;
}

export function techDeckDate(value: unknown, field: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw new TechDeckOpsValidationError('DATE_INVALID', field);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new TechDeckOpsValidationError('DATE_INVALID', field);
  return parsed;
}

export function parseTechDeckVersion(raw: unknown) {
  const value = techDeckObject(raw).expectedVersion;
  if (!Number.isInteger(value) || (value as number) < 1) throw new TechDeckOpsValidationError('EXPECTED_VERSION_REQUIRED', 'expectedVersion');
  return { expectedVersion: value as number };
}

function nullableIp(value: unknown, field: string): string | null {
  const result = techDeckText(value, field, 64, { nullable: true }) ?? null;
  if (result && isIP(result) === 0) throw new TechDeckOpsValidationError('IP_ADDRESS_INVALID', field);
  return result;
}

function nullableCidr(value: unknown, field: string): string | null {
  const result = techDeckText(value, field, 80, { nullable: true }) ?? null;
  if (!result) return null;
  const [address, prefix, ...extra] = result.split('/');
  const family = isIP(address || '');
  const prefixNumber = Number(prefix);
  if (extra.length || !family || !Number.isInteger(prefixNumber) || prefixNumber < 0 || prefixNumber > (family === 4 ? 32 : 128)) {
    throw new TechDeckOpsValidationError('CIDR_INVALID', field);
  }
  return result;
}

function nullableMac(value: unknown, field: string): string | null {
  const result = techDeckText(value, field, 32, { nullable: true }) ?? null;
  if (result && !/^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(result)) throw new TechDeckOpsValidationError('MAC_ADDRESS_INVALID', field);
  return result?.toLowerCase() ?? null;
}

function stringArray(value: unknown, field: string, maxItems = 30): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maxItems) throw new TechDeckOpsValidationError('FIELD_INVALID', field);
  const result = value.map((entry, index) => techDeckText(entry, `${field}.${index}`, 160, { required: true })!);
  return [...new Set(result)];
}

function details(value: unknown): Record<string, string | number | boolean | null> {
  if (value === undefined || value === null) return {};
  const result = techDeckObject(value);
  rejectSecretShapedFields(result);
  const entries = Object.entries(result);
  if (entries.length > 50) throw new TechDeckOpsValidationError('FIELD_INVALID', 'details');
  for (const [key, entry] of entries) {
    if (key.length > 100 || (entry !== null && !['string', 'number', 'boolean'].includes(typeof entry))) {
      throw new TechDeckOpsValidationError('FIELD_INVALID', `details.${key}`);
    }
    if (typeof entry === 'string' && entry.length > 1_000) throw new TechDeckOpsValidationError('FIELD_TOO_LONG', `details.${key}`);
  }
  return result as Record<string, string | number | boolean | null>;
}

function externalVaultReference(value: unknown): string | null {
  const result = techDeckText(value, 'externalVaultReference', 500, { nullable: true }) ?? null;
  if (!result) return null;
  if (/^vault:\/\/[A-Za-z0-9._~!$&'()*+,;=:@/-]+$/.test(result)) return result;
  try {
    const url = new URL(result);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error();
    return result;
  } catch {
    throw new TechDeckOpsValidationError('VAULT_REFERENCE_INVALID', 'externalVaultReference');
  }
}

function vlan(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 4094) throw new TechDeckOpsValidationError('VLAN_INVALID', 'vlanNumber');
  return value as number;
}

function configurationFields(body: Record<string, unknown>) {
  rejectSecretShapedFields(body, 'configurationItem');
  const dnsServers = stringArray(body.dnsServers, 'dnsServers', 12);
  dnsServers.forEach((address, index) => { if (!isIP(address)) throw new TechDeckOpsValidationError('IP_ADDRESS_INVALID', `dnsServers.${index}`); });
  return {
    directoryOrganizationId: techDeckText(body.directoryOrganizationId, 'directoryOrganizationId', 36, { nullable: true }) ?? null,
    directorySiteId: techDeckText(body.directorySiteId, 'directorySiteId', 36, { nullable: true }) ?? null,
    name: techDeckText(body.name, 'name', 160, { required: true })!,
    type: techDeckEnum(body.type, 'type', TECHDECK_ASSET_TYPES, 'endpoint'),
    status: techDeckEnum(body.status, 'status', TECHDECK_ASSET_STATUS, 'active'),
    hostname: techDeckText(body.hostname, 'hostname', 255, { nullable: true }) ?? null,
    ipAddress: nullableIp(body.ipAddress, 'ipAddress'),
    operatingSystem: techDeckText(body.operatingSystem, 'operatingSystem', 160, { nullable: true }) ?? null,
    vendor: techDeckText(body.vendor, 'vendor', 160, { nullable: true }) ?? null,
    product: techDeckText(body.product, 'product', 160, { nullable: true }) ?? null,
    model: techDeckText(body.model, 'model', 160, { nullable: true }) ?? null,
    serialNumber: techDeckText(body.serialNumber, 'serialNumber', 160, { nullable: true }) ?? null,
    macAddress: nullableMac(body.macAddress, 'macAddress'),
    externalVaultReference: externalVaultReference(body.externalVaultReference),
    vlanNumber: vlan(body.vlanNumber),
    cidr: nullableCidr(body.cidr, 'cidr'),
    gateway: nullableIp(body.gateway, 'gateway'),
    dhcpStart: nullableIp(body.dhcpStart, 'dhcpStart'),
    dhcpEnd: nullableIp(body.dhcpEnd, 'dhcpEnd'),
    dnsServers,
    health: techDeckEnum(body.health, 'health', TECHDECK_ASSET_HEALTH, 'unknown'),
    lastSeenAt: techDeckDate(body.lastSeenAt, 'lastSeenAt') ?? null,
    expirationDate: techDeckDate(body.expirationDate, 'expirationDate') ?? null,
    renewalDate: techDeckDate(body.renewalDate, 'renewalDate') ?? null,
    warrantyEndDate: techDeckDate(body.warrantyEndDate, 'warrantyEndDate') ?? null,
    details: details(body.details),
    tags: stringArray(body.tags, 'tags'),
    notes: techDeckText(body.notes, 'notes', 10_000, { nullable: true }) ?? null,
  };
}

export function parseTechDeckAssetCreate(raw: unknown) {
  const body = techDeckObject(raw);
  rejectTechDeckServerOwned(body, ['id', 'tenantId', 'createdByUserId', 'version', 'createdAt', 'updatedAt', 'deletedAt']);
  return configurationFields(body);
}

export function parseTechDeckAssetPatch(raw: unknown) {
  const body = techDeckObject(raw);
  rejectTechDeckServerOwned(body, ['id', 'tenantId', 'createdByUserId', 'createdAt', 'updatedAt', 'deletedAt']);
  const parsed = configurationFields({ ...body, name: body.name ?? '__unchanged__' });
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(parsed) as Array<keyof typeof parsed>) if (key in body) patch[key] = parsed[key];
  if (Object.keys(patch).length === 0) throw new TechDeckOpsValidationError('PATCH_EMPTY');
  return { patch, expectedVersion: parseTechDeckVersion(body).expectedVersion };
}

export function sanitizeTechDeckContent(value: unknown, field = 'content', max = 100_000): string {
  const content = techDeckText(value, field, max, { required: true })!;
  return content
    .replace(/<(script|iframe|object|embed)[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|iframe|object|embed)[^>]*\/?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, 'blocked:');
}

export function techDeckSlug(value: unknown, fallbackTitle?: string): string {
  const source = techDeckText(value, 'slug', 160, { nullable: true }) || fallbackTitle || '';
  const slug = source.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120);
  if (!slug) throw new TechDeckOpsValidationError('FIELD_INVALID', 'slug');
  return slug;
}

export function parseTechDeckRunbookCreate(raw: unknown) {
  const body = techDeckObject(raw);
  rejectTechDeckServerOwned(body, ['id', 'tenantId', 'createdByUserId', 'approvedByUserId', 'approvedAt', 'status', 'version', 'createdAt', 'updatedAt', 'deletedAt']);
  return {
    name: techDeckText(body.name, 'name', 160, { required: true })!,
    platform: techDeckEnum(body.platform, 'platform', RUNBOOK_PLATFORMS),
    purpose: techDeckText(body.purpose, 'purpose', 1_000, { required: true })!,
    scriptText: sanitizeTechDeckContent(body.scriptText, 'scriptText', 50_000),
    riskLevel: techDeckEnum(body.riskLevel, 'riskLevel', RUNBOOK_RISK, 'medium'),
  };
}
