import { discoverSource, SOURCE_DISCOVERY_PATH, writeJson } from './lib/compiler.mjs';

const discovery = discoverSource();
writeJson(SOURCE_DISCOVERY_PATH, discovery);
process.stdout.write(`${JSON.stringify({
  output: 'build/parity/source-discovery.json',
  modules: discovery.totals.modules,
  capabilities: discovery.totals.capabilities,
  stateCounts: discovery.totals.stateCounts,
  drift: discovery.drift.length,
}, null, 2)}\n`);
if (discovery.drift.length > 0) process.exitCode = 1;
