import { runPhase13MigrationRehearsal } from '../lib/migration-program.js';

const args = process.argv.slice(2);
if (!args.includes('--dry-run')) {
  throw new Error('Phase 13 migration program supports --dry-run only; production apply requires a separately approved cutover.');
}
if (args.includes('--apply')) {
  throw new Error('Phase 13 master rehearsal never applies data.');
}
const moduleIndex = args.indexOf('--module');
const selectedSlug = moduleIndex >= 0 ? args[moduleIndex + 1] : undefined;
if (moduleIndex >= 0 && !selectedSlug) throw new Error('Usage: migration-program --dry-run [--module <slug>]');

const report = runPhase13MigrationRehearsal(selectedSlug);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.manifestErrors.length > 0 || report.summary.failed > 0) process.exitCode = 1;
