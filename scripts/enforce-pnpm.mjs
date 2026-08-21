import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUIRED_PNPM_VERSION = '10.34.5';

export function evaluatePackageManager(userAgent = '') {
  const normalized = String(userAgent).trim();
  const expectedPrefix = `pnpm/${REQUIRED_PNPM_VERSION}`;
  const pass = normalized === expectedPrefix || normalized.startsWith(`${expectedPrefix} `);
  return {
    pass,
    expected: expectedPrefix,
    detected: normalized.startsWith('pnpm/') ? normalized.split(/\s+/, 1)[0] : 'not-pnpm',
  };
}

export function enforcePackageManager(userAgent = process.env.npm_config_user_agent ?? '') {
  const result = evaluatePackageManager(userAgent);
  if (!result.pass) {
    process.stderr.write(
      `[package-manager] OperatorOS requires pnpm ${REQUIRED_PNPM_VERSION}. `
      + 'Run: corepack pnpm install --frozen-lockfile\n',
    );
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = enforcePackageManager();
  if (!result.pass) process.exitCode = 1;
}
