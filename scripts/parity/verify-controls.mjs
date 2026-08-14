import { join } from 'node:path';
import {
  BUILD_ROOT,
  buildAll,
  issueSummary,
  writeJson,
} from './lib/compiler.mjs';
import { validateControlIntegrity } from './lib/quality.mjs';

const { ledger, target } = buildAll();
const result = validateControlIntegrity(ledger, target);
writeJson(join(BUILD_ROOT, 'control-integrity.json'), result);
writeJson(join(BUILD_ROOT, 'route-crawl-plan.json'), {
  schemaVersion: 1,
  routes: result.crawlRoutes,
});
process.stdout.write(`${JSON.stringify({
  output: 'build/parity/control-integrity.json',
  activeTargetFiles: result.activeTargetFiles,
  activeRouteCapabilities: result.activeRouteCapabilities,
  crawlRoutes: result.crawlRoutes.length,
  failures: result.issues.length,
  failureCounts: issueSummary(result.issues),
  samples: result.issues.slice(0, 25),
}, null, 2)}\n`);
if (result.issues.length > 0) process.exitCode = 1;
