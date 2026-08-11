import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  requireSuperAdmin,
  requireTenantAdmin,
  requireTenantModuleAccess,
  requireTenantModuleWriteAccess,
} from '../lib/tenant-auth.js';
import { appendActivityEvent, summarizeUsage } from '../lib/shared-usage-activity.js';
import { enqueueSharedJob, registerSharedJobHandler } from '../lib/shared-background-jobs.js';
import {
  listProviderConfigurations,
  saveProviderConfiguration,
} from '../lib/shared-platform-control-plane.js';
import {
  listUserNotifications,
  markUserNotificationRead,
} from '../lib/shared-notification-outbox.js';
import { isOperatorOSTestEnvironment } from '../lib/shared-service-safety.js';
import { runDeterministicConnectorForTests } from '../lib/shared-provider-adapters.js';
import { writeAudit } from '../lib/audit.js';
import {
  BRANDFORGE_COPY_MODES,
  BRANDFORGE_INTEGRATION_CATALOG,
  BRANDFORGE_REPORT_TYPES,
  BRANDFORGE_TONES,
  BRANDFORGE_WORKFLOWS,
  commentInput,
  exportInput,
  integrationConnectInput,
  landingPageInput,
  leadInput,
  offerInput,
  parsePhase31,
  reportInput,
  stableJsonHash,
  taskInput,
  templateInput,
  workflowInput,
} from '../lib/brandforgeos-phase31.js';

const MODULE_SLUG = 'brandforgeos';
const base = '/v1/modules/brandforgeos';
const readGuards = [requireTenantModuleAccess(MODULE_SLUG)];
const writeGuards = [...readGuards, requireTenantModuleWriteAccess];
const adminGuards = [...writeGuards, requireTenantAdmin];
const EXPORT_HANDLER = 'brandforge.phase31.export.v1';
const SYNC_HANDLER = 'brandforge.phase31.sync.v1';

type Row = Record<string, any>;
function tenant(request: FastifyRequest) {
  return String((request as any).tenantContext.tenantId);
}
function actor(request: FastifyRequest) {
  return String((request as any).user.id);
}
function body(request: FastifyRequest) {
  return (request.body ?? {}) as Record<string, unknown>;
}
function param(request: FastifyRequest, key: string) {
  return String((request.params as Record<string, string>)[key]);
}

function failure(reply: FastifyReply, error: unknown) {
  const value = error as any;
  if (value?.statusCode === 400 || value?.code === 'BRANDFORGE_INPUT_INVALID') {
    return reply.code(400).send({
      error: value.message,
      code: value.code || 'BRANDFORGE_INPUT_INVALID',
      field: value.field,
    });
  }
  throw error;
}

async function moduleId(executor: Pick<typeof db, 'execute'> = db) {
  const result = await executor.execute(
    sql`SELECT id FROM modules WHERE slug=${MODULE_SLUG} LIMIT 1`,
  );
  if (!result.rows[0])
    throw Object.assign(new Error('BrandForgeOS module registry is unavailable'), {
      code: 'BRANDFORGE_MODULE_UNAVAILABLE',
    });
  return String((result.rows[0] as Row).id);
}

async function activity(
  request: FastifyRequest,
  objectType: string,
  objectId: string,
  eventType: string,
  summary: string,
  metadata: Record<string, unknown> = {},
) {
  return appendActivityEvent({
    tenantId: tenant(request),
    moduleId: await moduleId(),
    actorUserId: actor(request),
    objectType,
    objectId,
    eventType,
    summary,
    metadata,
  });
}

async function exists(
  table:
    | 'brandforge_brands'
    | 'brandforge_campaigns'
    | 'brandforge_generations'
    | 'brandforge_reports'
    | 'brandforge_landing_pages'
    | 'tenant_users',
  tenantId: string,
  id: string,
) {
  const result =
    table === 'brandforge_brands'
      ? await db.execute(
          sql`SELECT id FROM brandforge_brands WHERE tenant_id=${tenantId} AND id=${id} AND deleted_at IS NULL LIMIT 1`,
        )
      : table === 'brandforge_campaigns'
        ? await db.execute(
            sql`SELECT id FROM brandforge_campaigns WHERE tenant_id=${tenantId} AND id=${id} AND deleted_at IS NULL LIMIT 1`,
          )
        : table === 'brandforge_generations'
          ? await db.execute(
              sql`SELECT id FROM brandforge_generations WHERE tenant_id=${tenantId} AND id=${id} LIMIT 1`,
            )
          : table === 'brandforge_reports'
            ? await db.execute(
                sql`SELECT id FROM brandforge_reports WHERE tenant_id=${tenantId} AND id=${id} LIMIT 1`,
              )
            : table === 'brandforge_landing_pages'
              ? await db.execute(
                  sql`SELECT id FROM brandforge_landing_pages WHERE tenant_id=${tenantId} AND id=${id} LIMIT 1`,
                )
              : await db.execute(
                  sql`SELECT user_id FROM tenant_users WHERE tenant_id=${tenantId} AND user_id=${id} LIMIT 1`,
                );
  return Boolean(result.rows[0]);
}

function integrationCatalog(provider: string) {
  return BRANDFORGE_INTEGRATION_CATALOG.find((item) => item.provider === provider);
}

async function entitlementProjection(tenantId: string) {
  const result = await db.execute(sql`
    SELECT tm.status,tm.source,COALESCE(tm.metadata,'{}'::jsonb) AS module_metadata,
      te.entitlement_key,te.entitlement_type,te.source AS entitlement_source,COALESCE(te.metadata,'{}'::jsonb) AS entitlement_metadata
    FROM modules m
    LEFT JOIN tenant_modules tm ON tm.module_id=m.id AND tm.tenant_id=${tenantId}
    LEFT JOIN tenant_entitlements te ON te.tenant_id=${tenantId} AND te.active=TRUE
      AND (te.entitlement_key=${MODULE_SLUG} OR te.entitlement_key LIKE 'brandforgeos.%')
    WHERE m.slug=${MODULE_SLUG}
  `);
  const rows = result.rows as Row[];
  const metadata = (rows[0]?.module_metadata ?? {}) as Row;
  const features = (metadata.features ?? {}) as Row;
  const monthlyCredits = Number.isSafeInteger(Number(features.brandforgeMonthlyCredits))
    ? Math.max(0, Number(features.brandforgeMonthlyCredits))
    : null;
  const period = new Date().toISOString().slice(0, 8) + '01';
  const counter = await db.execute(
    sql`SELECT used_credits,limit_snapshot FROM brandforge_credit_counters WHERE tenant_id=${tenantId} AND period_start=${period}::date`,
  );
  return {
    module: rows[0] ? { status: rows[0].status, source: rows[0].source } : null,
    entitlements: rows
      .filter((row) => row.entitlement_key)
      .map((row) => ({
        key: row.entitlement_key,
        type: row.entitlement_type,
        source: row.entitlement_source,
        metadata: row.entitlement_metadata,
      })),
    features,
    credits: {
      period,
      limit: monthlyCredits,
      used: Number((counter.rows[0] as Row | undefined)?.used_credits ?? 0),
      unmetered: monthlyCredits === null,
    },
    authority: 'operatoros',
  };
}

async function reportSnapshot(tenantId: string, report: Row) {
  const campaignFilter = report.campaign_id ? sql`AND campaign_id=${report.campaign_id}` : sql``;
  const dateFrom = report.date_from ? sql`AND metric_date>=${report.date_from}` : sql``;
  const dateTo = report.date_to ? sql`AND metric_date<=${report.date_to}` : sql``;
  const [metrics, counts, channels, tasks, activityRows] = await Promise.all([
    db.execute(
      sql`SELECT COALESCE(sum(impressions),0)::bigint AS impressions,COALESCE(sum(clicks),0)::bigint AS clicks,COALESCE(sum(conversions),0)::bigint AS conversions,COALESCE(sum(spend_cents),0)::bigint AS spend_cents,COALESCE(sum(revenue_cents),0)::bigint AS revenue_cents FROM brandforge_campaign_metrics WHERE tenant_id=${tenantId} ${campaignFilter} ${dateFrom} ${dateTo}`,
    ),
    db.execute(
      sql`SELECT (SELECT count(*)::int FROM brandforge_campaigns WHERE tenant_id=${tenantId} AND deleted_at IS NULL) campaigns,(SELECT count(*)::int FROM brandforge_copy_assets WHERE tenant_id=${tenantId} AND deleted_at IS NULL) copy_assets,(SELECT count(*)::int FROM brandforge_calendar_items WHERE tenant_id=${tenantId} AND deleted_at IS NULL) calendar_items,(SELECT count(*)::int FROM brandforge_lead_submissions WHERE tenant_id=${tenantId}) leads`,
    ),
    db.execute(
      sql`SELECT channel,COALESCE(sum(impressions),0)::bigint impressions,COALESCE(sum(clicks),0)::bigint clicks,COALESCE(sum(conversions),0)::bigint conversions FROM brandforge_campaign_metrics WHERE tenant_id=${tenantId} ${campaignFilter} ${dateFrom} ${dateTo} GROUP BY channel ORDER BY impressions DESC NULLS LAST`,
    ),
    db.execute(
      sql`SELECT status,count(*)::int count FROM brandforge_campaign_tasks WHERE tenant_id=${tenantId} ${report.campaign_id ? sql`AND campaign_id=${report.campaign_id}` : sql``} GROUP BY status ORDER BY status`,
    ),
    db.execute(
      sql`SELECT event_type,summary,created_at FROM shared_activity_events WHERE tenant_id=${tenantId} AND module_id=${await moduleId()} ORDER BY created_at DESC LIMIT 50`,
    ),
  ]);
  return {
    schema: 'operatoros.brandforge.report.v1',
    reportType: report.report_type,
    period: { from: report.date_from ?? null, to: report.date_to ?? null },
    metrics: metrics.rows[0] ?? {},
    counts: counts.rows[0] ?? {},
    channels: channels.rows,
    taskStatus: tasks.rows,
    recentActivity: activityRows.rows,
    evidence: 'persisted_records_only',
    sampleData: false,
  };
}

registerSharedJobHandler(EXPORT_HANDLER, async (context) => {
  const exportId = String(context.payload.exportId || '');
  const selected = await db.execute(
    sql`SELECT * FROM brandforge_export_jobs WHERE tenant_id=${context.tenantId} AND id=${exportId} LIMIT 1`,
  );
  const job = selected.rows[0] as Row | undefined;
  if (!job)
    throw Object.assign(new Error('Export job not found'), { code: 'BRANDFORGE_EXPORT_NOT_FOUND' });
  await db.execute(
    sql`UPDATE brandforge_export_jobs SET status='processing' WHERE tenant_id=${context.tenantId} AND id=${exportId}`,
  );
  let payload: Row;
  if (job.report_id) {
    const reportResult = await db.execute(
      sql`SELECT * FROM brandforge_reports WHERE tenant_id=${context.tenantId} AND id=${job.report_id} AND status='generated' LIMIT 1`,
    );
    if (!reportResult.rows[0])
      throw Object.assign(new Error('Generated report is required'), {
        code: 'BRANDFORGE_REPORT_NOT_GENERATED',
      });
    payload = { report: reportResult.rows[0] };
  } else {
    const [brands, campaigns, assets, calendar] = await Promise.all([
      db.execute(
        sql`SELECT id,name,description,primary_color,secondary_color,accent_color,heading_font,body_font,voice_tone,guidelines,version,updated_at FROM brandforge_brands WHERE tenant_id=${context.tenantId} AND deleted_at IS NULL ORDER BY created_at`,
      ),
      db.execute(
        sql`SELECT id,name,status,objective,channels,start_at,end_at,budget_cents,version,updated_at FROM brandforge_campaigns WHERE tenant_id=${context.tenantId} AND deleted_at IS NULL ORDER BY created_at`,
      ),
      db.execute(
        sql`SELECT id,title,copy_type,channel,tone,status,favorite,scores,version,updated_at FROM brandforge_copy_assets WHERE tenant_id=${context.tenantId} AND deleted_at IS NULL ORDER BY created_at`,
      ),
      db.execute(
        sql`SELECT id,title,item_type,channel,scheduled_at,status,version,updated_at FROM brandforge_calendar_items WHERE tenant_id=${context.tenantId} AND deleted_at IS NULL ORDER BY scheduled_at`,
      ),
    ]);
    payload = {
      schema: 'operatoros.brandforge.export.v1',
      exportedAt: new Date().toISOString(),
      brands: brands.rows,
      campaigns: campaigns.rows,
      copyAssets: assets.rows,
      calendarItems: calendar.rows,
    };
  }
  const json = JSON.stringify(payload);
  const output =
    job.format === 'csv'
      ? {
          contentType: 'text/csv',
          fileName: `brandforge-${exportId}.csv`,
          content: `entity,count\r\nbrands,${Array.isArray(payload.brands) ? payload.brands.length : 0}\r\ncampaigns,${Array.isArray(payload.campaigns) ? payload.campaigns.length : 0}\r\ncopy_assets,${Array.isArray(payload.copyAssets) ? payload.copyAssets.length : 0}\r\n`,
        }
      : job.format === 'html'
        ? {
            contentType: 'text/html',
            fileName: `brandforge-${exportId}.html`,
            content: `<!doctype html><meta charset="utf-8"><title>BrandForgeOS report</title><pre>${json.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre>`,
          }
        : {
            contentType: 'application/json',
            fileName: `brandforge-${exportId}.json`,
            content: json,
          };
  await db.execute(
    sql`UPDATE brandforge_export_jobs SET status='completed',output=${output},content_sha256=${stableJsonHash(output.content)},completed_at=NOW(),expires_at=NOW()+INTERVAL '7 days' WHERE tenant_id=${context.tenantId} AND id=${exportId}`,
  );
});

registerSharedJobHandler(SYNC_HANDLER, async (context) => {
  const syncId = String(context.payload.syncId || '');
  const selected = await db.execute(
    sql`SELECT run.*,link.provider_key,link.status integration_status FROM brandforge_sync_runs run JOIN brandforge_integrations link ON link.tenant_id=run.tenant_id AND link.id=run.integration_id WHERE run.tenant_id=${context.tenantId} AND run.id=${syncId} LIMIT 1`,
  );
  const run = selected.rows[0] as Row | undefined;
  if (!run)
    throw Object.assign(new Error('Sync run not found'), { code: 'BRANDFORGE_SYNC_NOT_FOUND' });
  await db.execute(
    sql`UPDATE brandforge_sync_runs SET status='processing',started_at=NOW() WHERE tenant_id=${context.tenantId} AND id=${syncId}`,
  );
  if (!isOperatorOSTestEnvironment()) {
    await db.execute(
      sql`UPDATE brandforge_sync_runs SET status='dead_letter',error_code='PROVIDER_ADAPTER_UNAVAILABLE',completed_at=NOW() WHERE tenant_id=${context.tenantId} AND id=${syncId}`,
    );
    throw Object.assign(new Error('Provider-specific sync adapter is unavailable'), {
      code: 'PROVIDER_ADAPTER_UNAVAILABLE',
    });
  }
  const receipt = runDeterministicConnectorForTests({
    kind: integrationCatalog(String(run.provider_key))?.kind === 'webhook' ? 'webhook' : 'oauth',
    payload: { provider: run.provider_key, syncId },
    idempotencyKey: syncId,
  });
  await db.execute(
    sql`UPDATE brandforge_sync_runs SET status='completed',processed_items=1,total_items=1,result=${receipt},completed_at=NOW() WHERE tenant_id=${context.tenantId} AND id=${syncId}`,
  );
  await db.execute(
    sql`UPDATE brandforge_integrations SET last_sync_at=NOW(),health=${{ state: 'test', externalDelivery: false }},updated_at=NOW() WHERE tenant_id=${context.tenantId} AND id=${run.integration_id}`,
  );
});

export async function registerBrandForgeOsPhase31Routes(app: FastifyInstance) {
  app.get(`${base}/product-contract`, { preHandler: readGuards }, async (request) => ({
    copyModes: BRANDFORGE_COPY_MODES,
    tones: BRANDFORGE_TONES,
    workflows: BRANDFORGE_WORKFLOWS,
    reportTypes: BRANDFORGE_REPORT_TYPES,
    integrations: BRANDFORGE_INTEGRATION_CATALOG,
    authority: {
      identity: 'operatoros',
      tenant: 'operatoros',
      billing: 'operatoros',
      entitlements: 'operatoros',
      providers: 'operatoros',
      audit: 'operatoros',
    },
    tenantId: tenant(request),
  }));

  app.get(`${base}/product-overview`, { preHandler: readGuards }, async (request) => {
    const tenantId = tenant(request);
    const [counts, usage, entitlement] = await Promise.all([
      db.execute(
        sql`SELECT (SELECT count(*)::int FROM brandforge_offers WHERE tenant_id=${tenantId} AND deleted_at IS NULL) offers,(SELECT count(*)::int FROM brandforge_campaign_tasks WHERE tenant_id=${tenantId}) tasks,(SELECT count(*)::int FROM brandforge_ai_workflows WHERE tenant_id=${tenantId}) workflows,(SELECT count(*)::int FROM brandforge_templates WHERE (tenant_id=${tenantId} OR is_global=TRUE) AND deleted_at IS NULL) templates,(SELECT count(*)::int FROM brandforge_integrations WHERE tenant_id=${tenantId} AND status NOT IN ('disconnected','revoked')) integrations,(SELECT count(*)::int FROM brandforge_reports WHERE tenant_id=${tenantId}) reports,(SELECT count(*)::int FROM brandforge_lead_submissions WHERE tenant_id=${tenantId}) leads`,
      ),
      summarizeUsage({
        tenantId,
        moduleId: await moduleId(),
        since: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      }),
      entitlementProjection(tenantId),
    ]);
    return { counts: counts.rows[0] ?? {}, usage, entitlement, evidence: 'persisted_records_only' };
  });

  app.get(`${base}/offers`, { preHandler: readGuards }, async (request) => ({
    offers: (
      await db.execute(
        sql`SELECT * FROM brandforge_offers WHERE tenant_id=${tenant(request)} AND deleted_at IS NULL ORDER BY updated_at DESC`,
      )
    ).rows,
  }));
  app.post(`${base}/offers`, { preHandler: writeGuards }, async (request, reply) => {
    let input;
    try {
      input = parsePhase31(offerInput, body(request));
    } catch (error) {
      return failure(reply, error);
    }
    if (input.brandId && !(await exists('brandforge_brands', tenant(request), input.brandId)))
      return reply.code(404).send({ error: 'Brand not found', code: 'BRANDFORGE_BRAND_NOT_FOUND' });
    const result = await db.execute(
      sql`INSERT INTO brandforge_offers (tenant_id,brand_id,created_by_user_id,name,description,price_label,offer_type,target_audience,call_to_action,urgency,status) VALUES (${tenant(request)},${input.brandId ?? null},${actor(request)},${input.name},${input.description ?? null},${input.priceLabel ?? null},${input.offerType},${input.targetAudience ?? null},${input.callToAction ?? null},${input.urgency ?? null},${input.status}) RETURNING *`,
    );
    const row = result.rows[0] as Row;
    await activity(request, 'brandforge_offer', row.id, 'created', `Created offer ${input.name}`);
    return reply.code(201).send(row);
  });
  app.patch(`${base}/offers/:id`, { preHandler: writeGuards }, async (request, reply) => {
    const patch = body(request);
    const expectedVersion = Number(patch.expectedVersion);
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1)
      return reply
        .code(400)
        .send({ error: 'expectedVersion is required', code: 'BRANDFORGE_INPUT_INVALID' });
    const result = await db.execute(
      sql`UPDATE brandforge_offers SET name=COALESCE(${typeof patch.name === 'string' ? patch.name.trim().slice(0, 160) : null},name),description=CASE WHEN ${patch.description !== undefined} THEN ${patch.description ?? null} ELSE description END,status=COALESCE(${typeof patch.status === 'string' && ['draft', 'active', 'retired'].includes(patch.status) ? patch.status : null},status),version=version+1,updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${param(request, 'id')} AND version=${expectedVersion} AND deleted_at IS NULL RETURNING *`,
    );
    if (!result.rows[0])
      return reply
        .code(409)
        .send({ error: 'Offer changed or was not found', code: 'BRANDFORGE_VERSION_CONFLICT' });
    return result.rows[0];
  });
  app.delete(`${base}/offers/:id`, { preHandler: writeGuards }, async (request, reply) => {
    const result = await db.execute(
      sql`UPDATE brandforge_offers SET deleted_at=NOW(),updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${param(request, 'id')} AND deleted_at IS NULL RETURNING id`,
    );
    if (!result.rows[0])
      return reply.code(404).send({ error: 'Offer not found', code: 'BRANDFORGE_OFFER_NOT_FOUND' });
    return reply.code(204).send();
  });

  app.get(
    `${base}/campaigns/:campaignId/production`,
    { preHandler: readGuards },
    async (request, reply) => {
      const campaignId = param(request, 'campaignId');
      if (!(await exists('brandforge_campaigns', tenant(request), campaignId)))
        return reply
          .code(404)
          .send({ error: 'Campaign not found', code: 'BRANDFORGE_CAMPAIGN_NOT_FOUND' });
      const [tasks, comments, pages] = await Promise.all([
        db.execute(
          sql`SELECT * FROM brandforge_campaign_tasks WHERE tenant_id=${tenant(request)} AND campaign_id=${campaignId} ORDER BY sort_order,created_at`,
        ),
        db.execute(
          sql`SELECT * FROM brandforge_campaign_comments WHERE tenant_id=${tenant(request)} AND campaign_id=${campaignId} AND deleted_at IS NULL ORDER BY created_at`,
        ),
        db.execute(
          sql`SELECT * FROM brandforge_landing_pages WHERE tenant_id=${tenant(request)} AND campaign_id=${campaignId} ORDER BY updated_at DESC`,
        ),
      ]);
      return { tasks: tasks.rows, comments: comments.rows, landingPages: pages.rows };
    },
  );
  app.post(
    `${base}/campaigns/:campaignId/tasks`,
    { preHandler: writeGuards },
    async (request, reply) => {
      let input;
      try {
        input = parsePhase31(taskInput, body(request));
      } catch (error) {
        return failure(reply, error);
      }
      const campaignId = param(request, 'campaignId');
      if (!(await exists('brandforge_campaigns', tenant(request), campaignId)))
        return reply
          .code(404)
          .send({ error: 'Campaign not found', code: 'BRANDFORGE_CAMPAIGN_NOT_FOUND' });
      if (
        input.assigneeUserId &&
        !(await exists('tenant_users', tenant(request), input.assigneeUserId))
      )
        return reply
          .code(404)
          .send({ error: 'Assignee not found', code: 'BRANDFORGE_ASSIGNEE_NOT_FOUND' });
      const result = await db.execute(
        sql`INSERT INTO brandforge_campaign_tasks (tenant_id,campaign_id,created_by_user_id,assignee_user_id,title,description,status,priority,due_at,completed_at,sort_order) VALUES (${tenant(request)},${campaignId},${actor(request)},${input.assigneeUserId ?? null},${input.title},${input.description ?? null},${input.status},${input.priority},${input.dueAt ? new Date(input.dueAt) : null},${input.status === 'done' ? new Date() : null},${input.sortOrder}) RETURNING *`,
      );
      return reply.code(201).send(result.rows[0]);
    },
  );
  app.patch(`${base}/campaign-tasks/:id`, { preHandler: writeGuards }, async (request, reply) => {
    const patch = body(request),
      expected = Number(patch.expectedVersion);
    if (!Number.isSafeInteger(expected))
      return reply
        .code(400)
        .send({ error: 'expectedVersion is required', code: 'BRANDFORGE_INPUT_INVALID' });
    const status =
      typeof patch.status === 'string' &&
      ['todo', 'in_progress', 'blocked', 'done'].includes(patch.status)
        ? patch.status
        : null;
    const result = await db.execute(
      sql`UPDATE brandforge_campaign_tasks SET title=COALESCE(${typeof patch.title === 'string' ? patch.title.trim().slice(0, 240) : null},title),status=COALESCE(${status},status),completed_at=CASE WHEN ${status === 'done'} THEN COALESCE(completed_at,NOW()) WHEN ${status !== null} THEN NULL ELSE completed_at END,version=version+1,updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${param(request, 'id')} AND version=${expected} RETURNING *`,
    );
    if (!result.rows[0])
      return reply
        .code(409)
        .send({ error: 'Task changed or was not found', code: 'BRANDFORGE_VERSION_CONFLICT' });
    return result.rows[0];
  });
  app.post(
    `${base}/campaigns/:campaignId/comments`,
    { preHandler: writeGuards },
    async (request, reply) => {
      let input;
      try {
        input = parsePhase31(commentInput, body(request));
      } catch (error) {
        return failure(reply, error);
      }
      const campaignId = param(request, 'campaignId');
      if (!(await exists('brandforge_campaigns', tenant(request), campaignId)))
        return reply
          .code(404)
          .send({ error: 'Campaign not found', code: 'BRANDFORGE_CAMPAIGN_NOT_FOUND' });
      const result = await db.execute(
        sql`INSERT INTO brandforge_campaign_comments (tenant_id,campaign_id,author_user_id,parent_id,body) VALUES (${tenant(request)},${campaignId},${actor(request)},${input.parentId ?? null},${input.body}) RETURNING *`,
      );
      return reply.code(201).send(result.rows[0]);
    },
  );
  app.post(
    `${base}/campaigns/:campaignId/landing-pages`,
    { preHandler: writeGuards },
    async (request, reply) => {
      let input;
      try {
        input = parsePhase31(landingPageInput, body(request));
      } catch (error) {
        return failure(reply, error);
      }
      const campaignId = param(request, 'campaignId');
      if (!(await exists('brandforge_campaigns', tenant(request), campaignId)))
        return reply
          .code(404)
          .send({ error: 'Campaign not found', code: 'BRANDFORGE_CAMPAIGN_NOT_FOUND' });
      const result = await db.execute(
        sql`INSERT INTO brandforge_landing_pages (tenant_id,campaign_id,created_by_user_id,title,slug,status,content,seo,published_at) VALUES (${tenant(request)},${campaignId},${actor(request)},${input.title},${input.slug},${input.status},${input.content},${input.seo},${input.status === 'published' ? new Date() : null}) RETURNING *`,
      );
      return reply.code(201).send(result.rows[0]);
    },
  );

  app.get(`${base}/workflows`, { preHandler: readGuards }, async (request) => ({
    workflows: (
      await db.execute(
        sql`SELECT * FROM brandforge_ai_workflows WHERE tenant_id=${tenant(request)} ORDER BY created_at DESC LIMIT 100`,
      )
    ).rows,
  }));
  app.post(`${base}/workflows`, { preHandler: writeGuards }, async (request, reply) => {
    let input;
    try {
      input = parsePhase31(workflowInput, body(request));
    } catch (error) {
      return failure(reply, error);
    }
    if (input.brandId && !(await exists('brandforge_brands', tenant(request), input.brandId)))
      return reply.code(404).send({ error: 'Brand not found', code: 'BRANDFORGE_BRAND_NOT_FOUND' });
    if (
      input.campaignId &&
      !(await exists('brandforge_campaigns', tenant(request), input.campaignId))
    )
      return reply
        .code(404)
        .send({ error: 'Campaign not found', code: 'BRANDFORGE_CAMPAIGN_NOT_FOUND' });
    const result = await db.execute(
      sql`INSERT INTO brandforge_ai_workflows (tenant_id,user_id,brand_id,campaign_id,workflow_type,name,inputs) VALUES (${tenant(request)},${actor(request)},${input.brandId ?? null},${input.campaignId ?? null},${input.workflowType},${input.name},${input.inputs}) RETURNING *`,
    );
    return reply.code(201).send(result.rows[0]);
  });
  app.post(
    `${base}/workflows/:id/complete`,
    { preHandler: writeGuards },
    async (request, reply) => {
      const generationId = String(body(request).generationId || '');
      if (!(await exists('brandforge_generations', tenant(request), generationId)))
        return reply
          .code(404)
          .send({ error: 'Generation not found', code: 'BRANDFORGE_GENERATION_NOT_FOUND' });
      const result = await db.execute(
        sql`UPDATE brandforge_ai_workflows workflow SET generation_id=generation.id,output=generation.output,status='completed',step=3,completed_at=NOW(),updated_at=NOW(),version=workflow.version+1 FROM brandforge_generations generation WHERE workflow.tenant_id=${tenant(request)} AND workflow.id=${param(request, 'id')} AND generation.tenant_id=workflow.tenant_id AND generation.id=${generationId} RETURNING workflow.*`,
      );
      if (!result.rows[0])
        return reply
          .code(404)
          .send({ error: 'Workflow not found', code: 'BRANDFORGE_WORKFLOW_NOT_FOUND' });
      return result.rows[0];
    },
  );

  app.get(`${base}/templates`, { preHandler: readGuards }, async (request) => ({
    templates: (
      await db.execute(
        sql`SELECT template.*,CASE WHEN template.is_premium THEN EXISTS(SELECT 1 FROM tenant_entitlements entitlement WHERE entitlement.tenant_id=${tenant(request)} AND entitlement.active=TRUE AND entitlement.entitlement_key=template.required_entitlement) ELSE TRUE END AS usable FROM brandforge_templates template WHERE (template.tenant_id=${tenant(request)} OR template.is_global=TRUE) AND template.deleted_at IS NULL ORDER BY template.is_featured DESC,template.created_at DESC`,
      )
    ).rows,
  }));
  app.post(`${base}/templates`, { preHandler: writeGuards }, async (request, reply) => {
    let input;
    try {
      input = parsePhase31(templateInput, body(request));
    } catch (error) {
      return failure(reply, error);
    }
    const result = await db.execute(
      sql`INSERT INTO brandforge_templates (tenant_id,created_by_user_id,name,description,category,template_type,content,tags,is_global,is_premium) VALUES (${tenant(request)},${actor(request)},${input.name},${input.description ?? null},${input.category},${input.templateType},${input.content},${JSON.stringify(input.tags)}::jsonb,FALSE,FALSE) RETURNING *`,
    );
    return reply.code(201).send(result.rows[0]);
  });
  app.post(`${base}/templates/:id/use`, { preHandler: writeGuards }, async (request, reply) => {
    const selected = await db.execute(
      sql`SELECT template.*,CASE WHEN template.is_premium THEN EXISTS(SELECT 1 FROM tenant_entitlements entitlement WHERE entitlement.tenant_id=${tenant(request)} AND entitlement.active=TRUE AND entitlement.entitlement_key=template.required_entitlement) ELSE TRUE END AS usable FROM brandforge_templates template WHERE template.id=${param(request, 'id')} AND (template.tenant_id=${tenant(request)} OR template.is_global=TRUE) AND template.deleted_at IS NULL LIMIT 1`,
    );
    const template = selected.rows[0] as Row | undefined;
    if (!template)
      return reply
        .code(404)
        .send({ error: 'Template not found', code: 'BRANDFORGE_TEMPLATE_NOT_FOUND' });
    if (!template.usable)
      return reply.code(403).send({
        error: 'Template requires an OperatorOS entitlement',
        code: 'BRANDFORGE_TEMPLATE_ENTITLEMENT_REQUIRED',
        entitlement: template.required_entitlement,
      });
    await db.execute(
      sql`UPDATE brandforge_templates SET usage_count=usage_count+1,updated_at=NOW() WHERE id=${template.id}`,
    );
    await activity(
      request,
      'brandforge_template',
      template.id,
      'used',
      `Used template ${template.name}`,
    );
    return { template, used: true };
  });
  app.delete(`${base}/templates/:id`, { preHandler: writeGuards }, async (request, reply) => {
    const result = await db.execute(
      sql`UPDATE brandforge_templates SET deleted_at=NOW(),updated_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${param(request, 'id')} AND is_global=FALSE AND deleted_at IS NULL RETURNING id`,
    );
    if (!result.rows[0])
      return reply
        .code(404)
        .send({ error: 'Custom template not found', code: 'BRANDFORGE_TEMPLATE_NOT_FOUND' });
    return reply.code(204).send();
  });

  app.get(`${base}/integrations`, { preHandler: readGuards }, async (request) => {
    const [links, configs] = await Promise.all([
      db.execute(
        sql`SELECT * FROM brandforge_integrations WHERE tenant_id=${tenant(request)} ORDER BY provider_key`,
      ),
      listProviderConfigurations(tenant(request)),
    ]);
    const byProvider = new Map((links.rows as Row[]).map((row) => [row.provider_key, row]));
    return {
      integrations: BRANDFORGE_INTEGRATION_CATALOG.map((item) => ({
        ...item,
        connection: byProvider.get(item.provider) ?? null,
      })),
      providerConfigurations: configs.filter((row: any) =>
        String(row.providerKey || row.provider_key).startsWith('brandforgeos.'),
      ),
    };
  });
  app.post(
    `${base}/integrations/:provider/connect`,
    { preHandler: adminGuards },
    async (request, reply) => {
      const catalog = integrationCatalog(param(request, 'provider'));
      if (!catalog)
        return reply.code(404).send({
          error: 'Integration provider is unsupported',
          code: 'BRANDFORGE_PROVIDER_UNSUPPORTED',
        });
      let input;
      try {
        input = parsePhase31(integrationConnectInput, body(request));
      } catch (error) {
        return failure(reply, error);
      }
      const config = await saveProviderConfiguration({
        tenantId: tenant(request),
        moduleId: await moduleId(),
        actorUserId: actor(request),
        providerKey: `brandforgeos.${catalog.provider}`,
        kind: catalog.kind as any,
        mode: input.mode ?? 'disabled',
        publicConfig: input.publicConfig ?? {},
        secretReference: input.secretReference,
        callbackReady: input.callbackReady ?? false,
      });
      const health = {
        state: (config as any).state,
        reasonCode: (config as any).reasonCode ?? null,
        externalDelivery: (config as any).externalDelivery === true,
      };
      const status =
        health.state === 'ready'
          ? 'ready'
          : health.state === 'degraded'
            ? 'degraded'
            : 'configured';
      const result = await db.execute(
        sql`INSERT INTO brandforge_integrations (tenant_id,provider_key,shared_provider_config_id,status,account_label,health,connected_by_user_id,connected_at) VALUES (${tenant(request)},${catalog.provider},${(config as any).id ?? null},${status},${input.accountLabel ?? null},${health},${actor(request)},NOW()) ON CONFLICT (tenant_id,provider_key) DO UPDATE SET shared_provider_config_id=EXCLUDED.shared_provider_config_id,status=EXCLUDED.status,account_label=EXCLUDED.account_label,health=EXCLUDED.health,connected_by_user_id=EXCLUDED.connected_by_user_id,connected_at=NOW(),disconnected_at=NULL,version=brandforge_integrations.version+1,updated_at=NOW() RETURNING *`,
      );
      return result.rows[0];
    },
  );
  app.delete(
    `${base}/integrations/:provider`,
    { preHandler: adminGuards },
    async (request, reply) => {
      const result = await db.execute(
        sql`UPDATE brandforge_integrations SET status='revoked',disconnected_at=NOW(),health=${{ state: 'blocked', reasonCode: 'DISCONNECTED_BY_ADMIN' }},updated_at=NOW(),version=version+1 WHERE tenant_id=${tenant(request)} AND provider_key=${param(request, 'provider')} AND status<>'revoked' RETURNING id`,
      );
      if (!result.rows[0])
        return reply
          .code(404)
          .send({ error: 'Integration not found', code: 'BRANDFORGE_INTEGRATION_NOT_FOUND' });
      return reply.code(204).send();
    },
  );
  app.post(
    `${base}/integrations/:provider/sync`,
    { preHandler: adminGuards },
    async (request, reply) => {
      const linkResult = await db.execute(
        sql`SELECT * FROM brandforge_integrations WHERE tenant_id=${tenant(request)} AND provider_key=${param(request, 'provider')} AND status IN ('ready','degraded') LIMIT 1`,
      );
      const link = linkResult.rows[0] as Row | undefined;
      if (!link)
        return reply
          .code(409)
          .send({ error: 'Integration is not ready', code: 'BRANDFORGE_INTEGRATION_NOT_READY' });
      const created = await db.execute(
        sql`INSERT INTO brandforge_sync_runs (tenant_id,integration_id,requested_by_user_id) VALUES (${tenant(request)},${link.id},${actor(request)}) RETURNING *`,
      );
      const run = created.rows[0] as Row;
      const queued = await enqueueSharedJob({
        tenantId: tenant(request),
        moduleId: await moduleId(),
        requestedByUserId: actor(request),
        handlerKey: SYNC_HANDLER,
        payload: { syncId: run.id },
        idempotencyKey: String(body(request).idempotencyKey || run.id),
      });
      await db.execute(
        sql`UPDATE brandforge_sync_runs SET shared_job_id=${(queued.job as Row).id} WHERE id=${run.id}`,
      );
      return reply.code(202).send({ syncRun: run, job: queued.job, duplicate: queued.duplicate });
    },
  );
  app.get(
    `${base}/integrations/:provider/history`,
    { preHandler: readGuards },
    async (request) => ({
      runs: (
        await db.execute(
          sql`SELECT run.* FROM brandforge_sync_runs run JOIN brandforge_integrations link ON link.tenant_id=run.tenant_id AND link.id=run.integration_id WHERE run.tenant_id=${tenant(request)} AND link.provider_key=${param(request, 'provider')} ORDER BY run.created_at DESC LIMIT 50`,
        )
      ).rows,
    }),
  );

  app.get(`${base}/recommendations`, { preHandler: readGuards }, async (request) => ({
    recommendations: (
      await db.execute(
        sql`SELECT * FROM brandforge_recommendations WHERE tenant_id=${tenant(request)} ORDER BY dismissed_at NULLS FIRST,created_at DESC LIMIT 100`,
      )
    ).rows,
  }));
  app.post(
    `${base}/recommendations/:id/dismiss`,
    { preHandler: writeGuards },
    async (request, reply) => {
      const result = await db.execute(
        sql`UPDATE brandforge_recommendations SET dismissed_by_user_id=${actor(request)},dismissed_at=NOW() WHERE tenant_id=${tenant(request)} AND id=${param(request, 'id')} AND dismissed_at IS NULL RETURNING *`,
      );
      if (!result.rows[0])
        return reply
          .code(404)
          .send({ error: 'Recommendation not found', code: 'BRANDFORGE_RECOMMENDATION_NOT_FOUND' });
      return result.rows[0];
    },
  );
  app.get(`${base}/leads`, { preHandler: readGuards }, async (request) => ({
    leads: (
      await db.execute(
        sql`SELECT * FROM brandforge_lead_submissions WHERE tenant_id=${tenant(request)} ORDER BY received_at DESC LIMIT 100`,
      )
    ).rows,
  }));
  app.post(`${base}/leads`, { preHandler: writeGuards }, async (request, reply) => {
    let input;
    try {
      input = parsePhase31(leadInput, body(request));
    } catch (error) {
      return failure(reply, error);
    }
    if (
      input.campaignId &&
      !(await exists('brandforge_campaigns', tenant(request), input.campaignId))
    )
      return reply
        .code(404)
        .send({ error: 'Campaign not found', code: 'BRANDFORGE_CAMPAIGN_NOT_FOUND' });
    if (
      input.landingPageId &&
      !(await exists('brandforge_landing_pages', tenant(request), input.landingPageId))
    )
      return reply
        .code(404)
        .send({ error: 'Landing page not found', code: 'BRANDFORGE_LANDING_NOT_FOUND' });
    const result = await db.execute(
      sql`INSERT INTO brandforge_lead_submissions (tenant_id,campaign_id,landing_page_id,source,contact,consent,duplicate_key) VALUES (${tenant(request)},${input.campaignId ?? null},${input.landingPageId ?? null},${input.source ?? null},${input.contact},${input.consent},${input.duplicateKey ?? null}) ON CONFLICT (tenant_id,duplicate_key) DO UPDATE SET updated_at=brandforge_lead_submissions.updated_at RETURNING *`,
    );
    return reply.code(201).send(result.rows[0]);
  });

  app.get(`${base}/reports`, { preHandler: readGuards }, async (request) => ({
    reports: (
      await db.execute(
        sql`SELECT * FROM brandforge_reports WHERE tenant_id=${tenant(request)} ORDER BY created_at DESC`,
      )
    ).rows,
  }));
  app.post(`${base}/reports`, { preHandler: writeGuards }, async (request, reply) => {
    let input;
    try {
      input = parsePhase31(reportInput, body(request));
    } catch (error) {
      return failure(reply, error);
    }
    if (input.brandId && !(await exists('brandforge_brands', tenant(request), input.brandId)))
      return reply.code(404).send({ error: 'Brand not found', code: 'BRANDFORGE_BRAND_NOT_FOUND' });
    if (
      input.campaignId &&
      !(await exists('brandforge_campaigns', tenant(request), input.campaignId))
    )
      return reply
        .code(404)
        .send({ error: 'Campaign not found', code: 'BRANDFORGE_CAMPAIGN_NOT_FOUND' });
    const result = await db.execute(
      sql`INSERT INTO brandforge_reports (tenant_id,created_by_user_id,brand_id,campaign_id,name,report_type,date_from,date_to,sections,branding,is_white_label) VALUES (${tenant(request)},${actor(request)},${input.brandId ?? null},${input.campaignId ?? null},${input.name},${input.reportType},${input.dateFrom ?? null},${input.dateTo ?? null},${JSON.stringify(input.sections)}::jsonb,${input.branding},${input.isWhiteLabel}) RETURNING *`,
    );
    return reply.code(201).send(result.rows[0]);
  });
  app.get(`${base}/reports/:id`, { preHandler: readGuards }, async (request, reply) => {
    const result = await db.execute(
      sql`SELECT * FROM brandforge_reports WHERE tenant_id=${tenant(request)} AND id=${param(request, 'id')} LIMIT 1`,
    );
    if (!result.rows[0])
      return reply
        .code(404)
        .send({ error: 'Report not found', code: 'BRANDFORGE_REPORT_NOT_FOUND' });
    return result.rows[0];
  });
  app.post(`${base}/reports/:id/generate`, { preHandler: writeGuards }, async (request, reply) => {
    const selected = await db.execute(
      sql`SELECT * FROM brandforge_reports WHERE tenant_id=${tenant(request)} AND id=${param(request, 'id')} LIMIT 1`,
    );
    const report = selected.rows[0] as Row | undefined;
    if (!report)
      return reply
        .code(404)
        .send({ error: 'Report not found', code: 'BRANDFORGE_REPORT_NOT_FOUND' });
    const snapshot = await reportSnapshot(tenant(request), report);
    const hash = stableJsonHash(snapshot);
    const result = await db.execute(
      sql`UPDATE brandforge_reports SET snapshot=${snapshot},snapshot_sha256=${hash},status='generated',generated_at=NOW(),updated_at=NOW(),version=version+1 WHERE tenant_id=${tenant(request)} AND id=${report.id} RETURNING *`,
    );
    await activity(
      request,
      'brandforge_report',
      report.id,
      'generated',
      `Generated ${report.report_type.replaceAll('_', ' ')} report`,
      { snapshotSha256: hash },
    );
    return result.rows[0];
  });
  app.get(`${base}/exports`, { preHandler: readGuards }, async (request) => ({
    exports: (
      await db.execute(
        sql`SELECT id,report_id,export_type,format,status,content_sha256,error_code,completed_at,expires_at,created_at FROM brandforge_export_jobs WHERE tenant_id=${tenant(request)} ORDER BY created_at DESC LIMIT 100`,
      )
    ).rows,
  }));
  app.post(`${base}/exports`, { preHandler: writeGuards }, async (request, reply) => {
    let input;
    try {
      input = parsePhase31(exportInput, body(request));
    } catch (error) {
      return failure(reply, error);
    }
    if (input.reportId && !(await exists('brandforge_reports', tenant(request), input.reportId)))
      return reply
        .code(404)
        .send({ error: 'Report not found', code: 'BRANDFORGE_REPORT_NOT_FOUND' });
    const created = await db.execute(
      sql`INSERT INTO brandforge_export_jobs (tenant_id,requested_by_user_id,report_id,export_type,format) VALUES (${tenant(request)},${actor(request)},${input.reportId ?? null},${input.exportType},${input.format}) RETURNING *`,
    );
    const job = created.rows[0] as Row;
    const queued = await enqueueSharedJob({
      tenantId: tenant(request),
      moduleId: await moduleId(),
      requestedByUserId: actor(request),
      handlerKey: EXPORT_HANDLER,
      payload: { exportId: job.id },
      idempotencyKey: input.idempotencyKey,
    });
    await db.execute(
      sql`UPDATE brandforge_export_jobs SET shared_job_id=${(queued.job as Row).id} WHERE id=${job.id}`,
    );
    return reply.code(202).send({ export: job, job: queued.job, duplicate: queued.duplicate });
  });
  app.get(`${base}/exports/:id/download`, { preHandler: readGuards }, async (request, reply) => {
    const result = await db.execute(
      sql`SELECT output,status,expires_at FROM brandforge_export_jobs WHERE tenant_id=${tenant(request)} AND id=${param(request, 'id')} LIMIT 1`,
    );
    const job = result.rows[0] as Row | undefined;
    if (!job)
      return reply
        .code(404)
        .send({ error: 'Export not found', code: 'BRANDFORGE_EXPORT_NOT_FOUND' });
    if (job.status !== 'completed')
      return reply
        .code(409)
        .send({ error: 'Export is not complete', code: 'BRANDFORGE_EXPORT_NOT_READY' });
    if (job.expires_at && new Date(job.expires_at) <= new Date())
      return reply.code(410).send({ error: 'Export expired', code: 'BRANDFORGE_EXPORT_EXPIRED' });
    reply
      .type(String(job.output.contentType))
      .header(
        'Content-Disposition',
        `attachment; filename="${String(job.output.fileName).replaceAll('"', '')}"`,
      );
    return reply.send(String(job.output.content));
  });

  app.get(`${base}/activity`, { preHandler: readGuards }, async (request) => ({
    activity: (
      await db.execute(
        sql`SELECT id,actor_user_id,object_type,object_id,event_type,summary,metadata_json,created_at FROM shared_activity_events WHERE tenant_id=${tenant(request)} AND module_id=${await moduleId()} ORDER BY created_at DESC LIMIT 100`,
      )
    ).rows,
  }));
  app.get(`${base}/notifications`, { preHandler: readGuards }, async (request) => ({
    notifications: await listUserNotifications({
      tenantId: tenant(request),
      moduleId: await moduleId(),
      userId: actor(request),
      limit: 100,
    }),
  }));
  app.post(
    `${base}/notifications/:id/read`,
    { preHandler: writeGuards },
    async (request, reply) => {
      const found = await markUserNotificationRead({
        tenantId: tenant(request),
        moduleId: await moduleId(),
        userId: actor(request),
        notificationId: param(request, 'id'),
      });
      if (!found)
        return reply
          .code(404)
          .send({ error: 'Notification not found', code: 'BRANDFORGE_NOTIFICATION_NOT_FOUND' });
      return { read: true };
    },
  );
  app.get(`${base}/plan-usage`, { preHandler: readGuards }, async (request) =>
    entitlementProjection(tenant(request)),
  );

  app.get('/v1/platform/brandforgeos/overview', { preHandler: [requireSuperAdmin] }, async () => {
    const result = await db.execute(
      sql`SELECT tenant.id tenant_id,tenant.name tenant_name,tm.status module_status,COALESCE(tm.metadata,'{}'::jsonb) module_metadata,(SELECT count(*)::int FROM brandforge_campaigns campaign WHERE campaign.tenant_id=tenant.id AND campaign.deleted_at IS NULL) campaigns,(SELECT count(*)::int FROM brandforge_generations generation WHERE generation.tenant_id=tenant.id) generations,(SELECT count(*)::int FROM brandforge_integrations integration WHERE integration.tenant_id=tenant.id AND integration.status NOT IN ('disconnected','revoked')) connected_integrations FROM tenants tenant JOIN modules module ON module.slug=${MODULE_SLUG} LEFT JOIN tenant_modules tm ON tm.tenant_id=tenant.id AND tm.module_id=module.id ORDER BY tenant.name`,
    );
    return { tenants: result.rows, authority: 'operatoros' };
  });
  app.patch(
    '/v1/platform/brandforgeos/tenants/:tenantId/credits',
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const limit = Number(body(request).monthlyCredits);
      if (!Number.isSafeInteger(limit) || limit < 0 || limit > 10_000_000)
        return reply.code(400).send({
          error: 'monthlyCredits must be a non-negative integer',
          code: 'BRANDFORGE_CREDIT_LIMIT_INVALID',
        });
      const targetTenant = param(request, 'tenantId');
      const result = await db.execute(
        sql`UPDATE tenant_modules tm SET metadata=jsonb_set(jsonb_set(COALESCE(tm.metadata,'{}'::jsonb),'{features}',COALESCE(tm.metadata->'features','{}'::jsonb),TRUE),'{features,brandforgeMonthlyCredits}',to_jsonb(${limit}::int),TRUE),updated_at=NOW() FROM modules module WHERE tm.module_id=module.id AND module.slug=${MODULE_SLUG} AND tm.tenant_id=${targetTenant} RETURNING tm.id,tm.metadata`,
      );
      if (!result.rows[0])
        return reply.code(404).send({
          error: 'Tenant BrandForgeOS entitlement not found',
          code: 'BRANDFORGE_TENANT_MODULE_NOT_FOUND',
        });
      await writeAudit(
        {
          actorUserId: actor(request),
          tenantId: targetTenant,
          targetType: 'tenant_module',
          targetId: String((result.rows[0] as Row).id),
          action: 'brandforge_credit_limit_update',
          after: { monthlyCredits: limit },
        },
        request,
      );
      return result.rows[0];
    },
  );
}
