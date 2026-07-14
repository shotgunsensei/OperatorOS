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
  for (const path of ['customers', 'jobs', 'quotes', 'invoices']) {
    assert.equal(resolveCoreModuleDeepLink('tradeflowkit', [path])?.sectionId, 'tradeflowkit-revenue-flow');
  }
  assert.deepEqual(resolveCoreModuleDeepLink('techdeck', ['tickets']), {
    sectionId: 'techdeck-ticket-queue',
    label: 'Ticket Queue',
  });
  assert.deepEqual(resolveCoreModuleDeepLink('pulsedesk', ['tickets']), {
    sectionId: 'pulsedesk-operations',
    label: 'Request Queue',
  });
  assert.deepEqual(resolveCoreModuleDeepLink('pulsedesk', ['departments']), {
    sectionId: 'pulsedesk-operations',
    label: 'Departments',
  });
  assert.equal(resolveCoreModuleDeepLink('techdeck', ['settings'])?.sectionId, 'techdeck-settings');
});

test('pending, nested, malformed, and non-core module paths fail closed', () => {
  assert.equal(resolveCoreModuleDeepLink('tradeflowkit', ['payments']), null);
  assert.equal(resolveCoreModuleDeepLink('tradeflowkit', ['leads', 'lead-123']), null);
  assert.equal(resolveCoreModuleDeepLink('techdeck', ['tickets', 'ticket-123']), null);
  assert.equal(resolveCoreModuleDeepLink('pulsedesk', ['facilities']), null);
  assert.equal(resolveCoreModuleDeepLink('brandforgeos', ['dashboard']), null);
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
  const techDeckShell = readRepoFile('apps/web/src/components/module-shells/TechDeckShell.tsx');
  const pulseDeskShell = readRepoFile('apps/web/src/components/module-shells/PulseDeskShell.tsx');

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
    [tradeFlowKitRevenue, 'tradeflowkit-revenue-flow'],
    [tradeFlowKitShell, 'tradeflowkit-settings'],
    [techDeckShell, 'techdeck-overview'],
    [techDeckShell, 'techdeck-ticket-queue'],
    [techDeckShell, 'techdeck-settings'],
    [pulseDeskShell, 'pulsedesk-overview'],
    [pulseDeskShell, 'pulsedesk-operations'],
    [pulseDeskShell, 'pulsedesk-settings'],
  ] as const) {
    assert.ok(source.includes(`id="${targetId}"`), `missing focus target ${targetId}`);
  }
});
