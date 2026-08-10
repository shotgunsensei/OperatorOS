import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const BUILD_ROOT = join(REPOSITORY_ROOT, 'build', 'parity');
export const SOURCE_DISCOVERY_PATH = join(BUILD_ROOT, 'source-discovery.json');
export const TARGET_DISCOVERY_PATH = join(BUILD_ROOT, 'target-discovery.json');
export const COMPILED_LEDGER_PATH = join(BUILD_ROOT, 'compiled-ledger.json');
export const ISSUE_REPORT_PATH = join(BUILD_ROOT, 'parity-issues.json');
export const PHASE20_MANIFEST_PATH = join(REPOSITORY_ROOT, 'docs', 'parity', 'source-manifest.json');
export const WAIVERS_PATH = join(REPOSITORY_ROOT, 'docs', 'parity', 'OWNER_WAIVERS.yml');
export const ALLOWED_STATES = new Set([
  'ACTIVE_NATIVE',
  'ACTIVE_SHARED_EQUIVALENT',
  'OWNER_WAIVED',
  'BLOCKED',
]);

const CODE_EXTENSIONS = new Set(['.cjs', '.js', '.jsx', '.mjs', '.ts', '.tsx']);
const TEST_PATTERN = /(?:^|\/)(?:e2e|test|tests)(?:\/|$)|\.(?:spec|test)\.[cm]?[jt]sx?$/iu;
const TARGET_ROOTS = [
  'apps/api/src',
  'apps/api/test',
  'apps/runner-gateway/src',
  'apps/web/src',
  'apps/web/e2e',
  'packages',
  'scripts',
];
const ROUTE_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const FORBIDDEN_CONTROL_PATTERNS = [
  {
    code: 'TODO_ONLY_ACTION',
    pattern: /(?:onClick|onSubmit)\s*=\s*\{\s*(?:\(\s*\)\s*=>\s*)?\{?\s*(?:\/\/\s*)?TODO\b|(?:onClick|onSubmit)\s*=\s*\{\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}/giu,
  },
  {
    code: 'COMING_SOON_COMPLETION_MARKER',
    pattern: /\b(?:coming\s+soon|not\s+implemented|placeholder\s+(?:action|feature)|todo-only)\b/giu,
  },
  {
    code: 'UNSUPPORTED_SUCCESS_TOAST',
    pattern: /(?:toast|notify|message)\s*\([^\n]{0,160}\b(?:success|completed|saved)\b[^\n]{0,160}\)[^\n]{0,120}(?:TODO|coming\s+soon|not\s+implemented)/giu,
  },
  {
    code: 'HARD_CODED_FEATURE_COUNT',
    pattern: /\b\d{1,4}\s+(?:features?|capabilities|modules?|routes?|integrations?)\b/giu,
  },
];

export function normalizePath(value) {
  return String(value).replaceAll('\\', '/');
}

export function repoPath(absolute) {
  return normalizePath(relative(REPOSITORY_ROOT, absolute));
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, stableJson(value), 'utf8');
}

export function walk(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files.sort((left, right) => normalizePath(left).localeCompare(normalizePath(right)));
}

export function sourceFingerprint(sourceRoot) {
  const files = walk(sourceRoot);
  const hash = createHash('sha256');
  let totalBytes = 0;
  for (const file of files) {
    const bytes = readFileSync(file);
    const pathBytes = Buffer.from(normalizePath(relative(sourceRoot, file)), 'utf8');
    const length = Buffer.alloc(8);
    length.writeBigUInt64BE(BigInt(bytes.length));
    hash.update(pathBytes);
    hash.update(Buffer.from([0]));
    hash.update(length);
    hash.update(bytes);
    totalBytes += bytes.length;
  }
  return {
    algorithm: 'sha256(path NUL uint64be(size) content)',
    treeSha256: hash.digest('hex'),
    fileCount: files.length,
    totalBytes,
  };
}

function scriptKind(path) {
  const extension = extname(path).toLowerCase();
  if (extension === '.tsx') return ts.ScriptKind.TSX;
  if (extension === '.jsx') return ts.ScriptKind.JSX;
  if (extension === '.js' || extension === '.mjs' || extension === '.cjs') return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function literal(node) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function sourceAdapterFor(module) {
  if (module.moduleSlug === 'outcall') return 'missing-source-readme-v1';
  if (['pulsedesk', 'techdeck', 'tradeflowkit'].includes(module.moduleSlug)) return 'legacy-ledger-plus-ast-v1';
  if (module.moduleSlug === 'faultlinelab') return 'faultline-runnable-case-v1';
  if (module.moduleSlug === 'torqueshed') return 'torqueshed-expo-plus-web-v1';
  if (module.moduleSlug === 'ninjamation') return 'composite-automation-product-v1';
  return 'typescript-product-v1';
}

function stateCounts(capabilities) {
  return Object.fromEntries([...ALLOWED_STATES].map((state) => [
    state,
    capabilities.filter((capability) => capability.state === state).length,
  ]));
}

function typeCounts(capabilities) {
  const types = [...new Set(capabilities.map((capability) => capability.type))].sort();
  return Object.fromEntries(types.map((type) => [
    type,
    capabilities.filter((capability) => capability.type === type).length,
  ]));
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function discoverSource({ manifestPath = PHASE20_MANIFEST_PATH } = {}) {
  const manifest = readJson(manifestPath);
  const modules = [];
  const drift = [];
  for (const entry of manifest.modules) {
    const ledgerPath = join(REPOSITORY_ROOT, entry.ledger);
    if (!existsSync(ledgerPath)) {
      drift.push({ code: 'MISSING_PHASE20_LEDGER', moduleSlug: entry.moduleSlug, path: entry.ledger });
      continue;
    }
    const ledger = readJson(ledgerPath);
    const sourceRoot = join(REPOSITORY_ROOT, ledger.sourceRoot);
    const freshFingerprint = sourceFingerprint(sourceRoot);
    const freshStateCounts = stateCounts(ledger.capabilities);
    const freshTypeCounts = typeCounts(ledger.capabilities);
    const freshCapabilityDigestSha256 = sha256(JSON.stringify(ledger.capabilities));
    if (!sameJson(freshFingerprint, ledger.sourceFingerprint)) {
      drift.push({
        code: 'SOURCE_DRIFT',
        moduleSlug: ledger.moduleSlug,
        expected: ledger.sourceFingerprint,
        actual: freshFingerprint,
      });
    }
    if (freshCapabilityDigestSha256 !== ledger.capabilityDigestSha256) {
      drift.push({
        code: 'CAPABILITY_DIGEST_DRIFT',
        moduleSlug: ledger.moduleSlug,
        expected: ledger.capabilityDigestSha256,
        actual: freshCapabilityDigestSha256,
      });
    }
    if (!sameJson(freshStateCounts, ledger.stateCounts) || !sameJson(freshTypeCounts, ledger.typeCounts)) {
      drift.push({ code: 'STALE_MODULE_COUNTS', moduleSlug: ledger.moduleSlug });
    }
    modules.push({
      adapterId: sourceAdapterFor(ledger),
      moduleSlug: ledger.moduleSlug,
      moduleName: ledger.moduleName,
      ledgerPath: entry.ledger,
      sourceRoot: ledger.sourceRoot,
      provenance: ledger.provenance,
      expectedFingerprint: ledger.sourceFingerprint,
      freshFingerprint,
      expectedCapabilityDigestSha256: ledger.capabilityDigestSha256,
      freshCapabilityDigestSha256,
      stateCounts: freshStateCounts,
      typeCounts: freshTypeCounts,
      capabilities: ledger.capabilities,
    });
  }
  const capabilities = modules.flatMap((module) => module.capabilities);
  const totals = {
    modules: modules.length,
    capabilities: capabilities.length,
    stateCounts: stateCounts(capabilities),
    typeCounts: typeCounts(capabilities),
    unclassified: capabilities.filter((capability) => !ALLOWED_STATES.has(capability.state)).length,
  };
  if (!sameJson(totals, manifest.totals)) drift.push({ code: 'STALE_MANIFEST_COUNTS', expected: manifest.totals, actual: totals });
  return {
    schemaVersion: 1,
    generatedBy: 'scripts/parity/discover-source.mjs',
    phase20Manifest: repoPath(manifestPath),
    manifest,
    totals,
    drift,
    modules,
  };
}

function resolveTemplate(node, constants) {
  if (!node) return null;
  const direct = literal(node);
  if (direct != null) return direct;
  if (ts.isIdentifier(node)) return constants.get(node.text) ?? null;
  if (ts.isTemplateExpression(node)) {
    let value = node.head.text;
    for (const span of node.templateSpans) {
      const expression = ts.isIdentifier(span.expression)
        ? constants.get(span.expression.text) ?? `:${span.expression.text}`
        : `:${span.expression.getText()}`;
      value += expression + span.literal.text;
    }
    return value;
  }
  return null;
}

function nextRouteFor(path) {
  const normalized = normalizePath(path);
  const marker = 'apps/web/src/app/';
  if (!normalized.startsWith(marker) || !/(?:page|route)\.[jt]sx?$/u.test(normalized)) return null;
  const relativeRoute = normalized.slice(marker.length).replace(/\/(?:page|route)\.[jt]sx?$/u, '');
  const route = `/${relativeRoute}`
    .replace(/\/(?:\([^/]+\))(?=\/|$)/gu, '')
    .replace(/\[\[\.\.\.([^\]]+)\]\]/gu, ':$1*?')
    .replace(/\[\.\.\.([^\]]+)\]/gu, ':$1*')
    .replace(/\[([^\]]+)\]/gu, ':$1')
    .replace(/\/+/gu, '/');
  return route === '/' || route.length > 1 ? route : '/';
}

function parseTargetFile(absolute) {
  const path = repoPath(absolute);
  const extension = extname(absolute).toLowerCase();
  const bytes = readFileSync(absolute);
  const record = {
    path,
    bytes: bytes.length,
    sha256: sha256(bytes),
    routes: [],
    schemas: [],
    tests: [],
    controls: [],
    forbiddenPatterns: [],
  };
  if (!CODE_EXTENSIONS.has(extension)) return record;
  const text = bytes.toString('utf8');
  const sourceFile = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, scriptKind(absolute));
  const constants = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      const value = resolveTemplate(declaration.initializer, constants);
      if (value != null) constants.set(declaration.name.text, value);
    }
  }
  const nextRoute = nextRouteFor(path);
  if (nextRoute) {
    record.routes.push({
      routeId: `next:${nextRoute}:${path}`,
      kind: path.endsWith('/route.ts') || path.endsWith('/route.js') ? 'next-handler' : 'next-page',
      method: path.endsWith('/route.ts') || path.endsWith('/route.js') ? 'ANY' : 'GET',
      path: nextRoute,
      sourcePath: path,
      line: 1,
      authenticated: nextRoute.startsWith('/app') || nextRoute.startsWith('/modules'),
    });
  }
  for (const match of text.matchAll(/\b(?:pgTable|sqliteTable|mysqlTable)\s*\(\s*['"]([^'"]+)['"]/gu)) {
    record.schemas.push({ schemaId: `table:${match[1]}:${path}`, kind: 'table', name: match[1], sourcePath: path });
  }
  for (const match of text.matchAll(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+["`]?([A-Za-z0-9_.-]+)["`]?/giu)) {
    record.schemas.push({ schemaId: `table:${match[1]}:${path}`, kind: 'table', name: match[1], sourcePath: path });
  }
  for (const item of FORBIDDEN_CONTROL_PATTERNS) {
    for (const match of text.matchAll(item.pattern)) {
      const prefix = text.slice(0, match.index);
      const line = prefix.split(/\r?\n/u).length;
      record.forbiddenPatterns.push({ code: item.code, sourcePath: path, line, excerpt: match[0].replace(/\s+/gu, ' ').slice(0, 180) });
    }
  }
  function visit(node, describePath = []) {
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      let property = null;
      let modifier = null;
      if (ts.isIdentifier(expression)) property = expression.text;
      if (ts.isPropertyAccessExpression(expression)) {
        property = expression.name.text;
        if (ts.isPropertyAccessExpression(expression.expression)) modifier = expression.name.text;
        else if (ts.isIdentifier(expression.expression)) modifier = property;
      }
      const method = ts.isPropertyAccessExpression(expression) ? expression.name.text.toUpperCase() : '';
      const route = resolveTemplate(node.arguments[0], constants);
      if (ROUTE_METHODS.has(method) && route?.startsWith('/')) {
        record.routes.push({
          routeId: `fastify:${method}:${route}:${path}:${lineOf(sourceFile, node)}`,
          kind: 'fastify-route',
          method,
          path: route,
          sourcePath: path,
          line: lineOf(sourceFile, node),
          authenticated: !/(?:\/public\/|\/healthz$|\/readyz$|\/login|\/register)/u.test(route),
        });
      }
      const isTest = property === 'test' || property === 'it' || (
        ts.isPropertyAccessExpression(expression) && ['test', 'it'].includes(expression.expression.getText(sourceFile))
      );
      const isDescribe = property === 'describe' || (
        ts.isPropertyAccessExpression(expression) && expression.expression.getText(sourceFile) === 'describe'
      );
      const title = literal(node.arguments[0]);
      if (isTest && title) {
        const fullTitle = [...describePath, title].join(' > ');
        const line = lineOf(sourceFile, node);
        record.tests.push({
          testId: `test:${path}:${line}:${sha256(fullTitle).slice(0, 12)}`,
          title: fullTitle,
          sourcePath: path,
          line,
          skipped: modifier === 'skip' || expression.getText(sourceFile).includes('.skip'),
        });
      }
      const nextDescribePath = isDescribe && title ? [...describePath, title] : describePath;
      ts.forEachChild(node, (child) => visit(child, nextDescribePath));
      return;
    }
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const tag = opening.tagName.getText(sourceFile);
      if (['button', 'Button', 'a', 'Link', 'form', 'Form'].includes(tag)) {
        const attributes = Object.fromEntries(opening.attributes.properties
          .filter(ts.isJsxAttribute)
          .map((attribute) => {
            const name = attribute.name.getText(sourceFile);
            if (!attribute.initializer) return [name, ''];
            if (ts.isStringLiteral(attribute.initializer)) return [name, attribute.initializer.text];
            if (ts.isJsxExpression(attribute.initializer)) return [name, attribute.initializer.expression?.getText(sourceFile) ?? ''];
            return [name, attribute.initializer.getText(sourceFile)];
          }));
        const label = attributes['aria-label'] || attributes.title || attributes.href || attributes.to || tag;
        const line = lineOf(sourceFile, node);
        record.controls.push({
          controlId: `control:${path}:${line}:${sha256(`${tag}|${label}`).slice(0, 12)}`,
          tag,
          label,
          href: attributes.href || attributes.to || null,
          handler: attributes.onClick || attributes.onSubmit || null,
          type: attributes.type || null,
          disabled: Object.hasOwn(attributes, 'disabled'),
          sourcePath: path,
          line,
        });
      }
    }
    ts.forEachChild(node, (child) => visit(child, describePath));
  }
  visit(sourceFile);
  record.routes.sort((left, right) => left.routeId.localeCompare(right.routeId));
  record.schemas.sort((left, right) => left.schemaId.localeCompare(right.schemaId));
  record.tests.sort((left, right) => left.testId.localeCompare(right.testId));
  record.controls.sort((left, right) => left.controlId.localeCompare(right.controlId));
  return record;
}

export function discoverTarget() {
  const absoluteFiles = TARGET_ROOTS.flatMap((targetRoot) => walk(join(REPOSITORY_ROOT, targetRoot)))
    .filter((path, index, paths) => paths.indexOf(path) === index)
    .filter((path) => !normalizePath(path).includes('/apps/modules/'))
    .filter((path) => !normalizePath(path).includes('/node_modules/'))
    .filter((path) => !normalizePath(path).includes('/.next/'));
  const files = absoluteFiles.map(parseTargetFile).sort((left, right) => left.path.localeCompare(right.path));
  const routes = files.flatMap((file) => file.routes).sort((left, right) => left.routeId.localeCompare(right.routeId));
  const schemas = files.flatMap((file) => file.schemas).sort((left, right) => left.schemaId.localeCompare(right.schemaId));
  const tests = files.flatMap((file) => file.tests).sort((left, right) => left.testId.localeCompare(right.testId));
  const controls = files.flatMap((file) => file.controls).sort((left, right) => left.controlId.localeCompare(right.controlId));
  const forbiddenPatterns = files.flatMap((file) => file.forbiddenPatterns)
    .sort((left, right) => `${left.sourcePath}:${left.line}:${left.code}`.localeCompare(`${right.sourcePath}:${right.line}:${right.code}`));
  return {
    schemaVersion: 1,
    generatedBy: 'scripts/parity/discover-target.mjs',
    roots: TARGET_ROOTS,
    totals: {
      files: files.length,
      routes: routes.length,
      schemas: schemas.length,
      tests: tests.length,
      controls: controls.length,
      forbiddenPatterns: forbiddenPatterns.length,
    },
    digestSha256: sha256(JSON.stringify(files)),
    files,
    routes,
    schemas,
    tests,
    controls,
    forbiddenPatterns,
  };
}

export function readWaivers() {
  return JSON.parse(readFileSync(WAIVERS_PATH, 'utf8'));
}

function issue(code, message, capability = null, extra = {}) {
  return {
    code,
    severity: 'error',
    moduleSlug: capability?.moduleSlug ?? extra.moduleSlug ?? null,
    capabilityId: capability?.capabilityId ?? null,
    message,
    ...extra,
  };
}

function compileCapability(capability, fileByPath, testsByPath, routesByPath, schemasByPath, waiverByCapability) {
  const issues = [];
  const implementationFiles = capability.currentTargets.map((path) => {
    const file = fileByPath.get(path) ?? null;
    if (!existsSync(join(REPOSITORY_ROOT, path))) issues.push(issue('MISSING_TARGET_FILE', `Missing target file ${path}`, capability, { path }));
    return file ? { path, sha256: file.sha256 } : { path, sha256: null };
  });
  const routeIds = capability.currentTargets.flatMap((path) => routesByPath.get(path) ?? []).map((route) => route.routeId);
  const schemaIds = capability.currentTargets.flatMap((path) => schemasByPath.get(path) ?? []).map((schema) => schema.schemaId);
  const evidence = capability.automatedEvidence.map((path) => {
    if (!existsSync(join(REPOSITORY_ROOT, path))) issues.push(issue('MISSING_EVIDENCE_FILE', `Missing evidence file ${path}`, capability, { path }));
    const tests = testsByPath.get(path) ?? [];
    const runnable = tests.filter((test) => !test.skipped);
    if (tests.length === 0) issues.push(issue('MISSING_TEST_ID', `Evidence file has no discovered test IDs: ${path}`, capability, { path }));
    if (tests.length > 0 && runnable.length === 0) issues.push(issue('REQUIRED_TESTS_SKIPPED', `Every discovered test ID is skipped in ${path}`, capability, { path }));
    return { path, testIds: runnable.map((test) => test.testId) };
  });
  const testIds = [...new Set(evidence.flatMap((entry) => entry.testIds))].sort();
  const active = capability.state === 'ACTIVE_NATIVE' || capability.state === 'ACTIVE_SHARED_EQUIVALENT';
  if (active && implementationFiles.length === 0) issues.push(issue('MISSING_MAPPING', 'Active capability has no implementation mapping', capability));
  if (active && evidence.length === 0) issues.push(issue('MISSING_EVIDENCE', 'Active capability has no automated evidence file', capability));
  if (active && testIds.length === 0) issues.push(issue('MISSING_TEST_ID', 'Active capability has no runnable automated test ID', capability));
  if (active && ['api_endpoint', 'public_flow', 'ui_route'].includes(capability.type) && routeIds.length === 0) {
    issues.push(issue('MISSING_TARGET_ROUTE', 'Active route capability has no discoverable target route ID', capability, { paths: capability.currentTargets }));
  }
  if (active && capability.type === 'database_table' && schemaIds.length === 0) {
    issues.push(issue('MISSING_TARGET_SCHEMA', 'Active database capability has no discoverable target schema ID', capability, { paths: capability.currentTargets }));
  }
  const originalUserOutcome = String(capability.title ?? '').trim();
  const compatibilityAssertion = capability.state === 'ACTIVE_SHARED_EQUIVALENT'
    ? String(capability.note ?? '').trim()
    : null;
  if (capability.state === 'ACTIVE_SHARED_EQUIVALENT' && !originalUserOutcome) {
    issues.push(issue('MISSING_ORIGINAL_USER_OUTCOME', 'Shared equivalent lacks the original user outcome', capability));
  }
  if (capability.state === 'ACTIVE_SHARED_EQUIVALENT' && !compatibilityAssertion) {
    issues.push(issue('MISSING_COMPATIBILITY_ASSERTION', 'Shared equivalent lacks a compatibility assertion', capability));
  }
  if (capability.state === 'BLOCKED') issues.push(issue('BLOCKED_REQUIRED', `Required capability remains blocked (${capability.blockerCode ?? 'missing blocker code'})`, capability));
  if (capability.state === 'OWNER_WAIVED') {
    const waiver = waiverByCapability.get(capability.capabilityId);
    if (!waiver || waiver.waiverId !== capability.ownerWaiverId) {
      issues.push(issue('UNAPPROVED_WAIVER', 'OWNER_WAIVED capability lacks an exact approved waiver', capability));
    }
    if (waiver?.expiresAt && Date.parse(waiver.expiresAt) <= Date.now()) issues.push(issue('EXPIRED_WAIVER', `Waiver ${waiver.waiverId} is expired`, capability));
  }
  return {
    capabilityId: capability.capabilityId,
    moduleSlug: capability.moduleSlug,
    type: capability.type,
    title: capability.title,
    required: capability.state !== 'OWNER_WAIVED',
    state: capability.state,
    blockerCode: capability.blockerCode,
    source: {
      canonicalIdentity: capability.canonicalSourceIdentity,
      pointers: capability.sourcePointers,
      missingPointers: capability.missingSourcePointers,
      line: capability.sourceLine,
    },
    mapping: {
      implementationFiles,
      routeIds: [...new Set(routeIds)].sort(),
      schemaIds: [...new Set(schemaIds)].sort(),
    },
    evidence: {
      files: evidence,
      testIds,
    },
    originalUserOutcome,
    compatibilityAssertion,
    ownerWaiverId: capability.ownerWaiverId,
    priorDisposition: capability.priorDisposition,
    note: capability.note,
    issues,
  };
}

export function buildCompiledLedger(sourceDiscovery, targetDiscovery, waivers = readWaivers()) {
  const fileByPath = new Map(targetDiscovery.files.map((file) => [file.path, file]));
  const testsByPath = new Map(targetDiscovery.files.map((file) => [file.path, file.tests]));
  const routesByPath = new Map(targetDiscovery.files.map((file) => [file.path, file.routes]));
  const schemasByPath = new Map(targetDiscovery.files.map((file) => [file.path, file.schemas]));
  const waiverByCapability = new Map();
  for (const waiver of waivers.waivers ?? []) {
    for (const capabilityId of waiver.capabilityIds ?? []) waiverByCapability.set(capabilityId, waiver);
  }
  const modules = sourceDiscovery.modules.map((module) => {
    const capabilities = module.capabilities.map((capability) => compileCapability(
      capability,
      fileByPath,
      testsByPath,
      routesByPath,
      schemasByPath,
      waiverByCapability,
    ));
    return {
      moduleSlug: module.moduleSlug,
      moduleName: module.moduleName,
      adapterId: module.adapterId,
      sourceRoot: module.sourceRoot,
      sourceFingerprint: module.freshFingerprint,
      stateCounts: stateCounts(capabilities),
      capabilities,
    };
  });
  const capabilities = modules.flatMap((module) => module.capabilities);
  const issues = [
    ...sourceDiscovery.drift.map((drift) => issue(drift.code, `${drift.code} detected`, null, drift)),
    ...capabilities.flatMap((capability) => capability.issues),
  ];
  const ids = new Set();
  for (const capability of capabilities) {
    if (ids.has(capability.capabilityId)) issues.push(issue('DUPLICATE_CAPABILITY_ID', `Duplicate capability ID ${capability.capabilityId}`, capability));
    ids.add(capability.capabilityId);
    if (!ALLOWED_STATES.has(capability.state)) issues.push(issue('INVALID_STATE', `Invalid state ${capability.state}`, capability));
  }
  for (const waiver of waivers.waivers ?? []) {
    for (const capabilityId of waiver.capabilityIds ?? []) {
      if (!ids.has(capabilityId)) issues.push(issue('UNKNOWN_WAIVED_CAPABILITY', `Waiver ${waiver.waiverId} references unknown capability ${capabilityId}`));
    }
  }
  const totals = {
    modules: modules.length,
    capabilities: capabilities.length,
    stateCounts: stateCounts(capabilities),
    issueCounts: Object.fromEntries([...new Set(issues.map((entry) => entry.code))].sort().map((code) => [
      code,
      issues.filter((entry) => entry.code === code).length,
    ])),
  };
  return {
    schemaVersion: 1,
    generatedBy: 'scripts/parity/build-ledger.mjs',
    sourceDiscoveryDigestSha256: sha256(JSON.stringify(sourceDiscovery.modules)),
    targetDiscoveryDigestSha256: targetDiscovery.digestSha256,
    waiverDigestSha256: sha256(JSON.stringify(waivers)),
    totals,
    modules,
    issues,
  };
}

export function effectiveIssues(ledger) {
  return ledger.issues;
}

export function issueSummary(issues) {
  return Object.fromEntries([...new Set(issues.map((entry) => entry.code))].sort().map((code) => [
    code,
    issues.filter((entry) => entry.code === code).length,
  ]));
}

export function createNegativeFixture(name, sourceDiscovery, targetDiscovery, waivers) {
  const source = structuredClone(sourceDiscovery);
  const target = structuredClone(targetDiscovery);
  const waiverData = structuredClone(waivers);
  const capabilities = source.modules.flatMap((module) => module.capabilities);
  const active = capabilities.find((capability) => capability.state === 'ACTIVE_NATIVE');
  const shared = capabilities.find((capability) => capability.state === 'ACTIVE_SHARED_EQUIVALENT');
  if (name === 'source-drift') source.drift.push({ code: 'SOURCE_DRIFT', moduleSlug: source.modules[0].moduleSlug, fixture: true });
  else if (name === 'missing-mapping') active.currentTargets = [];
  else if (name === 'missing-target') active.currentTargets = ['fixtures/removed-implementation.ts'];
  else if (name === 'missing-route') {
    const routed = capabilities.find((capability) => capability.state.startsWith('ACTIVE_')
      && ['api_endpoint', 'public_flow', 'ui_route'].includes(capability.type)
      && capability.currentTargets.some((path) => target.files.find((file) => file.path === path)?.routes.length));
    if (!routed) throw new Error('No active routed capability is available for the controlled fixture');
    for (const path of routed.currentTargets) {
      const file = target.files.find((entry) => entry.path === path);
      if (file) file.routes = [];
    }
  } else if (name === 'missing-schema') {
    const schemed = capabilities.find((capability) => capability.state.startsWith('ACTIVE_')
      && capability.type === 'database_table'
      && capability.currentTargets.some((path) => target.files.find((file) => file.path === path)?.schemas.length));
    if (!schemed) throw new Error('No active schema capability is available for the controlled fixture');
    for (const path of schemed.currentTargets) {
      const file = target.files.find((entry) => entry.path === path);
      if (file) file.schemas = [];
    }
  }
  else if (name === 'missing-evidence') active.automatedEvidence = [];
  else if (name === 'missing-test-id') {
    const evidencePath = active.automatedEvidence[0];
    const targetFile = target.files.find((file) => file.path === evidencePath);
    if (targetFile) targetFile.tests = [];
  } else if (name === 'tests-skipped') {
    const evidencePath = active.automatedEvidence[0];
    const targetFile = target.files.find((file) => file.path === evidencePath);
    if (targetFile) targetFile.tests = targetFile.tests.map((test) => ({ ...test, skipped: true }));
  } else if (name === 'duplicate-id') source.modules[0].capabilities.push(structuredClone(source.modules[0].capabilities[0]));
  else if (name === 'unapproved-waiver') {
    active.state = 'OWNER_WAIVED';
    active.ownerWaiverId = 'OW-2099-999';
  } else if (name === 'stale-counts') source.drift.push({ code: 'STALE_MANIFEST_COUNTS', fixture: true });
  else if (name === 'shared-outcome') shared.title = '';
  else if (name === 'shared-compatibility') shared.note = '';
  else if (name === 'blocked-required') active.state = 'BLOCKED';
  else throw new Error(`Unknown negative fixture: ${name}`);
  return { source, target, waivers: waiverData };
}

export function buildAll() {
  const source = discoverSource();
  const target = discoverTarget();
  const waivers = readWaivers();
  const ledger = buildCompiledLedger(source, target, waivers);
  return { source, target, waivers, ledger };
}

export function writeBuildArtifacts({ source, target, ledger }) {
  writeJson(SOURCE_DISCOVERY_PATH, source);
  writeJson(TARGET_DISCOVERY_PATH, target);
  writeJson(COMPILED_LEDGER_PATH, ledger);
  writeJson(ISSUE_REPORT_PATH, {
    schemaVersion: 1,
    total: ledger.issues.length,
    counts: issueSummary(ledger.issues),
    issues: ledger.issues,
  });
}

export function fileMetadata(path) {
  if (!existsSync(path)) return null;
  const stat = statSync(path);
  const bytes = readFileSync(path);
  return { path: repoPath(path), bytes: stat.size, sha256: sha256(bytes) };
}

export { TEST_PATTERN };
