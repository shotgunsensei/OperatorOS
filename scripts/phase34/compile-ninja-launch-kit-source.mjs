import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();
const sourceRoot = path.join(root, 'apps', 'modules', 'ninja-launch-kit', 'source', 'artifacts', 'api-server', 'src', 'lib');
const templatePath = path.join(sourceRoot, 'launch-templates.ts');
const visualPath = path.join(sourceRoot, 'visual-promo.ts');
const outputPath = path.join(root, 'apps', 'api', 'src', 'generated', 'ninja-launch-kit-source-catalog.ts');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function extractArray(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error(`Missing source marker: ${marker}`);
  const start = source.indexOf('[', markerIndex + marker.length);
  if (start < 0) throw new Error(`Missing array after source marker: ${marker}`);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '[') depth += 1;
    if (char === ']') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Unterminated array after source marker: ${marker}`);
}

function evaluateLiteral(literal, label) {
  try {
    return vm.runInNewContext(`(${literal})`, Object.create(null), { timeout: 1_000 });
  } catch (error) {
    throw new Error(`Could not evaluate trusted pinned ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseVisualDefinitions(source) {
  const literal = extractArray(source, 'const allBriefs: VisualBrief[] =');
  const records = [];
  const objectPattern = /\{\s*id:\s*"([^"]+)"[\s\S]*?title:\s*"([^"]+)"[\s\S]*?category:\s*"(image|brand)"[\s\S]*?dimensions:\s*(null|"(?:\\.|[^"])*")[\s\S]*?tools:\s*(\[[^\]]*\])/g;
  for (const match of literal.matchAll(objectPattern)) {
    records.push({
      id: match[1],
      title: match[2],
      category: match[3],
      dimensions: match[4] === 'null' ? null : evaluateLiteral(match[4], 'visual dimensions'),
      tools: evaluateLiteral(match[5], 'visual tools'),
    });
  }
  return records;
}

const [templateSource, visualSource] = await Promise.all([
  readFile(templatePath, 'utf8'),
  readFile(visualPath, 'utf8'),
]);
const templates = evaluateLiteral(extractArray(templateSource, 'export const LAUNCH_TEMPLATES: LaunchTemplate[] ='), 'template catalog');
const categories = evaluateLiteral(extractArray(templateSource, 'export const TEMPLATE_CATEGORIES ='), 'template categories');
const visualPromos = parseVisualDefinitions(visualSource);

if (!Array.isArray(templates) || templates.length !== 20) {
  throw new Error(`Pinned Ninja Launch Kit template contract expected 20 templates; found ${templates?.length ?? 'invalid'}`);
}
if (!Array.isArray(visualPromos) || visualPromos.length !== 9) {
  throw new Error(`Pinned Ninja Launch Kit visual-promo contract expected 9 briefs; found ${visualPromos?.length ?? 'invalid'}`);
}
const slugs = new Set(templates.map((template) => template.slug));
if (slugs.size !== templates.length) throw new Error('Pinned Ninja Launch Kit template slugs are not unique');
const visualIds = new Set(visualPromos.map((brief) => brief.id));
if (visualIds.size !== visualPromos.length) throw new Error('Pinned Ninja Launch Kit visual-promo ids are not unique');

const catalog = {
  schemaVersion: 1,
  source: {
    snapshot: 'apps/modules/ninja-launch-kit/source/SOURCE_SNAPSHOT.json',
    templates: path.relative(root, templatePath).replaceAll('\\', '/'),
    visualPromos: path.relative(root, visualPath).replaceAll('\\', '/'),
    templatesSha256: sha256(templateSource),
    visualPromosSha256: sha256(visualSource),
  },
  counts: { templates: templates.length, visualPromos: visualPromos.length },
  categories,
  templates,
  visualPromos,
};
const rendered = `// Generated from the pinned, read-only Ninja Launch Kit source. Do not edit.\nconst catalog = ${JSON.stringify(catalog, null, 2)} as const;\n\nexport default catalog;\n`;

if (process.argv.includes('--write')) {
  await writeFile(outputPath, rendered, 'utf8');
  console.log(`Wrote ${path.relative(root, outputPath)} (${templates.length} templates, ${visualPromos.length} visual promos)`);
} else {
  const existing = await readFile(outputPath, 'utf8').catch(() => '');
  if (existing !== rendered) {
    throw new Error('Generated Ninja Launch Kit source catalog is stale. Run pnpm phase34:catalog:write.');
  }
  console.log(`Verified compiler-derived Ninja Launch Kit catalog: ${templates.length} templates, ${visualPromos.length} visual promos`);
}
