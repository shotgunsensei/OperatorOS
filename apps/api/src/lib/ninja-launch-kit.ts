import { createHash } from 'node:crypto';

export class LaunchKitValidationError extends Error {
  readonly code = 'LAUNCHKIT_INPUT_INVALID';
  readonly statusCode = 400;
  constructor(message: string, readonly field?: string) {
    super(message);
    this.name = 'LaunchKitValidationError';
  }
}

export const LAUNCHKIT_ARTIFACT_KINDS = [
  'landing', 'ads', 'email_sms', 'social', 'faq', 'qr_flyer',
  'visual_briefs', 'launch_checklist',
] as const;

export const LAUNCHKIT_TEMPLATES = Object.freeze([
  ['auto-repair-shop', 'Auto Repair Shop', 'Auto & Mechanical'],
  ['mobile-mechanic', 'Mobile Mechanic', 'Auto & Mechanical'],
  ['it-support-msp', 'IT Support MSP', 'Professional Services'],
  ['pressure-washing', 'Pressure Washing', 'Home Services'],
  ['lawn-care', 'Lawn Care', 'Home Services'],
  ['fitness-coach', 'Fitness Coach', 'Health & Fitness'],
  ['music-artist', 'Music Artist', 'Creative'],
  ['podcast', 'Podcast', 'Creative'],
  ['restaurant-special', 'Restaurant Special', 'Hospitality'],
  ['barber-beauty', 'Barber & Beauty', 'Personal Care'],
  ['real-estate-agent', 'Real Estate Agent', 'Professional Services'],
  ['cleaning-business', 'Cleaning Business', 'Home Services'],
  ['roofing-contractor', 'Roofing Contractor', 'Trades'],
  ['handyman', 'Handyman', 'Trades'],
  ['online-course', 'Online Course', 'Education'],
  ['digital-product', 'Digital Product', 'Digital'],
  ['local-event', 'Local Event', 'Events'],
  ['nonprofit-fundraiser', 'Nonprofit Fundraiser', 'Nonprofit'],
  ['pool-hall-arcade', 'Pool Hall & Arcade', 'Entertainment'],
  ['cybersecurity-service', 'Cybersecurity Service', 'Professional Services'],
].map(([slug, name, category]) => ({ slug, name, category })));

export const DEFAULT_PHASES = Object.freeze([
  {
    title: 'Foundation',
    tasks: ['Confirm audience and problem', 'Finalize positioning, offer, and price'],
  },
  {
    title: 'Campaign production',
    tasks: ['Review launch copy', 'Approve campaign and visual artifacts'],
  },
  {
    title: 'Launch readiness',
    tasks: ['Validate channels and destination links', 'Complete launch-day checklist'],
  },
]);

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new LaunchKitValidationError('Request body must be an object');
  }
  const value = input as Record<string, unknown>;
  for (const field of ['tenantId', 'userId', 'moduleId', 'planId', 'subscriptionId']) {
    if (field in value) {
      throw new LaunchKitValidationError(`${field} is server-authoritative and must not be supplied`, field);
    }
  }
  return value;
}

function text(value: unknown, field: string, max: number, required = false): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new LaunchKitValidationError(`${field} is required`, field);
    return null;
  }
  if (typeof value !== 'string') throw new LaunchKitValidationError(`${field} must be text`, field);
  const result = value.trim();
  if ((!result && required) || result.length > max) {
    throw new LaunchKitValidationError(`${field} must be between ${required ? 1 : 0} and ${max} characters`, field);
  }
  return result || null;
}

function date(value: unknown, field: string): string | null {
  const result = text(value, field, 10);
  if (!result) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(Date.parse(`${result}T00:00:00Z`))) {
    throw new LaunchKitValidationError(`${field} must be an ISO date`, field);
  }
  return result;
}

function expectedVersion(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new LaunchKitValidationError('expectedVersion must be a positive integer', 'expectedVersion');
  }
  return Number(value);
}

function channels(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 12) {
    throw new LaunchKitValidationError('channels must be an array with at most 12 values', 'channels');
  }
  const result = [...new Set(value.map((item) => text(item, 'channels', 60, true)!))];
  return result;
}

function color(value: unknown, field: string): string | null {
  const result = text(value, field, 7);
  if (result && !/^#[0-9a-f]{6}$/i.test(result)) {
    throw new LaunchKitValidationError(`${field} must be a six-digit hex color`, field);
  }
  return result;
}

export function parseLaunchCreate(input: unknown) {
  const value = object(input);
  const templateSlug = text(value.templateSlug, 'templateSlug', 80);
  if (templateSlug && !LAUNCHKIT_TEMPLATES.some((template) => template.slug === templateSlug)) {
    throw new LaunchKitValidationError('Unknown templateSlug', 'templateSlug');
  }
  const priceMinor = value.priceMinor === undefined || value.priceMinor === null
    ? null
    : Number(value.priceMinor);
  if (priceMinor !== null && (!Number.isSafeInteger(priceMinor) || priceMinor < 0)) {
    throw new LaunchKitValidationError('priceMinor must be a non-negative integer', 'priceMinor');
  }
  const currency = (text(value.currency, 'currency', 3) ?? 'USD').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new LaunchKitValidationError('currency must be a three-letter code', 'currency');
  return {
    title: text(value.title, 'title', 180, true)!,
    productType: text(value.productType, 'productType', 80, true)!,
    templateSlug,
    ownerUserId: text(value.ownerUserId, 'ownerUserId', 36),
    summary: text(value.summary, 'summary', 4000),
    audience: text(value.audience, 'audience', 4000),
    painPoint: text(value.painPoint, 'painPoint', 4000),
    positioning: text(value.positioning, 'positioning', 4000),
    offer: text(value.offer, 'offer', 4000),
    priceMinor,
    currency,
    channels: channels(value.channels),
    tone: text(value.tone, 'tone', 160),
    primaryColor: color(value.primaryColor, 'primaryColor'),
    accentColor: color(value.accentColor, 'accentColor'),
    targetDate: date(value.targetDate, 'targetDate'),
  };
}

export function parseLaunchPatch(input: unknown) {
  const value = object(input);
  const result: Record<string, unknown> = { expectedVersion: expectedVersion(value.expectedVersion) };
  const textFields = [
    ['title', 180], ['productType', 80], ['summary', 4000], ['audience', 4000],
    ['painPoint', 4000], ['positioning', 4000], ['offer', 4000], ['tone', 160],
    ['ownerUserId', 36],
  ] as const;
  for (const [field, max] of textFields) {
    if (field in value) result[field] = text(value[field], field, max, field === 'title' || field === 'productType');
  }
  if ('priceMinor' in value) {
    const price = value.priceMinor === null ? null : Number(value.priceMinor);
    if (price !== null && (!Number.isSafeInteger(price) || price < 0)) {
      throw new LaunchKitValidationError('priceMinor must be a non-negative integer', 'priceMinor');
    }
    result.priceMinor = price;
  }
  if ('currency' in value) {
    const currency = text(value.currency, 'currency', 3, true)!.toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new LaunchKitValidationError('currency must be a three-letter code', 'currency');
    result.currency = currency;
  }
  if ('channels' in value) result.channels = channels(value.channels);
  if ('primaryColor' in value) result.primaryColor = color(value.primaryColor, 'primaryColor');
  if ('accentColor' in value) result.accentColor = color(value.accentColor, 'accentColor');
  if ('targetDate' in value) result.targetDate = date(value.targetDate, 'targetDate');
  if ('status' in value) {
    const status = text(value.status, 'status', 20, true)!;
    if (!['draft', 'planning', 'active', 'review', 'launched', 'archived'].includes(status)) {
      throw new LaunchKitValidationError('Invalid launch status', 'status');
    }
    result.status = status;
  }
  return result as {
    expectedVersion: number;
    [key: string]: unknown;
  };
}

export function parsePlanItem(input: unknown, kind: 'phase' | 'milestone' | 'task') {
  const value = object(input);
  const position = value.position === undefined ? 0 : Number(value.position);
  if (!Number.isInteger(position) || position < 0 || position > 100000) {
    throw new LaunchKitValidationError('position must be a non-negative integer', 'position');
  }
  return {
    title: text(value.title, 'title', kind === 'task' ? 220 : 180, true)!,
    description: text(value.description, 'description', 10000),
    position,
    phaseId: text(value.phaseId, 'phaseId', 36),
    milestoneId: text(value.milestoneId, 'milestoneId', 36),
    dependsOnTaskId: text(value.dependsOnTaskId, 'dependsOnTaskId', 36),
    ownerUserId: text(value.ownerUserId, 'ownerUserId', 36),
    dueDate: date(value.dueDate, 'dueDate'),
    startDate: date(value.startDate, 'startDate'),
    required: value.required === undefined ? true : Boolean(value.required),
  };
}

export function parseTaskPatch(input: unknown) {
  const value = object(input);
  const status = text(value.status, 'status', 20, true)!;
  if (!['pending', 'in_progress', 'blocked', 'complete'].includes(status)) {
    throw new LaunchKitValidationError('Invalid task status', 'status');
  }
  return {
    status,
    expectedVersion: expectedVersion(value.expectedVersion),
    ownerUserId: value.ownerUserId === undefined ? undefined : text(value.ownerUserId, 'ownerUserId', 36),
    dueDate: value.dueDate === undefined ? undefined : date(value.dueDate, 'dueDate'),
    dependsOnTaskId: value.dependsOnTaskId === undefined
      ? undefined
      : text(value.dependsOnTaskId, 'dependsOnTaskId', 36),
  };
}

export function parsePlanPatch(input: unknown, kind: 'phase' | 'milestone') {
  const value = object(input);
  const allowed = kind === 'phase'
    ? ['pending', 'active', 'blocked', 'complete']
    : ['pending', 'in_progress', 'blocked', 'complete'];
  const status = text(value.status, 'status', 20, true)!;
  if (!allowed.includes(status)) throw new LaunchKitValidationError(`Invalid ${kind} status`, 'status');
  return {
    status,
    expectedVersion: expectedVersion(value.expectedVersion),
    ownerUserId: kind === 'milestone' && value.ownerUserId !== undefined
      ? text(value.ownerUserId, 'ownerUserId', 36)
      : undefined,
    dueDate: value.dueDate === undefined ? undefined : date(value.dueDate, 'dueDate'),
  };
}

export function parseArtifactCreate(input: unknown) {
  const value = object(input);
  const kind = text(value.kind, 'kind', 40, true)!;
  if (![...LAUNCHKIT_ARTIFACT_KINDS, 'positioning', 'report'].includes(kind as any)) {
    throw new LaunchKitValidationError('Invalid artifact kind', 'kind');
  }
  return {
    kind,
    title: text(value.title, 'title', 200, true)!,
    body: text(value.body, 'body', 100000, true)!,
    required: value.required === undefined ? true : Boolean(value.required),
  };
}

export function parseArtifactPatch(input: unknown) {
  const value = object(input);
  const result: Record<string, unknown> = { expectedVersion: expectedVersion(value.expectedVersion) };
  if ('title' in value) result.title = text(value.title, 'title', 200, true);
  if ('body' in value) result.body = text(value.body, 'body', 100000, true);
  if ('status' in value) {
    const status = text(value.status, 'status', 20, true)!;
    if (!['draft', 'review', 'approved', 'archived'].includes(status)) {
      throw new LaunchKitValidationError('Invalid artifact status', 'status');
    }
    result.status = status;
  }
  return result as { expectedVersion: number; title?: string; body?: string; status?: string };
}

export function parseGeneration(input: unknown) {
  const value = object(input);
  return {
    idempotencyKey: text(value.idempotencyKey, 'idempotencyKey', 160, true)!,
  };
}

export function parseGeneratedArtifacts(raw: string) {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new LaunchKitValidationError('AI provider returned invalid JSON'); }
  const body = object(value);
  const artifacts = Array.isArray(body.artifacts) ? body.artifacts : [];
  const byKind = new Map<string, { kind: string; title: string; body: string }>();
  for (const artifact of artifacts) {
    const parsed = parseArtifactCreate({ ...(artifact as object), required: true });
    if (LAUNCHKIT_ARTIFACT_KINDS.includes(parsed.kind as any)) byKind.set(parsed.kind, parsed);
  }
  for (const kind of LAUNCHKIT_ARTIFACT_KINDS) {
    if (!byKind.has(kind)) throw new LaunchKitValidationError(`AI response is missing ${kind}`);
  }
  return [...byKind.values()];
}

export type ReadinessInput = {
  launch: Record<string, unknown>;
  tasks: Array<Record<string, unknown>>;
  artifacts: Array<Record<string, unknown>>;
};

export function calculateLaunchReadiness(input: ReadinessInput) {
  const briefRules = [
    ['audience', 'Audience defined'],
    ['pain_point', 'Customer problem defined'],
    ['positioning', 'Positioning approved'],
    ['offer', 'Offer defined'],
    ['price_minor', 'Price recorded'],
    ['channels', 'At least one channel selected'],
    ['target_date', 'Target date set'],
  ] as const;
  const rules: Array<{ id: string; label: string; complete: boolean; blocked?: boolean }> = briefRules.map(([field, label]) => ({
    id: `brief:${field}`,
    label,
    complete: field === 'channels'
      ? Array.isArray(input.launch[field]) && (input.launch[field] as unknown[]).length > 0
      : input.launch[field] !== null && input.launch[field] !== undefined && String(input.launch[field]).trim() !== '',
  }));
  for (const task of input.tasks.filter((item) => item.required === true)) {
    rules.push({
      id: `task:${task.id}`,
      label: `Task: ${task.title}`,
      complete: task.status === 'complete',
      blocked: task.status === 'blocked',
    });
  }
  for (const artifact of input.artifacts.filter((item) => item.required === true)) {
    rules.push({
      id: `artifact:${artifact.id}`,
      label: `Artifact: ${artifact.title}`,
      complete: artifact.status === 'approved',
    });
  }
  const complete = rules.filter((rule) => rule.complete).length;
  return {
    score: rules.length ? Math.floor((complete / rules.length) * 100) : 0,
    complete,
    total: rules.length,
    blocked: rules.some((rule) => rule.blocked),
    rules,
  };
}
