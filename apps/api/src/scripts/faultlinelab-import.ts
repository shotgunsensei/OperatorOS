import { planFaultlineLabImport } from '../lib/faultlinelab-import.js';

function main() {
  if (!process.argv.slice(2).includes('--dry-run')) {
    throw new Error(
      'Only --dry-run is supported; starter initialization occurs through guarded tenant requests and the ordered OperatorOS release.',
    );
  }
  const plan = planFaultlineLabImport();
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  if (!plan.readyToInitialize) process.exitCode = 2;
}

try {
  main();
} catch (error) {
  console.error(`[faultlinelab-import] ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
