import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { db } from '../db.js';
import { and, desc, eq, ilike, isNull, ne, or, sql } from 'drizzle-orm';
import {
  modules,
  moduleStudySessions,
  moduleWorkflowItems,
  techdeckTicketSequences,
  techdeckTickets,
  techdeckAssets,
  techdeckRunbooks,
  tradeflowkitLeads,
  tradeflowkitCustomers,
  tradeflowkitJobs,
  tradeflowkitQuotes,
  tradeflowkitInvoices,
  tradeflowkitQuoteItems,
  tradeflowkitInvoiceItems,
  tradeflowkitPayments,
  directoryOrganizations,
  directoryContacts,
  directorySites,
  directoryOrganizationContacts,
  activityFeed,
} from '../schema.js';
import {
  requireTenantAdmin,
  requireTenantMember,
  requireTenantModuleAccess,
  requireTenantModuleWriteAccess,
} from '../lib/tenant-auth.js';
import { getAiProvider } from '../lib/ai-provider.js';
import {
  parseTradeFlowKitLeadCreate,
  parseTradeFlowKitLeadListQuery,
  parseTradeFlowKitLeadPatch,
  TradeFlowKitLeadValidationError,
} from '../lib/tradeflowkit-leads.js';
import {
  parseCustomerCreate,
  parseCustomerImport,
  parseCustomerUpdate,
  parseDocumentArchive,
  parseInvoiceCreate,
  parseInvoiceFromQuote,
  parseInvoiceUpdate,
  parseJobCreate,
  parsePayment,
  parseQuoteCreate,
  parseQuoteToJob,
  parseQuoteUpdate,
  parseTransition,
  TradeFlowKitRevenueValidationError,
  type TradeFlowKitCustomerInput,
} from '../lib/tradeflowkit-revenue.js';
import {
  parseTechDeckTicketCreate,
  parseTechDeckTicketListQuery,
  parseTechDeckTicketPatch,
  parseTechDeckTicketStatus,
  TechDeckTicketValidationError,
} from '../lib/techdeck-tickets.js';
import {
  parseTechDeckAssetCreate,
  parseTechDeckAssetPatch,
  parseTechDeckRunbookCreate,
  parseTechDeckVersion,
  TechDeckOpsValidationError,
} from '../lib/techdeck-ops.js';
import { getTenantMembership, resolveTenantModuleAccess } from '../lib/tenant-entitlements.js';
import {
  beginIdempotentOperation,
  completeIdempotentOperation,
} from '../lib/shared-usage-activity.js';
import { registerPulseDeskRoutes } from './pulsedesk-routes.js';
import { registerPulseDeskServiceDeskRoutes } from './pulsedesk-service-desk-routes.js';
import { registerNinjaPoolHallRoutes } from './ninja-pool-hall-routes.js';
import { allocateTradeFlowKitNumber, registerTradeFlowKitRoutes } from './tradeflowkit-routes.js';
import { registerTechDeckRoutes } from './techdeck-routes.js';
import { registerTorqueShedRoutes } from './torqueshed-routes.js';
import { registerTorqueAssistRoutes } from './torque-assist-routes.js';
import { registerTorqueShedSocialRoutes } from './torqueshed-social-routes.js';
import { registerFaultlineLabRoutes } from './faultlinelab-routes.js';
import { registerBrandForgeOsRoutes } from './brandforgeos-routes.js';
import { registerStudyForgeRoutes } from './studyforge-routes.js';
import { registerNinjaLaunchKitRoutes } from './ninja-launch-kit-routes.js';
import { registerCallCommandRoutes } from './callcommand-routes.js';
import { registerNinjamationRoutes } from './ninjamation-routes.js';
import { registerOutCallRoutes } from './outcall-routes.js';

// Per-module guard chains. `requireTenantMember` confirms the caller belongs
// to the active tenant; `requireTenantModuleAccess(slug)` then enforces that
// the tenant has the module enabled AND the user has a non-`none` grant for
// it. Both are required: skipping the second would let any tenant member
// read/write another module's data even if their access was revoked.
const studyforgeGuards = [requireTenantMember, requireTenantModuleAccess('studyforge-ai')];
const tradeflowkitGuards = [requireTenantMember, requireTenantModuleAccess('tradeflowkit')];
const techdeckGuards = [requireTenantMember, requireTenantModuleAccess('techdeck')];
const studyforgeWriteGuards = [...studyforgeGuards, requireTenantModuleWriteAccess];
const tradeflowkitWriteGuards = [...tradeflowkitGuards, requireTenantModuleWriteAccess];
const techdeckWriteGuards = [...techdeckGuards, requireTenantModuleWriteAccess];

// ---------------------------------------------------------------------------
// Shared-runtime backends for the polished module shells.
//
// Routes live under `/v1/modules/{slug}/*` and are gated by
// both tenant membership and the named module entitlement. Every read/write
// is scoped to the active tenant exposed via `request.tenantContext`.
// ---------------------------------------------------------------------------


const WORKFLOW_MODULES = {
  torqueshed: {
    slug: 'torqueshed', itemType: 'diagnostic_case', initialStatus: 'open',
    statuses: new Set(['open', 'testing', 'repairing', 'verified', 'closed']),
  },
  snapproofos: {
    slug: 'snapproofos', itemType: 'evidence_record', initialStatus: 'draft',
    statuses: new Set(['draft', 'captured', 'review', 'verified', 'rejected']),
  },
} as const;

type WorkflowModuleSpec = (typeof WORKFLOW_MODULES)[keyof typeof WORKFLOW_MODULES];

type WorkflowItemInput = {
  title?: string;
  summary?: string | null;
  status?: string;
  data?: Record<string, string | number | boolean | null>;
  expectedVersion?: number;
};

function parseWorkflowItemInput(
  raw: unknown,
  spec: WorkflowModuleSpec,
  mode: 'create' | 'patch',
): WorkflowItemInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('WORKFLOW_BODY_INVALID');
  }
  const body = raw as Record<string, unknown>;
  const result: WorkflowItemInput = {};

  if (mode === 'create' || body.title !== undefined) {
    if (typeof body.title !== 'string' || body.title.trim().length < 2 || body.title.trim().length > 160) {
      throw new Error('WORKFLOW_TITLE_INVALID');
    }
    result.title = body.title.trim();
  }
  if (body.summary !== undefined) {
    if (body.summary !== null && (typeof body.summary !== 'string' || body.summary.trim().length > 2_000)) {
      throw new Error('WORKFLOW_SUMMARY_INVALID');
    }
    result.summary = body.summary === null ? null : (body.summary as string).trim() || null;
  }
  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !spec.statuses.has(body.status as never)) {
      throw new Error('WORKFLOW_STATUS_INVALID');
    }
    result.status = body.status;
  } else if (mode === 'create') {
    result.status = spec.initialStatus;
  }
  if (body.data !== undefined) {
    if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
      throw new Error('WORKFLOW_DATA_INVALID');
    }
    const entries = Object.entries(body.data as Record<string, unknown>);
    if (entries.length > 30 || JSON.stringify(body.data).length > 16_384) {
      throw new Error('WORKFLOW_DATA_INVALID');
    }
    const data: Record<string, string | number | boolean | null> = {};
    for (const [key, value] of entries) {
      if (!/^[a-z][a-zA-Z0-9_]{0,49}$/.test(key) || !['string', 'number', 'boolean'].includes(typeof value) && value !== null) {
        throw new Error('WORKFLOW_DATA_INVALID');
      }
      data[key] = typeof value === 'string' ? value.trim().slice(0, 2_000) : value as number | boolean | null;
    }
    result.data = data;
  } else if (mode === 'create') {
    result.data = {};
  }
  if (mode === 'patch') {
    if (!Number.isInteger(body.expectedVersion) || (body.expectedVersion as number) < 1) {
      throw new Error('WORKFLOW_VERSION_REQUIRED');
    }
    result.expectedVersion = body.expectedVersion as number;
    if (!result.title && result.summary === undefined && !result.status && !result.data) {
      throw new Error('WORKFLOW_PATCH_EMPTY');
    }
  }
  return result;
}

function sendWorkflowValidation(reply: FastifyReply, err: unknown) {
  const code = err instanceof Error ? err.message : 'WORKFLOW_BODY_INVALID';
  return reply.code(400).send({ error: 'Invalid workflow record', code });
}

function handleTechDeckValidation(reply: FastifyReply, err: unknown): boolean {
  if (!(err instanceof TechDeckTicketValidationError)) return false;
  reply.code(400).send({ error: err.message, code: err.code, field: err.field });
  return true;
}

function handleTechDeckOpsValidation(reply: FastifyReply, err: unknown): boolean {
  if (!(err instanceof TechDeckOpsValidationError)) return false;
  reply.code(400).send({ error: err.message, code: err.code, field: err.field });
  return true;
}

/**
 * Assignment is a separate authority decision from ticket write access.
 * Members may claim an unassigned ticket or release their own assignment;
 * tenant admins/owners may assign another eligible technician. The generic
 * INVALID_ASSIGNEE response deliberately hides whether a foreign user exists.
 */
async function validateTechDeckAssignee(
  request: FastifyRequest,
  reply: FastifyReply,
  assignedToUserId: string | null,
  currentAssignedToUserId?: string | null,
): Promise<boolean> {
  const user = (request as any).user as { id: string };
  const ctx = (request as any).tenantContext as {
    tenantId: string;
    role: 'owner' | 'admin' | 'member';
    viaPlatformRole: boolean;
  };
  const mayAssignOthers = ctx.viaPlatformRole || ctx.role === 'owner' || ctx.role === 'admin';

  if (!mayAssignOthers) {
    const assigningAnotherUser = assignedToUserId !== null && assignedToUserId !== user.id;
    const claimingAnotherUserTicket = currentAssignedToUserId !== undefined
      && assignedToUserId === user.id
      && currentAssignedToUserId !== null
      && currentAssignedToUserId !== user.id;
    const releasingAnotherUser = currentAssignedToUserId !== undefined
      && assignedToUserId === null
      && currentAssignedToUserId !== null
      && currentAssignedToUserId !== user.id;
    if (assigningAnotherUser || claimingAnotherUserTicket || releasingAnotherUser) {
      reply.code(403).send({
        error: "Tenant admin role is required to change another technician's assignment",
        code: 'TICKET_ASSIGNMENT_FORBIDDEN',
      });
      return false;
    }
  }

  if (assignedToUserId === null) return true;

  const membership = await getTenantMembership(assignedToUserId, ctx.tenantId);
  const access = membership
    ? await resolveTenantModuleAccess(assignedToUserId, ctx.tenantId, 'techdeck')
    : null;
  if (!membership || !access?.hasAccess) {
    reply.code(400).send({
      error: 'Assignee must be an active TechDeck user in this tenant',
      code: 'INVALID_ASSIGNEE',
    });
    return false;
  }
  return true;
}

async function validateTechDeckTicketReferences(
  request: FastifyRequest,
  reply: FastifyReply,
  references: { directoryOrganizationId: string | null; directorySiteId: string | null; configurationItemId: string | null },
): Promise<boolean> {
  const ctx = (request as any).tenantContext as { tenantId: string };
  if (references.directorySiteId && !references.directoryOrganizationId) {
    reply.code(400).send({ error: 'Directory organization is required when a site is selected', code: 'DIRECTORY_ORGANIZATION_REQUIRED' });
    return false;
  }
  if (references.directoryOrganizationId) {
    const [organization] = await db.select({ id: directoryOrganizations.id }).from(directoryOrganizations).where(and(
      eq(directoryOrganizations.tenantId, ctx.tenantId), eq(directoryOrganizations.id, references.directoryOrganizationId), isNull(directoryOrganizations.archivedAt),
    )).limit(1);
    if (!organization) {
      reply.code(404).send({ error: 'Directory organization not found', code: 'DIRECTORY_ORGANIZATION_NOT_FOUND' });
      return false;
    }
  }
  if (references.directorySiteId) {
    const [site] = await db.select({ id: directorySites.id, organizationId: directorySites.organizationId }).from(directorySites).where(and(
      eq(directorySites.tenantId, ctx.tenantId), eq(directorySites.id, references.directorySiteId), isNull(directorySites.archivedAt),
    )).limit(1);
    if (!site || (references.directoryOrganizationId && site.organizationId !== references.directoryOrganizationId)) {
      reply.code(404).send({ error: 'Directory site not found', code: 'DIRECTORY_SITE_NOT_FOUND' });
      return false;
    }
  }
  if (references.configurationItemId) {
    const [item] = await db.select({ id: techdeckAssets.id }).from(techdeckAssets).where(and(
      eq(techdeckAssets.tenantId, ctx.tenantId), eq(techdeckAssets.id, references.configurationItemId), isNull(techdeckAssets.deletedAt),
    )).limit(1);
    if (!item) {
      reply.code(404).send({ error: 'Configuration item not found', code: 'CONFIGURATION_ITEM_NOT_FOUND' });
      return false;
    }
  }
  return true;
}

type StudyCard = { id: string; question: string; answer: string };

function buildCards(source: string): StudyCard[] {
  const sentences = source
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);
  return sentences.slice(0, 6).map((sentence, idx) => {
    const subject = sentence
      .split(/\s+/)
      .slice(0, 3)
      .join(' ')
      .replace(/[.,!?;:]+$/, '');
    return {
      id: `card_${idx}_${Date.now().toString(36)}`,
      question: `What does the source say about ${subject}?`,
      answer: sentence,
    };
  });
}

// Extract a JSON array from a model response. Tolerates code-fenced output and
// leading/trailing prose by isolating the first `[ ... ]` block.
function extractJsonArray(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('[');
  const end = candidate.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

// Ask the AI provider for Q/A pairs. Returns null when the provider is the
// test provider (so the caller can use the deterministic splitter instead), when the
// call fails, or when the response is unparseable / empty.
async function buildCardsWithAi(source: string): Promise<StudyCard[] | null> {
  const provider = getAiProvider();
  if (provider.name !== 'openai') return null;

  const systemPrompt =
    'You generate study flashcards from a learner-supplied source. ' +
    'Return ONLY a JSON array of 3 to 6 objects with the exact shape ' +
    '{"question": string, "answer": string}. Each question must be answerable ' +
    'from the source alone. Keep answers concise (1-2 sentences). No prose, no markdown.';
  const userPrompt = `Source:\n"""\n${source}\n"""`;

  let response;
  try {
    response = await provider.complete({
      systemPrompt,
      userPrompt,
      maxTokens: 800,
      temperature: 0.3,
    });
  } catch (err) {
    console.warn('[studyforge] AI provider failed, falling back to splitter:', err);
    return null;
  }

  const parsed = extractJsonArray(response.text);
  if (!Array.isArray(parsed)) return null;

  const stamp = Date.now().toString(36);
  const cards: StudyCard[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const q = obj.question;
    const a = obj.answer;
    if (typeof q !== 'string' || typeof a !== 'string') continue;
    const question = q.trim().slice(0, 500);
    const answer = a.trim().slice(0, 1000);
    if (question.length < 3 || answer.length < 1) continue;
    cards.push({ id: `card_${cards.length}_${stamp}`, question, answer });
    if (cards.length >= 6) break;
  }
  return cards.length > 0 ? cards : null;
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64) || 'untitled'
  );
}

type TradeFlowKitTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function normalizeTradeFlowKitCustomerName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function normalizeTradeFlowKitCustomerPhone(value: string | null): string | null {
  const normalized = value?.replace(/\D/g, '') ?? '';
  return normalized.length >= 7 ? normalized : null;
}

function tradeFlowKitCustomerImportSourceId(input: TradeFlowKitCustomerInput): string {
  const fingerprint = createHash('sha256').update(JSON.stringify({
    name: normalizeTradeFlowKitCustomerName(input.name),
    email: input.email?.toLocaleLowerCase('en-US') ?? null,
    phone: normalizeTradeFlowKitCustomerPhone(input.phone),
    address: input.address?.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US') ?? null,
  })).digest('hex');
  return `customer-import:${fingerprint}`;
}

async function createLinkedTradeFlowKitCustomer(
  tx: TradeFlowKitTransaction,
  actor: { tenantId: string; userId: string },
  input: TradeFlowKitCustomerInput,
  options: { sourceId?: string; deduplicateOrganization?: boolean; action?: 'created' | 'imported' } = {},
) {
  const normalizedName = normalizeTradeFlowKitCustomerName(input.name);
  let [organization] = await tx.select().from(directoryOrganizations).where(and(
    eq(directoryOrganizations.tenantId, actor.tenantId),
    eq(directoryOrganizations.normalizedName, normalizedName),
    isNull(directoryOrganizations.archivedAt),
  )).limit(1);
  if (!organization) {
    [organization] = await tx.insert(directoryOrganizations).values({
      tenantId: actor.tenantId, name: input.name, normalizedName, type: 'customer', status: 'active',
      notes: input.notes, createdByUserId: actor.userId, updatedByUserId: actor.userId,
    }).onConflictDoNothing().returning();
    if (!organization) {
      [organization] = await tx.select().from(directoryOrganizations).where(and(
        eq(directoryOrganizations.tenantId, actor.tenantId),
        eq(directoryOrganizations.normalizedName, normalizedName),
        isNull(directoryOrganizations.archivedAt),
      )).limit(1);
    }
  }
  if (!organization) throw new Error('Directory organization could not be resolved');

  if (options.deduplicateOrganization) {
    const [existing] = await tx.select().from(tradeflowkitCustomers).where(and(
      eq(tradeflowkitCustomers.tenantId, actor.tenantId),
      eq(tradeflowkitCustomers.organizationId, organization.id),
    )).limit(1);
    if (existing) return { kind: 'duplicate' as const, customer: existing };
  }

  let primaryContactId: string | null = null;
  if (input.email || input.phone) {
    const parts = input.name.trim().split(/\s+/);
    const [createdContact] = await tx.insert(directoryContacts).values({
      tenantId: actor.tenantId, firstName: parts.shift() || input.name, lastName: parts.join(' '), normalizedName,
      email: input.email, normalizedEmail: input.email?.toLowerCase() ?? null, phone: input.phone,
      createdByUserId: actor.userId, updatedByUserId: actor.userId,
    }).onConflictDoNothing().returning();
    if (createdContact) primaryContactId = createdContact.id;
    else if (input.email) {
      const [existingContact] = await tx.select({ id: directoryContacts.id }).from(directoryContacts).where(and(
        eq(directoryContacts.tenantId, actor.tenantId),
        eq(directoryContacts.normalizedEmail, input.email.toLowerCase()),
        isNull(directoryContacts.archivedAt),
      )).limit(1);
      primaryContactId = existingContact?.id ?? null;
    }
    if (primaryContactId) {
      await tx.insert(directoryOrganizationContacts).values({
        tenantId: actor.tenantId, organizationId: organization.id, contactId: primaryContactId,
        role: 'primary', isPrimary: true, createdByUserId: actor.userId,
      }).onConflictDoNothing();
    }
  }

  const values = {
    ...input, tenantId: actor.tenantId, createdByUserId: actor.userId,
    organizationId: organization.id, primaryContactId, sourceId: options.sourceId,
  };
  const [created] = options.sourceId
    ? await tx.insert(tradeflowkitCustomers).values(values).onConflictDoNothing().returning()
    : await tx.insert(tradeflowkitCustomers).values(values).returning();
  if (!created) {
    const [duplicate] = await tx.select().from(tradeflowkitCustomers).where(and(
      eq(tradeflowkitCustomers.tenantId, actor.tenantId),
      eq(tradeflowkitCustomers.sourceId, options.sourceId!),
    )).limit(1);
    if (!duplicate) throw new Error('Imported customer could not be resolved');
    return { kind: 'duplicate' as const, customer: duplicate };
  }
  await tx.insert(activityFeed).values({
    tenantId: actor.tenantId, userId: actor.userId, action: options.action ?? 'created',
    entityType: 'tradeflowkit_customer', entityId: created.id,
    metadata: {
      name: created.name,
      organizationId: organization.id,
      source: options.sourceId ? 'customer_import' : 'manual',
    },
  });
  return { kind: 'created' as const, customer: created };
}

export async function registerModuleShellRoutes(app: FastifyInstance) {
  await registerCallCommandRoutes(app);
  await registerPulseDeskRoutes(app);
  await registerPulseDeskServiceDeskRoutes(app);
  await registerNinjaPoolHallRoutes(app);
  await registerTradeFlowKitRoutes(app);
  await registerTechDeckRoutes(app);
  await registerTorqueShedRoutes(app);
  await registerTorqueAssistRoutes(app);
  await registerTorqueShedSocialRoutes(app);
  await registerFaultlineLabRoutes(app);
  await registerBrandForgeOsRoutes(app);
  await registerStudyForgeRoutes(app);
  await registerNinjaLaunchKitRoutes(app);
  await registerNinjamationRoutes(app);
  await registerOutCallRoutes(app);

  // ===== TradeFlowKit: lead and revenue compatibility routes ==============
  //
  // The state-5 task, portal, settings, messaging, analytics, and payment
  // surfaces live in tradeflowkit-routes.ts. These original lead/revenue
  // paths remain the stable compatibility contract used by the native shell.
  app.get(
    '/v1/modules/tradeflowkit/leads',
    { preHandler: [...tradeflowkitGuards] },
    async (request, reply) => {
      let query;
      try {
        query = parseTradeFlowKitLeadListQuery(request.query);
      } catch (err) {
        if (err instanceof TradeFlowKitLeadValidationError) {
          return reply.code(400).send({ error: err.message, code: err.code, field: err.field });
        }
        throw err;
      }

      const ctx = (request as any).tenantContext;
      const conditions = [
        eq(tradeflowkitLeads.tenantId, ctx.tenantId),
        isNull(tradeflowkitLeads.deletedAt),
      ];
      if (query.status) conditions.push(eq(tradeflowkitLeads.status, query.status));
      if (query.search) {
        const pattern = `%${query.search}%`;
        conditions.push(or(
          ilike(tradeflowkitLeads.name, pattern),
          ilike(tradeflowkitLeads.phone, pattern),
          ilike(tradeflowkitLeads.email, pattern),
          ilike(tradeflowkitLeads.serviceType, pattern),
        )!);
      }

      const leads = await db
        .select()
        .from(tradeflowkitLeads)
        .where(and(...conditions))
        .orderBy(desc(tradeflowkitLeads.createdAt))
        .limit(100);
      return { leads };
    },
  );

  app.get(
    '/v1/modules/tradeflowkit/leads/:id',
    { preHandler: [...tradeflowkitGuards] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const ctx = (request as any).tenantContext;
      const [lead] = await db
        .select()
        .from(tradeflowkitLeads)
        .where(and(
          eq(tradeflowkitLeads.id, id),
          eq(tradeflowkitLeads.tenantId, ctx.tenantId),
          isNull(tradeflowkitLeads.deletedAt),
        ))
        .limit(1);
      if (!lead) return reply.code(404).send({ error: 'Lead not found', code: 'LEAD_NOT_FOUND' });
      return lead;
    },
  );

  app.post(
    '/v1/modules/tradeflowkit/leads',
    { preHandler: [...tradeflowkitWriteGuards] },
    async (request, reply) => {
      let input;
      try {
        input = parseTradeFlowKitLeadCreate(request.body);
      } catch (err) {
        if (err instanceof TradeFlowKitLeadValidationError) {
          return reply.code(400).send({ error: err.message, code: err.code, field: err.field });
        }
        throw err;
      }

      const user = (request as any).user;
      const ctx = (request as any).tenantContext;
      const lead = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(tradeflowkitLeads)
          .values({
            ...input,
            tenantId: ctx.tenantId,
            createdByUserId: user.id,
            source: 'manual',
            status: 'new',
          })
          .returning();
        await tx.insert(activityFeed).values({
          userId: user.id,
          tenantId: ctx.tenantId,
          action: 'created',
          entityType: 'tradeflowkit_lead',
          entityId: created.id,
          metadata: { source: created.source, status: created.status, consentToSms: created.consentToSms },
        });
        return created;
      });
      return reply.code(201).send(lead);
    },
  );

  app.patch(
    '/v1/modules/tradeflowkit/leads/:id',
    { preHandler: [...tradeflowkitWriteGuards] },
    async (request, reply) => {
      let patch;
      try {
        patch = parseTradeFlowKitLeadPatch(request.body);
      } catch (err) {
        if (err instanceof TradeFlowKitLeadValidationError) {
          return reply.code(400).send({ error: err.message, code: err.code, field: err.field });
        }
        throw err;
      }

      const { id } = request.params as { id: string };
      const user = (request as any).user;
      const ctx = (request as any).tenantContext;
      const [before] = await db
        .select()
        .from(tradeflowkitLeads)
        .where(and(
          eq(tradeflowkitLeads.id, id),
          eq(tradeflowkitLeads.tenantId, ctx.tenantId),
          isNull(tradeflowkitLeads.deletedAt),
        ))
        .limit(1);
      if (!before) return reply.code(404).send({ error: 'Lead not found', code: 'LEAD_NOT_FOUND' });

      const statusChanged = patch.status !== undefined && patch.status !== before.status;
      const contactStarted = patch.status !== undefined
        && ['contacted', 'qualified', 'follow_up'].includes(patch.status)
        && !before.lastContactedAt;
      const changedFields = Object.keys(patch);

      const lead = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(tradeflowkitLeads)
          .set({
            ...patch,
            ...(contactStarted ? { lastContactedAt: new Date() } : {}),
            updatedAt: new Date(),
          })
          .where(and(
            eq(tradeflowkitLeads.id, id),
            eq(tradeflowkitLeads.tenantId, ctx.tenantId),
            isNull(tradeflowkitLeads.deletedAt),
          ))
          .returning();
        if (!updated) return null;
        await tx.insert(activityFeed).values({
          userId: user.id,
          tenantId: ctx.tenantId,
          action: statusChanged ? 'status_changed' : 'updated',
          entityType: 'tradeflowkit_lead',
          entityId: updated.id,
          metadata: {
            changedFields,
            ...(statusChanged ? { fromStatus: before.status, toStatus: updated.status } : {}),
            ...(patch.consentToSms !== undefined ? { consentToSms: patch.consentToSms } : {}),
          },
        });
        return updated;
      });
      if (!lead) return reply.code(404).send({ error: 'Lead not found', code: 'LEAD_NOT_FOUND' });
      return lead;
    },
  );

  app.delete(
    '/v1/modules/tradeflowkit/leads/:id',
    { preHandler: [...tradeflowkitWriteGuards] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = (request as any).user;
      const ctx = (request as any).tenantContext;
      const lead = await db.transaction(async (tx) => {
        const [deleted] = await tx
          .update(tradeflowkitLeads)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(and(
            eq(tradeflowkitLeads.id, id),
            eq(tradeflowkitLeads.tenantId, ctx.tenantId),
            isNull(tradeflowkitLeads.deletedAt),
          ))
          .returning();
        if (!deleted) return null;
        await tx.insert(activityFeed).values({
          userId: user.id,
          tenantId: ctx.tenantId,
          action: 'deleted',
          entityType: 'tradeflowkit_lead',
          entityId: deleted.id,
          metadata: { status: deleted.status },
        });
        return deleted;
      });
      if (!lead) return reply.code(404).send({ error: 'Lead not found', code: 'LEAD_NOT_FOUND' });
      return { ok: true };
    },
  );

  // ===== TradeFlowKit: customer -> job -> quote -> invoice -> payment =====
  const revenueValidation = (reply: FastifyReply, err: unknown) => {
    if (!(err instanceof TradeFlowKitRevenueValidationError)) return false;
    reply.code(400).send({ error: 'Invalid revenue workflow input', code: err.code, field: err.field });
    return true;
  };

  app.get('/v1/modules/tradeflowkit/revenue', { preHandler: [...tradeflowkitGuards] }, async (request) => {
    const ctx = (request as any).tenantContext;
    const tenant = eq(tradeflowkitCustomers.tenantId, ctx.tenantId);
    const [customers, jobs, quotes, invoices] = await Promise.all([
      db.select().from(tradeflowkitCustomers).where(and(tenant, isNull(tradeflowkitCustomers.deletedAt))).orderBy(desc(tradeflowkitCustomers.updatedAt)).limit(100),
      db.select().from(tradeflowkitJobs).where(and(eq(tradeflowkitJobs.tenantId, ctx.tenantId), isNull(tradeflowkitJobs.deletedAt))).orderBy(desc(tradeflowkitJobs.updatedAt)).limit(100),
      db.select().from(tradeflowkitQuotes).where(and(eq(tradeflowkitQuotes.tenantId, ctx.tenantId), isNull(tradeflowkitQuotes.deletedAt))).orderBy(desc(tradeflowkitQuotes.updatedAt)).limit(100),
      db.select().from(tradeflowkitInvoices).where(and(eq(tradeflowkitInvoices.tenantId, ctx.tenantId), isNull(tradeflowkitInvoices.deletedAt))).orderBy(desc(tradeflowkitInvoices.updatedAt)).limit(100),
    ]);
    return { customers, jobs, quotes, invoices };
  });

  app.post('/v1/modules/tradeflowkit/customers', { preHandler: [...tradeflowkitWriteGuards] }, async (request, reply) => {
    let input;
    try { input = parseCustomerCreate(request.body); } catch (err) { if (revenueValidation(reply, err)) return; throw err; }
    const ctx = (request as any).tenantContext;
    const user = (request as any).user;
    const customer = await db.transaction(async (tx) => {
      const outcome = await createLinkedTradeFlowKitCustomer(
        tx,
        { tenantId: ctx.tenantId, userId: user.id },
        input,
      );
      return outcome.customer;
    });
    return reply.code(201).send(customer);
  });

  app.patch('/v1/modules/tradeflowkit/customers/:id', { preHandler: [...tradeflowkitWriteGuards] }, async (request, reply) => {
    const ctx = (request as any).tenantContext as { tenantId: string };
    const user = (request as any).user as { id: string };
    const { id } = request.params as { id: string };
    let input;
    try { input = parseCustomerUpdate(request.body); } catch (err) { if (revenueValidation(reply, err)) return; throw err; }

    try {
      const outcome = await db.transaction(async tx => {
        const [current] = await tx.select().from(tradeflowkitCustomers).where(and(
          eq(tradeflowkitCustomers.id, id),
          eq(tradeflowkitCustomers.tenantId, ctx.tenantId),
          isNull(tradeflowkitCustomers.deletedAt),
        )).limit(1);
        if (!current) return { kind: 'not_found' as const };
        if (current.version !== input.expectedVersion) {
          return { kind: 'version_conflict' as const, currentVersion: current.version };
        }

        const normalizedName = normalizeTradeFlowKitCustomerName(input.name);
        if (current.organizationId) {
          const [duplicateOrganization] = await tx.select({ id: directoryOrganizations.id }).from(directoryOrganizations).where(and(
            eq(directoryOrganizations.tenantId, ctx.tenantId),
            eq(directoryOrganizations.normalizedName, normalizedName),
            ne(directoryOrganizations.id, current.organizationId),
            isNull(directoryOrganizations.archivedAt),
          )).limit(1);
          if (duplicateOrganization) return { kind: 'duplicate_name' as const };
        }

        const [updated] = await tx.update(tradeflowkitCustomers).set({
          name: input.name,
          phone: input.phone,
          email: input.email,
          address: input.address,
          notes: input.notes,
          updatedAt: new Date(),
          version: sql`${tradeflowkitCustomers.version} + 1`,
        }).where(and(
          eq(tradeflowkitCustomers.id, id),
          eq(tradeflowkitCustomers.tenantId, ctx.tenantId),
          eq(tradeflowkitCustomers.version, input.expectedVersion),
          isNull(tradeflowkitCustomers.deletedAt),
        )).returning();
        if (!updated) return { kind: 'version_conflict' as const, currentVersion: current.version };

        if (current.organizationId) {
          const [organization] = await tx.select().from(directoryOrganizations).where(and(
            eq(directoryOrganizations.id, current.organizationId),
            eq(directoryOrganizations.tenantId, ctx.tenantId),
            isNull(directoryOrganizations.archivedAt),
          )).limit(1);
          if (!organization) throw new Error('TRADEFLOWKIT_DIRECTORY_ORGANIZATION_NOT_FOUND');
          const [updatedOrganization] = await tx.update(directoryOrganizations).set({
            name: input.name,
            normalizedName,
            notes: input.notes,
            updatedByUserId: user.id,
            updatedAt: new Date(),
            version: sql`${directoryOrganizations.version} + 1`,
          }).where(and(
            eq(directoryOrganizations.id, organization.id),
            eq(directoryOrganizations.tenantId, ctx.tenantId),
            eq(directoryOrganizations.version, organization.version),
            isNull(directoryOrganizations.archivedAt),
          )).returning();
          if (!updatedOrganization) throw new Error('TRADEFLOWKIT_DIRECTORY_VERSION_CONFLICT');
        }

        let primaryContactId = current.primaryContactId;
        if (primaryContactId) {
          const [contact] = await tx.select().from(directoryContacts).where(and(
            eq(directoryContacts.id, primaryContactId),
            eq(directoryContacts.tenantId, ctx.tenantId),
            isNull(directoryContacts.archivedAt),
          )).limit(1);
          if (contact) {
            const parts = input.name.trim().split(/\s+/);
            const [updatedContact] = await tx.update(directoryContacts).set({
              firstName: parts.shift() || input.name,
              lastName: parts.join(' '),
              normalizedName,
              email: input.email,
              normalizedEmail: input.email?.toLocaleLowerCase('en-US') ?? null,
              phone: input.phone,
              updatedByUserId: user.id,
              updatedAt: new Date(),
              version: sql`${directoryContacts.version} + 1`,
            }).where(and(
              eq(directoryContacts.id, contact.id),
              eq(directoryContacts.tenantId, ctx.tenantId),
              eq(directoryContacts.version, contact.version),
              isNull(directoryContacts.archivedAt),
            )).returning();
            if (!updatedContact) throw new Error('TRADEFLOWKIT_DIRECTORY_VERSION_CONFLICT');
          }
        } else if (input.email || input.phone) {
          const parts = input.name.trim().split(/\s+/);
          const [createdContact] = await tx.insert(directoryContacts).values({
            tenantId: ctx.tenantId,
            firstName: parts.shift() || input.name,
            lastName: parts.join(' '),
            normalizedName,
            email: input.email,
            normalizedEmail: input.email?.toLocaleLowerCase('en-US') ?? null,
            phone: input.phone,
            createdByUserId: user.id,
            updatedByUserId: user.id,
          }).onConflictDoNothing().returning();
          primaryContactId = createdContact?.id ?? null;
          if (!primaryContactId && input.email) {
            const [existingContact] = await tx.select({ id: directoryContacts.id }).from(directoryContacts).where(and(
              eq(directoryContacts.tenantId, ctx.tenantId),
              eq(directoryContacts.normalizedEmail, input.email.toLocaleLowerCase('en-US')),
              isNull(directoryContacts.archivedAt),
            )).limit(1);
            primaryContactId = existingContact?.id ?? null;
          }
          if (!primaryContactId) throw new Error('TRADEFLOWKIT_DIRECTORY_CONTACT_NOT_CREATED');
          if (current.organizationId) {
            await tx.insert(directoryOrganizationContacts).values({
              tenantId: ctx.tenantId,
              organizationId: current.organizationId,
              contactId: primaryContactId,
              role: 'primary',
              isPrimary: true,
              createdByUserId: user.id,
            }).onConflictDoNothing();
          }
          const [linkedCustomer] = await tx.update(tradeflowkitCustomers).set({ primaryContactId }).where(and(
            eq(tradeflowkitCustomers.id, id),
            eq(tradeflowkitCustomers.tenantId, ctx.tenantId),
            eq(tradeflowkitCustomers.version, input.expectedVersion + 1),
            isNull(tradeflowkitCustomers.deletedAt),
          )).returning({ id: tradeflowkitCustomers.id });
          if (!linkedCustomer) throw new Error('TRADEFLOWKIT_DIRECTORY_VERSION_CONFLICT');
          updated.primaryContactId = primaryContactId;
        }

        await tx.insert(activityFeed).values({
          tenantId: ctx.tenantId,
          userId: user.id,
          action: 'updated',
          entityType: 'tradeflowkit_customer',
          entityId: id,
          metadata: { changedFields: ['name', 'email', 'phone', 'address', 'notes'] },
        });
        return { kind: 'updated' as const, customer: updated };
      });

      if (outcome.kind === 'not_found') return reply.code(404).send({ error: 'Customer not found', code: 'CUSTOMER_NOT_FOUND' });
      if (outcome.kind === 'version_conflict') {
        return reply.code(409).send({
          error: 'Customer changed; reload and retry',
          code: 'CUSTOMER_VERSION_CONFLICT',
          currentVersion: outcome.currentVersion,
        });
      }
      if (outcome.kind === 'duplicate_name') {
        return reply.code(409).send({ error: 'An active customer already uses that name', code: 'CUSTOMER_NAME_CONFLICT' });
      }
      return outcome.customer;
    } catch (error) {
      const databaseCode = (error as { code?: string; cause?: { code?: string } })?.code
        ?? (error as { cause?: { code?: string } })?.cause?.code;
      const message = error instanceof Error ? error.message : '';
      if (databaseCode === '23505') {
        return reply.code(409).send({ error: 'Customer details conflict with an active Directory record', code: 'CUSTOMER_DIRECTORY_CONFLICT' });
      }
      if (message === 'TRADEFLOWKIT_DIRECTORY_ORGANIZATION_NOT_FOUND') {
        return reply.code(409).send({ error: 'The linked Directory organization is unavailable', code: 'CUSTOMER_DIRECTORY_MISSING' });
      }
      if (message === 'TRADEFLOWKIT_DIRECTORY_VERSION_CONFLICT') {
        return reply.code(409).send({ error: 'The linked Directory record changed; reload and retry', code: 'CUSTOMER_DIRECTORY_VERSION_CONFLICT' });
      }
      if (message === 'TRADEFLOWKIT_DIRECTORY_CONTACT_NOT_CREATED') {
        return reply.code(409).send({ error: 'The linked Directory contact could not be created', code: 'CUSTOMER_DIRECTORY_CONTACT_CONFLICT' });
      }
      throw error;
    }
  });

  app.delete('/v1/modules/tradeflowkit/customers/:id', { preHandler: [...tradeflowkitWriteGuards] }, async (request, reply) => {
    const ctx = (request as any).tenantContext as { tenantId: string };
    const user = (request as any).user as { id: string };
    const { id } = request.params as { id: string };
    let input;
    try { input = parseDocumentArchive(request.body); } catch (err) { if (revenueValidation(reply, err)) return; throw err; }

    const outcome = await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`tradeflowkit:customer:${ctx.tenantId}:${id}`}))`);
      const [current] = await tx.select().from(tradeflowkitCustomers).where(and(
        eq(tradeflowkitCustomers.id, id),
        eq(tradeflowkitCustomers.tenantId, ctx.tenantId),
        isNull(tradeflowkitCustomers.deletedAt),
      )).limit(1);
      if (!current) return { kind: 'not_found' as const };
      if (current.version !== input.expectedVersion) {
        return { kind: 'version_conflict' as const, currentVersion: current.version };
      }
      const [activeJobs, activeQuotes, activeInvoices] = await Promise.all([
        tx.select({ id: tradeflowkitJobs.id }).from(tradeflowkitJobs).where(and(
          eq(tradeflowkitJobs.tenantId, ctx.tenantId),
          eq(tradeflowkitJobs.customerId, id),
          isNull(tradeflowkitJobs.deletedAt),
        )).limit(1),
        tx.select({ id: tradeflowkitQuotes.id }).from(tradeflowkitQuotes).where(and(
          eq(tradeflowkitQuotes.tenantId, ctx.tenantId),
          eq(tradeflowkitQuotes.customerId, id),
          isNull(tradeflowkitQuotes.deletedAt),
        )).limit(1),
        tx.select({ id: tradeflowkitInvoices.id }).from(tradeflowkitInvoices).where(and(
          eq(tradeflowkitInvoices.tenantId, ctx.tenantId),
          eq(tradeflowkitInvoices.customerId, id),
          isNull(tradeflowkitInvoices.deletedAt),
        )).limit(1),
      ]);
      if (activeJobs.length || activeQuotes.length || activeInvoices.length) return { kind: 'active_history' as const };
      const [archived] = await tx.update(tradeflowkitCustomers).set({
        deletedAt: new Date(),
        updatedAt: new Date(),
        version: sql`${tradeflowkitCustomers.version} + 1`,
      }).where(and(
        eq(tradeflowkitCustomers.id, id),
        eq(tradeflowkitCustomers.tenantId, ctx.tenantId),
        eq(tradeflowkitCustomers.version, input.expectedVersion),
        isNull(tradeflowkitCustomers.deletedAt),
      )).returning();
      if (!archived) return { kind: 'version_conflict' as const, currentVersion: current.version };
      await tx.insert(activityFeed).values({
        tenantId: ctx.tenantId,
        userId: user.id,
        action: 'archived',
        entityType: 'tradeflowkit_customer',
        entityId: id,
        metadata: { organizationId: current.organizationId },
      });
      return { kind: 'archived' as const, customer: archived };
    });

    if (outcome.kind === 'not_found') return reply.code(404).send({ error: 'Customer not found', code: 'CUSTOMER_NOT_FOUND' });
    if (outcome.kind === 'version_conflict') {
      return reply.code(409).send({
        error: 'Customer changed; reload and retry',
        code: 'CUSTOMER_VERSION_CONFLICT',
        currentVersion: outcome.currentVersion,
      });
    }
    if (outcome.kind === 'active_history') {
      return reply.code(409).send({
        error: 'Archive active jobs, quotes, and invoices before archiving this customer',
        code: 'CUSTOMER_HAS_ACTIVE_HISTORY',
      });
    }
    return { ok: true, customer: outcome.customer };
  });

  app.post('/v1/modules/tradeflowkit/customers/import', { preHandler: [...tradeflowkitWriteGuards] }, async (request, reply) => {
    const rawIdempotencyKey = request.headers['idempotency-key'];
    const idempotencyKey = typeof rawIdempotencyKey === 'string' ? rawIdempotencyKey.trim() : '';
    if (!/^[A-Za-z0-9._:-]{8,160}$/.test(idempotencyKey)) {
      return reply.code(400).send({
        error: 'A valid Idempotency-Key header is required',
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        field: 'Idempotency-Key',
      });
    }
    let input;
    try { input = parseCustomerImport(request.body); } catch (err) { if (revenueValidation(reply, err)) return; throw err; }
    const ctx = (request as any).tenantContext;
    const user = (request as any).user;
    const [moduleRow] = await db.select({ id: modules.id }).from(modules)
      .where(eq(modules.slug, 'tradeflowkit'))
      .limit(1);
    if (!moduleRow) {
      return reply.code(503).send({
        error: 'TradeFlowKit module registry is unavailable',
        code: 'TRADEFLOWKIT_MODULE_UNAVAILABLE',
      });
    }
    const result = await db.transaction(async (tx) => {
      // Serialize imports for one tenant so concurrent uploads cannot both
      // pass the same duplicate snapshot before either commits.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'tradeflowkit_customer_import:' + ctx.tenantId}))`);
      const idempotency = await beginIdempotentOperation({
        tenantId: ctx.tenantId,
        moduleId: moduleRow.id,
        scope: 'tradeflowkit-customer-import',
        idempotencyKey,
        request: request.body,
        leaseMs: 60_000,
      }, tx);
      if (idempotency.state === 'replay') {
        return { kind: 'response' as const, response: idempotency.responseJson };
      }
      if (idempotency.state === 'conflict') return { kind: 'conflict' as const };
      if (idempotency.state === 'in_progress') return { kind: 'in_progress' as const };

      const existing = await tx.select({
        name: tradeflowkitCustomers.name,
        email: tradeflowkitCustomers.email,
        phone: tradeflowkitCustomers.phone,
      }).from(tradeflowkitCustomers).where(eq(tradeflowkitCustomers.tenantId, ctx.tenantId));
      const names = new Set(existing.map(row => normalizeTradeFlowKitCustomerName(row.name)));
      const emails = new Set(existing.map(row => row.email?.toLocaleLowerCase('en-US')).filter((value): value is string => !!value));
      const phones = new Set(existing.map(row => normalizeTradeFlowKitCustomerPhone(row.phone)).filter((value): value is string => !!value));
      const importedCustomers: Array<typeof tradeflowkitCustomers.$inferSelect> = [];
      const skipped: Array<{ row: number; reason: 'duplicate_name' | 'duplicate_email' | 'duplicate_phone' | 'duplicate_source' }> = [];

      for (const customerInput of input.customers) {
        const { row, ...customer } = customerInput;
        const name = normalizeTradeFlowKitCustomerName(customer.name);
        const email = customer.email?.toLocaleLowerCase('en-US') ?? null;
        const phone = normalizeTradeFlowKitCustomerPhone(customer.phone);
        const duplicateReason = names.has(name) ? 'duplicate_name'
          : email && emails.has(email) ? 'duplicate_email'
            : phone && phones.has(phone) ? 'duplicate_phone'
              : null;
        if (duplicateReason) {
          skipped.push({ row, reason: duplicateReason });
          continue;
        }
        const outcome = await createLinkedTradeFlowKitCustomer(
          tx,
          { tenantId: ctx.tenantId, userId: user.id },
          customer,
          {
            sourceId: tradeFlowKitCustomerImportSourceId(customer),
            deduplicateOrganization: true,
            action: 'imported',
          },
        );
        if (outcome.kind === 'duplicate') {
          skipped.push({ row, reason: 'duplicate_source' });
          continue;
        }
        importedCustomers.push(outcome.customer);
        names.add(name);
        if (email) emails.add(email);
        if (phone) phones.add(phone);
      }

      const response = {
        imported: importedCustomers.length,
        skipped: skipped.length,
        errors: input.errors,
        skippedRows: skipped,
        customers: importedCustomers.map(customer => ({ id: customer.id })),
      };
      await tx.insert(activityFeed).values({
        tenantId: ctx.tenantId,
        userId: user.id,
        action: 'import_completed',
        entityType: 'tradeflowkit_customer_import',
        metadata: {
          idempotencyKey,
          requestSha256: idempotency.requestSha256,
          totalRows: input.totalRows,
          imported: importedCustomers.length,
          skipped: skipped.length,
          errors: input.errors.length,
          validationErrors: input.errors,
          skippedRows: skipped,
          importedCustomerIds: importedCustomers.map(customer => customer.id),
        },
      });
      await completeIdempotentOperation({
        tenantId: ctx.tenantId,
        id: idempotency.id,
        leaseExpiresAt: idempotency.leaseExpiresAt,
        responseStatus: 200,
        responseJson: response,
      }, tx);
      return {
        kind: 'response' as const,
        response,
      };
    });
    if (result.kind === 'conflict') {
      return reply.code(409).send({
        error: 'Idempotency-Key was already used with a different customer import',
        code: 'IDEMPOTENCY_KEY_REUSE',
      });
    }
    if (result.kind === 'in_progress') {
      return reply.code(409).send({
        error: 'Customer import is already in progress',
        code: 'IDEMPOTENCY_IN_PROGRESS',
      });
    }
    return reply.code(200).send(result.response);
  });

  app.post('/v1/modules/tradeflowkit/jobs', { preHandler: [...tradeflowkitWriteGuards] }, async (request, reply) => {
    let input;
    try { input = parseJobCreate(request.body); } catch (err) { if (revenueValidation(reply, err)) return; throw err; }
    const ctx = (request as any).tenantContext;
    const user = (request as any).user;
    const [customer] = await db.select({ id: tradeflowkitCustomers.id }).from(tradeflowkitCustomers).where(and(
      eq(tradeflowkitCustomers.id, input.customerId), eq(tradeflowkitCustomers.tenantId, ctx.tenantId), isNull(tradeflowkitCustomers.deletedAt),
    )).limit(1);
    if (!customer) return reply.code(404).send({ error: 'Customer not found', code: 'CUSTOMER_NOT_FOUND' });
    if (input.scheduledStart && input.scheduledEnd && input.scheduledEnd <= input.scheduledStart) {
      return reply.code(400).send({ error: 'Scheduled end must follow start', code: 'SCHEDULE_INVALID' });
    }
    const job = await db.transaction(async (tx) => {
      const number = await allocateTradeFlowKitNumber(tx, ctx.tenantId, 'job');
      const [created] = await tx.insert(tradeflowkitJobs).values({
        ...input, number, tenantId: ctx.tenantId, createdByUserId: user.id,
      }).returning();
      await tx.insert(activityFeed).values({
        tenantId: ctx.tenantId, userId: user.id, action: 'created',
        entityType: 'tradeflowkit_job', entityId: created.id,
        metadata: { customerId: created.customerId, status: created.status, number },
      });
      return created;
    });
    return reply.code(201).send(job);
  });

  app.post('/v1/modules/tradeflowkit/quotes', { preHandler: [...tradeflowkitWriteGuards] }, async (request, reply) => {
    let input;
    try { input = parseQuoteCreate(request.body); } catch (err) { if (revenueValidation(reply, err)) return; throw err; }
    const ctx = (request as any).tenantContext;
    const user = (request as any).user;
    const [customer] = await db.select({ id: tradeflowkitCustomers.id }).from(tradeflowkitCustomers).where(and(
      eq(tradeflowkitCustomers.id, input.customerId), eq(tradeflowkitCustomers.tenantId, ctx.tenantId), isNull(tradeflowkitCustomers.deletedAt),
    )).limit(1);
    if (!customer) return reply.code(404).send({ error: 'Customer not found', code: 'CUSTOMER_NOT_FOUND' });
    if (input.jobId) {
      const [job] = await db.select({ id: tradeflowkitJobs.id }).from(tradeflowkitJobs).where(and(
        eq(tradeflowkitJobs.id, input.jobId), eq(tradeflowkitJobs.tenantId, ctx.tenantId),
        eq(tradeflowkitJobs.customerId, input.customerId), isNull(tradeflowkitJobs.deletedAt),
      )).limit(1);
      if (!job) return reply.code(404).send({ error: 'Job not found for customer', code: 'JOB_NOT_FOUND' });
    }
    const quote = await db.transaction(async (tx) => {
      const number = await allocateTradeFlowKitNumber(tx, ctx.tenantId, 'quote');
      const [created] = await tx.insert(tradeflowkitQuotes).values({
        ...input, number, tenantId: ctx.tenantId, createdByUserId: user.id,
      }).returning();
      await tx.insert(tradeflowkitQuoteItems).values(input.lineItems.map((item, index) => ({
        tenantId: ctx.tenantId, quoteId: created.id, lineNumber: index + 1,
        description: item.description, quantityMilli: item.quantity * 1000,
        unitPriceCents: item.unitPriceCents, lineTotalCents: item.quantity * item.unitPriceCents,
      })));
      await tx.insert(activityFeed).values({
        tenantId: ctx.tenantId, userId: user.id, action: 'created',
        entityType: 'tradeflowkit_quote', entityId: created.id,
        metadata: { customerId: created.customerId, jobId: created.jobId, totalCents: created.totalCents, number },
      });
      return created;
    });
    return reply.code(201).send(quote);
  });

  app.patch('/v1/modules/tradeflowkit/quotes/:id', { preHandler: [...tradeflowkitWriteGuards] }, async (request, reply) => {
    let input;
    try { input = parseQuoteUpdate(request.body); } catch (err) { if (revenueValidation(reply, err)) return; throw err; }
    const { id } = request.params as { id: string };
    const ctx = (request as any).tenantContext;
    const user = (request as any).user;
    const [current] = await db.select().from(tradeflowkitQuotes).where(and(
      eq(tradeflowkitQuotes.id, id), eq(tradeflowkitQuotes.tenantId, ctx.tenantId), isNull(tradeflowkitQuotes.deletedAt),
    )).limit(1);
    if (!current) return reply.code(404).send({ error: 'Quote not found', code: 'QUOTE_NOT_FOUND' });
    if (current.status !== 'draft') {
      return reply.code(409).send({ error: 'Only draft quotes can be edited', code: 'QUOTE_NOT_EDITABLE' });
    }
    const [customer] = await db.select({ id: tradeflowkitCustomers.id }).from(tradeflowkitCustomers).where(and(
      eq(tradeflowkitCustomers.id, input.customerId), eq(tradeflowkitCustomers.tenantId, ctx.tenantId), isNull(tradeflowkitCustomers.deletedAt),
    )).limit(1);
    if (!customer) return reply.code(404).send({ error: 'Customer not found', code: 'CUSTOMER_NOT_FOUND' });
    if (input.jobId) {
      const [job] = await db.select({ id: tradeflowkitJobs.id }).from(tradeflowkitJobs).where(and(
        eq(tradeflowkitJobs.id, input.jobId), eq(tradeflowkitJobs.tenantId, ctx.tenantId),
        eq(tradeflowkitJobs.customerId, input.customerId), isNull(tradeflowkitJobs.deletedAt),
      )).limit(1);
      if (!job) return reply.code(404).send({ error: 'Job not found for customer', code: 'JOB_NOT_FOUND' });
    }
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx.update(tradeflowkitQuotes).set({
        customerId: input.customerId, jobId: input.jobId, lineItems: input.lineItems,
        subtotalCents: input.subtotalCents, taxRateBps: input.taxRateBps, taxCents: input.taxCents,
        discountCents: input.discountCents, totalCents: input.totalCents,
        notes: input.notes, expiresAt: input.expiresAt,
        version: sql`${tradeflowkitQuotes.version} + 1`, updatedAt: new Date(),
      }).where(and(
        eq(tradeflowkitQuotes.id, id), eq(tradeflowkitQuotes.tenantId, ctx.tenantId),
        eq(tradeflowkitQuotes.version, input.expectedVersion), eq(tradeflowkitQuotes.status, 'draft'),
        isNull(tradeflowkitQuotes.deletedAt),
      )).returning();
      if (!row) return null;
      await tx.delete(tradeflowkitQuoteItems).where(and(
        eq(tradeflowkitQuoteItems.tenantId, ctx.tenantId), eq(tradeflowkitQuoteItems.quoteId, id),
      ));
      await tx.insert(tradeflowkitQuoteItems).values(input.lineItems.map((item, index) => ({
        tenantId: ctx.tenantId, quoteId: id, lineNumber: index + 1,
        description: item.description, quantityMilli: item.quantity * 1000,
        unitPriceCents: item.unitPriceCents, lineTotalCents: item.quantity * item.unitPriceCents,
      })));
      await tx.insert(activityFeed).values({
        tenantId: ctx.tenantId, userId: user.id, action: 'updated',
        entityType: 'tradeflowkit_quote', entityId: id,
        metadata: { previousTotalCents: current.totalCents, totalCents: row.totalCents, version: row.version },
      });
      return row;
    });
    if (!updated) return reply.code(409).send({ error: 'Quote changed; reload and retry', code: 'QUOTE_VERSION_CONFLICT' });
    return updated;
  });

  app.delete('/v1/modules/tradeflowkit/quotes/:id', { preHandler: [...tradeflowkitWriteGuards] }, async (request, reply) => {
    let input;
    try { input = parseDocumentArchive(request.body); } catch (err) { if (revenueValidation(reply, err)) return; throw err; }
    const { id } = request.params as { id: string };
    const ctx = (request as any).tenantContext;
    const user = (request as any).user;
    const [current] = await db.select().from(tradeflowkitQuotes).where(and(
      eq(tradeflowkitQuotes.id, id), eq(tradeflowkitQuotes.tenantId, ctx.tenantId), isNull(tradeflowkitQuotes.deletedAt),
    )).limit(1);
    if (!current) return reply.code(404).send({ error: 'Quote not found', code: 'QUOTE_NOT_FOUND' });
    if (!['draft', 'declined', 'expired', 'void'].includes(current.status)) {
      return reply.code(409).send({ error: 'Active quotes cannot be archived', code: 'QUOTE_NOT_ARCHIVABLE' });
    }
    const [linkedInvoice] = await db.select({ id: tradeflowkitInvoices.id }).from(tradeflowkitInvoices).where(and(
      eq(tradeflowkitInvoices.tenantId, ctx.tenantId), eq(tradeflowkitInvoices.sourceQuoteId, id),
      isNull(tradeflowkitInvoices.deletedAt),
    )).limit(1);
    if (linkedInvoice) {
      return reply.code(409).send({ error: 'Quote has an active invoice', code: 'QUOTE_HAS_ACTIVE_INVOICE' });
    }
    const [archived] = await db.transaction(async (tx) => {
      const rows = await tx.update(tradeflowkitQuotes).set({
        deletedAt: new Date(), version: sql`${tradeflowkitQuotes.version} + 1`, updatedAt: new Date(),
      }).where(and(
        eq(tradeflowkitQuotes.id, id), eq(tradeflowkitQuotes.tenantId, ctx.tenantId),
        eq(tradeflowkitQuotes.version, input.expectedVersion), eq(tradeflowkitQuotes.status, current.status),
        isNull(tradeflowkitQuotes.deletedAt),
      )).returning();
      if (!rows[0]) return [];
      await tx.insert(activityFeed).values({
        tenantId: ctx.tenantId, userId: user.id, action: 'archived',
        entityType: 'tradeflowkit_quote', entityId: id, metadata: { status: current.status },
      });
      return rows;
    });
    if (!archived) return reply.code(409).send({ error: 'Quote changed; reload and retry', code: 'QUOTE_VERSION_CONFLICT' });
    return { ok: true, quote: archived };
  });

  app.post('/v1/modules/tradeflowkit/quotes/:id/job', { preHandler: [...tradeflowkitWriteGuards] }, async (request, reply) => {
    let input;
    try { input = parseQuoteToJob(request.body); } catch (err) { if (revenueValidation(reply, err)) return; throw err; }
    const { id } = request.params as { id: string };
    const ctx = (request as any).tenantContext;
    const user = (request as any).user;
    const outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`
        SELECT id FROM tradeflowkit_quotes
        WHERE id = ${id} AND tenant_id = ${ctx.tenantId} AND deleted_at IS NULL
        FOR UPDATE
      `);
      const [quote] = await tx.select().from(tradeflowkitQuotes).where(and(
        eq(tradeflowkitQuotes.id, id), eq(tradeflowkitQuotes.tenantId, ctx.tenantId), isNull(tradeflowkitQuotes.deletedAt),
      )).limit(1);
      if (!quote) return { kind: 'not_found' as const };
      if (quote.jobId) {
        const [existingJob] = await tx.select().from(tradeflowkitJobs).where(and(
          eq(tradeflowkitJobs.id, quote.jobId), eq(tradeflowkitJobs.tenantId, ctx.tenantId), isNull(tradeflowkitJobs.deletedAt),
        )).limit(1);
        return existingJob
          ? { kind: 'existing' as const, job: existingJob }
          : { kind: 'missing_job' as const };
      }
      if (quote.status !== 'accepted') return { kind: 'not_accepted' as const };
      if (quote.version !== input.expectedVersion) return { kind: 'version_conflict' as const };
      const number = await allocateTradeFlowKitNumber(tx, ctx.tenantId, 'job');
      const [job] = await tx.insert(tradeflowkitJobs).values({
        tenantId: ctx.tenantId, customerId: quote.customerId, createdByUserId: user.id, number,
        title: input.title ?? `Job from Quote #${quote.number ?? quote.id.slice(0, 8).toUpperCase()}`,
        description: quote.notes, status: 'quoted', priority: 'normal',
      }).returning();
      const [linked] = await tx.update(tradeflowkitQuotes).set({
        jobId: job.id, version: sql`${tradeflowkitQuotes.version} + 1`, updatedAt: new Date(),
      }).where(and(
        eq(tradeflowkitQuotes.id, id), eq(tradeflowkitQuotes.tenantId, ctx.tenantId),
        eq(tradeflowkitQuotes.version, input.expectedVersion), isNull(tradeflowkitQuotes.deletedAt),
      )).returning();
      if (!linked) throw new Error('QUOTE_VERSION_CONFLICT');
      await tx.insert(activityFeed).values({
        tenantId: ctx.tenantId, userId: user.id, action: 'created_from_quote',
        entityType: 'tradeflowkit_job', entityId: job.id,
        metadata: { quoteId: id, customerId: quote.customerId, number },
      });
      return { kind: 'created' as const, job };
    });
    if (outcome.kind === 'not_found') return reply.code(404).send({ error: 'Quote not found', code: 'QUOTE_NOT_FOUND' });
    if (outcome.kind === 'not_accepted') return reply.code(409).send({ error: 'Only accepted quotes can become jobs', code: 'QUOTE_NOT_ACCEPTED' });
    if (outcome.kind === 'version_conflict') return reply.code(409).send({ error: 'Quote changed; reload and retry', code: 'QUOTE_VERSION_CONFLICT' });
    if (outcome.kind === 'missing_job') return reply.code(409).send({ error: 'Linked job is unavailable', code: 'QUOTE_JOB_UNAVAILABLE' });
    return reply.code(outcome.kind === 'created' ? 201 : 200).send(outcome.job);
  });

  app.post('/v1/modules/tradeflowkit/quotes/:id/transition', { preHandler: [...tradeflowkitWriteGuards] }, async (request, reply) => {
    let input;
    try { input = parseTransition(request.body, ['sent', 'accepted', 'declined']); } catch (err) { if (revenueValidation(reply, err)) return; throw err; }
    const { id } = request.params as { id: string };
    const ctx = (request as any).tenantContext;
    const user = (request as any).user;
    const [current] = await db.select().from(tradeflowkitQuotes).where(and(
      eq(tradeflowkitQuotes.id, id), eq(tradeflowkitQuotes.tenantId, ctx.tenantId), isNull(tradeflowkitQuotes.deletedAt),
    )).limit(1);
    if (!current) return reply.code(404).send({ error: 'Quote not found', code: 'QUOTE_NOT_FOUND' });
    const allowed = current.status === 'draft' ? ['sent'] : current.status === 'sent' ? ['accepted', 'declined'] : [];
    if (!allowed.includes(input.status)) return reply.code(409).send({ error: 'Invalid quote transition', code: 'QUOTE_TRANSITION_INVALID' });
    const [updated] = await db.transaction(async (tx) => {
      const rows = await tx.update(tradeflowkitQuotes).set({
        status: input.status,
        ...(input.status === 'sent' ? { sentAt: new Date() } : {}),
        ...(input.status === 'accepted' ? { acceptedAt: new Date() } : {}),
        ...(input.status === 'declined' ? { declinedAt: new Date() } : {}),
        version: sql`${tradeflowkitQuotes.version} + 1`, updatedAt: new Date(),
      }).where(and(
        eq(tradeflowkitQuotes.id, id), eq(tradeflowkitQuotes.tenantId, ctx.tenantId),
        eq(tradeflowkitQuotes.version, input.expectedVersion), eq(tradeflowkitQuotes.status, current.status), isNull(tradeflowkitQuotes.deletedAt),
      )).returning();
      if (!rows[0]) return [];
      if (input.status === 'accepted' && current.jobId) {
        await tx.update(tradeflowkitJobs).set({ status: 'quoted', updatedAt: new Date(), version: sql`${tradeflowkitJobs.version} + 1` }).where(and(
          eq(tradeflowkitJobs.id, current.jobId), eq(tradeflowkitJobs.tenantId, ctx.tenantId), isNull(tradeflowkitJobs.deletedAt),
        ));
      }
      await tx.insert(activityFeed).values({ tenantId: ctx.tenantId, userId: user.id, action: 'status_changed', entityType: 'tradeflowkit_quote', entityId: id, metadata: { fromStatus: current.status, toStatus: input.status } });
      return rows;
    });
    if (!updated) return reply.code(409).send({ error: 'Quote changed; reload and retry', code: 'QUOTE_VERSION_CONFLICT' });
    return updated;
  });

  app.post('/v1/modules/tradeflowkit/quotes/:id/invoice', { preHandler: [...tradeflowkitWriteGuards] }, async (request, reply) => {
    let input;
    try { input = parseInvoiceFromQuote(request.body); } catch (err) { if (revenueValidation(reply, err)) return; throw err; }
    const { id } = request.params as { id: string };
    const ctx = (request as any).tenantContext;
    const user = (request as any).user;
    const [quote] = await db.select().from(tradeflowkitQuotes).where(and(
      eq(tradeflowkitQuotes.id, id), eq(tradeflowkitQuotes.tenantId, ctx.tenantId), isNull(tradeflowkitQuotes.deletedAt),
    )).limit(1);
    if (!quote) return reply.code(404).send({ error: 'Quote not found', code: 'QUOTE_NOT_FOUND' });
    if (quote.status !== 'accepted') return reply.code(409).send({ error: 'Only accepted quotes can become invoices', code: 'QUOTE_NOT_ACCEPTED' });
    if (quote.version !== input.expectedVersion) return reply.code(409).send({ error: 'Quote changed; reload and retry', code: 'QUOTE_VERSION_CONFLICT' });
    const [existing] = await db.select().from(tradeflowkitInvoices).where(and(
      eq(tradeflowkitInvoices.tenantId, ctx.tenantId), eq(tradeflowkitInvoices.sourceQuoteId, id), isNull(tradeflowkitInvoices.deletedAt),
    )).limit(1);
    if (existing) return reply.code(200).send(existing);
    const invoice = await db.transaction(async (tx) => {
      const number = await allocateTradeFlowKitNumber(tx, ctx.tenantId, 'invoice');
      const [created] = await tx.insert(tradeflowkitInvoices).values({
        tenantId: ctx.tenantId, number, customerId: quote.customerId, jobId: quote.jobId,
        sourceQuoteId: quote.id, createdByUserId: user.id, lineItems: quote.lineItems,
        subtotalCents: quote.subtotalCents, taxRateBps: quote.taxRateBps,
        taxCents: quote.taxCents, discountCents: quote.discountCents,
        totalCents: quote.totalCents, paidCents: 0, balanceCents: quote.totalCents,
        notes: input.notes ?? quote.notes, dueDate: input.dueDate,
      }).returning();
      const quoteItems = await tx.select().from(tradeflowkitQuoteItems).where(and(
        eq(tradeflowkitQuoteItems.tenantId, ctx.tenantId), eq(tradeflowkitQuoteItems.quoteId, quote.id),
      )).orderBy(tradeflowkitQuoteItems.lineNumber);
      if (quoteItems.length > 0) await tx.insert(tradeflowkitInvoiceItems).values(quoteItems.map(item => ({
        tenantId: ctx.tenantId, invoiceId: created.id, lineNumber: item.lineNumber,
        description: item.description, quantityMilli: item.quantityMilli,
        unitPriceCents: item.unitPriceCents, lineTotalCents: item.lineTotalCents,
      })));
      if (quote.jobId) await tx.update(tradeflowkitJobs).set({ status: 'invoiced', updatedAt: new Date(), version: sql`${tradeflowkitJobs.version} + 1` }).where(and(eq(tradeflowkitJobs.id, quote.jobId), eq(tradeflowkitJobs.tenantId, ctx.tenantId)));
      await tx.insert(activityFeed).values({ tenantId: ctx.tenantId, userId: user.id, action: 'created_from_quote', entityType: 'tradeflowkit_invoice', entityId: created.id, metadata: { quoteId: quote.id, totalCents: created.totalCents, number } });
      return created;
    });
    return reply.code(201).send(invoice);
  });

  app.post('/v1/modules/tradeflowkit/invoices', { preHandler: [...tradeflowkitWriteGuards] }, async (request, reply) => {
    let input;
    try { input = parseInvoiceCreate(request.body); } catch (err) { if (revenueValidation(reply, err)) return; throw err; }
    const ctx = (request as any).tenantContext;
    const user = (request as any).user;
    const [customer] = await db.select({ id: tradeflowkitCustomers.id }).from(tradeflowkitCustomers).where(and(
      eq(tradeflowkitCustomers.id, input.customerId), eq(tradeflowkitCustomers.tenantId, ctx.tenantId), isNull(tradeflowkitCustomers.deletedAt),
    )).limit(1);
    if (!customer) return reply.code(404).send({ error: 'Customer not found', code: 'CUSTOMER_NOT_FOUND' });
    if (input.jobId) {
      const [job] = await db.select({ id: tradeflowkitJobs.id }).from(tradeflowkitJobs).where(and(
        eq(tradeflowkitJobs.id, input.jobId), eq(tradeflowkitJobs.tenantId, ctx.tenantId),
        eq(tradeflowkitJobs.customerId, input.customerId), isNull(tradeflowkitJobs.deletedAt),
      )).limit(1);
      if (!job) return reply.code(404).send({ error: 'Job not found for customer', code: 'JOB_NOT_FOUND' });
    }
    const invoice = await db.transaction(async (tx) => {
      const number = await allocateTradeFlowKitNumber(tx, ctx.tenantId, 'invoice');
      const [created] = await tx.insert(tradeflowkitInvoices).values({
        tenantId: ctx.tenantId, customerId: input.customerId, jobId: input.jobId,
        createdByUserId: user.id, number, lineItems: input.lineItems,
        subtotalCents: input.subtotalCents, taxRateBps: input.taxRateBps, taxCents: input.taxCents,
        discountCents: input.discountCents, totalCents: input.totalCents,
        paidCents: 0, balanceCents: input.totalCents, notes: input.notes, dueDate: input.dueDate,
      }).returning();
      await tx.insert(tradeflowkitInvoiceItems).values(input.lineItems.map((item, index) => ({
        tenantId: ctx.tenantId, invoiceId: created.id, lineNumber: index + 1,
        description: item.description, quantityMilli: item.quantity * 1000,
        unitPriceCents: item.unitPriceCents, lineTotalCents: item.quantity * item.unitPriceCents,
      })));
      if (input.jobId) {
        await tx.update(tradeflowkitJobs).set({
          status: 'invoiced', updatedAt: new Date(), version: sql`${tradeflowkitJobs.version} + 1`,
        }).where(and(
          eq(tradeflowkitJobs.id, input.jobId), eq(tradeflowkitJobs.tenantId, ctx.tenantId), isNull(tradeflowkitJobs.deletedAt),
        ));
      }
      await tx.insert(activityFeed).values({
        tenantId: ctx.tenantId, userId: user.id, action: 'created',
        entityType: 'tradeflowkit_invoice', entityId: created.id,
        metadata: { customerId: created.customerId, jobId: created.jobId, totalCents: created.totalCents, number },
      });
      return created;
    });
    return reply.code(201).send(invoice);
  });

  app.patch('/v1/modules/tradeflowkit/invoices/:id', { preHandler: [...tradeflowkitWriteGuards] }, async (request, reply) => {
    let input;
    try { input = parseInvoiceUpdate(request.body); } catch (err) { if (revenueValidation(reply, err)) return; throw err; }
    const { id } = request.params as { id: string };
    const ctx = (request as any).tenantContext;
    const user = (request as any).user;
    const [current] = await db.select().from(tradeflowkitInvoices).where(and(
      eq(tradeflowkitInvoices.id, id), eq(tradeflowkitInvoices.tenantId, ctx.tenantId), isNull(tradeflowkitInvoices.deletedAt),
    )).limit(1);
    if (!current) return reply.code(404).send({ error: 'Invoice not found', code: 'INVOICE_NOT_FOUND' });
    if (current.status !== 'draft' || current.paidCents !== 0) {
      return reply.code(409).send({ error: 'Only unpaid draft invoices can be edited', code: 'INVOICE_NOT_EDITABLE' });
    }
    const [customer] = await db.select({ id: tradeflowkitCustomers.id }).from(tradeflowkitCustomers).where(and(
      eq(tradeflowkitCustomers.id, input.customerId), eq(tradeflowkitCustomers.tenantId, ctx.tenantId), isNull(tradeflowkitCustomers.deletedAt),
    )).limit(1);
    if (!customer) return reply.code(404).send({ error: 'Customer not found', code: 'CUSTOMER_NOT_FOUND' });
    if (input.jobId) {
      const [job] = await db.select({ id: tradeflowkitJobs.id }).from(tradeflowkitJobs).where(and(
        eq(tradeflowkitJobs.id, input.jobId), eq(tradeflowkitJobs.tenantId, ctx.tenantId),
        eq(tradeflowkitJobs.customerId, input.customerId), isNull(tradeflowkitJobs.deletedAt),
      )).limit(1);
      if (!job) return reply.code(404).send({ error: 'Job not found for customer', code: 'JOB_NOT_FOUND' });
    }
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx.update(tradeflowkitInvoices).set({
        customerId: input.customerId, jobId: input.jobId, lineItems: input.lineItems,
        subtotalCents: input.subtotalCents, taxRateBps: input.taxRateBps, taxCents: input.taxCents,
        discountCents: input.discountCents, totalCents: input.totalCents, balanceCents: input.totalCents,
        notes: input.notes, dueDate: input.dueDate,
        version: sql`${tradeflowkitInvoices.version} + 1`, updatedAt: new Date(),
      }).where(and(
        eq(tradeflowkitInvoices.id, id), eq(tradeflowkitInvoices.tenantId, ctx.tenantId),
        eq(tradeflowkitInvoices.version, input.expectedVersion), eq(tradeflowkitInvoices.status, 'draft'),
        eq(tradeflowkitInvoices.paidCents, 0), isNull(tradeflowkitInvoices.deletedAt),
      )).returning();
      if (!row) return null;
      await tx.delete(tradeflowkitInvoiceItems).where(and(
        eq(tradeflowkitInvoiceItems.tenantId, ctx.tenantId), eq(tradeflowkitInvoiceItems.invoiceId, id),
      ));
      await tx.insert(tradeflowkitInvoiceItems).values(input.lineItems.map((item, index) => ({
        tenantId: ctx.tenantId, invoiceId: id, lineNumber: index + 1,
        description: item.description, quantityMilli: item.quantity * 1000,
        unitPriceCents: item.unitPriceCents, lineTotalCents: item.quantity * item.unitPriceCents,
      })));
      await tx.insert(activityFeed).values({
        tenantId: ctx.tenantId, userId: user.id, action: 'updated',
        entityType: 'tradeflowkit_invoice', entityId: id,
        metadata: { previousTotalCents: current.totalCents, totalCents: row.totalCents, version: row.version },
      });
      return row;
    });
    if (!updated) return reply.code(409).send({ error: 'Invoice changed; reload and retry', code: 'INVOICE_VERSION_CONFLICT' });
    return updated;
  });

  app.delete('/v1/modules/tradeflowkit/invoices/:id', { preHandler: [...tradeflowkitWriteGuards] }, async (request, reply) => {
    let input;
    try { input = parseDocumentArchive(request.body); } catch (err) { if (revenueValidation(reply, err)) return; throw err; }
    const { id } = request.params as { id: string };
    const ctx = (request as any).tenantContext;
    const user = (request as any).user;
    const [current] = await db.select().from(tradeflowkitInvoices).where(and(
      eq(tradeflowkitInvoices.id, id), eq(tradeflowkitInvoices.tenantId, ctx.tenantId), isNull(tradeflowkitInvoices.deletedAt),
    )).limit(1);
    if (!current) return reply.code(404).send({ error: 'Invoice not found', code: 'INVOICE_NOT_FOUND' });
    if (!['draft', 'void'].includes(current.status) || current.paidCents !== 0) {
      return reply.code(409).send({ error: 'Only unpaid draft or void invoices can be archived', code: 'INVOICE_NOT_ARCHIVABLE' });
    }
    const [payment] = await db.select({ id: tradeflowkitPayments.id }).from(tradeflowkitPayments).where(and(
      eq(tradeflowkitPayments.tenantId, ctx.tenantId), eq(tradeflowkitPayments.invoiceId, id),
    )).limit(1);
    if (payment) return reply.code(409).send({ error: 'Invoice has payment history', code: 'INVOICE_HAS_PAYMENTS' });
    const [archived] = await db.transaction(async (tx) => {
      const rows = await tx.update(tradeflowkitInvoices).set({
        deletedAt: new Date(), version: sql`${tradeflowkitInvoices.version} + 1`, updatedAt: new Date(),
      }).where(and(
        eq(tradeflowkitInvoices.id, id), eq(tradeflowkitInvoices.tenantId, ctx.tenantId),
        eq(tradeflowkitInvoices.version, input.expectedVersion), eq(tradeflowkitInvoices.status, current.status),
        eq(tradeflowkitInvoices.paidCents, 0), isNull(tradeflowkitInvoices.deletedAt),
      )).returning();
      if (!rows[0]) return [];
      await tx.insert(activityFeed).values({
        tenantId: ctx.tenantId, userId: user.id, action: 'archived',
        entityType: 'tradeflowkit_invoice', entityId: id, metadata: { status: current.status },
      });
      return rows;
    });
    if (!archived) return reply.code(409).send({ error: 'Invoice changed; reload and retry', code: 'INVOICE_VERSION_CONFLICT' });
    return { ok: true, invoice: archived };
  });

  app.post('/v1/modules/tradeflowkit/invoices/:id/transition', { preHandler: [...tradeflowkitWriteGuards] }, async (request, reply) => {
    let input;
    try { input = parseTransition(request.body, ['sent', 'processing', 'void']); } catch (err) { if (revenueValidation(reply, err)) return; throw err; }
    const { id } = request.params as { id: string };
    const ctx = (request as any).tenantContext;
    const user = (request as any).user;
    const [current] = await db.select().from(tradeflowkitInvoices).where(and(eq(tradeflowkitInvoices.id, id), eq(tradeflowkitInvoices.tenantId, ctx.tenantId), isNull(tradeflowkitInvoices.deletedAt))).limit(1);
    if (!current) return reply.code(404).send({ error: 'Invoice not found', code: 'INVOICE_NOT_FOUND' });
    const allowed = current.status === 'draft' ? ['sent', 'void'] : current.status === 'sent' ? ['processing', 'void'] : current.status === 'processing' ? ['void'] : [];
    if (!allowed.includes(input.status)) return reply.code(409).send({ error: 'Invalid invoice transition', code: 'INVOICE_TRANSITION_INVALID' });
    const [updated] = await db.update(tradeflowkitInvoices).set({
      status: input.status, ...(input.status === 'sent' ? { sentAt: new Date() } : {}),
      version: sql`${tradeflowkitInvoices.version} + 1`, updatedAt: new Date(),
    }).where(and(eq(tradeflowkitInvoices.id, id), eq(tradeflowkitInvoices.tenantId, ctx.tenantId), eq(tradeflowkitInvoices.version, input.expectedVersion), eq(tradeflowkitInvoices.status, current.status), isNull(tradeflowkitInvoices.deletedAt))).returning();
    if (!updated) return reply.code(409).send({ error: 'Invoice changed; reload and retry', code: 'INVOICE_VERSION_CONFLICT' });
    await db.insert(activityFeed).values({ tenantId: ctx.tenantId, userId: user.id, action: 'status_changed', entityType: 'tradeflowkit_invoice', entityId: id, metadata: { fromStatus: current.status, toStatus: updated.status } });
    return updated;
  });

  app.post('/v1/modules/tradeflowkit/invoices/:id/pay', { preHandler: [...tradeflowkitWriteGuards] }, async (request, reply) => {
    let input;
    try { input = parsePayment(request.body); } catch (err) { if (revenueValidation(reply, err)) return; throw err; }
    const { id } = request.params as { id: string };
    const ctx = (request as any).tenantContext;
    const user = (request as any).user;
    const [current] = await db.select().from(tradeflowkitInvoices).where(and(eq(tradeflowkitInvoices.id, id), eq(tradeflowkitInvoices.tenantId, ctx.tenantId), isNull(tradeflowkitInvoices.deletedAt))).limit(1);
    if (!current) return reply.code(404).send({ error: 'Invoice not found', code: 'INVOICE_NOT_FOUND' });
    if (!['sent', 'processing'].includes(current.status)) return reply.code(409).send({ error: 'Invoice must be sent before payment', code: 'INVOICE_NOT_PAYABLE' });
    const [paid] = await db.transaction(async (tx) => {
      const idempotencyKey = `legacy-pay:${id}:${input.expectedVersion}`;
      const rows = await tx.update(tradeflowkitInvoices).set({
        status: 'paid', paidAt: new Date(), paymentMethod: input.paymentMethod,
        paymentReference: input.paymentReference, paymentNotes: input.paymentNotes,
        paidCents: current.totalCents, balanceCents: 0,
        version: sql`${tradeflowkitInvoices.version} + 1`, updatedAt: new Date(),
      }).where(and(eq(tradeflowkitInvoices.id, id), eq(tradeflowkitInvoices.tenantId, ctx.tenantId), eq(tradeflowkitInvoices.version, input.expectedVersion), eq(tradeflowkitInvoices.status, current.status), isNull(tradeflowkitInvoices.deletedAt))).returning();
      if (!rows[0]) return [];
      await tx.insert(tradeflowkitPayments).values({
        tenantId: ctx.tenantId, invoiceId: id, createdByUserId: user.id,
        amountCents: current.balanceCents || current.totalCents, method: input.paymentMethod,
        reference: input.paymentReference, notes: input.paymentNotes, idempotencyKey,
      }).onConflictDoNothing();
      if (current.jobId) await tx.update(tradeflowkitJobs).set({ status: 'paid', updatedAt: new Date(), version: sql`${tradeflowkitJobs.version} + 1` }).where(and(eq(tradeflowkitJobs.id, current.jobId), eq(tradeflowkitJobs.tenantId, ctx.tenantId)));
      await tx.insert(activityFeed).values({ tenantId: ctx.tenantId, userId: user.id, action: 'payment_recorded', entityType: 'tradeflowkit_invoice', entityId: id, metadata: { amountCents: current.totalCents, method: input.paymentMethod } });
      return rows;
    });
    if (!paid) return reply.code(409).send({ error: 'Invoice changed; reload and retry', code: 'INVOICE_VERSION_CONFLICT' });
    return paid;
  });

  // ===== TechDeck: asset posture and approval-only runbooks ===============
  //
  // Runbooks are intentionally stored and approved here, never executed.
  // Future endpoint execution must use a separately reviewed, signed agent
  // protocol; OperatorOS must not become an arbitrary command runner.
  app.get(
    '/v1/modules/techdeck/ops',
    { preHandler: [...techdeckGuards] },
    async (request) => {
      const ctx = (request as any).tenantContext as { tenantId: string };
      const [assets, runbooks] = await Promise.all([
        db.select().from(techdeckAssets).where(and(
          eq(techdeckAssets.tenantId, ctx.tenantId),
          isNull(techdeckAssets.deletedAt),
        )).orderBy(desc(techdeckAssets.updatedAt)).limit(250),
        db.select().from(techdeckRunbooks).where(and(
          eq(techdeckRunbooks.tenantId, ctx.tenantId),
          isNull(techdeckRunbooks.deletedAt),
        )).orderBy(desc(techdeckRunbooks.updatedAt)).limit(100),
      ]);
      const alerts = assets
        .filter((asset) => ['warning', 'critical', 'offline'].includes(asset.health))
        .map((asset) => ({
          id: `asset-health:${asset.id}`,
          assetId: asset.id,
          assetName: asset.name,
          severity: asset.health,
          message: asset.health === 'offline'
            ? `${asset.name} is offline`
            : `${asset.name} reports ${asset.health} health`,
          observedAt: asset.updatedAt,
        }));
      return { assets, runbooks, alerts, executionEnabled: false };
    },
  );

  app.post(
    '/v1/modules/techdeck/assets',
    { preHandler: [...techdeckWriteGuards] },
    async (request, reply) => {
      let input;
      try {
        input = parseTechDeckAssetCreate(request.body);
      } catch (err) {
        if (handleTechDeckOpsValidation(reply, err)) return;
        throw err;
      }
      const user = (request as any).user as { id: string };
      const ctx = (request as any).tenantContext as { tenantId: string };
      return db.transaction(async (tx) => {
        const [asset] = await tx.insert(techdeckAssets).values({
          tenantId: ctx.tenantId,
          createdByUserId: user.id,
          ...input,
        }).returning();
        await tx.insert(activityFeed).values({
          userId: user.id,
          tenantId: ctx.tenantId,
          action: 'created',
          entityType: 'techdeck_asset',
          entityId: asset.id,
          metadata: { name: asset.name, type: asset.type, health: asset.health },
        });
        reply.code(201);
        return asset;
      });
    },
  );

  app.patch(
    '/v1/modules/techdeck/assets/:id',
    { preHandler: [...techdeckWriteGuards] },
    async (request, reply) => {
      let input;
      try {
        input = parseTechDeckAssetPatch(request.body);
      } catch (err) {
        if (handleTechDeckOpsValidation(reply, err)) return;
        throw err;
      }
      const { id } = request.params as { id: string };
      const user = (request as any).user as { id: string };
      const ctx = (request as any).tenantContext as { tenantId: string };
      const [asset] = await db.transaction(async (tx) => {
        const rows = await tx.update(techdeckAssets).set({
          ...input.patch,
          version: sql`${techdeckAssets.version} + 1`,
          updatedAt: new Date(),
        }).where(and(
          eq(techdeckAssets.id, id),
          eq(techdeckAssets.tenantId, ctx.tenantId),
          eq(techdeckAssets.version, input.expectedVersion),
          isNull(techdeckAssets.deletedAt),
        )).returning();
        if (!rows[0]) return [];
        await tx.insert(activityFeed).values({
          userId: user.id,
          tenantId: ctx.tenantId,
          action: 'updated',
          entityType: 'techdeck_asset',
          entityId: id,
          metadata: { changedFields: Object.keys(input.patch) },
        });
        return rows;
      });
      if (!asset) {
        const [existing] = await db.select({ id: techdeckAssets.id })
          .from(techdeckAssets)
          .where(and(
            eq(techdeckAssets.id, id),
            eq(techdeckAssets.tenantId, ctx.tenantId),
            isNull(techdeckAssets.deletedAt),
          )).limit(1);
        return reply.code(existing ? 409 : 404).send({
          error: existing ? 'Asset changed; reload and retry' : 'Asset not found',
          code: existing ? 'ASSET_VERSION_CONFLICT' : 'ASSET_NOT_FOUND',
        });
      }
      return asset;
    },
  );

  app.post(
    '/v1/modules/techdeck/runbooks',
    { preHandler: [...techdeckWriteGuards] },
    async (request, reply) => {
      let input;
      try {
        input = parseTechDeckRunbookCreate(request.body);
      } catch (err) {
        if (handleTechDeckOpsValidation(reply, err)) return;
        throw err;
      }
      const user = (request as any).user as { id: string };
      const ctx = (request as any).tenantContext as { tenantId: string };
      return db.transaction(async (tx) => {
        const [runbook] = await tx.insert(techdeckRunbooks).values({
          tenantId: ctx.tenantId,
          createdByUserId: user.id,
          ...input,
        }).returning();
        await tx.insert(activityFeed).values({
          userId: user.id,
          tenantId: ctx.tenantId,
          action: 'created',
          entityType: 'techdeck_runbook',
          entityId: runbook.id,
          // Never copy script content into the cross-product activity feed.
          metadata: { name: runbook.name, platform: runbook.platform, riskLevel: runbook.riskLevel },
        });
        reply.code(201);
        return runbook;
      });
    },
  );

  app.post(
    '/v1/modules/techdeck/runbooks/:id/approve',
    { preHandler: [...techdeckWriteGuards, requireTenantAdmin] },
    async (request, reply) => {
      let input;
      try {
        input = parseTechDeckVersion(request.body);
      } catch (err) {
        if (handleTechDeckOpsValidation(reply, err)) return;
        throw err;
      }
      const { id } = request.params as { id: string };
      const user = (request as any).user as { id: string };
      const ctx = (request as any).tenantContext as { tenantId: string };
      const now = new Date();
      const [runbook] = await db.transaction(async (tx) => {
        const rows = await tx.update(techdeckRunbooks).set({
          status: 'approved',
          approvedByUserId: user.id,
          approvedAt: now,
          version: sql`${techdeckRunbooks.version} + 1`,
          updatedAt: now,
        }).where(and(
          eq(techdeckRunbooks.id, id),
          eq(techdeckRunbooks.tenantId, ctx.tenantId),
          eq(techdeckRunbooks.status, 'draft'),
          eq(techdeckRunbooks.version, input.expectedVersion),
          isNull(techdeckRunbooks.deletedAt),
        )).returning();
        if (!rows[0]) return [];
        await tx.insert(activityFeed).values({
          userId: user.id,
          tenantId: ctx.tenantId,
          action: 'approved',
          entityType: 'techdeck_runbook',
          entityId: id,
          metadata: { name: rows[0].name, platform: rows[0].platform, riskLevel: rows[0].riskLevel },
        });
        return rows;
      });
      if (!runbook) {
        const [existing] = await db.select({ status: techdeckRunbooks.status })
          .from(techdeckRunbooks)
          .where(and(
            eq(techdeckRunbooks.id, id),
            eq(techdeckRunbooks.tenantId, ctx.tenantId),
            isNull(techdeckRunbooks.deletedAt),
          )).limit(1);
        return reply.code(existing ? 409 : 404).send({
          error: existing ? 'Runbook is no longer an approvable draft' : 'Runbook not found',
          code: existing ? 'RUNBOOK_APPROVAL_CONFLICT' : 'RUNBOOK_NOT_FOUND',
        });
      }
      return runbook;
    },
  );

  app.post(
    '/v1/modules/techdeck/runbooks/:id/retire',
    { preHandler: [...techdeckWriteGuards, requireTenantAdmin] },
    async (request, reply) => {
      let input;
      try {
        input = parseTechDeckVersion(request.body);
      } catch (err) {
        if (handleTechDeckOpsValidation(reply, err)) return;
        throw err;
      }
      const { id } = request.params as { id: string };
      const user = (request as any).user as { id: string };
      const ctx = (request as any).tenantContext as { tenantId: string };
      const [runbook] = await db.transaction(async (tx) => {
        const rows = await tx.update(techdeckRunbooks).set({
          status: 'retired',
          version: sql`${techdeckRunbooks.version} + 1`,
          updatedAt: new Date(),
        }).where(and(
          eq(techdeckRunbooks.id, id),
          eq(techdeckRunbooks.tenantId, ctx.tenantId),
          eq(techdeckRunbooks.status, 'approved'),
          eq(techdeckRunbooks.version, input.expectedVersion),
          isNull(techdeckRunbooks.deletedAt),
        )).returning();
        if (!rows[0]) return [];
        await tx.insert(activityFeed).values({
          userId: user.id,
          tenantId: ctx.tenantId,
          action: 'retired',
          entityType: 'techdeck_runbook',
          entityId: id,
          metadata: { name: rows[0].name },
        });
        return rows;
      });
      if (!runbook) {
        const [existing] = await db.select({ status: techdeckRunbooks.status })
          .from(techdeckRunbooks)
          .where(and(
            eq(techdeckRunbooks.id, id),
            eq(techdeckRunbooks.tenantId, ctx.tenantId),
            isNull(techdeckRunbooks.deletedAt),
          )).limit(1);
        return reply.code(existing ? 409 : 404).send({
          error: existing ? 'Only an approved runbook can be retired' : 'Runbook not found',
          code: existing ? 'RUNBOOK_RETIRE_CONFLICT' : 'RUNBOOK_NOT_FOUND',
        });
      }
      return runbook;
    },
  );

  // ===== TechDeck: technician ticket queue ===============================
  //
  // This is the first shared-runtime TechDeck workflow. OperatorOS owns
  // identity, tenant membership, entitlement, and assignment authority.
  // The imported standalone client/site/asset/comment/SLA subsystems remain
  // dormant until they can be migrated as separately reviewed verticals.
  app.get(
    '/v1/modules/techdeck/tickets',
    { preHandler: [...techdeckGuards] },
    async (request, reply) => {
      let query;
      try {
        query = parseTechDeckTicketListQuery(request.query);
      } catch (err) {
        if (handleTechDeckValidation(reply, err)) return;
        throw err;
      }

      const user = (request as any).user as { id: string };
      const ctx = (request as any).tenantContext as {
        tenantId: string;
        role: 'owner' | 'admin' | 'member';
        viaPlatformRole: boolean;
      };
      const conditions = [
        eq(techdeckTickets.tenantId, ctx.tenantId),
        isNull(techdeckTickets.deletedAt),
      ];
      if (query.status) conditions.push(eq(techdeckTickets.status, query.status));
      if (query.priority) conditions.push(eq(techdeckTickets.priority, query.priority));
      if (query.assignment === 'mine') {
        conditions.push(eq(techdeckTickets.assignedToUserId, user.id));
      } else if (query.assignment === 'unassigned') {
        conditions.push(isNull(techdeckTickets.assignedToUserId));
      }
      if (query.search) {
        const pattern = `%${query.search}%`;
        conditions.push(or(
          ilike(techdeckTickets.title, pattern),
          ilike(techdeckTickets.description, pattern),
        )!);
      }

      const tickets = await db
        .select()
        .from(techdeckTickets)
        .where(and(...conditions))
        .orderBy(desc(techdeckTickets.createdAt))
        .limit(100);
      return { tickets };
    },
  );

  app.get(
    '/v1/modules/techdeck/tickets/:id',
    { preHandler: [...techdeckGuards] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const ctx = (request as any).tenantContext as { tenantId: string };
      const [ticket] = await db
        .select()
        .from(techdeckTickets)
        .where(and(
          eq(techdeckTickets.id, id),
          eq(techdeckTickets.tenantId, ctx.tenantId),
          isNull(techdeckTickets.deletedAt),
        ))
        .limit(1);
      if (!ticket) {
        return reply.code(404).send({ error: 'Ticket not found', code: 'TICKET_NOT_FOUND' });
      }
      return ticket;
    },
  );

  app.post(
    '/v1/modules/techdeck/tickets',
    { preHandler: [...techdeckWriteGuards] },
    async (request, reply) => {
      let input;
      try {
        input = parseTechDeckTicketCreate(request.body);
      } catch (err) {
        if (handleTechDeckValidation(reply, err)) return;
        throw err;
      }

      if (!await validateTechDeckAssignee(request, reply, input.assignedToUserId)) return;
      if (!await validateTechDeckTicketReferences(request, reply, input)) return;

      const user = (request as any).user as { id: string };
      const ctx = (request as any).tenantContext as { tenantId: string };
      const ticket = await db.transaction(async (tx) => {
        // One row per tenant makes ticket-number allocation atomic without
        // relying on the standalone app's race-prone MAX(number) + 1 query.
        const [allocation] = await tx
          .insert(techdeckTicketSequences)
          .values({ tenantId: ctx.tenantId, lastNumber: 1 })
          .onConflictDoUpdate({
            target: techdeckTicketSequences.tenantId,
            set: {
              lastNumber: sql`${techdeckTicketSequences.lastNumber} + 1`,
              updatedAt: new Date(),
            },
          })
          .returning({ number: techdeckTicketSequences.lastNumber });

        const [created] = await tx
          .insert(techdeckTickets)
          .values({
            ...input,
            tenantId: ctx.tenantId,
            number: allocation.number,
            createdByUserId: user.id,
            status: 'open',
          })
          .returning();
        await tx.insert(activityFeed).values({
          userId: user.id,
          tenantId: ctx.tenantId,
          action: 'created',
          entityType: 'techdeck_ticket',
          entityId: created.id,
          metadata: {
            number: created.number,
            priority: created.priority,
            status: created.status,
            assigned: created.assignedToUserId !== null,
          },
        });
        return created;
      });
      return reply.code(201).send(ticket);
    },
  );

  app.patch(
    '/v1/modules/techdeck/tickets/:id',
    { preHandler: [...techdeckWriteGuards] },
    async (request, reply) => {
      let patch;
      try {
        patch = parseTechDeckTicketPatch(request.body);
      } catch (err) {
        if (handleTechDeckValidation(reply, err)) return;
        throw err;
      }

      const { id } = request.params as { id: string };
      const user = (request as any).user as { id: string };
      const ctx = (request as any).tenantContext as {
        tenantId: string;
        role: 'owner' | 'admin' | 'member';
        viaPlatformRole: boolean;
      };
      const [before] = await db
        .select()
        .from(techdeckTickets)
        .where(and(
          eq(techdeckTickets.id, id),
          eq(techdeckTickets.tenantId, ctx.tenantId),
          isNull(techdeckTickets.deletedAt),
        ))
        .limit(1);
      if (!before) {
        return reply.code(404).send({ error: 'Ticket not found', code: 'TICKET_NOT_FOUND' });
      }

      if ('assignedToUserId' in patch && !await validateTechDeckAssignee(
        request,
        reply,
        patch.assignedToUserId!,
        before.assignedToUserId,
      )) return;
      if (!await validateTechDeckTicketReferences(request, reply, {
        directoryOrganizationId: patch.directoryOrganizationId === undefined ? before.directoryOrganizationId : patch.directoryOrganizationId,
        directorySiteId: patch.directorySiteId === undefined ? before.directorySiteId : patch.directorySiteId,
        configurationItemId: patch.configurationItemId === undefined ? before.configurationItemId : patch.configurationItemId,
      })) return;

      const changedFields = Object.keys(patch);
      const requireAssignmentSnapshot = 'assignedToUserId' in patch
        && ctx.role === 'member'
        && !ctx.viaPlatformRole;
      const updateConditions = [
        eq(techdeckTickets.id, id),
        eq(techdeckTickets.tenantId, ctx.tenantId),
        eq(techdeckTickets.version, before.version),
        isNull(techdeckTickets.deletedAt),
      ];
      if (requireAssignmentSnapshot) {
        updateConditions.push(before.assignedToUserId
          ? eq(techdeckTickets.assignedToUserId, before.assignedToUserId)
          : isNull(techdeckTickets.assignedToUserId));
      }
      const ticket = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(techdeckTickets)
          .set({ ...patch, version: sql`${techdeckTickets.version} + 1`, updatedAt: new Date() })
          .where(and(...updateConditions))
          .returning();
        if (!updated) return null;
        await tx.insert(activityFeed).values({
          userId: user.id,
          tenantId: ctx.tenantId,
          action: 'updated',
          entityType: 'techdeck_ticket',
          entityId: updated.id,
          metadata: { number: updated.number, changedFields },
        });
        return updated;
      });
      if (!ticket) {
        if (requireAssignmentSnapshot) {
          return reply.code(409).send({
            error: 'Ticket assignment changed; refresh before trying again',
            code: 'TICKET_ASSIGNMENT_CHANGED',
          });
        }
        return reply.code(404).send({ error: 'Ticket not found', code: 'TICKET_NOT_FOUND' });
      }
      return ticket;
    },
  );

  app.patch(
    '/v1/modules/techdeck/tickets/:id/status',
    { preHandler: [...techdeckWriteGuards] },
    async (request, reply) => {
      let status;
      try {
        status = parseTechDeckTicketStatus(request.body);
      } catch (err) {
        if (handleTechDeckValidation(reply, err)) return;
        throw err;
      }

      const { id } = request.params as { id: string };
      const user = (request as any).user as { id: string };
      const ctx = (request as any).tenantContext as { tenantId: string };
      const [before] = await db
        .select()
        .from(techdeckTickets)
        .where(and(
          eq(techdeckTickets.id, id),
          eq(techdeckTickets.tenantId, ctx.tenantId),
          isNull(techdeckTickets.deletedAt),
        ))
        .limit(1);
      if (!before) {
        return reply.code(404).send({ error: 'Ticket not found', code: 'TICKET_NOT_FOUND' });
      }
      if (status === before.status) return before;

      const now = new Date();
      const lifecyclePatch: {
        respondedAt?: Date;
        resolvedAt?: Date | null;
        closedAt?: Date | null;
      } = {};
      if (status === 'open') {
        lifecyclePatch.resolvedAt = null;
        lifecyclePatch.closedAt = null;
      } else if (status === 'in_progress') {
        lifecyclePatch.respondedAt = before.respondedAt ?? now;
        lifecyclePatch.resolvedAt = null;
        lifecyclePatch.closedAt = null;
      } else if (status === 'waiting_on_client') {
        lifecyclePatch.resolvedAt = null;
        lifecyclePatch.closedAt = null;
      } else if (status === 'resolved') {
        lifecyclePatch.respondedAt = before.respondedAt ?? now;
        lifecyclePatch.resolvedAt = now;
        lifecyclePatch.closedAt = null;
      } else if (status === 'closed') {
        lifecyclePatch.respondedAt = before.respondedAt ?? now;
        lifecyclePatch.resolvedAt = before.resolvedAt ?? now;
        lifecyclePatch.closedAt = now;
      }

      const ticket = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(techdeckTickets)
          .set({ status, ...lifecyclePatch, version: sql`${techdeckTickets.version} + 1`, updatedAt: now })
          .where(and(
            eq(techdeckTickets.id, id),
            eq(techdeckTickets.tenantId, ctx.tenantId),
            eq(techdeckTickets.version, before.version),
            isNull(techdeckTickets.deletedAt),
          ))
          .returning();
        if (!updated) return null;
        await tx.insert(activityFeed).values({
          userId: user.id,
          tenantId: ctx.tenantId,
          action: 'status_changed',
          entityType: 'techdeck_ticket',
          entityId: updated.id,
          metadata: {
            number: updated.number,
            fromStatus: before.status,
            toStatus: updated.status,
          },
        });
        return updated;
      });
      if (!ticket) {
        return reply.code(404).send({ error: 'Ticket not found', code: 'TICKET_NOT_FOUND' });
      }
      return ticket;
    },
  );

  app.delete(
    '/v1/modules/techdeck/tickets/:id',
    { preHandler: [...techdeckWriteGuards, requireTenantAdmin] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = (request as any).user as { id: string };
      const ctx = (request as any).tenantContext as { tenantId: string };
      const ticket = await db.transaction(async (tx) => {
        const [deleted] = await tx
          .update(techdeckTickets)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(and(
            eq(techdeckTickets.id, id),
            eq(techdeckTickets.tenantId, ctx.tenantId),
            isNull(techdeckTickets.deletedAt),
          ))
          .returning();
        if (!deleted) return null;
        await tx.insert(activityFeed).values({
          userId: user.id,
          tenantId: ctx.tenantId,
          action: 'deleted',
          entityType: 'techdeck_ticket',
          entityId: deleted.id,
          metadata: { number: deleted.number, status: deleted.status },
        });
        return deleted;
      });
      if (!ticket) {
        return reply.code(404).send({ error: 'Ticket not found', code: 'TICKET_NOT_FOUND' });
      }
      return { ok: true };
    },
  );

  // ===== TorqueShed / FaultlineLab / BrandForgeOS / SnapProofOS ==========
  // Product-specific records share storage, never authority. Each route is
  // concretely registered with its own module entitlement and status model.
  for (const spec of Object.values(WORKFLOW_MODULES)) {
    const readGuards = [requireTenantMember, requireTenantModuleAccess(spec.slug)];
    const writeGuards = [...readGuards, requireTenantModuleWriteAccess];
    const basePath = `/v1/modules/${spec.slug}/work-items`;

    app.get(basePath, { preHandler: readGuards }, async (request, reply) => {
      const ctx = (request as any).tenantContext;
      const query = request.query as { status?: string };
      if (query.status && !spec.statuses.has(query.status as never)) {
        return reply.code(400).send({ error: 'Invalid workflow status', code: 'WORKFLOW_STATUS_INVALID' });
      }
      const conditions = [
        eq(moduleWorkflowItems.tenantId, ctx.tenantId),
        eq(moduleWorkflowItems.moduleSlug, spec.slug),
        isNull(moduleWorkflowItems.deletedAt),
      ];
      if (query.status) conditions.push(eq(moduleWorkflowItems.status, query.status));
      const items = await db.select().from(moduleWorkflowItems)
        .where(and(...conditions))
        .orderBy(desc(moduleWorkflowItems.updatedAt))
        .limit(100);
      return { items, itemType: spec.itemType, statuses: [...spec.statuses] };
    });

    app.post(basePath, { preHandler: writeGuards }, async (request, reply) => {
      let input: WorkflowItemInput;
      try {
        input = parseWorkflowItemInput(request.body, spec, 'create');
      } catch (err) {
        return sendWorkflowValidation(reply, err);
      }
      const ctx = (request as any).tenantContext;
      const user = (request as any).user;
      const created = await db.transaction(async (tx) => {
        const [row] = await tx.insert(moduleWorkflowItems).values({
          tenantId: ctx.tenantId,
          createdByUserId: user.id,
          moduleSlug: spec.slug,
          itemType: spec.itemType,
          title: input.title!,
          summary: input.summary ?? null,
          status: input.status!,
          data: input.data!,
        }).returning();
        await tx.insert(activityFeed).values({
          tenantId: ctx.tenantId,
          userId: user.id,
          action: `${spec.slug}_workflow_created`,
          entityType: spec.itemType,
          entityId: row.id,
          metadata: { moduleSlug: spec.slug, title: row.title, status: row.status },
        });
        return row;
      });
      return reply.code(201).send(created);
    });

    app.patch(`${basePath}/:id`, { preHandler: writeGuards }, async (request, reply) => {
      let input: WorkflowItemInput;
      try {
        input = parseWorkflowItemInput(request.body, spec, 'patch');
      } catch (err) {
        return sendWorkflowValidation(reply, err);
      }
      const { id } = request.params as { id: string };
      const ctx = (request as any).tenantContext;
      const user = (request as any).user;
      const { expectedVersion, ...changes } = input;
      const [updated] = await db.update(moduleWorkflowItems).set({
        ...changes,
        version: sql`${moduleWorkflowItems.version} + 1`,
        updatedAt: new Date(),
      }).where(and(
        eq(moduleWorkflowItems.id, id),
        eq(moduleWorkflowItems.tenantId, ctx.tenantId),
        eq(moduleWorkflowItems.moduleSlug, spec.slug),
        eq(moduleWorkflowItems.version, expectedVersion!),
        isNull(moduleWorkflowItems.deletedAt),
      )).returning();

      if (!updated) {
        const [existing] = await db.select({ id: moduleWorkflowItems.id })
          .from(moduleWorkflowItems)
          .where(and(
            eq(moduleWorkflowItems.id, id),
            eq(moduleWorkflowItems.tenantId, ctx.tenantId),
            eq(moduleWorkflowItems.moduleSlug, spec.slug),
            isNull(moduleWorkflowItems.deletedAt),
          )).limit(1);
        return existing
          ? reply.code(409).send({ error: 'Workflow record changed; reload and retry', code: 'WORKFLOW_VERSION_CONFLICT' })
          : reply.code(404).send({ error: 'Workflow record not found', code: 'WORKFLOW_NOT_FOUND' });
      }
      await db.insert(activityFeed).values({
        tenantId: ctx.tenantId,
        userId: user.id,
        action: `${spec.slug}_workflow_updated`,
        entityType: spec.itemType,
        entityId: updated.id,
        metadata: { moduleSlug: spec.slug, status: updated.status, version: updated.version },
      });
      return updated;
    });

    app.delete(`${basePath}/:id`, { preHandler: writeGuards }, async (request, reply) => {
      const { id } = request.params as { id: string };
      const ctx = (request as any).tenantContext;
      const user = (request as any).user;
      const [deleted] = await db.update(moduleWorkflowItems).set({
        deletedAt: new Date(),
        updatedAt: new Date(),
        version: sql`${moduleWorkflowItems.version} + 1`,
      }).where(and(
        eq(moduleWorkflowItems.id, id),
        eq(moduleWorkflowItems.tenantId, ctx.tenantId),
        eq(moduleWorkflowItems.moduleSlug, spec.slug),
        isNull(moduleWorkflowItems.deletedAt),
      )).returning({ id: moduleWorkflowItems.id });
      if (!deleted) return reply.code(404).send({ error: 'Workflow record not found', code: 'WORKFLOW_NOT_FOUND' });
      await db.insert(activityFeed).values({
        tenantId: ctx.tenantId,
        userId: user.id,
        action: `${spec.slug}_workflow_deleted`,
        entityType: spec.itemType,
        entityId: id,
        metadata: { moduleSlug: spec.slug },
      });
      return { ok: true };
    });
  }

  // ===== StudyForge AI ====================================================
  app.get(
    '/v1/modules/studyforge-ai/sessions',
    { preHandler: [...studyforgeGuards] },
    async (request) => {
      const user = (request as any).user;
      const ctx = (request as any).tenantContext;
      const sessions = await db
        .select()
        .from(moduleStudySessions)
        .where(
          and(
            eq(moduleStudySessions.tenantId, ctx.tenantId),
            eq(moduleStudySessions.userId, user.id),
          ),
        )
        .orderBy(desc(moduleStudySessions.createdAt))
        .limit(20);
      return { sessions };
    },
  );

  app.post(
    '/v1/modules/studyforge-ai/sessions',
    { preHandler: [...studyforgeWriteGuards] },
    async (request, reply) => {
      const user = (request as any).user;
      const ctx = (request as any).tenantContext;
      const { source } = (request.body as any) ?? {};
      if (typeof source !== 'string') {
        return reply.code(400).send({ error: 'source is required', code: 'SOURCE_REQUIRED' });
      }
      const trimmed = source.trim();
      const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
      if (wordCount < 8) {
        return reply
          .code(400)
          .send({ error: 'Source needs at least 8 words', code: 'SOURCE_TOO_SHORT' });
      }
      const bounded = trimmed.slice(0, 8000);
      const cards = (await buildCardsWithAi(bounded)) ?? buildCards(bounded);
      if (cards.length === 0) {
        return reply
          .code(400)
          .send({ error: 'Could not extract any study cards from the source', code: 'NO_CARDS' });
      }
      const [row] = await db
        .insert(moduleStudySessions)
        .values({
          tenantId: ctx.tenantId,
          userId: user.id,
          source: bounded,
          cards,
        })
        .returning();
      return reply.code(201).send(row);
    },
  );

  app.delete(
    '/v1/modules/studyforge-ai/sessions/:id',
    { preHandler: [...studyforgeWriteGuards] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = (request as any).user;
      const ctx = (request as any).tenantContext;
      const [row] = await db
        .select()
        .from(moduleStudySessions)
        .where(eq(moduleStudySessions.id, id))
        .limit(1);
      if (!row || row.tenantId !== ctx.tenantId || row.userId !== user.id) {
        return reply.code(404).send({ error: 'Session not found' });
      }
      await db.delete(moduleStudySessions).where(eq(moduleStudySessions.id, id));
      return { ok: true };
    },
  );

}
