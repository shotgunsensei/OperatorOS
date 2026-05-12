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
import { requireTenantMember, requireTenantModuleAccess } from '../lib/tenant-auth.js';

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

function buildCards(source: string): Array<{ id: string; question: string; answer: string }> {
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

export async function registerModuleShellRoutes(app: FastifyInstance) {
  // ===== CallCommand AI ===================================================
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

      // Sandboxed stub dialer: no outbound network is performed. The call is
      // created and immediately marked completed with a persona-specific
      // summary so the shell has something concrete to display + persist.
      const [row] = await db
        .insert(moduleCallLogs)
        .values({
          tenantId: ctx.tenantId,
          userId: user.id,
          phone: tel,
          callerName,
          persona,
          status: 'completed',
          summary: personaSummary(persona, callerName),
        })
        .returning();
      return reply.code(201).send(row);
    },
  );

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
      const cards = buildCards(bounded);
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
