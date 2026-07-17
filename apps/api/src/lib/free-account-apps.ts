/**
 * Tenant-module policy for apps included with every OperatorOS account.
 *
 * This file intentionally has no database imports so the reconciliation
 * rules can be unit-tested without a live PostgreSQL instance.
 */

export const FREE_ACCOUNT_APP_SLUGS = [
  'torqueshed',
  'faultlinelab',
  'ninja-pool-hall',
] as const;

export const FREE_ACCOUNT_METADATA_PATCH = Object.freeze({
  freeWithAnyAccount: true,
} as const);

export const NEW_FREE_ACCOUNT_GRANT_METADATA = Object.freeze({
  grantedBy: 'free_account',
  ...FREE_ACCOUNT_METADATA_PATCH,
} as const);

export interface PlanReconciledTenantModule {
  moduleId: string;
  source: string;
  status: string;
  metadata: Record<string, unknown> | null;
}

export function isFreeWithAnyAccountTenantModule(
  tenantModule: Pick<PlanReconciledTenantModule, 'metadata'>,
): boolean {
  return tenantModule.metadata?.freeWithAnyAccount === true;
}

/**
 * Rows created before the free-account policy have no provenance marker.
 * They receive one deterministic upgrade that restores the promised free
 * grant. Once marked, later tenant-admin lifecycle changes are preserved.
 */
export function shouldUpgradeLegacyFreeAccountGrant(
  tenantModule: Pick<PlanReconciledTenantModule, 'metadata'>,
): boolean {
  return !isFreeWithAnyAccountTenantModule(tenantModule);
}

/**
 * Split only plan-managed rows into the two reconciliation actions.
 *
 * Free-with-any-account rows deliberately participate in neither action:
 * subscription loss must not disable them, while a later plan upgrade must
 * not re-enable one that a tenant administrator explicitly disabled.
 */
export function selectPlanModuleReconciliation<T extends PlanReconciledTenantModule>(
  tenantModules: readonly T[],
  includedModuleIds: ReadonlySet<string>,
): { dropped: T[]; reEnabled: T[] } {
  const planManaged = tenantModules.filter(tenantModule =>
    tenantModule.source === 'included' &&
    !isFreeWithAnyAccountTenantModule(tenantModule),
  );

  return {
    dropped: planManaged.filter(tenantModule =>
      tenantModule.status === 'enabled' &&
      !includedModuleIds.has(tenantModule.moduleId),
    ),
    reEnabled: planManaged.filter(tenantModule =>
      tenantModule.status === 'disabled' &&
      includedModuleIds.has(tenantModule.moduleId),
    ),
  };
}
