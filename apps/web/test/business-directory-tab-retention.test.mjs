import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

test('directory refresh, search and save retain the chosen tab after a scoped load', async () => {
  const source = readFileSync(new URL('../src/components/module-shells/BusinessDirectory.tsx', import.meta.url), 'utf8');
  const body = (pattern) => {
    const match = source.match(pattern);
    assert.ok(match, 'Expected directory source boundary');
    return match[1].replaceAll(' as ApiError', '');
  };
  const select = body(/function routeSelection[^\n]*\{\r?\n([\s\S]*?)\r?\n\}/);
  const load = body(/const load = useCallback\(async \(query = search\) => \{\r?\n([\s\S]*?)\r?\n  \}, \[moduleSlug, search\]\);/);
  const scopedLoad = body(/useEffect\(\(\) => \{([\s\S]*?)\}, \[tenantKey, moduleSlug\]\);/);
  const save = body(/async function run[^\n]*\{\r?\n([\s\S]*?)\r?\n  \}/);

  let tab;
  let pendingLoad;
  let saved = 0;
  const queries = [];
  const noop = () => {};
  const window = { location: { pathname: '/modules/tradeflowkit/contacts' } };
  const api = (kind) => ({ list: async (slug, query) => {
    queries.push([kind, slug, query]);
    return { [kind]: [] };
  } });
  const route = runInNewContext(
    'function routeSelection() {' + select +
    '} async function load(query = search) {' + load +
    '} function scopedLoad() {' + scopedLoad.replace("void load('');", "track(load(''));") +
    '} async function run(action, after) {' + save + '} ({ scopedLoad, load, run })',
    {
      window, moduleSlug: 'tradeflowkit', search: 'example', selectedId: '',
      directoryApi: { organizations: api('organizations'), contacts: api('contacts'), sites: api('sites') },
      setLoading: noop, setError: noop, setDenied: noop, setOrganizations: noop,
      setContacts: noop, setSites: noop, setSelectedId: noop, setSaving: noop,
      setTab: (value) => { tab = value; }, track: (promise) => { pendingLoad = promise; },
    }, { timeout: 1000, contextCodeGeneration: { strings: false, wasm: false } },
  );

  route.scopedLoad();
  await pendingLoad;
  assert.equal(tab, 'contacts');
  tab = 'sites';
  await route.load();
  assert.equal(tab, 'sites', 'refresh');
  await route.load('supplier');
  assert.equal(tab, 'sites', 'search');
  await route.run(async () => { saved += 1; });
  assert.equal(saved, 1);
  assert.equal(tab, 'sites', 'save reload');
  assert.deepEqual(queries.filter(([kind]) => kind === 'sites').map(([, , query]) => query),
    ['', 'example', 'supplier', 'example']);

  window.location.pathname = '/modules/tradeflowkit/directory';
  route.scopedLoad();
  await pendingLoad;
  assert.equal(tab, 'organizations', 'module or tenant effect reinterprets the current route');
  window.location.pathname = '/modules/tradeflowkit/facilities';
  route.scopedLoad();
  await pendingLoad;
  assert.equal(tab, 'sites', 'deep links still initialize from the current route');
});
