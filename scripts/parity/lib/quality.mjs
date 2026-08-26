import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  REPOSITORY_ROOT,
  sha256,
} from './compiler.mjs';

export const VISUAL_CONTRACT_PATH = join(REPOSITORY_ROOT, 'docs', 'parity', 'visual-contracts.json');
export const VISUAL_APPROVAL_PATH = join(REPOSITORY_ROOT, 'docs', 'parity', 'visual-baseline-approvals.json');
export const REQUIRED_VIEWPORTS = Object.freeze([
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tablet', width: 1024, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]);

function qualityIssue(code, message, extra = {}) {
  return { code, severity: 'error', message, ...extra };
}

export function validateControlIntegrity(ledger, targetDiscovery) {
  const activeCapabilities = ledger.modules.flatMap((module) => module.capabilities)
    .filter((capability) => capability.state.startsWith('ACTIVE_'));
  const activeTargetPaths = new Set(activeCapabilities.flatMap((capability) =>
    capability.mapping.implementationFiles.map((file) => file.path)));
  const issues = [];
  const forbiddenPatterns = targetDiscovery.forbiddenPatterns.filter((pattern) =>
    activeTargetPaths.has(pattern.sourcePath)
    // Generated catalogs embed immutable source-authored prose and fixtures.
    // Numeric phrases inside those serialized payloads are not maintained UI
    // feature-count claims; all other forbidden completion markers still apply.
    && !(pattern.code === 'HARD_CODED_FEATURE_COUNT' && pattern.sourcePath.startsWith('apps/api/src/generated/')));
  for (const pattern of forbiddenPatterns) {
    issues.push(qualityIssue(pattern.code, `${pattern.sourcePath}:${pattern.line} ${pattern.excerpt}`, pattern));
  }
  const activeFiles = targetDiscovery.files.filter((file) => activeTargetPaths.has(file.path));
  for (const file of activeFiles) {
    for (const control of file.controls) {
      if (['a', 'Link'].includes(control.tag) && (!control.href || /^(?:#|javascript:|\{?\s*['"]?\s*['"]?\s*\}?)$/iu.test(control.href))) {
        issues.push(qualityIssue('INVALID_ANCHOR_TARGET', `${control.sourcePath}:${control.line} anchor has no valid target`, control));
      }
      if (['button', 'Button'].includes(control.tag) && !control.handler && control.type !== 'submit' && !control.disabled) {
        issues.push(qualityIssue('DEAD_BUTTON_STATIC', `${control.sourcePath}:${control.line} button has no handler, submit type, or disabled state`, control));
      }
    }
  }
  const routeIds = [...new Set(activeCapabilities.flatMap((capability) => capability.mapping.routeIds))].sort();
  const routeById = new Map(targetDiscovery.routes.map((route) => [route.routeId, route]));
  const crawlRoutes = routeIds.map((routeId) => routeById.get(routeId)).filter(Boolean);
  const routeCapabilities = activeCapabilities.filter((capability) => ['api_endpoint', 'public_flow', 'ui_route'].includes(capability.type));
  for (const capability of routeCapabilities) {
    if (capability.mapping.routeIds.length === 0) {
      issues.push(qualityIssue('ROUTE_NOT_CRAWLABLE', `${capability.capabilityId} has no executable target route ID`, {
        moduleSlug: capability.moduleSlug,
        capabilityId: capability.capabilityId,
      }));
    }
  }
  return {
    schemaVersion: 1,
    activeTargetFiles: activeTargetPaths.size,
    activeRouteCapabilities: routeCapabilities.length,
    crawlRoutes,
    issues,
  };
}

export function readVisualContracts() {
  return JSON.parse(readFileSync(VISUAL_CONTRACT_PATH, 'utf8'));
}

export function readVisualApprovals() {
  return JSON.parse(readFileSync(VISUAL_APPROVAL_PATH, 'utf8'));
}

export function validateVisualContracts(contracts, approvals, { checkFiles = true } = {}) {
  const issues = [];
  const seenModules = new Set();
  const approvalByPath = new Map((approvals.approvals ?? []).map((approval) => [approval.baselinePath, approval]));
  if (contracts.schemaVersion !== 1 || !Array.isArray(contracts.modules)) {
    issues.push(qualityIssue('INVALID_VISUAL_CONTRACT_SCHEMA', 'visual-contracts.json must use schemaVersion 1 and a modules array'));
    return issues;
  }
  for (const module of contracts.modules) {
    if (seenModules.has(module.moduleSlug)) issues.push(qualityIssue('DUPLICATE_VISUAL_MODULE', `Duplicate visual module ${module.moduleSlug}`));
    seenModules.add(module.moduleSlug);
    if (!module.criticalRoute?.startsWith('/')) issues.push(qualityIssue('INVALID_VISUAL_ROUTE', `${module.moduleSlug} lacks a valid critical route`, { moduleSlug: module.moduleSlug }));
    if (!Array.isArray(module.sourceReferences) || module.sourceReferences.length === 0) {
      issues.push(qualityIssue('MISSING_VISUAL_SOURCE_REFERENCE', `${module.moduleSlug} lacks a source reference`, { moduleSlug: module.moduleSlug }));
    }
    for (const pointer of module.sourceReferences ?? []) {
      if (!existsSync(join(REPOSITORY_ROOT, pointer))) issues.push(qualityIssue('MISSING_VISUAL_SOURCE_REFERENCE', `${module.moduleSlug} source reference is missing: ${pointer}`, { moduleSlug: module.moduleSlug, path: pointer }));
    }
    if (!Array.isArray(module.brandTokens) || module.brandTokens.length < 3) {
      issues.push(qualityIssue('MISSING_MODULE_BRANDING_TOKENS', `${module.moduleSlug} must define at least three source-owned branding tokens`, { moduleSlug: module.moduleSlug }));
    }
    for (const token of module.brandTokens ?? []) {
      if (!token.name || !/^#[0-9a-f]{6}$/iu.test(token.value ?? '')) issues.push(qualityIssue('INVALID_MODULE_BRANDING_TOKEN', `${module.moduleSlug} has an invalid branding token`, { moduleSlug: module.moduleSlug, token }));
    }
    const viewports = module.viewports ?? [];
    for (const required of REQUIRED_VIEWPORTS) {
      const viewport = viewports.find((entry) => entry.name === required.name && entry.width === required.width);
      if (!viewport) {
        issues.push(qualityIssue('MISSING_VISUAL_VIEWPORT', `${module.moduleSlug} lacks ${required.name} at ${required.width}px`, { moduleSlug: module.moduleSlug, viewport: required.name }));
        continue;
      }
      const baselinePath = viewport.baselinePath;
      if (!baselinePath) {
        issues.push(qualityIssue('MISSING_VISUAL_BASELINE', `${module.moduleSlug}/${required.name} has no baseline path`, { moduleSlug: module.moduleSlug, viewport: required.name }));
        continue;
      }
      if (!checkFiles) continue;
      const absolute = join(REPOSITORY_ROOT, baselinePath);
      if (!existsSync(absolute)) {
        issues.push(qualityIssue('MISSING_VISUAL_BASELINE', `${module.moduleSlug}/${required.name} baseline is missing: ${baselinePath}`, { moduleSlug: module.moduleSlug, viewport: required.name, path: baselinePath }));
        continue;
      }
      const approval = approvalByPath.get(baselinePath);
      if (!approval) {
        issues.push(qualityIssue('UNAPPROVED_VISUAL_BASELINE', `${baselinePath} has no explicit approval`, { moduleSlug: module.moduleSlug, viewport: required.name, path: baselinePath }));
        continue;
      }
      const digest = sha256(readFileSync(absolute));
      if (approval.sha256 !== digest) issues.push(qualityIssue('VISUAL_BASELINE_DRIFT', `${baselinePath} does not match its approved SHA-256`, { moduleSlug: module.moduleSlug, viewport: required.name, path: baselinePath }));
      for (const field of ['approvedBy', 'approvedAt', 'reason']) {
        if (!String(approval[field] ?? '').trim()) issues.push(qualityIssue('INCOMPLETE_VISUAL_APPROVAL', `${baselinePath} approval lacks ${field}`, { path: baselinePath }));
      }
    }
  }
  return issues;
}

export function createVisualNegativeFixture(name, contracts) {
  const fixture = structuredClone(contracts);
  if (name === 'missing-brand-token') fixture.modules[0].brandTokens = [];
  else if (name === 'missing-viewport') fixture.modules[0].viewports = fixture.modules[0].viewports.filter((viewport) => viewport.name !== 'mobile');
  else if (name === 'invalid-route') fixture.modules[0].criticalRoute = 'not-a-route';
  else throw new Error(`Unknown visual negative fixture: ${name}`);
  return fixture;
}
