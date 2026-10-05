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
