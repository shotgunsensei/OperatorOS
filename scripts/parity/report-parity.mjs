import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BUILD_ROOT,
  buildAll,
  issueSummary,
  normalizePath,
  stableJson,
  writeBuildArtifacts,
} from './lib/compiler.mjs';

const { source, target, ledger } = buildAll();
writeBuildArtifacts({ source, target, ledger });
const reportRoot = join(BUILD_ROOT, 'reports');
mkdirSync(reportRoot, { recursive: true });

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function moduleSummary(module, ledgerIssues) {
  const issues = ledgerIssues.filter((entry) => entry.moduleSlug == null || entry.moduleSlug === module.moduleSlug);
  return {
    schemaVersion: 1,
    moduleSlug: module.moduleSlug,
    moduleName: module.moduleName,
    adapterId: module.adapterId,
    sourceRoot: module.sourceRoot,
    sourceFingerprint: module.sourceFingerprint,
    stateCounts: module.stateCounts,
    totalCapabilities: module.capabilities.length,
    issueCounts: issueSummary(issues),
    releaseEligible: issues.length === 0,
    issues,
    capabilities: module.capabilities,
  };
}

for (const module of ledger.modules) {
  const report = moduleSummary(module, ledger.issues);
  const rows = module.capabilities.map((capability) =>
    `| \`${capability.capabilityId}\` | ${capability.type} | ${capability.state} | ${capability.evidence.testIds.length} | ${capability.issues.map((entry) => entry.code).join(', ') || '-'} |`)
    .join('\n');
  const markdown = `# ${module.moduleName} executable parity report\n\n`
    + `- Adapter: \`${module.adapterId}\`\n`
    + `- Source root: \`${module.sourceRoot}\`\n`
    + `- Capabilities: ${module.capabilities.length}\n`
    + `- Release eligible: **${report.releaseEligible ? 'yes' : 'no'}**\n`
    + `- Issue counts: \`${JSON.stringify(report.issueCounts)}\`\n\n`
    + `| Capability | Type | State | Test IDs | Issues |\n| --- | --- | --- | ---: | --- |\n${rows}\n`;
  const htmlRows = module.capabilities.map((capability) => `<tr><td><code>${escapeHtml(capability.capabilityId)}</code></td><td>${escapeHtml(capability.type)}</td><td>${escapeHtml(capability.state)}</td><td>${capability.evidence.testIds.length}</td><td>${escapeHtml(capability.issues.map((entry) => entry.code).join(', ') || '-')}</td></tr>`).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(module.moduleName)} parity</title><style>body{font-family:system-ui;margin:2rem;color:#172033}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccd2dc;padding:.45rem;text-align:left;vertical-align:top}th{background:#eef2f7}code{overflow-wrap:anywhere}.blocked{color:#a22323}</style></head><body><h1>${escapeHtml(module.moduleName)} executable parity report</h1><p>Release eligible: <strong class="${report.releaseEligible ? '' : 'blocked'}">${report.releaseEligible ? 'yes' : 'no'}</strong></p><p>Capabilities: ${module.capabilities.length}. Issues: ${report.issues.length}.</p><table><thead><tr><th>Capability</th><th>Type</th><th>State</th><th>Test IDs</th><th>Issues</th></tr></thead><tbody>${htmlRows}</tbody></table></body></html>\n`;
  writeFileSync(join(reportRoot, `${module.moduleSlug}.json`), stableJson(report), 'utf8');
  writeFileSync(join(reportRoot, `${module.moduleSlug}.md`), markdown, 'utf8');
  writeFileSync(join(reportRoot, `${module.moduleSlug}.html`), html, 'utf8');
}

const index = {
  schemaVersion: 1,
  modules: ledger.modules.map((module) => ({
    moduleSlug: module.moduleSlug,
    json: normalizePath(`build/parity/reports/${module.moduleSlug}.json`),
    markdown: normalizePath(`build/parity/reports/${module.moduleSlug}.md`),
    html: normalizePath(`build/parity/reports/${module.moduleSlug}.html`),
  })),
  totals: ledger.totals,
};
writeFileSync(join(reportRoot, 'index.json'), stableJson(index), 'utf8');
process.stdout.write(`${JSON.stringify({ output: 'build/parity/reports', modules: ledger.modules.length, formats: ['json', 'md', 'html'] }, null, 2)}\n`);
