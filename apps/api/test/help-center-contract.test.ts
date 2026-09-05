import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODULE_CATALOG } from '../../../packages/sdk/src/catalog.js';
import {
  HELP_GUIDES,
  MODULE_HELP_GUIDE_IDS,
  findHelpGuide,
  findHelpPage,
  helpSearchText,
} from '../../web/src/lib/help/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('Help Center covers every catalog module with complete searchable page guidance', () => {
  const catalogSlugs = MODULE_CATALOG.map(module => module.slug).sort();
  const guideSlugs = [...MODULE_HELP_GUIDE_IDS].sort();
  assert.deepEqual(guideSlugs, catalogSlugs);

  const ids = new Set<string>();
  let pageCount = 0;
  for (const guide of HELP_GUIDES) {
    assert.ok(!ids.has(guide.id), `duplicate guide id ${guide.id}`);
    ids.add(guide.id);
    assert.ok(guide.name);
    assert.ok(guide.description.length >= 30, `${guide.id} has a useful description`);
    assert.ok(guide.pages.length > 0, `${guide.id} has page guides`);
    assert.equal(new URL(guide.startHref).protocol, 'https:');

    const pageIds = new Set<string>();
    for (const page of guide.pages) {
      pageCount += 1;
      assert.ok(!pageIds.has(page.id), `${guide.id} duplicate page id ${page.id}`);
      pageIds.add(page.id);
      assert.ok(page.path.startsWith('/'), `${guide.id}.${page.id} has a relative path`);
      assert.equal(new URL(page.href).protocol, 'https:');
      assert.ok(page.summary.length >= 35, `${guide.id}.${page.id} has a useful summary`);
      assert.ok(page.features.length >= 3, `${guide.id}.${page.id} enumerates functions`);
      assert.ok(page.workflow.length >= 3, `${guide.id}.${page.id} explains a workflow`);
      assert.match(helpSearchText(guide, page), new RegExp(page.title.toLocaleLowerCase().replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')));
    }
  }
  assert.ok(pageCount >= 150, `expected broad page coverage, received ${pageCount}`);
});

test('page-aware Help links resolve the owning module guide and nested route', () => {
  const techDeck = findHelpGuide('techdeck');
  assert.equal(techDeck.id, 'techdeck');
  assert.equal(findHelpPage(techDeck, '/tickets/record-123')?.id, 'tech-tickets');
  assert.equal(findHelpPage(techDeck, '/modules/techdeck/tickets/record-123')?.id, 'tech-tickets');

  const fallback = findHelpGuide('not-a-module');
  assert.equal(fallback.id, 'operatoros');
});

test('Help and support entry points no longer send customers to the biography page', () => {
  const navigation = read('packages/modules/navigation.ts');
  const sidebar = read('apps/web/src/lib/sidebar-nav.ts');
  const layout = read('apps/web/src/components/SaasLayout.tsx');
  const header = read('apps/web/src/components/module-shells/OperatorOSEcosystemHeader.tsx');
  const platform = read('apps/web/src/components/platform/PlatformCommandShell.tsx');
  const floatingHelp = read('apps/web/src/components/ContactLink.tsx');
  const helpPage = read('apps/web/src/app/help/page.tsx');
  const helpCenter = read('apps/web/src/components/help/HelpCenter.tsx');

  assert.match(navigation, /supportUrl: buildOperatorOSHelpUrl\(\)/);
  assert.match(sidebar, /DEFAULT_OPERATOROS_NAVIGATION_URLS\.supportUrl/);
  assert.match(layout, /href=\{DEFAULT_OPERATOROS_NAVIGATION_URLS\.supportUrl\}/);
  assert.match(header, /buildOperatorOSHelpUrl\(\{ module: moduleSlug \}\)/);
  assert.match(platform, /buildOperatorOSHelpUrl\(\{ module: 'platform-command' \}\)/);
  assert.match(floatingHelp, /DEFAULT_OPERATOROS_NAVIGATION_URLS\.supportUrl/);
  assert.match(helpPage, /<HelpCenter/);
  assert.match(helpCenter, /Search all help/);
  assert.match(helpCenter, /What you will accomplish/);
  assert.match(helpCenter, /How to do it/);
  assert.doesNotMatch(helpCenter, /<code>\{page\.path\}<\/code>/);
  assert.doesNotMatch(helpCenter, /HELP_CONTENT_VERSION/);
  assert.doesNotMatch(`${navigation}\n${sidebar}\n${layout}\n${header}\n${platform}\n${floatingHelp}`, /operatoros\.net\/john/);
});

test('every dedicated module shell exposes a context-aware Help action', () => {
  const shells = [
    ['tradeflowkit', 'TradeFlowKitShell.tsx'],
    ['pulsedesk', 'PulseDeskShell.tsx'],
    ['techdeck', 'TechDeckShell.tsx'],
    ['torqueshed', 'TorqueShedWorkspace.tsx'],
    ['faultlinelab', 'FaultlineLabShell.tsx'],
    ['ninja-pool-hall', 'NinjaPoolHallRouteShell.tsx'],
    ['brandforgeos', 'BrandForgeRouteShell.tsx'],
    ['snapproofos', 'SnapProofShell.tsx'],
    ['studyforge-ai', 'StudyForgeRouteShell.tsx'],
    ['ninja-launch-kit', 'NinjaLaunchKitRouteShell.tsx'],
    ['callcommand-ai', 'CallCommandShell.tsx'],
    ['ninjamation', 'NinjamationRouteShell.tsx'],
    ['outcall', 'OutCallShell.tsx'],
  ] as const;

  for (const [slug, file] of shells) {
    const source = read(`apps/web/src/components/module-shells/${file}`);
    assert.match(source, /buildOperatorOSHelpUrl/);
    assert.match(source, /label:\s*'Help'/);
    assert.ok(source.includes(`module: '${slug}'`) || source.includes(`module:'${slug}'`), `${slug} targets its guide`);
  }
});
