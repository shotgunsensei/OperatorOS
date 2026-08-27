import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  REPOSITORY_ROOT,
  sha256,
  writeJson,
} from './lib/compiler.mjs';
import {
  VISUAL_APPROVAL_PATH,
  expandVisualBaselinePaths,
  readVisualApprovals,
  readVisualContracts,
  validateVisualContracts,
} from './lib/quality.mjs';

const args = process.argv.slice(2);
const valueAfter = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
if (!args.includes('--approve')) throw new Error('Refusing to approve baselines without --approve');
const approvedBy = valueAfter('--approved-by')?.trim();
const reason = valueAfter('--reason')?.trim();
const approvedAt = valueAfter('--approved-at')?.trim() ?? new Date().toISOString();
if (!approvedBy || !reason) throw new Error('--approved-by and --reason are required');
if (Number.isNaN(Date.parse(approvedAt))) throw new Error('--approved-at must be an ISO-8601 date-time');

const contracts = readVisualContracts();
const structuralIssues = validateVisualContracts(contracts, readVisualApprovals(), { checkFiles: false });
if (structuralIssues.length > 0) throw new Error(`Visual contracts are structurally invalid: ${structuralIssues.map((entry) => entry.code).join(', ')}`);
const approvals = [];
for (const module of contracts.modules) {
  for (const viewport of module.viewports) {
    for (const entry of expandVisualBaselinePaths(contracts, viewport.baselinePath)) {
      const absolute = join(REPOSITORY_ROOT, entry.baselinePath);
      if (!existsSync(absolute)) throw new Error(`Missing screenshot baseline: ${entry.baselinePath}`);
      approvals.push({
        moduleSlug: module.moduleSlug,
        viewport: viewport.name,
        platform: entry.platform,
        baselinePath: entry.baselinePath,
        sha256: sha256(readFileSync(absolute)),
        approvedBy,
        approvedAt,
        reason,
      });
    }
  }
}
approvals.sort((left, right) => left.baselinePath.localeCompare(right.baselinePath));
writeJson(VISUAL_APPROVAL_PATH, {
  schemaVersion: 1,
  policy: 'Each entry binds a reviewed screenshot byte-for-byte to its reviewer and reason.',
  approvals,
});
process.stdout.write(`${JSON.stringify({ approved: approvals.length, output: 'docs/parity/visual-baseline-approvals.json' }, null, 2)}\n`);
