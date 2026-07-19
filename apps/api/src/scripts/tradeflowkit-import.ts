import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { planTradeFlowKitImport } from '../lib/tradeflowkit-import.js';

function inputPath(args: string[]): string {
  if (!args.includes('--dry-run')) throw new Error('Only --dry-run is supported; database apply requires a separately approved cutover window.');
  const index = args.indexOf('--input');
  if (index < 0 || !args[index + 1]) throw new Error('Usage: --dry-run --input <standalone-export.json>');
  return resolve(args[index + 1]);
}

async function main() {
  const path = inputPath(process.argv.slice(2));
  const raw = JSON.parse(await readFile(path, 'utf8'));
  const plan = planTradeFlowKitImport(raw);
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  if (!plan.readyToApply) process.exitCode = 2;
}

main().catch(error => {
  console.error(`[tradeflowkit-import] ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
