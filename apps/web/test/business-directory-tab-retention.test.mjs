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

test('directory contact and site drafts reset only after a confirmed create', async (t) => {
  const source = readFileSync(new URL('../src/components/module-shells/BusinessDirectory.tsx', import.meta.url), 'utf8');
  const run = source.match(/async function run[^\n]*\{\r?\n([\s\S]*?)\r?\n  \}/)?.[1];
  assert.ok(run, 'Expected the existing directory mutation runner');

  for (const [editor, resource, status, draft] of [
    ['ContactEditor', 'contacts', 422, { firstName: 'Test', lastName: 'Contact', email: 'test@example.invalid', phone: '+12025550100', title: 'Lead' }],
    ['SiteEditor', 'sites', 503, { name: 'Test site' }],
  ]) {
    await t.test(resource, async () => {
      const editorStart = source.indexOf('function ' + editor + '(');
      assert.notEqual(editorStart, -1);
      const save = source.slice(editorStart).match(/^  const save = ([\s\S]*?);\r?\n  return /m)?.[1];
      assert.ok(save, 'Expected the editor save callback');
      const attempts = [];
      const resets = [];
      const form = { ...draft };
      const existingId = 'existing-record';
      let failing = true;
      let lastError;
      let refreshes = 0;
      const sandbox = {
        ...form,
        moduleSlug: 'tradeflowkit',
        row: undefined,
        organizationId: 'test-organization',
        address: { line1: '1 Test Street', city: 'Test City', region: 'NC', postalCode: '00000', countryCode: 'US' },
        directoryApi: {
          [resource]: {
            create: async (slug, payload) => {
              attempts.push(['create', slug, payload]);
              if (failing) throw Object.assign(new Error('Create rejected'), { status });
            },
            update: async (slug, id, payload) => { attempts.push(['update', slug, id, payload]); },
          },
        },
        selectedId: '',
        search: '',
        setError: (value) => { lastError = value; },
        setDenied: () => {},
        setSaving: () => {},
        errorMessage: (error) => error.message,
        load: async () => { refreshes += 1; },
      };
      for (const field of Object.keys(form)) {
        sandbox['set' + field[0].toUpperCase() + field.slice(1)] = (value) => {
          form[field] = value;
          resets.push(field);
        };
      }
      const saveDraft = runInNewContext(
        'async function run(action, after) {' + run.replaceAll(' as ApiError', '') + '} (' + save + ')',
        sandbox, { timeout: 1000, contextCodeGeneration: { strings: false, wasm: false } },
      );

      await saveDraft();
      assert.equal(lastError, 'Create rejected');
      assert.equal(attempts.length, 1, 'no automatic retry');
      assert.equal(refreshes, 0, 'a failed create does not reload the form');
      assert.deepEqual(form, draft, 'failed create retains the draft');
      assert.deepEqual(resets, []);

      failing = false;
      await saveDraft();
      assert.equal(attempts.length, 2);
      assert.deepEqual(attempts[1], attempts[0], 'manual retry sends the same draft');
      assert.equal(lastError, '');
      assert.equal(refreshes, 1);
      assert.deepEqual(resets.sort(), Object.keys(draft).sort(), 'one reset per field on success');
      assert.ok(Object.values(form).every((value) => value === ''));

      sandbox.row = { id: existingId, version: 7 };
      await saveDraft();
      assert.equal(attempts.length, 3);
      assert.deepEqual(attempts[2].slice(0, 3), ['update', 'tradeflowkit', existingId]);
      assert.equal(attempts[2][3].expectedVersion, 7);
      assert.equal(resets.length, Object.keys(draft).length, 'updates do not reset create fields');
    });
  }
});
