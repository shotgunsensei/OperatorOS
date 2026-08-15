import { getStripeCatalogClient, getStripeRuntimeMode } from '../lib/billing-service.js';
import { listTorqueShedCatalogMappings } from '../lib/torqueshed-credit-catalog.js';
import { provisionTorqueShedStripeCatalog } from '../lib/torqueshed-stripe-catalog-provisioner.js';

type Operation = 'dry-run' | 'apply' | 'validate';

export function parseTorqueShedCatalogArgs(args: string[], env: NodeJS.ProcessEnv) {
  const modeIndex = args.indexOf('--mode');
  const mode = modeIndex >= 0 ? args[modeIndex + 1] : '';
  if (mode !== 'test' && mode !== 'live') throw new Error('--mode must be exactly test or live');
  const operations = [
    args.includes('--dry-run') && 'dry-run',
    args.includes('--apply') && 'apply',
    args.includes('--validate') && 'validate',
  ].filter(Boolean) as Operation[];
  if (operations.length !== 1) throw new Error('Choose exactly one of --dry-run, --apply, or --validate');
  if (env.STRIPE_MODE !== mode) throw new Error(`Requested mode ${mode} does not match STRIPE_MODE`);
  if (!env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is required');
  if (operations[0] === 'apply' && !env.DATABASE_URL) throw new Error('DATABASE_URL is required for catalog apply');
  if (mode === 'live' && operations[0] === 'apply') {
    if (!args.includes('--confirm-live') || env.TORQUESHED_STRIPE_LIVE_APPLY_CONFIRM !== 'CREATE_LIVE_TORQUESHED_CATALOG') {
      throw new Error('Live apply requires --confirm-live and TORQUESHED_STRIPE_LIVE_APPLY_CONFIRM=CREATE_LIVE_TORQUESHED_CATALOG');
    }
  }
  return { mode, operation: operations[0]! } as const;
}

export async function runTorqueShedCatalogCli(
  args = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  const parsed = parseTorqueShedCatalogArgs(args, env);
  const runtimeMode = getStripeRuntimeMode();
  if (runtimeMode !== parsed.mode) throw new Error(`Stripe adapter mode ${runtimeMode} does not match requested mode ${parsed.mode}`);
  const report = await provisionTorqueShedStripeCatalog({
    client: getStripeCatalogClient(),
    mode: parsed.mode,
    operation: parsed.operation,
  });
  if (env.STRIPE_EXPECTED_ACCOUNT_ID && report.accountId !== env.STRIPE_EXPECTED_ACCOUNT_ID) {
    throw Object.assign(new Error('Resolved Stripe account does not match STRIPE_EXPECTED_ACCOUNT_ID'), {
      code: 'STRIPE_ACCOUNT_MISMATCH',
    });
  }
  let databaseMappings: unknown = 'not-read';
  let databaseMappingMatch: boolean | null = null;
  if (parsed.operation === 'validate') {
    if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required for catalog validation');
    const rows = await listTorqueShedCatalogMappings(parsed.mode);
    databaseMappings = rows.map((row) => ({
      packageKey: row.packageKey,
      catalogVersion: row.catalogVersion,
      productId: row.stripeProductId,
      priceId: row.stripePriceId,
      active: row.active,
      validationStatus: row.validationStatus,
      validatedAt: row.validatedAt,
      driftCode: row.driftCode,
    }));
    databaseMappingMatch = report.items.every((item) => rows.some((row) =>
      row.packageKey === item.packageKey
      && row.stripeProductId === item.productId
      && row.stripePriceId === item.priceId
      && row.active
      && row.validationStatus === 'validated'
      && !row.driftCode));
  }
  const output = {
    ...report,
    databaseMappings,
    databaseMappingMatch,
    safeToEnablePurchases: report.safeToEnablePurchases && databaseMappingMatch !== false,
    secretValuesIncluded: false,
  };
  console.log(JSON.stringify(output, null, 2));
  return output.safeToEnablePurchases || parsed.operation === 'dry-run' ? 0 : 2;
}

if (process.argv[1]?.endsWith('torqueshed-stripe-catalog.ts') || process.argv[1]?.endsWith('torqueshed-stripe-catalog.js')) {
  runTorqueShedCatalogCli().then(
    (code) => { process.exitCode = code; },
    (error) => {
      console.error(JSON.stringify({
        contractVersion: 1,
        code: (error as { code?: string })?.code ?? 'TORQUESHED_STRIPE_CATALOG_FAILED',
        error: error instanceof Error ? error.message : 'Catalog operation failed',
        secretValuesIncluded: false,
      }, null, 2));
      process.exitCode = 1;
    },
  );
}
