import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = join(root, 'docs', 'phase-37', 'OUTCALL-SOURCE-RECOVERY-LEDGER.json');

function json(path) {
  return JSON.parse(readFileSync(join(root, path), 'utf8'));
}

function text(path) {
  return readFileSync(join(root, path), 'utf8');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function listFiles(directory) {
  const result = [];
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) result.push(...listFiles(path));
    else result.push(path);
  }
  return result;
}

function catalogEntry(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) return '';
  return source.slice(start, source.indexOf('\n  },', start) + 5);
}

function fingerprintFiles(paths) {
  return sha256(paths
    .slice()
    .sort()
    .map(path => `${path}:${sha256(text(path).replaceAll('\r\n', '\n'))}`)
    .join('\n'));
}

export function buildOutCallSourceGate() {
  const parity = json('docs/parity/modules/outcall.json');
  const deploymentRegistry = json('config/operatoros-module-registry.json');
  const ecosystemRegistry = json('ecosystem.registry.json');
  const sourceRoot = join(root, 'apps', 'modules', 'outcall', 'source');
  const sourceFiles = listFiles(sourceRoot).map(path => relative(root, path).replaceAll('\\', '/'));
  const sourceReadme = text('apps/modules/outcall/source/README.md').replaceAll('\r\n', '\n');
  const sdkEntry = catalogEntry(text('packages/sdk/src/catalog.ts'), "    slug: 'outcall',");
  const marketingSource = text('apps/web/src/lib/marketing-catalog.ts');
  const seedSource = text('apps/api/src/lib/saas-db-init.ts');
  const verifierSource = text('scripts/verify-production-runtime.mjs');
  const providerSource = text('apps/api/src/lib/outcall-provider.ts');
  const resourceSource = text('apps/api/src/lib/outcall-resources.ts');
  const productsSource = text('packages/sdk/src/products.ts');
  const companions = productsSource.slice(productsSource.indexOf('export const COMPANION_MODULES:'), productsSource.indexOf('export const COMPANION_MODULE_KEYS'));
  const deploymentEntry = deploymentRegistry.find(entry => entry.slug === 'outcall');
  const ecosystemEntry = ecosystemRegistry.modules.find(entry => entry.slug === 'outcall');
  const recovery = parity.capabilities.find(capability => capability.type === 'source_recovery');
  const currentTargets = recovery?.currentTargets ?? [];
  const automatedEvidence = recovery?.automatedEvidence ?? [];
  const targetsExist = currentTargets.length >= 7
    && currentTargets.every(path => existsSync(join(root, path)));
  const evidenceExists = automatedEvidence.length >= 5
    && automatedEvidence.every(path => existsSync(join(root, path)));

  const checks = {
    parityClassifiesAuthorizedReconstruction: parity.provenance.selectedKind === 'owner_authorized_reconstruction'
      && parity.provenance.authorizationDate === '2026-08-26',
    recoveryCapabilityActive: recovery?.state === 'ACTIVE_NATIVE'
      && recovery?.blockerCode === null,
    canonicalTargetsPresent: targetsExist,
    automatedEvidencePresent: evidenceExists,
    importedBoundaryRecordsReconstruction: sourceFiles.length === 1
      && sourceFiles[0] === 'apps/modules/outcall/source/README.md'
      && sourceReadme.includes('owner-authorized reconstruction')
      && sourceReadme.includes('does not claim byte-for-byte or\nliteral parity'),
    importedBoundaryPreservesHistoricalLockEvidence: sourceReadme.includes('shared registry intentionally remains\n`planned`'),
    sdkCatalogLaunchable: sdkEntry.includes("defaultStatus: 'live'"),
    marketingCatalogDerivesCanonicalStatus: marketingSource.includes('const SOURCE: readonly MarketingCatalogSource[] = MODULE_CATALOG;')
      && marketingSource.includes('status: statusFor(entry)'),
    deploymentRegistryEnabled: deploymentEntry?.enabled === true,
    ecosystemRegistryActive: ecosystemEntry?.status === 'active',
    existingDatabaseRowsFollowCatalog: !seedSource.includes("spec.slug === 'outcall' && spec.defaultStatus === 'coming_soon'")
      && seedSource.includes("if (spec.defaultStatus === 'live')"),
    newCommerceRemainsClosed: companions.includes('export const COMPANION_MODULES:')
      && !/key:\s*'outcall'/u.test(companions)
      && seedSource.includes('isEligibleCompanionModuleKey(c.slug)'),
    productionVerifierRequiresRegistrationAndReadiness: verifierSource.includes('outcall authenticated application registration')
      && verifierSource.includes('outcall explicit provider readiness'),
    providerRequiresLiveFlagAndApproval: providerSource.includes('enabled(process.env.OUTCALL_LIVE_PROVIDER)')
      && providerSource.includes('hasApprovedOutCallResourcePolicy()'),
    productionCannotUseTestAdapter: providerSource.includes("process.env.APP_ENV === 'test'")
      && providerSource.includes("process.env.NODE_ENV === 'test'"),
    approvalRemainsExpiringAndPrivileged: resourceSource.includes('a.policy_hash=${outCallPolicyHash(value)}')
      && resourceSource.includes('a.revoked_at IS NULL') && resourceSource.includes('a.expires_at>NOW()')
      && resourceSource.includes("u.platform_role='super_admin'"),
  };

  const failClosed = Object.values(checks).every(Boolean);
  return {
    schemaVersion: 3,
    phase: 37,
    evidenceDate: '2026-10-20',
    phaseStatus: 'APPLICATION_SOURCE_ACTIVE_PROVIDER_GATED',
    applicationLaunchAllowed: true,
    liveProviderAcceptanceProven: false,
    blockerCode: 'COMMERCIAL_DECISION_AND_PROVIDER_ACCEPTANCE_REQUIRED',
    source: {
      historicalRepository: null,
      historicalCommit: null,
      historicalRef: null,
      historicalProvenanceStatus: 'NOT_RECOVERED',
      provenanceStatus: 'OWNER_AUTHORIZED_RECONSTRUCTION',
      authorizationDate: parity.provenance.authorizationDate,
      authority: parity.provenance.authority,
      importedBoundary: {
        root: parity.sourceRoot,
        files: sourceFiles,
        gitCanonicalFileCount: parity.sourceFingerprint.fileCount,
        gitCanonicalBytes: parity.sourceFingerprint.totalBytes,
        treeSha256: parity.sourceFingerprint.treeSha256,
        readmeCanonicalContentSha256: sha256(sourceReadme),
      },
      canonicalCurrentImplementation: {
        targets: currentTargets,
        targetCount: currentTargets.length,
        fingerprintSha256: targetsExist ? fingerprintFiles(currentTargets) : null,
        automatedEvidence,
        evidenceCount: automatedEvidence.length,
        originalHistoricalLiteralParityClaimed: false,
      },
    },
    historicalRecoveryEvidence: [
      {
        target: 'Authenticated shotgunsensei GitHub repositories and repository search',
        result: 'No historical OutCall repository, including private repositories visible to the authenticated account.',
      },
      {
        target: 'C:/Dev/Outcall and local archive locations',
        result: 'No launchable historical source tree or Git repository was recovered.',
      },
      {
        target: 'Replit exports and OperatorOS Git object databases',
        result: 'No authoritative historical OutCall tree was recovered; only the README boundary and reconstructed shared-runtime code were found.',
      },
    ],
    providerAcceptance: {
      twilioSandboxLifecycle: 'NOT_RUN',
      evidence: null,
      configuredOutCallOrTwilioVariableNamesObservedLocally: 0,
      note: 'No credentials were read or fabricated. Provider acceptance remains an external activation gate after local source reconstruction.',
    },
    activationPolicy: {
      sdkCatalogStatus: 'live',
      marketingStatus: 'derived_from_sdk_live',
      ecosystemStatus: 'active',
      deploymentRegistryEnabled: true,
      existingDatabaseStatusAfterSeed: 'live',
      newEnrollment: 'closed_pending_commercial_decision',
      liveProvider: 'requires_configuration_flag_and_current_account_approval',
      checks,
      failClosed,
    },
    acceptance: {
      historicalFullSourceRecovered: false,
      ownerAuthorizedReconstruction: true,
      canonicalCurrentImplementationPinned: targetsExist,
      everyCurrentSourceOutcomeMappedAndTested: recovery?.state === 'ACTIVE_NATIVE' && evidenceExists,
      originalHistoricalLiteralParityClaimed: false,
      completeTwilioSandboxLifecycleProven: false,
      applicationLaunchRequiresCentralEntitlement: true,
      providerAndCommerceBoundariesPreserved: failClosed,
      goLiveAccepted: false,
    },
  };
}

function main() {
  const report = buildOutCallSourceGate();
  if (process.argv.includes('--write')) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.activationPolicy.failClosed) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
