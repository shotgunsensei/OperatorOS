import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const moduleDir = join(root, 'docs', 'parity', 'modules');
const outputPath = join(root, 'docs', 'parity', 'shared-equivalent-adapters.json');
const write = process.argv.includes('--write');

const adapters = Object.freeze({
  'identity-session-v1': {
    testId: 'P22-ADAPTER-SSO-001',
    testPath: 'apps/api/test/auth-boundary-contract.test.ts',
    assertion: 'The module reuses exact-host, host-only OperatorOS session and SSO behavior without a module-local credential authority.',
  },
  'tenant-access-v1': {
    testId: 'P22-RBAC-001',
    testPath: 'apps/api/test/shared-platform-routes.test.ts',
    assertion: 'The original action remains available only at the same or narrower effective tenant and module access level.',
  },
  'directory-reference-v1': {
    testId: 'P22-ADAPTER-DIRECTORY-001',
    testPath: 'apps/api/test/business-directory.test.ts',
    assertion: 'The original organization, site, contact, or requester outcome persists through the shared tenant-scoped Directory.',
  },
  'provider-outbox-v1': {
    testId: 'P22-PROVIDER-001',
    testPath: 'apps/api/test/shared-platform.test.ts',
    assertion: 'The original provider-backed outcome is queued durably and reports test, retry, delivery, disabled, or dead-letter state honestly.',
  },
  'attachment-v1': {
    testId: 'P22-ADAPTER-ATTACHMENT-001',
    testPath: 'apps/api/test/shared-services.test.ts',
    assertion: 'The original attachment outcome retains tenant scope, integrity, scan, quarantine, retention, and authorized retrieval behavior.',
  },
  'job-export-v1': {
    testId: 'P22-JOB-001',
    testPath: 'apps/api/test/shared-platform.test.ts',
    assertion: 'The original long-running outcome is durable, idempotent, leased, retryable, restart-safe, and recoverable from dead letter.',
  },
  'usage-credit-v1': {
    testId: 'P22-ADAPTER-USAGE-001',
    testPath: 'apps/api/test/shared-services.test.ts',
    assertion: 'The original metered outcome records durable tenant and module provenance without creating child billing authority.',
  },
  'search-deeplink-v1': {
    testId: 'P22-ADAPTER-SEARCH-001',
    testPath: 'apps/api/test/shared-platform.test.ts',
    assertion: 'The original object remains discoverable at a valid relative deep link without leaking a foreign tenant result.',
  },
});

function adapterFor(capability) {
  const haystack = [capability.title, capability.note, ...(capability.currentTargets || [])].join(' ').toLowerCase();
  if (/sso|session|identity|login|logout|auth/.test(haystack)) return 'identity-session-v1';
  if (/directory|organization|organisation|contact|requester|site\b/.test(haystack)) return 'directory-reference-v1';
  if (/attachment|upload|download|file\b|storage|quarantine|malware/.test(haystack)) return 'attachment-v1';
  if (/notification|outbox|email|sms|twilio|provider|oauth|webhook/.test(haystack)) return 'provider-outbox-v1';
  if (/background|queue|worker|schedule|export|report|dead.?letter|retry/.test(haystack)) return 'job-export-v1';
  if (/usage|credit|meter|token ledger|billing/.test(haystack)) return 'usage-credit-v1';
  if (/search|deep.?link|reference/.test(haystack)) return 'search-deeplink-v1';
  return 'tenant-access-v1';
}

function buildContract() {
  const mappings = [];
  const files = readdirSync(moduleDir).filter(name => name.endsWith('.json')).sort();
  for (const filename of files) {
    const manifest = JSON.parse(readFileSync(join(moduleDir, filename), 'utf8'));
    for (const capability of manifest.capabilities || []) {
      if (capability.state !== 'ACTIVE_SHARED_EQUIVALENT') continue;
      const adapterId = adapterFor(capability);
      const adapter = adapters[adapterId];
      mappings.push({
        capabilityId: capability.capabilityId,
        moduleSlug: capability.moduleSlug,
        adapterId,
        originalUserOutcome: capability.title,
        compatibilityAssertion: adapter.assertion,
        adapterTestIds: [adapter.testId],
        adapterTestPaths: [adapter.testPath],
        existingEvidence: [...(capability.automatedEvidence || [])].sort(),
      });
    }
  }
  mappings.sort((a, b) => a.capabilityId.localeCompare(b.capabilityId));
  const digest = createHash('sha256').update(JSON.stringify(mappings)).digest('hex');
  return {
    schemaVersion: 1,
    generatedBy: 'scripts/phase22-shared-equivalent-contract.mjs',
    sourceOfTruth: 'docs/parity/modules/*.json ACTIVE_SHARED_EQUIVALENT records',
    mappingCount: mappings.length,
    mappingDigestSha256: digest,
    adapters,
    mappings,
  };
}

function fail(message) {
  console.error(`[phase22-shared-equivalent] ${message}`);
  process.exitCode = 1;
}

const contract = buildContract();
const seen = new Set();
for (const mapping of contract.mappings) {
  if (seen.has(mapping.capabilityId)) fail(`duplicate capability mapping: ${mapping.capabilityId}`);
  seen.add(mapping.capabilityId);
  if (!mapping.originalUserOutcome || !mapping.compatibilityAssertion) fail(`missing outcome/assertion: ${mapping.capabilityId}`);
  for (let i = 0; i < mapping.adapterTestIds.length; i += 1) {
    const testPath = resolve(root, mapping.adapterTestPaths[i]);
    if (!existsSync(testPath)) fail(`missing adapter test file: ${relative(root, testPath)}`);
    else if (!readFileSync(testPath, 'utf8').includes(mapping.adapterTestIds[i])) fail(`test ID ${mapping.adapterTestIds[i]} is absent from ${mapping.adapterTestPaths[i]}`);
  }
}

const rendered = `${JSON.stringify(contract, null, 2)}\n`;
if (write) {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, rendered);
  console.log(`[phase22-shared-equivalent] wrote ${contract.mappingCount} mappings (${contract.mappingDigestSha256})`);
} else if (!existsSync(outputPath)) {
  fail('generated contract is missing; run pnpm shared-services:write');
} else if (readFileSync(outputPath, 'utf8') !== rendered) {
  fail('generated contract is stale; run pnpm shared-services:write and review the diff');
} else if (!process.exitCode) {
  console.log(`[phase22-shared-equivalent] verified ${contract.mappingCount} mappings (${contract.mappingDigestSha256})`);
}
