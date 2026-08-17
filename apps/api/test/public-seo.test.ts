import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const WEB_ROOT = resolve(import.meta.dirname, '..', '..', 'web');

function read(relativePath: string): string {
  const path = resolve(WEB_ROOT, relativePath);
  assert.ok(existsSync(path), `Expected SEO file to exist: ${relativePath}`);
  return readFileSync(path, 'utf8');
}

test('public SEO · sitemap lists only the intended indexable routes', () => {
  const sitemap = read('src/app/sitemap.ts');
  for (const path of ['/', '/pricing', '/modules', '/ecosystem', '/how-it-works', '/privacy', '/terms']) {
    assert.match(sitemap, new RegExp(`path: '${path.replace(/\//g, '\\/')}'`));
  }
  for (const privatePath of ['/app', '/admin', '/sso', '/invites', '/portfolio', '/john']) {
    assert.doesNotMatch(sitemap, new RegExp(`path: '${privatePath.replace(/\//g, '\\/')}'`));
  }
  assert.doesNotMatch(sitemap, /new Date/, 'sitemap should not claim a fresh modification time on every request');
});

test('public SEO · robots references the sitemap and excludes private surfaces', () => {
  const robots = read('src/app/robots.ts');
  assert.match(robots, /sitemap:\s*absoluteUrl\('\/sitemap\.xml'\)/);
  for (const path of ['/app', '/admin', '/platform', '/apps', '/invites', '/login', '/sso', '/portfolio', '/john']) {
    assert.match(robots, new RegExp(`'${path.replace(/\//g, '\\/')}'`));
  }
});

test('public SEO · every primary marketing route has distinct metadata', () => {
  const routeMetadata = new Map([
    ['/', read('src/app/layout.tsx')],
    ['/pricing', read('src/app/pricing/page.tsx')],
    ['/how-it-works', read('src/app/how-it-works/layout.tsx')],
    ['/ecosystem', read('src/app/ecosystem/layout.tsx')],
    ['/modules', read('src/app/modules/layout.tsx')],
    ['/privacy', read('src/app/privacy/page.tsx')],
    ['/terms', read('src/app/terms/page.tsx')],
  ]);

  const titles = new Set<string>();
  for (const [path, source] of routeMetadata) {
    assert.match(source, /buildPublicMetadata/, `${path} should use the shared public metadata contract`);
    if (path !== '/') assert.match(source, new RegExp(`path: '${path.replace(/\//g, '\\/')}'`));
    const title = source.match(/title:\s*'([^']+)'/)?.[1];
    assert.ok(title, `${path} should declare a title`);
    assert.ok(!titles.has(title), `${path} title should be unique`);
    titles.add(title);
  }
});

test('public SEO · social image and truthful JSON-LD are wired into initial HTML', () => {
  const seo = read('src/lib/seo.ts');
  const rootLayout = read('src/app/layout.tsx');
  const home = read('src/app/page.tsx');
  const pricing = read('src/app/pricing/page.tsx');

  assert.ok(existsSync(resolve(WEB_ROOT, 'src/app/opengraph-image.tsx')));
  assert.match(seo, /summary_large_image/);
  assert.match(rootLayout, /globalJsonLd/);
  assert.match(home, /softwareApplicationJsonLd/);
  assert.match(pricing, /FAQPage/);
  assert.match(pricing, /marketingPricingFaqs\.map/);
  assert.doesNotMatch(seo, /SearchAction/, 'schema must not advertise site search that does not exist');
  assert.doesNotMatch(seo, /aggregateRating/, 'schema must not advertise ratings that do not exist');
});

test('public SEO · footer module links target public module-card anchors', () => {
  const footer = read('src/components/marketing/MarketingFooter.tsx');
  const grid = read('src/components/marketing/sections/ModuleGatewayGrid.tsx');

  for (const slug of ['tradeflowkit', 'techdeck', 'pulsedesk', 'ninjamation']) {
    assert.match(footer, new RegExp(`/modules#module-${slug}`));
  }
  assert.match(grid, /id=\{`module-\$\{m\.slug\}`\}/);
  assert.match(grid, /scrollMarginTop:\s*96/);
});