import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { CASE_CATALOG_ENTRIES } from '../src/data/caseCatalog/entries';
import type { CaseCatalogEntry } from '../src/data/caseCatalog/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
export const OG_DIR = resolve(ROOT, 'public', 'og');
export const CASE_DIR = resolve(ROOT, 'public', 'case');

export const OG_HTML_GENERATED_COMMENT =
  '<!-- GENERATED FILE — do not edit by hand. Run `pnpm --filter @workspace/faultline-lab run prebuild` to regenerate. Source: scripts/generate-og.ts -->';

const CATEGORY_LABELS: Record<string, string> = {
  'windows-ad': 'Windows / Active Directory',
  networking: 'Networking / VPN',
  automotive: 'Automotive Diagnostics',
  electronics: 'Electronics / Sensor Mesh',
  servers: 'Servers / Services',
  mixed: 'Mixed Systems',
};

const CATEGORY_ACCENTS: Record<string, string> = {
  'windows-ad': '#22d3ee',
  networking: '#22d3ee',
  automotive: '#34d399',
  electronics: '#34d399',
  servers: '#22d3ee',
  mixed: '#34d399',
};

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: 'BEGINNER',
  intermediate: 'INTERMEDIATE',
  advanced: 'ADVANCED',
  expert: 'EXPERT',
};

export const W = 1200;
export const H = 630;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeHtml(s: string): string {
  return escapeXml(s);
}

function wrapText(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? current + ' ' + word : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    } else {
      current = candidate;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines) {
    const remainingIdx = words.indexOf(lines[lines.length - 1].split(' ').pop() ?? '') + 1;
    const remaining = words.slice(remainingIdx).join(' ');
    if (remaining) {
      let last = lines[lines.length - 1];
      while ((last + '…').length > maxCharsPerLine && last.length > 0) {
        last = last.slice(0, -1);
      }
      lines[lines.length - 1] = last + '…';
    }
  }
  return lines;
}

export function buildSvg(entry: CaseCatalogEntry): string {
  const accent = CATEGORY_ACCENTS[entry.category] ?? '#22d3ee';
  const categoryLabel = (CATEGORY_LABELS[entry.category] ?? entry.category).toUpperCase();
  const difficultyLabel = DIFFICULTY_LABELS[entry.difficulty] ?? entry.difficulty.toUpperCase();
  const titleLines = wrapText(entry.title, 28, 3);
  const titleStartY = 260;
  const lineHeight = 78;
  const titleSvg = titleLines
    .map(
      (line, i) =>
        `<text x="80" y="${titleStartY + i * lineHeight}" font-family="JetBrains Mono, Menlo, Consolas, monospace" font-size="64" font-weight="700" fill="#e4e4e7">${escapeXml(line)}</text>`,
    )
    .join('');

  const idLabel = entry.id.toUpperCase();

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a0e14"/>
      <stop offset="100%" stop-color="#11161f"/>
    </linearGradient>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1a2230" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.4"/>

  <!-- Brand stripe -->
  <rect x="0" y="0" width="14" height="${H}" fill="${accent}"/>

  <!-- Top bar: brand -->
  <text x="80" y="100" font-family="JetBrains Mono, Menlo, Consolas, monospace" font-size="22" font-weight="700" fill="${accent}" letter-spacing="4">FAULTLINE LAB</text>
  <text x="80" y="130" font-family="JetBrains Mono, Menlo, Consolas, monospace" font-size="14" fill="#52525b" letter-spacing="2">DIAGNOSTIC CHALLENGE PLATFORM</text>

  <!-- Category badge -->
  <rect x="80" y="170" width="${categoryLabel.length * 12 + 32}" height="40" rx="4" fill="${accent}" fill-opacity="0.12" stroke="${accent}" stroke-width="1"/>
  <text x="${80 + 16}" y="197" font-family="JetBrains Mono, Menlo, Consolas, monospace" font-size="16" fill="${accent}" letter-spacing="2">${escapeXml(categoryLabel)}</text>

  <!-- Title -->
  ${titleSvg}

  <!-- Footer: difficulty + estimated -->
  <line x1="80" y1="540" x2="${W - 80}" y2="540" stroke="#27272a" stroke-width="1"/>
  <text x="80" y="580" font-family="JetBrains Mono, Menlo, Consolas, monospace" font-size="18" fill="#a1a1aa" letter-spacing="2">${escapeXml(difficultyLabel)}  ·  ~${entry.estimatedMinutes} MIN</text>
  <text x="${W - 80}" y="580" text-anchor="end" font-family="JetBrains Mono, Menlo, Consolas, monospace" font-size="14" fill="#52525b" letter-spacing="2">${escapeXml(idLabel)}</text>
</svg>`;
}

export function renderPng(svg: string): Buffer {
  const resvg = new Resvg(svg, {
    background: '#0a0e14',
    fitTo: { mode: 'width', value: W },
    font: {
      loadSystemFonts: true,
      defaultFontFamily: 'JetBrains Mono',
    },
  });
  return resvg.render().asPng();
}

export function buildHtmlStub(entry: CaseCatalogEntry, basePath: string): string {
  const ogImage = `${basePath}og/case-${entry.slug}.png`;
  const canonical = `${basePath}case/${entry.slug}/`;
  const title = `${entry.title} — Faultline Lab`;
  const description = entry.shortSummary;
  const appUrl = `${basePath}?case=${encodeURIComponent(entry.slug)}`;
  return `<!DOCTYPE html>
${OG_HTML_GENERATED_COMMENT}
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="theme-color" content="#0a0e14" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${escapeHtml(canonical)}" />
<meta property="og:site_name" content="Faultline Lab" />
<meta property="og:type" content="article" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${escapeHtml(canonical)}" />
<meta property="og:image" content="${escapeHtml(ogImage)}" />
<meta property="og:image:width" content="${W}" />
<meta property="og:image:height" content="${H}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${escapeHtml(ogImage)}" />
<meta http-equiv="refresh" content="0; url=${escapeHtml(appUrl)}" />
<link rel="icon" type="image/svg+xml" href="${basePath}favicon.svg" />
<style>
  body { background: #0a0e14; color: #e4e4e7; font-family: 'JetBrains Mono', Menlo, monospace; padding: 48px; }
  a { color: #22d3ee; }
</style>
</head>
<body>
<noscript>
<h1>${escapeHtml(entry.title)}</h1>
<p>${escapeHtml(description)}</p>
<p><a href="${escapeHtml(appUrl)}">Open Faultline Lab →</a></p>
</noscript>
<script>window.location.replace(${JSON.stringify(appUrl)});</script>
</body>
</html>`;
}

export interface PlannedOgOutput {
  entry: CaseCatalogEntry;
  svg: string;
  html: string;
  pngPath: string;
  htmlPath: string;
}

export function getPlannedOgOutputs(basePath = '/'): PlannedOgOutput[] {
  const normalizedBase = basePath.endsWith('/') ? basePath : basePath + '/';
  const seenSlugs = new Set<string>();
  const outputs: PlannedOgOutput[] = [];
  for (const entry of CASE_CATALOG_ENTRIES) {
    if (entry.status !== 'playable') continue;
    if (seenSlugs.has(entry.slug)) {
      throw new Error(`Duplicate case slug: ${entry.slug}`);
    }
    seenSlugs.add(entry.slug);
    outputs.push({
      entry,
      svg: buildSvg(entry),
      html: buildHtmlStub(entry, normalizedBase),
      pngPath: resolve(OG_DIR, `case-${entry.slug}.png`),
      htmlPath: resolve(CASE_DIR, entry.slug, 'index.html'),
    });
  }
  return outputs;
}

function ensureCleanDir(dir: string): void {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  mkdirSync(dir, { recursive: true });
}

function main(): void {
  const basePath = process.env.BASE_PATH ?? '/';
  ensureCleanDir(OG_DIR);
  ensureCleanDir(CASE_DIR);

  const planned = getPlannedOgOutputs(basePath);
  let pngCount = 0;
  let htmlCount = 0;

  for (const out of planned) {
    const png = renderPng(out.svg);
    writeFileSync(out.pngPath, png);
    pngCount++;

    mkdirSync(dirname(out.htmlPath), { recursive: true });
    writeFileSync(out.htmlPath, out.html);
    htmlCount++;
  }

  console.log(
    `[og] generated ${pngCount} OG PNGs and ${htmlCount} share stubs (basePath=${basePath})`,
  );
}

const isDirectRun =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectRun) {
  main();
}
