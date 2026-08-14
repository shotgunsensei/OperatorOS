import {
  buildAll,
  buildCompiledLedger,
  createNegativeFixture,
  effectiveIssues,
  issueSummary,
  writeBuildArtifacts,
} from './lib/compiler.mjs';

const args = process.argv.slice(2);
const fixtureIndex = args.indexOf('--negative-fixture');
const fixtureName = fixtureIndex >= 0 ? args[fixtureIndex + 1] : null;
const base = buildAll();
let result = base;
if (fixtureName) {
  const fixture = createNegativeFixture(fixtureName, base.source, base.target, base.waivers);
  result = {
    source: fixture.source,
    target: fixture.target,
    waivers: fixture.waivers,
    ledger: buildCompiledLedger(fixture.source, fixture.target, fixture.waivers),
  };
}
writeBuildArtifacts(result);
const failures = effectiveIssues(result.ledger);
const summary = {
  mode: fixtureName ? `negative-fixture:${fixtureName}` : 'release',
  modules: result.ledger.totals.modules,
  capabilities: result.ledger.totals.capabilities,
  stateCounts: result.ledger.totals.stateCounts,
  failures: failures.length,
  failureCounts: issueSummary(failures),
  samples: failures.slice(0, 25),
  reports: 'build/parity/reports',
};
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (failures.length > 0) process.exitCode = 1;
