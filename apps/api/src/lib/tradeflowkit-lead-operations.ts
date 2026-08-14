import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import {
  tradeflowkitLeadCaptureForms,
  tradeflowkitLeadFollowups,
  tradeflowkitLeadSettings,
  type TradeFlowKitLeadFollowupStep,
} from '../schema.js';

export type TradeFlowKitLeadTemplateKey =
  | 'hvac'
  | 'electrical'
  | 'plumbing'
  | 'roofing'
  | 'landscaping'
  | 'general_contractor'
  | 'it_field_service';

export type TradeFlowKitLeadTemplate = {
  key: TradeFlowKitLeadTemplateKey;
  label: string;
  description: string;
  serviceCategories: string[];
  leadSources: string[];
  emailTemplate: string;
  smsTemplate: string;
  followupSequence: TradeFlowKitLeadFollowupStep[];
};

const baseEmail = 'Hi {name}, thanks for reaching out about {service}. We received your request and will follow up shortly.';
const baseSms = 'Hi {name}, we received your request about {service}. Reply STOP to opt out.';

function template(
  key: TradeFlowKitLeadTemplateKey,
  label: string,
  description: string,
  serviceCategories: string[],
  leadSources: string[],
): TradeFlowKitLeadTemplate {
  return {
    key,
    label,
    description,
    serviceCategories,
    leadSources,
    emailTemplate: baseEmail,
    smsTemplate: baseSms,
    followupSequence: [
      { delayMinutes: 15, channel: 'email', template: baseEmail },
      { delayMinutes: 24 * 60, channel: 'sms', template: baseSms },
      { delayMinutes: 3 * 24 * 60, channel: 'email', template: 'Hi {name}, checking back on your {service} request. Reply when you are ready to schedule the next step.' },
    ],
  };
}

export const TRADEFLOWKIT_LEAD_TEMPLATES: readonly TradeFlowKitLeadTemplate[] = Object.freeze([
  template('hvac', 'HVAC', 'Emergency, repair, maintenance, and replacement lead handling.', ['Emergency repair', 'System repair', 'Maintenance', 'Replacement estimate'], ['manual', 'website', 'referral', 'maintenance-plan']),
  template('electrical', 'Electrical', 'Service calls, panel work, lighting, and project estimates.', ['Service call', 'Panel or breaker', 'Lighting', 'Project estimate'], ['manual', 'website', 'referral', 'property-manager']),
  template('plumbing', 'Plumbing', 'Emergency, drain, fixture, and repipe lead handling.', ['Emergency leak', 'Drain service', 'Fixture repair', 'Repipe estimate'], ['manual', 'website', 'referral', 'property-manager']),
  template('roofing', 'Roofing', 'Inspection, repair, storm, and replacement opportunities.', ['Roof inspection', 'Leak repair', 'Storm damage', 'Replacement estimate'], ['manual', 'website', 'referral', 'insurance']),
  template('landscaping', 'Landscaping', 'Maintenance, cleanup, design, and installation leads.', ['Routine maintenance', 'Cleanup', 'Landscape design', 'Installation'], ['manual', 'website', 'referral', 'neighborhood']),
  template('general_contractor', 'General contractor', 'A balanced lead-to-job playbook for mixed field-service work.', ['Service request', 'Repair', 'Renovation', 'Project estimate'], ['manual', 'website', 'referral', 'repeat-customer']),
  template('it_field_service', 'IT field service', 'On-site support, network, endpoint, and project opportunities.', ['On-site support', 'Network issue', 'Endpoint work', 'Project assessment'], ['manual', 'website', 'referral', 'managed-client']),
]);

const TEMPLATE_BY_KEY = new Map(TRADEFLOWKIT_LEAD_TEMPLATES.map(item => [item.key, item]));

export function getTradeFlowKitLeadTemplate(key: string): TradeFlowKitLeadTemplate | null {
  return TEMPLATE_BY_KEY.get(key as TradeFlowKitLeadTemplateKey) ?? null;
}

type LeadOperationsExecutor = Pick<typeof db, 'select' | 'insert'>;

export async function ensureTradeFlowKitLeadOperationDefaults(
  tenantId: string,
  userId: string | null,
  executor: LeadOperationsExecutor = db,
) {
  const defaults = getTradeFlowKitLeadTemplate('general_contractor')!;
  await executor.insert(tradeflowkitLeadSettings).values({
    tenantId,
    updatedByUserId: userId,
    tradeTemplate: defaults.key,
    emailTemplate: defaults.emailTemplate,
    smsTemplate: defaults.smsTemplate,
    followupSequence: [],
    leadSources: ['manual'],
  }).onConflictDoNothing({ target: tradeflowkitLeadSettings.tenantId });
  await executor.insert(tradeflowkitLeadCaptureForms).values({
    tenantId,
    updatedByUserId: userId,
  }).onConflictDoNothing({ target: tradeflowkitLeadCaptureForms.tenantId });
  const [settingsRows, captureRows] = await Promise.all([
    executor.select().from(tradeflowkitLeadSettings).where(eq(tradeflowkitLeadSettings.tenantId, tenantId)).limit(1),
    executor.select().from(tradeflowkitLeadCaptureForms).where(eq(tradeflowkitLeadCaptureForms.tenantId, tenantId)).limit(1),
  ]);
  return { settings: settingsRows[0], captureForm: captureRows[0] };
}

export async function scheduleTradeFlowKitLeadFollowups(input: {
  tenantId: string;
  leadId: string;
  createdAt: Date;
}, executor: LeadOperationsExecutor = db) {
  const [settings] = await executor.select({
    enabled: tradeflowkitLeadSettings.followUpEnabled,
    sequence: tradeflowkitLeadSettings.followupSequence,
  }).from(tradeflowkitLeadSettings).where(eq(tradeflowkitLeadSettings.tenantId, input.tenantId)).limit(1);
  if (!settings?.enabled || !Array.isArray(settings.sequence)) return [];
  const sequence = settings.sequence.slice(0, 20).filter(step =>
    Number.isSafeInteger(step.delayMinutes)
      && step.delayMinutes >= 0
      && step.delayMinutes <= 365 * 24 * 60
      && (step.channel === 'email' || step.channel === 'sms')
      && typeof step.template === 'string'
      && step.template.trim().length > 0
      && step.template.length <= 4_000,
  );
  if (sequence.length === 0) return [];
  return executor.insert(tradeflowkitLeadFollowups).values(sequence.map((step, index) => ({
    tenantId: input.tenantId,
    leadId: input.leadId,
    stepNumber: index + 1,
    channel: step.channel,
    dueAt: new Date(input.createdAt.getTime() + step.delayMinutes * 60_000),
    messageTemplate: step.template,
  }))).onConflictDoNothing({
    target: [tradeflowkitLeadFollowups.tenantId, tradeflowkitLeadFollowups.leadId, tradeflowkitLeadFollowups.stepNumber],
  }).returning();
}
