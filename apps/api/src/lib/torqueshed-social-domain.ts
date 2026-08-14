import { createHash } from 'node:crypto';

export class TorqueShedSocialError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode = 400,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'TorqueShedSocialError';
  }
}

export const MARKETPLACE_CATEGORIES = [
  ['parts', 'Parts'],
  ['tools', 'Tools'],
  ['fabrication', 'Fabrication'],
  ['manuals', 'Manuals'],
  ['wheels-tires', 'Wheels & Tires'],
  ['electronics', 'Electronics'],
  ['other', 'Other Automotive'],
] as const;

export const COMMUNITY_TOPICS = [
  ['builds', 'Builds'],
  ['diagnostics', 'Diagnostics'],
  ['maintenance', 'Maintenance'],
  ['fabrication', 'Fabrication'],
  ['tools', 'Tools'],
  ['general', 'General'],
] as const;

export const SOCIAL_RATE_LIMITS = {
  userWritesPerMinute: 20,
  tenantWritesPerMinute: 120,
  messagesPerMinute: 10,
  tenantMessagesPerMinute: 60,
  reportsPerHour: 10,
  tenantReportsPerHour: 100,
} as const;

const HTML_OR_SCRIPT = /<\/?[a-z][^>]*>|javascript\s*:|data\s*:\s*text\/html|on[a-z]+\s*=/i;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const PRECISE_LOCATION =
  /(?:\b\d{1,6}\s+[a-z0-9.' -]+\s(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|boulevard|blvd|court|ct|way)\b)|(?:-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,})/i;
const PROHIBITED_LISTING =
  /\b(?:stolen|vin\s*(?:plate|tag)|title\s*document|identity\s*document|password|credential|firearm|weapon|illegal\s*drug|explosive|hazardous\s*material|emissions?\s*(?:defeat|delete)|counterfeit\s*(?:airbag|brake|safety)|recalled\s*(?:airbag|brake|safety))\b/i;

export function plainText(value: unknown, field: string, minimum: number, maximum: number): string {
  if (typeof value !== 'string') {
    throw new TorqueShedSocialError(`${field} is required`, 'SOCIAL_TEXT_REQUIRED', 400, field);
  }
  const normalized = value.normalize('NFKC').replace(CONTROL, '').trim();
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new TorqueShedSocialError(
      `${field} must be between ${minimum} and ${maximum} characters`,
      'SOCIAL_TEXT_LENGTH_INVALID',
      400,
      field,
    );
  }
  if (HTML_OR_SCRIPT.test(normalized)) {
    throw new TorqueShedSocialError(
      `${field} must be plain text`,
      'SOCIAL_MARKUP_PROHIBITED',
      400,
      field,
    );
  }
  return normalized;
}

export function optionalText(value: unknown, field: string, maximum: number): string | null {
  if (value === undefined || value === null || value === '') return null;
  return plainText(value, field, 1, maximum);
}

export function socialId(value: unknown, field: string, required = false): string | null {
  if (!required && (value === undefined || value === null || value === '')) return null;
  if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/i.test(value)) {
    throw new TorqueShedSocialError(`${field} is invalid`, 'SOCIAL_ID_INVALID', 400, field);
  }
  return value;
}

export function integerMinor(value: unknown, field = 'priceMinor'): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 1_000_000_000) {
    throw new TorqueShedSocialError(
      `${field} must be a non-negative integer minor-unit amount`,
      'SOCIAL_MINOR_UNITS_INVALID',
      400,
      field,
    );
  }
  return Number(value);
}

function oneOf<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
  fallback?: T,
): T {
  if ((value === undefined || value === null || value === '') && fallback) return fallback;
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new TorqueShedSocialError(`${field} is invalid`, 'SOCIAL_ENUM_INVALID', 400, field);
  }
  return value as T;
}

export function privacySafeLocation(input: {
  locality?: unknown;
  region?: unknown;
  countryCode?: unknown;
}) {
  const locality = optionalText(input.locality, 'locality', 100);
  const region = optionalText(input.region, 'region', 100);
  const countryCode = input.countryCode ? String(input.countryCode).trim().toUpperCase() : 'US';
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new TorqueShedSocialError(
      'countryCode must be ISO alpha-2',
      'SOCIAL_COUNTRY_INVALID',
      400,
      'countryCode',
    );
  }
  if ((locality && PRECISE_LOCATION.test(locality)) || (region && PRECISE_LOCATION.test(region))) {
    throw new TorqueShedSocialError(
      'Use locality/region only; exact addresses and coordinates are prohibited',
      'SOCIAL_PRECISE_LOCATION_PROHIBITED',
      400,
      'locality',
    );
  }
  return { locality, region, countryCode };
}

export function contentHash(...parts: Array<string | null | undefined>): string {
  return createHash('sha256')
    .update(parts.map((part) => part?.trim().toLowerCase() ?? '').join('\n'))
    .digest('hex');
}

export function parseListingInput(raw: unknown) {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const title = plainText(body.title, 'title', 4, 160);
  const description = plainText(body.description, 'description', 10, 8_000);
  if (PROHIBITED_LISTING.test(`${title}\n${description}`)) {
    throw new TorqueShedSocialError(
      'The listing appears to contain a prohibited item or claim',
      'MARKETPLACE_ITEM_PROHIBITED',
      422,
      'description',
    );
  }
  const type = oneOf(body.type, 'type', ['sell', 'wanted', 'trade'] as const, 'sell');
  const condition = oneOf(body.condition, 'condition', [
    'new',
    'excellent',
    'working',
    'parts',
  ] as const);
  const priceMinor = integerMinor(body.priceMinor);
  if (type === 'sell' && priceMinor === null) {
    throw new TorqueShedSocialError(
      'A sell listing requires priceMinor',
      'MARKETPLACE_PRICE_REQUIRED',
      400,
      'priceMinor',
    );
  }
  const currency = String(body.currency ?? 'USD')
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new TorqueShedSocialError(
      'currency is invalid',
      'SOCIAL_CURRENCY_INVALID',
      400,
      'currency',
    );
  }
  const categorySlug = oneOf(
    body.categorySlug,
    'categorySlug',
    MARKETPLACE_CATEGORIES.map(([slug]) => slug),
  );
  const location = privacySafeLocation(body);
  return {
    title,
    description,
    type,
    condition,
    priceMinor,
    currency,
    negotiable: body.negotiable === true,
    categorySlug,
    ...location,
    vehicleId: socialId(body.vehicleId, 'vehicleId'),
    buildId: socialId(body.buildId, 'buildId'),
    contentHash: contentHash(title, description),
  };
}

export function parsePostInput(raw: unknown) {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const title = plainText(body.title, 'title', 4, 180);
  const content = plainText(body.body, 'body', 2, 20_000);
  const visibility = oneOf(
    body.visibility,
    'visibility',
    ['public', 'followers', 'private'] as const,
    'public',
  );
  const topicSlug = oneOf(
    body.topicSlug,
    'topicSlug',
    COMMUNITY_TOPICS.map(([slug]) => slug),
    'general',
  );
  const rawTags = body.tags === undefined ? [] : body.tags;
  if (!Array.isArray(rawTags) || rawTags.length > 8) {
    throw new TorqueShedSocialError('tags must contain at most 8 values', 'COMMUNITY_TAGS_INVALID');
  }
  const tags = [...new Set(rawTags.map((tag) => plainText(tag, 'tag', 2, 40).toLowerCase()))];
  return {
    title,
    body: content,
    visibility,
    topicSlug,
    tags,
    vehicleId: socialId(body.vehicleId, 'vehicleId'),
    buildId: socialId(body.buildId, 'buildId'),
    contentHash: contentHash(title, content),
  };
}

export function parseCommentInput(raw: unknown) {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const content = plainText(body.body, 'body', 1, 5_000);
  return {
    body: content,
    parentId: socialId(body.parentId, 'parentId'),
    contentHash: contentHash(content),
  };
}

export function parseMessageInput(raw: unknown) {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const content = plainText(body.body, 'body', 1, 5_000);
  return { body: content, contentHash: contentHash(content) };
}

export function parseProfileInput(raw: unknown) {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    displayName: plainText(body.displayName, 'displayName', 2, 100),
    bio: optionalText(body.bio, 'bio', 1_000),
    specialties: optionalText(body.specialties, 'specialties', 500),
    ...privacySafeLocation(body),
    visibility: oneOf(body.visibility, 'visibility', ['tenant', 'private'] as const, 'tenant'),
  };
}

export function parseReportInput(raw: unknown) {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    reasonCode: oneOf(body.reasonCode, 'reasonCode', [
      'spam',
      'harassment',
      'fraud',
      'prohibited_item',
      'privacy',
      'unsafe',
      'other',
    ] as const),
    details: optionalText(body.details, 'details', 2_000),
  };
}

export function parseListQuery(raw: unknown) {
  const query = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const limit = Math.max(1, Math.min(50, Number.parseInt(String(query.limit ?? '20'), 10) || 20));
  const offset = Math.max(
    0,
    Math.min(10_000, Number.parseInt(String(query.offset ?? '0'), 10) || 0),
  );
  return {
    limit,
    offset,
    search: optionalText(query.search, 'search', 120),
    sort: oneOf(query.sort, 'sort', ['recent', 'price_asc', 'price_desc'] as const, 'recent'),
  };
}

export function parseReaction(value: unknown): 'like' | 'helpful' | 'insightful' {
  return oneOf(value, 'reaction', ['like', 'helpful', 'insightful'] as const, 'like');
}
