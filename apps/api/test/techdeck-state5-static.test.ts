import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('TechDeck state-5 routes expose no secret reveal or remote execution endpoint', () => {
  const routes = read('../src/routes/techdeck-routes.ts');
  const domain = read('../src/lib/techdeck-ops.ts');
  assert.doesNotMatch(routes, /\/execute['"`]|\/dispatch['"`]|\/commands['"`]|revealSecret|secretValue/);
  assert.match(routes, /execution: \{ enabled: false/);
  assert.match(domain, /SECRET_VALUE_FORBIDDEN/);
  assert.match(domain, /externalVaultReference/);
});

test('TechDeck UI and deep links mount completed operations without pending workflow cards', () => {
  const shell = read('../../web/src/components/module-shells/TechDeckShell.tsx');
  const workspace = read('../../web/src/components/module-shells/TechDeckOperations.tsx');
  const deepLinks = read('../../web/src/app/modules/[slug]/[...path]/route-map.ts');
  assert.doesNotMatch(shell, /pendingWorkflowShortcuts|command actions/);
  for (const section of ['techdeck-inventory', 'techdeck-network', 'techdeck-lifecycle', 'techdeck-documentation', 'techdeck-runbooks', 'techdeck-evidence', 'techdeck-reports', 'techdeck-time']) {
    assert.match(`${workspace}\n${deepLinks}`, new RegExp(section));
  }
  assert.match(workspace, /Documentation-only runbooks/);
});
