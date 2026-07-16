import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { ensureBaseTables, ensureExtendedTables } from './db-init.js';
import {
  backfillFreeAccountAppsForAllTenants,
  backfillPersonalTenants,
  bootstrapSuperAdmin,
  ensureModuleShellTables,
  ensureSaasTables,
  ensureTenantTables,
  seedDemoCoTenant,
  seedModules,
  seedPlansAndAdmin,
  seedPlatformComponents,
} from './saas-db-init.js';
import { launchFixPostSeed, launchFixPreSeed } from './launch-fix-init.js';
import {
  DATABASE_RELEASE_CONTRACT,
  DATABASE_RELEASE_STEPS,
} from './database-release-contract.js';

export { DATABASE_RELEASE_CONTRACT, DATABASE_RELEASE_STEPS };

type DatabaseReleaseStep = (typeof DATABASE_RELEASE_STEPS)[number];
type StepReporter = (event: { phase: 'start' | 'complete'; step: DatabaseReleaseStep }) => void;

const OPERATIONS: Readonly<Record<DatabaseReleaseStep['id'], () => Promise<unknown>>> = {
  base_tables: ensureBaseTables,
  extended_tables: ensureExtendedTables,
  saas_tables: ensureSaasTables,
  tenant_tables: ensureTenantTables,
  module_tables: ensureModuleShellTables,
  plans_and_admin: seedPlansAndAdmin,
  launch_fix_pre_seed: launchFixPreSeed,
  platform_components: seedPlatformComponents,
  module_catalog: seedModules,
  personal_tenant_backfill: backfillPersonalTenants,
  super_admin_bootstrap: bootstrapSuperAdmin,
  demo_tenant_seed: seedDemoCoTenant,
  launch_fix_post_seed: launchFixPostSeed,
  free_account_app_backfill: backfillFreeAccountAppsForAllTenants,
};

export async function verifyOperatorOSDatabaseRelease(): Promise<void> {
  const result = await db.execute(sql`
    SELECT
      to_regclass('public.users') IS NOT NULL AS users,
      to_regclass('public.tenants') IS NOT NULL AS tenants,
      to_regclass('public.modules') IS NOT NULL AS modules,
      to_regclass('public.sso_handoff_tokens') IS NOT NULL AS sso_handoff_tokens
  `);
  const row = result.rows[0] as Record<string, boolean> | undefined;
  const missing = Object.entries(row ?? {})
    .filter(([, present]) => present !== true)
    .map(([name]) => name);
  if (!row || missing.length > 0) {
    throw new Error(`OperatorOS database release verification failed: missing ${missing.join(', ') || 'required tables'}`);
  }
}

export async function applyOperatorOSDatabaseRelease(report: StepReporter = () => {}): Promise<void> {
  for (const step of DATABASE_RELEASE_STEPS) {
    report({ phase: 'start', step });
    await OPERATIONS[step.id]();
    report({ phase: 'complete', step });
  }
  await verifyOperatorOSDatabaseRelease();
}
