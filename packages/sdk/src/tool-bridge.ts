/** Dedicated one-time tool fulfillment contract. It grants no hosted SSO access. */
export const TOOL_BRIDGE_ASSERTION_TYPE = 'operatoros-tool-bridge+jwt';
export const TOOL_BRIDGE_MAX_LIFETIME_SECONDS = 60;
export const TOOL_BRIDGE_CLOCK_SKEW_SECONDS = 5;
export const OFFICEEXIT_EDITIONS = ['Technician', 'Professional', 'MSP', 'MSP Pro', 'Consultant'] as const;
export type OfficeExitEdition = (typeof OFFICEEXIT_EDITIONS)[number];
export const OFFICEEXIT_CAPABILITIES = [
  'localAssessment', 'migrationPlanning', 'htmlReporting', 'multiDevice', 'silentDeployment',
  'uploadAssessment', 'publisherRescue', 'whiteLabel', 'deploymentTokens', 'commercialUse',
] as const;
export type OfficeExitCapability = (typeof OFFICEEXIT_CAPABILITIES)[number];

// One current-release product, not a new customer-facing edition or price tier.
// Reuse OfficeExit's existing internal alias whose matrix enables all ten features.
export const OFFICEEXIT_TENANT_PURCHASE_EDITION = 'MSP Pro' as const;
export const OFFICEEXIT_TENANT_LICENSE_TERMS_VERSION = 'officeexit-2026-tenant-v1' as const;
export function createOfficeExitTenantToolGrant(): OfficeExitToolGrant {
  return { edition: OFFICEEXIT_TENANT_PURCHASE_EDITION, coverage: 'entire_tenant',
    capabilities: [...OFFICEEXIT_CAPABILITIES], licenseTermsVersion: OFFICEEXIT_TENANT_LICENSE_TERMS_VERSION };
}

export interface OfficeExitToolGrant {
  edition: OfficeExitEdition;
  coverage: 'entire_tenant';
  capabilities: OfficeExitCapability[];
  licenseTermsVersion: string;
}
export interface OfficeExitPurchaseSync {
  contractVersion: 1;
  moduleSlug: 'officeexit';
  purchaseKind: 'one_time';
  operatorosTenantId: string;
  purchaseId: string;
  revision: number;
  state: 'active' | 'refunded' | 'disputed' | 'cancelled';
  grant: OfficeExitToolGrant | null;
}
export interface OfficeExitMappingLink {
  contractVersion: 1;
  moduleSlug: 'officeexit';
  operatorosTenantId: string;
  operatorosUserId: string;
  officeexitOrganizationId: string;
  officeexitUserId: string;
}
export interface OfficeExitMappingInspect {
  contractVersion: 1;
  moduleSlug: 'officeexit';
  operatorosTenantId: string;
  operatorosUserId: string;
  requestId: string;
}
export type ToolBridgeOperation = 'officeexit.purchase.sync' | 'officeexit.mapping.link' | 'officeexit.mapping.inspect';
export type ToolBridgeData = OfficeExitPurchaseSync | OfficeExitMappingLink | OfficeExitMappingInspect;
export interface ToolBridgeAssertionClaims {
  iss: string;
  aud: string;
  iat: number;
  nbf: number;
  exp: number;
  jti: string;
  op: ToolBridgeOperation;
  data: ToolBridgeData;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const centralIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,35}$/;
export function isToolBridgeUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value);
}
export function isToolBridgeCentralId(value: unknown): value is string {
  return typeof value === 'string' && centralIdPattern.test(value);
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
/** This vocabulary is existing OfficeExit behavior, not new pricing or allowances. */
export function officeExitCapabilitiesForEdition(edition: OfficeExitEdition): OfficeExitCapability[] {
  if (edition === 'Technician') return ['localAssessment'];
  if (edition === 'Professional') return ['localAssessment', 'migrationPlanning', 'htmlReporting', 'multiDevice'];
  if (edition === 'MSP') return OFFICEEXIT_CAPABILITIES.filter(value => value !== 'publisherRescue');
  return [...OFFICEEXIT_CAPABILITIES];
}
export function isOfficeExitToolGrant(value: unknown): value is OfficeExitToolGrant {
  if (!record(value) || !exactKeys(value, ['edition', 'coverage', 'capabilities', 'licenseTermsVersion'])) return false;
  if (value.edition !== OFFICEEXIT_TENANT_PURCHASE_EDITION
    || value.coverage !== 'entire_tenant'
    || value.licenseTermsVersion !== OFFICEEXIT_TENANT_LICENSE_TERMS_VERSION
    || !Array.isArray(value.capabilities)) return false;
  const expected = OFFICEEXIT_CAPABILITIES;
  return value.capabilities.length === expected.length && new Set(value.capabilities).size === expected.length
    && expected.every(capability => (value.capabilities as unknown[]).includes(capability));
}
export function isToolBridgeData(operation: ToolBridgeOperation, value: unknown): value is ToolBridgeData {
  if (!['officeexit.purchase.sync', 'officeexit.mapping.link', 'officeexit.mapping.inspect'].includes(operation)) return false;
  if (!record(value) || value.contractVersion !== 1 || value.moduleSlug !== 'officeexit'
    || !isToolBridgeCentralId(value.operatorosTenantId)) return false;
  if (operation === 'officeexit.mapping.inspect') {
    return exactKeys(value, ['contractVersion', 'moduleSlug', 'operatorosTenantId', 'operatorosUserId', 'requestId'])
      && isToolBridgeCentralId(value.operatorosUserId) && isToolBridgeUuid(value.requestId);
  }
  if (operation === 'officeexit.mapping.link') {
    return exactKeys(value, ['contractVersion', 'moduleSlug', 'operatorosTenantId', 'operatorosUserId', 'officeexitOrganizationId', 'officeexitUserId'])
      && isToolBridgeCentralId(value.operatorosUserId) && isToolBridgeUuid(value.officeexitOrganizationId)
      && isToolBridgeUuid(value.officeexitUserId);
  }
  return exactKeys(value, ['contractVersion', 'moduleSlug', 'purchaseKind', 'operatorosTenantId', 'purchaseId', 'revision', 'state', 'grant'])
    && value.purchaseKind === 'one_time' && isToolBridgeUuid(value.purchaseId)
    && typeof value.revision === 'number' && Number.isSafeInteger(value.revision) && value.revision > 0
    && (value.state === 'active' ? isOfficeExitToolGrant(value.grant)
      : typeof value.state === 'string' && ['refunded', 'disputed', 'cancelled'].includes(value.state) && value.grant === null);
}
