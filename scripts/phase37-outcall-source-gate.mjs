import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
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

export function buildOutCallSourceGate() {
  const parity = json('docs/parity/modules/outcall.json');
  const deploymentRegistry = json('config/operatoros-module-registry.json');
  const ecosystemRegistry = json('ecosystem.registry.json');
  const sourceRoot = join(root, 'apps', 'modules', 'outcall', 'source');
  const sourceFiles = listFiles(sourceRoot).map(path => relative(root, path).replaceAll('\\', '/'));
  const sourceReadme = text('apps/modules/outcall/source/README.md').replaceAll('\r\n', '\n');
  const sdkEntry = catalogEntry(text('packages/sdk/src/catalog.ts'), "    slug: 'outcall',");
  const marketingLine = text('apps/web/src/lib/marketing-catalog.ts')
    .split(/\r?\n/u)
    .find(line => line.includes("slug: 'outcall'")) ?? '';
  const seedSource = text('apps/api/src/lib/saas-db-init.ts');
  const verifierSource = text('scripts/verify-production-runtime.mjs');
  const deploymentEntry = deploymentRegistry.find(entry => entry.slug === 'outcall');
  const ecosystemEntry = ecosystemRegistry.modules.find(entry => entry.slug === 'outcall');
  const recovery = parity.capabilities.find(capability => capability.type === 'source_recovery');

  const checks = {
    parityClassifiesMissingSource: parity.provenance.selectedKind === 'missing_source',
    recoveryCapabilityBlocked: recovery?.state === 'BLOCKED'
      && recovery?.blockerCode === 'SOURCE_RECOVERY_REQUIRED',
    importedBoundaryIsReadmeOnly: sourceFiles.length === 1
      && sourceFiles[0] === 'apps/modules/outcall/source/README.md',
    importedBoundaryRequiresPlannedStatus: sourceReadme.includes('shared registry status\nstays `planned`'),
    sdkCatalogComingSoon: sdkEntry.includes("defaultStatus: 'coming_soon'"),
    marketingCatalogComingSoon: marketingLine.includes("defaultStatus: 'coming_soon'"),
    deploymentRegistryDisabled: deploymentEntry?.enabled === false,
    ecosystemRegistryPlanned: ecosystemEntry?.status === 'planned',
    existingDatabaseRowsRelocked: seedSource.includes("spec.slug === 'outcall' && spec.defaultStatus === 'coming_soon'")
      && seedSource.includes("updates.status = 'coming_soon'"),
    productionVerifierRequiresLock: verifierSource.includes('outcall source-recovery activation lock')
      && verifierSource.includes('outcall.enabled !== false'),
  };

  const failClosed = Object.values(checks).every(Boolean);
  return {
    schemaVersion: 1,
    phase: 37,
    evidenceDate: '2026-08-13',
    phaseStatus: 'BLOCKED',
    activationAllowed: false,
    blockerCode: 'SOURCE_RECOVERY_REQUIRED',
    source: {
      authoritativeRepository: null,
      authoritativeCommit: null,
      authoritativeRef: null,
      provenanceStatus: 'MISSING_SOURCE',
      importedBoundary: {
        root: parity.sourceRoot,
        files: sourceFiles,
        gitCanonicalFileCount: parity.sourceFingerprint.fileCount,
        gitCanonicalBytes: parity.sourceFingerprint.totalBytes,
        treeSha256: parity.sourceFingerprint.treeSha256,
        readmeCanonicalContentSha256: sha256(sourceReadme),
      },
      exactSourceCapabilityCounts: {
        pages: null,
        routes: null,
        api: null,
        schemaTables: null,
        providers: null,
        schedulingProcesses: null,
        reminders: null,
        verificationFlows: null,
        consentFlows: null,
        cancellationFlows: null,
        auditFlows: null,
        exports: null,
        settings: null,
        tests: null,
        reason: 'Counts are not computable without an authoritative launchable source tree; null is not treated as zero.',
      },
    },
    rejectedAsAuthority: [
      {
        candidate: 'Owner ten-phase OutCall prompt attachment',
        sha256: 'fba5fb4e615cdfcfb0e90ebe0dababa19c7de942628d936f7de16f3b1e18ac7b',
        reason: 'A requested implementation specification is not an executable source tree or runtime fingerprint.',
      },
      {
        candidate: 'Downloads/outcall.ts',
        sha256: '975df74077da54d4060f0d896ade1626443339771100f1ecec054e471c8d71a8',
        reason: 'Byte-identical to apps/api/src/lib/outcall.ts from reconstructed OperatorOS commit 7dcefd279949cca413e99d4d3d1d7cde48aa36b0.',
      },
      {
        candidate: 'Existing OperatorOS OutCall routes, schema, UI, and tests',
        firstImplementationCommit: 'd3839256fab70dd7667f1d2be11ff87782e0f175',
        reason: 'Valid reconstructed Phase 12B work is retained, but it cannot establish parity with missing source.',
      },
    ],
    recoveryEvidence: [
      {
        target: 'Authenticated shotgunsensei GitHub repositories and repository search',
        result: 'No OutCall repository, including private repositories visible to the authenticated account.',
      },
      {
        target: 'C:/Dev/Outcall',
        result: 'Directory is empty and has no .git metadata.',
      },
      {
        target: 'Downloads, Documents, Desktop, OneDrive, and Codex attachment filenames',
        result: 'No source tree or OutCall archive; only the rejected helper and prompt artifacts above.',
      },
      {
        target: 'ReplitExport-johntwms355.tar.gz',
        sha256: '7c351ad3f3b756f587aa4ed80d1ac83e71973fd3fb08c2439857f05edb9c14fc',
        result: 'No OutCall path or matching content in the export or its embedded repository list.',
      },
      {
        target: 'OperatorOS (4).zip embedded Git database',
        sha256: '335c2ab188706a7b0ad1776cdf37d1647c29b9d81e9d555b17ee1fae705eb826',
        result: 'No OutCall path in 22 Replit sub-branches, reachable commits, or 12 unreachable commits.',
      },
      {
        target: 'OperatorOS (2).zip embedded Git database',
        sha256: '34776df937baf6e5ee64b54d9b91c08c0a4f1ce672c5d2850c0987ae5dbdc4aa',
        result: 'No OutCall path in 275 reachable commits or 545 dangling trees.',
      },
      {
        target: 'Current OperatorOS Git object database and remote heads',
        result: 'No remote OutCall branch; unreachable commits contain only the same README-only imported boundary and derived documentation.',
      },
      {
        target: 'Public web index searches for the owner, Replit profile, product host, and GitHub owner',
        result: 'No indexed authoritative source location.',
      },
    ],
    providerAcceptance: {
      twilioSandboxLifecycle: 'NOT_RUN',
      evidence: null,
      configuredOutCallOrTwilioVariableNamesObservedLocally: 0,
      note: 'No credentials were read or fabricated. Provider acceptance remains an external activation gate after source recovery.',
    },
    activationLock: {
      sdkCatalogStatus: 'coming_soon',
      marketingStatus: 'coming_soon',
      ecosystemStatus: 'planned',
      deploymentRegistryEnabled: false,
      existingDatabaseStatusAfterSeed: 'coming_soon',
      checks,
      failClosed,
    },
    acceptance: {
      authoritativeFullSourceExistsAndFingerprintPinned: false,
      everySourceOutcomeMappedAndTested: false,
      completeTwilioSandboxLifecycleProven: false,
      registryEnabledOnlyAfterAllGates: failClosed,
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
  if (!report.activationLock.failClosed) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
