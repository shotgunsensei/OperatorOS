import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const expressRoot = dirname(require.resolve('express/package.json'));
const bodyParser = require(require.resolve('body-parser', { paths: [expressRoot] }));
const nativeRoot = join(process.cwd(), 'apps', 'torqueshed-native');
const routerRoot = dirname(require.resolve('expo-router/package.json', { paths: [nativeRoot] }));
const queryRoot = dirname(require.resolve('query-string/package.json', { paths: [routerRoot] }));
const { default: decodeUriComponent } = require(require.resolve('decode-uri-component', { paths: [queryRoot] }));

function parseCompressedBody(body) {
  return new Promise(resolve => {
    const request = Object.assign(Readable.from([body]), {
      headers: { 'content-type': 'application/json', 'content-encoding': 'gzip', 'content-length': String(body.length) },
      method: 'POST',
      socket: {},
    });
    bodyParser.json({ limit: '1kb' })(request, {}, error => resolve({ error, body: request.body }));
  });
}

test('body-parser preserves bounded gzip JSON parsing and rejects trailing compressed garbage', { timeout: 2000 }, async () => {
  const compressed = gzipSync(Buffer.from('{"accepted":true}'));
  const valid = await parseCompressedBody(compressed);
  assert.equal(valid.error, undefined);
  assert.deepEqual(valid.body, { accepted: true });
  const invalid = await parseCompressedBody(Buffer.concat([compressed, Buffer.from('invalid-gzip-trailer')]));
  assert.ok(invalid.error);
  assert.equal(invalid.error.status, 400);
});

test('URI decoding preserves valid input and handles malformed encoded runs', () => {
  assert.equal(decodeUriComponent('hello%20world%F0%9F%8C%8D'), 'hello world🌍');
  assert.equal(decodeUriComponent('%E0%A4%A'), '%E0%A4%A');
  const malformed = '%FF'.repeat(4000);
  assert.equal(decodeUriComponent(malformed), malformed);
});
