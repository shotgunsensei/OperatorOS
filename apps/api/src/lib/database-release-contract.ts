export const DATABASE_RELEASE_CONTRACT = Object.freeze({
  contractVersion: 1,
  mode: 'idempotent-apply',
  destructive: false,
  rollback: 'restore-to-new-database-and-switch-traffic',
});

export const DATABASE_RELEASE_STEPS = Object.freeze([
  { id: 'base_tables', kind: 'ddl' },
  { id: 'extended_tables', kind: 'ddl' },
  { id: 'saas_tables', kind: 'ddl' },
  { id: 'tenant_tables', kind: 'ddl' },
  { id: 'directory_tables', kind: 'ddl' },
  { id: 'module_tables', kind: 'ddl' },
  { id: 'tradeflowkit_tables', kind: 'ddl' },
  { id: 'techdeck_tables', kind: 'ddl' },
  { id: 'pulsedesk_tables', kind: 'ddl' },
  { id: 'shared_service_tables', kind: 'ddl' },
  { id: 'plans_and_admin', kind: 'seed' },
  { id: 'launch_fix_pre_seed', kind: 'repair' },
  { id: 'platform_components', kind: 'seed' },
  { id: 'module_catalog', kind: 'seed' },
  { id: 'personal_tenant_backfill', kind: 'backfill' },
  { id: 'super_admin_bootstrap', kind: 'backfill' },
  { id: 'demo_tenant_seed', kind: 'seed' },
  { id: 'launch_fix_post_seed', kind: 'repair' },
  { id: 'free_account_app_backfill', kind: 'backfill' },
] as const);
