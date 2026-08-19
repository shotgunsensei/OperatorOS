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
  for (const path of ['jobs', 'analytics']) assert.equal(resolveCoreModuleDeepLink('tradeflowkit', [path])?.sectionId, 'tradeflowkit-operations');
  assert.equal(resolveCoreModuleDeepLink('tradeflowkit', ['workflows'])?.sectionId, 'tradeflowkit-workflows');
  assert.equal(resolveCoreModuleDeepLink('tradeflowkit', ['tasks'])?.sectionId, 'tradeflowkit-tasks');
  assert.equal(resolveCoreModuleDeepLink('tradeflowkit', ['recurring-jobs'])?.sectionId, 'tradeflowkit-recurring-jobs');
  assert.equal(resolveCoreModuleDeepLink('tradeflowkit', ['activity'])?.sectionId, 'tradeflowkit-activity');
  for (const path of ['directory', 'contacts', 'sites']) {
    assert.equal(resolveCoreModuleDeepLink('tradeflowkit', [path])?.sectionId, 'tradeflowkit-directory');
  }
  assert.equal(resolveCoreModuleDeepLink('tradeflowkit', ['trash'])?.sectionId, 'tradeflowkit-trash');
  assert.deepEqual(resolveCoreModuleDeepLink('techdeck', ['tickets']), {
    sectionId: 'techdeck-ticket-queue',
    label: 'Ticket Queue',
  });
  for (const path of ['dashboard', 'm']) assert.equal(resolveCoreModuleDeepLink('techdeck', [path])?.sectionId, 'techdeck-overview');
  assert.equal(resolveCoreModuleDeepLink('techdeck', ['m', 'tickets'])?.sectionId, 'techdeck-ticket-queue');
  assert.equal(resolveCoreModuleDeepLink('techdeck', ['m', 'time'])?.sectionId, 'techdeck-time');
  for (const path of ['assets', 'inventory', 'alerts']) assert.equal(resolveCoreModuleDeepLink('techdeck', [path])?.sectionId, 'techdeck-inventory');
  for (const path of ['network', 'ipam']) assert.equal(resolveCoreModuleDeepLink('techdeck', [path])?.sectionId, 'techdeck-network');
  for (const path of ['scripts', 'runbooks']) assert.equal(resolveCoreModuleDeepLink('techdeck', [path])?.sectionId, 'techdeck-runbooks');
  assert.equal(resolveCoreModuleDeepLink('techdeck', ['lifecycle'])?.sectionId, 'techdeck-lifecycle');
  for (const path of ['documentation', 'kb', 'knowledge-base']) assert.equal(resolveCoreModuleDeepLink('techdeck', [path])?.sectionId, 'techdeck-documentation');
  assert.equal(resolveCoreModuleDeepLink('techdeck', ['evidence'])?.sectionId, 'techdeck-evidence');
  assert.equal(resolveCoreModuleDeepLink('techdeck', ['evidence', 'upload'])?.sectionId, 'techdeck-evidence');
  assert.equal(resolveCoreModuleDeepLink('techdeck', ['reports'])?.sectionId, 'techdeck-reports');
  assert.equal(resolveCoreModuleDeepLink('techdeck', ['time'])?.sectionId, 'techdeck-time');
  for (const path of ['clients', 'sites', 'contacts']) {
    assert.equal(resolveCoreModuleDeepLink('techdeck', [path])?.sectionId, 'techdeck-directory');
  }
  assert.equal(resolveCoreModuleDeepLink('pulsedesk', ['tickets'])?.sectionId, 'pulsedesk-operations');
  assert.equal(resolveCoreModuleDeepLink('pulsedesk', ['departments'])?.sectionId, 'pulsedesk-assignments');
  for (const path of ['clients', 'facilities', 'sites', 'contacts', 'vendors']) {
    assert.equal(resolveCoreModuleDeepLink('pulsedesk', [path])?.sectionId, 'pulsedesk-directory');
  }
  for (const path of ['assets', 'supply-requests', 'facility-requests']) {
    assert.equal(resolveCoreModuleDeepLink('pulsedesk', [path])?.sectionId, 'pulsedesk-operations-route');
  }
  assert.equal(resolveCoreModuleDeepLink('pulsedesk', ['knowledge'])?.sectionId, 'pulsedesk-knowledge-route');
  for (const path of ['app', 'dashboard']) {
    assert.equal(resolveCoreModuleDeepLink('pulsedesk', [path])?.sectionId, 'pulsedesk-overview');
  }
  assert.equal(resolveCoreModuleDeepLink('pulsedesk', ['analytics'])?.sectionId, 'pulsedesk-analytics');
  assert.equal(resolveCoreModuleDeepLink('pulsedesk', ['submit'])?.sectionId, 'pulsedesk-operations');
  assert.equal(resolveCoreModuleDeepLink('pulsedesk', ['service-desk', 'admin'])?.sectionId, 'pulsedesk-assignments');
  assert.equal(resolveCoreModuleDeepLink('pulsedesk', ['service-desk-admin'])?.sectionId, 'pulsedesk-assignments');
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
  assert.equal(resolveCoreModuleDeepLink('ninjamation', ['library'])?.sectionId, 'ninjamation-library');
  assert.equal(resolveCoreModuleDeepLink('ninjamation', ['generate'])?.sectionId, 'ninjamation-generations');
  assert.equal(resolveCoreModuleDeepLink('ninjamation', ['sync'])?.sectionId, 'ninjamation-sync');
  assert.equal(resolveCoreModuleDeepLink('ninjamation', ['sync-runs', 'sync-123'])?.sectionId, 'ninjamation-sync');
  assert.equal(resolveCoreModuleDeepLink('ninjamation', ['account'])?.sectionId, 'ninjamation-account');
  assert.equal(resolveCoreModuleDeepLink('ninjamation', ['admin'])?.sectionId, 'ninjamation-admin');
  assert.equal(resolveCoreModuleDeepLink('ninjamation', ['checkout', 'success'])?.sectionId, 'ninjamation-account');
  assert.equal(resolveCoreModuleDeepLink('ninjamation', ['execute']), null);
  for (const path of ['dashboard', 'readiness']) assert.equal(resolveCoreModuleDeepLink('outcall', [path])?.sectionId, 'outcall-overview-route');
  assert.equal(resolveCoreModuleDeepLink('outcall', ['contacts'])?.sectionId, 'outcall-profiles');
  assert.equal(resolveCoreModuleDeepLink('outcall', ['setup'])?.sectionId, 'outcall-setup');
  assert.equal(resolveCoreModuleDeepLink('outcall', ['profiles'])?.sectionId, 'outcall-profiles');
  assert.equal(resolveCoreModuleDeepLink('outcall', ['triggers'])?.sectionId, 'outcall-triggers');
  assert.equal(resolveCoreModuleDeepLink('outcall', ['calls'])?.sectionId, 'outcall-schedule');
  assert.equal(resolveCoreModuleDeepLink('outcall', ['calls', 'call-123'])?.sectionId, 'outcall-call-record');
  assert.equal(resolveCoreModuleDeepLink('outcall', ['privacy'])?.sectionId, 'outcall-privacy');
  assert.equal(resolveCoreModuleDeepLink('outcall', ['unknown']), null);
});

test('pending, nested, malformed, and non-core module paths fail closed', () => {
  assert.equal(resolveCoreModuleDeepLink('tradeflowkit', ['payments'])?.sectionId, 'tradeflowkit-revenue-flow');
  assert.equal(resolveCoreModuleDeepLink('tradeflowkit', ['leads', 'lead-123'])?.sectionId, 'tradeflowkit-lead-center');
  assert.equal(resolveCoreModuleDeepLink('tradeflowkit', ['jobs', 'job-123'])?.sectionId, 'tradeflowkit-operations');
  assert.equal(resolveCoreModuleDeepLink('tradeflowkit', ['tasks', 'task-123'])?.sectionId, 'tradeflowkit-tasks');
  assert.equal(resolveCoreModuleDeepLink('tradeflowkit', ['customers', 'customer-123'])?.sectionId, 'tradeflowkit-revenue-flow');
  assert.deepEqual(resolveCoreModuleDeepLink('tradeflowkit', ['portal', 'Abcdefghijklmnopqrstuvwxyz012345']), {
    sectionId: 'tradeflowkit-public-portal',
    label: 'Customer Portal',
    redirectPath: '/public/tradeflowkit/customers/Abcdefghijklmnopqrstuvwxyz012345',
  });
  assert.equal(resolveCoreModuleDeepLink('tradeflowkit', ['clients', 'client-123'])?.sectionId, 'tradeflowkit-directory');
  assert.equal(resolveCoreModuleDeepLink('techdeck', ['tickets', 'ticket-123'])?.sectionId, 'techdeck-ticket-queue');
  assert.equal(resolveCoreModuleDeepLink('techdeck', ['m', 'tickets', 'ticket-123'])?.sectionId, 'techdeck-ticket-queue');
  assert.equal(resolveCoreModuleDeepLink('techdeck', ['clients', 'client-123'])?.sectionId, 'techdeck-directory');
  for (const path of ['documents', 'runbooks', 'kb', 'knowledge-base']) {
    assert.equal(resolveCoreModuleDeepLink('techdeck', [path, 'document-123'])?.sectionId, 'techdeck-documentation');
  }
  assert.equal(resolveCoreModuleDeepLink('pulsedesk', ['tickets', 'ticket-123'])?.sectionId, 'pulsedesk-operations');
  assert.equal(resolveCoreModuleDeepLink('pulsedesk', ['clients', 'client-123'])?.sectionId, 'pulsedesk-directory');
  assert.equal(resolveCoreModuleDeepLink('pulsedesk', ['assets', 'asset-123', 'report-issue'])?.sectionId, 'pulsedesk-operations-route');
  assert.equal(resolveCoreModuleDeepLink('pulsedesk', ['assets', 'asset-123']), null);
  assert.equal(resolveCoreModuleDeepLink('pulsedesk', ['unknown']), null);
  assert.equal(resolveCoreModuleDeepLink('ninja-pool-hall', ['matches']), null);
  assert.equal(resolveCoreModuleDeepLink('ninja-pool-hall', ['host'])?.sectionId, 'ninja-pool-hall-shell');
  assert.equal(resolveCoreModuleDeepLink('brandforgeos', ['dashboard'])?.sectionId, 'brandforgeos-dashboard');
  assert.equal(resolveCoreModuleDeepLink('brandforgeos', ['brands', 'brand-123'])?.sectionId, 'brandforgeos-brands');
  assert.equal(resolveCoreModuleDeepLink('brandforgeos', ['campaigns', 'campaign-123'])?.sectionId, 'brandforgeos-campaigns');
  assert.equal(resolveCoreModuleDeepLink('brandforgeos', ['unknown']), null);
  assert.equal(resolveCoreModuleDeepLink('snapproofos', ['dashboard'])?.sectionId, 'snapproofos-overview-route');
  assert.equal(resolveCoreModuleDeepLink('snapproofos', ['cases', 'case-123'])?.sectionId, 'snapproofos-jobs');
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
  const outCallShell = readRepoFile('apps/web/src/components/module-shells/OutCallWorkspace.tsx');

  assert.match(catchAllPage, /resolveCoreModuleDeepLink/);
  assert.match(catchAllPage, /const \{ slug, path \} = await params/);
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
    [outCallShell, 'outcall-readiness'],
    [outCallShell, 'outcall-setup'],
    [outCallShell, 'outcall-profiles'],
    [outCallShell, 'outcall-triggers'],
    [outCallShell, 'outcall-schedule'],
    [outCallShell, 'outcall-privacy'],
  ] as const) {
    assert.ok(source.includes(targetId), `missing focus target ${targetId}`);
  }
});
