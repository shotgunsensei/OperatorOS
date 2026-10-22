/** Independent desktop tools are deliberately separate from Application Stacks. */
export type ToolModuleSlug = 'officeexit' | 'vendortrust365';

export interface ToolModuleCatalogEntry {
  readonly slug: ToolModuleSlug;
  readonly name: string;
  readonly runtime: 'windows_local';
  readonly purchaseKind: 'one_time';
  readonly requiresPaidBase: false;
  readonly automaticRenewal: false;
  readonly recurringCharges: false;
  readonly updatesAndSupportCoverage: 'not_bundled';
  readonly price: Readonly<{ amountMinor: 9900; currency: 'usd' }>;
  readonly licenseUnit: 'tenant';
  readonly licenseAllowance: 1;
  readonly coverage: 'entire_tenant';
  readonly futureMajorVersionCoverage: 'undecided';
  readonly editionCompatibility: 'pending_acceptance';
  readonly salesEnabled: false;
  readonly downloadsAvailable: false;
  readonly releaseStatus: 'not_accepted';
}

// Approved terms: USD $99 once per entire purchasing tenant. This is no
// per-user, device or site limit and promises no future major-version policy.
// Provider identifiers, activation secrets and private artifact URLs stay server-side.
export const TOOL_MODULE_CATALOG: readonly ToolModuleCatalogEntry[] = Object.freeze([
  Object.freeze({
    slug: 'officeexit', name: 'OfficeExit 2026', runtime: 'windows_local',
    purchaseKind: 'one_time', requiresPaidBase: false, automaticRenewal: false,
    recurringCharges: false, updatesAndSupportCoverage: 'not_bundled',
    price: Object.freeze({ amountMinor: 9900, currency: 'usd' }), licenseUnit: 'tenant', licenseAllowance: 1,
    coverage: 'entire_tenant', futureMajorVersionCoverage: 'undecided',
    editionCompatibility: 'pending_acceptance', salesEnabled: false,
    downloadsAvailable: false, releaseStatus: 'not_accepted',
  }),
  Object.freeze({
    slug: 'vendortrust365', name: 'VendorTrust365', runtime: 'windows_local',
    purchaseKind: 'one_time', requiresPaidBase: false, automaticRenewal: false,
    recurringCharges: false, updatesAndSupportCoverage: 'not_bundled',
    price: Object.freeze({ amountMinor: 9900, currency: 'usd' }), licenseUnit: 'tenant', licenseAllowance: 1,
    coverage: 'entire_tenant', futureMajorVersionCoverage: 'undecided',
    editionCompatibility: 'pending_acceptance', salesEnabled: false,
    downloadsAvailable: false, releaseStatus: 'not_accepted',
  }),
]);

export const TOOL_PURCHASE_PENDING_DECISIONS = Object.freeze([
  'refund_rules',
  'edition_release_compatibility', 'upgrade_eligibility',
  'device_and_offline_behavior', 'accepted_private_distribution',
] as const);

export function isIndependentToolModuleSlug(value: string): value is ToolModuleSlug {
  return value === 'officeexit' || value === 'vendortrust365';
}

export type ToolPurchaseEligibilityReason =
  | 'eligible' | 'user_inactive' | 'tenant_inactive' | 'not_a_member' | 'owner_required';

/** Readiness only. A positive eligibility decision never proves a purchase. */
export interface ToolModuleCatalogResponse {
  contractVersion: 1;
  tenantId: string;
  purchaseEligibility: { eligible: boolean; reason: ToolPurchaseEligibilityReason };
  checkoutAvailable: false;
  pendingDecisions: (typeof TOOL_PURCHASE_PENDING_DECISIONS)[number][];
  tools: ToolModuleCatalogEntry[];
}
