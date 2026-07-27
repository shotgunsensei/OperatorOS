import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { requireTenantModuleAccess, requireTenantModuleWriteAccess } from '../lib/tenant-auth.js';
import {
  DEFAULT_PHASES,
  LAUNCHKIT_ARTIFACT_KINDS,
  LAUNCHKIT_TEMPLATES,
  LaunchKitValidationError,
  calculateLaunchReadiness,
  parseArtifactCreate,
  parseArtifactPatch,
  parseGeneratedArtifacts,
  parseGeneration,
  parseLaunchCreate,
  parseLaunchPatch,
  parsePlanItem,
  parsePlanPatch,
  parseTaskPatch,
  sha256,
} from '../lib/ninja-launch-kit.js';
import { planNinjaLaunchKitImport } from '../lib/ninja-launch-kit-import.js';
import { AiProviderDisabledError, getAiProvider, getProviderInfo } from '../lib/ai-provider.js';
import {
  appendActivityEvent,
  beginIdempotentOperation,
  completeIdempotentOperation,
  failIdempotentOperation,
  listActivityEvents,
  recordUsageEvent,
} from '../lib/shared-usage-activity.js';
import {
  createAttachment,
  getAttachmentContent,
  getMaxAttachmentBytes,
  listAttachments,
} from '../lib/shared-attachments.js';

const readGuards = [requireTenantModuleAccess('ninja-launch-kit')];
const writeGuards = [...readGuards, requireTenantModuleWriteAccess];
type Row = Record<string, any>;
type Executor = Pick<typeof db, 'execute'>;

function context(request: FastifyRequest) {
  return {
    tenantId: String((request as any).tenantContext.tenantId),
    userId: String((request as any).user.id),
  };
}

function validation(reply: FastifyReply, error: unknown) {
  if (!(error instanceof LaunchKitValidationError)) return false;
  reply.code(error.statusCode).send({
    error: error.message,
    code: error.code,
    ...(error.field ? { field: error.field } : {}),
  });
  return true;
}

function notFound(reply: FastifyReply, entity: string) {
  return reply.code(404).send({
    error: `${entity} not found`,
    code: `LAUNCHKIT_${entity.toUpperCase().replaceAll(' ', '_')}_NOT_FOUND`,
  });
}

function conflict(reply: FastifyReply, entity: string) {
  return reply.code(409).send({
    error: `${entity} changed; reload before saving`,
    code: 'LAUNCHKIT_VERSION_CONFLICT',
  });
}

function camel(row: Row): Row {
  const result: Row = {};
  for (const [key, value] of Object.entries(row)) {
    result[key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
  }
  delete result.tenantId;
  delete result.deletedAt;
  delete result.inputSha256;
  return result;
}

async function moduleId(executor: Executor = db): Promise<string | null> {
  const result = await executor.execute(sql`SELECT id FROM modules WHERE slug='ninja-launch-kit' LIMIT 1`);
  return result.rows[0] ? String(result.rows[0].id) : null;
}

async function launch(tenantId: string, id: string, executor: Executor = db): Promise<Row | null> {
  const result = await executor.execute(sql`
    SELECT * FROM launchkit_launches
    WHERE tenant_id=${tenantId} AND id=${id} AND deleted_at IS NULL LIMIT 1
  `);
  return (result.rows[0] as Row | undefined) ?? null;
}

async function activeMember(tenantId: string, userId: string | null | undefined, executor: Executor = db) {
  if (!userId) return true;
  const result = await executor.execute(sql`
    SELECT 1 FROM tenant_users WHERE tenant_id=${tenantId} AND user_id=${userId} LIMIT 1
  `);
  return !!result.rows[0];
}

async function requireOwner(tenantId: string, userId: string | null | undefined, reply: FastifyReply, executor: Executor = db) {
  if (await activeMember(tenantId, userId, executor)) return true;
  reply.code(400).send({
    error: 'Owner must be a current member of this tenant',
    code: 'LAUNCHKIT_OWNER_INVALID',
  });
  return false;
}

async function activity(
  request: FastifyRequest,
  eventType: string,
  objectType: string,
  objectId: string,
  summary: string,
  metadata?: Record<string, unknown>,
) {
  const { tenantId, userId } = context(request);
  const modId = await moduleId();
  if (!modId) return;
  await appendActivityEvent({
    tenantId,
    moduleId: modId,
    actorUserId: userId,
    objectType,
    objectId,
    eventType,
    summary,
    metadata,
  });
}

async function readiness(tenantId: string, launchRow: Row, executor: Executor = db) {
  const tasks = await executor.execute(sql`
    SELECT id,title,status,required FROM launchkit_tasks
    WHERE tenant_id=${tenantId} AND launch_id=${String(launchRow.id)} AND deleted_at IS NULL
    ORDER BY position,id
  `);
  const artifacts = await executor.execute(sql`
    SELECT id,title,kind,status,required FROM launchkit_artifacts
    WHERE tenant_id=${tenantId} AND launch_id=${String(launchRow.id)} AND deleted_at IS NULL
    ORDER BY kind,id
  `);
  return calculateLaunchReadiness({
    launch: launchRow,
    tasks: tasks.rows as Row[],
    artifacts: artifacts.rows as Row[],
  });
}

async function workspace(tenantId: string, launchId?: string | null) {
  const launches = launchId
    ? await db.execute(sql`
        SELECT * FROM launchkit_launches
        WHERE tenant_id=${tenantId} AND id=${launchId} AND deleted_at IS NULL LIMIT 1
      `)
    : await db.execute(sql`
        SELECT * FROM launchkit_launches
        WHERE tenant_id=${tenantId} AND deleted_at IS NULL
        ORDER BY updated_at DESC,id DESC LIMIT 100
      `);
  if (launchId && !launches.rows[0]) return null;
  const ids = launches.rows.map((row) => String(row.id));
  const selected = launchId ? launches.rows[0] as Row : null;
  const plan = selected
    ? await Promise.all([
        db.execute(sql`SELECT * FROM launchkit_phases WHERE tenant_id=${tenantId} AND launch_id=${launchId} AND deleted_at IS NULL ORDER BY position,id`),
        db.execute(sql`SELECT * FROM launchkit_milestones WHERE tenant_id=${tenantId} AND launch_id=${launchId} AND deleted_at IS NULL ORDER BY position,id`),
        db.execute(sql`SELECT * FROM launchkit_tasks WHERE tenant_id=${tenantId} AND launch_id=${launchId} AND deleted_at IS NULL ORDER BY position,id`),
        db.execute(sql`SELECT * FROM launchkit_artifacts WHERE tenant_id=${tenantId} AND launch_id=${launchId} AND deleted_at IS NULL ORDER BY kind,id`),
        db.execute(sql`SELECT * FROM launchkit_exports WHERE tenant_id=${tenantId} AND launch_id=${launchId} ORDER BY created_at DESC LIMIT 25`),
      ])
    : null;
  const selectedReadiness = selected ? await readiness(tenantId, selected) : null;
  const summary = await db.execute(sql`
    SELECT
      COUNT(*)::int AS launches,
      COUNT(*) FILTER (WHERE status='launched')::int AS launched,
      COUNT(*) FILTER (WHERE target_date IS NOT NULL AND target_date < CURRENT_DATE AND status NOT IN ('launched','archived'))::int AS overdue
    FROM launchkit_launches WHERE tenant_id=${tenantId} AND deleted_at IS NULL
  `);
  return {
    summary: summary.rows[0],
    launches: launches.rows.map(camel),
    selected: selected ? camel(selected) : null,
    phases: plan ? plan[0].rows.map(camel) : [],
    milestones: plan ? plan[1].rows.map(camel) : [],
    tasks: plan ? plan[2].rows.map(camel) : [],
    artifacts: plan ? plan[3].rows.map(camel) : [],
    exports: plan ? plan[4].rows.map(camel) : [],
    readiness: selectedReadiness,
    selectedIds: ids,
    ai: getProviderInfo(),
  };
}

async function insertDefaultPlan(
  tx: Executor,
  input: { tenantId: string; userId: string; launchId: string; title: string },
) {
  let position = 0;
  for (const phaseTemplate of DEFAULT_PHASES) {
    const phase = await tx.execute(sql`
      INSERT INTO launchkit_phases (tenant_id,launch_id,position,title)
      VALUES (${input.tenantId},${input.launchId},${position},${phaseTemplate.title}) RETURNING id
    `);
    const milestone = await tx.execute(sql`
      INSERT INTO launchkit_milestones (tenant_id,launch_id,phase_id,position,title)
      VALUES (${input.tenantId},${input.launchId},${String(phase.rows[0].id)},${position},
        ${`${phaseTemplate.title} complete`}) RETURNING id
    `);
    for (const taskTitle of phaseTemplate.tasks) {
      await tx.execute(sql`
        INSERT INTO launchkit_tasks
          (tenant_id,launch_id,milestone_id,position,title,owner_user_id,required)
        VALUES (${input.tenantId},${input.launchId},${String(milestone.rows[0].id)},${position},
          ${taskTitle},${input.userId},TRUE)
      `);
      position += 1;
    }
  }
  for (const kind of LAUNCHKIT_ARTIFACT_KINDS) {
    const title = kind.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
    await tx.execute(sql`
      INSERT INTO launchkit_artifacts
        (tenant_id,launch_id,created_by_user_id,kind,title,body,status,required)
      VALUES (${input.tenantId},${input.launchId},${input.userId},${kind},${title},
        ${`${title} has not been authored yet.`},'draft',TRUE)
    `);
  }
}

async function assertDependency(
  tenantId: string,
  launchId: string,
  taskId: string | null,
  dependencyId: string | null,
  reply: FastifyReply,
) {
  if (!dependencyId) return true;
  if (dependencyId === taskId) {
    reply.code(400).send({ error: 'A task cannot depend on itself', code: 'LAUNCHKIT_TASK_DEPENDENCY_INVALID' });
    return false;
  }
  const dependency = await db.execute(sql`
    SELECT id,depends_on_task_id FROM launchkit_tasks
    WHERE tenant_id=${tenantId} AND launch_id=${launchId} AND id=${dependencyId} AND deleted_at IS NULL LIMIT 1
  `);
  if (!dependency.rows[0]) {
    notFound(reply, 'dependency task');
    return false;
  }
  const seen = new Set<string>();
  let cursor: string | null = dependencyId;
  while (cursor) {
    if (cursor === taskId || seen.has(cursor)) {
      reply.code(409).send({ error: 'Task dependency would create a cycle', code: 'LAUNCHKIT_TASK_DEPENDENCY_CYCLE' });
      return false;
    }
    seen.add(cursor);
    const dependencyResult: Awaited<ReturnType<typeof db.execute>> = await db.execute(sql`
      SELECT depends_on_task_id FROM launchkit_tasks
      WHERE tenant_id=${tenantId} AND launch_id=${launchId} AND id=${cursor} AND deleted_at IS NULL LIMIT 1
    `);
    cursor = dependencyResult.rows[0]?.depends_on_task_id
      ? String(dependencyResult.rows[0].depends_on_task_id)
      : null;
  }
  return true;
}

function launchExport(data: NonNullable<Awaited<ReturnType<typeof workspace>>>, format: string) {
  const safe = {
    launch: data.selected,
    readiness: data.readiness,
    phases: data.phases,
    milestones: data.milestones,
    tasks: data.tasks,
    artifacts: data.artifacts,
  };
  if (format === 'json') return { mimeType: 'application/json', content: JSON.stringify(safe, null, 2) };
  if (format === 'csv') {
    const lines = ['type,title,status,required'];
    for (const task of data.tasks) lines.push(`task,${JSON.stringify(task.title)},${task.status},${task.required}`);
    for (const artifact of data.artifacts) lines.push(`artifact,${JSON.stringify(artifact.title)},${artifact.status},${artifact.required}`);
    return { mimeType: 'text/csv; charset=utf-8', content: lines.join('\n') };
  }
  const content = [
    `# ${data.selected?.title}`,
    '',
    `Status: ${data.selected?.status}`,
    `Readiness: ${data.readiness?.score}% (${data.readiness?.complete}/${data.readiness?.total})`,
    '',
    '## Tasks',
    ...data.tasks.map((task) => `- [${task.status === 'complete' ? 'x' : ' '}] ${task.title}`),
    '',
    '## Approved and draft artifacts',
    ...data.artifacts.flatMap((artifact) => [`### ${artifact.title} (${artifact.status})`, '', artifact.body, '']),
  ].join('\n');
  return { mimeType: 'text/markdown; charset=utf-8', content };
}

export async function registerNinjaLaunchKitRoutes(app: FastifyInstance) {
  app.get('/v1/modules/ninja-launch-kit/templates', { preHandler: readGuards }, async () => ({
    templates: LAUNCHKIT_TEMPLATES,
  }));

  app.get('/v1/modules/ninja-launch-kit/workspace', { preHandler: readGuards }, async (request) => {
    return workspace(context(request).tenantId);
  });

  app.get('/v1/modules/ninja-launch-kit/launches/:id', { preHandler: readGuards }, async (request, reply) => {
    const result = await workspace(context(request).tenantId, String((request.params as any).id));
    if (!result) return notFound(reply, 'launch');
    const root = await workspace(context(request).tenantId);
    const modId = await moduleId();
    const assets = modId
      ? await listAttachments({
          tenantId: context(request).tenantId,
          moduleId: modId,
          objectType: 'launchkit_launch',
          objectId: String((request.params as any).id),
        })
      : [];
    const timeline = modId
      ? await listActivityEvents({
          tenantId: context(request).tenantId,
          moduleId: modId,
          objectType: 'launchkit_launch',
          objectId: String((request.params as any).id),
          limit: 50,
        })
      : { events: [], nextCursor: null };
    return { ...result, launches: root?.launches ?? result.launches, summary: root?.summary ?? result.summary, assets: assets.map(camel), timeline };
  });

  app.post('/v1/modules/ninja-launch-kit/launches', { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = parseLaunchCreate(request.body);
      const { tenantId, userId } = context(request);
      if (!await requireOwner(tenantId, input.ownerUserId ?? userId, reply)) return;
      const result = await db.transaction(async (tx) => {
        const inserted = await tx.execute(sql`
          INSERT INTO launchkit_launches (
            tenant_id,created_by_user_id,owner_user_id,template_slug,title,product_type,summary,
            audience,pain_point,positioning,offer,price_minor,currency,channels,tone,
            primary_color,accent_color,target_date,status
          ) VALUES (
            ${tenantId},${userId},${input.ownerUserId ?? userId},${input.templateSlug},${input.title},
            ${input.productType},${input.summary},${input.audience},${input.painPoint},${input.positioning},
            ${input.offer},${input.priceMinor},${input.currency},${JSON.stringify(input.channels)}::jsonb,
            ${input.tone},${input.primaryColor},${input.accentColor},${input.targetDate},'planning'
          ) RETURNING *
        `);
        const launchId = String(inserted.rows[0].id);
        await insertDefaultPlan(tx, { tenantId, userId, launchId, title: input.title });
        return camel(inserted.rows[0] as Row);
      });
      await activity(request, 'launch.created', 'launchkit_launch', String(result.id), 'Launch workspace created.', {
        templateSlug: input.templateSlug,
      });
      return reply.code(201).send({ launch: result, reviewRequired: true });
    } catch (error) {
      if (validation(reply, error)) return;
      throw error;
    }
  });

  app.patch('/v1/modules/ninja-launch-kit/launches/:id', { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = parseLaunchPatch(request.body);
      const { tenantId } = context(request);
      const id = String((request.params as any).id);
      const current = await launch(tenantId, id);
      if (!current) return notFound(reply, 'launch');
      const ownerUserId = input.ownerUserId === undefined ? current.owner_user_id : input.ownerUserId;
      if (!await requireOwner(tenantId, ownerUserId as string | null, reply)) return;
      const merged = {
        title: input.title ?? current.title,
        productType: input.productType ?? current.product_type,
        summary: input.summary === undefined ? current.summary : input.summary,
        audience: input.audience === undefined ? current.audience : input.audience,
        painPoint: input.painPoint === undefined ? current.pain_point : input.painPoint,
        positioning: input.positioning === undefined ? current.positioning : input.positioning,
        offer: input.offer === undefined ? current.offer : input.offer,
        priceMinor: input.priceMinor === undefined ? current.price_minor : input.priceMinor,
        currency: input.currency ?? current.currency,
        channels: input.channels ?? current.channels,
        tone: input.tone === undefined ? current.tone : input.tone,
        primaryColor: input.primaryColor === undefined ? current.primary_color : input.primaryColor,
        accentColor: input.accentColor === undefined ? current.accent_color : input.accentColor,
        targetDate: input.targetDate === undefined ? current.target_date : input.targetDate,
        status: input.status ?? current.status,
        ownerUserId,
      };
      if (merged.status === 'launched') {
        const evidence = await readiness(tenantId, current);
        if (evidence.score !== 100 || evidence.blocked) {
          return reply.code(409).send({
            error: 'Launch cannot be marked launched until every readiness rule passes',
            code: 'LAUNCHKIT_NOT_READY',
            readiness: evidence,
          });
        }
      }
      const updated = await db.execute(sql`
        UPDATE launchkit_launches SET
          owner_user_id=${merged.ownerUserId},title=${merged.title},product_type=${merged.productType},
          summary=${merged.summary},audience=${merged.audience},pain_point=${merged.painPoint},
          positioning=${merged.positioning},offer=${merged.offer},price_minor=${merged.priceMinor},
          currency=${merged.currency},channels=${JSON.stringify(merged.channels)}::jsonb,tone=${merged.tone},
          primary_color=${merged.primaryColor},accent_color=${merged.accentColor},target_date=${merged.targetDate},
          status=${merged.status},version=version+1,updated_at=NOW()
        WHERE tenant_id=${tenantId} AND id=${id} AND deleted_at IS NULL AND version=${input.expectedVersion}
        RETURNING *
      `);
      if (!updated.rows[0]) return conflict(reply, 'launch');
      await activity(request, 'launch.updated', 'launchkit_launch', id, 'Launch workspace updated.', {
        status: merged.status,
      });
      return reply.send({ launch: camel(updated.rows[0] as Row), readiness: await readiness(tenantId, updated.rows[0] as Row) });
    } catch (error) {
      if (validation(reply, error)) return;
      throw error;
    }
  });

  app.delete('/v1/modules/ninja-launch-kit/launches/:id', { preHandler: writeGuards }, async (request, reply) => {
    const { tenantId } = context(request);
    const id = String((request.params as any).id);
    const expectedVersion = Number((request.query as any)?.expectedVersion);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      return reply.code(400).send({ error: 'expectedVersion is required', code: 'VERSION_REQUIRED' });
    }
    const result = await db.execute(sql`
      UPDATE launchkit_launches SET deleted_at=NOW(),updated_at=NOW(),version=version+1
      WHERE tenant_id=${tenantId} AND id=${id} AND deleted_at IS NULL AND version=${expectedVersion}
      RETURNING id
    `);
    if (!result.rows[0]) return await launch(tenantId, id) ? conflict(reply, 'launch') : notFound(reply, 'launch');
    await activity(request, 'launch.archived', 'launchkit_launch', id, 'Launch workspace archived.');
    return { ok: true };
  });

  app.post('/v1/modules/ninja-launch-kit/launches/:id/phases', { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = parsePlanItem(request.body, 'phase');
      const { tenantId } = context(request);
      const launchId = String((request.params as any).id);
      if (!await launch(tenantId, launchId)) return notFound(reply, 'launch');
      const inserted = await db.execute(sql`
        INSERT INTO launchkit_phases (tenant_id,launch_id,position,title,description,start_date,due_date)
        VALUES (${tenantId},${launchId},${input.position},${input.title},${input.description},${input.startDate},${input.dueDate})
        RETURNING *
      `);
      await activity(request, 'phase.created', 'launchkit_launch', launchId, 'Launch phase created.', { phaseId: inserted.rows[0].id });
      return reply.code(201).send({ phase: camel(inserted.rows[0] as Row) });
    } catch (error) {
      if (validation(reply, error)) return;
      if (String((error as any)?.code) === '23505') return reply.code(409).send({ error: 'Phase position already exists', code: 'LAUNCHKIT_POSITION_CONFLICT' });
      throw error;
    }
  });

  app.post('/v1/modules/ninja-launch-kit/launches/:id/milestones', { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = parsePlanItem(request.body, 'milestone');
      const { tenantId } = context(request);
      const launchId = String((request.params as any).id);
      if (!await launch(tenantId, launchId)) return notFound(reply, 'launch');
      if (!await requireOwner(tenantId, input.ownerUserId, reply)) return;
      if (input.phaseId) {
        const phase = await db.execute(sql`SELECT 1 FROM launchkit_phases WHERE tenant_id=${tenantId} AND launch_id=${launchId} AND id=${input.phaseId} AND deleted_at IS NULL`);
        if (!phase.rows[0]) return notFound(reply, 'phase');
      }
      const inserted = await db.execute(sql`
        INSERT INTO launchkit_milestones
          (tenant_id,launch_id,phase_id,owner_user_id,position,title,description,due_date,required)
        VALUES (${tenantId},${launchId},${input.phaseId},${input.ownerUserId},${input.position},
          ${input.title},${input.description},${input.dueDate},${input.required})
        RETURNING *
      `);
      await activity(request, 'milestone.created', 'launchkit_launch', launchId, 'Launch milestone created.', { milestoneId: inserted.rows[0].id });
      return reply.code(201).send({ milestone: camel(inserted.rows[0] as Row) });
    } catch (error) {
      if (validation(reply, error)) return;
      throw error;
    }
  });

  app.post('/v1/modules/ninja-launch-kit/launches/:id/tasks', { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = parsePlanItem(request.body, 'task');
      const { tenantId } = context(request);
      const launchId = String((request.params as any).id);
      if (!await launch(tenantId, launchId)) return notFound(reply, 'launch');
      if (!await requireOwner(tenantId, input.ownerUserId, reply)) return;
      if (input.milestoneId) {
        const milestone = await db.execute(sql`SELECT 1 FROM launchkit_milestones WHERE tenant_id=${tenantId} AND launch_id=${launchId} AND id=${input.milestoneId} AND deleted_at IS NULL`);
        if (!milestone.rows[0]) return notFound(reply, 'milestone');
      }
      if (!await assertDependency(tenantId, launchId, null, input.dependsOnTaskId, reply)) return;
      const inserted = await db.execute(sql`
        INSERT INTO launchkit_tasks (
          tenant_id,launch_id,milestone_id,depends_on_task_id,owner_user_id,position,
          title,description,due_date,required
        ) VALUES (
          ${tenantId},${launchId},${input.milestoneId},${input.dependsOnTaskId},${input.ownerUserId},
          ${input.position},${input.title},${input.description},${input.dueDate},${input.required}
        ) RETURNING *
      `);
      await activity(request, 'task.created', 'launchkit_launch', launchId, 'Launch task created.', { taskId: inserted.rows[0].id });
      return reply.code(201).send({ task: camel(inserted.rows[0] as Row) });
    } catch (error) {
      if (validation(reply, error)) return;
      throw error;
    }
  });

  for (const kind of ['phase', 'milestone'] as const) {
    app.patch(`/v1/modules/ninja-launch-kit/${kind}s/:id`, { preHandler: writeGuards }, async (request, reply) => {
      try {
        const input = parsePlanPatch(request.body, kind);
        const { tenantId } = context(request);
        const id = String((request.params as any).id);
        const current = kind === 'phase'
          ? await db.execute(sql`SELECT * FROM launchkit_phases
              WHERE tenant_id=${tenantId} AND id=${id} AND deleted_at IS NULL LIMIT 1`)
          : await db.execute(sql`SELECT * FROM launchkit_milestones
              WHERE tenant_id=${tenantId} AND id=${id} AND deleted_at IS NULL LIMIT 1`);
        const row = current.rows[0] as Row | undefined;
        if (!row) return notFound(reply, kind);
        const ownerUserId = kind === 'milestone'
          ? (input.ownerUserId === undefined ? row.owner_user_id : input.ownerUserId)
          : null;
        if (kind === 'milestone' && !await requireOwner(tenantId, ownerUserId, reply)) return;
        const completedAt = input.status === 'complete' ? (row.completed_at ?? new Date()) : null;
        const result = kind === 'phase'
          ? await db.execute(sql`
              UPDATE launchkit_phases SET status=${input.status},
                due_date=${input.dueDate === undefined ? row.due_date : input.dueDate},
                completed_at=${completedAt},version=version+1,updated_at=NOW()
              WHERE tenant_id=${tenantId} AND id=${id} AND deleted_at IS NULL AND version=${input.expectedVersion}
              RETURNING *
            `)
          : await db.execute(sql`
              UPDATE launchkit_milestones SET status=${input.status},owner_user_id=${ownerUserId},
                due_date=${input.dueDate === undefined ? row.due_date : input.dueDate},
                completed_at=${completedAt},version=version+1,updated_at=NOW()
              WHERE tenant_id=${tenantId} AND id=${id} AND deleted_at IS NULL AND version=${input.expectedVersion}
              RETURNING *
            `);
        if (!result.rows[0]) return conflict(reply, kind);
        await activity(request, `${kind}.updated`, 'launchkit_launch', String(row.launch_id), `Launch ${kind} status updated.`, {
          [`${kind}Id`]: id,
          status: input.status,
        });
        return reply.send({ [kind]: camel(result.rows[0] as Row) });
      } catch (error) {
        if (validation(reply, error)) return;
        throw error;
      }
    });
  }

  app.patch('/v1/modules/ninja-launch-kit/tasks/:id', { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = parseTaskPatch(request.body);
      const { tenantId } = context(request);
      const id = String((request.params as any).id);
      const currentResult = await db.execute(sql`
        SELECT * FROM launchkit_tasks WHERE tenant_id=${tenantId} AND id=${id} AND deleted_at IS NULL LIMIT 1
      `);
      const current = currentResult.rows[0] as Row | undefined;
      if (!current) return notFound(reply, 'task');
      const ownerUserId = input.ownerUserId === undefined ? current.owner_user_id : input.ownerUserId;
      if (!await requireOwner(tenantId, ownerUserId, reply)) return;
      const dependencyId = input.dependsOnTaskId === undefined ? current.depends_on_task_id : input.dependsOnTaskId;
      if (!await assertDependency(tenantId, String(current.launch_id), id, dependencyId, reply)) return;
      if (input.status === 'complete' && dependencyId) {
        const dependency = await db.execute(sql`
          SELECT status FROM launchkit_tasks
          WHERE tenant_id=${tenantId} AND launch_id=${String(current.launch_id)}
            AND id=${dependencyId} AND deleted_at IS NULL LIMIT 1
        `);
        if (dependency.rows[0]?.status !== 'complete') {
          return reply.code(409).send({ error: 'Complete the dependent task first', code: 'LAUNCHKIT_TASK_DEPENDENCY_INCOMPLETE' });
        }
      }
      const updated = await db.execute(sql`
        UPDATE launchkit_tasks SET status=${input.status},owner_user_id=${ownerUserId},
          due_date=${input.dueDate === undefined ? current.due_date : input.dueDate},
          depends_on_task_id=${dependencyId},
          completed_at=CASE WHEN ${input.status}='complete' THEN COALESCE(completed_at,NOW()) ELSE NULL END,
          version=version+1,updated_at=NOW()
        WHERE tenant_id=${tenantId} AND id=${id} AND deleted_at IS NULL AND version=${input.expectedVersion}
        RETURNING *
      `);
      if (!updated.rows[0]) return conflict(reply, 'task');
      await activity(request, 'task.updated', 'launchkit_launch', String(current.launch_id), 'Launch task status updated.', {
        taskId: id,
        status: input.status,
      });
      return { task: camel(updated.rows[0] as Row) };
    } catch (error) {
      if (validation(reply, error)) return;
      throw error;
    }
  });

  app.post('/v1/modules/ninja-launch-kit/launches/:id/artifacts', { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = parseArtifactCreate(request.body);
      const { tenantId, userId } = context(request);
      const launchId = String((request.params as any).id);
      if (!await launch(tenantId, launchId)) return notFound(reply, 'launch');
      const inserted = await db.execute(sql`
        INSERT INTO launchkit_artifacts
          (tenant_id,launch_id,created_by_user_id,kind,title,body,status,required)
        VALUES (${tenantId},${launchId},${userId},${input.kind},${input.title},${input.body},'draft',${input.required})
        RETURNING *
      `);
      await activity(request, 'artifact.created', 'launchkit_launch', launchId, 'Draft launch artifact created.', { artifactId: inserted.rows[0].id, kind: input.kind });
      return reply.code(201).send({ artifact: camel(inserted.rows[0] as Row), reviewRequired: true });
    } catch (error) {
      if (validation(reply, error)) return;
      if (String((error as any)?.code) === '23505') return reply.code(409).send({ error: 'An active artifact of this kind already exists', code: 'LAUNCHKIT_ARTIFACT_EXISTS' });
      throw error;
    }
  });

  app.patch('/v1/modules/ninja-launch-kit/artifacts/:id', { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = parseArtifactPatch(request.body);
      const { tenantId } = context(request);
      const id = String((request.params as any).id);
      const currentResult = await db.execute(sql`SELECT * FROM launchkit_artifacts WHERE tenant_id=${tenantId} AND id=${id} AND deleted_at IS NULL LIMIT 1`);
      const current = currentResult.rows[0] as Row | undefined;
      if (!current) return notFound(reply, 'artifact');
      const targetStatus = input.status ?? current.status;
      const transitions: Record<string, string[]> = {
        draft: ['draft', 'review'],
        review: ['draft', 'review', 'approved'],
        approved: ['draft', 'approved', 'archived'],
        archived: ['archived'],
      };
      if (!transitions[String(current.status)]?.includes(targetStatus)) {
        return reply.code(409).send({ error: `Cannot move artifact from ${current.status} to ${targetStatus}`, code: 'LAUNCHKIT_ARTIFACT_TRANSITION_INVALID' });
      }
      const updated = await db.execute(sql`
        UPDATE launchkit_artifacts SET title=${input.title ?? current.title},body=${input.body ?? current.body},
          status=${targetStatus},version=version+1,updated_at=NOW()
        WHERE tenant_id=${tenantId} AND id=${id} AND deleted_at IS NULL AND version=${input.expectedVersion}
        RETURNING *
      `);
      if (!updated.rows[0]) return conflict(reply, 'artifact');
      await activity(request, 'artifact.updated', 'launchkit_launch', String(current.launch_id), 'Launch artifact updated.', {
        artifactId: id,
        status: targetStatus,
      });
      return { artifact: camel(updated.rows[0] as Row), readiness: await readiness(tenantId, await launch(tenantId, String(current.launch_id)) as Row) };
    } catch (error) {
      if (validation(reply, error)) return;
      throw error;
    }
  });

  app.post('/v1/modules/ninja-launch-kit/launches/:id/generations', { preHandler: writeGuards }, async (request, reply) => {
    let operation: Awaited<ReturnType<typeof beginIdempotentOperation>> | null = null;
    try {
      const input = parseGeneration(request.body);
      const { tenantId, userId } = context(request);
      const launchId = String((request.params as any).id);
      const current = await launch(tenantId, launchId);
      if (!current) return notFound(reply, 'launch');
      const modId = await moduleId();
      if (!modId) return notFound(reply, 'module');
      const safeRequest = {
        launchId,
        version: current.version,
        title: current.title,
        productType: current.product_type,
        audience: current.audience,
        painPoint: current.pain_point,
        positioning: current.positioning,
        offer: current.offer,
        priceMinor: current.price_minor,
        currency: current.currency,
        channels: current.channels,
        tone: current.tone,
      };
      operation = await beginIdempotentOperation({
        tenantId,
        moduleId: modId,
        scope: 'launchkit.generation',
        idempotencyKey: input.idempotencyKey,
        request: safeRequest,
        leaseMs: 120_000,
      });
      if (operation.state === 'replay') return reply.code(operation.responseStatus).send({ ...(operation.responseJson as Row), replayed: true });
      if (operation.state === 'conflict') return reply.code(409).send({ error: 'Idempotency key was reused for different launch content', code: 'IDEMPOTENCY_CONFLICT' });
      if (operation.state === 'in_progress') return reply.code(409).send({ error: 'Generation is already processing', code: 'IDEMPOTENCY_IN_PROGRESS' });
      const acquired = operation;
      const completion = await getAiProvider().complete({
        systemPrompt: [
          'OPERATOROS_NINJA_LAUNCH_KIT_V1',
          'Create a practical launch campaign from only the supplied tenant-authorized brief.',
          `Return strict JSON with exactly these artifact kinds: ${LAUNCHKIT_ARTIFACT_KINDS.join(', ')}.`,
          'Each artifact must have kind, title, and non-empty body. Generated work is draft and requires human review.',
          'Do not claim reach, conversions, publication, approvals, customer proof, or provider actions.',
        ].join('\n'),
        userPrompt: JSON.stringify(safeRequest),
        responseFormat: 'json',
        temperature: 0.3,
        maxTokens: 6_000,
      });
      const artifacts = parseGeneratedArtifacts(completion.text);
      const response = await db.transaction(async (tx) => {
        const generated = await tx.execute(sql`
          INSERT INTO launchkit_generations (
            tenant_id,launch_id,user_id,idempotency_key,input_sha256,provider,model,
            provider_version,token_count,duration_ms
          ) VALUES (
            ${tenantId},${launchId},${userId},${input.idempotencyKey},${sha256(JSON.stringify(safeRequest))},
            ${completion.provider},${completion.model},${completion.version},${completion.tokenCount},${completion.durationMs}
          ) RETURNING *
        `);
        for (const artifact of artifacts) {
          await tx.execute(sql`
            UPDATE launchkit_artifacts SET generation_id=${String(generated.rows[0].id)},
              title=${artifact.title},body=${artifact.body},status='draft',version=version+1,updated_at=NOW()
            WHERE tenant_id=${tenantId} AND launch_id=${launchId} AND kind=${artifact.kind} AND deleted_at IS NULL
          `);
        }
        await recordUsageEvent({
          tenantId,
          moduleId: modId,
          userId,
          operation: 'launchkit.ai_generation',
          units: 1,
          unitKind: 'generation',
          idempotencyKey: `launchkit:${String(generated.rows[0].id)}`,
          externalReference: String(generated.rows[0].id),
          metadata: { artifactCount: artifacts.length, tokenCount: completion.tokenCount },
        }, tx);
        const payload = {
          generation: camel(generated.rows[0] as Row),
          artifacts,
          reviewRequired: true,
          replayed: false,
        };
        await completeIdempotentOperation({
          tenantId,
          id: acquired.id,
          leaseExpiresAt: acquired.leaseExpiresAt,
          responseStatus: 201,
          responseJson: payload,
        }, tx);
        return payload;
      });
      await activity(request, 'generation.completed', 'launchkit_launch', launchId, 'Draft launch artifacts generated for review.', {
        generationId: response.generation.id,
        artifactCount: artifacts.length,
      });
      return reply.code(201).send(response);
    } catch (error) {
      if (operation?.state === 'acquired') {
        await failIdempotentOperation({
          tenantId: context(request).tenantId,
          id: operation.id,
          leaseExpiresAt: operation.leaseExpiresAt,
        }).catch(() => undefined);
      }
      if (validation(reply, error)) return;
      if (error instanceof AiProviderDisabledError) {
        return reply.code(503).send({ error: 'AI generation is disabled until the shared provider is configured', code: error.code });
      }
      throw error;
    }
  });

  app.post('/v1/modules/ninja-launch-kit/launches/:id/assets', {
    preHandler: writeGuards,
    bodyLimit: getMaxAttachmentBytes() * 2,
  }, async (request, reply) => {
    try {
      const { tenantId, userId } = context(request);
      const launchId = String((request.params as any).id);
      if (!await launch(tenantId, launchId)) return notFound(reply, 'launch');
      const body = (request.body ?? {}) as Row;
      if (typeof body.contentBase64 !== 'string' || typeof body.originalName !== 'string') {
        return reply.code(400).send({ error: 'originalName and contentBase64 are required', code: 'LAUNCHKIT_ASSET_INVALID' });
      }
      const modId = await moduleId();
      if (!modId) return notFound(reply, 'module');
      const attachment = await createAttachment({
        tenantId,
        moduleId: modId,
        objectType: 'launchkit_launch',
        objectId: launchId,
        originalName: body.originalName,
        declaredMimeType: typeof body.mimeType === 'string' ? body.mimeType : null,
        content: Buffer.from(body.contentBase64, 'base64'),
        createdByUserId: userId,
      });
      await activity(request, 'asset.added', 'launchkit_launch', launchId, 'Private launch asset added.', {
        attachmentId: attachment.id,
        sizeBytes: attachment.size_bytes,
      });
      return reply.code(201).send({ asset: camel(attachment as Row) });
    } catch (error) {
      const code = String((error as any)?.code ?? '');
      if (code.includes('SIZE')) return reply.code(413).send({ error: (error as Error).message, code });
      if (code.includes('MIME') || code.includes('SIGNATURE')) return reply.code(422).send({ error: (error as Error).message, code });
      throw error;
    }
  });

  app.get('/v1/modules/ninja-launch-kit/launches/:id/assets/:attachmentId/content', { preHandler: readGuards }, async (request, reply) => {
    const { tenantId } = context(request);
    const { id, attachmentId } = request.params as any;
    if (!await launch(tenantId, String(id))) return notFound(reply, 'launch');
    const modId = await moduleId();
    if (!modId) return notFound(reply, 'module');
    try {
      const result = await getAttachmentContent({
        tenantId,
        moduleId: modId,
        attachmentId: String(attachmentId),
        objectType: 'launchkit_launch',
        objectId: String(id),
      });
      if (!result) return notFound(reply, 'asset');
      reply.header('content-type', String(result.metadata.detected_mime_type));
      reply.header('content-disposition', `attachment; filename="${String(result.metadata.original_name).replaceAll('"', '')}"`);
      return reply.send(result.content);
    } catch (error) {
      const code = String((error as any)?.code ?? '');
      if (code.includes('PENDING')) return reply.code(423).send({ error: (error as Error).message, code });
      if (code.includes('QUARANTINED') || code.includes('INTEGRITY')) return reply.code(422).send({ error: (error as Error).message, code });
      throw error;
    }
  });

  app.post('/v1/modules/ninja-launch-kit/launches/:id/exports', { preHandler: writeGuards }, async (request, reply) => {
    const { tenantId, userId } = context(request);
    const launchId = String((request.params as any).id);
    const format = String((request.body as any)?.format ?? 'markdown');
    if (!['json', 'markdown', 'csv'].includes(format)) {
      return reply.code(400).send({ error: 'format must be json, markdown, or csv', code: 'LAUNCHKIT_EXPORT_FORMAT_INVALID' });
    }
    const data = await workspace(tenantId, launchId);
    if (!data) return notFound(reply, 'launch');
    const rendered = launchExport(data, format);
    const inserted = await db.execute(sql`
      INSERT INTO launchkit_exports (tenant_id,launch_id,created_by_user_id,format,content_sha256,size_bytes)
      VALUES (${tenantId},${launchId},${userId},${format},${sha256(rendered.content)},${Buffer.byteLength(rendered.content)})
      RETURNING *
    `);
    await activity(request, 'export.created', 'launchkit_launch', launchId, 'Launch export created.', {
      exportId: inserted.rows[0].id,
      format,
      contentSha256: inserted.rows[0].content_sha256,
    });
    return reply.code(201).send({ export: camel(inserted.rows[0] as Row), ...rendered });
  });

  app.post('/v1/modules/ninja-launch-kit/import/plan', { preHandler: writeGuards }, async (request, reply) => {
    try {
      return reply.send(planNinjaLaunchKitImport(request.body));
    } catch (error) {
      if (validation(reply, error)) return;
      throw error;
    }
  });
}
