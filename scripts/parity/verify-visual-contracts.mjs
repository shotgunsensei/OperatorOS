import { join } from 'node:path';
import {
  BUILD_ROOT,
  issueSummary,
  writeJson,
} from './lib/compiler.mjs';
import {
  readVisualApprovals,
  readVisualContracts,
  validateVisualContracts,
} from './lib/quality.mjs';

const contracts = readVisualContracts();
const approvals = readVisualApprovals();
const issues = validateVisualContracts(contracts, approvals);
const result = {
  schemaVersion: 1,
  modules: contracts.modules.length,
  failures: issues.length,
  failureCounts: issueSummary(issues),
  issues,
};
writeJson(join(BUILD_ROOT, 'visual-contract-verification.json'), result);
process.stdout.write(`${JSON.stringify({ ...result, issues: issues.slice(0, 25) }, null, 2)}\n`);
if (issues.length > 0) process.exitCode = 1;
