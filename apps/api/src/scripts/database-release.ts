import {
  DATABASE_RELEASE_CONTRACT,
  DATABASE_RELEASE_STEPS,
} from '../lib/database-release-contract.js';

function parseMode(args: string[]): 'plan' | 'apply' {
  if (args.length !== 1 || !['--plan', '--apply'].includes(args[0])) {
    throw new Error(`Unknown database release option: ${args.join(' ') || '<missing>'}. Use --plan or --apply.`);
  }
  return args[0] === '--plan' ? 'plan' : 'apply';
}

export async function runDatabaseReleaseCli(
  args = process.argv.slice(2),
  env: Record<string, string | undefined> = process.env,
): Promise<number> {
  const mode = parseMode(args);
  if (mode === 'plan') {
    console.log(JSON.stringify({ contract: DATABASE_RELEASE_CONTRACT, steps: DATABASE_RELEASE_STEPS }, null, 2));
    return 0;
  }

  if (!env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is required for --apply');
  }
  if (env.OPERATOROS_DATABASE_RELEASE_MODE !== 'apply') {
    throw new Error('OPERATOROS_DATABASE_RELEASE_MODE must equal apply for --apply');
  }

  const startedAt = Date.now();
  const { applyOperatorOSDatabaseRelease } = await import('../lib/database-release.js');
  await applyOperatorOSDatabaseRelease(({ phase, step }) => {
    console.info(`[database-release] ${phase} ${step.id} (${step.kind})`);
  });
  console.info(`[database-release] verified in ${Date.now() - startedAt}ms`);
  return 0;
}

if (process.argv[1]?.endsWith('database-release.ts') || process.argv[1]?.endsWith('database-release.js')) {
  runDatabaseReleaseCli().then(
    code => { process.exitCode = code; },
    error => {
      console.error(`[database-release] failed: ${error instanceof Error ? error.message : error}`);
      process.exitCode = 1;
    },
  );
}
