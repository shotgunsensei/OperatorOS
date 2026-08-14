import { planNinjaPoolHallImport } from '../lib/ninja-pool-hall-import.js';

function main() {
  if (!process.argv.slice(2).includes('--dry-run')) {
    throw new Error('Only --dry-run is supported because the source has no persistent records to apply.');
  }
  const plan = planNinjaPoolHallImport();
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  if (!plan.ready) process.exitCode = 2;
}

try {
  main();
} catch (error) {
  console.error(`[ninja-pool-hall-import] ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
