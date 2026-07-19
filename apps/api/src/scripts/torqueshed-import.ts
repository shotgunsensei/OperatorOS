import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { planTorqueShedImport } from '../lib/torqueshed-import.js';

function inputPath(args: string[]): string {
  if (!args.includes('--dry-run'))
    throw new Error(
      'Only --dry-run is supported; apply requires a separately approved cutover and backup.',
    );
  const index = args.indexOf('--input');
  if (index < 0 || !args[index + 1])
    throw new Error('Usage: --dry-run --input <torqueshed-export.json>');
  return resolve(args[index + 1]);
}
async function main() {
  const raw = JSON.parse(await readFile(inputPath(process.argv.slice(2)), 'utf8'));
  const plan = planTorqueShedImport(raw);
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  if (!plan.readyToApply) process.exitCode = 2;
}
main().catch((error) => {
  console.error(`[torqueshed-import] ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
