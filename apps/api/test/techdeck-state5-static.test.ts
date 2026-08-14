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
  assert.equal(
    workspace.match(/<option key=\{value\} value=\{value\}>\{value\.replaceAll\('_', ' '\)\}<\/option>/g)?.length,
    4,
    'humanized configuration, document, evidence, and report options must retain machine values',
  );
});

test('TechDeck active record deep links select exact tenant-scoped records', () => {
  const workspace = read('../../web/src/components/module-shells/TechDeckOperations.tsx');
  const tickets = read('../../web/src/components/module-shells/TechDeckTicketQueue.tsx');
  const directory = read('../../web/src/components/module-shells/BusinessDirectory.tsx');
  const deepLinks = read('../../web/src/app/modules/[slug]/[...path]/route-map.ts');

  assert.match(workspace, /function routeRecord/);
  assert.match(workspace, /techdeck-route-record-context/);
  assert.match(workspace, /data-active=\{requestedRecord\?\.kind === 'configuration'/);
  assert.match(workspace, /requestedDocumentId === row\.id/);
  assert.match(tickets, /function routeTicketId/);
  assert.match(tickets, /techdeck-ticket-route-context/);
  assert.match(tickets, /data-active=\{ticket\.id === requestedTicketId\}/);
  assert.match(directory, /organizationId: organizationMatch\?\.\[1\] \?\? ''/);
  for (const path of ["'/kb'", "'/evidence/upload'", "'/m/tickets'"]) assert.match(deepLinks, new RegExp(path.replace('/', '\\/')));
});
