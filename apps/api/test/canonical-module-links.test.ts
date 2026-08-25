import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECTS } from '../../web/src/components/portfolio/portfolio-content.js';
import { MODULE_CATALOG_BY_SLUG } from '../../../packages/sdk/src/catalog.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const CANONICAL_PORTFOLIO_URLS = {
  TechDeck: 'https://techdeck.operatoros.net',
  PulseDesk: 'https://pulsedesk.operatoros.net',
  TradeFlowKit: 'https://tradeflowkit.operatoros.net',
  TorqueShed: 'https://torqueshed.operatoros.net',
  FaultlineLab: 'https://faultlinelab.operatoros.net',
  'BrandForge OS': 'https://brandforgeos.operatoros.net',
  SnapProofOS: 'https://snapproofos.operatoros.net',
} as const;

test('portfolio links use canonical OperatorOS module subdomains', () => {
  for (const [name, expectedUrl] of Object.entries(CANONICAL_PORTFOLIO_URLS)) {
    const project = PROJECTS.find(candidate => candidate.name === name);
    assert.ok(project, `${name} is listed in the portfolio`);
    assert.equal(project.url, expectedUrl, `${name} links to its canonical subdomain`);
  }
});

test('Operator Pool Hall keeps its stable slug and legacy env alias while using the canonical host', () => {
  const module = MODULE_CATALOG_BY_SLUG['ninja-pool-hall'];
  assert.ok(module);
  assert.equal(module.internal, false);
  assert.equal(module.name, 'Operator Pool Hall');
  assert.equal(module.canonicalBaseUrl, 'https://operatorpoolhall.operatoros.net');
  assert.deepEqual(module.envUrlKeys, ['OPERATOR_POOL_HALL_URL', 'NINJA_POOL_HALL_URL']);
  assert.deepEqual(module.legacyBaseUrls, ['https://ninja-pool-hall.operatoros.net']);
});

test('TechDeck SSO return URL fallback uses its canonical module host', () => {
  const source = readFileSync(
    resolve(repoRoot, 'apps/modules/techdeck/source/client/src/lib/operatoros.ts'),
    'utf8',
  );
  assert.match(source, /return "https:\/\/techdeck\.operatoros\.net"/);
  assert.doesNotMatch(source, /return "https:\/\/techdeck\.app"/);
});

test('runtime adapters and deployment config do not advertise retired standalone hosts', () => {
  const runtimeConfig = [
    'apps/modules/tradeflowkit/adapter.ts',
    'apps/modules/techdeck/adapter.ts',
    'apps/modules/pulsedesk/adapter.ts',
    '.env.example',
    '.replit',
    'ecosystem.registry.json',
    'config/operatoros-module-registry.json',
    'packages/sdk/src/ecosystem.ts',
    'packages/modules/registry.ts',
  ].map(path => readFileSync(resolve(repoRoot, path), 'utf8')).join('\n');

  assert.doesNotMatch(
    runtimeConfig,
    /tradeflowkit\.com|torqueshed\.pro|techdeck\.app|pulsedesk\.support|faultlinelab\.com|bf-os\.com|snapproofos\.com|studyforgeai\.net|ninjalaunchkit\.com|callcommand\.net|ninjamation\.com/,
  );
  for (const host of [
    'tradeflowkit.operatoros.net',
    'techdeck.operatoros.net',
    'pulsedesk.operatoros.net',
  ]) {
    assert.ok(runtimeConfig.includes(host), `${host} is present in runtime configuration`);
  }
});

test('Replit web runtime keeps the internal API origin server-side', () => {
  const replit = readFileSync(resolve(repoRoot, '.replit'), 'utf8');
  assert.match(replit, /INTERNAL_API_URL=http:\/\/localhost:5001/);
  assert.doesNotMatch(replit, /NEXT_PUBLIC_API_URL=http:\/\/localhost:5001/);
});
