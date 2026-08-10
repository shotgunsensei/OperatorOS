import {
  buildAll,
  COMPILED_LEDGER_PATH,
  issueSummary,
  writeBuildArtifacts,
} from './lib/compiler.mjs';

const result = buildAll();
writeBuildArtifacts(result);
process.stdout.write(`${JSON.stringify({
  output: 'build/parity/compiled-ledger.json',
  modules: result.ledger.totals.modules,
  capabilities: result.ledger.totals.capabilities,
  stateCounts: result.ledger.totals.stateCounts,
  issues: result.ledger.issues.length,
  issueCounts: issueSummary(result.ledger.issues),
  absoluteOutput: COMPILED_LEDGER_PATH,
}, null, 2)}\n`);
