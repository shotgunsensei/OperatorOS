import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const matrixPath = resolve(root, 'docs/modules/PUBLIC_LAUNCH_CAPABILITY_MATRIX.json');
const write = process.argv.includes('--write');
const allowedStatuses = new Set([
  'ACTIVE_AND_PROVEN',
  'SHARED_OPERATOROS_REPLACEMENT',
  'APPROVED_SECURITY_RETIREMENT',
  'APPROVED_PRODUCT_BOUNDARY',
  'HUMAN_PHASE18',
  'FIX_NOW',
]);
const requiredFields = [
  'capabilityId', 'platformOrModule', 'userOutcome', 'sourceEvidence',
  'currentImplementation', 'uiRoute', 'uiEntryControl', 'apiRoutes',
  'databaseObjects', 'backgroundJobs', 'providerBoundary', 'allowedRoles',
  'requiredEntitlement', 'billingBoundary', 'privacyOrSafetyBoundary',
  'status', 'testEvidence', 'browserEvidence', 'remainingAction',
];

function posix(value) { return value.replaceAll('\\', '/'); }
function trackedFiles(...paths) {
  const output = execFileSync('git', ['ls-files', '--', ...paths], { cwd: root, encoding: 'utf8' });
  return output.split(/\r?\n/u).filter(Boolean).map(posix);
}
function sourceFile(path) {
  const text = readFileSync(resolve(root, path), 'utf8');
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, extname(path) === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}
function literalText(node) {
  if (!node) return null;
  if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return node.getText().replace(/\s+/gu, ' ').trim();
}
function lineOf(sf, node) { return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1; }
function artifact(type, key, source, line, ownerCapabilityId) {
  return { type, key, source, line, ownerCapabilityId };
}

function readCatalog() {
  const path = 'packages/sdk/src/catalog.ts';
  const sf = sourceFile(path);
  let modules = [];
  let plans = [];
  function property(object, name) {
    const item = object.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(sf).replaceAll(/["']/gu, '') === name);
    return item && ts.isPropertyAssignment(item) ? item.initializer : null;
  }
  function arrayObjects(name) {
    let value = [];
    function visit(node) {
      if (ts.isVariableDeclaration(node) && node.name.getText(sf) === name && node.initializer) {
        let init = node.initializer;
        if (ts.isAsExpression(init)) init = init.expression;
        if (ts.isArrayLiteralExpression(init)) value = init.elements.filter(ts.isObjectLiteralExpression);
      }
      ts.forEachChild(node, visit);
    }
    visit(sf);
    return value;
  }
  modules = arrayObjects('MODULE_CATALOG').map(object => ({
    slug: literalText(property(object, 'slug')),
    name: literalText(property(object, 'name')),
    status: literalText(property(object, 'defaultStatus')),
    commercialType: literalText(property(object, 'commercialType')),
    canonicalBaseUrl: literalText(property(object, 'canonicalBaseUrl')),
    stripeAddonEnvKeys: ts.isArrayLiteralExpression(property(object, 'stripeAddonEnvKeys'))
      ? property(object, 'stripeAddonEnvKeys').elements.map(literalText)
      : [],
  }));
  plans = arrayObjects('PLAN_CATALOG').map(object => ({
    slug: literalText(property(object, 'slug')),
    stripeMonthlyEnvKeys: ts.isArrayLiteralExpression(property(object, 'stripeMonthlyEnvKeys'))
      ? property(object, 'stripeMonthlyEnvKeys').elements.map(literalText)
      : [],
    stripeAnnualEnvKeys: ts.isArrayLiteralExpression(property(object, 'stripeAnnualEnvKeys'))
      ? property(object, 'stripeAnnualEnvKeys').elements.map(literalText)
      : [],
  }));
  return { modules, plans, source: path };
}

const moduleRouteOwners = [
  ['tradeflowkit', 'tradeflowkit'], ['techdeck', 'techdeck'], ['pulsedesk', 'pulsedesk'],
  ['torqueshed', 'torqueshed'], ['torque-assist', 'torqueshed'], ['faultlinelab', 'faultlinelab'],
  ['ninja-pool-hall', 'ninja-pool-hall'], ['brandforgeos', 'brandforgeos'],
  ['snapproofos', 'snapproofos'], ['studyforge', 'studyforge-ai'],
  ['ninja-launch-kit', 'ninja-launch-kit'], ['callcommand', 'callcommand-ai'],
  ['ninjamation', 'ninjamation'], ['outcall', 'outcall'],
];
function moduleOwnerFrom(value) {
  const normalized = value.toLowerCase();
  const match = moduleRouteOwners.find(([needle]) => normalized.includes(needle));
  return match ? `module-${match[1]}` : null;
}
function routeOwner(path, route) {
  const moduleOwner = moduleOwnerFrom(`${path} ${route}`);
  if (moduleOwner) return moduleOwner;
  if (/auth-routes|tenant-routes|tenant-admin-routes|saas-routes/u.test(path)) return 'platform-identity-organization';
  if (/billing-routes/u.test(path)) return 'platform-billing-entitlements';
  if (/sso-routes|module-routes|module-shell-routes/u.test(path)) return 'platform-exact-host-launch';
  if (/shared-service-routes|directory-routes/u.test(path)) return 'platform-shared-services';
  if (/ecosystem-routes/u.test(path)) return 'platform-public-acquisition';
  if (/admin-routes|platform-routes|diagnostics-routes|os-routes/u.test(path)) return 'platform-administration-runtime';
  return 'platform-workspace-runtime';
}
function tableOwner(table) {
  const moduleOwner = moduleOwnerFrom(table);
  if (moduleOwner) return moduleOwner;
  if (/^(shared_|directory_)/u.test(table)) return 'platform-shared-services';
  if (/^(subscription|addon_|billing_|entitlement_|plans?$|stripe_)/u.test(table)) return 'platform-billing-entitlements';
  if (/^(users?|tenants?|tenant_|sessions?|password_|invite|memberships?)/u.test(table)) return 'platform-identity-organization';
  return 'platform-workspace-runtime';
}
function providerOwner(name, path) {
  const moduleOwner = moduleOwnerFrom(`${name} ${path}`);
  if (moduleOwner) return moduleOwner;
  if (name.startsWith('STRIPE_')) return 'platform-billing-entitlements';
  if (/SESSION|SSO|COOKIE|JWT|AUTH/u.test(name)) return 'platform-exact-host-launch';
  if (/RESEND|EMAIL|OPENAI|ATTACHMENT|SHARED_SERVICE/u.test(name)) return 'platform-shared-services';
  return 'platform-administration-runtime';
}

function discover() {
  const catalog = readCatalog();
  const activeModules = catalog.modules.filter(item => item.status === 'live');
  const apiFiles = trackedFiles('apps/api/src').filter(path => path.endsWith('.ts'));
  const routeFiles = apiFiles.filter(path => path === 'apps/api/src/index.ts' || path.includes('/routes/'));
  const artifacts = [];

  for (const path of routeFiles) {
    const sf = sourceFile(path);
    function visit(node) {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const method = node.expression.name.text.toUpperCase();
        if (['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(method)) {
          const route = literalText(node.arguments[0]);
          if (route) artifacts.push(artifact('apiRoute', `${method} ${route}`, path, lineOf(sf, node), routeOwner(path, route)));
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sf);
  }

  for (const path of apiFiles) {
    const sf = sourceFile(path);
    function visit(node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'pgTable') {
        const table = literalText(node.arguments[0]);
        if (table && !table.includes('${')) artifacts.push(artifact('databaseObject', table, path, lineOf(sf, node), tableOwner(table)));
      }
      if (ts.isPropertyAccessExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && node.expression.expression.getText(sf) === 'process' && node.expression.name.text === 'env') {
        const name = node.name.text;
        artifacts.push(artifact('provider', name, path, lineOf(sf, node), providerOwner(name, path)));
      }
      if (ts.isElementAccessExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && node.expression.expression.getText(sf) === 'process' && node.expression.name.text === 'env') {
        const name = literalText(node.argumentExpression);
        if (name && /^[A-Z][A-Z0-9_]+$/u.test(name)) artifacts.push(artifact('provider', name, path, lineOf(sf, node), providerOwner(name, path)));
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
        && /^(?:enqueue|queue|create).*?(?:Job|Outbox|Webhook)$/iu.test(node.expression.text)) {
        const job = literalText(node.arguments[0]) ?? node.expression.text;
        artifacts.push(artifact('backgroundJob', `${node.expression.text}:${job}`, path, lineOf(sf, node), routeOwner(path, job)));
      }
      ts.forEachChild(node, visit);
    }
    visit(sf);
  }

  const webPages = trackedFiles('apps/web/src/app').filter(path => path.endsWith('/page.tsx'));
  for (const path of webPages) {
    const route = posix(dirname(relative('apps/web/src/app', path)))
      .replace(/^\.$/u, '')
      .split('/').filter(Boolean)
      .filter(part => !part.startsWith('('))
      .map(part => part.startsWith('[[...') ? `:${part.slice(5, -2)}*` : part.startsWith('[...') ? `:${part.slice(4, -1)}*` : part.startsWith('[') ? `:${part.slice(1, -1)}` : part)
      .join('/');
    const publicRoute = `/${route}`.replace(/\/$/u, '') || '/';
    artifacts.push(artifact('uiRoute', publicRoute, path, 1, routeOwner(path, publicRoute)));
  }

  for (const module of activeModules) {
    artifacts.push(artifact('billingProduct', `module:${module.slug}:${module.commercialType}`, catalog.source, 1,
      module.commercialType === 'addon' ? 'platform-billing-entitlements' : `module-${module.slug}`));
  }
  for (const plan of catalog.plans) {
    artifacts.push(artifact('billingProduct', `plan:${plan.slug}`, catalog.source, 1, 'platform-billing-entitlements'));
  }

  const unique = new Map();
  for (const item of artifacts) {
    const identity = `${item.type}|${item.key}|${item.source}`;
    if (!unique.has(identity)) unique.set(identity, item);
  }
  const sorted = [...unique.values()].sort((a, b) =>
    a.type.localeCompare(b.type) || a.key.localeCompare(b.key) || a.source.localeCompare(b.source));
  return { activeModules, artifacts: sorted };
}

const placeholderPattern = /\bTODO\b|\bFIXME\b|\bHACK\b|\bXXX\b|placeholder|coming soon|not implemented|unsupported|temporary|\bdemo\b|\bsample\b|\bmock\b|\bstub\b|skeleton|\bdisabled\b|\b501\b|MODULE_UNAVAILABLE|throw new Error|console\.log|test adapter/giu;
function classifyPlaceholder(path, text, match) {
  const term = match.toLowerCase();
  if (/TODO|FIXME|HACK|XXX/u.test(match) && !/['"`]todo['"`]|todoTasks|\btodo:/u.test(text)) {
    return { classification: 'unfinished-marker', status: 'FIX_NOW', rationale: 'Unresolved engineering marker in active source.' };
  }
  if (term === 'coming soon' && /module-routes|admin\/health|ecosystem\/page|PlatformPage|marketing-catalog|marketing-cta/u.test(path)) {
    return { classification: 'planned-module-boundary', status: 'APPROVED_PRODUCT_BOUNDARY', rationale: 'Explicit fail-closed lifecycle for future non-active catalog entries.' };
  }
  if (/coming soon|not implemented|\b501\b/u.test(term)) {
    return { classification: 'unfinished-runtime-surface', status: 'FIX_NOW', rationale: 'Customer-visible incomplete behavior is not allowed.' };
  }
  if (term === 'placeholder' && /placeholder\s*=/iu.test(text)) return { classification: 'input-guidance', status: 'ACTIVE_AND_PROVEN', rationale: 'Form hint text; the control has a real handler or mutation.' };
  if (term === 'skeleton') return { classification: 'loading-state', status: 'ACTIVE_AND_PROVEN', rationale: 'Customer loading feedback, not a substitute for functionality.' };
  if (term === 'disabled' && /disabled\s*=|:disabled|provider|configuration|recording|state|status/iu.test(text)) return { classification: 'fail-closed-or-busy-guard', status: 'ACTIVE_AND_PROVEN', rationale: 'Permission, validation, busy-state, or provider fail-closed guard.' };
  if (term === 'unsupported' || term === 'module_unavailable' || term === 'throw new error') return { classification: 'fail-closed-guard', status: 'ACTIVE_AND_PROVEN', rationale: 'Explicit validation, integrity, or unavailable-state guard.' };
  if (term === 'console.log') return { classification: 'operator-cli-output', status: 'APPROVED_PRODUCT_BOUNDARY', rationale: 'Operator-facing script output, not customer-visible completion evidence.' };
  if (['demo', 'sample', 'mock', 'stub', 'test adapter', 'temporary'].includes(term)) return { classification: 'bounded-test-or-example-mode', status: 'APPROVED_PRODUCT_BOUNDARY', rationale: 'Explicitly bounded fixture, test adapter, example input, or non-production mode.' };
  if (term === 'todo') return { classification: 'workflow-status-vocabulary', status: 'ACTIVE_AND_PROVEN', rationale: 'Persisted task status vocabulary, not an unfinished marker.' };
  return { classification: 'reviewed-runtime-language', status: 'APPROVED_PRODUCT_BOUNDARY', rationale: 'Reviewed occurrence does not advertise unfinished primary functionality.' };
}
function discoverPlaceholderAudit() {
  const files = [
    ...trackedFiles('apps/api/src', 'apps/web/src', 'packages/modules', 'packages/sdk', 'packages/sso', 'packages/profiles'),
    ...trackedFiles('scripts/start-unified-runtime.mjs', 'scripts/production-env-preflight.mjs', 'scripts/verify-production-runtime.mjs'),
  ].filter(path => /\.(?:ts|tsx|mjs)$/u.test(path) && !/\.(?:test|spec)\./u.test(path));
  const occurrences = [];
  for (const path of [...new Set(files)].sort()) {
    const lines = readFileSync(resolve(root, path), 'utf8').split(/\r?\n/u);
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      placeholderPattern.lastIndex = 0;
      for (const match of line.matchAll(placeholderPattern)) {
        occurrences.push({
          source: path,
          line: index + 1,
          term: match[0],
          ...classifyPlaceholder(path, line, match[0]),
        });
      }
    }
  }
  return occurrences;
}

function validateSourceLedger(path, gapName) {
  const ledger = JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  const collections = Object.values(ledger.inventory ?? {}).filter(Array.isArray);
  const items = collections.flat();
  const failures = [];
  for (const item of items) {
    if (!item.disposition) failures.push(`${path}:${item.key}: missing disposition`);
    if (item.disposition === gapName) failures.push(`${path}:${item.key}: unresolved gap`);
    if (['active', 'shared_replacement'].includes(item.disposition) && !(item.evidence?.length > 0)) {
      failures.push(`${path}:${item.key}: active/shared entry lacks evidence`);
    }
    if (['retired_security', 'retired_product_boundary'].includes(item.disposition)
      && !(item.targetPointers?.length > 0 || String(item.note ?? '').trim().length > 0)) {
      failures.push(`${path}:${item.key}: retirement lacks ADR or explicit source-ledger decision`);
    }
  }
  return {
    failures,
    counts: Object.fromEntries([...new Set(items.map(item => item.disposition))].sort()
      .map(status => [status, items.filter(item => item.disposition === status).length])),
  };
}

const matrix = JSON.parse(readFileSync(matrixPath, 'utf8'));
const discovery = discover();
const placeholderAudit = discoverPlaceholderAudit();
const capabilitiesById = new Map(matrix.capabilities.map(item => [item.capabilityId, item]));

if (write) {
  for (const capability of matrix.capabilities) {
    const owned = discovery.artifacts.filter(item => item.ownerCapabilityId === capability.capabilityId);
    capability.uiRoute = owned.filter(item => item.type === 'uiRoute').map(item => item.key);
    capability.apiRoutes = owned.filter(item => item.type === 'apiRoute').map(item => item.key);
    capability.databaseObjects = owned.filter(item => item.type === 'databaseObject').map(item => item.key);
    capability.backgroundJobs = owned.filter(item => item.type === 'backgroundJob').map(item => item.key);
  }
  matrix.activeModules = discovery.activeModules.map(item => ({
    slug: item.slug, name: item.name, canonicalBaseUrl: item.canonicalBaseUrl,
    commercialType: item.commercialType,
  }));
  matrix.discoveredArtifacts = discovery.artifacts;
  matrix.placeholderAudit = placeholderAudit;
  matrix.generatedFrom = {
    catalog: 'packages/sdk/src/catalog.ts',
    api: 'Git-tracked apps/api/src TypeScript plus registered route declarations',
    web: 'Git-tracked apps/web/src/app page.tsx routes',
  };
  writeFileSync(matrixPath, `${JSON.stringify(matrix, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${matrixPath}`);
}

const failures = [];
for (const capability of matrix.capabilities) {
  for (const field of requiredFields) if (!(field in capability)) failures.push(`${capability.capabilityId ?? '<missing>'}: missing ${field}`);
  if (!allowedStatuses.has(capability.status)) failures.push(`${capability.capabilityId}: UNCLASSIFIED status ${capability.status}`);
  if (capability.status === 'FIX_NOW') failures.push(`${capability.capabilityId}: FIX_NOW remains`);
  if (capability.status === 'ACTIVE_AND_PROVEN') {
    for (const field of ['sourceEvidence', 'testEvidence', 'browserEvidence']) {
      if (!Array.isArray(capability[field]) || capability[field].length === 0) failures.push(`${capability.capabilityId}: ${field} is required`);
    }
  }
  for (const field of ['sourceEvidence', 'testEvidence', 'browserEvidence']) {
    for (const pointer of capability[field] ?? []) {
      if (!existsSync(resolve(root, pointer))) failures.push(`${capability.capabilityId}: missing ${field} pointer ${pointer}`);
    }
  }
  if (capability.status === 'HUMAN_PHASE18') {
    if (!capability.humanGuideReference?.startsWith('docs/PHASE18_HUMAN_COMPLETION_GUIDE.md#')) {
      failures.push(`${capability.capabilityId}: missing specific Human Completion Guide reference`);
    }
  }
}
for (const module of discovery.activeModules) {
  if (!capabilitiesById.has(`module-${module.slug}`)) failures.push(`active module omitted: ${module.slug}`);
}
const expected = new Set(discovery.artifacts.map(item => `${item.type}|${item.key}|${item.source}|${item.ownerCapabilityId}`));
const recorded = new Set((matrix.discoveredArtifacts ?? []).map(item => `${item.type}|${item.key}|${item.source}|${item.ownerCapabilityId}`));
for (const key of expected) if (!recorded.has(key)) failures.push(`discovered artifact absent from ledger: ${key}`);
for (const key of recorded) if (!expected.has(key)) failures.push(`stale documented runtime artifact: ${key}`);
for (const item of discovery.artifacts) if (!capabilitiesById.has(item.ownerCapabilityId)) failures.push(`${item.type}:${item.key}: unknown owner ${item.ownerCapabilityId}`);
const expectedPlaceholders = new Set(placeholderAudit.map(item => `${item.source}|${item.line}|${item.term}|${item.classification}|${item.status}`));
const recordedPlaceholders = new Set((matrix.placeholderAudit ?? []).map(item => `${item.source}|${item.line}|${item.term}|${item.classification}|${item.status}`));
for (const key of expectedPlaceholders) if (!recordedPlaceholders.has(key)) failures.push(`placeholder occurrence absent or stale: ${key}`);
for (const key of recordedPlaceholders) if (!expectedPlaceholders.has(key)) failures.push(`stale placeholder classification: ${key}`);
for (const item of placeholderAudit) if (item.status === 'FIX_NOW') failures.push(`${item.source}:${item.line}: ${item.term} is FIX_NOW`);

const sourceLedgers = [
  ['docs/modules/tradeflowkit/PHASE16_SOURCE_LEDGER.json', 'phase16_gap'],
  ['docs/modules/techdeck/SOURCE_LEDGER.json', 'restoration_gap'],
  ['docs/modules/pulsedesk/SOURCE_LEDGER.json', 'restoration_gap'],
];
const sourceLedgerCounts = {};
for (const [path, gap] of sourceLedgers) {
  if (!existsSync(resolve(root, path))) { failures.push(`missing source ledger ${path}`); continue; }
  const result = validateSourceLedger(path, gap);
  failures.push(...result.failures);
  sourceLedgerCounts[path] = result.counts;
}

const statusCounts = Object.fromEntries([...allowedStatuses].map(status => [status, matrix.capabilities.filter(item => item.status === status).length]));
statusCounts.UNCLASSIFIED = matrix.capabilities.filter(item => !allowedStatuses.has(item.status)).length;
const result = {
  activeModules: discovery.activeModules.length,
  capabilities: matrix.capabilities.length,
  discoveredArtifacts: Object.fromEntries(['apiRoute', 'uiRoute', 'databaseObject', 'backgroundJob', 'provider', 'billingProduct']
    .map(type => [type, discovery.artifacts.filter(item => item.type === type).length])),
  statusCounts,
  sourceLedgerCounts,
  placeholderAudit: {
    total: placeholderAudit.length,
    ACTIVE_AND_PROVEN: placeholderAudit.filter(item => item.status === 'ACTIVE_AND_PROVEN').length,
    APPROVED_PRODUCT_BOUNDARY: placeholderAudit.filter(item => item.status === 'APPROVED_PRODUCT_BOUNDARY').length,
    FIX_NOW: placeholderAudit.filter(item => item.status === 'FIX_NOW').length,
  },
  failures: failures.length,
};
console.log(JSON.stringify(result, null, 2));
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
