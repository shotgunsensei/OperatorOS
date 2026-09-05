const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const CLIENT_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;

export class BrandForgeValidationError extends Error {
  readonly statusCode = 400;
  readonly code = 'BRANDFORGE_INPUT_INVALID';
  constructor(message: string, readonly field?: string) {
    super(message);
    this.name = 'BrandForgeValidationError';
  }
}

type ObjectValue = Record<string, unknown>;

function record(value: unknown): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BrandForgeValidationError('Request body must be an object');
  }
  return value as ObjectValue;
}

function knownFields(body: ObjectValue, fields: readonly string[]) {
  const allowed = new Set(fields);
  const unknown = Object.keys(body).filter((key) => !allowed.has(key));
  if (unknown.length) throw new BrandForgeValidationError(`Unknown field: ${unknown[0]}`, unknown[0]);
}

function text(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== 'string') throw new BrandForgeValidationError(`${field} must be text`, field);
  const result = value.trim();
  if (result.length < min || result.length > max) {
    throw new BrandForgeValidationError(`${field} must be ${min}-${max} characters`, field);
  }
  return result;
}

function optionalText(value: unknown, field: string, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return text(value, field, 1, max);
}

function uuid(value: unknown, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new BrandForgeValidationError(`${field} must be a valid identifier`, field);
  }
  return value;
}

function integer(value: unknown, field: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    throw new BrandForgeValidationError(`${field} must be an integer from ${min} to ${max}`, field);
  }
  return value as number;
}

function optionalInteger(value: unknown, field: string, min: number, max: number): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return integer(value, field, min, max);
}

function date(value: unknown, field: string, required = false): Date | null | undefined {
  if (value === undefined) {
    if (required) throw new BrandForgeValidationError(`${field} is required`, field);
    return undefined;
  }
  if (value === null || value === '') {
    if (required) throw new BrandForgeValidationError(`${field} is required`, field);
    return null;
  }
  if (typeof value !== 'string' || value.length > 40) {
    throw new BrandForgeValidationError(`${field} must be an ISO date`, field);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) throw new BrandForgeValidationError(`${field} must be an ISO date`, field);
  return parsed;
}

function strings(value: unknown, field: string, maxItems = 12, maxLength = 60): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new BrandForgeValidationError(`${field} must contain at most ${maxItems} values`, field);
  }
  const values = value.map((item) => text(item, field, 1, maxLength));
  if (new Set(values.map((item) => item.toLowerCase())).size !== values.length) {
    throw new BrandForgeValidationError(`${field} cannot contain duplicates`, field);
  }
  return values;
}

function patchVersion(body: ObjectValue) {
  return integer(body.expectedVersion, 'expectedVersion', 1, 2_147_483_647);
}

function ensurePatch(changes: ObjectValue) {
  if (Object.values(changes).every((value) => value === undefined)) {
    throw new BrandForgeValidationError('At least one field must be changed');
  }
}

export function parseBrandInput(input: unknown, mode: 'create' | 'patch') {
  const body = record(input);
  knownFields(body, ['name', 'description', 'primaryColor', 'secondaryColor', 'accentColor', 'headingFont', 'bodyFont', 'voiceTone', 'guidelines', 'assetSummary', 'expectedVersion']);
  const color = (value: unknown, field: string) => {
    const result = optionalText(value, field, 7);
    if (result && !HEX_COLOR.test(result)) throw new BrandForgeValidationError(`${field} must be a six-digit hex color`, field);
    return result;
  };
  const changes = {
    name: mode === 'create' || body.name !== undefined ? text(body.name, 'name', 1, 120) : undefined,
    description: optionalText(body.description, 'description', 4_000),
    primaryColor: color(body.primaryColor, 'primaryColor'),
    secondaryColor: color(body.secondaryColor, 'secondaryColor'),
    accentColor: color(body.accentColor, 'accentColor'),
    headingFont: optionalText(body.headingFont, 'headingFont', 80),
    bodyFont: optionalText(body.bodyFont, 'bodyFont', 80),
    voiceTone: optionalText(body.voiceTone, 'voiceTone', 2_000),
    guidelines: optionalText(body.guidelines, 'guidelines', 12_000),
    assetSummary: body.assetSummary === undefined ? undefined : strings(body.assetSummary, 'assetSummary', 30, 300),
  };
  if (mode === 'patch') ensurePatch(changes);
  return { ...changes, ...(mode === 'patch' ? { expectedVersion: patchVersion(body) } : {}) };
}

export function parsePersonaInput(input: unknown, mode: 'create' | 'patch') {
  const body = record(input);
  knownFields(body, ['name', 'ageRange', 'location', 'interests', 'painPoints', 'goals', 'channels', 'description', 'expectedVersion']);
  const changes = {
    name: mode === 'create' || body.name !== undefined ? text(body.name, 'name', 1, 120) : undefined,
    ageRange: optionalText(body.ageRange, 'ageRange', 80),
    location: optionalText(body.location, 'location', 160),
    interests: optionalText(body.interests, 'interests', 4_000),
    painPoints: optionalText(body.painPoints, 'painPoints', 4_000),
    goals: optionalText(body.goals, 'goals', 4_000),
    channels: body.channels === undefined ? undefined : strings(body.channels, 'channels'),
    description: optionalText(body.description, 'description', 6_000),
  };
  if (mode === 'patch') ensurePatch(changes);
  return { ...changes, ...(mode === 'patch' ? { expectedVersion: patchVersion(body) } : {}) };
}

const CAMPAIGN_STATUSES = ['draft', 'planning', 'producing', 'review', 'scheduled', 'active', 'completed', 'archived'] as const;
const COPY_STATUSES = ['draft', 'review', 'approved', 'published', 'archived'] as const;
const CALENDAR_STATUSES = ['idea', 'draft', 'review', 'scheduled', 'published', 'cancelled'] as const;

function status<T extends readonly string[]>(value: unknown, field: string, values: T): T[number] | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !values.includes(value as T[number])) {
    throw new BrandForgeValidationError(`${field} is invalid`, field);
  }
  return value as T[number];
}

export function parseCampaignInput(input: unknown, mode: 'create' | 'patch') {
  const body = record(input);
  knownFields(body, ['brandId', 'personaId', 'name', 'objective', 'targetAudience', 'coreMessage', 'offer', 'status', 'channels', 'startAt', 'endAt', 'budgetCents', 'notes', 'expectedVersion']);
  const startAt = date(body.startAt, 'startAt');
  const endAt = date(body.endAt, 'endAt');
  if (startAt && endAt && endAt < startAt) throw new BrandForgeValidationError('endAt must not precede startAt', 'endAt');
  const changes = {
    brandId: uuid(body.brandId, 'brandId'),
    personaId: uuid(body.personaId, 'personaId'),
    name: mode === 'create' || body.name !== undefined ? text(body.name, 'name', 1, 160) : undefined,
    objective: optionalText(body.objective, 'objective', 6_000),
    targetAudience: optionalText(body.targetAudience, 'targetAudience', 6_000),
    coreMessage: optionalText(body.coreMessage, 'coreMessage', 6_000),
    offer: optionalText(body.offer, 'offer', 4_000),
    status: status(body.status, 'status', CAMPAIGN_STATUSES) ?? (mode === 'create' ? 'draft' as const : undefined),
    channels: body.channels === undefined ? (mode === 'create' ? [] : undefined) : strings(body.channels, 'channels'),
    startAt,
    endAt,
    budgetCents: optionalInteger(body.budgetCents, 'budgetCents', 0, 2_147_483_647),
    notes: optionalText(body.notes, 'notes', 8_000),
  };
  if (mode === 'patch') ensurePatch(changes);
  return { ...changes, ...(mode === 'patch' ? { expectedVersion: patchVersion(body) } : {}) };
}

export function parseCopyAssetInput(input: unknown, mode: 'create' | 'patch') {
  const body = record(input);
  knownFields(body, ['brandId', 'campaignId', 'title', 'content', 'copyType', 'channel', 'tone', 'status', 'generationId', 'favorite', 'expectedVersion']);
  const changes = {
    brandId: uuid(body.brandId, 'brandId'),
    campaignId: uuid(body.campaignId, 'campaignId'),
    title: mode === 'create' || body.title !== undefined ? text(body.title, 'title', 1, 200) : undefined,
    content: mode === 'create' || body.content !== undefined ? text(body.content, 'content', 1, 20_000) : undefined,
    copyType: mode === 'create' || body.copyType !== undefined ? text(body.copyType, 'copyType', 1, 60) : undefined,
    channel: optionalText(body.channel, 'channel', 60),
    tone: optionalText(body.tone, 'tone', 120),
    status: status(body.status, 'status', COPY_STATUSES) ?? (mode === 'create' ? 'draft' as const : undefined),
    generationId: uuid(body.generationId, 'generationId'),
    favorite: body.favorite === undefined ? undefined : (() => {
      if (typeof body.favorite !== 'boolean') throw new BrandForgeValidationError('favorite must be boolean', 'favorite');
      return body.favorite;
    })(),
  };
  if (mode === 'patch') ensurePatch(changes);
  return { ...changes, ...(mode === 'patch' ? { expectedVersion: patchVersion(body) } : {}) };
}

export function parseCalendarInput(input: unknown, mode: 'create' | 'patch') {
  const body = record(input);
  knownFields(body, ['brandId', 'campaignId', 'copyAssetId', 'title', 'description', 'itemType', 'channel', 'scheduledAt', 'status', 'expectedVersion']);
  if (mode === 'patch' && (body.scheduledAt === null || body.scheduledAt === '')) {
    throw new BrandForgeValidationError('scheduledAt cannot be cleared', 'scheduledAt');
  }
  const scheduledAt = body.scheduledAt === undefined ? undefined : date(body.scheduledAt, 'scheduledAt', true)!;
  const changes = {
    brandId: uuid(body.brandId, 'brandId'),
    campaignId: uuid(body.campaignId, 'campaignId'),
    copyAssetId: uuid(body.copyAssetId, 'copyAssetId'),
    title: mode === 'create' || body.title !== undefined ? text(body.title, 'title', 1, 200) : undefined,
    description: optionalText(body.description, 'description', 6_000),
    itemType: mode === 'create' || body.itemType !== undefined ? text(body.itemType, 'itemType', 1, 60) : undefined,
    channel: optionalText(body.channel, 'channel', 60),
    scheduledAt,
    status: status(body.status, 'status', CALENDAR_STATUSES) ?? (mode === 'create' ? 'idea' as const : undefined),
  };
  if (mode === 'patch') ensurePatch(changes);
  return { ...changes, ...(mode === 'patch' ? { expectedVersion: patchVersion(body) } : {}) };
}

export function parseMetricInput(input: unknown) {
  const body = record(input);
  knownFields(body, ['campaignId', 'metricDate', 'channel', 'impressions', 'clicks', 'conversions', 'spendCents', 'revenueCents']);
  const impressions = integer(body.impressions ?? 0, 'impressions', 0, 2_147_483_647);
  const clicks = integer(body.clicks ?? 0, 'clicks', 0, 2_147_483_647);
  const conversions = integer(body.conversions ?? 0, 'conversions', 0, 2_147_483_647);
  if (clicks > impressions) throw new BrandForgeValidationError('clicks cannot exceed impressions', 'clicks');
  if (conversions > clicks) throw new BrandForgeValidationError('conversions cannot exceed clicks', 'conversions');
  const campaignId = uuid(body.campaignId, 'campaignId');
  if (!campaignId) throw new BrandForgeValidationError('campaignId is required', 'campaignId');
  return {
    campaignId,
    metricDate: date(body.metricDate, 'metricDate', true)!,
    channel: optionalText(body.channel, 'channel', 60),
    impressions,
    clicks,
    conversions,
    spendCents: integer(body.spendCents ?? 0, 'spendCents', 0, 2_147_483_647),
    revenueCents: integer(body.revenueCents ?? 0, 'revenueCents', 0, 2_147_483_647),
  };
}

export function parseWorkspaceSettings(input: unknown, mode: 'create' | 'patch') {
  const body = record(input);
  knownFields(body, ['industry', 'businessType', 'products', 'idealCustomer', 'geographicMarket', 'competitors', 'goals', 'channels', 'completed', 'expectedVersion']);
  const profile = {
    industry: optionalText(body.industry, 'industry', 120) ?? undefined,
    businessType: optionalText(body.businessType, 'businessType', 120) ?? undefined,
    products: optionalText(body.products, 'products', 6_000) ?? undefined,
    idealCustomer: optionalText(body.idealCustomer, 'idealCustomer', 6_000) ?? undefined,
    geographicMarket: optionalText(body.geographicMarket, 'geographicMarket', 1_000) ?? undefined,
    competitors: optionalText(body.competitors, 'competitors', 4_000) ?? undefined,
    goals: strings(body.goals, 'goals', 12, 120),
    channels: strings(body.channels, 'channels', 12, 60),
  };
  if (typeof body.completed !== 'boolean') throw new BrandForgeValidationError('completed must be boolean', 'completed');
  return {
    profile,
    completed: body.completed,
    ...(mode === 'patch'
      ? { expectedVersion: integer(body.expectedVersion, 'expectedVersion', 0, 2_147_483_647) }
      : {}),
  };
}

export function parseGenerationInput(input: unknown): {
  type: 'copy' | 'strategy' | 'campaign_ideas';
  idempotencyKey: string;
  brandId: string | null | undefined;
  campaignId: string | null | undefined;
  prompt: string;
  tone: string | null | undefined;
  channel: string | null | undefined;
  audience: string | null | undefined;
  copyType: string | null | undefined;
  objective: string | null | undefined;
  length: string | null | undefined;
  ctaStyle: string | null | undefined;
} {
  const body = record(input);
  knownFields(body, ['type', 'idempotencyKey', 'brandId', 'campaignId', 'prompt', 'tone', 'channel', 'audience', 'copyType', 'objective', 'length', 'ctaStyle']);
  const type = body.type;
  if (type !== 'copy' && type !== 'strategy' && type !== 'campaign_ideas') {
    throw new BrandForgeValidationError('type must be copy, strategy, or campaign_ideas', 'type');
  }
  if (typeof body.idempotencyKey !== 'string' || !CLIENT_KEY.test(body.idempotencyKey)) {
    throw new BrandForgeValidationError('idempotencyKey is invalid', 'idempotencyKey');
  }
  return {
    type,
    idempotencyKey: body.idempotencyKey,
    brandId: uuid(body.brandId, 'brandId'),
    campaignId: uuid(body.campaignId, 'campaignId'),
    prompt: text(body.prompt, 'prompt', 10, 8_000),
    tone: optionalText(body.tone, 'tone', 120),
    channel: optionalText(body.channel, 'channel', 60),
    audience: optionalText(body.audience, 'audience', 2_000),
    copyType: optionalText(body.copyType, 'copyType', 60),
    objective: optionalText(body.objective, 'objective', 120),
    length: optionalText(body.length, 'length', 40),
    ctaStyle: optionalText(body.ctaStyle, 'ctaStyle', 120),
  };
}

export function parseListQuery(input: unknown) {
  const query = input && typeof input === 'object' && !Array.isArray(input) ? input as ObjectValue : {};
  knownFields(query, ['limit', 'status']);
  const limitRaw = query.limit === undefined ? 50 : Number(query.limit);
  if (!Number.isSafeInteger(limitRaw) || limitRaw < 1 || limitRaw > 100) {
    throw new BrandForgeValidationError('limit must be 1-100', 'limit');
  }
  return {
    limit: limitRaw,
    status: optionalText(query.status, 'status', 40),
  };
}
