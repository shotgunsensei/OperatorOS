import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  brandLogoDimensions,
  buildBrandSvgConcept,
  type BrandLogoComposition,
  type BrandLogoStyle,
} from '../../web/src/components/module-shells/BrandSvgConceptExporter.tsx';
import type { BrandForgeBrand } from '../../web/src/lib/auth.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const source = readFileSync(resolve(root, 'apps/web/src/components/module-shells/BrandSvgConceptExporter.tsx'), 'utf8');

const brand: BrandForgeBrand = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'North <script>alert(1)</script> Star',
  description: 'Make complex field work feel simple. A second sentence is not used.',
  primaryColor: '#123456',
  secondaryColor: '#654321',
  accentColor: '#abcdef',
  headingFont: 'Inter',
  bodyFont: null,
  voiceTone: null,
  guidelines: null,
  logoAttachmentId: null,
  assetSummary: [],
  version: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

test('BrandForge renders four purpose-built compositions at suitable export sizes', () => {
  const expected: Record<BrandLogoComposition, { width: number; height: number }> = {
    wordmark: { width: 1200, height: 400 },
    lockup: { width: 900, height: 700 },
    badge: { width: 800, height: 800 },
    monogram: { width: 600, height: 600 },
  };
  for (const [kind, dimensions] of Object.entries(expected) as Array<[BrandLogoComposition, { width: number; height: number }]>) {
    assert.deepEqual(brandLogoDimensions(kind), dimensions);
    assert.deepEqual(brandLogoDimensions(kind, 'high-resolution'), { width: dimensions.width * 2, height: dimensions.height * 2 });
    const svg = buildBrandSvgConcept(brand, { kind, tagline: 'Trusted outcomes' });
    assert.match(svg, new RegExp(`viewBox="0 0 ${dimensions.width} ${dimensions.height}"`));
    assert.match(svg, new RegExp(`data-composition="${kind}"`));
  }
});

test('BrandForge styles are visually distinct deterministic SVG directions', () => {
  const styles: BrandLogoStyle[] = ['precision', 'editorial', 'impact', 'heritage'];
  const outputs = styles.map(style => buildBrandSvgConcept(brand, {
    kind: 'lockup',
    style,
    palette: 'brand',
    background: 'gradient',
    tagline: 'Trusted outcomes',
  }));
  assert.equal(new Set(outputs).size, styles.length);
  for (const [index, style] of styles.entries()) {
    assert.match(outputs[index]!, new RegExp(`data-mark-style="${style}"`));
    assert.match(outputs[index]!, new RegExp(`data-style="${style}"`));
  }
});

test('BrandForge color and background variants honor saved colors and transparent output', () => {
  const transparent = buildBrandSvgConcept(brand, {
    kind: 'wordmark',
    style: 'editorial',
    palette: 'brand',
    background: 'transparent',
    tagline: 'Proof <script>first</script>',
  });
  assert.match(transparent, /#123456/);
  assert.match(transparent, /#654321/);
  assert.match(transparent, /#abcdef/);
  assert.match(transparent, /data-background="transparent"/);
  assert.doesNotMatch(transparent, /<rect width="1200" height="400"/);
  assert.match(transparent, /Proof &lt;script&gt;first&lt;\/script&gt;/);
  assert.doesNotMatch(transparent, /<script>/);

  const monochrome = buildBrandSvgConcept(brand, { kind: 'badge', palette: 'monochrome', background: 'solid' });
  assert.match(monochrome, /data-palette="monochrome"/);
  assert.match(monochrome, /#111827/);
});

test('BrandForge rejects unsupported runtime variant values before they reach SVG attributes', () => {
  const svg = buildBrandSvgConcept(brand, {
    kind: 'wordmark',
    style: 'precision&quot; onload=&quot;alert(1)' as BrandLogoStyle,
    palette: 'not-a-palette' as never,
    background: 'not-a-background' as never,
    tagline: 'Safe tagline',
  });
  assert.match(svg, /data-style="precision"/);
  assert.match(svg, /data-palette="brand"/);
  assert.match(svg, /data-background="gradient"/);
  assert.doesNotMatch(svg, /onload=/);
});

test('BrandForge logo studio exposes accessible controls, real downloads, and honest handoffs', () => {
  assert.match(source, /aria-pressed=\{active\}/);
  assert.match(source, /Wide wordmark/);
  assert.match(source, /Stacked lockup/);
  assert.match(source, /Round badge/);
  assert.match(source, /Compact monogram/);
  assert.match(source, /Precision/);
  assert.match(source, /Editorial/);
  assert.match(source, /Impact/);
  assert.match(source, /Heritage/);
  assert.match(source, /Download editable SVG/);
  assert.match(source, /Download PNG/);
  assert.match(source, /High-resolution \(2×\)/);
  assert.match(source, /standard file handoff/);
  assert.match(source, /does not log in to or create a design inside either service/);
  assert.match(source, /existing logo stays in place until the check passes/i);
  assert.match(source, /canWrite/);
});
