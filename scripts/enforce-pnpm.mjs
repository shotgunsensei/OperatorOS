import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUIRED_PNPM_VERSION = '10.34.5';
export const MINIMUM_REPLIT_PROVIDER_PNPM_VERSION = '10.26.0';
export const OBSERVED_REPLIT_SECURITY_SCAN = Object.freeze({
  pnpmVersion: '10.26.1',
  nodeVersion: 'v24.12.0',
  platform: 'linux',
  arch: 'x64',
});
export const REPLIT_PROVIDER_ENVIRONMENT_KEYS = Object.freeze([
  'REPL_ID',
  'REPL_OWNER',
  'REPL_SLUG',
  'REPL_IMAGE',
  'REPL_LANGUAGE',
  'REPLIT_DEPLOYMENT',
  'REPLIT_DOMAINS',
]);

function parseVersion(version = '') {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return match ? match.slice(1).map(Number) : null;
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

export function isReplitProviderInstallEnvironment(
  environment = {},
  runtime = {
    platform: process.platform,
    arch: process.arch,
    execPath: process.execPath,
    nodeVersion: process.version,
  },
  userAgent = environment.npm_config_user_agent ?? '',
) {
  const developmentDomain = String(environment.REPLIT_DEV_DOMAIN ?? '').trim();
  const replitEnvironmentSignal = REPLIT_PROVIDER_ENVIRONMENT_KEYS.some(
    (key) => String(environment[key] ?? '').trim().length > 0,
  );
  const providerNixNode = runtime.platform === 'linux'
    && String(runtime.execPath ?? '').startsWith('/nix/store/');
  const escapedObservedPnpmVersion = OBSERVED_REPLIT_SECURITY_SCAN.pnpmVersion.replaceAll('.', '\\.');
  const observedSecurityScanToolchain = runtime.platform === OBSERVED_REPLIT_SECURITY_SCAN.platform
    && runtime.arch === OBSERVED_REPLIT_SECURITY_SCAN.arch
    && runtime.nodeVersion === OBSERVED_REPLIT_SECURITY_SCAN.nodeVersion
    && new RegExp(`^pnpm/${escapedObservedPnpmVersion}(?:\\s|$)`).test(String(userAgent).trim());
  return developmentDomain.length === 0
    && (replitEnvironmentSignal || providerNixNode || observedSecurityScanToolchain);
}

export function evaluatePackageManager(userAgent = '', { allowReplitProviderVersion = false } = {}) {
  const normalized = String(userAgent).trim();
  const expectedPrefix = `pnpm/${REQUIRED_PNPM_VERSION}`;
  const exactVersion = normalized === expectedPrefix || normalized.startsWith(`${expectedPrefix} `);
  const detectedMatch = /^pnpm\/(\d+\.\d+\.\d+)(?:\s|$)/.exec(normalized);
  const detectedVersion = detectedMatch?.[1] ?? null;
  const parsedDetected = parseVersion(detectedVersion ?? '');
  const parsedMinimum = parseVersion(MINIMUM_REPLIT_PROVIDER_PNPM_VERSION);
  const replitProviderVersion = Boolean(
    allowReplitProviderVersion
      && parsedDetected
      && parsedMinimum
      && parsedDetected[0] === parsedMinimum[0]
      && compareVersions(parsedDetected, parsedMinimum) >= 0,
  );
  const pass = exactVersion || replitProviderVersion;
  return {
    pass,
    mode: exactVersion ? 'pinned' : replitProviderVersion ? 'replit-provider-scan' : 'rejected',
    expected: expectedPrefix,
    detected: detectedVersion ? `pnpm/${detectedVersion}` : 'not-pnpm',
  };
}

export function enforcePackageManager(
  userAgent = process.env.npm_config_user_agent ?? '',
  environment = process.env,
) {
  const result = evaluatePackageManager(userAgent, {
    allowReplitProviderVersion: isReplitProviderInstallEnvironment(environment, undefined, userAgent),
  });
  if (result.mode === 'replit-provider-scan') {
    process.stderr.write(
      `[package-manager] Replit provider scan accepted ${result.detected}; `
      + `the deployment build will reinstall pinned pnpm ${REQUIRED_PNPM_VERSION} with the frozen lockfile.\n`,
    );
  } else if (!result.pass) {
    process.stderr.write(
      `[package-manager] OperatorOS requires pnpm ${REQUIRED_PNPM_VERSION}; detected ${result.detected} `
      + `on node/${process.version} ${process.platform} ${process.arch}. `
      + 'Run: corepack pnpm install --frozen-lockfile\n',
    );
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = enforcePackageManager();
  if (!result.pass) process.exitCode = 1;
}
