import { createHash } from 'node:crypto';
import { z } from 'zod';

export const BRANDFORGE_COPY_MODES = Object.freeze([
  'google_ad', 'meta_ad', 'linkedin_post', 'email', 'landing_page',
  'social_post', 'sms', 'product_description', 'retargeting_ad', 'sales_page',
] as const);
export const BRANDFORGE_TONES = Object.freeze([
  'Professional', 'Casual', 'Urgent', 'Playful', 'Authoritative',
  'Empathetic', 'Bold', 'Minimal',
] as const);
export const BRANDFORGE_WORKFLOWS = Object.freeze([
  'product_launch', 'content_plan', 'ad_campaign', 'lead_gen',
  'email_sequence', 'refresh_messaging',
] as const);
export const BRANDFORGE_REPORT_TYPES = Object.freeze([
  'campaign_summary', 'content_performance', 'channel_breakdown',
  'executive_summary', 'team_activity', 'brand_health',
] as const);
export const BRANDFORGE_INTEGRATION_CATALOG = Object.freeze([
  { provider: 'meta_ads', name: 'Meta Ads', category: 'advertising', requiredFeature: 'integrations.starter', kind: 'oauth' },
  { provider: 'google_ads', name: 'Google Ads', category: 'advertising', requiredFeature: 'integrations.starter', kind: 'oauth' },
  { provider: 'linkedin', name: 'LinkedIn', category: 'social', requiredFeature: 'integrations.growth', kind: 'oauth' },
  { provider: 'tiktok', name: 'TikTok', category: 'social', requiredFeature: 'integrations.growth', kind: 'oauth' },
  { provider: 'mailchimp', name: 'Mailchimp', category: 'email', requiredFeature: 'integrations.starter', kind: 'oauth' },
  { provider: 'smtp', name: 'SMTP / Email', category: 'email', requiredFeature: 'integrations.starter', kind: 'email' },
  { provider: 'webhooks', name: 'Webhooks', category: 'developer', requiredFeature: 'integrations.growth', kind: 'webhook' },
  { provider: 'hubspot', name: 'HubSpot', category: 'crm', requiredFeature: 'integrations.growth', kind: 'oauth' },
  { provider: 'salesforce', name: 'Salesforce', category: 'crm', requiredFeature: 'integrations.agency', kind: 'oauth' },
  { provider: 'google_analytics', name: 'Google Analytics', category: 'analytics', requiredFeature: 'integrations.starter', kind: 'oauth' },
  { provider: 'slack', name: 'Slack', category: 'communication', requiredFeature: 'integrations.growth', kind: 'oauth' },
  { provider: 'zapier', name: 'Zapier', category: 'developer', requiredFeature: 'integrations.growth', kind: 'webhook' },
] as const);

const id = z.string().uuid();
const bounded = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const jsonObject = z.record(z.string(), z.unknown()).default({});

export const offerInput = z.object({
  brandId: id.nullable().optional(), name: bounded(160), description: optionalText(8_000),
  priceLabel: optionalText(120), offerType: bounded(60).default('service'),
  targetAudience: optionalText(4_000), callToAction: optionalText(300), urgency: optionalText(2_000),
  status: z.enum(['draft', 'active', 'retired']).default('draft'),
}).strict();

export const taskInput = z.object({
  title: bounded(240), description: optionalText(8_000), assigneeUserId: id.nullable().optional(),
  status: z.enum(['todo', 'in_progress', 'blocked', 'done']).default('todo'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  dueAt: z.string().datetime().nullable().optional(), sortOrder: z.number().int().min(0).max(1_000_000).default(0),
}).strict();

export const commentInput = z.object({ body: bounded(12_000), parentId: id.nullable().optional() }).strict();

export const landingPageInput = z.object({
  title: bounded(200), slug: z.string().trim().min(1).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  status: z.enum(['draft', 'review', 'published', 'archived']).default('draft'),
  content: jsonObject, seo: jsonObject,
}).strict();

export const workflowInput = z.object({
  workflowType: z.enum(BRANDFORGE_WORKFLOWS), name: bounded(200),
  brandId: id.nullable().optional(), campaignId: id.nullable().optional(), inputs: jsonObject,
}).strict();

export const templateInput = z.object({
  name: bounded(180), description: optionalText(8_000), category: bounded(80).default('general'),
  templateType: bounded(80).default('campaign'), content: jsonObject,
  tags: z.array(bounded(80)).max(30).default([]),
}).strict();

export const integrationConnectInput = z.object({
  mode: z.enum(['disabled', 'test', 'live']).default('disabled'),
  accountLabel: optionalText(200), publicConfig: jsonObject,
  secretReference: optionalText(2_000), callbackReady: z.boolean().default(false),
}).strict();

export const leadInput = z.object({
  campaignId: id.nullable().optional(), landingPageId: id.nullable().optional(), source: optionalText(120),
  contact: jsonObject, consent: jsonObject, duplicateKey: optionalText(128),
}).strict();

export const reportInput = z.object({
  name: bounded(200), reportType: z.enum(BRANDFORGE_REPORT_TYPES).default('campaign_summary'),
  brandId: id.nullable().optional(), campaignId: id.nullable().optional(),
  dateFrom: z.string().date().nullable().optional(), dateTo: z.string().date().nullable().optional(),
  sections: z.array(bounded(80)).max(30).default([]), isWhiteLabel: z.boolean().default(false),
  branding: z.object({ companyName: optionalText(200), color: z.string().regex(/^#[0-9a-f]{6}$/i).nullable().optional(), logoAttachmentId: id.nullable().optional() }).strict().default({}),
}).strict().superRefine((value, ctx) => {
  if (value.dateFrom && value.dateTo && value.dateTo < value.dateFrom) ctx.addIssue({ code: 'custom', message: 'dateTo must not precede dateFrom', path: ['dateTo'] });
});

export const exportInput = z.object({
  reportId: id.nullable().optional(), exportType: bounded(60).default('workspace'),
  format: z.enum(['json', 'csv', 'html']).default('json'),
  idempotencyKey: z.string().min(8).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]+$/),
}).strict();

export function parsePhase31<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  throw Object.assign(new Error(issue?.message || 'BrandForgeOS input is invalid'), {
    code: 'BRANDFORGE_INPUT_INVALID', field: issue?.path.join('.') || undefined, statusCode: 400,
  });
}

/** Stable, inspectable copy quality signals; never random and never performance claims. */
export function scoreCopyContent(content: string) {
  const words = content.trim().split(/\s+/u).filter(Boolean);
  const sentences = content.split(/[.!?]+/u).map(value => value.trim()).filter(Boolean);
  const avgSentence = sentences.length ? words.length / sentences.length : words.length;
  const clarity = Math.max(0, Math.min(100, Math.round(100 - Math.max(0, avgSentence - 16) * 2.5)));
  const hasAction = /\b(?:start|try|learn|discover|get|book|join|download|shop|contact|subscribe|build)\b/iu.test(content);
  const ctaStrength = hasAction ? 85 : 45;
  const specificity = Math.max(30, Math.min(95, 35 + (content.match(/\b\d+(?:[%$,.]\d+)?\b/gu)?.length ?? 0) * 10 + Math.min(40, new Set(words.map(word => word.toLowerCase())).size / 3)));
  return { clarity, ctaStrength, specificity: Math.round(specificity), method: 'brandforge-copy-score-v1' };
}

export function stableJsonHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function csvCell(value: unknown) {
  const serialized = value == null
    ? ''
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);
  const formulaSafe = /^[=+\-@\t\r]/u.test(serialized) ? `'${serialized}` : serialized;
  return `"${formulaSafe.replaceAll('"', '""')}"`;
}

/** Deterministic report CSV containing the persisted snapshot rather than workspace counters. */
export function serializeBrandForgeReportCsv(report: Record<string, unknown>) {
  const snapshot = report.snapshot && typeof report.snapshot === 'object'
    ? report.snapshot as Record<string, unknown>
    : {};
  const rows: unknown[][] = [['section', 'key', 'value']];
  const add = (section: string, key: string, value: unknown) => rows.push([section, key, value]);

  for (const key of ['id', 'name', 'report_type', 'status', 'generated_at', 'snapshot_sha256']) {
    add('report', key, report[key] ?? null);
  }
  add('report', 'sections', report.sections ?? []);
  add('report', 'branding', report.branding ?? {});
  for (const section of ['period', 'scope', 'metrics', 'counts']) {
    const value = snapshot[section];
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    for (const [key, nested] of Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) {
      add(section, key, nested);
    }
  }
  for (const section of ['channels', 'taskStatus', 'recentActivity']) {
    const values = Array.isArray(snapshot[section]) ? snapshot[section] as unknown[] : [];
    values.forEach((value, index) => add(section, String(index + 1), value));
  }
  add('evidence', 'source', snapshot.evidence ?? null);
  add('evidence', 'sampleData', snapshot.sampleData ?? null);
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
