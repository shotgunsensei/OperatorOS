import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { db } from '../db.js';
import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import {
  moduleCallLogs,
  moduleStudySessions,
  moduleAutomations,
  moduleScaffolds,
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
  activityFeed,
} from '../schema.js';
import {
  requireTenantAdmin,
  requireTenantMember,
  requireTenantModuleAccess,
  requireTenantModuleWriteAccess,
} from '../lib/tenant-auth.js';
import {
  isTelephonyConfigured,
  getTelephonyInfo,
  placeTwilioCall,
  mapTwilioStatus,
  verifyTwilioSignature,
  fetchTwilioTranscription,
  summarizeTranscript,
} from '../lib/telephony.js';
import { getAiProvider } from '../lib/ai-provider.js';
import { checkRateLimit } from '../lib/rate-limiter.js';
import {
  parseTradeFlowKitLeadCreate,
  parseTradeFlowKitLeadListQuery,
  parseTradeFlowKitLeadPatch,
  TradeFlowKitLeadValidationError,
} from '../lib/tradeflowkit-leads.js';
import {
  parseCustomerCreate,
  parseInvoiceFromQuote,
  parseJobCreate,
  parsePayment,
  parseQuoteCreate,
  parseTransition,
  TradeFlowKitRevenueValidationError,
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
import { registerPulseDeskRoutes } from './pulsedesk-routes.js';
import { registerNinjaPoolHallRoutes } from './ninja-pool-hall-routes.js';

// Task #91 — per-tenant + per-user budget for outbound calls. Each placed
// call burns real Twilio minutes, so we cap dial attempts to a small
// number per window. The limit is keyed by tenant+user so one noisy user
// in a tenant can't starve their teammates, and one tenant can't burn
// another tenant's quota.
const CALL_RATE_MAX = 5;
const CALL_RATE_WINDOW_MS = 5 * 60_000;

// Per-module guard chains. `requireTenantMember` confirms the caller belongs
// to the active tenant; `requireTenantModuleAccess(slug)` then enforces that
// the tenant has the module enabled AND the user has a non-`none` grant for
// it. Both are required: skipping the second would let any tenant member
// read/write another module's data even if their access was revoked.
const callcommandGuards = [requireTenantMember, requireTenantModuleAccess('callcommand-ai')];
const studyforgeGuards = [requireTenantMember, requireTenantModuleAccess('studyforge-ai')];
const ninjamationGuards = [requireTenantMember, requireTenantModuleAccess('ninjamation')];
const launchkitGuards = [requireTenantMember, requireTenantModuleAccess('ninja-launch-kit')];
const tradeflowkitGuards = [requireTenantMember, requireTenantModuleAccess('tradeflowkit')];
const techdeckGuards = [requireTenantMember, requireTenantModuleAccess('techdeck')];
const callcommandWriteGuards = [...callcommandGuards, requireTenantModuleWriteAccess];
const studyforgeWriteGuards = [...studyforgeGuards, requireTenantModuleWriteAccess];
const ninjamationWriteGuards = [...ninjamationGuards, requireTenantModuleWriteAccess];
const launchkitWriteGuards = [...launchkitGuards, requireTenantModuleWriteAccess];
const tradeflowkitWriteGuards = [...tradeflowkitGuards, requireTenantModuleWriteAccess];
const techdeckWriteGuards = [...techdeckGuards, requireTenantModuleWriteAccess];

// ---------------------------------------------------------------------------
// Shared-runtime backends for the polished module shells.
//
// Routes live under `/v1/modules/{slug}/*` and are gated by
// both tenant membership and the named module entitlement. Every read/write
// is scoped to the active tenant exposed via `request.tenantContext`.
// ---------------------------------------------------------------------------

const PERSONAS = new Set(['receptionist', 'qualifier', 'collector']);
const STACKS = new Set(['next-fastify', 'fastapi-react', 'express-htmx']);

const WORKFLOW_MODULES = {
  torqueshed: {
    slug: 'torqueshed', itemType: 'diagnostic_case', initialStatus: 'open',
    statuses: new Set(['open', 'testing', 'repairing', 'verified', 'closed']),
  },
  faultlinelab: {
    slug: 'faultlinelab', itemType: 'diagnostic_lab', initialStatus: 'open',
    statuses: new Set(['open', 'investigating', 'hypothesis', 'validated', 'closed']),
  },
  brandforgeos: {
    slug: 'brandforgeos', itemType: 'campaign', initialStatus: 'draft',
    statuses: new Set(['draft', 'planning', 'producing', 'review', 'published']),
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

function normalisePhone(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/[^\d+]/g, '');
  // Accept 8–15 digits, optional leading '+'. Matches the shell's UI hints
  // without committing to a specific national format.
  if (!/^\+?\d{8,15}$/.test(digits)) return null;
  return digits;
}

function personaSummary(persona: string, callerName: string): string {
  switch (persona) {
    case 'receptionist':
      return `Greeted ${callerName}, captured intent, and routed the request to the team inbox.`;
    case 'qualifier':
      return `Qualified ${callerName} against the lead checklist and logged a discovery summary.`;
    case 'collector':
    default:
      return `Reminded ${callerName} of the outstanding balance and scheduled a follow-up.`;
  }
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
// mock (so the caller can use the deterministic splitter instead), when the
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

// Backoff schedule (ms) for transcript polling. Twilio transcription is
// best-effort; bumping past ~5 minutes total without a result is our
// signal to fall back to a non-canned summary.
const TRANSCRIPT_BACKOFF_MS = [10_000, 20_000, 30_000, 60_000, 120_000];

async function finalizeTranscript(
  callId: string,
  recordingSid: string,
  persona: string,
  callerName: string,
  log: { warn: (...args: any[]) => void; info: (...args: any[]) => void },
) {
  for (let i = 0; i < TRANSCRIPT_BACKOFF_MS.length; i++) {
    await new Promise((r) => setTimeout(r, TRANSCRIPT_BACKOFF_MS[i]));
    let transcript: string | null = null;
    try {
      transcript = await fetchTwilioTranscription(recordingSid);
    } catch (err) {
      log.warn({ err, recordingSid, attempt: i + 1 }, 'Twilio transcript fetch failed; will retry');
      continue;
    }
    if (!transcript) continue;
    let summary: string;
    try {
      summary = await summarizeTranscript(transcript, persona, callerName);
    } catch (err) {
      log.warn({ err, callId }, 'AI summary failed; storing raw transcript only');
      summary = transcript.slice(0, 500);
    }
    // Monotonic transition: only flip a still-pending row to `ready`. If
    // another poller already finalised (ready) or the fallback already
    // ran (unavailable), do not clobber that state.
    const finalised = await db
      .update(moduleCallLogs)
      .set({ transcript, summary, transcriptStatus: 'ready', updatedAt: new Date() })
      .where(and(
        eq(moduleCallLogs.id, callId),
        eq(moduleCallLogs.transcriptStatus, 'pending'),
      ))
      .returning({ id: moduleCallLogs.id });
    if (finalised.length === 0) {
      log.info({ callId, attempt: i + 1 }, 'Transcript finalise skipped; row no longer pending');
    } else {
      log.info({ callId, attempt: i + 1 }, 'Transcript finalised');
    }
    return;
  }
  // Transcription never landed — leave a clear, grounded fallback so the
  // shell doesn't display a stale canned blurb or an empty summary.
  //
  // Task #94 — idempotency: gate the status transition on the row NOT
  // already being `unavailable`. Twilio recording webhooks can retry, and
  // a stuck poller could in principle fire more than once for the same
  // call; using `RETURNING` lets us tell whether this invocation was the
  // one that actually flipped the row, so the activity_feed entry is
  // written at most once per call.
  const transitioned = await db
    .update(moduleCallLogs)
    .set({
      summary: `Call with ${callerName} completed but Twilio did not return a transcript within the polling window.`,
      transcriptStatus: 'unavailable',
      updatedAt: new Date(),
    })
    .where(and(
      eq(moduleCallLogs.id, callId),
      eq(moduleCallLogs.transcriptStatus, 'pending'),
    ))
    .returning({
      userId: moduleCallLogs.userId,
      tenantId: moduleCallLogs.tenantId,
      phone: moduleCallLogs.phone,
    });
  if (transitioned.length === 0) {
    log.info({ callId, recordingSid }, 'Transcript fallback skipped; row no longer pending');
    return;
  }
  log.warn({ callId, recordingSid }, 'Transcript never produced; wrote fallback summary');

  // Proactively notify the user who placed the call. Until now the only
  // signal was a summary swap on the row, which the user only sees if
  // they happen to be looking at the CallCommand shell. Writing an
  // `activity_feed` row makes the bell/inbox surface it so they know to
  // retry or check the recording.
  try {
    const row = transitioned[0];
    await db.insert(activityFeed).values({
      userId: row.userId,
      tenantId: row.tenantId,
      action: 'call_transcript_unavailable',
      entityType: 'module_call_log',
      entityId: callId,
      metadata: {
        phone: row.phone,
        callerName,
        persona,
        reason: 'transcript_polling_timeout',
      },
    });
  } catch (err) {
    // Activity feed is best-effort — never let it mask the fallback summary.
    log.warn({ err, callId }, 'Failed to write activity_feed entry for transcript fallback');
  }
}

export async function registerModuleShellRoutes(app: FastifyInstance) {
  await registerPulseDeskRoutes(app);
  await registerNinjaPoolHallRoutes(app);

  // ===== TradeFlowKit: manual lead tracking ===============================
  //
  // This is the first real TradeFlowKit workflow migrated into the shared
  // runtime. It intentionally stops at manual lead CRUD/status tracking:
  // public intake, messaging providers, lead conversion, customer/job writes,
  // local login, and local subscriptions remain dormant in the source
  // snapshot until their own reviewed migration slices.
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
          metadata: { source: created.source, status: created.status },
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
    const [customer] = await db.insert(tradeflowkitCustomers).values({
      ...input, tenantId: ctx.tenantId, createdByUserId: user.id,
    }).returning();
    await db.insert(activityFeed).values({
      tenantId: ctx.tenantId, userId: user.id, action: 'created',
      entityType: 'tradeflowkit_customer', entityId: customer.id, metadata: { name: customer.name },
    });
    return reply.code(201).send(customer);
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
    const [job] = await db.insert(tradeflowkitJobs).values({
      ...input, tenantId: ctx.tenantId, createdByUserId: user.id,
    }).returning();
    await db.insert(activityFeed).values({
      tenantId: ctx.tenantId, userId: user.id, action: 'created',
      entityType: 'tradeflowkit_job', entityId: job.id, metadata: { customerId: job.customerId, status: job.status },
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
    const [quote] = await db.insert(tradeflowkitQuotes).values({
      ...input, tenantId: ctx.tenantId, createdByUserId: user.id,
    }).returning();
    await db.insert(activityFeed).values({
      tenantId: ctx.tenantId, userId: user.id, action: 'created',
      entityType: 'tradeflowkit_quote', entityId: quote.id,
      metadata: { customerId: quote.customerId, jobId: quote.jobId, totalCents: quote.totalCents },
    });
    return reply.code(201).send(quote);
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
      const [created] = await tx.insert(tradeflowkitInvoices).values({
        tenantId: ctx.tenantId, customerId: quote.customerId, jobId: quote.jobId,
        sourceQuoteId: quote.id, createdByUserId: user.id, lineItems: quote.lineItems,
        subtotalCents: quote.subtotalCents, taxRateBps: quote.taxRateBps,
        taxCents: quote.taxCents, discountCents: quote.discountCents,
        totalCents: quote.totalCents, notes: input.notes ?? quote.notes, dueDate: input.dueDate,
      }).returning();
      if (quote.jobId) await tx.update(tradeflowkitJobs).set({ status: 'invoiced', updatedAt: new Date(), version: sql`${tradeflowkitJobs.version} + 1` }).where(and(eq(tradeflowkitJobs.id, quote.jobId), eq(tradeflowkitJobs.tenantId, ctx.tenantId)));
      await tx.insert(activityFeed).values({ tenantId: ctx.tenantId, userId: user.id, action: 'created_from_quote', entityType: 'tradeflowkit_invoice', entityId: created.id, metadata: { quoteId: quote.id, totalCents: created.totalCents } });
      return created;
    });
    return reply.code(201).send(invoice);
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
      const rows = await tx.update(tradeflowkitInvoices).set({
        status: 'paid', paidAt: new Date(), paymentMethod: input.paymentMethod,
        paymentReference: input.paymentReference, paymentNotes: input.paymentNotes,
        version: sql`${tradeflowkitInvoices.version} + 1`, updatedAt: new Date(),
      }).where(and(eq(tradeflowkitInvoices.id, id), eq(tradeflowkitInvoices.tenantId, ctx.tenantId), eq(tradeflowkitInvoices.version, input.expectedVersion), eq(tradeflowkitInvoices.status, current.status), isNull(tradeflowkitInvoices.deletedAt))).returning();
      if (!rows[0]) return [];
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

      const changedFields = Object.keys(patch);
      const requireAssignmentSnapshot = 'assignedToUserId' in patch
        && ctx.role === 'member'
        && !ctx.viaPlatformRole;
      const updateConditions = [
        eq(techdeckTickets.id, id),
        eq(techdeckTickets.tenantId, ctx.tenantId),
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
          .set({ ...patch, updatedAt: new Date() })
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
          .set({ status, ...lifecyclePatch, updatedAt: now })
          .where(and(
            eq(techdeckTickets.id, id),
            eq(techdeckTickets.tenantId, ctx.tenantId),
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

  // ===== CallCommand AI ===================================================
  // Task #89 — surface the telephony config source so the shell can show
  // either "connected via Replit", "using env vars", or a one-click
  // "Connect Twilio" affordance when nothing is wired up.
  app.get(
    '/v1/modules/callcommand-ai/telephony/status',
    { preHandler: [...callcommandGuards] },
    async () => {
      return await getTelephonyInfo();
    },
  );

  // Task #89 — one-click connect flow. The Replit connector proxy is the
  // privileged path to wire up Twilio without pasting credentials, but
  // the actual OAuth handshake lives in the Replit workspace UI (the
  // agent-side `proposeIntegration` tool drives a drawer there). This
  // endpoint returns the canonical URL the admin should open to complete
  // the binding, plus the connector id so the workspace can deep-link
  // straight to Twilio. The shell opens that URL in a new tab and
  // re-polls `/telephony/status` when focus returns.
  //
  // We don't try to invoke `proposeIntegration` server-side: it is an
  // agent control-flow operation, not an HTTP endpoint, and would not be
  // reachable for a tenant admin who is not running the Replit agent.
  // Falling back to a clearly-labelled URL keeps the affordance honest.
  // Admin-only: pasting credentials, or initiating a connector OAuth
  // hand-off, is a privileged tenant config change. We gate on
  // `requireTenantAdmin` in addition to the standard member +
  // module-access checks so tenant `member` users cannot kick off the
  // flow even if they have CallCommand access.
  const callcommandAdminGuards = [
    ...callcommandWriteGuards,
    requireTenantAdmin,
  ];

  // Twilio connector ID (the Replit-managed `ccfg_*` identifier from the
  // connectors registry). Surfaced in the connect response so the shell
  // can deep-link straight to the OAuth drawer for this connector
  // instead of dropping the admin on a generic integrations index.
  const TWILIO_CONNECTOR_ID = 'ccfg_twilio_01K69QJTED9YTJFE2SJ7E4SY08';

  app.post(
    '/v1/modules/callcommand-ai/telephony/connect',
    { preHandler: callcommandAdminGuards },
    async (_request, reply) => {
      const info = await getTelephonyInfo();
      if (info.configured) {
        return reply.code(409).send({
          error: 'Telephony already configured',
          code: 'TELEPHONY_ALREADY_CONFIGURED',
          source: info.source,
        });
      }
      if (!info.connectorAvailable) {
        // Self-hosted install with no Replit connector proxy. Tell the
        // caller to use the env-var path — the shell already shows the
        // four required vars in this branch.
        return reply.code(409).send({
          error: 'Replit connector unavailable in this environment',
          code: 'CONNECTOR_UNAVAILABLE',
        });
      }

      // Drive Replit's connector OAuth setup directly. The integrations
      // setup URL (`?integration=<ccfg_id>` on the workspace) opens the
      // same drawer that the agent-side `proposeIntegration` callback
      // would have opened, so the admin gets a one-click handshake
      // instead of a manual "find Twilio in the integrations list"
      // workflow. We fall back to the connector setup URL on the
      // connectors-v2 host if REPL_OWNER/REPL_SLUG aren't set.
      const owner = process.env.REPL_OWNER;
      const slug = process.env.REPL_SLUG;
      const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
      const url = owner && slug
        ? `https://replit.com/@${encodeURIComponent(owner)}/${encodeURIComponent(slug)}?integration=${TWILIO_CONNECTOR_ID}`
        : `https://${hostname}/setup?connector_id=${TWILIO_CONNECTOR_ID}`;

      return {
        connectorId: TWILIO_CONNECTOR_ID,
        connectorName: 'twilio',
        url,
        instructions:
          'A new tab will open the Replit Twilio connector setup. After you finish OAuth, this banner will turn green within ~60 seconds.',
      };
    },
  );

  app.get(
    '/v1/modules/callcommand-ai/calls',
    { preHandler: [...callcommandGuards] },
    async (request) => {
      const ctx = (request as any).tenantContext;
      const calls = await db
        .select()
        .from(moduleCallLogs)
        .where(eq(moduleCallLogs.tenantId, ctx.tenantId))
        .orderBy(desc(moduleCallLogs.createdAt))
        .limit(20);
      return { calls };
    },
  );

  app.post(
    '/v1/modules/callcommand-ai/calls',
    { preHandler: [...callcommandWriteGuards] },
    async (request, reply) => {
      const user = (request as any).user;
      const ctx = (request as any).tenantContext;
      const { phone, name, persona } = (request.body as any) ?? {};

      // Rate limit BEFORE input validation so a flood of malformed payloads
      // still gets shut down, but AFTER the tenant guards so unauthenticated
      // traffic can't pollute the bucket for legitimate tenants.
      const rateKey = `callcommand:place:${ctx.tenantId}:${user.id}`;
      if (!checkRateLimit(rateKey, CALL_RATE_MAX, CALL_RATE_WINDOW_MS)) {
        return reply.code(429).send({
          error: `Too many calls placed. Limit is ${CALL_RATE_MAX} every ${CALL_RATE_WINDOW_MS / 60_000} minutes.`,
          code: 'CALL_RATE_LIMITED',
        });
      }

      const tel = normalisePhone(phone);
      if (!tel) {
        return reply.code(400).send({ error: 'Invalid phone number', code: 'INVALID_PHONE' });
      }
      if (typeof persona !== 'string' || !PERSONAS.has(persona)) {
        return reply.code(400).send({ error: 'Invalid persona', code: 'INVALID_PERSONA' });
      }
      const callerName =
        typeof name === 'string' && name.trim().length > 0
          ? name.trim().slice(0, 120)
          : 'Unknown caller';

      // Task #75 — handoff to Twilio when configured.
      //
      // We insert the row in `queued` state FIRST so the provider webhook
      // (which can race the API response back) always has a row to update,
      // then attempt to dial. On dial failure we flip the row to `failed`
      // and surface the provider error to the caller.
      if (!(await isTelephonyConfigured())) {
        // Dev/test fallback so the shell remains usable when no telephony
        // provider is wired up. The row is still persisted but clearly
        // marked as a stub via `provider='stub'`.
        const [row] = await db
          .insert(moduleCallLogs)
          .values({
            tenantId: ctx.tenantId,
            userId: user.id,
            phone: tel,
            callerName,
            persona,
            status: 'completed',
            provider: 'stub',
            summary: personaSummary(persona, callerName),
          })
          .returning();
        return reply.code(201).send(row);
      }

      const [row] = await db
        .insert(moduleCallLogs)
        .values({
          tenantId: ctx.tenantId,
          userId: user.id,
          phone: tel,
          callerName,
          persona,
          status: 'queued',
          provider: 'twilio',
        })
        .returning();

      try {
        const placed = await placeTwilioCall({
          to: tel,
          persona,
          callerName,
          callRowId: row.id,
        });
        const [updated] = await db
          .update(moduleCallLogs)
          .set({
            providerSid: placed.sid,
            status: placed.status,
            updatedAt: new Date(),
          })
          .where(eq(moduleCallLogs.id, row.id))
          .returning();
        return reply.code(201).send(updated);
      } catch (err: any) {
        const message = err?.message?.slice(0, 500) ?? 'Telephony provider error';
        const [updated] = await db
          .update(moduleCallLogs)
          .set({ status: 'failed', errorMessage: message, updatedAt: new Date() })
          .where(eq(moduleCallLogs.id, row.id))
          .returning();
        request.log.error({ err, callId: row.id }, 'Twilio dial failed');
        return reply.code(502).send({
          error: 'Telephony provider failed',
          code: 'TELEPHONY_FAILED',
          message,
          call: updated,
        });
      }
    },
  );

  // Single-call read for the shell's polling loop. Tenant-scoped so callers
  // can only fetch calls belonging to their active tenant.
  app.get(
    '/v1/modules/callcommand-ai/calls/:id',
    { preHandler: [...callcommandGuards] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const ctx = (request as any).tenantContext;
      const [row] = await db
        .select()
        .from(moduleCallLogs)
        .where(and(eq(moduleCallLogs.id, id), eq(moduleCallLogs.tenantId, ctx.tenantId)))
        .limit(1);
      if (!row) return reply.code(404).send({ error: 'Call not found' });
      return row;
    },
  );

  // ----- Twilio status / recording webhooks --------------------------------
  // These endpoints are intentionally NOT behind tenant guards: Twilio calls
  // them server-to-server and has no JWT. Authenticity is established via
  // the X-Twilio-Signature header (HMAC of URL + form body using our auth
  // token). The webhook handlers reject any request whose signature does
  // not verify; they fail closed when telephony env vars are missing.
  //
  // Reconstruct the URL Twilio actually signed. Behind Replit's reverse
  // proxy `request.protocol`/`request.headers.host` can disagree with the
  // public-facing URL Twilio called, which would cause valid signatures to
  // be rejected. Prefer the canonical `TWILIO_PUBLIC_BASE_URL`/`APP_URL`
  // env var if set, falling back to the request-derived URL for dev.
  function canonicalWebhookUrl(request: any): string {
    const base = process.env.TWILIO_PUBLIC_BASE_URL || process.env.APP_URL;
    if (base) {
      try { return new URL(request.url, base).toString(); } catch { /* fall through */ }
    }
    return `${request.protocol}://${request.headers.host}${request.url}`;
  }

  // Resolve the call row by Twilio CallSid, falling back to the `call_id`
  // query param we attach to every status/recording callback URL. The
  // fallback closes a small race where an `initiated` status webhook can
  // arrive before the POST handler has written `providerSid` back.
  async function findCallRow(sid: string | undefined, callId: string | undefined) {
    if (sid) {
      const [row] = await db
        .select()
        .from(moduleCallLogs)
        .where(eq(moduleCallLogs.providerSid, sid))
        .limit(1);
      if (row) return row;
    }
    if (callId) {
      const [row] = await db
        .select()
        .from(moduleCallLogs)
        .where(eq(moduleCallLogs.id, callId))
        .limit(1);
      if (row) return row;
    }
    return null;
  }

  app.post('/v1/modules/callcommand-ai/webhooks/twilio/status', async (request, reply) => {
    const body = (request.body as Record<string, string>) ?? {};
    const sig = request.headers['x-twilio-signature'] as string | undefined;
    if (!(await verifyTwilioSignature(canonicalWebhookUrl(request), body, sig))) {
      return reply.code(403).send({ error: 'Invalid signature' });
    }
    const sid = body.CallSid;
    const status = body.CallStatus;
    const callId = (request.query as any)?.call_id as string | undefined;
    if (!sid || !status) return reply.code(400).send({ error: 'Missing CallSid/CallStatus' });

    const row = await findCallRow(sid, callId);
    if (!row) return reply.code(404).send({ error: 'Call not found' });

    const mapped = mapTwilioStatus(status);
    const patch: Record<string, unknown> = {
      status: mapped,
      updatedAt: new Date(),
      // Heal the row's providerSid if the dial-POST hasn't written it yet.
      ...(row.providerSid ? {} : { providerSid: sid }),
    };
    if (mapped === 'failed' && body.ErrorCode) {
      patch.errorMessage = `Twilio error ${body.ErrorCode}: ${body.ErrorMessage ?? ''}`.slice(0, 500);
    }
    await db.update(moduleCallLogs).set(patch).where(eq(moduleCallLogs.id, row.id));
    return { ok: true };
  });

  app.post('/v1/modules/callcommand-ai/webhooks/twilio/recording', async (request, reply) => {
    const body = (request.body as Record<string, string>) ?? {};
    const sig = request.headers['x-twilio-signature'] as string | undefined;
    if (!(await verifyTwilioSignature(canonicalWebhookUrl(request), body, sig))) {
      return reply.code(403).send({ error: 'Invalid signature' });
    }
    const sid = body.CallSid;
    const recordingSid = body.RecordingSid;
    const recordingUrl = body.RecordingUrl;
    const callId = (request.query as any)?.call_id as string | undefined;
    if (!sid) return reply.code(400).send({ error: 'Missing CallSid' });

    const row = await findCallRow(sid, callId);
    if (!row) return reply.code(404).send({ error: 'Call not found' });

    // Persist the recording URL immediately so the shell can offer playback
    // even while we wait for transcription. Transcript + summary are
    // finalised asynchronously below because Twilio's transcription is
    // produced after the recording webhook fires (often 30s+ later).
    await db
      .update(moduleCallLogs)
      .set({
        recordingUrl: recordingUrl ?? row.recordingUrl,
        updatedAt: new Date(),
      })
      .where(eq(moduleCallLogs.id, row.id));

    if (recordingSid) {
      // Fire-and-forget retry chain. Twilio's transcription pipeline is
      // best-effort and asynchronous, so we poll a handful of times with
      // exponential backoff (~10s, 30s, 60s, 120s, 240s). If a transcript
      // never lands we still write a sensible fallback summary so the row
      // doesn't end as an unexplained `completed` blank.
      void finalizeTranscript(row.id, recordingSid, row.persona, row.callerName, request.log);
    } else {
      // No recording was produced (e.g. caller hung up immediately). Leave
      // a clear fallback summary so the row isn't silently empty.
      // Task #94 — also mark transcript_status='unavailable' so the shell
      // surfaces the same badge it shows when polling times out; no
      // recording means no transcript will ever land. Monotonic guard
      // (`transcript_status='pending'`) prevents a retried no-recording
      // webhook from clobbering a row that has since become `ready`.
      if (!row.summary) {
        await db
          .update(moduleCallLogs)
          .set({
            summary: `Call with ${row.callerName} completed but no recording was produced.`,
            transcriptStatus: 'unavailable',
            updatedAt: new Date(),
          })
          .where(and(
            eq(moduleCallLogs.id, row.id),
            eq(moduleCallLogs.transcriptStatus, 'pending'),
          ));
      } else {
        await db
          .update(moduleCallLogs)
          .set({ transcriptStatus: 'unavailable', updatedAt: new Date() })
          .where(and(
            eq(moduleCallLogs.id, row.id),
            eq(moduleCallLogs.transcriptStatus, 'pending'),
          ));
      }
    }
    return { ok: true };
  });

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

  // ===== Ninjamation ======================================================
  app.get(
    '/v1/modules/ninjamation/automations',
    { preHandler: [...ninjamationGuards] },
    async (request) => {
      const ctx = (request as any).tenantContext;
      const automations = await db
        .select()
        .from(moduleAutomations)
        .where(eq(moduleAutomations.tenantId, ctx.tenantId))
        .orderBy(desc(moduleAutomations.createdAt));
      return { automations };
    },
  );

  app.post(
    '/v1/modules/ninjamation/automations',
    { preHandler: [...ninjamationWriteGuards] },
    async (request, reply) => {
      const user = (request as any).user;
      const ctx = (request as any).tenantContext;
      const {
        templateId,
        name,
        trigger,
        action,
        modules: mods,
      } = (request.body as any) ?? {};
      if (
        typeof templateId !== 'string' ||
        typeof name !== 'string' ||
        typeof trigger !== 'string' ||
        typeof action !== 'string'
      ) {
        return reply.code(400).send({ error: 'Missing fields', code: 'MISSING_FIELDS' });
      }
      // Idempotent activate: if this template is already active for the
      // tenant, return the existing row instead of creating a duplicate.
      const [existing] = await db
        .select()
        .from(moduleAutomations)
        .where(
          and(
            eq(moduleAutomations.tenantId, ctx.tenantId),
            eq(moduleAutomations.templateId, templateId),
            eq(moduleAutomations.enabled, true),
          ),
        )
        .limit(1);
      if (existing) return reply.code(200).send(existing);

      const moduleSlugs = Array.isArray(mods)
        ? mods.filter((m): m is string => typeof m === 'string').slice(0, 16)
        : [];

      const [row] = await db
        .insert(moduleAutomations)
        .values({
          tenantId: ctx.tenantId,
          userId: user.id,
          templateId,
          name: name.slice(0, 120),
          trigger: trigger.slice(0, 200),
          action: action.slice(0, 200),
          modules: moduleSlugs,
          enabled: true,
        })
        .returning();

      // Surface the activation in the tenant activity feed.
      await db.insert(activityFeed).values({
        userId: user.id,
        tenantId: ctx.tenantId,
        action: 'activated',
        entityType: 'automation',
        entityId: row.id,
        metadata: { templateId, name: row.name, trigger: row.trigger, action: row.action },
      });

      return reply.code(201).send(row);
    },
  );

  app.delete(
    '/v1/modules/ninjamation/automations/:id',
    { preHandler: [...ninjamationWriteGuards] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = (request as any).user;
      const ctx = (request as any).tenantContext;
      const [row] = await db
        .select()
        .from(moduleAutomations)
        .where(eq(moduleAutomations.id, id))
        .limit(1);
      if (!row || row.tenantId !== ctx.tenantId) {
        return reply.code(404).send({ error: 'Automation not found' });
      }
      await db.delete(moduleAutomations).where(eq(moduleAutomations.id, id));
      await db.insert(activityFeed).values({
        userId: user.id,
        tenantId: ctx.tenantId,
        action: 'deactivated',
        entityType: 'automation',
        entityId: id,
        metadata: { templateId: row.templateId, name: row.name },
      });
      return { ok: true };
    },
  );

  // ===== Ninja Launch Kit =================================================
  app.get(
    '/v1/modules/ninja-launch-kit/scaffolds',
    { preHandler: [...launchkitGuards] },
    async (request) => {
      const user = (request as any).user;
      const ctx = (request as any).tenantContext;
      const scaffolds = await db
        .select()
        .from(moduleScaffolds)
        .where(
          and(
            eq(moduleScaffolds.tenantId, ctx.tenantId),
            eq(moduleScaffolds.userId, user.id),
          ),
        )
        .orderBy(desc(moduleScaffolds.createdAt))
        .limit(20);
      return { scaffolds };
    },
  );

  app.post(
    '/v1/modules/ninja-launch-kit/scaffolds',
    { preHandler: [...launchkitWriteGuards] },
    async (request, reply) => {
      const user = (request as any).user;
      const ctx = (request as any).tenantContext;
      const {
        stackId,
        stackName,
        files,
        name,
      } = (request.body as any) ?? {};
      if (typeof stackId !== 'string' || !STACKS.has(stackId)) {
        return reply.code(400).send({ error: 'Invalid stack', code: 'INVALID_STACK' });
      }
      if (!Array.isArray(files) || files.length === 0) {
        return reply.code(400).send({ error: 'files required', code: 'FILES_REQUIRED' });
      }
      const fileList = files
        .filter((f): f is string => typeof f === 'string' && f.length > 0)
        .slice(0, 256);
      const slug = slugify(typeof name === 'string' ? name : stackName ?? stackId);

      // Status is `queued` because the actual provisioning belongs to the
      // workspace runner pipeline; this row is the durable handoff record
      // the runner will pick up. The shell shows the queued state until a
      // future task flips it to `ready`.
      const [row] = await db
        .insert(moduleScaffolds)
        .values({
          tenantId: ctx.tenantId,
          userId: user.id,
          slug,
          stackId,
          stackName: typeof stackName === 'string' ? stackName.slice(0, 120) : stackId,
          files: fileList,
          status: 'queued',
        })
        .returning();

      await db.insert(activityFeed).values({
        userId: user.id,
        tenantId: ctx.tenantId,
        action: 'queued',
        entityType: 'scaffold',
        entityId: row.id,
        metadata: { stackId, slug, fileCount: fileList.length },
      });

      return reply.code(201).send(row);
    },
  );
}
