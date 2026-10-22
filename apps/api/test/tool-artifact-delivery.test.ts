import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { readAcceptedToolArtifact, ToolArtifactDeliveryError, TOOL_ARTIFACT_MAX_BYTES,
  type ApprovedToolArtifact, type ToolArtifactDeliveryConfiguration } from '../src/lib/tool-artifact-delivery.js';

const hash = (input: string | Buffer) => createHash('sha256').update(input).digest('hex');
const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0x01, 0x7f]); // Bytes only; not an accepted executable/archive.
async function fixture(t: test.TestContext) {
  const base = await mkdtemp(join(tmpdir(), 'operatoros-artifact-test-'));
  const root = join(base, 'approved'), outside = join(base, 'outside');
  await mkdir(root); await mkdir(outside);
  const filePath = join(root, 'private-fixture-name.zip'); await writeFile(filePath, bytes);
  t.after(async () => {
    const actual = await realpath(base), temporaryRoot = await realpath(tmpdir());
    assert.ok(actual.startsWith(temporaryRoot + sep)); assert.ok(actual.includes('operatoros-artifact-test-'));
    await rm(actual, { recursive: true, force: true });
  });
  const approved: ApprovedToolArtifact = { approvedRoot: root, filePath, expectedSha256: hash(bytes),
    expectedBytes: bytes.length, version: '1.2.3-fixture', archiveValidationReceiptSha256: hash('synthetic acceptance-record reference only') };
  return { base, root, outside, filePath, approved, configuration: { officeexit: approved } };
}
async function rejects(operation: Promise<unknown>, code?: string) {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof ToolArtifactDeliveryError);
    assert.equal(error.statusCode, 503);
    if (code) assert.equal(error.code, code);
    assert.equal(error.message, 'The approved private download is unavailable.');
    assert.equal(Object.hasOwn(error, 'cause'), false);
    assert.doesNotMatch(JSON.stringify(error), /private-fixture|operatoros-artifact-test|SECRET|C:\\|\/tmp\//);
    return true;
  });
}

test('artifact delivery defaults closed, including a different tool and invalid runtime slug', async t => {
  for (const configuration of [undefined, null, {}]) await rejects(readAcceptedToolArtifact(configuration, 'officeexit'), 'TOOL_ARTIFACT_NOT_CONFIGURED');
  const f = await fixture(t);
  await rejects(readAcceptedToolArtifact(f.configuration, 'vendortrust365'), 'TOOL_ARTIFACT_NOT_CONFIGURED');
  await rejects(readAcceptedToolArtifact(f.configuration, '__proto__' as 'officeexit'), 'TOOL_ARTIFACT_CONFIGURATION_INVALID');
});

test('exact pinned bytes return only a slug/version filename, hash and version', async t => {
  const f = await fixture(t);
  const result = await readAcceptedToolArtifact(f.configuration, 'officeexit');
  assert.deepEqual(result.content, bytes); assert.equal(result.sha256, hash(bytes));
  assert.equal(result.version, f.approved.version); assert.equal(result.filename, 'officeexit-1.2.3-fixture.zip');
  assert.deepEqual(Object.keys(result).sort(), ['content', 'filename', 'sha256', 'version']);
  assert.doesNotMatch(result.filename, /private-fixture/);
  const vendor = await readAcceptedToolArtifact({ vendortrust365: f.approved }, 'vendortrust365');
  assert.equal(vendor.filename, 'vendortrust365-1.2.3-fixture.zip'); assert.deepEqual(vendor.content, bytes);
});

test('wrong content hash, shorter/longer bytes and changed file size never return content', async t => {
  const f = await fixture(t);
  await rejects(readAcceptedToolArtifact({ officeexit: { ...f.approved, expectedSha256: hash('different') } }, 'officeexit'), 'TOOL_ARTIFACT_VALIDATION_FAILED');
  for (const size of [bytes.length - 1, bytes.length + 1]) {
    await rejects(readAcceptedToolArtifact({ officeexit: { ...f.approved, expectedBytes: size } }, 'officeexit'), 'TOOL_ARTIFACT_VALIDATION_FAILED');
  }
  await writeFile(f.filePath, Buffer.from(bytes).fill(0));
  await rejects(readAcceptedToolArtifact(f.configuration, 'officeexit'), 'TOOL_ARTIFACT_VALIDATION_FAILED');
});

test('unapproved outside root and relative, URL, device or network paths reject', async t => {
  const f = await fixture(t); const outsideFile = join(f.outside, 'fixture.zip'); await writeFile(outsideFile, bytes);
  const paths = [outsideFile, 'relative.zip', '\\SECRET.zip', 'https://private.invalid/SECRET.zip', '\\\\server\\share\\SECRET.zip', '\\\\?\\C:\\SECRET.zip'];
  for (const filePath of paths) await rejects(readAcceptedToolArtifact({ officeexit: { ...f.approved, filePath } }, 'officeexit'), 'TOOL_ARTIFACT_CONFIGURATION_INVALID');
  await rejects(readAcceptedToolArtifact({ officeexit: { ...f.approved, approvedRoot: f.filePath, filePath: join(f.filePath, 'fixture.zip') } }, 'officeexit'));
});

test('missing and nonregular zip paths fail with bounded errors', async t => {
  const f = await fixture(t);
  await rejects(readAcceptedToolArtifact({ officeexit: { ...f.approved, filePath: join(f.root, 'missing-SECRET.zip') } }, 'officeexit'), 'TOOL_ARTIFACT_UNAVAILABLE');
  const folder = join(f.root, 'directory.zip'); await mkdir(folder);
  await rejects(readAcceptedToolArtifact({ officeexit: { ...f.approved, filePath: folder } }, 'officeexit'), 'TOOL_ARTIFACT_VALIDATION_FAILED');
});

test('symlink/junction traversal inside or outside the approved root is rejected', async t => {
  const f = await fixture(t); const nested = join(f.root, 'real-release'); await mkdir(nested); await writeFile(join(nested, 'fixture.zip'), bytes);
  await writeFile(join(f.outside, 'fixture.zip'), bytes);
  for (const [name, target] of [['in-root-link', nested], ['outside-link', f.outside]]) {
    const link = join(f.root, name); await symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
    await rejects(readAcceptedToolArtifact({ officeexit: { ...f.approved, filePath: join(link, 'fixture.zip') } }, 'officeexit'), 'TOOL_ARTIFACT_VALIDATION_FAILED');
  }
  const rootLink = join(f.base, 'approved-link'); await symlink(f.root, rootLink, process.platform === 'win32' ? 'junction' : 'dir');
  await rejects(readAcceptedToolArtifact({ officeexit: { ...f.approved, approvedRoot: rootLink,
    filePath: join(rootLink, 'private-fixture-name.zip') } }, 'officeexit'), 'TOOL_ARTIFACT_VALIDATION_FAILED');
});

test('unsafe basename/version, absent acceptance reference and unknown config fields fail before reads', async t => {
  const f = await fixture(t);
  for (const patch of [{ filePath: join(f.root, 'installer.exe') }, { version: '../SECRET' }, { version: '"SECRET' },
    { archiveValidationReceiptSha256: '' }, { expectedSha256: 'not-a-hash' }, { expectedBytes: 0 }, { expectedBytes: NaN },
    { expectedBytes: 1.5 }, { expectedBytes: '8' }, { privateCredential: 'SECRET' }]) {
    await rejects(readAcceptedToolArtifact({ officeexit: { ...f.approved, ...patch } } as ToolArtifactDeliveryConfiguration, 'officeexit'), 'TOOL_ARTIFACT_CONFIGURATION_INVALID');
  }
  const getter = Object.defineProperty({}, 'officeexit', { get() { throw new Error('SECRET C:\\private\\release.zip'); } });
  await rejects(readAcceptedToolArtifact(getter, 'officeexit'), 'TOOL_ARTIFACT_UNAVAILABLE');
});

test('technical 256MiB bound rejects larger declared artifacts without allocation or release claims', async t => {
  const f = await fixture(t); assert.equal(TOOL_ARTIFACT_MAX_BYTES, 268435456);
  await rejects(readAcceptedToolArtifact({ officeexit: { ...f.approved, expectedBytes: TOOL_ARTIFACT_MAX_BYTES + 1 } }, 'officeexit'), 'TOOL_ARTIFACT_LIMIT_EXCEEDED');
});

test('same-artifact concurrent readers share one verified buffer, and failed work releases the cap', async t => {
  const f = await fixture(t);
  const results = await Promise.all(Array.from({ length: 8 }, () => readAcceptedToolArtifact(f.configuration, 'officeexit')));
  assert.ok(results.every(result => result.content === results[0].content)); assert.deepEqual(results[0].content, bytes);
  await rejects(readAcceptedToolArtifact({ officeexit: { ...f.approved, expectedSha256: hash('bad') } }, 'officeexit'));
  assert.deepEqual((await readAcceptedToolArtifact(f.configuration, 'officeexit')).content, bytes);
});

test('more than two unique active reads fail closed while existing work completes', async t => {
  const f = await fixture(t); const second = join(f.root, 'second.zip'), third = join(f.root, 'third.zip');
  await writeFile(second, bytes); await writeFile(third, bytes);
  const firstRead = readAcceptedToolArtifact(f.configuration, 'officeexit');
  const secondRead = readAcceptedToolArtifact({ vendortrust365: { ...f.approved, filePath: second } }, 'vendortrust365');
  await rejects(readAcceptedToolArtifact({ officeexit: { ...f.approved, filePath: third } }, 'officeexit'), 'TOOL_ARTIFACT_BUSY');
  await Promise.all([firstRead, secondRead]);
  assert.deepEqual((await readAcceptedToolArtifact({ officeexit: { ...f.approved, filePath: third } }, 'officeexit')).content, bytes);
  assert.ok(resolve(f.filePath).startsWith(f.root + sep));
});
