import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { db } from '../db.js';
import type { enqueueSharedJob, SharedJobContext } from './shared-background-jobs.js';
import type { resolveTenantModuleAccess } from './tenant-entitlements.js';
import { tenantRoleToEffective } from './role-aliases.js';
import { brandForgeConnectorPolicy } from './brandforgeos-connector-policy.js';
import { safeFailureCode } from './shared-service-safety.js';

export const BRANDFORGE_SYNC_HANDLER = 'brandforge.phase31.sync.v1';
type Row = Record<string, any>;
type Executor = Pick<typeof db, 'execute'>;

export interface BrandForgeSyncServices {
  database: Pick<typeof db, 'transaction' | 'execute'>;
  enqueue: typeof enqueueSharedJob;
  resolveAccess: typeof resolveTenantModuleAccess;
  hasFeature: (actorId: string, tenantId: string, feature: string) => Promise<boolean>;
  execute: (input: {
    kind: 'webhook' | 'oauth'; payload: Record<string, unknown>; idempotencyKey: string;
  }) => unknown | Promise<unknown>;
  env?: NodeJS.ProcessEnv;
}

export class BrandForgeSyncError extends Error {
  readonly statusCode = 409;
  constructor(readonly code: string, message: string) { super(message); }
}

function deny(code: string, message: string): never {
  throw new BrandForgeSyncError(code, message);
}

/** Persisted connection versions bind the request to one reviewed configuration. */
function connectionIntent(row: Row, actorId: string, env?: NodeJS.ProcessEnv) {
  const policy = brandForgeConnectorPolicy(String(row.provider_key), env);
  if (!policy.allowed) deny('PROVIDER_ADAPTER_UNAVAILABLE', 'Provider-specific sync adapter is unavailable');
  if (!['ready', 'degraded'].includes(String(row.integration_status ?? row.status)) || row.disconnected_at ||
      row.configuration_mode !== 'test' || row.configuration_provider !== `brandforgeos.${policy.catalog.provider}` ||
      row.configuration_kind !== policy.catalog.kind || !row.configuration_id ||
      !Number.isSafeInteger(Number(row.integration_version ?? row.version)) || Number(row.integration_version ?? row.version) < 1 ||
      !Number.isSafeInteger(Number(row.configuration_version)) || Number(row.configuration_version) < 1) {
    deny('BRANDFORGE_SYNC_CONNECTION_CHANGED', 'The connection is no longer ready for this sync');
  }
  return {
    version: 1,
    provider: policy.catalog.provider,
    integrationId: String(row.integration_id ?? row.id),
    integrationVersion: Number(row.integration_version ?? row.version),
    configurationId: String(row.configuration_id),
    configurationVersion: Number(row.configuration_version),
    mode: 'test', direction: 'inbound', actorUserId: actorId,
  };
}

function matchesIntent(actual: unknown, expected: ReturnType<typeof connectionIntent>) {
  if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return false;
  const value = actual as Record<string, unknown>;
  return Object.keys(value).length === Object.keys(expected).length &&
    Object.entries(expected).every(([key, field]) => value[key] === field);
}

/** Reserve the unique shared job and its business run in the same transaction. */
export async function enqueueBrandForgeSync(input: {
  tenantId: string; moduleId: string; actorId: string; provider: string; idempotencyKey?: string;
}, services: BrandForgeSyncServices) {
  return services.database.transaction(async tx => {
    const selected = await tx.execute(sql`
      SELECT link.*,config.id configuration_id,config.version configuration_version,
        config.mode configuration_mode,config.provider_key configuration_provider,config.provider_kind configuration_kind
      FROM brandforge_integrations link
      JOIN shared_provider_configs config ON config.tenant_id=link.tenant_id AND config.id=link.shared_provider_config_id
        AND config.module_id=${input.moduleId} AND config.scope_key=${`module:${input.moduleId}`}
      WHERE link.tenant_id=${input.tenantId} AND link.provider_key=${input.provider}
      FOR SHARE OF link,config
    `);
    const link = selected.rows[0] as Row | undefined;
    if (!link) deny('BRANDFORGE_INTEGRATION_NOT_READY', 'Integration is not ready');
    const intent = connectionIntent(link, input.actorId, services.env);
    const syncId = randomUUID();
    const queued = await services.enqueue({
      tenantId: input.tenantId, moduleId: input.moduleId, requestedByUserId: input.actorId,
      handlerKey: BRANDFORGE_SYNC_HANDLER, payload: { syncId, intent },
      idempotencyKey: input.idempotencyKey ?? syncId,
    }, tx);
    const job = queued.job as Row | undefined;
    if (!job || typeof job.id !== 'string' || !job.id || job.tenant_id !== input.tenantId || job.module_id !== input.moduleId ||
        job.handler_key !== BRANDFORGE_SYNC_HANDLER || job.requested_by_user_id !== input.actorId ||
        !matchesIntent(job.payload_json?.intent, intent) || typeof job.payload_json?.syncId !== 'string' ||
        (!queued.duplicate && job.payload_json.syncId !== syncId)) {
      deny('BRANDFORGE_SYNC_IDEMPOTENCY_CONFLICT', 'This sync key belongs to a different request; use a new key');
    }
    if (queued.duplicate) {
      const existing = await tx.execute(sql`
        SELECT * FROM brandforge_sync_runs WHERE tenant_id=${input.tenantId} AND id=${job.payload_json.syncId}
          AND integration_id=${link.id} AND shared_job_id=${job.id} AND requested_by_user_id=${input.actorId}
          AND direction='inbound' LIMIT 1
      `);
      if (!existing.rows[0]) deny('BRANDFORGE_SYNC_IDEMPOTENCY_CONFLICT', 'The original sync is unavailable; use a new key');
      return { syncRun: existing.rows[0], job, duplicate: true };
    }
    const created = await tx.execute(sql`
      INSERT INTO brandforge_sync_runs (id,tenant_id,integration_id,shared_job_id,requested_by_user_id)
      VALUES (${syncId},${input.tenantId},${link.id},${job.id},${input.actorId}) RETURNING *
    `);
    if (!created.rows[0]) deny('BRANDFORGE_SYNC_NOT_FOUND', 'Sync run could not be created');
    return { syncRun: created.rows[0], job, duplicate: false };
  });
}

async function authorizeSync(context: SharedJobContext, executor: Executor, services: BrandForgeSyncServices) {
  const selected = await executor.execute(sql`
    SELECT run.*,link.provider_key,link.status integration_status,link.version integration_version,link.disconnected_at,
      config.id configuration_id,config.version configuration_version,config.mode configuration_mode,
      config.provider_key configuration_provider,config.provider_kind configuration_kind,
      actor.status actor_status,actor.deleted_at actor_deleted_at,workspace.status tenant_status,membership.role tenant_role
    FROM brandforge_sync_runs run
    JOIN brandforge_integrations link ON link.tenant_id=run.tenant_id AND link.id=run.integration_id
    JOIN shared_provider_configs config ON config.tenant_id=link.tenant_id AND config.id=link.shared_provider_config_id
      AND config.module_id=${context.moduleId} AND config.scope_key=${`module:${context.moduleId}`}
    JOIN modules module ON module.id=config.module_id AND module.slug='brandforgeos'
    JOIN users actor ON actor.id=run.requested_by_user_id
    JOIN tenants workspace ON workspace.id=run.tenant_id
    JOIN tenant_users membership ON membership.tenant_id=run.tenant_id AND membership.user_id=actor.id
    WHERE run.tenant_id=${context.tenantId} AND run.id=${String(context.payload.syncId ?? '')}
    FOR UPDATE OF run FOR SHARE OF link,config,actor,workspace,membership,module
  `);
  const run = selected.rows[0] as Row | undefined;
  if (!run || !context.requestedByUserId || run.requested_by_user_id !== context.requestedByUserId ||
      run.shared_job_id !== context.id || run.direction !== 'inbound') {
    deny('BRANDFORGE_SYNC_AUTHORITY_REVOKED', 'The sync requester or connection is no longer authorized');
  }
  const intent = connectionIntent(run, context.requestedByUserId, services.env);
  if (!matchesIntent(context.payload.intent, intent)) {
    deny('BRANDFORGE_SYNC_CONNECTION_CHANGED', 'The queued connection configuration changed');
  }
  if (run.actor_status !== 'active' || run.actor_deleted_at || run.tenant_status !== 'active' ||
      !['owner', 'admin'].includes(tenantRoleToEffective(run.tenant_role))) {
    deny('BRANDFORGE_SYNC_AUTHORITY_REVOKED', 'The sync requester is no longer an active workspace administrator');
  }
  // These resolvers query current platform/module/member/feature policy, never the enqueue-time session.
  const access = await services.resolveAccess(context.requestedByUserId, context.tenantId, 'brandforgeos');
  const policy = brandForgeConnectorPolicy(String(run.provider_key), services.env);
  if (!policy.allowed || !access.hasAccess || access.moduleId !== context.moduleId ||
      !['user', 'manager'].includes(access.accessLevel) ||
      !(await services.hasFeature(context.requestedByUserId, context.tenantId, policy.catalog.requiredFeature))) {
    deny('BRANDFORGE_SYNC_AUTHORITY_REVOKED', 'Current module write access and integration entitlement are required');
  }
  if (!['queued', 'processing', 'retry', 'completed'].includes(String(run.status))) {
    deny('BRANDFORGE_SYNC_STATE_CHANGED', 'The sync is no longer executable');
  }
  return { run, catalog: policy.catalog };
}

// Admit at most one fenced execution per database/process. Waiting contenders
// must not borrow pool clients: authorization itself uses a short transaction
// plus independent current-policy queries, in addition to the advisory fence.
const activeExecutions = new WeakSet<BrandForgeSyncServices['database']>();

/** No live adapter is registered. Stable sync IDs also bind any future provider idempotency. */
export async function executeBrandForgeSync(context: SharedJobContext, services: BrandForgeSyncServices) {
  const maximum = Number((services.env ?? process.env).DATABASE_POOL_MAX?.trim() || '10');
  if (!Number.isInteger(maximum) || maximum < 3 || maximum > 50) {
    deny('BRANDFORGE_SYNC_DATABASE_CAPACITY_UNAVAILABLE', 'Sync requires a database pool with at least three connections');
  }
  if (activeExecutions.has(services.database)) {
    deny('BRANDFORGE_SYNC_IN_PROGRESS', 'Another sync is processing; retry this job later');
  }
  activeExecutions.add(services.database);
  try {
    // This transaction owns only the advisory lock. Keep row authorization and
    // completion in separate short transactions so revocation/cancellation can
    // commit while an adapter awaits. Crashed connections release the lock;
    // retry keeps the persisted syncId, never a newly generated effect identity.
    await services.database.transaction(async fence => {
      const lock = await fence.execute(sql`
        SELECT pg_try_advisory_xact_lock(hashtextextended(${`brandforge-sync:${context.tenantId}:${context.id}`},0)) acquired
      `);
      if ((lock.rows[0] as { acquired?: unknown } | undefined)?.acquired !== true) {
        deny('BRANDFORGE_SYNC_IN_PROGRESS', 'This sync is processing; retry this job later');
      }
      await executeOwnedBrandForgeSync(context, services);
    });
  } finally { activeExecutions.delete(services.database); }
}

async function executeOwnedBrandForgeSync(context: SharedJobContext, services: BrandForgeSyncServices) {
  const syncId = String(context.payload.syncId ?? '');
  try {
    const initial = await services.database.transaction(async tx => {
      const authorized = await authorizeSync(context, tx, services);
      if (authorized.run.status !== 'completed') await tx.execute(sql`
        UPDATE brandforge_sync_runs SET status='processing',started_at=COALESCE(started_at,NOW())
        WHERE tenant_id=${context.tenantId} AND id=${syncId} AND shared_job_id=${context.id}
      `);
      return authorized;
    });
    if (initial.run.status === 'completed') return;
    const receipt = await services.execute({
      kind: initial.catalog.kind === 'webhook' ? 'webhook' : 'oauth',
      payload: { provider: initial.catalog.provider, syncId }, idempotencyKey: syncId,
    });
    await services.database.transaction(async tx => {
      const current = await authorizeSync(context, tx, services);
      if (current.run.status === 'completed') return;
      await tx.execute(sql`
        UPDATE brandforge_sync_runs SET status='completed',processed_items=1,total_items=1,result=${receipt},error_code=NULL,completed_at=NOW()
        WHERE tenant_id=${context.tenantId} AND id=${syncId} AND shared_job_id=${context.id}
      `);
      await tx.execute(sql`
        UPDATE brandforge_integrations SET last_sync_at=NOW(),health=${{ state: 'test', externalDelivery: false }},updated_at=NOW()
        WHERE tenant_id=${context.tenantId} AND id=${current.run.integration_id}
      `);
    });
  } catch (error) {
    await services.database.execute(sql`
      UPDATE brandforge_sync_runs SET status='dead_letter',error_code=${safeFailureCode(error)},completed_at=NOW()
      WHERE tenant_id=${context.tenantId} AND id=${syncId} AND shared_job_id=${context.id}
        AND requested_by_user_id=${context.requestedByUserId} AND status IN ('queued','processing','retry')
        AND EXISTS (
          SELECT 1 FROM shared_jobs job JOIN modules module ON module.id=job.module_id AND module.slug='brandforgeos'
          WHERE job.id=${context.id} AND job.tenant_id=${context.tenantId} AND job.module_id=${context.moduleId}
            AND job.requested_by_user_id=${context.requestedByUserId} AND job.handler_key=${BRANDFORGE_SYNC_HANDLER}
        )
    `);
    throw error;
  }
}
