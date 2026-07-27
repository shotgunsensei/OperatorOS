import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatModuleDeepPath,
  resolveCoreModuleDeepLink,
} from '../../web/src/app/modules/[slug]/[...path]/route-map.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

test('core module deep links resolve only to live native shell sections', () => {
  assert.deepEqual(resolveCoreModuleDeepLink('tradeflowkit', ['dashboard']), {
    sectionId: 'tradeflowkit-overview',
    label: 'Overview',
  });
  assert.deepEqual(resolveCoreModuleDeepLink('tradeflowkit', ['leads']), {
    sectionId: 'tradeflowkit-lead-center',
    label: 'Lead Center',
  });
  for (const path of ['customers', 'quotes', 'invoices', 'payments']) assert.equal(resolveCoreModuleDeepLink('tradeflowkit', [path])?.sectionId, 'tradeflowkit-revenue-flow');
  for (const path of ['jobs', 'tasks', 'analytics']) assert.equal(resolveCoreModuleDeepLink('tradeflowkit', [path])?.sectionId, 'tradeflowkit-operations');
  for (const path of ['directory', 'contacts', 'sites']) {
    assert.equal(resolveCoreModuleDeepLink('tradeflowkit', [path])?.sectionId, 'tradeflowkit-directory');
  }
  assert.deepEqual(resolveCoreModuleDeepLink('techdeck', ['tickets']), {
    sectionId: 'techdeck-ticket-queue',
    label: 'Ticket Queue',
  });
  for (const path of ['assets', 'inventory', 'alerts']) assert.equal(resolveCoreModuleDeepLink('techdeck', [path])?.sectionId, 'techdeck-inventory');
  for (const path of ['network', 'ipam']) assert.equal(resolveCoreModuleDeepLink('techdeck', [path])?.sectionId, 'techdeck-network');
  for (const path of ['scripts', 'runbooks']) assert.equal(resolveCoreModuleDeepLink('techdeck', [path])?.sectionId, 'techdeck-runbooks');
  assert.equal(resolveCoreModuleDeepLink('techdeck', ['lifecycle'])?.sectionId, 'techdeck-lifecycle');
  assert.equal(resolveCoreModuleDeepLink('techdeck', ['documentation'])?.sectionId, 'techdeck-documentation');
  assert.equal(resolveCoreModuleDeepLink('techdeck', ['evidence'])?.sectionId, 'techdeck-evidence');
  assert.equal(resolveCoreModuleDeepLink('techdeck', ['reports'])?.sectionId, 'techdeck-reports');
  assert.equal(resolveCoreModuleDeepLink('techdeck', ['time'])?.sectionId, 'techdeck-time');
  for (const path of ['clients', 'sites', 'contacts']) {
    assert.equal(resolveCoreModuleDeepLink('techdeck', [path])?.sectionId, 'techdeck-directory');
  }
  assert.deepEqual(resolveCoreModuleDeepLink('pulsedesk', ['tickets']), {
    sectionId: 'pulsedesk-operations',
    label: 'Request Queue',
  });
  assert.deepEqual(resolveCoreModuleDeepLink('pulsedesk', ['departments']), {
    sectionId: 'pulsedesk-operations',
    label: 'Departments',
  });
  for (const path of ['clients', 'facilities', 'sites', 'contacts', 'vendors']) {
    assert.equal(resolveCoreModuleDeepLink('pulsedesk', [path])?.sectionId, 'pulsedesk-directory');
  }
  for (const path of ['assets', 'supply-requests', 'facility-requests', 'knowledge']) {
    assert.equal(resolveCoreModuleDeepLink('pulsedesk', [path])?.sectionId, 'pulsedesk-operations');
  }
  assert.equal(resolveCoreModuleDeepLink('pulsedesk', ['service-desk', 'admin'])?.sectionId, 'pulsedesk-operations');
  assert.equal(resolveCoreModuleDeepLink('faultlinelab', ['dashboard'])?.sectionId, 'faultlinelab-dashboard');
  assert.equal(resolveCoreModuleDeepLink('faultlinelab', ['challenges'])?.sectionId, 'faultlinelab-challenges');
  assert.equal(resolveCoreModuleDeepLink('faultlinelab', ['daily'])?.sectionId, 'faultlinelab-challenges');
  assert.equal(resolveCoreModuleDeepLink('faultlinelab', ['sessions'])?.sectionId, 'faultlinelab-session');
  assert.equal(resolveCoreModuleDeepLink('faultlinelab', ['assignments'])?.sectionId, 'faultlinelab-assignments');
  assert.equal(resolveCoreModuleDeepLink('faultlinelab', ['progress'])?.sectionId, 'faultlinelab-progress');
  assert.equal(resolveCoreModuleDeepLink('faultlinelab', ['authoring'])?.sectionId, 'faultlinelab-authoring');
  assert.equal(resolveCoreModuleDeepLink('faultlinelab', ['analytics'])?.sectionId, 'faultlinelab-analytics');
  assert.equal(resolveCoreModuleDeepLink('faultlinelab', ['challenges', 'challenge-123'])?.sectionId, 'faultlinelab-challenges');
  assert.equal(resolveCoreModuleDeepLink('faultlinelab', ['sessions', 'session-123'])?.sectionId, 'faultlinelab-session');
  for (const path of ['practice', 'cpu', 'local', 'profile']) {
    assert.equal(resolveCoreModuleDeepLink('ninja-pool-hall', [path])?.sectionId, 'ninja-pool-hall-shell');
  }
  assert.equal(resolveCoreModuleDeepLink('ninja-pool-hall', ['matches', 'match-123'])?.sectionId, 'ninja-pool-hall-shell');
  assert.equal(resolveCoreModuleDeepLink('faultlinelab', ['unknown']), null);
  assert.equal(resolveCoreModuleDeepLink('techdeck', ['settings'])?.sectionId, 'techdeck-settings');
  assert.equal(resolveCoreModuleDeepLink('ninjamation', ['scripts'])?.sectionId, 'ninjamation-scripts');
  assert.equal(resolveCoreModuleDeepLink('ninjamation', ['scripts', 'script-123'])?.sectionId, 'ninjamation-editor');
  assert.equal(resolveCoreModuleDeepLink('ninjamation', ['execute']), null);
});

test('pending, nested, malformed, and non-core module paths fail closed', () => {
  assert.equal(resolveCoreModuleDeepLink('tradeflowkit', ['payments'])?.sectionId, 'tradeflowkit-revenue-flow');
  assert.equal(resolveCoreModuleDeepLink('tradeflowkit', ['leads', 'lead-123'])?.sectionId, 'tradeflowkit-lead-center');
  assert.equal(resolveCoreModuleDeepLink('tradeflowkit', ['jobs', 'job-123'])?.sectionId, 'tradeflowkit-operations');
  assert.equal(resolveCoreModuleDeepLink('techdeck', ['tickets', 'ticket-123']), null);
  assert.equal(resolveCoreModuleDeepLink('pulsedesk', ['tickets', 'ticket-123'])?.sectionId, 'pulsedesk-operations');
  assert.equal(resolveCoreModuleDeepLink('pulsedesk', ['assets', 'asset-123']), null);
  assert.equal(resolveCoreModuleDeepLink('pulsedesk', ['unknown']), null);
  assert.equal(resolveCoreModuleDeepLink('ninja-pool-hall', ['matches']), null);
  assert.equal(resolveCoreModuleDeepLink('ninja-pool-hall', ['host']), null);
  assert.equal(resolveCoreModuleDeepLink('brandforgeos', ['dashboard'])?.sectionId, 'brandforgeos-dashboard');
  assert.equal(resolveCoreModuleDeepLink('brandforgeos', ['brands', 'brand-123'])?.sectionId, 'brandforgeos-brands');
  assert.equal(resolveCoreModuleDeepLink('brandforgeos', ['campaigns', 'campaign-123'])?.sectionId, 'brandforgeos-campaigns');
  assert.equal(resolveCoreModuleDeepLink('brandforgeos', ['unknown']), null);
  assert.equal(resolveCoreModuleDeepLink('snapproofos', ['dashboard'])?.sectionId, 'snapproofos-dashboard');
  assert.equal(resolveCoreModuleDeepLink('snapproofos', ['cases', 'case-123'])?.sectionId, 'snapproofos-cases');
  assert.equal(resolveCoreModuleDeepLink('snapproofos', ['evidence', 'evidence-123'])?.sectionId, 'snapproofos-evidence');
  assert.equal(resolveCoreModuleDeepLink('snapproofos', ['reports', 'report-123'])?.sectionId, 'snapproofos-reports');
  assert.equal(resolveCoreModuleDeepLink('snapproofos', ['unknown']), null);
  assert.equal(resolveCoreModuleDeepLink('studyforge-ai', ['dashboard'])?.sectionId, 'studyforge-dashboard');
  assert.equal(resolveCoreModuleDeepLink('studyforge-ai', ['sources', 'source-123'])?.sectionId, 'studyforge-sources');
  assert.equal(resolveCoreModuleDeepLink('studyforge-ai', ['decks', 'deck-123'])?.sectionId, 'studyforge-decks');
  assert.equal(resolveCoreModuleDeepLink('studyforge-ai', ['quizzes', 'quiz-123'])?.sectionId, 'studyforge-quizzes');
  assert.equal(resolveCoreModuleDeepLink('studyforge-ai', ['unknown']), null);
  assert.equal(resolveCoreModuleDeepLink('techdeck', ['Tickets']), null);
  assert.equal(resolveCoreModuleDeepLink('techdeck', ['..']), null);
  assert.equal(resolveCoreModuleDeepLink('techdeck', []), null);
  assert.equal(formatModuleDeepPath(['tickets', '<unsafe>']), '/tickets/%3Cunsafe%3E');
});

test('catch-all dispatch focuses stable shell targets and renders deliberate recovery UI', () => {
  const catchAllPage = readRepoFile('apps/web/src/app/modules/[slug]/[...path]/page.tsx');
  const moduleHost = readRepoFile('apps/web/src/app/modules/[slug]/ModuleHost.tsx');
  const appPage = readRepoFile('apps/web/src/app/apps/[slug]/page.tsx');
  const tradeFlowKitShell = readRepoFile('apps/web/src/components/module-shells/TradeFlowKitShell.tsx');
  const tradeFlowKitRevenue = readRepoFile('apps/web/src/components/module-shells/TradeFlowKitRevenueFlow.tsx');
  const tradeFlowKitOperations = readRepoFile('apps/web/src/components/module-shells/TradeFlowKitOperations.tsx');
  const techDeckShell = readRepoFile('apps/web/src/components/module-shells/TechDeckShell.tsx');
  const techDeckOps = readRepoFile('apps/web/src/components/module-shells/TechDeckOperations.tsx');
  const pulseDeskShell = readRepoFile('apps/web/src/components/module-shells/PulseDeskShell.tsx');
  const faultlineLabWorkspace = readRepoFile('apps/web/src/components/module-shells/FaultlineLabWorkspace.tsx');
  const ninjamationShell = readRepoFile('apps/web/src/components/module-shells/NinjamationShell.tsx');

  assert.match(catchAllPage, /resolveCoreModuleDeepLink/);
  assert.match(catchAllPage, /initialSectionId=\{target\.sectionId\}/);
  assert.match(catchAllPage, /module-deep-link-not-found/);
  assert.match(catchAllPage, /actionHref="\/"/);
  assert.doesNotMatch(catchAllPage, /export \{ default \} from '\.\.\/page'/);

  assert.match(moduleHost, /ModuleDeepLinkTargetProvider initialSectionId=\{initialSectionId\}/);
  assert.match(appPage, /new MutationObserver/);
  assert.match(appPage, /target\.scrollIntoView/);
  assert.match(appPage, /target\.focus/);

  for (const [source, targetId] of [
    [tradeFlowKitShell, 'tradeflowkit-overview'],
    [tradeFlowKitShell, 'tradeflowkit-lead-center'],
    [tradeFlowKitShell, 'tradeflowkit-directory'],
    [tradeFlowKitRevenue, 'tradeflowkit-revenue-flow'],
    [tradeFlowKitOperations, 'tradeflowkit-operations'],
    [tradeFlowKitShell, 'tradeflowkit-settings'],
    [techDeckShell, 'techdeck-overview'],
    [techDeckShell, 'techdeck-ticket-queue'],
    [techDeckShell, 'techdeck-directory'],
    [techDeckOps, 'techdeck-ops'],
    [techDeckOps, 'techdeck-inventory'],
    [techDeckOps, 'techdeck-network'],
    [techDeckOps, 'techdeck-lifecycle'],
    [techDeckOps, 'techdeck-documentation'],
    [techDeckOps, 'techdeck-runbooks'],
    [techDeckOps, 'techdeck-evidence'],
    [techDeckOps, 'techdeck-reports'],
    [techDeckOps, 'techdeck-time'],
    [techDeckShell, 'techdeck-settings'],
    [pulseDeskShell, 'pulsedesk-overview'],
    [pulseDeskShell, 'pulsedesk-operations'],
    [pulseDeskShell, 'pulsedesk-directory'],
    [pulseDeskShell, 'pulsedesk-settings'],
    [faultlineLabWorkspace, 'faultlinelab-dashboard'],
    [faultlineLabWorkspace, 'faultlinelab-challenges'],
    [faultlineLabWorkspace, 'faultlinelab-session'],
    [faultlineLabWorkspace, 'faultlinelab-assignments'],
    [faultlineLabWorkspace, 'faultlinelab-progress'],
    [faultlineLabWorkspace, 'faultlinelab-authoring'],
    [faultlineLabWorkspace, 'faultlinelab-analytics'],
    [ninjamationShell, 'ninjamation-dashboard'],
    [ninjamationShell, 'ninjamation-scripts'],
    [ninjamationShell, 'ninjamation-editor'],
    [ninjamationShell, 'ninjamation-review'],
    [ninjamationShell, 'ninjamation-generations'],
    [ninjamationShell, 'ninjamation-downloads'],
  ] as const) {
    assert.ok(source.includes(`id="${targetId}"`), `missing focus target ${targetId}`);
  }
});
