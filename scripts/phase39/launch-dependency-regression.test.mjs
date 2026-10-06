import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const tailwindRoot = dirname(require.resolve('tailwindcss/package.json'));
const chokidarRoot = dirname(require.resolve('chokidar/package.json', { paths: [tailwindRoot] }));
const braces = require(require.resolve('braces', { paths: [chokidarRoot] }));
const nativeRoot = join(process.cwd(), 'apps', 'torqueshed-native');
const expoRoot = dirname(require.resolve('expo/package.json', { paths: [nativeRoot] }));
const cliRoot = dirname(require.resolve('@expo/cli/package.json', { paths: [expoRoot] }));
const forge = require(require.resolve('node-forge', { paths: [cliRoot] }));
const expressRoot = dirname(require.resolve('express/package.json'));
const proxyAddr = require(require.resolve('proxy-addr', { paths: [expressRoot] }));
const reactNativeRoot = dirname(require.resolve('react-native/package.json', { paths: [nativeRoot] }));
const devtoolsRoot = dirname(require.resolve('react-devtools-core/package.json', { paths: [reactNativeRoot] }));
const shellQuote = require(require.resolve('shell-quote', { paths: [devtoolsRoot] }));
const selectorParser = require(require.resolve('postcss-selector-parser', { paths: [tailwindRoot] }));
const tailwindViteRoot = dirname(require.resolve('@tailwindcss/vite'));
const tailwindNodeRoot = dirname(require.resolve('@tailwindcss/node', { paths: [tailwindViteRoot] }));
const { SourceMapConsumer } = require(require.resolve('source-map-js', { paths: [tailwindNodeRoot] }));

test('proxy trust cannot turn a short IPv4-mapped IPv6 subnet into trust for every client', () => {
  for (const subnet of ['::ffff:10.0.0.0/8', '::/1']) {
    const trust = proxyAddr.compile(subnet);
    assert.equal(trust('203.0.113.9'), false);
    assert.equal(trust('::ffff:203.0.113.9'), false);
  }
  for (const subnet of ['10.0.0.0/8', '::ffff:10.0.0.0/104']) {
    const trust = proxyAddr.compile(subnet);
    assert.equal(trust('10.20.30.40'), true);
    assert.equal(trust('203.0.113.9'), false);
  }
});

test('shell quoting rejects line terminators following a comment without executing shell input', () => {
  for (const separator of ['\n', '\r', '\u2028', '\u2029']) {
    assert.throws(() => shellQuote.quote(['echo', 'literal', { comment: 'reviewed comment' }, `value${separator}next-token`]), TypeError);
  }
  assert.deepEqual(shellQuote.parse(shellQuote.quote(['echo', 'hello world', 'a;b'])), ['echo', 'hello world', 'a;b']);
});

test('updated selector parsing preserves Tailwind escaped classes and functional selectors', () => {
  const input = '.group:hover .sm\\:grid[data-kind="a,b"] > :is(.x,.y)';
  const classes = [];
  const result = selectorParser(root => root.walkClasses(node => classes.push(node.value))).processSync(input);
  assert.equal(result, input);
  assert.deepEqual(classes, ['group', 'sm:grid', 'x', 'y']);
});

test('indexed source maps reject unbounded offsets before source-node processing', () => {
  const map = { version: 3, sources: ['input.js'], names: [], mappings: 'AAAA' };
  for (const line of [Number.MAX_SAFE_INTEGER, Infinity, -1, 0.5]) {
    assert.throws(() => new SourceMapConsumer({ version: 3, sections: [{ offset: { line, column: 0 }, map }] }), /Section offset/);
  }
  const consumer = new SourceMapConsumer({ version: 3, sections: [{ offset: { line: 0, column: 0 }, map }] });
  assert.equal(consumer.originalPositionFor({ line: 1, column: 1 }).source, 'input.js');
});

test('braces rejects deeply nested brace and parentheses patterns before recursive traversal', () => {
  for (const pattern of ['{'.repeat(4000) + 'a,b' + '}'.repeat(4000), '('.repeat(4000) + 'a' + ')'.repeat(4000)]) {
    const start = performance.now();
    assert.throws(() => braces(pattern), /nesting exceeds the supported depth/);
    assert.ok(performance.now() - start < 250);
  }
  assert.deepEqual(braces.expand('src/{api,web}/*.ts'), ['src/api/*.ts', 'src/web/*.ts']);
});

test('forge accepts a valid RSA signature and rejects extra nested DigestAlgorithm elements', () => {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 });
  const message = 'OperatorOS launch dependency regression';
  const digest = forge.md.sha256.create().update(message);
  const expected = digest.digest().getBytes();
  assert.equal(keys.publicKey.verify(expected, keys.privateKey.sign(digest)), true);
  const asn1 = forge.asn1;
  const malformed = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(forge.oids.sha256).getBytes()),
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, ''),
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, 'garbage'),
    ]),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, expected),
  ]);
  const signature = keys.privateKey.sign(asn1.toDer(malformed).getBytes(), 'NONE');
  assert.throws(() => keys.publicKey.verify(expected, signature), /valid RSASSA-PKCS1-v1_5 DigestInfo/);
});
