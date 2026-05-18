import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import { and, desc, eq } from 'drizzle-orm';
import {
  moduleCallLogs,
  moduleStudySessions,
  moduleAutomations,
  moduleScaffolds,
  activityFeed,
} from '../schema.js';
import { requireTenantAdmin, requireTenantMember, requireTenantModuleAccess } from '../lib/tenant-auth.js';
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

// ---------------------------------------------------------------------------
// Task #72 — backend for the four polished module shells.
//
// Routes live under `/v1/modules/{slug}/*` and are gated by
// `requireTenantMember` so every read/write is scoped to the active
// tenant exposed via `request.tenantContext`. Tenant-level entitlement
// for the module is already enforced by the parent web page via
// `GET /v1/modules/:slug` before the shell is mounted, so these handlers
// only need to confirm the caller is a member of the tenant they claim.
// ---------------------------------------------------------------------------

const PERSONAS = new Set(['receptionist', 'qualifier', 'collector']);
const STACKS = new Set(['next-fastify', 'fastapi-react', 'express-htmx']);

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
    await db
      .update(moduleCallLogs)
      .set({ transcript, summary, updatedAt: new Date() })
      .where(eq(moduleCallLogs.id, callId));
    log.info({ callId, attempt: i + 1 }, 'Transcript finalised');
    return;
  }
  // Transcription never landed — leave a clear, grounded fallback so the
  // shell doesn't display a stale canned blurb or an empty summary.
  await db
    .update(moduleCallLogs)
    .set({
      summary: `Call with ${callerName} completed but Twilio did not return a transcript within the polling window.`,
      updatedAt: new Date(),
    })
    .where(eq(moduleCallLogs.id, callId));
  log.warn({ callId, recordingSid }, 'Transcript never produced; wrote fallback summary');
}

export async function registerModuleShellRoutes(app: FastifyInstance) {
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
    requireTenantMember,
    requireTenantModuleAccess('callcommand-ai'),
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
    { preHandler: [...callcommandGuards] },
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
      if (!row.summary) {
        await db
          .update(moduleCallLogs)
          .set({
            summary: `Call with ${row.callerName} completed but no recording was produced.`,
            updatedAt: new Date(),
          })
          .where(eq(moduleCallLogs.id, row.id));
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
    { preHandler: [...studyforgeGuards] },
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
    { preHandler: [...studyforgeGuards] },
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
    { preHandler: [...ninjamationGuards] },
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
    { preHandler: [...ninjamationGuards] },
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
    { preHandler: [...launchkitGuards] },
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
