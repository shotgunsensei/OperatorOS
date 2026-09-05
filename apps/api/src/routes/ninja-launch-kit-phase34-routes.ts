import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { getAiProvider, type AiProvider } from '../lib/ai-provider.js';
import {
  requireSuperAdmin,
  requireTenantAdmin,
  requireTenantModuleAccess,
  requireTenantModuleWriteAccess,
} from '../lib/tenant-auth.js';
import {
  appendActivityEvent,
  beginIdempotentOperation,
  completeIdempotentOperation,
  failIdempotentOperation,
  recordUsageEvent,
} from '../lib/shared-usage-activity.js';
import {
  consumeNinjaLaunchGeneration,
  releaseNinjaLaunchGeneration,
  resolveNinjaLaunchAccess,
} from '../lib/ninja-launch-kit-access.js';
import {
  NINJA_LAUNCH_PLAN_LIMITS,
  NINJA_LAUNCH_SOURCE_CATALOG,
  catalogForPlan,
  exportProductKit,
  generateDeterministicKit,
  generateVisualPromos,
  isCompleteContent,
  mayUseTemplate,
  sha256,
  templateBySlug,
  type NinjaLaunchBrand,
  type NinjaLaunchContent,
  type NinjaLaunchExportFormat,
  type NinjaLaunchInput,
  type NinjaLaunchPlan,
  type NinjaLaunchTone,
} from '../lib/ninja-launch-kit-phase34.js';

const MODULE_SLUG = 'ninja-launch-kit';
const base = '/v1/modules/ninja-launch-kit/product';
const readGuards = [requireTenantModuleAccess(MODULE_SLUG)];
const writeGuards = [...readGuards, requireTenantModuleWriteAccess];
const adminGuards = [...writeGuards, requireTenantAdmin];
type Row = Record<string, any>;
type Executor = Pick<typeof db, 'execute'>;

class InputError extends Error {
  readonly code: string;
  readonly statusCode: number;
  constructor(message: string, code = 'NINJA_LAUNCH_KIT_INPUT_INVALID', statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

const tenant = (request: FastifyRequest) => String((request as any).tenantContext.tenantId);
const actor = (request: FastifyRequest) => String((request as any).user.id);
const params = (request: FastifyRequest) => request.params as Row;
const camelKey = (value: string) => value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
const camel = (row: unknown) => Object.fromEntries(Object.entries(row as Row)
  .filter(([key]) => !['tenant_id', 'user_id', 'deleted_at', 'content_text'].includes(key))
  .map(([key, value]) => [camelKey(key), value]));

function body(request: FastifyRequest): Row {
  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) throw new InputError('A JSON object is required');
  const value = request.body as Row;
  for (const field of ['tenantId', 'tenant_id', 'userId', 'user_id', 'plan', 'entitlement', 'role']) {
    if (field in value) throw new InputError(`${field} is resolved from the trusted OperatorOS session`);
  }
  return value;
}

function text(value: unknown, field: string, min = 1, max = 5_000, optional = false): string | null {
  if (value === undefined || value === null || value === '') {
    if (optional) return null;
    throw new InputError(`${field} is required`);
  }
  if (typeof value !== 'string') throw new InputError(`${field} must be text`);
  const result = value.trim();
  if (result.length < min || result.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result)) {
    throw new InputError(`${field} must be ${min}-${max} valid characters`);
  }
  return result;
}

function identifier(request: FastifyRequest, key = 'id'): string {
  const value = String(params(request)[key] ?? '');
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)) throw new InputError(`${key} is invalid`);
  return value;
}

function optionalId(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  const result = text(value, field, 36, 36)!;
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(result)) throw new InputError(`${field} is invalid`);
  return result;
}

function idempotency(value: unknown): string {
  const result = text(value, 'idempotencyKey', 8, 160)!;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(result)) throw new InputError('idempotencyKey has invalid characters');
  return result;
}

function failure(reply: FastifyReply, error: unknown) {
  const value = error as any;
  if (value instanceof InputError || (value?.statusCode >= 400 && value?.statusCode < 500)) {
    return reply.code(value.statusCode ?? 400).send({ error: value.message, code: value.code ?? 'NINJA_LAUNCH_KIT_REQUEST_FAILED' });
  }
  throw error;
}

async function moduleId(executor: Executor = db): Promise<string> {
  const result = await executor.execute(sql`SELECT id FROM modules WHERE slug=${MODULE_SLUG} LIMIT 1`);
  if (!result.rows[0]) throw Object.assign(new Error('Deploy Ops module registry is unavailable'), { code: 'NINJA_LAUNCH_KIT_MODULE_UNAVAILABLE' });
  return String((result.rows[0] as Row).id);
}

async function activity(request: FastifyRequest, eventType: string, objectType: string, objectId: string, summary: string, metadata: Row = {}) {
  return appendActivityEvent({
    tenantId: tenant(request), moduleId: await moduleId(), actorUserId: actor(request), objectType, objectId, eventType, summary, metadata,
  });
}

function parseInput(value: Row): NinjaLaunchInput {
  const tone = String(value.tone ?? 'bold');
  if (!['bold', 'friendly', 'professional', 'playful', 'urgent', 'premium'].includes(tone)) throw new InputError('tone is invalid');
  const websiteUrl = text(value.websiteUrl, 'websiteUrl', 4, 2_000, true);
  if (websiteUrl) {
    let parsed: URL;
    try { parsed = new URL(websiteUrl); } catch { throw new InputError('websiteUrl must be a valid URL'); }
    if (!['https:', 'http:'].includes(parsed.protocol)) throw new InputError('websiteUrl must use HTTP or HTTPS');
  }
  return {
    businessName: text(value.businessName, 'businessName', 1, 160)!,
    businessType: text(value.businessType, 'businessType', 1, 160)!,
    targetCustomer: text(value.targetCustomer, 'targetCustomer', 3, 1_000)!,
    offer: text(value.offer, 'offer', 3, 1_000)!,
    price: text(value.price, 'price', 1, 120, true) ?? undefined,
    location: text(value.location, 'location', 1, 240, true) ?? undefined,
    tone: tone as NinjaLaunchTone,
    painPoint: text(value.painPoint, 'painPoint', 3, 1_000)!,
    desiredAction: text(value.desiredAction, 'desiredAction', 2, 240)!,
    promoDeadline: text(value.promoDeadline, 'promoDeadline', 1, 120, true) ?? undefined,
    websiteUrl: websiteUrl ?? undefined,
    socialLinks: text(value.socialLinks, 'socialLinks', 1, 2_000, true) ?? undefined,
    brandProfileId: optionalId(value.brandProfileId, 'brandProfileId'),
  };
}

function parseCreate(value: Row) {
  const generationMode = String(value.generationMode ?? 'auto');
  if (!['auto', 'ai', 'deterministic'].includes(generationMode)) throw new InputError('generationMode is invalid');
  return {
    title: text(value.title, 'title', 1, 200, true),
    templateSlug: text(value.templateSlug, 'templateSlug', 1, 120, true),
    input: parseInput((value.input ?? {}) as Row),
    generationMode: generationMode as 'auto' | 'ai' | 'deterministic',
    idempotencyKey: idempotency(value.idempotencyKey),
  };
}

function brandFrom(row: Row | null): NinjaLaunchBrand | null {
  return row ? {
    name: String(row.name), logoText: row.logo_text ? String(row.logo_text) : null,
    primaryColor: String(row.primary_color), accentColor: String(row.accent_color), voice: row.voice ? String(row.voice) : null,
  } : null;
}

async function loadBrand(tenantId: string, userId: string, id: string | null, executor: Executor = db): Promise<Row | null> {
  if (!id) return null;
  const result = await executor.execute(sql`SELECT * FROM launchkit_brand_profiles WHERE tenant_id=${tenantId} AND user_id=${userId} AND id=${id} AND deleted_at IS NULL LIMIT 1`);
  if (!result.rows[0]) throw new InputError('Brand profile was not found', 'NINJA_LAUNCH_KIT_BRAND_NOT_FOUND', 404);
  return result.rows[0] as Row;
}

async function loadKit(tenantId: string, userId: string, id: string, includeDeleted = false, executor: Executor = db): Promise<Row> {
  const deleted = includeDeleted ? sql`` : sql`AND deleted_at IS NULL`;
  const result = await executor.execute(sql`SELECT * FROM launchkit_product_kits WHERE tenant_id=${tenantId} AND user_id=${userId} AND id=${id} ${deleted} LIMIT 1`);
  if (!result.rows[0]) throw new InputError('Launch kit was not found', 'NINJA_LAUNCH_KIT_NOT_FOUND', 404);
  return result.rows[0] as Row;
}

function mayReviewTenantKit(request: FastifyRequest): boolean {
  const context = (request as any).tenantContext as { role?: string; viaPlatformRole?: boolean } | undefined;
  const moduleAccessLevel = String((request as any).tenantModuleAccessLevel ?? 'none');
  return context?.viaPlatformRole === true
    || context?.role === 'owner'
    || context?.role === 'admin'
    || moduleAccessLevel === 'manager';
}

function mayWriteOwnedKit(request: FastifyRequest): boolean {
  const context = (request as any).tenantContext as { membershipRole?: string | null; viaPlatformRole?: boolean } | undefined;
  const moduleAccessLevel = String((request as any).tenantModuleAccessLevel ?? 'none');
  if (context?.membershipRole === 'viewer' && context.viaPlatformRole !== true) return false;
  return moduleAccessLevel === 'user' || moduleAccessLevel === 'manager';
}

/** Exact shared-workflow links may be reviewed by tenant/module managers. */
async function loadReviewableKit(request: FastifyRequest, id: string, executor: Executor = db): Promise<Row> {
  const tenantId = tenant(request);
  const userId = actor(request);
  const tenantWide = mayReviewTenantKit(request);
  const result = await executor.execute(sql`
    SELECT * FROM launchkit_product_kits
    WHERE tenant_id=${tenantId} AND id=${id} AND deleted_at IS NULL
      AND (${tenantWide} OR user_id=${userId})
    LIMIT 1
  `);
  if (!result.rows[0]) throw new InputError('Launch kit was not found', 'NINJA_LAUNCH_KIT_NOT_FOUND', 404);
  return result.rows[0] as Row;
}

function kitResponse(row: Row): Row {
  return {
    ...camel(row),
    input: row.input_json,
    content: row.content_json,
    visualPromos: row.visual_promo_json,
    provenance: row.provenance_json,
  };
}

export async function resolveNinjaLaunchContent(
  input: NinjaLaunchInput,
  plan: NinjaLaunchPlan,
  mode: 'auto' | 'ai' | 'deterministic',
  provider: AiProvider = getAiProvider(),
) {
  const deterministic = generateDeterministicKit(input);
  if (plan === 'free' || mode === 'deterministic') {
    return { content: deterministic, generatorMode: 'deterministic' as const, provider: 'deterministic', model: 'ninja-launch-kit-v1', tokenCount: 0, fallbackReason: null };
  }
  try {
    const completion = await provider.complete({
      systemPrompt: [
        'OPERATOROS_NINJA_LAUNCH_KIT_COMPLETE_V1',
        'Refine the supplied deterministic launch kit without adding unverifiable claims.',
        'Return only JSON matching every supplied content key. Preserve all arrays as non-empty arrays.',
        'Do not include secrets, personal data, billing assertions, publication claims, or provider actions.',
      ].join('\n'),
      userPrompt: JSON.stringify({ input, deterministic }),
      responseFormat: 'json', temperature: 0.25, maxTokens: 8_000, timeoutMs: 30_000,
    });
    const parsed = JSON.parse(completion.text) as unknown;
    if (!isCompleteContent(parsed)) throw new Error('AI response failed the complete launch-kit schema');
    return { content: parsed, generatorMode: 'ai' as const, provider: completion.provider, model: completion.model, tokenCount: completion.tokenCount, fallbackReason: null };
  } catch (error) {
    return {
      content: deterministic,
      generatorMode: 'fallback' as const,
      provider: 'deterministic',
      model: 'ninja-launch-kit-v1',
      tokenCount: 0,
      fallbackReason: error instanceof Error ? error.message.slice(0, 240) : 'AI refinement failed validation',
    };
  }
}

async function insertRevision(executor: Executor, row: Row, userId: string, reason: string) {
  await executor.execute(sql`
    INSERT INTO launchkit_product_revisions(tenant_id,kit_id,user_id,revision,reason,input_json,content_json,visual_promo_json,provenance_json,content_sha256)
    VALUES (${row.tenant_id},${row.id},${userId},${row.version},${reason},${JSON.stringify(row.input_json)}::jsonb,${JSON.stringify(row.content_json)}::jsonb,
      ${JSON.stringify(row.visual_promo_json)}::jsonb,${JSON.stringify(row.provenance_json)}::jsonb,${row.content_sha256})
  `);
}

export async function registerNinjaLaunchKitPhase34Routes(app: FastifyInstance): Promise<void> {
  app.get(`${base}/catalog/templates`, { preHandler: readGuards }, async (request) => {
    const access = await resolveNinjaLaunchAccess(actor(request), tenant(request));
    return { counts: NINJA_LAUNCH_SOURCE_CATALOG.counts, categories: NINJA_LAUNCH_SOURCE_CATALOG.categories, templates: catalogForPlan(access.plan), access };
  });

  app.get(`${base}/catalog/templates/:slug`, { preHandler: readGuards }, async (request, reply) => {
    const template = templateBySlug(String(params(request).slug ?? ''));
    if (!template) return reply.code(404).send({ error: 'Template not found', code: 'NINJA_LAUNCH_KIT_TEMPLATE_NOT_FOUND' });
    const access = await resolveNinjaLaunchAccess(actor(request), tenant(request));
    const locked = !mayUseTemplate(access.plan, template.tier);
    return { template: { ...template, locked, prefill: locked ? undefined : template.prefill }, access };
  });

  app.post(`${base}/kits/preview`, { preHandler: readGuards }, async (request, reply) => {
    try {
      const value = body(request);
      const input = parseInput((value.input ?? {}) as Row);
      const access = await resolveNinjaLaunchAccess(actor(request), tenant(request));
      const brand = brandFrom(await loadBrand(tenant(request), actor(request), input.brandProfileId ?? null));
      const content = generateDeterministicKit(input);
      return { title: text(value.title, 'title', 1, 200, true) ?? `${input.businessName} Launch Kit`, input, content, visualPromos: generateVisualPromos(input, content, access.plan, brand), access, preview: true };
    } catch (error) { return failure(reply, error); }
  });

  app.get(`${base}/overview`, { preHandler: readGuards }, async (request) => {
    const [metrics, recent, exports, usage, brands, access] = await Promise.all([
      db.execute(sql`SELECT count(*)::int AS kits,count(*) FILTER (WHERE status='archived')::int AS archived,count(*) FILTER (WHERE generator_mode='ai')::int AS ai_refined FROM launchkit_product_kits WHERE tenant_id=${tenant(request)} AND user_id=${actor(request)} AND deleted_at IS NULL`),
      db.execute(sql`SELECT * FROM launchkit_product_kits WHERE tenant_id=${tenant(request)} AND user_id=${actor(request)} AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 20`),
      db.execute(sql`SELECT id,kit_id,format,file_name,mime_type,content_sha256,size_bytes,watermarked,white_label,created_at FROM launchkit_product_exports WHERE tenant_id=${tenant(request)} AND user_id=${actor(request)} ORDER BY created_at DESC LIMIT 20`),
      db.execute(sql`SELECT generation_count FROM launchkit_usage_counters WHERE tenant_id=${tenant(request)} AND user_id=${actor(request)} AND period_start=date_trunc('month',CURRENT_DATE)::date`),
      db.execute(sql`SELECT * FROM launchkit_brand_profiles WHERE tenant_id=${tenant(request)} AND user_id=${actor(request)} AND deleted_at IS NULL ORDER BY updated_at DESC`),
      resolveNinjaLaunchAccess(actor(request), tenant(request)),
    ]);
    return {
      metrics: camel(metrics.rows[0] ?? { kits: 0, archived: 0, ai_refined: 0 }),
      kits: recent.rows.map((row) => kitResponse(row as Row)), exports: exports.rows.map(camel), brands: brands.rows.map(camel),
      usage: { generationCount: Number((usage.rows[0] as Row | undefined)?.generation_count ?? 0) }, access,
      sourceCounts: NINJA_LAUNCH_SOURCE_CATALOG.counts,
    };
  });

  app.get(`${base}/kits`, { preHandler: readGuards }, async (request) => {
    const query = request.query as Row;
    const includeDeleted = query.deleted === 'true';
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const rows = await db.execute(sql`
      SELECT * FROM launchkit_product_kits WHERE tenant_id=${tenant(request)} AND user_id=${actor(request)}
        ${includeDeleted ? sql`AND deleted_at IS NOT NULL` : sql`AND deleted_at IS NULL`}
        ${search ? sql`AND (title ILIKE ${`%${search}%`} OR business_type ILIKE ${`%${search}%`})` : sql``}
      ORDER BY updated_at DESC LIMIT 100
    `);
    return { kits: rows.rows.map((row) => kitResponse(row as Row)) };
  });

  app.get(`${base}/kits/:id`, { preHandler: readGuards }, async (request, reply) => {
    try {
      const row = await loadReviewableKit(request, identifier(request));
      const ownedByCurrentUser = String(row.user_id) === actor(request);
      const [history, exports] = await Promise.all([
        db.execute(sql`SELECT id,revision,reason,content_sha256,provenance_json,created_at FROM launchkit_product_revisions WHERE tenant_id=${tenant(request)} AND kit_id=${row.id} ORDER BY revision DESC`),
        db.execute(sql`SELECT id,format,file_name,mime_type,content_sha256,size_bytes,watermarked,white_label,created_at FROM launchkit_product_exports WHERE tenant_id=${tenant(request)} AND kit_id=${row.id} ORDER BY created_at DESC`),
      ]);
      return {
        kit: kitResponse(row),
        history: history.rows.map(camel),
        exports: exports.rows.map(camel),
        capabilities: {
          ownedByCurrentUser,
          canManage: ownedByCurrentUser && mayWriteOwnedKit(request),
        },
      };
    } catch (error) { return failure(reply, error); }
  });

  app.post(`${base}/kits`, { preHandler: writeGuards }, async (request, reply) => {
    let operation: Awaited<ReturnType<typeof beginIdempotentOperation>> | null = null;
    let usageConsumed = false;
    try {
      const parsed = parseCreate(body(request));
      const tenantId = tenant(request); const userId = actor(request);
      const access = await resolveNinjaLaunchAccess(userId, tenantId);
      const template = parsed.templateSlug ? templateBySlug(parsed.templateSlug) : null;
      if (parsed.templateSlug && !template) throw new InputError('Template was not found', 'NINJA_LAUNCH_KIT_TEMPLATE_NOT_FOUND', 404);
      if (template && !mayUseTemplate(access.plan, template.tier)) throw new InputError('This template requires a higher OperatorOS entitlement', 'NINJA_LAUNCH_KIT_TEMPLATE_NOT_ENTITLED', 403);
      const brandRow = await loadBrand(tenantId, userId, parsed.input.brandProfileId ?? null);
      const modId = await moduleId();
      const requestHash = { title: parsed.title, templateSlug: parsed.templateSlug, input: parsed.input, generationMode: parsed.generationMode, plan: access.plan };
      operation = await beginIdempotentOperation({ tenantId, moduleId: modId, scope: 'launchkit.phase34.create', idempotencyKey: parsed.idempotencyKey, request: requestHash, leaseMs: 120_000 });
      if (operation.state === 'replay') return reply.code(operation.responseStatus).send({ ...(operation.responseJson as Row), replayed: true });
      if (operation.state === 'conflict') return reply.code(409).send({ error: 'Idempotency key was reused with a different launch brief', code: 'IDEMPOTENCY_CONFLICT' });
      if (operation.state === 'in_progress') return reply.code(409).send({ error: 'Launch kit generation is already processing', code: 'IDEMPOTENCY_IN_PROGRESS' });
      await consumeNinjaLaunchGeneration({ tenantId, userId, limit: access.limits.kitsPerMonth });
      usageConsumed = true;
      const generated = await resolveNinjaLaunchContent(parsed.input, access.plan, parsed.generationMode);
      const visuals = generateVisualPromos(parsed.input, generated.content, access.plan, brandFrom(brandRow));
      const provenance = { source: generated.generatorMode, provider: generated.provider, model: generated.model, fallbackReason: generated.fallbackReason, templateSlug: parsed.templateSlug, sourceCatalogHashes: NINJA_LAUNCH_SOURCE_CATALOG.source };
      const contentHash = sha256(JSON.stringify({ input: parsed.input, content: generated.content, visuals }));
      const acquired = operation;
      const response = await db.transaction(async (tx) => {
        const inserted = await tx.execute(sql`
          INSERT INTO launchkit_product_kits(tenant_id,user_id,brand_profile_id,template_slug,title,business_type,input_json,content_json,visual_promo_json,generator_mode,provider,provider_model,provenance_json,content_sha256,watermarked,white_label,idempotency_key)
          VALUES (${tenantId},${userId},${parsed.input.brandProfileId ?? null},${parsed.templateSlug},${parsed.title ?? `${parsed.input.businessName} Launch Kit`},${parsed.input.businessType},
            ${JSON.stringify(parsed.input)}::jsonb,${JSON.stringify(generated.content)}::jsonb,${JSON.stringify(visuals)}::jsonb,${generated.generatorMode},${generated.provider},${generated.model},
            ${JSON.stringify(provenance)}::jsonb,${contentHash},${access.limits.watermarked},${access.limits.whiteLabel},${parsed.idempotencyKey}) RETURNING *
        `);
        const row = inserted.rows[0] as Row;
        await insertRevision(tx, row, userId, 'created');
        await recordUsageEvent({ tenantId, moduleId: modId, userId, operation: 'launchkit.complete_generation', units: 1, unitKind: 'generation', idempotencyKey: `launchkit-phase34:${row.id}`, externalReference: row.id, metadata: { generatorMode: generated.generatorMode, tokenCount: generated.tokenCount, plan: access.plan } }, tx);
        const payload = { kit: kitResponse(row), access, replayed: false };
        await completeIdempotentOperation({ tenantId, id: acquired.id, leaseExpiresAt: acquired.leaseExpiresAt, responseStatus: 201, responseJson: payload }, tx);
        return payload;
      });
      await activity(request, 'launchkit.kit.created', 'launchkit_product_kit', response.kit.id, 'Created a complete launch kit.', { plan: access.plan, generatorMode: response.kit.generatorMode, templateSlug: parsed.templateSlug });
      return reply.code(201).send(response);
    } catch (error) {
      if (usageConsumed) await releaseNinjaLaunchGeneration({ tenantId: tenant(request), userId: actor(request) }).catch(() => undefined);
      if (operation?.state === 'acquired') await failIdempotentOperation({ tenantId: tenant(request), id: operation.id, leaseExpiresAt: operation.leaseExpiresAt }).catch(() => undefined);
      return failure(reply, error);
    }
  });

  app.patch(`${base}/kits/:id`, { preHandler: writeGuards }, async (request, reply) => {
    try {
      const current = await loadKit(tenant(request), actor(request), identifier(request));
      const value = body(request);
      const expectedVersion = Number(value.expectedVersion);
      if (!Number.isInteger(expectedVersion) || expectedVersion !== current.version) throw new InputError('Launch kit version is stale', 'NINJA_LAUNCH_KIT_VERSION_CONFLICT', 409);
      const nextInput = value.input ? parseInput(value.input as Row) : current.input_json as NinjaLaunchInput;
      const brandRow = await loadBrand(tenant(request), actor(request), nextInput.brandProfileId ?? null);
      const access = await resolveNinjaLaunchAccess(actor(request), tenant(request));
      const content = generateDeterministicKit(nextInput);
      const visuals = generateVisualPromos(nextInput, content, access.plan, brandFrom(brandRow));
      const provenance = { source: 'deterministic', provider: 'deterministic', model: 'ninja-launch-kit-v1', editedFromVersion: current.version };
      const contentHash = sha256(JSON.stringify({ input: nextInput, content, visuals }));
      const updated = await db.execute(sql`
        UPDATE launchkit_product_kits SET title=${text(value.title, 'title', 1, 200, true) ?? current.title},business_type=${nextInput.businessType},brand_profile_id=${nextInput.brandProfileId ?? null},
          input_json=${JSON.stringify(nextInput)}::jsonb,content_json=${JSON.stringify(content)}::jsonb,visual_promo_json=${JSON.stringify(visuals)}::jsonb,
          generator_mode='deterministic',provider='deterministic',provider_model='ninja-launch-kit-v1',provenance_json=${JSON.stringify(provenance)}::jsonb,
          content_sha256=${contentHash},version=version+1,updated_at=NOW()
        WHERE tenant_id=${tenant(request)} AND user_id=${actor(request)} AND id=${current.id} AND version=${expectedVersion} AND deleted_at IS NULL RETURNING *
      `);
      if (!updated.rows[0]) throw new InputError('Launch kit version is stale', 'NINJA_LAUNCH_KIT_VERSION_CONFLICT', 409);
      await insertRevision(db, updated.rows[0] as Row, actor(request), 'edited');
      await activity(request, 'launchkit.kit.updated', 'launchkit_product_kit', current.id, 'Updated launch kit content.');
      return { kit: kitResponse(updated.rows[0] as Row) };
    } catch (error) { return failure(reply, error); }
  });

  app.post(`${base}/kits/:id/duplicate`, { preHandler: writeGuards }, async (request, reply) => {
    try {
      const current = await loadKit(tenant(request), actor(request), identifier(request));
      const value = body(request); const key = idempotency(value.idempotencyKey);
      const duplicateTitle = text(value.title, 'title', 1, 200, true) ?? `${current.title} Copy`;
      const existing = await db.execute(sql`SELECT * FROM launchkit_product_kits WHERE tenant_id=${tenant(request)} AND user_id=${actor(request)} AND idempotency_key=${key} LIMIT 1`);
      if (existing.rows[0]) {
        const row = existing.rows[0] as Row;
        if (row.source_kit_id !== current.id || row.title !== duplicateTitle) throw new InputError('Duplicate idempotency key was reused for a different operation', 'IDEMPOTENCY_CONFLICT', 409);
        return { kit: kitResponse(row), replayed: true };
      }
      const access = await resolveNinjaLaunchAccess(actor(request), tenant(request));
      const inserted = await db.execute(sql`
          INSERT INTO launchkit_product_kits(tenant_id,user_id,brand_profile_id,source_kit_id,template_slug,title,business_type,input_json,content_json,visual_promo_json,generator_mode,provider,provider_model,provenance_json,content_sha256,watermarked,white_label,idempotency_key)
          VALUES (${tenant(request)},${actor(request)},${current.brand_profile_id},${current.id},${current.template_slug},${duplicateTitle},${current.business_type},
            ${JSON.stringify(current.input_json)}::jsonb,${JSON.stringify(current.content_json)}::jsonb,${JSON.stringify(current.visual_promo_json)}::jsonb,'deterministic','deterministic','ninja-launch-kit-v1',
            ${JSON.stringify({ source: 'duplicate', sourceKitId: current.id })}::jsonb,${current.content_sha256},${access.limits.watermarked},${access.limits.whiteLabel},${key})
          ON CONFLICT (tenant_id,user_id,idempotency_key) DO NOTHING RETURNING *
      `);
      if (!inserted.rows[0]) {
        const replay = await db.execute(sql`SELECT * FROM launchkit_product_kits WHERE tenant_id=${tenant(request)} AND user_id=${actor(request)} AND idempotency_key=${key} LIMIT 1`);
        const row = replay.rows[0] as Row | undefined;
        if (!row || row.source_kit_id !== current.id || row.title !== duplicateTitle) throw new InputError('Duplicate idempotency key was reused for a different operation', 'IDEMPOTENCY_CONFLICT', 409);
        return { kit: kitResponse(row), replayed: true };
      }
      const row = inserted.rows[0] as Row; await insertRevision(db, row, actor(request), 'duplicated');
      await activity(request, 'launchkit.kit.duplicated', 'launchkit_product_kit', row.id, 'Duplicated a launch kit.', { sourceKitId: current.id });
      return reply.code(201).send({ kit: kitResponse(row), replayed: false });
    } catch (error) { return failure(reply, error); }
  });

  app.post(`${base}/kits/:id/regenerate`, { preHandler: writeGuards }, async (request, reply) => {
    try {
      const current = await loadKit(tenant(request), actor(request), identifier(request));
      const value = body(request); const access = await resolveNinjaLaunchAccess(actor(request), tenant(request));
      const expectedVersion = Number(value.expectedVersion);
      if (expectedVersion !== current.version) throw new InputError('Launch kit version is stale', 'NINJA_LAUNCH_KIT_VERSION_CONFLICT', 409);
      const mode = String(value.generationMode ?? 'auto');
      if (!['auto', 'ai', 'deterministic'].includes(mode)) throw new InputError('generationMode is invalid');
      await consumeNinjaLaunchGeneration({ tenantId: tenant(request), userId: actor(request), limit: access.limits.kitsPerMonth });
      try {
        const input = current.input_json as NinjaLaunchInput;
        const generated = await resolveNinjaLaunchContent(input, access.plan, mode as 'auto' | 'ai' | 'deterministic');
        const visuals = generateVisualPromos(input, generated.content, access.plan, brandFrom(await loadBrand(tenant(request), actor(request), input.brandProfileId ?? null)));
        const provenance = { source: generated.generatorMode, provider: generated.provider, model: generated.model, fallbackReason: generated.fallbackReason, regeneratedFromVersion: current.version };
        const contentHash = sha256(JSON.stringify({ input, content: generated.content, visuals }));
        const updated = await db.execute(sql`
          UPDATE launchkit_product_kits SET content_json=${JSON.stringify(generated.content)}::jsonb,visual_promo_json=${JSON.stringify(visuals)}::jsonb,
            generator_mode=${generated.generatorMode},provider=${generated.provider},provider_model=${generated.model},provenance_json=${JSON.stringify(provenance)}::jsonb,
            content_sha256=${contentHash},watermarked=${access.limits.watermarked},white_label=${access.limits.whiteLabel},version=version+1,updated_at=NOW()
          WHERE tenant_id=${tenant(request)} AND user_id=${actor(request)} AND id=${current.id} AND version=${expectedVersion} AND deleted_at IS NULL RETURNING *
        `);
        if (!updated.rows[0]) throw new InputError('Launch kit version is stale', 'NINJA_LAUNCH_KIT_VERSION_CONFLICT', 409);
        await insertRevision(db, updated.rows[0] as Row, actor(request), 'regenerated');
        await activity(request, 'launchkit.kit.regenerated', 'launchkit_product_kit', current.id, 'Regenerated launch kit content.', { generatorMode: generated.generatorMode });
        return { kit: kitResponse(updated.rows[0] as Row) };
      } catch (error) { await releaseNinjaLaunchGeneration({ tenantId: tenant(request), userId: actor(request) }); throw error; }
    } catch (error) { return failure(reply, error); }
  });

  for (const action of ['archive', 'restore'] as const) {
    app.post(`${base}/kits/:id/${action}`, { preHandler: writeGuards }, async (request, reply) => {
      try {
        const current = await loadKit(tenant(request), actor(request), identifier(request));
        const updated = await db.execute(sql`UPDATE launchkit_product_kits SET status=${action === 'archive' ? 'archived' : 'active'},archived_at=${action === 'archive' ? sql`NOW()` : sql`NULL`},version=version+1,updated_at=NOW() WHERE tenant_id=${tenant(request)} AND user_id=${actor(request)} AND id=${current.id} RETURNING *`);
        await activity(request, `launchkit.kit.${action}d`, 'launchkit_product_kit', current.id, `${action === 'archive' ? 'Archived' : 'Restored'} launch kit.`);
        return { kit: kitResponse(updated.rows[0] as Row) };
      } catch (error) { return failure(reply, error); }
    });
  }

  app.delete(`${base}/kits/:id`, { preHandler: writeGuards }, async (request, reply) => {
    try {
      const current = await loadKit(tenant(request), actor(request), identifier(request));
      await db.execute(sql`UPDATE launchkit_product_kits SET deleted_at=NOW(),version=version+1,updated_at=NOW() WHERE tenant_id=${tenant(request)} AND user_id=${actor(request)} AND id=${current.id}`);
      await activity(request, 'launchkit.kit.deleted', 'launchkit_product_kit', current.id, 'Soft-deleted launch kit; undo remains available.');
      return reply.code(204).send();
    } catch (error) { return failure(reply, error); }
  });

  app.post(`${base}/kits/:id/undo-delete`, { preHandler: writeGuards }, async (request, reply) => {
    try {
      const current = await loadKit(tenant(request), actor(request), identifier(request), true);
      if (!current.deleted_at) return { kit: kitResponse(current) };
      const restored = await db.execute(sql`UPDATE launchkit_product_kits SET deleted_at=NULL,version=version+1,updated_at=NOW() WHERE tenant_id=${tenant(request)} AND user_id=${actor(request)} AND id=${current.id} RETURNING *`);
      await insertRevision(db, restored.rows[0] as Row, actor(request), 'restored');
      await activity(request, 'launchkit.kit.undo_delete', 'launchkit_product_kit', current.id, 'Restored a soft-deleted launch kit.');
      return { kit: kitResponse(restored.rows[0] as Row) };
    } catch (error) { return failure(reply, error); }
  });

  app.get(`${base}/brands`, { preHandler: readGuards }, async (request) => {
    const rows = await db.execute(sql`SELECT * FROM launchkit_brand_profiles WHERE tenant_id=${tenant(request)} AND user_id=${actor(request)} AND deleted_at IS NULL ORDER BY updated_at DESC`);
    return { brands: rows.rows.map(camel), access: await resolveNinjaLaunchAccess(actor(request), tenant(request)) };
  });

  app.post(`${base}/brands`, { preHandler: writeGuards }, async (request, reply) => {
    try {
      const value = body(request); const access = await resolveNinjaLaunchAccess(actor(request), tenant(request));
      if (access.limits.brandProfiles === 0) throw new InputError('Brand profiles require a Pro or Agency OperatorOS entitlement', 'NINJA_LAUNCH_KIT_BRAND_NOT_ENTITLED', 403);
      if (access.limits.brandProfiles !== null) {
        const count = await db.execute(sql`SELECT count(*)::int AS count FROM launchkit_brand_profiles WHERE tenant_id=${tenant(request)} AND user_id=${actor(request)} AND deleted_at IS NULL`);
        if (Number((count.rows[0] as Row).count) >= access.limits.brandProfiles) throw new InputError('Brand profile limit reached for this OperatorOS entitlement', 'NINJA_LAUNCH_KIT_BRAND_LIMIT_REACHED', 402);
      }
      const primary = text(value.primaryColor, 'primaryColor', 7, 7, true) ?? '#111827';
      const accent = text(value.accentColor, 'accentColor', 7, 7, true) ?? '#DC2626';
      if (!/^#[0-9A-Fa-f]{6}$/.test(primary) || !/^#[0-9A-Fa-f]{6}$/.test(accent)) throw new InputError('Brand colors must be six-digit hex colors');
      const inserted = await db.execute(sql`INSERT INTO launchkit_brand_profiles(tenant_id,user_id,name,logo_text,primary_color,accent_color,voice,contact_json) VALUES (${tenant(request)},${actor(request)},${text(value.name, 'name', 1, 160)},${text(value.logoText, 'logoText', 1, 160, true)},${primary},${accent},${text(value.voice, 'voice', 1, 2_000, true)},${JSON.stringify(value.contact ?? {})}::jsonb) RETURNING *`);
      const row = camel(inserted.rows[0]); await activity(request, 'launchkit.brand.created', 'launchkit_brand_profile', row.id, 'Created a reusable launch brand profile.');
      return reply.code(201).send({ brand: row });
    } catch (error) { return failure(reply, error); }
  });

  app.patch(`${base}/brands/:id`, { preHandler: writeGuards }, async (request, reply) => {
    try {
      const current = await loadBrand(tenant(request), actor(request), identifier(request));
      if (!current) throw new InputError('Brand profile was not found', 'NINJA_LAUNCH_KIT_BRAND_NOT_FOUND', 404);
      const value = body(request); const expectedVersion = Number(value.expectedVersion);
      if (expectedVersion !== current.version) throw new InputError('Brand profile version is stale', 'NINJA_LAUNCH_KIT_VERSION_CONFLICT', 409);
      const primary = text(value.primaryColor, 'primaryColor', 7, 7, true) ?? current.primary_color;
      const accent = text(value.accentColor, 'accentColor', 7, 7, true) ?? current.accent_color;
      if (!/^#[0-9A-Fa-f]{6}$/.test(primary) || !/^#[0-9A-Fa-f]{6}$/.test(accent)) throw new InputError('Brand colors must be six-digit hex colors');
      const updated = await db.execute(sql`UPDATE launchkit_brand_profiles SET name=${text(value.name, 'name', 1, 160, true) ?? current.name},logo_text=${text(value.logoText, 'logoText', 1, 160, true) ?? current.logo_text},primary_color=${primary},accent_color=${accent},voice=${text(value.voice, 'voice', 1, 2_000, true) ?? current.voice},version=version+1,updated_at=NOW() WHERE tenant_id=${tenant(request)} AND user_id=${actor(request)} AND id=${current.id} AND version=${expectedVersion} RETURNING *`);
      if (!updated.rows[0]) throw new InputError('Brand profile version is stale', 'NINJA_LAUNCH_KIT_VERSION_CONFLICT', 409);
      return { brand: camel(updated.rows[0]) };
    } catch (error) { return failure(reply, error); }
  });

  app.delete(`${base}/brands/:id`, { preHandler: writeGuards }, async (request, reply) => {
    try {
      const current = await loadBrand(tenant(request), actor(request), identifier(request));
      if (!current) throw new InputError('Brand profile was not found', 'NINJA_LAUNCH_KIT_BRAND_NOT_FOUND', 404);
      await db.execute(sql`UPDATE launchkit_brand_profiles SET deleted_at=NOW(),version=version+1,updated_at=NOW() WHERE tenant_id=${tenant(request)} AND user_id=${actor(request)} AND id=${current.id}`);
      return reply.code(204).send();
    } catch (error) { return failure(reply, error); }
  });

  app.post(`${base}/brands/:id/restore`, { preHandler: writeGuards }, async (request, reply) => {
    try {
      const id = identifier(request); const access = await resolveNinjaLaunchAccess(actor(request), tenant(request));
      if (access.limits.brandProfiles === 0) throw new InputError('Brand profiles require a Pro or Agency OperatorOS entitlement', 'NINJA_LAUNCH_KIT_BRAND_NOT_ENTITLED', 403);
      if (access.limits.brandProfiles !== null) {
        const count = await db.execute(sql`SELECT count(*)::int AS count FROM launchkit_brand_profiles WHERE tenant_id=${tenant(request)} AND user_id=${actor(request)} AND deleted_at IS NULL`);
        if (Number((count.rows[0] as Row).count) >= access.limits.brandProfiles) throw new InputError('Brand profile limit reached for this OperatorOS entitlement', 'NINJA_LAUNCH_KIT_BRAND_LIMIT_REACHED', 402);
      }
      const restored = await db.execute(sql`UPDATE launchkit_brand_profiles SET deleted_at=NULL,version=version+1,updated_at=NOW() WHERE tenant_id=${tenant(request)} AND user_id=${actor(request)} AND id=${id} AND deleted_at IS NOT NULL RETURNING *`);
      if (!restored.rows[0]) throw new InputError('Deleted brand profile was not found', 'NINJA_LAUNCH_KIT_BRAND_NOT_FOUND', 404);
      return { brand: camel(restored.rows[0]) };
    } catch (error) { return failure(reply, error); }
  });

  app.get(`${base}/exports`, { preHandler: readGuards }, async (request) => {
    const rows = await db.execute(sql`SELECT id,kit_id,format,file_name,mime_type,content_sha256,size_bytes,watermarked,white_label,created_at FROM launchkit_product_exports WHERE tenant_id=${tenant(request)} AND user_id=${actor(request)} ORDER BY created_at DESC LIMIT 100`);
    return { exports: rows.rows.map(camel) };
  });

  app.post(`${base}/kits/:id/exports`, { preHandler: writeGuards }, async (request, reply) => {
    try {
      const current = await loadKit(tenant(request), actor(request), identifier(request)); const value = body(request);
      const format = String(value.format ?? 'txt') as NinjaLaunchExportFormat;
      if (!['txt', 'markdown', 'json'].includes(format)) throw new InputError('Export format is invalid');
      const access = await resolveNinjaLaunchAccess(actor(request), tenant(request));
      if (!(access.limits.exportFormats as readonly string[]).includes(format)) throw new InputError(`${format} export requires a higher OperatorOS entitlement`, 'NINJA_LAUNCH_KIT_EXPORT_NOT_ENTITLED', 403);
      const key = idempotency(value.idempotencyKey);
      const existing = await db.execute(sql`SELECT * FROM launchkit_product_exports WHERE tenant_id=${tenant(request)} AND user_id=${actor(request)} AND idempotency_key=${key} LIMIT 1`);
      if (existing.rows[0]) {
        const row = existing.rows[0] as Row;
        if (row.kit_id !== current.id || row.format !== format) throw new InputError('Export idempotency key was reused for a different export', 'IDEMPOTENCY_CONFLICT', 409);
        return { export: camel(row), content: row.content_text, replayed: true };
      }
      const rendered = exportProductKit({ title: current.title, input: current.input_json, content: current.content_json, visuals: current.visual_promo_json, plan: access.plan, format });
      const fileName = `ninja-launch-kit-${current.id}.${rendered.extension}`;
      const inserted = await db.execute(sql`INSERT INTO launchkit_product_exports(tenant_id,kit_id,user_id,format,file_name,mime_type,content_text,content_sha256,size_bytes,watermarked,white_label,idempotency_key) VALUES (${tenant(request)},${current.id},${actor(request)},${format},${fileName},${rendered.mimeType},${rendered.content},${rendered.sha256},${Buffer.byteLength(rendered.content)},${access.limits.watermarked},${access.limits.whiteLabel},${key}) ON CONFLICT (tenant_id,user_id,idempotency_key) DO NOTHING RETURNING *`);
      if (!inserted.rows[0]) {
        const replay = await db.execute(sql`SELECT * FROM launchkit_product_exports WHERE tenant_id=${tenant(request)} AND user_id=${actor(request)} AND idempotency_key=${key} LIMIT 1`);
        const row = replay.rows[0] as Row | undefined;
        if (!row || row.kit_id !== current.id || row.format !== format) throw new InputError('Export idempotency key was reused for a different export', 'IDEMPOTENCY_CONFLICT', 409);
        return { export: camel(row), content: row.content_text, replayed: true };
      }
      await activity(request, 'launchkit.export.created', 'launchkit_product_export', String((inserted.rows[0] as Row).id), 'Created a persisted launch-kit export.', { kitId: current.id, format, checksum: rendered.sha256 });
      return reply.code(201).send({ export: camel(inserted.rows[0]), content: rendered.content, replayed: false });
    } catch (error) { return failure(reply, error); }
  });

  app.get(`${base}/exports/:id/content`, { preHandler: readGuards }, async (request, reply) => {
    try {
      const result = await db.execute(sql`SELECT * FROM launchkit_product_exports WHERE tenant_id=${tenant(request)} AND user_id=${actor(request)} AND id=${identifier(request)} LIMIT 1`);
      if (!result.rows[0]) throw new InputError('Export was not found', 'NINJA_LAUNCH_KIT_EXPORT_NOT_FOUND', 404);
      const row = result.rows[0] as Row;
      return reply.header('content-type', row.mime_type).header('content-disposition', `attachment; filename="${String(row.file_name).replaceAll('"', '')}"`).send(row.content_text);
    } catch (error) { return failure(reply, error); }
  });

  app.get(`${base}/account`, { preHandler: readGuards }, async (request) => {
    const [access, usage, counts] = await Promise.all([
      resolveNinjaLaunchAccess(actor(request), tenant(request)),
      db.execute(sql`SELECT generation_count FROM launchkit_usage_counters WHERE tenant_id=${tenant(request)} AND user_id=${actor(request)} AND period_start=date_trunc('month',CURRENT_DATE)::date`),
      db.execute(sql`SELECT (SELECT count(*) FROM launchkit_product_kits WHERE tenant_id=${tenant(request)} AND user_id=${actor(request)} AND deleted_at IS NULL)::int AS kits,(SELECT count(*) FROM launchkit_brand_profiles WHERE tenant_id=${tenant(request)} AND user_id=${actor(request)} AND deleted_at IS NULL)::int AS brands`),
    ]);
    return { access, usage: { generationCount: Number((usage.rows[0] as Row | undefined)?.generation_count ?? 0), ...camel(counts.rows[0]) }, authority: 'OperatorOS subscriptions, entitlements, credits, and billing' };
  });

  app.get(`${base}/admin/stats`, { preHandler: adminGuards }, async (request) => {
    const result = await db.execute(sql`SELECT count(*)::int AS kits,count(DISTINCT user_id)::int AS creators,count(*) FILTER (WHERE generator_mode='ai')::int AS ai_refined,(SELECT count(*) FROM launchkit_brand_profiles WHERE tenant_id=${tenant(request)} AND deleted_at IS NULL)::int AS brands,(SELECT count(*) FROM launchkit_product_exports WHERE tenant_id=${tenant(request)})::int AS exports FROM launchkit_product_kits WHERE tenant_id=${tenant(request)} AND deleted_at IS NULL`);
    return { ...camel(result.rows[0]), authority: 'OperatorOS tenant admin; plan and billing changes remain in OperatorOS' };
  });

  app.get('/v1/platform/ninja-launch-kit/overview', { preHandler: [requireSuperAdmin] }, async () => {
    const result = await db.execute(sql`SELECT count(*)::int AS kits,count(DISTINCT tenant_id)::int AS tenants,count(DISTINCT user_id)::int AS creators,(SELECT count(*) FROM launchkit_product_exports)::int AS exports FROM launchkit_product_kits WHERE deleted_at IS NULL`);
    return { ...camel(result.rows[0]), sourceCounts: NINJA_LAUNCH_SOURCE_CATALOG.counts, planContract: NINJA_LAUNCH_PLAN_LIMITS, authority: 'OperatorOS platform admin' };
  });
}
