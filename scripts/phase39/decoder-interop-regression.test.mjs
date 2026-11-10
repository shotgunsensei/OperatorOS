import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const native = join(process.cwd(), 'apps/torqueshed-native');
const router = dirname(require.resolve('expo-router/package.json', { paths: [native] }));
const queryPath = require.resolve('query-string', { paths: [router] });
const queryRequire = createRequire(queryPath);
const query = require(queryPath);
const decoder = queryRequire('decode-uri-component');
const code = readFileSync(queryPath, 'utf8');
const navigation = require(join(router, 'build/react-navigation/core/getStateFromPath.js'));

function withDecoder(value) {
  const exports = {};
  runInNewContext(code, { exports, require: id => id === 'decode-uri-component' ? value : queryRequire(id) }, { timeout: 1000 });
  return exports;
}

test('actual installed security decoder and query-string parse/stringify controls', () => {
  assert.equal(JSON.parse(readFileSync(join(dirname(queryRequire.resolve('decode-uri-component')), 'package.json'), 'utf8')).version, '0.5.1');
  for (const [input, expected] of [['q=plain', 'plain'], ['q=hello%20world', 'hello world'], ['q=a+b', 'a b'], ['q=%F0%9F%98%80', '😀']]) {
    assert.equal(query.parse(input).q, expected);
  }
  assert.equal(Object.keys(query.parse('')).length, 0);
  assert.equal(query.stringify({ q: 'hello world' }), 'q=hello%20world');
  assert.equal(query.parse('q=hello%20world', { decode: false }).q, 'hello%20world');
});

test('callable CommonJS and ESM default shapes work; unsupported exports fail closed', () => {
  const callable = typeof decoder === 'function' ? decoder : decoder.default;
  for (const shape of [callable, { default: callable }]) {
    assert.equal(withDecoder(shape).parse('q=hello%20world').q, 'hello world');
  }
  for (const shape of [undefined, null, {}, { default: 42 }, { default: {} }]) {
    assert.throws(() => withDecoder(shape), /Unsupported decode-uri-component export shape/);
  }
});

test('vendored navigation query and no-query controls execute the installed function', () => {
  const options = { screens: { Build: 'build/:id' } };
  for (const suffix of ['', '?q=hello%20world', '?q=plain']) {
    const state = navigation.getStateFromPath(`/build/123${suffix}`, options);
    assert.equal(state.routes[0].name, 'Build');
    assert.equal(state.routes[0].params.id, '123');
    if (suffix) assert.equal(state.routes[0].params.q, suffix.includes('%20') ? 'hello world' : 'plain');
  }
});

test('malformed and bounded hostile inputs preserve decoder behavior without prototype mutation', { timeout: 3000 }, () => {
  const callable = typeof decoder === 'function' ? decoder : decoder.default;
  for (const input of ['%', '%2', '%GG', '%E0%A4%A', '%C0%AF', '%ED%A0%80', '%FF%FE', '%'.repeat(4096), '%E0%A4'.repeat(512)]) {
    assert.equal(query.parse(`q=${input}`).q, callable(input));
  }
  const parsed = query.parse('__proto__=polluted&constructor=ordinary');
  assert.equal(Object.getPrototypeOf(parsed), null);
  assert.equal({}.polluted, undefined);
});

test('Expo native Babel transformation preserves decoder default interop on Android and iOS', () => {
  const expoRequire = createRequire(require.resolve('expo/package.json', { paths: [native] }));
  const babel = expoRequire('@babel/core');
  const decoderPath = queryRequire.resolve('decode-uri-component');
  for (const platform of ['android', 'ios']) {
    const transformed = babel.transformSync(readFileSync(decoderPath, 'utf8'), {
      filename: decoderPath, babelrc: false, configFile: false,
      presets: [expoRequire.resolve('babel-preset-expo')],
      caller: { name: 'metro', platform, supportsStaticESM: false },
    });
    const exports = {};
    runInNewContext(transformed.code, { exports, require: queryRequire }, { timeout: 1000 });
    assert.equal(typeof exports.default, 'function');
    assert.equal(withDecoder(exports).parse('q=hello%20world').q, 'hello world');
  }
});
