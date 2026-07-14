import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppView } from '../src/types';
import {
  ROUTE_SEO,
  CANONICAL_ORIGIN,
  buildCaseSeo,
  type CaseSeo,
} from '../src/lib/seo';
import { CASE_CATALOG_ENTRIES } from '../src/data/caseCatalog/entries';
import type { CaseCatalogEntry } from '../src/data/caseCatalog/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
export const DIST = resolve(ROOT, 'dist', 'public');
export const SOURCE_INDEX = resolve(DIST, 'index.html');
export const DEFAULT_OG_IMAGE = '/og-image.jpg';

export interface PrerenderTarget {
  view: AppView;
  outPath: string;
}

export const PRERENDER_TARGETS: PrerenderTarget[] = [
  { view: 'boot', outPath: 'index.html' },
  { view: 'store', outPath: 'store/index.html' },
  { view: 'pricing', outPath: 'pricing/index.html' },
  { view: 'daily', outPath: 'daily/index.html' },
  { view: 'sandbox', outPath: 'sandbox/index.html' },
];

function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function replaceTitle(html: string, title: string): string {
  return html.replace(
    /<title>[\s\S]*?<\/title>/,
    `<title>${escapeHtmlText(title)}</title>`,
  );
}

function replaceMetaName(html: string, name: string, content: string): string {
  const re = new RegExp(`<meta\\s+name=["']${name}["'][^>]*>`, 'i');
  const tag = `<meta name="${name}" content="${escapeHtmlAttr(content)}" />`;
  return re.test(html) ? html.replace(re, tag) : html.replace('</head>', `    ${tag}\n  </head>`);
}

function replaceMetaProperty(html: string, property: string, content: string): string {
  const re = new RegExp(`<meta\\s+property=["']${property}["'][^>]*>`, 'i');
  const tag = `<meta property="${property}" content="${escapeHtmlAttr(content)}" />`;
  return re.test(html) ? html.replace(re, tag) : html.replace('</head>', `    ${tag}\n  </head>`);
}

function setCanonical(html: string, href: string): string {
  const re = /<link\s+rel=["']canonical["'][^>]*>/i;
  const tag = `<link rel="canonical" href="${escapeHtmlAttr(href)}" />`;
  return re.test(html) ? html.replace(re, tag) : html.replace('</head>', `    ${tag}\n  </head>`);
}

export function renderRoute(sourceHtml: string, view: AppView): string {
  const seo = ROUTE_SEO[view];
  const url = `${CANONICAL_ORIGIN}${seo.path}`;
  const ogTitle = seo.ogTitle ?? seo.title;
  const ogDescription = seo.ogDescription ?? seo.description;
  const ogImage = `${CANONICAL_ORIGIN}${DEFAULT_OG_IMAGE}`;

  let html = sourceHtml;
  html = replaceTitle(html, seo.title);
  html = replaceMetaName(html, 'description', seo.description);
  html = replaceMetaProperty(html, 'og:title', ogTitle);
  html = replaceMetaProperty(html, 'og:description', ogDescription);
  html = replaceMetaProperty(html, 'og:url', url);
  html = replaceMetaProperty(html, 'og:image', ogImage);
  html = replaceMetaProperty(html, 'og:type', 'website');
  html = replaceMetaName(html, 'twitter:title', ogTitle);
  html = replaceMetaName(html, 'twitter:description', ogDescription);
  html = replaceMetaName(html, 'twitter:image', ogImage);
  html = setCanonical(html, url);
  return html;
}

function renderCase(sourceHtml: string, seo: CaseSeo): string {
  const url = `${CANONICAL_ORIGIN}${seo.path}`;
  const ogImageUrl = `${CANONICAL_ORIGIN}${seo.ogImage}`;

  let html = sourceHtml;
  html = replaceTitle(html, seo.title);
  html = replaceMetaName(html, 'description', seo.description);
  html = replaceMetaProperty(html, 'og:title', seo.ogTitle);
  html = replaceMetaProperty(html, 'og:description', seo.ogDescription);
  html = replaceMetaProperty(html, 'og:url', url);
  html = replaceMetaProperty(html, 'og:image', ogImageUrl);
  html = replaceMetaProperty(html, 'og:image:width', String(seo.ogImageWidth));
  html = replaceMetaProperty(html, 'og:image:height', String(seo.ogImageHeight));
  html = replaceMetaProperty(html, 'og:type', seo.ogType);
  html = replaceMetaName(html, 'twitter:title', seo.ogTitle);
  html = replaceMetaName(html, 'twitter:description', seo.ogDescription);
  html = replaceMetaName(html, 'twitter:image', ogImageUrl);
  html = setCanonical(html, url);
  return html;
}

function playableCases(): CaseCatalogEntry[] {
  const seen = new Set<string>();
  const out: CaseCatalogEntry[] = [];
  for (const entry of CASE_CATALOG_ENTRIES) {
    if (entry.status !== 'playable') continue;
    if (seen.has(entry.slug)) {
      throw new Error(`[prerender-seo] Duplicate case slug: ${entry.slug}`);
    }
    seen.add(entry.slug);
    out.push(entry);
  }
  return out;
}

function main(): void {
  if (!existsSync(SOURCE_INDEX)) {
    throw new Error(
      `[prerender-seo] expected ${SOURCE_INDEX} to exist. Run \`vite build\` first.`,
    );
  }
  const sourceHtml = readFileSync(SOURCE_INDEX, 'utf8');

  let routeCount = 0;
  for (const target of PRERENDER_TARGETS) {
    const html = renderRoute(sourceHtml, target.view);
    const outFile = resolve(DIST, target.outPath);
    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, html);
    routeCount++;
  }

  let caseCount = 0;
  for (const entry of playableCases()) {
    const seo = buildCaseSeo(entry);
    const html = renderCase(sourceHtml, seo);
    const outFile = resolve(DIST, 'case', entry.slug, 'index.html');
    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, html);
    caseCount++;
  }

  console.log(
    `[prerender-seo] wrote ${routeCount} route snapshots and ${caseCount} per-case snapshots into ${DIST}`,
  );
}

const isDirectRun =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectRun) {
  main();
}
