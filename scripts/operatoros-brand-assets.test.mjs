import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const web = join(root, 'apps', 'web');
const logoPath = join(web, 'public', 'brand', 'operatoros-logo.png');
const markPath = join(web, 'public', 'brand', 'operatoros-mark.png');

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function pngIdentity(bytes) {
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'asset must be a PNG');
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    bitDepth: bytes[24],
    colorType: bytes[25],
  };
}

test('canonical source logo remains byte-for-byte intact', async () => {
  const logo = await readFile(logoPath);
  assert.equal(sha256(logo), '73986b270793bde33dad1912caaa0a5b465bf1f08cada4850759ea4ec68f3621');
  assert.deepEqual(pngIdentity(logo), { width: 1254, height: 1254, bitDepth: 8, colorType: 2 });
});

test('compact mark is square RGBA artwork with no wordmark dependency', async () => {
  const mark = await readFile(markPath);
  assert.equal(sha256(mark), '9e5892bcb85b06f3f610289d582b7575564ad932324b6c8a84ee36a584bdb790');
  assert.deepEqual(pngIdentity(mark), { width: 1254, height: 1254, bitDepth: 8, colorType: 6 });

  const component = await readFile(join(web, 'src', 'components', 'brand', 'OperatorMark.tsx'), 'utf8');
  assert.match(component, /OPERATOROS_MARK_PATH/);
  assert.match(component, /data-brand-asset="operatoros-mark"/);
  assert.doesNotMatch(component, /<svg\b/);
});

test('metadata, manifests, and legacy favicon route use the text-free mark', async () => {
  const layout = await readFile(join(web, 'src', 'app', 'layout.tsx'), 'utf8');
  const manifest = JSON.parse(await readFile(join(web, 'public', 'manifest.json'), 'utf8'));
  const faviconRoute = await readFile(join(web, 'src', 'app', 'favicon.ico', 'route.ts'), 'utf8');
  const fallbackSvg = await readFile(join(web, 'public', 'favicon.svg'), 'utf8');

  assert.match(layout, /OPERATOROS_MARK_PATH/);
  assert.deepEqual(manifest.icons, [{
    src: '/brand/operatoros-mark.png',
    sizes: '1254x1254',
    type: 'image/png',
    purpose: 'any',
  }]);
  assert.match(faviconRoute, /operatoros-mark\.png/);
  assert.match(faviconRoute, /'Content-Type': 'image\/png'/);
  assert.doesNotMatch(fallbackSvg, /<text\b/i);
});

test('readable marketing uses the full lockup and social artwork uses the canonical signature', async () => {
  const hero = await readFile(join(web, 'src', 'components', 'marketing', 'sections', 'Hero.tsx'), 'utf8');
  const social = await readFile(join(web, 'src', 'app', 'opengraph-image.tsx'), 'utf8');
  const seo = await readFile(join(web, 'src', 'lib', 'seo.ts'), 'utf8');

  assert.match(hero, /OPERATOROS_LOGO_PATH/);
  assert.match(social, /SOCIAL_OPERATOR_MARK/);
  assert.match(social, /Operator<\/span><span[^>]*>OS/);
  assert.match(seo, /brand\/operatoros-logo\.png/);
});
