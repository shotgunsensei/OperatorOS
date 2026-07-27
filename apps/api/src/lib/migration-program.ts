import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MODULE_CATALOG } from '../../../../packages/sdk/src/catalog.js';
import { planBrandForgeOsImport } from './brandforgeos-import.js';
import { planCallCommandImport } from './callcommand-import.js';
import { CALLCOMMAND_SOURCE_COMMIT } from './callcommand.js';
import { DATABASE_RELEASE_STEPS } from './database-release-contract.js';
import { planFaultlineLabImport } from './faultlinelab-import.js';
import { planNinjaLaunchKitImport, NINJA_LAUNCH_KIT_SOURCE_COMMIT } from './ninja-launch-kit-import.js';
import { planNinjaPoolHallImport } from './ninja-pool-hall-import.js';
import { planNinjamationImport } from './ninjamation-import.js';
import { NINJAMATION_CATALOG_COMMIT, NINJAMATION_SOURCE_COMMIT } from './ninjamation.js';
import { planOutCallImport, OUTCALL_SOURCE_CONTRACT } from './outcall-import.js';
import { planPulseDeskImport } from './pulsedesk-import.js';
import { buildSnapProofMigrationPlan, SNAPPROOF_SOURCE_COMMIT } from './snapproofos-import.js';
import { planStudyForgeImport, STUDYFORGE_SOURCE_COMMIT } from './studyforge-import.js';
import { planTechDeckImport } from './techdeck-import.js';
import { planTorqueShedImport } from './torqueshed-import.js';
import { planTradeFlowKitImport } from './tradeflowkit-import.js';

const repoRoot = resolve(process.cwd());

export const PROHIBITED_MIGRATION_AUTHORITY = Object.freeze([
  'passwords and password hashes',
  'sessions, refresh tokens, bearer tokens, and SSO codes',
  'standalone users without an approved OperatorOS identity mapping',
  'child tenants, memberships, roles, and admin authority',
  'child subscriptions, entitlements, Stripe state, and billing authority',
  'provider credentials, API keys, webhook secrets, and encryption keys',
] as const);

export interface ModuleMigrationManifest {
  slug: string;
  source: {
    system: string;
    version: string;
    commit: string | null;
    catalogCommit?: string;
    exportMethod: string;
  };
  targetReleaseStep: string;
  mappings: readonly string[];
  reconciliation: readonly string[];
  conflicts: string;
  rollback: string;
  writeFreeze: string;
  cutoverBlockers: readonly string[];
}

const sharedRollback =
  'Stop apply, preserve the failed target, restore the pre-apply backup to a new database, verify it, and switch traffic only after human approval.';
const sharedFreeze =
  'Disable standalone writes before final export; keep OperatorOS module writes disabled until reconciliation passes; never permit dual write.';

export const PHASE13_MIGRATION_MANIFESTS: readonly ModuleMigrationManifest[] = Object.freeze([
  {
    slug: 'tradeflowkit',
    source: { system: 'C:\\Dev\\TradeFlowKit', version: 'export-v1', commit: '6d0c13df5e324f6aba9cdf2cf14a550d0cf0ca55', exportMethod: 'Authorized JSON export passed to the deterministic planner.' },
    targetReleaseStep: 'tradeflowkit_tables',
    mappings: ['OperatorOS tenant/user map', 'Shared Directory customers', 'jobs, quotes, invoices, payments, and source migration references'],
    reconciliation: ['table counts and orphan references', 'quote/invoice/payment integer-minor-unit totals', 'archived/deleted state and timestamps'],
    conflicts: 'Reject duplicate source IDs, missing references, invalid money, or an unmapped owner; never merge implicitly.',
    rollback: sharedRollback, writeFreeze: sharedFreeze,
    cutoverBlockers: ['Authorized frozen production export', 'approved tenant/user mapping', 'backup and restore rehearsal'],
  },
  {
    slug: 'torqueshed',
    source: { system: 'C:\\Dev\\TorqueShed-Codex (read-only)', version: 'export-v1', commit: '508b384b6f66a1eacd3d4cd8d9c5edd4bf47fe75', exportMethod: 'Authorized JSON export with explicit OperatorOS identity mappings and private attachment bytes.' },
    targetReleaseStep: 'torqueshed_tables',
    mappings: ['OperatorOS tenant/user map', 'vehicles and service/diagnostic records', 'private attachments by hash', 'Marketplace and Community only when an authoritative export exists'],
    reconciliation: ['counts and orphan references', 'integer-minor-unit service/part totals', 'attachment bytes and SHA-256', 'ownership, timestamps, archived state'],
    conflicts: 'Reject missing identity mappings, decimal costs, duplicate IDs, invalid VIN handling, and unresolved social ownership.',
    rollback: sharedRollback, writeFreeze: sharedFreeze,
    cutoverBlockers: ['Clean authoritative source export', 'social dataset decision', 'backup/restore and browser acceptance'],
  },
  {
    slug: 'techdeck',
    source: { system: 'C:\\Dev\\Tech-Deck', version: 'export-v1', commit: '8125f8d89d8d39d60a50c8061a26133a0c917792', exportMethod: 'Authorized JSON export; external secret values and remote actions are excluded.' },
    targetReleaseStep: 'techdeck_tables',
    mappings: ['OperatorOS tenant/user map', 'Shared Directory clients/sites', 'configuration inventory and topology', 'documents/revisions and private attachments'],
    reconciliation: ['counts, unique keys, and orphan references', 'configuration relationships', 'attachment hashes and external vault references'],
    conflicts: 'Reject duplicate IDs, missing composite references, and secret-shaped included fields.',
    rollback: sharedRollback, writeFreeze: sharedFreeze,
    cutoverBlockers: ['Authorized frozen export', 'approved tenant/user mapping', 'external vault/reference review'],
  },
  {
    slug: 'pulsedesk',
    source: { system: 'C:\\Dev\\PulseDesk', version: 'export-v1 privacy-minimized', commit: '937849471e489ed23db2a263d04160a388402740', exportMethod: 'Privacy-reviewed JSON export; PHI/clinical fields and credentials are rejected.' },
    targetReleaseStep: 'pulsedesk_tables',
    mappings: ['OperatorOS tenant/user map', 'Shared Directory clients/facilities/requesters', 'operational tickets/assets/departments', 'private attachments and SLA/time records'],
    reconciliation: ['counts and all references', 'privacy findings must be zero', 'ownership, timestamps, archived state, attachment hashes'],
    conflicts: 'Reject PHI-shaped fields, credentials, duplicate IDs, missing Directory mappings, or orphan operational records.',
    rollback: sharedRollback, writeFreeze: sharedFreeze,
    cutoverBlockers: ['Authorized privacy-reviewed export', 'privacy owner sign-off', 'approved tenant/user mapping'],
  },
  {
    slug: 'faultlinelab',
    source: { system: 'C:\\Dev\\Faultline-Lab snapshot', version: 'hash-pinned starter manifest', commit: '46877aae35565149ccf4f4988dd94627fc6bb92b', exportMethod: 'Read-only reviewed content manifest; no standalone database apply.' },
    targetReleaseStep: 'faultlinelab_tables',
    mappings: ['four runnable challenges and immutable versions', 'source IDs/slugs/content hashes', '52 planned-only cards explicitly excluded'],
    reconciliation: ['unique source IDs/slugs', 'content hashes', 'zero authority/billing imports'],
    conflicts: 'Reject hash drift or duplicate IDs/slugs; do not promote planned-only cards.',
    rollback: sharedRollback, writeFreeze: sharedFreeze,
    cutoverBlockers: ['Deployed acceptance', 'separate approval if a future standalone data export appears'],
  },
  {
    slug: 'ninja-pool-hall',
    source: { system: 'C:\\Dev\\Shotgun-ninja-pool-hall snapshot', version: 'source manifest', commit: '62439c4018ec551ce2891800351200c8ab2cb9e7', exportMethod: 'Hash verification of promoted engine files; source has no durable data rows.' },
    targetReleaseStep: 'ninja_pool_hall_tables',
    mappings: ['physics/rules/bot/audio source files', 'OperatorOS profiles and match summaries initialized natively', 'browser identity and unsafe relay excluded'],
    reconciliation: ['five promoted file hashes', 'zero durable source rows', 'zero identity/billing imports'],
    conflicts: 'Reject source hash drift; never trust localStorage identity or historical results as server evidence.',
    rollback: sharedRollback, writeFreeze: sharedFreeze,
    cutoverBlockers: ['Deployed gameplay acceptance'],
  },
  {
    slug: 'brandforgeos',
    source: { system: 'C:\\Dev\\BrandForge-OS snapshot', version: 'reviewed source manifest', commit: '5e78bc2ee6c8086ddd589bb7416f1d4560ffbb4e', exportMethod: 'Pinned source evidence; a future data export requires separate authorization.' },
    targetReleaseStep: 'brandforgeos_tables',
    mappings: ['tenant/user ownership', 'brands/personas/campaigns/copy/calendar', 'shared AI usage/activity', 'fake counters and child commerce excluded'],
    reconciliation: ['source manifest and selected file hashes', 'business row counts and references when export exists', 'zero authority/provider credential imports'],
    conflicts: 'Reject unpinned source, missing ownership, random analytics, child credit state, or implicit duplicates.',
    rollback: sharedRollback, writeFreeze: sharedFreeze,
    cutoverBlockers: ['Authorized frozen data export', 'approved tenant/user mapping', 'duplicate policy'],
  },
  {
    slug: 'snapproofos',
    source: { system: 'C:\\Dev\\snapproof snapshot', version: 'legacy export assessment', commit: SNAPPROOF_SOURCE_COMMIT, exportMethod: 'Commit-pinned JSON metadata plus separately authorized private file-byte transfer package.' },
    targetReleaseStep: 'snapproofos_tables',
    mappings: ['jobs to evidence cases', 'findings and internal comments', 'private attachments by verified bytes/hash', 'reports regenerated from approved snapshots'],
    reconciliation: ['case/finding/comment/report counts', 'attachment byte counts and SHA-256', 'custody links, ownership, timestamps, retention state'],
    conflicts: 'Reject public/file URLs, share tokens, missing file bytes, hash mismatch, source drift, or child authority.',
    rollback: sharedRollback, writeFreeze: sharedFreeze,
    cutoverBlockers: ['Authorized export and private file bytes', 'approved tenant/user mapping', 'attachment integrity acceptance'],
  },
  {
    slug: 'studyforge-ai',
    source: { system: 'C:\\Dev\\Study-Forge snapshot', version: 'reviewed JSON descriptor', commit: STUDYFORGE_SOURCE_COMMIT, exportMethod: 'Commit-pinned authorized JSON export descriptor.' },
    targetReleaseStep: 'studyforge_tables',
    mappings: ['folders/sets to subjects and sources', 'cards/questions/attempts/sessions', 'activity recomputed from accepted records'],
    reconciliation: ['counts and source hashes', 'owner mappings', 'source-grounding and published-state review'],
    conflicts: 'Reject unpinned source, missing owners, unsafe documents, or unreviewed content publication.',
    rollback: sharedRollback, writeFreeze: sharedFreeze,
    cutoverBlockers: ['Authorized export', 'approved tenant/user mapping', 'per-record publication review'],
  },
  {
    slug: 'ninja-launch-kit',
    source: { system: 'C:\\Dev\\Ninja-Launch-Kit snapshot', version: 'reviewed JSON descriptor', commit: NINJA_LAUNCH_KIT_SOURCE_COMMIT, exportMethod: 'Commit-pinned authorized JSON export descriptor.' },
    targetReleaseStep: 'ninja_launch_kit_tables',
    mappings: ['launch kits and reviewed artifacts', 'bounded brand profile snapshot', 'exports regenerated with OperatorOS provenance'],
    reconciliation: ['counts and source hashes', 'task/artifact ownership', 'approval and archived state'],
    conflicts: 'Reject legacy URL-token SSO, child billing, unapproved content, missing owners, or unpinned source.',
    rollback: sharedRollback, writeFreeze: sharedFreeze,
    cutoverBlockers: ['Authorized export', 'approved tenant/user mapping', 'per-record artifact review'],
  },
  {
    slug: 'callcommand-ai',
    source: { system: 'C:\\Dev\\Call-Command-AI snapshot', version: 'reviewed JSON descriptor', commit: CALLCOMMAND_SOURCE_COMMIT, exportMethod: 'Commit-pinned authorized export with consent/suppression review; raw provider payloads are excluded.' },
    targetReleaseStep: 'callcommand_tables',
    mappings: ['channels/profiles/transfer targets', 'safe call records/events', 'consent and suppression evidence', 'provider IDs only after verification'],
    reconciliation: ['counts and source hash', 'phone ownership, consent, and suppression', 'provider IDs and safe event chronology'],
    conflicts: 'Reject calls without consent, suppressed numbers, recording metadata, raw payloads, secrets, or missing ownership.',
    rollback: sharedRollback, writeFreeze: sharedFreeze,
    cutoverBlockers: ['Authorized export', 'consent/privacy owner approval', 'live-provider acceptance'],
  },
  {
    slug: 'ninjamation',
    source: { system: 'C:\\Dev\\Ninjamation plus AutomationPacks', version: 'application and catalog snapshots', commit: NINJAMATION_SOURCE_COMMIT, catalogCommit: NINJAMATION_CATALOG_COMMIT, exportMethod: 'Dual-commit-pinned catalog export; each script imports only as a reviewed draft.' },
    targetReleaseStep: 'ninjamation_tables',
    mappings: ['scripts to immutable tenant draft versions', 'download counters recomputed from OperatorOS events', 'generated scripts remain unapproved drafts'],
    reconciliation: ['script counts and body hashes', 'secret/static/license review', 'owner and approval state'],
    conflicts: 'Reject source/catalog drift, embedded secrets, executable claims, child download counters, or implicit approval.',
    rollback: sharedRollback, writeFreeze: sharedFreeze,
    cutoverBlockers: ['Authorized catalog export', 'approved tenant/user mapping', 'human review for every script'],
  },
  {
    slug: 'outcall',
    source: { system: 'No recovered standalone repository', version: OUTCALL_SOURCE_CONTRACT, commit: null, exportMethod: 'Documented zero-row migration; schema initializes only through the OperatorOS release.' },
    targetReleaseStep: 'outcall_tables',
    mappings: ['product contract to ADR-0027', 'zero source rows', 'all identity/tenant/billing/provider authority remains OperatorOS-owned'],
    reconciliation: ['source row count remains zero', 'no child authority or secrets', 'target tables empty before first authorized use'],
    conflicts: 'Do not invent data, import from CallCommand, or infer provider credentials.',
    rollback: sharedRollback, writeFreeze: 'No standalone write surface exists; keep provider functionality gated until separately accepted.',
    cutoverBlockers: ['Live provider acceptance', 'deployed acceptance'],
  },
]);

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(repoRoot, 'apps/api/test/fixtures', name), 'utf8'));
}

function plannerPassed(plan: Record<string, unknown>): boolean {
  if (Array.isArray(plan.errors) && plan.errors.length > 0) return false;
  for (const key of ['readyToApply', 'readyToInitialize', 'ready']) {
    if (key in plan && plan[key] !== true) return false;
  }
  return plan.mode === 'dry-run';
}

function runPlanner(slug: string): Record<string, unknown> {
  switch (slug) {
    case 'tradeflowkit': return planTradeFlowKitImport(fixture('tradeflowkit-export-v1.json')) as unknown as Record<string, unknown>;
    case 'techdeck': return planTechDeckImport(fixture('techdeck-export-v1.json')) as unknown as Record<string, unknown>;
    case 'pulsedesk': return planPulseDeskImport(fixture('pulsedesk-export-v1.json')) as unknown as Record<string, unknown>;
    case 'torqueshed': return planTorqueShedImport(fixture('torqueshed-export-v1.json')) as unknown as Record<string, unknown>;
    case 'faultlinelab': return planFaultlineLabImport() as unknown as Record<string, unknown>;
    case 'ninja-pool-hall': return planNinjaPoolHallImport() as unknown as Record<string, unknown>;
    case 'brandforgeos': return planBrandForgeOsImport() as unknown as Record<string, unknown>;
    case 'snapproofos': return buildSnapProofMigrationPlan({ sourceCommit: SNAPPROOF_SOURCE_COMMIT, jobs: [], findings: [], notes: [], files: [], reports: [] }) as unknown as Record<string, unknown>;
    case 'studyforge-ai': return planStudyForgeImport({ sourceCommit: STUDYFORGE_SOURCE_COMMIT, export: {} }) as unknown as Record<string, unknown>;
    case 'ninja-launch-kit': return planNinjaLaunchKitImport({ sourceCommit: NINJA_LAUNCH_KIT_SOURCE_COMMIT, export: {} }) as unknown as Record<string, unknown>;
    case 'callcommand-ai': return planCallCommandImport({ sourceCommit: CALLCOMMAND_SOURCE_COMMIT, export: {} }) as unknown as Record<string, unknown>;
    case 'ninjamation': return planNinjamationImport({ sourceCommit: NINJAMATION_SOURCE_COMMIT, catalogCommit: NINJAMATION_CATALOG_COMMIT, export: {} }) as unknown as Record<string, unknown>;
    case 'outcall': return planOutCallImport() as unknown as Record<string, unknown>;
    default: throw new Error(`No Phase 13 migration planner exists for ${slug}`);
  }
}

export function validateMigrationManifestCoverage(): string[] {
  const errors: string[] = [];
  const catalogSlugs = MODULE_CATALOG.map(module => module.slug).sort();
  const manifestSlugs = PHASE13_MIGRATION_MANIFESTS.map(module => module.slug).sort();
  if (stable(catalogSlugs) !== stable(manifestSlugs)) {
    errors.push(`Manifest coverage differs from active catalog: catalog=${catalogSlugs.join(',')} manifest=${manifestSlugs.join(',')}`);
  }
  const seen = new Set<string>();
  const releaseSteps = new Set<string>(DATABASE_RELEASE_STEPS.map(step => step.id));
  for (const manifest of PHASE13_MIGRATION_MANIFESTS) {
    if (seen.has(manifest.slug)) errors.push(`Duplicate migration manifest for ${manifest.slug}`);
    seen.add(manifest.slug);
    if (!manifest.source.version || !manifest.source.exportMethod) errors.push(`${manifest.slug} lacks source version/export method`);
    if (!releaseSteps.has(manifest.targetReleaseStep)) errors.push(`${manifest.slug} references unknown target release step ${manifest.targetReleaseStep}`);
    if (!manifest.mappings.length || !manifest.reconciliation.length) errors.push(`${manifest.slug} lacks mappings/reconciliation`);
    if (!manifest.rollback || !manifest.writeFreeze || !manifest.cutoverBlockers.length) errors.push(`${manifest.slug} lacks rollback/write-freeze/cutover gates`);
  }
  return errors;
}

export function runPhase13MigrationRehearsal(selectedSlug?: string) {
  const manifestErrors = validateMigrationManifestCoverage();
  const selected = selectedSlug
    ? PHASE13_MIGRATION_MANIFESTS.filter(manifest => manifest.slug === selectedSlug)
    : PHASE13_MIGRATION_MANIFESTS;
  if (selectedSlug && selected.length !== 1) throw new Error(`Unknown migration module ${selectedSlug}`);

  const modules = selected.map((manifest) => {
    const started = performance.now();
    const first = runPlanner(manifest.slug);
    const second = runPlanner(manifest.slug);
    const firstHash = createHash('sha256').update(stable(first)).digest('hex');
    const secondHash = createHash('sha256').update(stable(second)).digest('hex');
    const deterministic = firstHash === secondHash;
    const rehearsalPassed = deterministic && plannerPassed(first);
    return {
      slug: manifest.slug,
      source: manifest.source,
      targetReleaseStep: manifest.targetReleaseStep,
      rehearsalPassed,
      deterministic,
      planFingerprint: firstHash,
      durationMs: Math.round((performance.now() - started) * 100) / 100,
      plannerBlockers: Array.isArray(first.blockers) ? first.blockers : [],
      productionCutoverReady: false,
      cutoverBlockers: manifest.cutoverBlockers,
    };
  });

  const deterministicEvidence = modules.map(({ durationMs: _durationMs, ...module }) => module);
  return {
    programVersion: 1,
    mode: 'dry-run' as const,
    scope: selectedSlug ?? 'all-active-modules',
    authorityImported: false,
    databaseWritesPerformed: false,
    applySupported: false,
    manifestErrors,
    prohibitedAuthority: PROHIBITED_MIGRATION_AUTHORITY,
    modules,
    summary: {
      total: modules.length,
      passed: modules.filter(module => module.rehearsalPassed).length,
      failed: modules.filter(module => !module.rehearsalPassed).length,
      productionCutoverReady: 0,
    },
    evidenceFingerprint: createHash('sha256')
      .update(stable({ manifestErrors, prohibitedAuthority: PROHIBITED_MIGRATION_AUTHORITY, modules: deterministicEvidence }))
      .digest('hex'),
  };
}
