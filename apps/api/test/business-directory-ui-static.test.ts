import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('shared directory UI exposes persistent CRUD, associations, states, and responsive behavior', () => {
  const component = read('apps/web/src/components/module-shells/BusinessDirectory.tsx');
  const client = read('apps/web/src/lib/auth.ts');
  for (const contract of [
    'organizations.list', 'organizations.create', 'organizations.update', 'organizations.archive',
    'contacts.list', 'contacts.create', 'contacts.update', 'contacts.archive',
    'sites.list', 'sites.create', 'sites.update', 'sites.archive',
    'organizations.associateContact', 'sites.associateContact', 'relationships.create', 'organizations.profile',
  ]) assert.ok(component.includes(`directoryApi.${contract}`), `missing UI contract ${contract}`);
  assert.match(component, /Loading your business directory/);
  assert.match(component, /No organizations yet/);
  assert.match(component, /Directory access denied/);
  assert.match(component, /@media\(max-width:760px\)/);
  assert.doesNotMatch(component, /coming soon|mock data|fake counter/i);
  assert.doesNotMatch(component, /persistent directory data|tenant-managed|· v\{row\.version\}/i);
  assert.match(client, /credentials: 'include'/);
  assert.match(client, /X-Tenant-Id/);
});

test('TradeFlowKit, TechDeck, and PulseDesk render the same directory component with module-specific profiles', () => {
  const files = [
    ['tradeflowkit', 'apps/web/src/components/module-shells/TradeFlowKitShell.tsx'],
    ['techdeck', 'apps/web/src/components/module-shells/TechDeckShell.tsx'],
    ['pulsedesk', 'apps/web/src/components/module-shells/PulseDeskShell.tsx'],
  ] as const;
  for (const [slug, path] of files) {
    const source = read(path);
    assert.match(source, /import BusinessDirectory from '\.\/BusinessDirectory'/);
    assert.ok(source.includes(`moduleSlug="${slug}"`));
    assert.ok(source.includes(`id="${slug}-directory"`));
  }
});
