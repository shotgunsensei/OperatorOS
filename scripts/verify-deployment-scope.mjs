import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dependencyLockNames = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
]);

export function isDependencyLockfile(file) {
  const normalized = file.replaceAll('\\', '/');
  const name = basename(normalized).toLowerCase();
  return dependencyLockNames.has(name) || /^pnpm-lock(?: \(\d+\))?\.yaml$/i.test(name);
}

export function findFilesystemDependencyLockfiles(root = repositoryRoot) {
  const lockfiles = [];
  const recordLocks = (directory, recursive) => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (recursive) recordLocks(full, true);
        continue;
      }
      if (entry.isFile() && isDependencyLockfile(entry.name)) {
        lockfiles.push(relative(root, full).replaceAll('\\', '/'));
      }
    }
  };

  // The root is the only executable install boundary, so inspect its files but
  // never recurse into node_modules or build output. Historical source trees
  // are the only other place where ignored locks are forbidden.
  recordLocks(root, false);
  const modulesRoot = join(root, 'apps', 'modules');
  if (existsSync(modulesRoot)) {
    for (const moduleEntry of readdirSync(modulesRoot, { withFileTypes: true })) {
      if (!moduleEntry.isDirectory() || moduleEntry.isSymbolicLink()) continue;
      recordLocks(join(modulesRoot, moduleEntry.name, 'source'), true);
    }
  }
  return [...new Set(lockfiles)].sort();
}

function repositoryFiles(root = repositoryRoot) {
  const result = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(result.stderr || 'git ls-files failed');
  const visibleFiles = result.stdout
    .split('\0')
    .filter(Boolean)
    .map((file) => file.replaceAll('\\', '/'))
    .filter((file) => existsSync(join(root, file)));
  // git intentionally omits ignored files. Merge a bounded filesystem scan so
  // a package-lock.json left behind by a rejected npm install still fails the
  // gate and cannot remain as a provider-scanner input.
  return [...new Set([...visibleFiles, ...findFilesystemDependencyLockfiles(root)])].sort();
}

export function evaluateDeploymentScope({ files, gitignore, npmrc = '', replit, workspace, importer, packageManagerEnforcer, packageJson }) {
  const issues = [];
  const lockfiles = files.filter(isDependencyLockfile).sort();
  const disallowedLockfiles = lockfiles.filter((file) => file !== 'pnpm-lock.yaml');

  if (!lockfiles.includes('pnpm-lock.yaml')) issues.push('root pnpm-lock.yaml is missing');
  if (disallowedLockfiles.length > 0) {
    issues.push(`non-authoritative dependency lockfiles are present: ${disallowedLockfiles.join(', ')}`);
  }
  if (packageJson.packageManager !== 'pnpm@10.34.5') {
    issues.push('packageManager must pin pnpm@10.34.5');
  }
  const packageManagerEngine = packageJson.devEngines?.packageManager;
  if (packageManagerEngine?.name !== 'pnpm'
    || packageManagerEngine?.version !== '10.34.5'
    || packageManagerEngine?.onFail !== 'error') {
    issues.push('devEngines.packageManager must reject npm before install and pin pnpm 10.34.5');
  }
  if (/apps\/modules\/(?:\*|[^\s"']+)\/source/.test(workspace)) {
    issues.push('historical module source is included in the pnpm workspace');
  }

  const requiredIgnoreRules = [
    '/package-lock.json',
    '/apps/modules/*/source/**/package-lock.json',
    '/apps/modules/*/source/**/pnpm-lock*.yaml',
  ];
  for (const rule of requiredIgnoreRules) {
    if (!gitignore.includes(rule)) issues.push(`.gitignore is missing ${rule}`);
  }
  if (/^(?:package-lock|lockfile)\s*=\s*false\s*$/m.test(npmrc)) {
    issues.push('.npmrc disables the authoritative pnpm lockfile');
  }
  if (packageJson.scripts?.preinstall !== 'node scripts/enforce-pnpm.mjs') {
    issues.push('preinstall does not enforce the pnpm-only dependency authority');
  }
  if (!/REQUIRED_PNPM_VERSION\s*=\s*['"]10\.34\.5['"]/.test(packageManagerEnforcer)
    || !/corepack pnpm install --frozen-lockfile/.test(packageManagerEnforcer)) {
    issues.push('package-manager enforcement does not require the pinned frozen pnpm install');
  }

  if (!/\$excludedDependencyLockPattern\s*=/.test(importer)
    || !/dependency lockfile excluded from non-installable historical snapshot/.test(importer)) {
    issues.push('snapshot importer does not exclude dependency lockfiles');
  }

  const externalPorts = [...replit.matchAll(/^externalPort\s*=\s*(\d+)$/gm)]
    .map((match) => Number(match[1]));
  if (externalPorts.length !== 1 || externalPorts[0] !== 80) {
    issues.push(`Replit must expose only the supervised public port 80; found ${externalPorts.join(', ') || 'none'}`);
  }
  if (!/^hidden\s*=\s*\[[^\]]*"apps\/modules"[^\]]*\]$/m.test(replit)) {
    issues.push('Replit file tree does not hide historical apps/modules evidence');
  }
  if (!/\[packager\][\s\S]*?ignoredPaths\s*=\s*\[[^\]]*"apps\/modules"[^\]]*\]/.test(replit)) {
    issues.push('Replit packager does not ignore historical apps/modules evidence');
  }
  if (!/\[packager\.features\][\s\S]*?enabledForHosting\s*=\s*false/.test(replit)) {
    issues.push('Replit automatic hosting package installation is not disabled');
  }
  if (!/npm exec --yes --package=pnpm@10\.34\.5 -- pnpm install --frozen-lockfile/.test(replit)) {
    issues.push('Replit deployment does not use the frozen authoritative pnpm graph');
  }
  if (!/run\s*=\s*\["node", "scripts\/start-unified-runtime\.mjs"\]/.test(replit)) {
    issues.push('Replit deployment does not use the readiness-gated supervisor');
  }

  return {
    pass: issues.length === 0,
    authoritativeLockfile: 'pnpm-lock.yaml',
    discoveredLockfiles: lockfiles,
    disallowedLockfiles,
    externalPorts,
    issues,
  };
}

export function inspectDeploymentScope(root = repositoryRoot) {
  const read = (path) => readFileSync(join(root, path), 'utf8');
  const packageJson = JSON.parse(read('package.json'));
  const npmrcPath = join(root, '.npmrc');
  return evaluateDeploymentScope({
    files: repositoryFiles(root),
    gitignore: read('.gitignore'),
    npmrc: existsSync(npmrcPath) ? readFileSync(npmrcPath, 'utf8') : '',
    replit: read('.replit'),
    workspace: read('pnpm-workspace.yaml'),
    importer: read('scripts/import-module-snapshot.ps1'),
    packageManagerEnforcer: read('scripts/enforce-pnpm.mjs'),
    packageJson,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = inspectDeploymentScope();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.pass) process.exitCode = 1;
}
