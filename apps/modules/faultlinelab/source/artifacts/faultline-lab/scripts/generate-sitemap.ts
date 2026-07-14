import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTE_SEO, CANONICAL_ORIGIN, buildCaseSeo } from '../src/lib/seo';
import type { AppView } from '../src/types';
import { CASE_CATALOG_ENTRIES } from '../src/data/caseCatalog/entries';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
export const SITEMAP_OUT_PATH = resolve(ROOT, 'public', 'sitemap.xml');

export const SITEMAP_GENERATED_COMMENT =
  '<!-- GENERATED FILE — do not edit by hand. Run `pnpm --filter @workspace/faultline-lab run prebuild` to regenerate. Source: scripts/generate-sitemap.ts -->';

interface RouteMeta {
  changefreq: string;
  priority: string;
}

const ROUTE_META: Partial<Record<AppView, RouteMeta>> = {
  'incident-board': { changefreq: 'weekly', priority: '1.0' },
  store: { changefreq: 'weekly', priority: '0.8' },
  pricing: { changefreq: 'monthly', priority: '0.9' },
  daily: { changefreq: 'daily', priority: '0.8' },
  sandbox: { changefreq: 'monthly', priority: '0.6' },
  auth: { changefreq: 'yearly', priority: '0.4' },
  profile: { changefreq: 'monthly', priority: '0.4' },
  settings: { changefreq: 'yearly', priority: '0.3' },
};

const EXCLUDED_VIEWS: ReadonlySet<AppView> = new Set<AppView>([
  'boot',
  'investigation',
  'debrief',
  'admin',
  'account',
]);

const DEFAULT_META: RouteMeta = { changefreq: 'monthly', priority: '0.5' };

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildSitemapXml(): string {
  const seen = new Set<string>();
  const entries: { loc: string; meta: RouteMeta }[] = [];

  for (const view of Object.keys(ROUTE_SEO) as AppView[]) {
    if (EXCLUDED_VIEWS.has(view)) continue;
    const seo = ROUTE_SEO[view];
    if (seen.has(seo.path)) continue;
    seen.add(seo.path);
    entries.push({
      loc: `${CANONICAL_ORIGIN}${seo.path}`,
      meta: ROUTE_META[view] ?? DEFAULT_META,
    });
  }

  const caseMeta: RouteMeta = { changefreq: 'monthly', priority: '0.7' };
  const seenCaseSlugs = new Set<string>();
  for (const entry of CASE_CATALOG_ENTRIES) {
    if (entry.status !== 'playable') continue;
    if (seenCaseSlugs.has(entry.slug)) continue;
    seenCaseSlugs.add(entry.slug);
    const seo = buildCaseSeo(entry);
    const loc = `${CANONICAL_ORIGIN}${seo.path}`;
    if (seen.has(seo.path)) continue;
    seen.add(seo.path);
    entries.push({ loc, meta: caseMeta });
  }

  const urls = entries
    .map(
      ({ loc, meta }) =>
        `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <changefreq>${meta.changefreq}</changefreq>\n    <priority>${meta.priority}</priority>\n  </url>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n${SITEMAP_GENERATED_COMMENT}\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function main(): void {
  const xml = buildSitemapXml();
  writeFileSync(SITEMAP_OUT_PATH, xml, 'utf8');
  console.log(`[sitemap] wrote ${SITEMAP_OUT_PATH}`);
}

const isDirectRun =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectRun) {
  main();
}
