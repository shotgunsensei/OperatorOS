import { planOutCallImport } from '../lib/outcall-import.js';

if (!process.argv.slice(2).includes('--dry-run')) {
  throw new Error('OutCall import supports --dry-run only; no standalone data apply exists.');
}
process.stdout.write(`${JSON.stringify(planOutCallImport(), null, 2)}\n`);
