import { discoverTarget, TARGET_DISCOVERY_PATH, writeJson } from './lib/compiler.mjs';

const discovery = discoverTarget();
writeJson(TARGET_DISCOVERY_PATH, discovery);
process.stdout.write(`${JSON.stringify({
  output: 'build/parity/target-discovery.json',
  totals: discovery.totals,
  digestSha256: discovery.digestSha256,
}, null, 2)}\n`);
