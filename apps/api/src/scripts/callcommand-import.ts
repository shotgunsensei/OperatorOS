import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { planCallCommandImport } from '../lib/callcommand-import.js';

const args = process.argv.slice(2);
if (!args.includes('--dry-run')) throw new Error('CallCommand import supports --dry-run only.');
const fileIndex = args.indexOf('--file');
if (fileIndex < 0 || !args[fileIndex + 1]) {
  throw new Error('Usage: callcommand-import --dry-run --file <authorized-export.json>');
}
const descriptor = JSON.parse(readFileSync(resolve(args[fileIndex + 1]), 'utf8'));
process.stdout.write(`${JSON.stringify(planCallCommandImport(descriptor), null, 2)}\n`);
