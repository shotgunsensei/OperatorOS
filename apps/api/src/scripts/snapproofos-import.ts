import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSnapProofMigrationPlan } from '../lib/snapproofos-import.js';

const args = process.argv.slice(2);
if (!args.includes('--dry-run')) {
  throw new Error('SnapProofOS import supports --dry-run only; apply requires a separately approved cutover.');
}
const fileIndex = args.indexOf('--file');
if (fileIndex < 0 || !args[fileIndex + 1]) {
  throw new Error('Usage: snapproofos-import --dry-run --file <authorized-export.json>');
}
const descriptor = JSON.parse(readFileSync(resolve(args[fileIndex + 1]), 'utf8'));
process.stdout.write(`${JSON.stringify(buildSnapProofMigrationPlan(descriptor), null, 2)}\n`);
