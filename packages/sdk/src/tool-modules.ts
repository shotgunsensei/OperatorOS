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
  readonly updatesAndSupportCoverage: 'pending_acceptance';
  readonly price: null;
  readonly licenseAllowance: null;
  readonly editionCompatibility: 'pending_acceptance';
  readonly salesEnabled: false;
  readonly downloadsAvailable: false;
  readonly releaseStatus: 'not_accepted';
}

// A null price/allowance means undecided, never free or unlimited. No Stripe
// identifiers, customer repository URLs, activation secrets or artifact URLs.
export const TOOL_MODULE_CATALOG: readonly ToolModuleCatalogEntry[] = Object.freeze([
  Object.freeze({
    slug: 'officeexit', name: 'OfficeExit 2026', runtime: 'windows_local',
    purchaseKind: 'one_time', requiresPaidBase: false, automaticRenewal: false,
    recurringCharges: false, updatesAndSupportCoverage: 'pending_acceptance',
    price: null, licenseAllowance: null,
    editionCompatibility: 'pending_acceptance', salesEnabled: false,
    downloadsAvailable: false, releaseStatus: 'not_accepted',
  }),
  Object.freeze({
    slug: 'vendortrust365', name: 'VendorTrust365', runtime: 'windows_local',
    purchaseKind: 'one_time', requiresPaidBase: false, automaticRenewal: false,
    recurringCharges: false, updatesAndSupportCoverage: 'pending_acceptance',
    price: null, licenseAllowance: null,
    editionCompatibility: 'pending_acceptance', salesEnabled: false,
    downloadsAvailable: false, releaseStatus: 'not_accepted',
  }),
]);

export const TOOL_PURCHASE_PENDING_DECISIONS = Object.freeze([
  'price_and_currency', 'license_unit_and_allowance', 'refund_rules',
  'edition_release_compatibility', 'upgrade_eligibility', 'updates_and_support_coverage',
  'device_and_offline_behavior', 'accepted_private_distribution',
] as const);

export function isIndependentToolModuleSlug(value: string): value is ToolModuleSlug {
  return value === 'officeexit' || value === 'vendortrust365';
}
