import { planBrandForgeOsImport } from '../lib/brandforgeos-import.js';

function main() {
  if (!process.argv.slice(2).includes('--dry-run')) {
    throw new Error('Only --dry-run is supported because no authorized standalone data export or tenant mapping was supplied.');
  }
  const plan = planBrandForgeOsImport();
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  if (!plan.ready) process.exitCode = 2;
}

try {
  main();
} catch (error) {
  console.error(`[brandforgeos-import] ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
