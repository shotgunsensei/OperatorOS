import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { sanitizeSharedMetadata } from './shared-service-safety.js';

type Executor = Pick<typeof db, 'execute'>;

const LEGACY_MODULE_ALIASES = Object.freeze<Record<string, string>>({
  operatoros: 'operatoros',
  'operator-os': 'operatoros',
  tradeflowkit: 'tradeflowkit',
  trade_flow_kit: 'tradeflowkit',
  'trade-flow-kit': 'tradeflowkit',
  pulsedesk: 'pulsedesk',
  pulse_desk: 'pulsedesk',
  techdeck: 'techdeck',
  tech_deck: 'techdeck',
  torqueshed: 'torqueshed',
  torque_shed: 'torqueshed',
  studyforge: 'studyforge',
  study_forge: 'studyforge',
  automationpacks: 'ninjamation',
  automation_packs: 'ninjamation',
  'shotgun-ninja-pool-hall': 'ninja-pool-hall',
  shotgun_ninja_pool_hall: 'ninja-pool-hall',
  snapproof: 'snapproofos',
  snap_proof: 'snapproofos',
  ninja_launch_kit: 'ninja-launch-kit',
  call_command: 'callcommand',
  out_call: 'outcall',
});

export function normalizeLegacyModuleIdentifier(value: string): string | null {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '_');
  if (!normalized) return null;
  return LEGACY_MODULE_ALIASES[normalized] ?? (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized) ? normalized : null);
}

export async function resolveModuleIdFromLegacyIdentifier(identifier: string, executor: Executor = db) {
  const slug = normalizeLegacyModuleIdentifier(identifier);
  if (!slug) return null;
  const result = await executor.execute(sql`SELECT id, slug FROM modules WHERE slug = ${slug} LIMIT 1`);
  return result.rows[0] ? { id: String(result.rows[0].id), slug: String(result.rows[0].slug) } : null;
}

export async function upsertLegacyReference(input: {
  tenantId: string;
  moduleId: string;
  sourceSystem: string;
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  provenance?: Record<string, unknown>;
}, executor: Executor = db) {
  const provenance = sanitizeSharedMetadata(input.provenance);
  const result = await executor.execute(sql`
    INSERT INTO shared_legacy_references (
      tenant_id, module_id, source_system, source_type, source_id,
      target_type, target_id, provenance_json
    ) VALUES (
      ${input.tenantId}, ${input.moduleId}, ${input.sourceSystem.slice(0, 120)},
      ${input.sourceType.slice(0, 80)}, ${input.sourceId.slice(0, 200)},
      ${input.targetType.slice(0, 80)}, ${input.targetId.slice(0, 200)}, ${provenance}
    )
    ON CONFLICT (tenant_id, module_id, source_system, source_type, source_id)
    DO UPDATE SET target_type = EXCLUDED.target_type, target_id = EXCLUDED.target_id,
      provenance_json = EXCLUDED.provenance_json, imported_at = NOW()
    RETURNING *
  `);
  return result.rows[0];
}

export async function resolveLegacyReference(input: {
  tenantId: string;
  moduleId: string;
  sourceSystem: string;
  sourceType: string;
  sourceId: string;
}, executor: Executor = db) {
  const result = await executor.execute(sql`
    SELECT source_system, source_type, source_id, target_type, target_id, provenance_json, imported_at
    FROM shared_legacy_references
    WHERE tenant_id = ${input.tenantId} AND module_id = ${input.moduleId}
      AND source_system = ${input.sourceSystem} AND source_type = ${input.sourceType}
      AND source_id = ${input.sourceId}
    LIMIT 1
  `);
  return result.rows[0] ?? null;
}

export const SHARED_COMPATIBILITY_ADAPTERS = Object.freeze([
  { id: 'identity-session-v1', outcome: 'Existing users launch and return through exact-host SSO without a module-local login.', testId: 'P22-ADAPTER-SSO-001' },
  { id: 'tenant-access-v1', outcome: 'Existing tenant roles and legacy module access aliases preserve read/write intent.', testId: 'P22-ADAPTER-RBAC-001' },
  { id: 'directory-reference-v1', outcome: 'Imported organizations, sites, contacts, and requesters keep stable cross-module references.', testId: 'P22-ADAPTER-DIRECTORY-001' },
  { id: 'provider-outbox-v1', outcome: 'Provider-backed workflows become truthful queued, retry, delivered, recorded, or dead-letter states.', testId: 'P22-PROVIDER-001' },
  { id: 'attachment-v1', outcome: 'Legacy attachments retain metadata, quarantine, retention, and authorized retrieval semantics.', testId: 'P22-ADAPTER-ATTACHMENT-001' },
  { id: 'job-export-v1', outcome: 'Long-running legacy actions remain asynchronous and restart-safe.', testId: 'P22-ADAPTER-JOB-001' },
  { id: 'usage-credit-v1', outcome: 'Legacy usage and AI-credit actions resolve through OperatorOS billing authority.', testId: 'P22-ADAPTER-USAGE-001' },
  { id: 'search-deeplink-v1', outcome: 'Legacy object references remain searchable only inside their trusted tenant.', testId: 'P22-ADAPTER-SEARCH-001' },
]);
