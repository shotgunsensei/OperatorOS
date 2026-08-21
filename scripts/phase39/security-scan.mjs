import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inspectDeploymentScope } from '../verify-deployment-scope.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outputPath = join(repositoryRoot, 'build', 'phase39', 'security-scan.json');
const textExtensions = new Set(['.cjs', '.env', '.example', '.js', '.json', '.jsx', '.md', '.mjs', '.ps1', '.sh', '.ts', '.tsx', '.yaml', '.yml']);
const runtimePrefixes = ['apps/api/src/', 'apps/web/src/', 'apps/runner-gateway/src/', 'packages/'];

const secretRules = [
  { id: 'private-key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { id: 'stripe-live-secret', pattern: /\bsk_live_[A-Za-z0-9]{20,}\b/g },
  { id: 'stripe-webhook-secret', pattern: /\bwhsec_[A-Za-z0-9]{24,}\b/g },
  { id: 'github-token', pattern: /\b(?:ghp|github_pat)_[A-Za-z0-9_]{30,}\b/g },
  { id: 'slack-token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  { id: 'google-api-key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
];

const sastRules = [
  { id: 'dynamic-eval', pattern: /\beval\s*\(/g },
  { id: 'dynamic-function', pattern: /\bnew\s+Function\s*\(/g },
  { id: 'tls-verification-disabled', pattern: /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0/g },
  // Literal migration DDL and finite enum-selected column fragments are
  // reviewed uses of sql.raw. Interpolation inside raw SQL is the dangerous
  // boundary and is rejected here.
  { id: 'interpolated-raw-sql', pattern: /\bsql\.raw\s*\(\s*`[^`]*\$\{/gs },
];

function isPlaceholder(value) {
  return /placeholder|example|dummy|test[-_]|do-not-print/i.test(value);
}

export function scanText(file, content, runtime = false) {
  const findings = [];
  for (const rule of secretRules) {
    rule.pattern.lastIndex = 0;
    for (const match of content.matchAll(rule.pattern)) {
      if (isPlaceholder(match[0])) continue;
      findings.push({ severity: 'high', category: 'secret', rule: rule.id, file, line: content.slice(0, match.index).split('\n').length });
    }
  }
  if (runtime) {
    for (const rule of sastRules) {
      rule.pattern.lastIndex = 0;
      for (const match of content.matchAll(rule.pattern)) {
        findings.push({ severity: 'high', category: 'sast', rule: rule.id, file, line: content.slice(0, match.index).split('\n').length });
      }
    }
    if (file.startsWith('apps/api/src/') && /from\s+['"](?:node:)?child_process['"]|require\(['"](?:node:)?child_process['"]\)/.test(content)) {
      findings.push({ severity: 'high', category: 'boundary', rule: 'api-child-process', file, line: 1 });
    }
  }
  return findings;
}

function repositoryFiles() {
  const result = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(result.stderr || 'git ls-files failed');
  return result.stdout.split('\0').filter(Boolean).map(file => file.replaceAll('\\', '/'));
}

function auditDependencies() {
  const executable = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'corepack';
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'corepack', 'pnpm', 'audit', '--audit-level', 'high', '--json']
    : ['pnpm', 'audit', '--audit-level', 'high', '--json'];
  const result = spawnSync(executable, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  let report;
  try { report = JSON.parse(result.stdout || '{}'); } catch { report = { parseError: true }; }
  const ignoredGhsas = ['GHSA-5p2g-fcmc-qvqq', 'GHSA-w3rx-r6r6-pgpr'];
  const workspace = readFileSync(join(repositoryRoot, 'pnpm-workspace.yaml'), 'utf8');
  const patch = readFileSync(join(repositoryRoot, 'patches', 'image-size@1.2.1.patch'), 'utf8');
  const exceptionIntegrity = ignoredGhsas.every(id => workspace.includes(id))
    && workspace.includes('patches/image-size@1.2.1.patch')
    && patch.includes('Invalid ICNS entry length')
    && patch.includes('Invalid JXL partial-stream box length');
  const disclosedHigh = Number(report?.metadata?.vulnerabilities?.high ?? 0);
  const disclosedCritical = Number(report?.metadata?.vulnerabilities?.critical ?? 0);
  const unresolvedAdvisories = Object.keys(report?.advisories ?? {});
  return {
    commandExitCode: result.status,
    dependencies: Number(report?.metadata?.dependencies ?? 0),
    disclosedHigh,
    disclosedCritical,
    ignoredGhsas,
    exceptionIntegrity,
    unresolvedAdvisories,
    pass: result.status === 0 && disclosedCritical === 0 && unresolvedAdvisories.length === 0 && exceptionIntegrity,
  };
}

export function runSecurityScan() {
  const findings = [];
  let scannedFiles = 0;
  for (const file of repositoryFiles()) {
    const extension = extname(file).toLowerCase();
    if (!textExtensions.has(extension) && !file.endsWith('.env.example')) continue;
    if (file.startsWith('apps/modules/') || file.startsWith('docs/parity/generated/')) continue;
    const absolute = join(repositoryRoot, file);
    let content;
    try { content = readFileSync(absolute, 'utf8'); } catch { continue; }
    scannedFiles += 1;
    findings.push(...scanText(file, content, runtimePrefixes.some(prefix => file.startsWith(prefix))));
  }
  const dependencyAudit = auditDependencies();
  const deploymentScope = inspectDeploymentScope(repositoryRoot);
  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    scannerVersion: createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex').slice(0, 16),
    scannedFiles,
    findings,
    dependencyAudit,
    deploymentScope,
    passed: findings.length === 0 && dependencyAudit.pass && deploymentScope.pass,
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = runSecurityScan();
  process.stdout.write(`${JSON.stringify({ passed: result.passed, scannedFiles: result.scannedFiles, findings: result.findings.length, dependencyAudit: result.dependencyAudit, deploymentScope: result.deploymentScope, artifact: 'build/phase39/security-scan.json' }, null, 2)}\n`);
  if (!result.passed) process.exitCode = 1;
}
