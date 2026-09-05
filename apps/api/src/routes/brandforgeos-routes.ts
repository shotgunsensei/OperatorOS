import type { FastifyInstance, FastifyReply } from 'fastify';
import { createHash } from 'node:crypto';
import { and, count, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  brandforgeBrands,
  brandforgeCalendarItems,
  brandforgeCampaignMetrics,
  brandforgeCampaigns,
  brandforgeCopyAssets,
  brandforgeGenerations,
  brandforgePersonas,
  brandforgeWorkspaceSettings,
  modules,
} from '../schema.js';
import {
  BrandForgeValidationError,
  parseBrandInput,
  parseCalendarInput,
  parseCampaignInput,
  parseCopyAssetInput,
  parseGenerationInput,
  parseListQuery,
  parseMetricInput,
  parsePersonaInput,
  parseWorkspaceSettings,
} from '../lib/brandforgeos.js';
import {
  appendActivityEvent,
  beginIdempotentOperation,
  completeIdempotentOperation,
  failIdempotentOperation,
  recordUsageEvent,
} from '../lib/shared-usage-activity.js';
import { AiProviderDisabledError, getAiProvider, getProviderInfo } from '../lib/ai-provider.js';
import {
  requireTenantModuleAccess,
  requireTenantModuleWriteAccess,
} from '../lib/tenant-auth.js';
import { BRANDFORGE_COPY_MODES, BRANDFORGE_TONES, scoreCopyContent } from '../lib/brandforgeos-phase31.js';
import { createAttachment, getAttachmentContent, getMaxAttachmentBytes, softDeleteAttachment } from '../lib/shared-attachments.js';

const readGuards = [requireTenantModuleAccess('brandforgeos')];
const writeGuards = [...readGuards, requireTenantModuleWriteAccess];
const brandLogoBodyLimit = Math.ceil(getMaxAttachmentBytes() * 1.38) + 16_384;
const BRAND_LOGO_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
type Context = { tenantId: string };
type User = { id: string };

async function retireBrandLogoAttachment(input: {
  executor: any;
  tenantId: string;
  moduleId: string;
  brandId: string;
  attachmentId: string | null | undefined;
  actorUserId: string;
}) {
  if (!input.attachmentId) return;
  const found = await input.executor.execute(sql`
    SELECT version FROM shared_attachments
    WHERE tenant_id=${input.tenantId} AND module_id=${input.moduleId}
      AND id=${input.attachmentId} AND object_type='brandforge_brand_logo'
      AND object_id=${input.brandId} AND deleted_at IS NULL
    FOR UPDATE
  `);
  const row = found.rows[0] as { version?: number } | undefined;
  if (!row) return;
  const deleted = await softDeleteAttachment({
    tenantId: input.tenantId,
    moduleId: input.moduleId,
    attachmentId: input.attachmentId,
    deletedByUserId: input.actorUserId,
    version: Number(row.version),
    objectType: 'brandforge_brand_logo',
    objectId: input.brandId,
    retentionUntil: new Date(Date.now() + BRAND_LOGO_RETENTION_MS),
  }, input.executor);
  if (!deleted) throw Object.assign(new Error('The previous logo could not be retired safely'), { code: 'BRANDFORGE_LOGO_RETIRE_FAILED' });
}

function validation(reply: FastifyReply, error: unknown) {
  if (!(error instanceof BrandForgeValidationError)) return false;
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
    code: `BRANDFORGE_${entity.toUpperCase().replaceAll(' ', '_')}_NOT_FOUND`,
  });
}

function versionConflict(reply: FastifyReply, entity: string) {
  return reply.code(409).send({
    error: `${entity} changed; reload before saving`,
    code: 'BRANDFORGE_VERSION_CONFLICT',
  });
}

function active(table: { tenantId: any; deletedAt: any }, tenantId: string) {
  return and(eq(table.tenantId, tenantId), isNull(table.deletedAt));
}

function brandView(row: typeof brandforgeBrands.$inferSelect) {
  const { tenantId: _tenant, createdByUserId: _user, deletedAt: _deleted, ...safe } = row;
  return safe;
}
function personaView(row: typeof brandforgePersonas.$inferSelect) {
  const { tenantId: _tenant, createdByUserId: _user, deletedAt: _deleted, ...safe } = row;
  return safe;
}
function campaignView(row: typeof brandforgeCampaigns.$inferSelect) {
  const { tenantId: _tenant, createdByUserId: _user, deletedAt: _deleted, ...safe } = row;
  return safe;
}
function copyView(row: typeof brandforgeCopyAssets.$inferSelect) {
  const { tenantId: _tenant, createdByUserId: _user, deletedAt: _deleted, ...safe } = row;
  return safe;
}
function calendarView(row: typeof brandforgeCalendarItems.$inferSelect) {
  const { tenantId: _tenant, createdByUserId: _user, deletedAt: _deleted, ...safe } = row;
  return safe;
}
function generationView(row: typeof brandforgeGenerations.$inferSelect) {
  const { tenantId: _tenant, userId: _user, inputHash: _hash, ...safe } = row;
  return safe;
}

async function scopedBrand(tenantId: string, id?: string | null) {
  if (!id) return null;
  const [row] = await db.select().from(brandforgeBrands).where(and(
    eq(brandforgeBrands.tenantId, tenantId),
    eq(brandforgeBrands.id, id),
    isNull(brandforgeBrands.deletedAt),
  )).limit(1);
  return row ?? null;
}
async function scopedPersona(tenantId: string, id?: string | null) {
  if (!id) return null;
  const [row] = await db.select().from(brandforgePersonas).where(and(
    eq(brandforgePersonas.tenantId, tenantId),
    eq(brandforgePersonas.id, id),
    isNull(brandforgePersonas.deletedAt),
  )).limit(1);
  return row ?? null;
}
async function scopedCampaign(tenantId: string, id?: string | null) {
  if (!id) return null;
  const [row] = await db.select().from(brandforgeCampaigns).where(and(
    eq(brandforgeCampaigns.tenantId, tenantId),
    eq(brandforgeCampaigns.id, id),
    isNull(brandforgeCampaigns.deletedAt),
  )).limit(1);
  return row ?? null;
}
async function scopedCopy(tenantId: string, id?: string | null) {
  if (!id) return null;
  const [row] = await db.select().from(brandforgeCopyAssets).where(and(
    eq(brandforgeCopyAssets.tenantId, tenantId),
    eq(brandforgeCopyAssets.id, id),
    isNull(brandforgeCopyAssets.deletedAt),
  )).limit(1);
  return row ?? null;
}
async function scopedGeneration(tenantId: string, id?: string | null) {
  if (!id) return null;
  const [row] = await db.select().from(brandforgeGenerations).where(and(
    eq(brandforgeGenerations.tenantId, tenantId),
    eq(brandforgeGenerations.id, id),
  )).limit(1);
  return row ?? null;
}

async function validateReferences(
  reply: FastifyReply,
  tenantId: string,
  refs: { brandId?: string | null; personaId?: string | null; campaignId?: string | null; copyAssetId?: string | null; generationId?: string | null },
) {
  if (refs.brandId && !await scopedBrand(tenantId, refs.brandId)) return notFound(reply, 'brand');
  if (refs.personaId && !await scopedPersona(tenantId, refs.personaId)) return notFound(reply, 'persona');
  if (refs.campaignId && !await scopedCampaign(tenantId, refs.campaignId)) return notFound(reply, 'campaign');
  if (refs.copyAssetId && !await scopedCopy(tenantId, refs.copyAssetId)) return notFound(reply, 'copy asset');
  if (refs.generationId && !await scopedGeneration(tenantId, refs.generationId)) return notFound(reply, 'generation');
  return null;
}

const campaignTransitions: Record<string, readonly string[]> = {
  draft: ['planning', 'archived'],
  planning: ['draft', 'producing', 'archived'],
  producing: ['planning', 'review', 'archived'],
  review: ['producing', 'scheduled', 'active', 'archived'],
  scheduled: ['review', 'active', 'archived'],
  active: ['completed', 'archived'],
  completed: ['archived'],
  archived: [],
};
const copyTransitions: Record<string, readonly string[]> = {
  draft: ['review', 'archived'],
  review: ['draft', 'approved', 'archived'],
  approved: ['review', 'published', 'archived'],
  published: ['archived'],
  archived: [],
};
const calendarTransitions: Record<string, readonly string[]> = {
  idea: ['draft', 'cancelled'],
  draft: ['review', 'scheduled', 'cancelled'],
  review: ['draft', 'scheduled', 'cancelled'],
  scheduled: ['review', 'published', 'cancelled'],
  published: [],
  cancelled: ['draft'],
};

function transitionAllowed(current: string, next: string | undefined, transitions: Record<string, readonly string[]>) {
  return !next || next === current || transitions[current]?.includes(next);
}

function parseProviderOutput(type: 'copy' | 'strategy' | 'campaign_ideas', raw: string): Record<string, unknown> {
  const invalid = () => Object.assign(new Error('Provider output had an invalid shape'), { code: 'BRANDFORGE_PROVIDER_OUTPUT_INVALID' });
  if (raw.length > 60_000) throw Object.assign(new Error('Provider output exceeded the safe response limit'), { code: 'BRANDFORGE_PROVIDER_OUTPUT_INVALID' });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/```json\s*|\s*```/g, '').trim());
  } catch {
    throw Object.assign(new Error('Provider output was not valid JSON'), { code: 'BRANDFORGE_PROVIDER_OUTPUT_INVALID' });
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw Object.assign(new Error('Provider output had an invalid shape'), { code: 'BRANDFORGE_PROVIDER_OUTPUT_INVALID' });
  }
  const output = parsed as Record<string, unknown>;
  const safeText = (value: unknown, max: number) => typeof value === 'string' && value.trim() && value.length <= max;
  if (type === 'copy') {
    if (!Array.isArray(output.variants) || output.variants.length < 1 || output.variants.length > 5) throw invalid();
    const variants = output.variants.map((item) => {
      if (!item || typeof item !== 'object' || !safeText((item as any).title, 200) || !safeText((item as any).content, 20_000)) throw invalid();
      return { title: String((item as any).title).trim(), content: String((item as any).content).trim() };
    });
    return { variants: variants.map(variant => ({ ...variant, scores: scoreCopyContent(variant.content) })) };
  }
  if (type === 'strategy') {
    if (!safeText(output.title, 200) || !safeText(output.content, 20_000) || !Array.isArray(output.suggestions) || output.suggestions.length > 10) throw invalid();
    const suggestions = output.suggestions.map((item) => {
      if (!safeText(item, 500)) throw invalid();
      return String(item).trim();
    });
    return { title: String(output.title).trim(), content: String(output.content).trim(), suggestions };
  }
  if (!Array.isArray(output.ideas) || output.ideas.length < 1 || output.ideas.length > 5) throw invalid();
  const ideas = output.ideas.map((item) => {
    if (!item || typeof item !== 'object') throw invalid();
    const candidate = item as Record<string, unknown>;
    if (!safeText(candidate.name, 160) || !safeText(candidate.objective, 4_000) || !safeText(candidate.description, 8_000) || !Array.isArray(candidate.channels) || candidate.channels.length > 10) throw invalid();
    return {
      name: String(candidate.name).trim(),
      objective: String(candidate.objective).trim(),
      description: String(candidate.description).trim(),
      channels: candidate.channels.map((channel) => String(channel).trim().slice(0, 60)).filter(Boolean),
    };
  });
  return { ideas };
}

function csvCell(value: unknown) {
  const raw = value === null || value === undefined ? '' : String(value);
  return `"${raw.replaceAll('"', '""')}"`;
}

async function reserveGenerationCredit(tenantId: string) {
  const projection = await db.execute(sql`
    SELECT tm.metadata->'features'->>'brandforgeMonthlyCredits' AS monthly_credits
    FROM tenant_modules tm JOIN modules module ON module.id=tm.module_id
    WHERE tm.tenant_id=${tenantId} AND module.slug='brandforgeos' LIMIT 1
  `);
  const raw = (projection.rows[0] as any)?.monthly_credits;
  if (raw === null || raw === undefined || raw === '') return { reserved: false, exhausted: false, limit: null };
  const limit = Number(raw);
  if (!Number.isSafeInteger(limit) || limit <= 0) return { reserved: false, exhausted: true, limit: Math.max(0, Number.isFinite(limit) ? limit : 0) };
  const result = await db.execute(sql`
    INSERT INTO brandforge_credit_counters (tenant_id,period_start,limit_snapshot,used_credits)
    VALUES (${tenantId},date_trunc('month',CURRENT_DATE)::date,${limit},1)
    ON CONFLICT (tenant_id,period_start) DO UPDATE SET
      used_credits=brandforge_credit_counters.used_credits+1,
      limit_snapshot=EXCLUDED.limit_snapshot,updated_at=NOW()
    WHERE brandforge_credit_counters.used_credits < EXCLUDED.limit_snapshot
    RETURNING used_credits,limit_snapshot
  `);
  return { reserved: Boolean(result.rows[0]), exhausted: !result.rows[0], limit };
}

async function releaseGenerationCredit(tenantId: string) {
  await db.execute(sql`
    UPDATE brandforge_credit_counters SET used_credits=GREATEST(0,used_credits-1),updated_at=NOW()
    WHERE tenant_id=${tenantId} AND period_start=date_trunc('month',CURRENT_DATE)::date
  `);
}

export async function registerBrandForgeOsRoutes(app: FastifyInstance) {
  const base = '/v1/modules/brandforgeos';

  app.get(`${base}/workspace`, { preHandler: readGuards }, async (request) => {
    const ctx = (request as any).tenantContext as Context;
    const [settings] = await db.select().from(brandforgeWorkspaceSettings)
      .where(eq(brandforgeWorkspaceSettings.tenantId, ctx.tenantId)).limit(1);
    return settings ? {
      completed: settings.completed,
      profile: settings.profile,
      version: settings.version,
      persisted: true,
      updatedAt: settings.updatedAt,
    } : {
      completed: false,
      profile: { goals: [], channels: [] },
      version: 0,
      persisted: false,
      updatedAt: null,
    };
  });

  app.put(`${base}/workspace`, { preHandler: writeGuards }, async (request, reply) => {
    let input;
    try {
      input = parseWorkspaceSettings(request.body, 'patch');
    } catch (error) {
      if (validation(reply, error)) return;
      throw error;
    }
    const ctx = (request as any).tenantContext as Context;
    const user = (request as any).user as User;
    const saved = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${ctx.tenantId}), hashtext('brandforge-workspace'))`);
      const [current] = await tx.select().from(brandforgeWorkspaceSettings)
        .where(eq(brandforgeWorkspaceSettings.tenantId, ctx.tenantId)).limit(1);
      if (!current) {
        if (input.expectedVersion !== 0) return null;
        const [created] = await tx.insert(brandforgeWorkspaceSettings).values({
          tenantId: ctx.tenantId,
          updatedByUserId: user.id,
          completed: input.completed,
          profile: input.profile,
        }).returning();
        return created!;
      }
      if (current.version !== input.expectedVersion) return null;
      const [updated] = await tx.update(brandforgeWorkspaceSettings).set({
        updatedByUserId: user.id,
        completed: input.completed,
        profile: input.profile,
        version: sql`${brandforgeWorkspaceSettings.version} + 1`,
        updatedAt: new Date(),
      }).where(and(
        eq(brandforgeWorkspaceSettings.tenantId, ctx.tenantId),
        eq(brandforgeWorkspaceSettings.version, input.expectedVersion),
      )).returning();
      return updated ?? null;
    });
    if (!saved) return versionConflict(reply, 'Workspace settings');
    return { completed: saved.completed, profile: saved.profile, version: saved.version, persisted: true, updatedAt: saved.updatedAt };
  });

  app.get(`${base}/dashboard`, { preHandler: readGuards }, async (request) => {
    const ctx = (request as any).tenantContext as Context;
    const [counts, metrics, campaignStatuses, channelCounts, upcoming] = await Promise.all([
      db.execute(sql`
        SELECT
          (SELECT count(*)::int FROM brandforge_brands WHERE tenant_id=${ctx.tenantId} AND deleted_at IS NULL) AS brands,
          (SELECT count(*)::int FROM brandforge_personas WHERE tenant_id=${ctx.tenantId} AND deleted_at IS NULL) AS personas,
          (SELECT count(*)::int FROM brandforge_campaigns WHERE tenant_id=${ctx.tenantId} AND deleted_at IS NULL) AS campaigns,
          (SELECT count(*)::int FROM brandforge_copy_assets WHERE tenant_id=${ctx.tenantId} AND deleted_at IS NULL) AS copy_assets,
          (SELECT count(*)::int FROM brandforge_calendar_items WHERE tenant_id=${ctx.tenantId} AND deleted_at IS NULL) AS calendar_items,
          (SELECT count(*)::int FROM brandforge_generations WHERE tenant_id=${ctx.tenantId}) AS generations
      `),
      db.execute(sql`
        SELECT COALESCE(sum(impressions),0)::bigint AS impressions,
          COALESCE(sum(clicks),0)::bigint AS clicks,
          COALESCE(sum(conversions),0)::bigint AS conversions,
          COALESCE(sum(spend_cents),0)::bigint AS spend_cents,
          COALESCE(sum(revenue_cents),0)::bigint AS revenue_cents
        FROM brandforge_campaign_metrics WHERE tenant_id=${ctx.tenantId}
      `),
      db.execute(sql`
        SELECT status, count(*)::int AS count FROM brandforge_campaigns
        WHERE tenant_id=${ctx.tenantId} AND deleted_at IS NULL GROUP BY status ORDER BY status
      `),
      db.execute(sql`
        SELECT channel, count(*)::int AS count FROM (
          SELECT channel FROM brandforge_copy_assets WHERE tenant_id=${ctx.tenantId} AND deleted_at IS NULL AND channel IS NOT NULL
          UNION ALL
          SELECT channel FROM brandforge_calendar_items WHERE tenant_id=${ctx.tenantId} AND deleted_at IS NULL AND channel IS NOT NULL
        ) channels GROUP BY channel ORDER BY count DESC, channel LIMIT 20
      `),
      db.select().from(brandforgeCalendarItems).where(and(
        eq(brandforgeCalendarItems.tenantId, ctx.tenantId),
        isNull(brandforgeCalendarItems.deletedAt),
      )).orderBy(brandforgeCalendarItems.scheduledAt).limit(8),
    ]);
    return {
      counts: counts.rows[0] ?? {},
      performance: metrics.rows[0] ?? {},
      campaignsByStatus: campaignStatuses.rows,
      channelBreakdown: channelCounts.rows,
      upcoming: upcoming.map(calendarView),
      evidence: 'persisted_records_only',
      sampleData: false,
    };
  });

  app.get(`${base}/brands`, { preHandler: readGuards }, async (request, reply) => {
    let query;
    try { query = parseListQuery(request.query); } catch (error) { if (validation(reply, error)) return; throw error; }
    const ctx = (request as any).tenantContext as Context;
    const rows = await db.select().from(brandforgeBrands).where(active(brandforgeBrands, ctx.tenantId))
      .orderBy(desc(brandforgeBrands.updatedAt)).limit(query.limit);
    return { brands: rows.map(brandView) };
  });

  app.post(`${base}/brands`, { preHandler: writeGuards }, async (request, reply) => {
    let input;
    try { input = parseBrandInput(request.body, 'create'); } catch (error) { if (validation(reply, error)) return; throw error; }
    const ctx = (request as any).tenantContext as Context;
    const user = (request as any).user as User;
    const [row] = await db.insert(brandforgeBrands).values({ ...input, name: input.name!, tenantId: ctx.tenantId, createdByUserId: user.id }).returning();
    return reply.code(201).send(brandView(row!));
  });

  app.get(`${base}/brands/:id`, { preHandler: readGuards }, async (request, reply) => {
    const ctx = (request as any).tenantContext as Context;
    const row = await scopedBrand(ctx.tenantId, (request.params as any).id);
    return row ? brandView(row) : notFound(reply, 'brand');
  });

  app.patch(`${base}/brands/:id`, { preHandler: writeGuards }, async (request, reply) => {
    let input;
    try { input = parseBrandInput(request.body, 'patch'); } catch (error) { if (validation(reply, error)) return; throw error; }
    const ctx = (request as any).tenantContext as Context;
    const { expectedVersion, ...changes } = input;
    const [row] = await db.update(brandforgeBrands).set({ ...changes, version: sql`${brandforgeBrands.version}+1`, updatedAt: new Date() }).where(and(
      eq(brandforgeBrands.tenantId, ctx.tenantId), eq(brandforgeBrands.id, (request.params as any).id),
      eq(brandforgeBrands.version, expectedVersion!), isNull(brandforgeBrands.deletedAt),
    )).returning();
    if (!row) return await scopedBrand(ctx.tenantId, (request.params as any).id) ? versionConflict(reply, 'Brand') : notFound(reply, 'brand');
    return brandView(row);
  });

  app.post(`${base}/brands/:id/logo`, { preHandler: writeGuards, bodyLimit: brandLogoBodyLimit }, async (request, reply) => {
    const ctx = (request as any).tenantContext as Context;
    const user = (request as any).user as User;
    const brandId = String((request.params as any).id ?? '');
    const input = request.body && typeof request.body === 'object' && !Array.isArray(request.body)
      ? request.body as Record<string, unknown>
      : null;
    if (!input) return reply.code(400).send({ error: 'Choose a logo image to save.', code: 'BRANDFORGE_LOGO_BODY_INVALID' });
    for (const field of ['tenantId', 'tenant_id', 'userId', 'moduleId', 'role']) {
      if (field in input) return reply.code(400).send({ error: 'Workspace access is taken from your signed-in session.', code: 'BRANDFORGE_AUTHORITY_FIELD_REJECTED' });
    }
    const expectedVersion = Number(input.expectedVersion);
    const fileName = typeof input.fileName === 'string' ? input.fileName.trim().slice(0, 160) : '';
    const mimeType = typeof input.mimeType === 'string' ? input.mimeType.trim().toLowerCase() : '';
    const contentBase64 = typeof input.contentBase64 === 'string' ? input.contentBase64.trim() : '';
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      return reply.code(400).send({ error: 'Refresh the brand kit before saving this logo.', code: 'BRANDFORGE_LOGO_VERSION_INVALID' });
    }
    if (!fileName || !['image/png', 'image/jpeg', 'image/webp'].includes(mimeType) || !/^[A-Za-z0-9+/]+={0,2}$/.test(contentBase64)) {
      return reply.code(400).send({ error: 'Save the logo as a PNG, JPEG, or WebP image.', code: 'BRANDFORGE_LOGO_FILE_INVALID' });
    }
    const content = Buffer.from(contentBase64, 'base64');
    if (!content.length || content.length > getMaxAttachmentBytes()) {
      return reply.code(413).send({ error: 'The logo image is larger than this workspace allows.', code: 'BRANDFORGE_LOGO_SIZE_INVALID' });
    }
    const idempotencyKey = typeof input.idempotencyKey === 'string' ? input.idempotencyKey.trim() : '';
    if (!/^[A-Za-z0-9:_.-]{8,180}$/.test(idempotencyKey)) {
      return reply.code(400).send({ error: 'Refresh the logo concept before saving it.', code: 'BRANDFORGE_LOGO_IDEMPOTENCY_INVALID' });
    }
    const contentSha256 = createHash('sha256').update(content).digest('hex');
    try {
      const result = await db.transaction(async tx => {
        const current = await tx.execute(sql`
          SELECT id,version,asset_summary,logo_attachment_id FROM brandforge_brands
          WHERE tenant_id=${ctx.tenantId} AND id=${brandId} AND deleted_at IS NULL
          FOR UPDATE
        `);
        const brand = current.rows[0] as Record<string, any> | undefined;
        if (!brand) return { state: 'not_found' as const };
        const moduleResult = await tx.execute(sql`SELECT id FROM modules WHERE slug='brandforgeos' AND archived_at IS NULL LIMIT 1`);
        const moduleId = String(moduleResult.rows[0]?.id ?? '');
        if (!moduleId) throw Object.assign(new Error('BrandForgeOS is not available'), { code: 'BRANDFORGE_MODULE_UNAVAILABLE' });
        const promote = async (attachment: Record<string, any>, duplicate: boolean) => {
          const promoted = await tx.execute(sql`
            UPDATE shared_attachments
            SET object_type='brandforge_brand_logo', updated_at=NOW(), version=version+1
            WHERE tenant_id=${ctx.tenantId} AND module_id=${moduleId} AND id=${attachment.id}
              AND object_type='brandforge_brand_logo_candidate' AND object_id=${brandId}
              AND scan_status='clean' AND deleted_at IS NULL
            RETURNING id
          `);
          if (!promoted.rows[0]) {
            throw Object.assign(new Error('Logo candidate did not pass its required safety scan'), { code: 'ATTACHMENT_SCAN_NOT_CLEAN' });
          }
          const existingSummary = Array.isArray(brand.asset_summary) ? brand.asset_summary.map(String) : [];
          const assetSummary = [...existingSummary.filter(item => !item.startsWith('Primary logo:')), `Primary logo: ${fileName}`].slice(-30);
          const [updated] = await tx.update(brandforgeBrands).set({
            logoAttachmentId: String(attachment.id),
            assetSummary,
            version: sql`${brandforgeBrands.version}+1`,
            updatedAt: new Date(),
          }).where(and(
            eq(brandforgeBrands.tenantId, ctx.tenantId),
            eq(brandforgeBrands.id, brandId),
            eq(brandforgeBrands.version, expectedVersion),
            isNull(brandforgeBrands.deletedAt),
          )).returning();
          if (!updated) throw Object.assign(new Error('Brand changed while the logo was being saved'), { code: 'BRANDFORGE_VERSION_CONFLICT' });
          if (brand.logo_attachment_id && String(brand.logo_attachment_id) !== String(attachment.id)) {
            await retireBrandLogoAttachment({
              executor: tx,
              tenantId: ctx.tenantId,
              moduleId,
              brandId,
              attachmentId: String(brand.logo_attachment_id),
              actorUserId: user.id,
            });
          }
          return {
            state: 'promoted' as const,
            brand: updated,
            duplicate,
            logo: { id: String(attachment.id), fileName: String(attachment.original_name), mimeType: String(attachment.detected_mime_type), scanStatus: 'clean' },
          };
        };
        const replay = await tx.execute(sql`
          SELECT id,object_type,original_name,detected_mime_type,scan_status,sha256,deleted_at FROM shared_attachments
          WHERE tenant_id=${ctx.tenantId} AND module_id=${moduleId}
            AND object_type IN ('brandforge_brand_logo','brandforge_brand_logo_candidate') AND object_id=${brandId}
            AND client_mutation_id=${idempotencyKey}
          LIMIT 1
        `);
        const replayedLogo = replay.rows[0] as Record<string, any> | undefined;
        if (replayedLogo) {
          if (String(replayedLogo.sha256) !== contentSha256) {
            throw Object.assign(new Error('Logo idempotency key was already used for different content'), { code: 'ATTACHMENT_IDEMPOTENCY_MISMATCH' });
          }
          if (replayedLogo.deleted_at) {
            throw Object.assign(new Error('Logo idempotency key belongs to a retired logo'), { code: 'ATTACHMENT_IDEMPOTENCY_RETIRED' });
          }
          if (String(replayedLogo.object_type) === 'brandforge_brand_logo') {
            if (String(brand.logo_attachment_id ?? '') === String(replayedLogo.id)) {
              return {
                state: 'replayed' as const,
                duplicate: true,
                logo: { id: String(replayedLogo.id), fileName: String(replayedLogo.original_name), mimeType: String(replayedLogo.detected_mime_type), scanStatus: String(replayedLogo.scan_status) },
              };
            }
            throw Object.assign(new Error('Logo idempotency key is not the current brand logo'), { code: 'ATTACHMENT_IDEMPOTENCY_RETIRED' });
          }
          if (Number(brand.version) !== expectedVersion) return { state: 'conflict' as const };
          const scanStatus = String(replayedLogo.scan_status);
          if (scanStatus === 'clean') return promote(replayedLogo, true);
          if (scanStatus === 'pending') {
            return {
              state: 'staged' as const,
              duplicate: true,
              logo: { id: String(replayedLogo.id), fileName: String(replayedLogo.original_name), mimeType: String(replayedLogo.detected_mime_type), scanStatus },
            };
          }
          const code = scanStatus === 'infected' ? 'ATTACHMENT_QUARANTINED' : scanStatus === 'unavailable' ? 'ATTACHMENT_SCANNER_UNAVAILABLE' : 'ATTACHMENT_SCAN_FAILED';
          throw Object.assign(new Error('Logo candidate did not pass its required safety scan'), { code });
        }
        if (Number(brand.version) !== expectedVersion) return { state: 'conflict' as const };
        const attachment = await createAttachment({
          tenantId: ctx.tenantId,
          moduleId,
          objectType: 'brandforge_brand_logo_candidate',
          objectId: brandId,
          originalName: fileName,
          declaredMimeType: mimeType,
          content,
          createdByUserId: user.id,
          idempotencyKey,
          correlationId: request.id,
        }, tx);
        return {
          state: 'staged' as const,
          duplicate: false,
          logo: { id: String(attachment.id), fileName: String(attachment.original_name), mimeType: String(attachment.detected_mime_type), scanStatus: String(attachment.scan_status) },
        };
      });
      if (result.state === 'not_found') return notFound(reply, 'brand');
      if (result.state === 'conflict') return versionConflict(reply, 'Brand');
      const responseBrand = result.state === 'promoted' ? result.brand : await scopedBrand(ctx.tenantId, brandId);
      if (!responseBrand) return notFound(reply, 'brand');
      return reply.code(result.state === 'staged' ? 202 : result.state === 'replayed' ? 200 : 201).send({
        brand: brandView(responseBrand),
        logo: result.logo,
        duplicate: result.duplicate,
        pendingSafetyCheck: result.state === 'staged',
      });
    } catch (error: any) {
      const code = String(error?.code ?? 'BRANDFORGE_LOGO_SAVE_FAILED');
      const status = code === 'BRANDFORGE_VERSION_CONFLICT'
        ? 409
        : code === 'ATTACHMENT_QUARANTINED'
          ? 422
          : ['ATTACHMENT_SCANNER_UNAVAILABLE', 'ATTACHMENT_SCAN_FAILED', 'ATTACHMENT_SCAN_NOT_CLEAN'].includes(code)
            ? 503
            : code.startsWith('ATTACHMENT_')
              ? 400
              : 503;
      const safetyMessage = code === 'ATTACHMENT_QUARANTINED'
        ? 'The file did not pass the required safety scan. Your existing logo was not changed.'
        : ['ATTACHMENT_SCANNER_UNAVAILABLE', 'ATTACHMENT_SCAN_FAILED', 'ATTACHMENT_SCAN_NOT_CLEAN'].includes(code)
          ? 'The file format was accepted, but the required safety scan could not be completed. Your existing logo was not changed.'
          : null;
      return reply.code(status).send({
        error: status === 409 ? 'The brand kit changed. Refresh it before saving the logo.' : safetyMessage ?? 'The logo could not be saved. Your existing brand kit was not changed.',
        code,
      });
    }
  });

  app.get(`${base}/brands/:id/logo`, { preHandler: readGuards }, async (request, reply) => {
    const ctx = (request as any).tenantContext as Context;
    const brandId = String((request.params as any).id ?? '');
    const brand = await scopedBrand(ctx.tenantId, brandId);
    if (!brand) return notFound(reply, 'brand');
    if (!brand.logoAttachmentId) return reply.code(404).send({ error: 'This brand kit does not have a saved logo yet.', code: 'BRANDFORGE_LOGO_NOT_FOUND' });
    const moduleRow = await db.select({ id: modules.id }).from(modules).where(eq(modules.slug, 'brandforgeos')).limit(1);
    try {
      const stored = await getAttachmentContent({
        tenantId: ctx.tenantId,
        moduleId: String(moduleRow[0]?.id ?? ''),
        attachmentId: brand.logoAttachmentId,
        objectType: 'brandforge_brand_logo',
        objectId: brandId,
      });
      if (!stored) return reply.code(404).send({ error: 'The saved logo is no longer available.', code: 'BRANDFORGE_LOGO_NOT_FOUND' });
      return reply.type(String(stored.metadata.detected_mime_type)).header('Cache-Control', 'private, no-store').send(stored.content);
    } catch (error: any) {
      if (error?.code === 'ATTACHMENT_SCAN_PENDING') {
        return reply.code(409).send({ error: 'The saved logo is still being checked. Try again in a moment.', code: error.code });
      }
      return reply.code(404).send({ error: 'The saved logo is not available.', code: String(error?.code ?? 'BRANDFORGE_LOGO_NOT_FOUND') });
    }
  });

  app.delete(`${base}/brands/:id`, { preHandler: writeGuards }, async (request, reply) => {
    const ctx = (request as any).tenantContext as Context;
    const user = (request as any).user as User;
    const brandId = String((request.params as any).id ?? '');
    const row = await db.transaction(async tx => {
      const current = await tx.execute(sql`
        SELECT id,logo_attachment_id FROM brandforge_brands
        WHERE tenant_id=${ctx.tenantId} AND id=${brandId} AND deleted_at IS NULL
        FOR UPDATE
      `);
      const brand = current.rows[0] as Record<string, any> | undefined;
      if (!brand) return null;
      const [updated] = await tx.update(brandforgeBrands).set({ deletedAt: new Date(), updatedAt: new Date(), version: sql`${brandforgeBrands.version}+1` }).where(and(
        eq(brandforgeBrands.tenantId, ctx.tenantId), eq(brandforgeBrands.id, brandId), isNull(brandforgeBrands.deletedAt),
      )).returning();
      if (!updated) return null;
      if (brand.logo_attachment_id) {
        const moduleResult = await tx.execute(sql`SELECT id FROM modules WHERE slug='brandforgeos' AND archived_at IS NULL LIMIT 1`);
        const moduleId = String(moduleResult.rows[0]?.id ?? '');
        if (!moduleId) throw Object.assign(new Error('BrandForgeOS is not available'), { code: 'BRANDFORGE_MODULE_UNAVAILABLE' });
        await retireBrandLogoAttachment({
          executor: tx,
          tenantId: ctx.tenantId,
          moduleId,
          brandId,
          attachmentId: String(brand.logo_attachment_id),
          actorUserId: user.id,
        });
      }
      return updated;
    });
    return row ? { ok: true } : notFound(reply, 'brand');
  });

  app.get(`${base}/personas`, { preHandler: readGuards }, async (request, reply) => {
    let query;
    try { query = parseListQuery(request.query); } catch (error) { if (validation(reply, error)) return; throw error; }
    const ctx = (request as any).tenantContext as Context;
    const rows = await db.select().from(brandforgePersonas).where(active(brandforgePersonas, ctx.tenantId))
      .orderBy(desc(brandforgePersonas.updatedAt)).limit(query.limit);
    return { personas: rows.map(personaView) };
  });

  app.post(`${base}/personas`, { preHandler: writeGuards }, async (request, reply) => {
    let input;
    try { input = parsePersonaInput(request.body, 'create'); } catch (error) { if (validation(reply, error)) return; throw error; }
    const ctx = (request as any).tenantContext as Context;
    const user = (request as any).user as User;
    const [row] = await db.insert(brandforgePersonas).values({ ...input, name: input.name!, tenantId: ctx.tenantId, createdByUserId: user.id }).returning();
    return reply.code(201).send(personaView(row!));
  });

  app.patch(`${base}/personas/:id`, { preHandler: writeGuards }, async (request, reply) => {
    let input;
    try { input = parsePersonaInput(request.body, 'patch'); } catch (error) { if (validation(reply, error)) return; throw error; }
    const ctx = (request as any).tenantContext as Context;
    const { expectedVersion, ...changes } = input;
    const [row] = await db.update(brandforgePersonas).set({ ...changes, version: sql`${brandforgePersonas.version}+1`, updatedAt: new Date() }).where(and(
      eq(brandforgePersonas.tenantId, ctx.tenantId), eq(brandforgePersonas.id, (request.params as any).id),
      eq(brandforgePersonas.version, expectedVersion!), isNull(brandforgePersonas.deletedAt),
    )).returning();
    if (!row) return await scopedPersona(ctx.tenantId, (request.params as any).id) ? versionConflict(reply, 'Persona') : notFound(reply, 'persona');
    return personaView(row);
  });

  app.delete(`${base}/personas/:id`, { preHandler: writeGuards }, async (request, reply) => {
    const ctx = (request as any).tenantContext as Context;
    const [row] = await db.update(brandforgePersonas).set({ deletedAt: new Date(), updatedAt: new Date(), version: sql`${brandforgePersonas.version}+1` }).where(and(
      eq(brandforgePersonas.tenantId, ctx.tenantId), eq(brandforgePersonas.id, (request.params as any).id), isNull(brandforgePersonas.deletedAt),
    )).returning();
    return row ? { ok: true } : notFound(reply, 'persona');
  });

  app.get(`${base}/campaigns`, { preHandler: readGuards }, async (request, reply) => {
    let query;
    try { query = parseListQuery(request.query); } catch (error) { if (validation(reply, error)) return; throw error; }
    const ctx = (request as any).tenantContext as Context;
    const conditions = [eq(brandforgeCampaigns.tenantId, ctx.tenantId), isNull(brandforgeCampaigns.deletedAt)];
    if (query.status) conditions.push(eq(brandforgeCampaigns.status, query.status as any));
    const rows = await db.select().from(brandforgeCampaigns).where(and(...conditions))
      .orderBy(desc(brandforgeCampaigns.updatedAt)).limit(query.limit);
    return { campaigns: rows.map(campaignView) };
  });

  app.post(`${base}/campaigns`, { preHandler: writeGuards }, async (request, reply) => {
    let input;
    try { input = parseCampaignInput(request.body, 'create'); } catch (error) { if (validation(reply, error)) return; throw error; }
    const ctx = (request as any).tenantContext as Context;
    const user = (request as any).user as User;
    const invalid = await validateReferences(reply, ctx.tenantId, input);
    if (invalid) return invalid;
    const [row] = await db.insert(brandforgeCampaigns).values({ ...input, name: input.name!, tenantId: ctx.tenantId, createdByUserId: user.id }).returning();
    return reply.code(201).send(campaignView(row!));
  });

  app.get(`${base}/campaigns/:id`, { preHandler: readGuards }, async (request, reply) => {
    const ctx = (request as any).tenantContext as Context;
    const row = await scopedCampaign(ctx.tenantId, (request.params as any).id);
    return row ? campaignView(row) : notFound(reply, 'campaign');
  });

  app.patch(`${base}/campaigns/:id`, { preHandler: writeGuards }, async (request, reply) => {
    let input;
    try { input = parseCampaignInput(request.body, 'patch'); } catch (error) { if (validation(reply, error)) return; throw error; }
    const ctx = (request as any).tenantContext as Context;
    const current = await scopedCampaign(ctx.tenantId, (request.params as any).id);
    if (!current) return notFound(reply, 'campaign');
    if (current.version !== input.expectedVersion) return versionConflict(reply, 'Campaign');
    if (!transitionAllowed(current.status, input.status, campaignTransitions)) return reply.code(409).send({ error: 'Campaign status transition is not allowed', code: 'BRANDFORGE_STATUS_TRANSITION_INVALID' });
    const invalid = await validateReferences(reply, ctx.tenantId, input);
    if (invalid) return invalid;
    const { expectedVersion, ...changes } = input;
    const [row] = await db.update(brandforgeCampaigns).set({ ...changes, version: sql`${brandforgeCampaigns.version}+1`, updatedAt: new Date() }).where(and(
      eq(brandforgeCampaigns.tenantId, ctx.tenantId), eq(brandforgeCampaigns.id, current.id),
      eq(brandforgeCampaigns.version, expectedVersion!), isNull(brandforgeCampaigns.deletedAt),
    )).returning();
    return row ? campaignView(row) : versionConflict(reply, 'Campaign');
  });

  app.delete(`${base}/campaigns/:id`, { preHandler: writeGuards }, async (request, reply) => {
    const ctx = (request as any).tenantContext as Context;
    const [row] = await db.update(brandforgeCampaigns).set({ deletedAt: new Date(), updatedAt: new Date(), version: sql`${brandforgeCampaigns.version}+1` }).where(and(
      eq(brandforgeCampaigns.tenantId, ctx.tenantId), eq(brandforgeCampaigns.id, (request.params as any).id), isNull(brandforgeCampaigns.deletedAt),
    )).returning();
    return row ? { ok: true } : notFound(reply, 'campaign');
  });

  app.post(`${base}/campaigns/:id/metrics`, { preHandler: writeGuards }, async (request, reply) => {
    let input;
    try { input = parseMetricInput({ ...(request.body as any), campaignId: (request.params as any).id }); } catch (error) { if (validation(reply, error)) return; throw error; }
    const ctx = (request as any).tenantContext as Context;
    const user = (request as any).user as User;
    if (!await scopedCampaign(ctx.tenantId, input.campaignId)) return notFound(reply, 'campaign');
    const [row] = await db.insert(brandforgeCampaignMetrics).values({ ...input, tenantId: ctx.tenantId, recordedByUserId: user.id }).returning();
    return reply.code(201).send({ id: row!.id, campaignId: row!.campaignId, metricDate: row!.metricDate, channel: row!.channel, impressions: row!.impressions, clicks: row!.clicks, conversions: row!.conversions, spendCents: row!.spendCents, revenueCents: row!.revenueCents, createdAt: row!.createdAt });
  });

  app.get(`${base}/copy-assets`, { preHandler: readGuards }, async (request, reply) => {
    let query;
    try { query = parseListQuery(request.query); } catch (error) { if (validation(reply, error)) return; throw error; }
    const ctx = (request as any).tenantContext as Context;
    const conditions = [eq(brandforgeCopyAssets.tenantId, ctx.tenantId), isNull(brandforgeCopyAssets.deletedAt)];
    if (query.status) conditions.push(eq(brandforgeCopyAssets.status, query.status as any));
    const rows = await db.select().from(brandforgeCopyAssets).where(and(...conditions))
      .orderBy(desc(brandforgeCopyAssets.updatedAt)).limit(query.limit);
    return { copyAssets: rows.map(copyView) };
  });

  app.post(`${base}/copy-assets`, { preHandler: writeGuards }, async (request, reply) => {
    let input;
    try { input = parseCopyAssetInput(request.body, 'create'); } catch (error) { if (validation(reply, error)) return; throw error; }
    const ctx = (request as any).tenantContext as Context;
    const user = (request as any).user as User;
    const invalid = await validateReferences(reply, ctx.tenantId, input);
    if (invalid) return invalid;
    const [row] = await db.insert(brandforgeCopyAssets).values({
      ...input,
      title: input.title!,
      content: input.content!,
      copyType: input.copyType!,
      scores: scoreCopyContent(input.content!),
      tenantId: ctx.tenantId,
      createdByUserId: user.id,
    }).returning();
    return reply.code(201).send(copyView(row!));
  });

  app.get(`${base}/copy-assets/:id`, { preHandler: readGuards }, async (request, reply) => {
    const ctx = (request as any).tenantContext as Context;
    const row = await scopedCopy(ctx.tenantId, (request.params as any).id);
    return row ? copyView(row) : notFound(reply, 'copy asset');
  });

  app.patch(`${base}/copy-assets/:id`, { preHandler: writeGuards }, async (request, reply) => {
    let input;
    try { input = parseCopyAssetInput(request.body, 'patch'); } catch (error) { if (validation(reply, error)) return; throw error; }
    const ctx = (request as any).tenantContext as Context;
    const current = await scopedCopy(ctx.tenantId, (request.params as any).id);
    if (!current) return notFound(reply, 'copy asset');
    if (current.version !== input.expectedVersion) return versionConflict(reply, 'Copy asset');
    if (!transitionAllowed(current.status, input.status, copyTransitions)) return reply.code(409).send({ error: 'Copy status transition is not allowed', code: 'BRANDFORGE_STATUS_TRANSITION_INVALID' });
    const invalid = await validateReferences(reply, ctx.tenantId, input);
    if (invalid) return invalid;
    const { expectedVersion, ...changes } = input;
    const [row] = await db.update(brandforgeCopyAssets).set({ ...changes, ...(changes.content ? { scores: scoreCopyContent(changes.content) } : {}), version: sql`${brandforgeCopyAssets.version}+1`, updatedAt: new Date() }).where(and(
      eq(brandforgeCopyAssets.tenantId, ctx.tenantId), eq(brandforgeCopyAssets.id, current.id),
      eq(brandforgeCopyAssets.version, expectedVersion!), isNull(brandforgeCopyAssets.deletedAt),
    )).returning();
    return row ? copyView(row) : versionConflict(reply, 'Copy asset');
  });

  app.delete(`${base}/copy-assets/:id`, { preHandler: writeGuards }, async (request, reply) => {
    const ctx = (request as any).tenantContext as Context;
    const [row] = await db.update(brandforgeCopyAssets).set({ deletedAt: new Date(), updatedAt: new Date(), version: sql`${brandforgeCopyAssets.version}+1` }).where(and(
      eq(brandforgeCopyAssets.tenantId, ctx.tenantId), eq(brandforgeCopyAssets.id, (request.params as any).id), isNull(brandforgeCopyAssets.deletedAt),
    )).returning();
    return row ? { ok: true } : notFound(reply, 'copy asset');
  });

  app.get(`${base}/calendar-items`, { preHandler: readGuards }, async (request, reply) => {
    let query;
    try { query = parseListQuery(request.query); } catch (error) { if (validation(reply, error)) return; throw error; }
    const ctx = (request as any).tenantContext as Context;
    const conditions = [eq(brandforgeCalendarItems.tenantId, ctx.tenantId), isNull(brandforgeCalendarItems.deletedAt)];
    if (query.status) conditions.push(eq(brandforgeCalendarItems.status, query.status as any));
    const rows = await db.select().from(brandforgeCalendarItems).where(and(...conditions))
      .orderBy(brandforgeCalendarItems.scheduledAt).limit(query.limit);
    return { calendarItems: rows.map(calendarView) };
  });

  app.post(`${base}/calendar-items`, { preHandler: writeGuards }, async (request, reply) => {
    let input;
    try { input = parseCalendarInput(request.body, 'create'); } catch (error) { if (validation(reply, error)) return; throw error; }
    const ctx = (request as any).tenantContext as Context;
    const user = (request as any).user as User;
    const invalid = await validateReferences(reply, ctx.tenantId, input);
    if (invalid) return invalid;
    const [row] = await db.insert(brandforgeCalendarItems).values({
      ...input,
      title: input.title!,
      itemType: input.itemType!,
      scheduledAt: input.scheduledAt!,
      tenantId: ctx.tenantId,
      createdByUserId: user.id,
    }).returning();
    return reply.code(201).send(calendarView(row!));
  });

  app.patch(`${base}/calendar-items/:id`, { preHandler: writeGuards }, async (request, reply) => {
    let input;
    try { input = parseCalendarInput(request.body, 'patch'); } catch (error) { if (validation(reply, error)) return; throw error; }
    const ctx = (request as any).tenantContext as Context;
    const [current] = await db.select().from(brandforgeCalendarItems).where(and(
      eq(brandforgeCalendarItems.tenantId, ctx.tenantId), eq(brandforgeCalendarItems.id, (request.params as any).id), isNull(brandforgeCalendarItems.deletedAt),
    )).limit(1);
    if (!current) return notFound(reply, 'calendar item');
    if (current.version !== input.expectedVersion) return versionConflict(reply, 'Calendar item');
    if (input.status === 'published') {
      return reply.code(409).send({
        error: 'Use Record external publication and include the provider URL, post ID, or release reference.',
        code: 'BRANDFORGE_PUBLICATION_CONFIRMATION_REQUIRED',
      });
    }
    if (!transitionAllowed(current.status, input.status, calendarTransitions)) return reply.code(409).send({ error: 'Calendar status transition is not allowed', code: 'BRANDFORGE_STATUS_TRANSITION_INVALID' });
    const invalid = await validateReferences(reply, ctx.tenantId, input);
    if (invalid) return invalid;
    const { expectedVersion, ...changes } = input;
    const [row] = await db.update(brandforgeCalendarItems).set({ ...changes, version: sql`${brandforgeCalendarItems.version}+1`, updatedAt: new Date() }).where(and(
      eq(brandforgeCalendarItems.tenantId, ctx.tenantId), eq(brandforgeCalendarItems.id, current.id),
      eq(brandforgeCalendarItems.version, expectedVersion!), isNull(brandforgeCalendarItems.deletedAt),
    )).returning();
    return row ? calendarView(row) : versionConflict(reply, 'Calendar item');
  });

  app.post(`${base}/calendar-items/:id/record-publication`, { preHandler: writeGuards }, async (request, reply) => {
    const ctx = (request as any).tenantContext as Context;
    const user = (request as any).user as User;
    const calendarItemId = String((request.params as any).id ?? '');
    const input = request.body && typeof request.body === 'object' && !Array.isArray(request.body)
      ? request.body as Record<string, unknown>
      : null;
    if (!input) return reply.code(400).send({ error: 'Publication confirmation is required.', code: 'BRANDFORGE_PUBLICATION_INPUT_INVALID' });
    for (const field of ['tenantId', 'tenant_id', 'userId', 'moduleId', 'role']) {
      if (field in input) return reply.code(400).send({ error: 'Workspace access is taken from your signed-in session.', code: 'BRANDFORGE_AUTHORITY_FIELD_REJECTED' });
    }
    const expectedVersion = Number(input.expectedVersion);
    const externalReference = typeof input.externalReference === 'string' ? input.externalReference.trim() : '';
    const idempotencyKey = typeof input.idempotencyKey === 'string' ? input.idempotencyKey.trim() : '';
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      return reply.code(400).send({ error: 'Refresh this calendar item before recording publication.', code: 'BRANDFORGE_PUBLICATION_VERSION_INVALID' });
    }
    if (input.externalPublicationConfirmed !== true || externalReference.length < 8 || externalReference.length > 500) {
      return reply.code(400).send({ error: 'Confirm publication outside OperatorOS and enter the provider URL, post ID, or release reference.', code: 'BRANDFORGE_PUBLICATION_CONFIRMATION_REQUIRED' });
    }
    if (!/^[A-Za-z0-9:_.-]{8,180}$/.test(idempotencyKey)) {
      return reply.code(400).send({ error: 'Refresh this calendar item before recording publication.', code: 'BRANDFORGE_PUBLICATION_IDEMPOTENCY_INVALID' });
    }
    const [moduleRow] = await db.select({ id: modules.id }).from(modules).where(eq(modules.slug, 'brandforgeos')).limit(1);
    if (!moduleRow) return reply.code(503).send({ error: 'BrandForgeOS is not available.', code: 'BRANDFORGE_MODULE_UNAVAILABLE' });
    const operation = await beginIdempotentOperation({
      tenantId: ctx.tenantId,
      moduleId: moduleRow.id,
      scope: `brandforge-calendar-publication:${calendarItemId}`,
      idempotencyKey,
      request: { calendarItemId, expectedVersion, externalReference, externalPublicationConfirmed: true },
    });
    if (operation.state === 'replay') return reply.code(operation.responseStatus).send({ ...(operation.responseJson as Record<string, unknown>), replayed: true });
    if (operation.state === 'conflict') return reply.code(409).send({ error: 'That confirmation key was already used for different publication details.', code: 'BRANDFORGE_IDEMPOTENCY_CONFLICT' });
    if (operation.state === 'in_progress') return reply.code(409).send({ error: 'Publication confirmation is already being recorded.', code: 'BRANDFORGE_PUBLICATION_IN_PROGRESS' });
    try {
      const response = await db.transaction(async tx => {
        const currentResult = await tx.execute(sql`
          SELECT * FROM brandforge_calendar_items
          WHERE tenant_id=${ctx.tenantId} AND id=${calendarItemId} AND deleted_at IS NULL
          FOR UPDATE
        `);
        const current = currentResult.rows[0] as Record<string, any> | undefined;
        if (!current) throw Object.assign(new Error('Calendar item not found'), { code: 'BRANDFORGE_CALENDAR_ITEM_NOT_FOUND', statusCode: 404 });
        if (Number(current.version) !== expectedVersion) throw Object.assign(new Error('Calendar item changed'), { code: 'BRANDFORGE_VERSION_CONFLICT', statusCode: 409 });
        if (String(current.status) !== 'scheduled') throw Object.assign(new Error('Only scheduled content can be recorded as externally published'), { code: 'BRANDFORGE_STATUS_TRANSITION_INVALID', statusCode: 409 });
        const [updated] = await tx.update(brandforgeCalendarItems).set({
          status: 'published',
          version: sql`${brandforgeCalendarItems.version}+1`,
          updatedAt: new Date(),
        }).where(and(
          eq(brandforgeCalendarItems.tenantId, ctx.tenantId),
          eq(brandforgeCalendarItems.id, calendarItemId),
          eq(brandforgeCalendarItems.version, expectedVersion),
          isNull(brandforgeCalendarItems.deletedAt),
        )).returning();
        if (!updated) throw Object.assign(new Error('Calendar item changed'), { code: 'BRANDFORGE_VERSION_CONFLICT', statusCode: 409 });
        const recordedAt = new Date().toISOString();
        await appendActivityEvent({
          tenantId: ctx.tenantId,
          moduleId: moduleRow.id,
          actorUserId: user.id,
          objectType: 'brandforge_calendar_item',
          objectId: calendarItemId,
          eventType: 'external_publication.confirmed',
          summary: 'Recorded externally completed publication',
          metadata: { externalReference, recordedAt, externalActionPerformedByOperatorOS: false },
        }, tx);
        const payload = { calendarItem: calendarView(updated), externalPublication: { reference: externalReference, recordedAt, performedByOperatorOS: false }, replayed: false };
        await completeIdempotentOperation({
          tenantId: ctx.tenantId,
          id: operation.id,
          leaseExpiresAt: operation.leaseExpiresAt,
          responseStatus: 200,
          responseJson: payload,
        }, tx);
        return payload;
      });
      return response;
    } catch (error: any) {
      await failIdempotentOperation({ tenantId: ctx.tenantId, id: operation.id, leaseExpiresAt: operation.leaseExpiresAt }).catch(() => undefined);
      const status = Number(error?.statusCode ?? 503);
      if (status >= 400 && status < 500) {
        return reply.code(status).send({
          error: status === 404 ? 'Calendar item not found' : status === 409 ? 'This calendar item changed or is no longer scheduled. Refresh it before recording publication.' : 'Publication confirmation was not accepted.',
          code: String(error?.code ?? 'BRANDFORGE_PUBLICATION_FAILED'),
        });
      }
      throw error;
    }
  });

  app.delete(`${base}/calendar-items/:id`, { preHandler: writeGuards }, async (request, reply) => {
    const ctx = (request as any).tenantContext as Context;
    const [row] = await db.update(brandforgeCalendarItems).set({ deletedAt: new Date(), updatedAt: new Date(), version: sql`${brandforgeCalendarItems.version}+1` }).where(and(
      eq(brandforgeCalendarItems.tenantId, ctx.tenantId), eq(brandforgeCalendarItems.id, (request.params as any).id), isNull(brandforgeCalendarItems.deletedAt),
    )).returning();
    return row ? { ok: true } : notFound(reply, 'calendar item');
  });

  app.get(`${base}/generations`, { preHandler: readGuards }, async (request, reply) => {
    let query;
    try { query = parseListQuery(request.query); } catch (error) { if (validation(reply, error)) return; throw error; }
    const ctx = (request as any).tenantContext as Context;
    const rows = await db.select().from(brandforgeGenerations)
      .where(eq(brandforgeGenerations.tenantId, ctx.tenantId))
      .orderBy(desc(brandforgeGenerations.createdAt)).limit(query.limit);
    return { generations: rows.map(generationView), provider: getProviderInfo() };
  });

  app.post(`${base}/generations`, { preHandler: writeGuards }, async (request, reply) => {
    let input;
    try { input = parseGenerationInput(request.body); } catch (error) { if (validation(reply, error)) return; throw error; }
    const ctx = (request as any).tenantContext as Context;
    const user = (request as any).user as User;
    const invalid = await validateReferences(reply, ctx.tenantId, input);
    if (invalid) return invalid;
    const [moduleRow] = await db.select({ id: modules.id }).from(modules).where(eq(modules.slug, 'brandforgeos')).limit(1);
    if (!moduleRow) return reply.code(503).send({ error: 'BrandForgeOS module registry is unavailable', code: 'BRANDFORGE_MODULE_UNAVAILABLE' });
    const idempotency = await beginIdempotentOperation({
      tenantId: ctx.tenantId,
      moduleId: moduleRow.id,
      scope: 'brandforge-generation',
      idempotencyKey: input.idempotencyKey,
      request: input,
      leaseMs: 45_000,
    });
    if (idempotency.state === 'replay') return reply.code(idempotency.responseStatus).send(idempotency.responseJson);
    if (idempotency.state === 'conflict') return reply.code(409).send({ error: 'Idempotency key was used with different input', code: 'BRANDFORGE_IDEMPOTENCY_CONFLICT' });
    if (idempotency.state === 'in_progress') return reply.code(409).send({ error: 'Generation is already in progress', code: 'BRANDFORGE_GENERATION_IN_PROGRESS' });
    const hourAgo = new Date(Date.now() - 60 * 60_000);
    const [[userRate], [tenantRate]] = await Promise.all([
      db.select({ value: count() }).from(brandforgeGenerations).where(and(
        eq(brandforgeGenerations.tenantId, ctx.tenantId),
        eq(brandforgeGenerations.userId, user.id),
        gte(brandforgeGenerations.createdAt, hourAgo),
      )),
      db.select({ value: count() }).from(brandforgeGenerations).where(and(
        eq(brandforgeGenerations.tenantId, ctx.tenantId),
        gte(brandforgeGenerations.createdAt, hourAgo),
      )),
    ]);
    if ((userRate?.value ?? 0) >= 30 || (tenantRate?.value ?? 0) >= 200) {
      await failIdempotentOperation({ tenantId: ctx.tenantId, id: idempotency.id, leaseExpiresAt: idempotency.leaseExpiresAt });
      return reply.code(429).send({
        error: 'BrandForgeOS generation rate limit exceeded',
        code: 'BRANDFORGE_GENERATION_RATE_LIMITED',
      });
    }
    if (input.copyType && !BRANDFORGE_COPY_MODES.includes(input.copyType as any)) {
      await failIdempotentOperation({ tenantId: ctx.tenantId, id: idempotency.id, leaseExpiresAt: idempotency.leaseExpiresAt });
      return reply.code(400).send({ error: 'copyType is unsupported', code: 'BRANDFORGE_COPY_TYPE_INVALID' });
    }
    const acceptedTones = new Set([...BRANDFORGE_TONES.map(value => value.toLowerCase()), 'direct']);
    if (input.tone && !acceptedTones.has(input.tone.toLowerCase())) {
      await failIdempotentOperation({ tenantId: ctx.tenantId, id: idempotency.id, leaseExpiresAt: idempotency.leaseExpiresAt });
      return reply.code(400).send({ error: 'tone is unsupported', code: 'BRANDFORGE_TONE_INVALID' });
    }
    const credit = await reserveGenerationCredit(ctx.tenantId);
    if (credit.exhausted) {
      await failIdempotentOperation({ tenantId: ctx.tenantId, id: idempotency.id, leaseExpiresAt: idempotency.leaseExpiresAt });
      return reply.code(402).send({ error: 'BrandForgeOS generation credits are exhausted', code: 'BRANDFORGE_CREDITS_EXHAUSTED', limit: credit.limit });
    }
    try {
      const provider = getAiProvider();
      const response = await provider.complete({
        systemPrompt: `OPERATOROS_BRANDFORGE_V1\nGenerate bounded ${input.type} marketing material. Return only JSON. Do not claim facts, performance, endorsements, prices, or guarantees not supplied by the user.`,
        userPrompt: JSON.stringify({
          type: input.type,
          prompt: input.prompt,
          tone: input.tone,
          channel: input.channel,
           audience: input.audience,
          copyType: input.copyType,
          objective: input.objective,
          length: input.length,
          ctaStyle: input.ctaStyle,
          brandContext: input.brandId ? brandView((await scopedBrand(ctx.tenantId, input.brandId))!) : null,
          campaignContext: input.campaignId ? campaignView((await scopedCampaign(ctx.tenantId, input.campaignId))!) : null,
        }),
        maxTokens: 2_500,
        temperature: 0.5,
        responseFormat: 'json',
        timeoutMs: 30_000,
      });
      const output = parseProviderOutput(input.type, response.text);
      const result = await db.transaction(async (tx) => {
        const [generation] = await tx.insert(brandforgeGenerations).values({
          tenantId: ctx.tenantId,
          userId: user.id,
          brandId: input.brandId,
          campaignId: input.campaignId,
          generationType: input.type,
          idempotencyKey: input.idempotencyKey,
          inputHash: idempotency.requestSha256,
          inputSummary: { type: input.type, tone: input.tone ?? null, channel: input.channel ?? null, hasBrand: !!input.brandId, hasCampaign: !!input.campaignId },
          output,
          provider: response.provider,
          model: response.model,
          providerVersion: response.version,
          tokenCount: response.tokenCount,
          durationMs: response.durationMs,
        }).returning();
        await recordUsageEvent({
          tenantId: ctx.tenantId,
          moduleId: moduleRow.id,
          userId: user.id,
          operation: 'brandforge.generation',
          units: Math.max(1, response.tokenCount),
          unitKind: 'tokens',
          idempotencyKey: input.idempotencyKey,
          externalReference: generation!.id,
          metadata: { generationType: input.type, provider: response.provider, model: response.model },
        }, tx);
        await recordUsageEvent({
          tenantId: ctx.tenantId,
          moduleId: moduleRow.id,
          userId: user.id,
          operation: 'brandforge.generation.credit',
          units: 1,
          unitKind: 'credits',
          idempotencyKey: input.idempotencyKey,
          externalReference: generation!.id,
          metadata: { generationType: input.type },
        }, tx);
        await appendActivityEvent({
          tenantId: ctx.tenantId,
          moduleId: moduleRow.id,
          actorUserId: user.id,
          objectType: 'brandforge_generation',
          objectId: generation!.id,
          eventType: 'generated',
          summary: `Generated ${input.type.replaceAll('_', ' ')} material`,
          metadata: { generationType: input.type, provider: response.provider },
        }, tx);
        const safe = { generation: generationView(generation!) };
        await completeIdempotentOperation({
          tenantId: ctx.tenantId,
          id: idempotency.id,
          leaseExpiresAt: idempotency.leaseExpiresAt,
          responseStatus: 201,
          responseJson: safe,
        }, tx);
        return safe;
      });
      return reply.code(201).send(result);
    } catch (error) {
      if (credit.reserved) await releaseGenerationCredit(ctx.tenantId);
      await failIdempotentOperation({ tenantId: ctx.tenantId, id: idempotency.id, leaseExpiresAt: idempotency.leaseExpiresAt });
      if (error instanceof AiProviderDisabledError) {
        return reply.code(503).send({ error: 'AI generation is disabled until the OperatorOS provider is configured', code: error.code });
      }
      request.log.error({ err: error instanceof Error ? { name: error.name, code: (error as any).code } : 'unknown' }, 'BrandForgeOS generation failed');
      return reply.code(502).send({ error: 'AI generation failed safely', code: (error as any)?.code === 'BRANDFORGE_PROVIDER_OUTPUT_INVALID' ? 'BRANDFORGE_PROVIDER_OUTPUT_INVALID' : 'BRANDFORGE_PROVIDER_FAILED' });
    }
  });

  app.get(`${base}/export`, { preHandler: readGuards }, async (request, reply) => {
    const query = request.query as { format?: string };
    if (query.format !== 'json' && query.format !== 'csv') return reply.code(400).send({ error: 'format must be json or csv', code: 'BRANDFORGE_EXPORT_FORMAT_INVALID' });
    const ctx = (request as any).tenantContext as Context;
    const [brands, personas, campaigns, copyAssets, calendarItems] = await Promise.all([
      db.select().from(brandforgeBrands).where(active(brandforgeBrands, ctx.tenantId)).orderBy(brandforgeBrands.createdAt),
      db.select().from(brandforgePersonas).where(active(brandforgePersonas, ctx.tenantId)).orderBy(brandforgePersonas.createdAt),
      db.select().from(brandforgeCampaigns).where(active(brandforgeCampaigns, ctx.tenantId)).orderBy(brandforgeCampaigns.createdAt),
      db.select().from(brandforgeCopyAssets).where(active(brandforgeCopyAssets, ctx.tenantId)).orderBy(brandforgeCopyAssets.createdAt),
      db.select().from(brandforgeCalendarItems).where(active(brandforgeCalendarItems, ctx.tenantId)).orderBy(brandforgeCalendarItems.scheduledAt),
    ]);
    if (query.format === 'json') {
      return { exportedAt: new Date().toISOString(), brands: brands.map(brandView), personas: personas.map(personaView), campaigns: campaigns.map(campaignView), copyAssets: copyAssets.map(copyView), calendarItems: calendarItems.map(calendarView) };
    }
    const lines = [['entity', 'id', 'name_or_title', 'status', 'updated_at'].map(csvCell).join(',')];
    for (const row of brands) lines.push(['brand', row.id, row.name, '', row.updatedAt.toISOString()].map(csvCell).join(','));
    for (const row of personas) lines.push(['persona', row.id, row.name, '', row.updatedAt.toISOString()].map(csvCell).join(','));
    for (const row of campaigns) lines.push(['campaign', row.id, row.name, row.status, row.updatedAt.toISOString()].map(csvCell).join(','));
    for (const row of copyAssets) lines.push(['copy_asset', row.id, row.title, row.status, row.updatedAt.toISOString()].map(csvCell).join(','));
    for (const row of calendarItems) lines.push(['calendar_item', row.id, row.title, row.status, row.updatedAt.toISOString()].map(csvCell).join(','));
    reply.type('text/csv; charset=utf-8').header('Content-Disposition', 'attachment; filename="brandforgeos-export.csv"');
    return reply.send(`${lines.join('\r\n')}\r\n`);
  });
}
