import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isProductionRuntime,
  resolveSeedPassword,
} from '../src/lib/seed-credential-policy.js';

test('production runtime detection honors APP_ENV and NODE_ENV', () => {
  assert.equal(isProductionRuntime({ APP_ENV: 'production', NODE_ENV: 'development' }), true);
  assert.equal(isProductionRuntime({ APP_ENV: undefined, NODE_ENV: 'prod' }), true);
  assert.equal(isProductionRuntime({ APP_ENV: 'development', NODE_ENV: 'production' }), false);
});

test('missing production admin secret fails closed while optional seeds skip', () => {
  assert.throws(
    () => resolveSeedPassword({
      envName: 'ADMIN_PASSWORD',
      value: undefined,
      requiredInProduction: true,
      production: true,
    }),
    /ADMIN_PASSWORD is required/,
  );
  assert.equal(resolveSeedPassword({
    envName: 'DEMO_PASSWORD',
    value: undefined,
    requiredInProduction: false,
    production: true,
  }), null);
  assert.equal(resolveSeedPassword({
    envName: 'ADMIN_PASSWORD',
    value: undefined,
    requiredInProduction: true,
    production: false,
  }), null);
});

test('seed passwords must be explicit and at least twelve characters', () => {
  assert.throws(
    () => resolveSeedPassword({
      envName: 'DEMO_PASSWORD',
      value: 'too-short',
      requiredInProduction: false,
      production: false,
    }),
    /at least 12 characters/,
  );
  assert.equal(resolveSeedPassword({
    envName: 'ADMIN_PASSWORD',
    value: 'correct horse battery staple',
    requiredInProduction: true,
    production: true,
  }), 'correct horse battery staple');
});

test('database seeding contains no source-controlled password fallback', () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  const source = readFileSync(resolve(root, 'apps/api/src/lib/saas-db-init.ts'), 'utf8');

  assert.match(source, /resolveSeedPassword/);
  assert.doesNotMatch(source, /process\.env\.ADMIN_PASSWORD\s*\|\|\s*['"]/);
  assert.doesNotMatch(source, /process\.env\.DEMO_PASSWORD\s*\|\|\s*['"]/);
  assert.doesNotMatch(source, /hashPassword\(\s*['"][^'"]+['"]\s*\)/);
});

test('one-shot credential rotation revokes existing sessions without logging passwords', () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  const source = readFileSync(resolve(root, 'apps/api/src/scripts/rotate-seed-credentials.ts'), 'utf8');
  const pkg = JSON.parse(readFileSync(resolve(root, 'apps/api/package.json'), 'utf8'));

  assert.equal(pkg.scripts['security:rotate-seed-credentials'], 'tsx src/scripts/rotate-seed-credentials.ts');
  assert.match(source, /tokenVersion:\s*sql`token_version \+ 1`/);
  assert.match(source, /resolveSeedPassword/);
  assert.doesNotMatch(source, /console\.(?:info|error)\([^\n]*(?:password|passwordHash)\)/i);
});
