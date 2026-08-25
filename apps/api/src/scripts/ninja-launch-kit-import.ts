import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { planNinjaLaunchKitImport } from '../lib/ninja-launch-kit-import.js';

const args = process.argv.slice(2);
if (!args.includes('--dry-run')) {
  throw new Error('Deploy Ops legacy-source import supports --dry-run only; apply requires an approved cutover phase.');
}
const fileIndex = args.indexOf('--file');
if (fileIndex < 0 || !args[fileIndex + 1]) {
  throw new Error('Usage: ninja-launch-kit-import --dry-run --file <authorized-export.json>');
}
const descriptor = JSON.parse(readFileSync(resolve(args[fileIndex + 1]), 'utf8'));
process.stdout.write(`${JSON.stringify(planNinjaLaunchKitImport(descriptor), null, 2)}\n`);
